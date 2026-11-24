"""Hermes owns the Slack route; Orca owns the workspace, launch and transcript."""

from __future__ import annotations

import asyncio
import fcntl
import functools
import hashlib
import json
import logging
import os
import re
import sqlite3
import time
from contextlib import closing, contextmanager, suppress

logger = logging.getLogger(__name__)
TARGETS = ("macbook", "mini", "cloud")
POLL_SECONDS = 3
TRANSCRIPT_LIMIT = 100
TASK_LIMIT = 12_000
SLACK_TS = re.compile(r"[0-9]+\.[0-9]{6}")
SLACK_CHANNEL = re.compile(r"[CDG][A-Z0-9]+")


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
    if not limited:
        for seen, current in zip(previous, keys):
            if seen != current:
                break
        else:
            return keys, entries[len(previous):], False
    for size in range(min(len(previous), len(keys)), 0, -1):
        if previous[-size:] == keys[:size]:
            return keys, entries[size:], False
    return keys, entries, bool(limited or previous)


def slack_chunks(text):
    while text:
        end = min(len(text), 3800)
        if end < len(text):
            newline = text.rfind("\n", 3000, end)
            if newline != -1:
                end = newline + 1
        yield "Orca\n" + text[:end]
        text = text[end:]


class Relay:
    def __init__(self, store, orca, adapter):
        self.store = store
        self.orca = orca
        self.adapter = adapter

    async def prepare(self, job):
        hosts = TARGETS if job["target"] == "auto" else (job["target"],)
        failures = []
        for host in hosts:
            try:
                inventory = await self.orca.call(host, "repo", "list")
                matches = [
                    repo for repo in inventory.get("repos", [])
                    if repo.get("kind") == "git" and job["repo"] in (
                        repo.get("displayName"), (repo.get("gitRemoteIdentity") or {}).get("canonicalKey"),
                    )
                ]
                if len(matches) != 1:
                    failures.append(f"{host}: repository {'ambiguous' if matches else 'missing'}")
                    continue
                inventory = await self.orca.call(host, "agent", "installed")
                if not any(agent.get("id") == "codex" for agent in inventory.get("agents", [])):
                    failures.append(f"{host}: Codex unavailable")
                    continue
            except OrcaError as exc:
                logger.info("slack22orca: %s preflight on %s failed (%s)", job["id"], host, exc)
                failures.append(f"{host}: unreachable")
                continue
            # Persist the host before the first mutating call. An ambiguous launch must stay here.
            job.update(state="launching", host=host, repo_id=matches[0]["id"], due=0)
            self.store.save(job)
            await self.launch(job, initial=True)
            return
        self.finish(job, "Orca could not start this task. " + "; ".join(failures) + ".")

    async def launch(self, job, *, initial=False):
        operation = job.get("operation")
        if not initial and not operation:
            await self.recover_launch(job)
            return
        args = [
            "worktree", "create", "--repo", f"id:{job['repo_id']}",
            "--name", f"slack22orca-{job['id']}", "--no-parent", "--setup", "skip",
            "--agent", "codex", "--surface", "chat", "--prompt", job["prompt"],
        ]
        if operation:
            args.extend(("--retry-launch", operation))
        try:
            result = await self.orca.call(job["host"], *args, timeout=65)
        except OrcaError as exc:
            logger.info("slack22orca: %s launch on %s returned %s", job["id"], job["host"], exc)
            retry = exc.data.get("operationId")
            if isinstance(retry, str) and retry and not operation:
                job.update(operation=retry, due=time.time() + POLL_SECONDS)
            else:
                job.update(operation=None, due=time.time() + POLL_SECONDS)
            self.store.save(job)
            return
        launch = result.get("launch") or {}
        outcome = launch.get("outcome") or {}
        if outcome.get("kind") == "structured" and launch.get("prompt", {}).get("outcome") == "journaled":
            session = outcome.get("sessionId")
            if session:
                self.started(job, session)
                return
        job.update(operation=None, due=time.time() + POLL_SECONDS)
        self.store.save(job)

    async def recover_launch(self, job):
        """Check only this job's fresh workspace; never submit its prompt a second time."""
        try:
            result = await self.orca.call(
                job["host"], "worktree", "show", "--worktree", f"name:slack22orca-{job['id']}",
            )
            worktree = (result.get("worktree") or {}).get("id")
            if worktree:
                result = await self.orca.call(job["host"], "agent", "list", "--worktree", f"id:{worktree}")
                agents = [agent for agent in result.get("agents", []) if agent.get("kind") == "chat"]
                if len(agents) == 1 and agents[0].get("orcaSessionId"):
                    self.started(job, agents[0]["orcaSessionId"])
                    return
        except OrcaError:
            pass
        attempts = job.get("recovery_attempts", 0) + 1
        if attempts >= 4:
            self.finish(
                job, f"Orca could not confirm the launch on {job['host']}. "
                f"Check workspace slack22orca-{job['id']} on that host.",
            )
        else:
            job.update(recovery_attempts=attempts, due=time.time() + 5)
            self.store.save(job)

    def started(self, job, session):
        session = session.removeprefix("orca_session_id:")
        job.update(state="reading", session=session, previous=[], due=0)
        job.pop("prompt", None)
        job.pop("operation", None)
        self.store.save(job, f"Orca started Codex on {job['host']} (orca_session_id:{session}).")

    def finish(self, job, *messages):
        job.update(state="done", due=0)
        for key in ("prompt", "operation", "previous"):
            job.pop(key, None)
        self.store.save(job, *messages)

    async def read(self, job):
        try:
            page = await self.orca.call(
                job["host"], "agent", "read", f"orca_session_id:{job['session']}",
                "--limit", str(TRANSCRIPT_LIMIT),
            )
        except OrcaError as exc:
            if not job.get("read_unavailable"):
                logger.info("slack22orca: %s transcript temporarily unavailable (%s)", job["id"], exc)
            job.update(read_unavailable=True, due=time.time() + 20)
            self.store.save(job)
            return
        job.pop("read_unavailable", None)
        previous, new, gap = transcript_update(job["previous"], page["entries"], page.get("limited"))
        messages = []
        if gap:
            messages.append("Orca’s transcript changed or exceeded its readable window. Some earlier messages may be missing.")
        for entry in new:
            if entry.get("kind") == "message" and entry.get("role") == "assistant" and entry.get("text"):
                messages.extend(slack_chunks(entry["text"]))
        if page.get("state") == "done":
            self.finish(job, *messages, "Orca finished the turn.")
        else:
            job.update(previous=previous, due=time.time() + POLL_SECONDS)
            self.store.save(job, *messages)

    async def tick(self, job):
        try:
            if job["state"] == "queued":
                await self.prepare(job)
            elif job["state"] == "launching":
                await self.launch(job)
            else:
                await self.read(job)
        except Exception:
            logger.exception("slack22orca: could not advance job %s", job["id"])
            job["due"] = time.time() + 20
            self.store.save(job)

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
            self.store.defer_message(seq, max(1, int(delay)) if str(delay).isdigit() else 30)
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


def submit(store, *, channel, thread, message, team, actor, target, repo, task):
    allowed = os.getenv("SLACK22ORCA_USER_ID") or os.getenv("AUTOLINEAR_USER_ID")
    if not actor or actor != allowed:
        return {"error": "Orca delegation is available to the configured Slack user."}
    if not (SLACK_CHANNEL.fullmatch(channel or "") and SLACK_TS.fullmatch(thread or "")
            and SLACK_TS.fullmatch(message or "")):
        return {"error": "Orca delegation needs a Slack message and its thread."}
    if target not in ("auto", *TARGETS) or not isinstance(task, str) or not task.strip():
        return {"error": "Usage: !orca [auto|macbook|mini|cloud] [repo=<name>] <task>"}
    if len(task) > TASK_LIMIT or "\0" in task:
        return {"error": f"Task must be at most {TASK_LIMIT} characters and contain no NUL."}
    if not isinstance(repo, str) or len(repo) > 250:
        return {"error": "Use a registered Orca repository name or its canonical Git remote."}
    if store is None:
        return {"error": "Orca delegation is unavailable until the Slack adapter connects."}
    repo = repo or os.getenv("SLACK22ORCA_REPO", "leonsilicon.ai")
    key = json.dumps([team, channel, message])
    job_id = hashlib.sha256(key.encode()).hexdigest()[:16]
    prompt = (
        "This task was delegated by Hermes from Slack. Your user-visible messages will be relayed "
        "into the original Slack thread as you work. Keep progress and the final result useful for "
        "that audience, and keep secrets out of your messages.\n\n"
        f"Slack request: https://app.slack.com/archives/{channel}/p{message.replace('.', '')}\n\n"
        f"{task.strip()}"
    )
    fresh = store.add({
        "id": job_id, "state": "queued", "due": 0, "channel": channel, "team": team,
        "thread": thread, "target": target, "repo": repo, "prompt": prompt,
    })
    return {"status": "queued" if fresh else "already_queued", "job": job_id}


def register(ctx):
    relay = None

    def enqueue(**kwargs):
        return submit(relay.store if relay else None, **kwargs)

    def command(raw_args, *, source=None, platform=None):
        if platform != "slack" or source is None or source.is_bot:
            return "Run !orca from a Slack conversation."
        task = raw_args.strip()
        target, repo = "auto", ""
        first = task.split(maxsplit=1)
        if first and first[0] in ("auto", *TARGETS):
            target, task = first[0], (first[1] if len(first) == 2 else "")
        if task.startswith("repo="):
            first = task[5:].split(maxsplit=1)
            repo, task = (first[0] if first else ""), (first[1] if len(first) == 2 else "")
        result = enqueue(
            channel=source.chat_id, thread=source.thread_id or source.message_id,
            message=source.message_id, team=source.scope_id or "", actor=source.user_id,
            target=target, repo=repo, task=task,
        )
        return result.get("error") or f"Orca {result['status'].replace('_', ' ')} ({result['job']})."

    def delegate(args):
        from gateway.session_context import get_session_env

        if get_session_env("HERMES_SESSION_PLATFORM") != "slack":
            return {"error": "Delegate from the Slack conversation that should receive Orca's messages."}
        message = get_session_env("HERMES_SESSION_MESSAGE_ID")
        return enqueue(
            channel=get_session_env("HERMES_SESSION_CHAT_ID"),
            thread=get_session_env("HERMES_SESSION_THREAD_ID") or message, message=message,
            team=get_session_env("HERMES_SESSION_SCOPE_ID") or "",
            actor=get_session_env("HERMES_SESSION_ACTOR_ID"),
            target=args.get("target", "auto"), repo=args.get("repo", ""), task=args.get("task"),
        )

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
                         args_hint="[auto|macbook|mini|cloud] [repo=<name>] <task>")
    ctx.register_tool(
        name="slack22orca_delegate", toolset="slack22orca", handler=delegate,
        schema={
            "name": "slack22orca_delegate",
            "description": "Delegate work to Orca. Its messages are posted to the current Slack thread.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {"type": "string", "description": "Self-contained brief for the Orca agent."},
                    "repo": {"type": "string", "description": "Registered Orca repository name or canonical Git remote."},
                    "target": {"type": "string", "enum": ["auto", *TARGETS],
                               "description": "auto tries MacBook, Mac mini, then Hermes Cloud."},
                },
                "required": ["task"],
            },
        },
    )
