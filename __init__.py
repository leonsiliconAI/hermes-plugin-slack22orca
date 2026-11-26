"""Hermes owns the Slack route; Orca owns the workspace, launch and transcript."""

from __future__ import annotations

import asyncio
import fcntl
import functools
import hashlib
import json
import logging
import os
import sqlite3
import time
from contextlib import closing, contextmanager, suppress

from ._bridge import acall, call, on_host

logger = logging.getLogger(__name__)
TARGETS = ("macbook", "mini", "cloud")
REQUEST_TARGETS = (*TARGETS, "desktop")
POLL_SECONDS = 3
TRANSCRIPT_LIMIT = 100
TASK_LIMIT = 12_000


class OrcaError(Exception):
    def __init__(self, code, data=None):
        super().__init__(code)
        self.data = data or {}


class Orca:
    def __init__(self):
        self.cloud = os.getenv("SLACK22ORCA_CLOUD_CLI", "/opt/data/orcahermes/bin/orca")
        self.device = os.getenv("SLACK22ORCA_DEVICE_CLI", "/opt/data/orcahermes/current/bin/orca-ide")
        self.profile = os.getenv("SLACK22ORCA_DEVICE_PROFILE", "/opt/data/.config/orca")
        self.environments = {
            "macbook": os.getenv("SLACK22ORCA_MACBOOK", "MacBook"),
            "mini": os.getenv("SLACK22ORCA_MINI", "Mac mini"),
        }

    async def call(self, host, *args, timeout=12):
        env = dict(os.environ, ORCA_ENVIRONMENT="", ORCA_PAIRING_CODE="")
        if host == "cloud":
            command = [self.cloud, "--environment", "local"]
        else:
            env["ORCA_USER_DATA_PATH"] = self.profile
            command = [self.device, "--environment", self.environments[host]]
        try:
            process = await asyncio.create_subprocess_exec(
                *command, *args, "--json", env=env, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError:
            raise OrcaError("cli_unavailable") from None
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout)
        except (TimeoutError, asyncio.CancelledError) as exc:
            with suppress(ProcessLookupError):
                process.kill()
            await process.wait()
            if isinstance(exc, asyncio.CancelledError):
                raise
            raise OrcaError("cli_timeout") from None
        try:
            envelope = json.loads(stdout)
        except (ValueError, UnicodeError):
            raise OrcaError("cli_no_receipt") from None
        if not isinstance(envelope, dict):
            raise OrcaError("cli_no_receipt")
        if envelope.get("ok") and isinstance(envelope.get("result"), dict):
            return envelope["result"]
        error = envelope.get("error") or {}
        raise OrcaError(error.get("code", "cli_no_receipt"), error.get("data"))


class Store:
    def __init__(self, directory):
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.directory = directory
        self.path = directory / "relay.db"
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, state TEXT NOT NULL, due REAL NOT NULL, record TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS outbox (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, text TEXT NOT NULL,
                    due REAL NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state, due);
                CREATE INDEX IF NOT EXISTS outbox_job ON outbox(job, seq);
            """)

    @contextmanager
    def connection(self):
        with closing(sqlite3.connect(self.path, timeout=5)) as db, db:
            yield db

    def add(self, job):
        with self.connection() as db:
            return db.execute(
                "INSERT OR IGNORE INTO jobs VALUES (?, 'queued', 0, ?)",
                (job["id"], json.dumps(job)),
            ).rowcount == 1

    def has(self, job_id):
        with self.connection() as db:
            return db.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone() is not None

    def save(self, job, *messages):
        with self.connection() as db:
            db.execute(
                "UPDATE jobs SET state=?, due=?, record=? WHERE id=?",
                (job["state"], job["due"], json.dumps(job), job["id"]),
            )
            db.executemany(
                "INSERT INTO outbox(job, text) VALUES (?, ?)",
                ((job["id"], message) for message in messages),
            )

    def due_jobs(self, running):
        with self.connection() as db:
            placeholders = ", ".join("?" for _ in running)
            rows = db.execute(
                "SELECT record FROM jobs WHERE state != 'done' AND due <= ? "
                f"AND id NOT IN ({placeholders}) ORDER BY due LIMIT ?",
                (time.time(), *running, 8 - len(running)),
            )
            return [json.loads(record) for (record,) in rows]

    def next_message(self):
        with self.connection() as db:
            return db.execute("""
                SELECT o.seq, o.text, j.record
                FROM outbox o JOIN jobs j ON j.id = o.job
                WHERE o.due <= ? AND NOT EXISTS (
                    SELECT 1 FROM outbox earlier WHERE earlier.job = o.job AND earlier.seq < o.seq
                )
                ORDER BY o.seq LIMIT 1
            """, (time.time(),)).fetchone()

    def delivered(self, seq):
        with self.connection() as db:
            db.execute("DELETE FROM outbox WHERE seq=?", (seq,))

    def defer_message(self, seq, delay):
        with self.connection() as db:
            db.execute("UPDATE outbox SET due=? WHERE seq=?", (time.time() + delay, seq))


def _entry_key(entry):
    if entry.get("kind") == "tool":
        # A tool can change state between reads without adding a transcript entry.
        entry = {"kind": "tool", "name": entry.get("name")}
    return hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()


def transcript_update(previous, entries, limited):
    """Find the overlap with Orca's newest-entry window and preserve repeated messages."""
    keys = [_entry_key(entry) for entry in entries]
    overlap = call(__file__, "transcriptOverlap", previous, keys, bool(limited))
    return keys, entries[int(overlap["start"]):], overlap["gap"]


def slack_chunks(text):
    yield from call(__file__, "slackChunks", text)


class Relay:
    def __init__(self, store, orca, adapter):
        self.store = store
        self.orca = orca
        self.adapter = adapter

    def finish(self, job, *messages):
        snapshot = call(__file__, "finishedState", job)
        job.clear()
        job.update(snapshot)
        self.store.save(job, *messages)

    async def command(self, device, args, timeout):
        try:
            return {"value": await self.orca.call(device, *args, timeout=timeout)}
        except OrcaError as exc:
            return {"error": str(exc), "retry": exc.data.get("operationId")}

    @staticmethod
    def log(message):
        logger.info("slack22orca: %s", message)

    async def submit_from_model(self, job):
        if self.store.has(job["id"]):
            return {"status": "already_queued", "job": job["id"]}
        if job["target"] in ("macbook", "mini"):
            placement = await acall(__file__, "findPlacement", {
                "command": on_host(self.command), "log": self.log,
            }, [job["target"]], job["repo"])
            if "repoId" not in placement:
                return {"status": "desktop_unavailable", "reasons": placement["failures"]}
            job["repo_id"] = placement["repoId"]
        return queue_job(self.store, job)

    async def tick(self, job):

        def save(snapshot, messages):
            self.store.save(snapshot, *messages)
            job.clear()
            job.update(snapshot)

        host = {
            "command": on_host(self.command), "save": on_host(save),
            "keys": on_host(lambda entries: [_entry_key(entry) for entry in entries]),
            "now": lambda: time.time(),
            "log": self.log,
        }
        try:
            await acall(__file__, "advance", host, job, list(TARGETS), POLL_SECONDS, TRANSCRIPT_LIMIT)
        except Exception:
            logger.exception("slack22orca: could not advance job %s", job["id"])
            save(call(__file__, "deferJob", job, time.time()), [])

    async def deliver(self, seq, text, job):
        channel, team = job["channel"], job["team"]
        try:
            if self.adapter._outbound_blocked(channel, "slack22orca thread reply to"):
                raise RuntimeError("outbound_blocked")
            if team and team not in self.adapter._team_clients:
                raise RuntimeError("workspace_unavailable")
            client = self.adapter._get_client(channel, team_id=team)
            response = await asyncio.wait_for(client.chat_postMessage(
                channel=channel, thread_ts=job["thread"], text=text, mrkdwn=False, link_names=False,
                unfurl_links=False, unfurl_media=False,
            ), 15)
            if not response.get("ok") or not response.get("ts"):
                raise RuntimeError("slack_no_receipt")
        except Exception as exc:
            headers = getattr(getattr(exc, "response", None), "headers", {}) or {}
            delay = headers.get("Retry-After", headers.get("retry-after", "30"))
            self.store.defer_message(seq, int(call(__file__, "slackRetry", str(delay))))
            logger.warning("slack22orca: Slack delivery deferred for %s (%s)", job["id"], type(exc).__name__)
        else:
            self.store.delivered(seq)

    async def poll(self):
        running = set()
        async with asyncio.TaskGroup() as tasks:
            while True:
                if self.adapter._running and len(running) < 8:
                    for job in self.store.due_jobs(running):
                        job_id = job["id"]
                        running.add(job_id)
                        task = tasks.create_task(self.tick(job))
                        task.add_done_callback(lambda _, job_id=job_id: running.discard(job_id))
                await asyncio.sleep(1)

    async def post(self):
        while True:
            if self.adapter._running and (message := self.store.next_message()):
                seq, text, record = message
                await self.deliver(seq, text, json.loads(record))
            await asyncio.sleep(1)

    async def run(self):
        with (self.store.directory / "relay.lock").open("a") as lock:
            with suppress(BlockingIOError):
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                async with asyncio.TaskGroup() as tasks:
                    tasks.create_task(self.poll())
                    tasks.create_task(self.post())


def request_job(*, channel, thread, message, team, actor, target, repo, task):
    allowed = os.getenv("SLACK22ORCA_USER_ID") or os.getenv("AUTOLINEAR_USER_ID")
    request = call(__file__, "delegation", {
        "channel": channel, "thread": thread, "message": message, "actor": actor,
        "target": target, "repo": repo, "task": task,
    }, allowed, list(REQUEST_TARGETS), TASK_LIMIT)
    if "error" in request:
        return request
    repo = repo or os.getenv("SLACK22ORCA_REPO", "leonsilicon.ai")
    route = [team, channel, message]
    if target == "desktop":
        route.append(target)
    key = json.dumps(route)
    job_id = hashlib.sha256(key.encode()).hexdigest()[:16]
    return {
        "id": job_id, "state": "queued", "due": 0, "channel": channel, "team": team,
        "thread": thread, "target": target, "repo": repo, "prompt": request["prompt"],
    }


def queue_job(store, job):
    if "error" in job:
        return job
    if store is None:
        return {"error": "Orca delegation is unavailable until the Slack adapter connects."}
    fresh = store.add(job)
    return {"status": "queued" if fresh else "already_queued", "job": job["id"]}


def submit(store, **kwargs):
    return queue_job(store, request_job(**kwargs))


def register(ctx):
    relay = None

    def enqueue(**kwargs):
        return submit(relay.store if relay else None, **kwargs)

    def command(raw_args, *, source=None, platform=None):
        if platform != "slack" or source is None or source.is_bot:
            return "Run !orca from a Slack conversation."
        args = call(__file__, "command", raw_args, list(REQUEST_TARGETS))
        result = enqueue(
            channel=source.chat_id, thread=source.thread_id or source.message_id,
            message=source.message_id, team=source.scope_id or "", actor=source.user_id,
            **args,
        )
        return result.get("error") or f"Orca {result['status'].replace('_', ' ')} ({result['job']})."

    async def delegate(args, **_):
        from gateway.session_context import get_session_env

        if get_session_env("HERMES_SESSION_PLATFORM") != "slack":
            return {"error": "Delegate from the Slack conversation that should receive Orca's messages."}
        message = get_session_env("HERMES_SESSION_MESSAGE_ID")
        job = request_job(
            channel=get_session_env("HERMES_SESSION_CHAT_ID"),
            thread=get_session_env("HERMES_SESSION_THREAD_ID") or message, message=message,
            team=get_session_env("HERMES_SESSION_SCOPE_ID") or "",
            actor=get_session_env("HERMES_SESSION_ACTOR_ID"),
            target=args.get("target", "macbook"), repo=args.get("repo", ""), task=args.get("task"),
        )
        if relay is None or "error" in job:
            return queue_job(None, job)
        return await relay.submit_from_model(job)

    def wire(_native, adapter):
        nonlocal relay
        if getattr(adapter, "_slack22orca_worker", None):
            return
        from hermes_constants import get_hermes_home

        relay = Relay(Store(get_hermes_home() / "slack22orca"), Orca(), adapter)
        worker = asyncio.create_task(relay.run())
        adapter._slack22orca_worker = worker
        disconnect = adapter.disconnect

        @functools.wraps(disconnect)
        async def disconnect_and_stop(*args, **kwargs):
            worker.cancel()
            try:
                with suppress(asyncio.CancelledError):
                    await worker
            finally:
                adapter.disconnect = disconnect
                adapter._slack22orca_worker = None
                await disconnect(*args, **kwargs)

        adapter.disconnect = disconnect_and_stop
        logger.info("slack22orca: Slack thread relay registered")

    ctx.register_platform_handler("slack", wire)
    ctx.register_command("orca", handler=command, description="Delegate a task to Orca in this Slack thread.",
                         args_hint="[auto|macbook|mini|cloud|desktop] [repo=<name>] <task>")
    ctx.register_tool(
        name="slack22orca_delegate", toolset="slack22orca", handler=delegate, is_async=True,
        schema={
            "name": "slack22orca_delegate",
            "description": "Delegate work to Orca and relay its messages to this Slack thread. Defaults to "
                           "MacBook. If the MacBook cannot take the task, desktop_unavailable means "
                           "nothing was queued and you can start cloud work through Silicon Dot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {"type": "string", "description": "Self-contained brief for the Orca agent."},
                    "repo": {"type": "string", "description": "Registered Orca repository name or canonical Git remote."},
                    "target": {"type": "string", "enum": ["auto", *REQUEST_TARGETS], "default": "macbook",
                               "description": "Use desktop to queue device-only work until MacBook or Mac mini "
                                              "is ready. auto is the explicit legacy route through MacBook, "
                                              "Mac mini and Orca on Hermes Cloud."},
                },
                "required": ["task"],
            },
        },
    )
