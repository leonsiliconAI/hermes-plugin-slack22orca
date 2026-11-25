import asyncio
import importlib.util
import sys
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

spec = importlib.util.spec_from_file_location("slack22orca", Path(__file__).parents[1] / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = plugin
spec.loader.exec_module(plugin)

REPO = {"id": "repo", "kind": "git", "displayName": "demo"}
TEAM = "T000000001"
THREAD = "1794000000.000011"
MESSAGE = "1794000000.000012"
OWNER = "U000000001"
CHANNEL = "C000000001"


def assistant(text):
    return {"kind": "message", "role": "assistant", "text": text}


class RelayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.store = plugin.Store(Path(directory))
        self.enterContext(patch.dict(os.environ, {"SLACK22ORCA_USER_ID": OWNER}))
        self.client = SimpleNamespace(chat_postMessage=AsyncMock(return_value={"ok": True, "ts": THREAD}))
        self.adapter = SimpleNamespace(
            _running=True, _team_clients={TEAM: self.client}, _outbound_blocked=lambda *_: False,
            _get_client=lambda channel, team_id: self.client,
        )
        self.orca = SimpleNamespace(call=AsyncMock())
        self.relay = plugin.Relay(self.store, self.orca, self.adapter)

    def request(self, **overrides):
        params = dict(
            channel=CHANNEL, thread=THREAD, message=MESSAGE, team=TEAM, actor=OWNER,
            target="auto", repo="demo", task="Check the test run",
        )
        return params | overrides

    def submit(self, **overrides):
        return plugin.submit(self.store, **self.request(**overrides))

    async def test_model_can_fall_back_to_dot_before_any_orca_launch(self):
        job = plugin.request_job(**self.request(target="macbook"))
        self.orca.call.side_effect = plugin.OrcaError("remote_runtime_unavailable")
        result = await self.relay.submit_from_model(job)
        self.assertEqual(result["status"], "desktop_unavailable")
        self.assertEqual(self.store.due_jobs(set()), [])
        self.orca.call.assert_awaited_once_with("macbook", "repo", "list", timeout=12)

    async def test_model_queues_macbook_launch_once_after_preflight(self):
        job = plugin.request_job(**self.request(target="macbook"))
        self.orca.call.side_effect = [
            {"repos": [REPO]}, {"agents": [{"id": "codex"}]},
            {"launch": {"outcome": {"kind": "structured", "sessionId": "session-1"},
                        "prompt": {"outcome": "journaled"}}},
        ]
        self.assertEqual((await self.relay.submit_from_model(job))["status"], "queued")
        self.assertEqual((await self.relay.submit_from_model(job))["status"], "already_queued")
        await self.relay.tick(self.store.due_jobs(set())[0])
        self.assertEqual([call.args[:3] for call in self.orca.call.call_args_list], [
            ("macbook", "repo", "list"), ("macbook", "agent", "installed"),
            ("macbook", "worktree", "create"),
        ])

    async def test_deferred_device_check_survives_restart_and_never_uses_cloud(self):
        self.orca.call.side_effect = [
            plugin.OrcaError("remote_runtime_unavailable"),
            plugin.OrcaError("remote_runtime_unavailable"),
            plugin.OrcaError("remote_runtime_unavailable"),
            {"repos": [REPO]}, {"agents": [{"id": "codex"}]},
            {"launch": {"outcome": {"kind": "structured", "sessionId": "session-2"},
                        "prompt": {"outcome": "journaled"}}},
        ]
        job = plugin.request_job(**self.request(target="desktop", task="Verify commit abc on the phone"))
        self.assertEqual((await self.relay.submit_from_model(job))["status"], "queued")
        await self.relay.tick(self.store.due_jobs(set())[0])
        self.assertEqual(self.store.due_jobs(set()), [])
        self.assertIsNone(self.store.next_message())
        reopened = plugin.Store(self.store.directory)
        relay = plugin.Relay(reopened, self.orca, self.adapter)
        with patch.object(plugin.time, "time", return_value=plugin.time.time() + 301):
            await relay.tick(reopened.due_jobs(set())[0])
        self.assertEqual([call.args[0] for call in self.orca.call.call_args_list],
                         ["macbook", "mini", "macbook", "mini", "mini", "mini"])
        self.assertIn("Verify commit abc on the phone", self.orca.call.call_args.args[-1])

    async def test_falls_back_before_launch_and_relays_each_message_in_original_thread(self):
        self.orca.call.side_effect = [
            plugin.OrcaError("remote_runtime_unavailable"),
            {"repos": [REPO]}, {"agents": [{"id": "codex"}]},
            {"launch": {"outcome": {"kind": "structured", "sessionId": "session-1"},
                        "prompt": {"outcome": "journaled"}}},
            {"entries": [assistant("Starting!")], "state": "working"},
            {"entries": [assistant("Starting!"), assistant("Done.")], "state": "done"},
        ]
        self.assertEqual(self.submit()["status"], "queued")
        self.assertEqual(self.submit()["status"], "already_queued")
        await self.relay.tick(self.store.due_jobs(set())[0])
        job = self.store.due_jobs(set())[0]
        await self.relay.tick(job)
        # A new gateway picks up the persisted cursor.
        reopened = plugin.Store(self.store.directory)
        relay = plugin.Relay(reopened, self.orca, self.adapter)
        with patch.object(plugin.time, "time", return_value=plugin.time.time() + 5):
            job = reopened.due_jobs(set())[0]
        await relay.tick(job)
        self.assertEqual(self.store.due_jobs(set()), [])
        self.assertEqual([call.args[0] for call in self.orca.call.call_args_list],
                         ["macbook", "mini", "mini", "mini", "mini", "mini"])
        while message := self.store.next_message():
            seq, text, record = message
            await relay.deliver(seq, text, json.loads(record))
        replies = [call.kwargs for call in self.client.chat_postMessage.call_args_list]
        self.assertEqual([reply["text"] for reply in replies], [
            "Orca started Codex on mini (orca_session_id:session-1).",
            "Orca\nStarting!", "Orca\nDone.", "Orca finished the turn.",
        ])
        self.assertTrue(all(reply["thread_ts"] == THREAD and reply["channel"] == CHANNEL
                            and not reply["mrkdwn"] and not reply["link_names"] for reply in replies))

    async def test_replays_ambiguous_launch_only_on_original_host(self):
        self.orca.call.side_effect = [
            {"repos": [REPO]}, {"agents": [{"id": "codex"}]},
            plugin.OrcaError("remote_error", {"operationId": "retry-1"}),
            {"launch": {"outcome": {"kind": "structured", "sessionId": "session-1"},
                        "prompt": {"outcome": "journaled"}}},
        ]
        self.submit()
        job = self.store.due_jobs(set())[0]
        await self.relay.tick(job)
        await self.relay.tick(job)
        first, replay = (call.args for call in self.orca.call.call_args_list[-2:])
        self.assertEqual(first[0], "macbook")
        self.assertEqual(replay, (*first, "--retry-launch", "retry-1"))

    async def test_recovers_existing_chat_after_lost_launch_receipt(self):
        self.orca.call.side_effect = [
            {"repos": [REPO]}, {"agents": [{"id": "codex"}]}, plugin.OrcaError("cli_timeout"),
            {"worktree": {"id": "workspace"}},
            {"agents": [{"kind": "chat", "orcaSessionId": "session-1"}]},
        ]
        self.submit(target="cloud")
        job = self.store.due_jobs(set())[0]
        await self.relay.tick(job)
        await self.relay.tick(job)
        self.assertEqual(job["state"], "reading")
        self.assertEqual(self.orca.call.call_args.args, ("cloud", "agent", "list", "--worktree", "id:workspace"))

    async def test_outbox_preserves_order_during_slack_error(self):
        self.submit()
        job = self.store.due_jobs(set())[0]
        self.store.save(job, "First", "Second")
        self.client.chat_postMessage.side_effect = TimeoutError()
        seq, text, record = self.store.next_message()
        await self.relay.deliver(seq, text, json.loads(record))
        self.assertIsNone(self.store.next_message())
        with patch.object(plugin.time, "time", return_value=plugin.time.time() + 31):
            self.assertEqual(self.store.next_message()[1], "First")

    def test_rejects_an_untrusted_sender_or_missing_message_anchor(self):
        self.assertIn("error", self.submit(actor="U000000002"))
        self.assertIn("error", self.submit(thread="missing"))
        self.assertIn("error", self.submit(message=""))
        self.assertEqual(self.store.due_jobs(set()), [])

    async def test_worker_processes_a_second_job_while_a_launch_is_pending(self):
        launch = asyncio.Event()
        second = asyncio.Event()

        async def tick(job):
            if job["channel"] == CHANNEL:
                await launch.wait()
            else:
                second.set()
            self.relay.finish(job)

        self.relay.tick = tick
        self.submit()
        worker = asyncio.create_task(self.relay.poll())
        try:
            await asyncio.sleep(0)
            self.submit(channel="C000000002")
            await asyncio.wait_for(second.wait(), 3)
        finally:
            worker.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await worker


class TranscriptTests(unittest.TestCase):
    def test_rotating_window_keeps_distinct_repeated_messages(self):
        first = [assistant("A"), assistant("B"), assistant("C")]
        cursor, _, _ = plugin.transcript_update([], first, False)
        _, new, gap = plugin.transcript_update(cursor, first[1:] + [assistant("C")], True)
        self.assertEqual(new, [assistant("C")])
        self.assertFalse(gap)

    def test_missing_overlap_reports_the_gap(self):
        cursor, _, _ = plugin.transcript_update([], [assistant("First")], False)
        _, new, gap = plugin.transcript_update(cursor, [assistant("Newest")], True)
        self.assertEqual(new, [assistant("Newest")])
        self.assertTrue(gap)

    def test_long_messages_are_split_without_losing_text(self):
        text = "𐍈" * 3400 + "\n" + "a" * 1000
        chunks = list(plugin.slack_chunks(text))
        self.assertTrue(all(len(chunk) <= 4000 for chunk in chunks))
        self.assertEqual("".join(chunk.removeprefix("Orca\n") for chunk in chunks), text)
