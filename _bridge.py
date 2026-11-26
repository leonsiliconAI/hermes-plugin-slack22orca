"""Run every plugin's policy.cjs in one Node process beside Hermes.

Hermes may call plugins from its gateway loop, plugin loader and tool workers. Each call goes
to the worker, `bridge.cjs`, as a JSON-RPC request over its stdin and stdout: pygls on this
side, vscode-jsonrpc on the other.

The policies ran inside Hermes before, on PythonMonkey. JavaScript and its collector held
Python's interpreter lock there, so slow work stopped every thread of Hermes, its own watchdogs
included, for four hours on 2026-11-26. Nothing of JavaScript runs in this process now:

- Values cross as JSON text, so each side works on its own copy.
- A plain Python function a policy is given answers before the policy's next line runs, over a
  second pair of pipes. A coroutine function gives the policy a Promise.
- A worker whose JavaScript stops answering is ended, its calls fail, and the next call starts
  another. Hermes keeps running throughout. Each such end is a line in logs/policy-worker.log.

Blocking tool I/O can use asyncio.to_thread inside a Python callback without holding the bridge.
"""
import asyncio
import atexit
import functools
import glob
import inspect
import itertools
import json
import logging
import math
import os
import shutil
import sys
import threading
import time
import traceback
import uuid
from pathlib import Path
from types import SimpleNamespace

LOG = logging.getLogger(__name__)

# Each standalone mirror includes this module. The copies share one worker per process.
_runtime = sys.modules.setdefault(
    "_leonsilicon_hermes_policy_bridge",
    SimpleNamespace(lock=threading.Lock(), bridges={}),
)
# The copies that speak this wire format share a bridge; a copy that speaks another keeps its own.
WIRE = 1
MARK = "$hermes.policy"
SAFE_INTEGER = 2 ** 53 - 1
# Identifies this copy of the module to the worker, which keeps one policy module for each.
COPY = uuid.uuid4().hex
HEAP_MEGABYTES = 256
_warned = set()
_local = threading.local()


def _seconds(name, default):
    try:
        return max(1.0, float(os.environ.get(name, default)))
    except ValueError:
        return float(default)


# How long JavaScript may leave a ping unanswered. A policy answers in well under a millisecond.
STALL_SECONDS = _seconds("HERMES_POLICY_STALL_SECONDS", "15")
# How long a plain Python function may keep JavaScript waiting.
SYNC_SECONDS = _seconds("HERMES_POLICY_SYNC_SECONDS", "120")


class PolicyError(RuntimeError):
    """A policy function threw. The message has JavaScript's error and stack."""


class WorkerError(RuntimeError):
    """The worker ended or was ended before it answered."""


def _plain(value, hosts):
    """A copy of `value` that JSON can carry. Callables go to `hosts` and leave their place."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        # A JavaScript number would round it, and a value JavaScript only passes on must come back
        # exact, so it travels as a BigInt.
        return value if -SAFE_INTEGER <= value <= SAFE_INTEGER else {MARK: "integer", "value": str(value)}
    if isinstance(value, float):
        if math.isfinite(value):
            return value
        return {MARK: "number", "value": "NaN" if value != value else "Infinity" if value > 0 else "-Infinity"}
    if isinstance(value, dict):
        return {key: _plain(item, hosts) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item, hosts) for item in value]
    if callable(value):
        hosts.append(value)
        # JavaScript has to know before it calls whether to wait for the answer or to await it.
        return {MARK: "function", "value": len(hosts) - 1, "sync": not inspect.iscoroutinefunction(value)}
    # Hermes's own dicts, such as a Slack event, cross whole and may carry anything. One value
    # JavaScript never reads must not fail the call, so it arrives as an object with nothing on it.
    name = type(value).__name__
    if name not in _warned:
        _warned.add(name)
        LOG.warning(
            "A %s cannot cross into JavaScript and arrives as an empty object. Pass JSON values and callables.",
            name,
        )
    return {}


def _text(value, hosts):
    return json.dumps([_plain(value, hosts)], allow_nan=False, separators=(",", ":"))


def _revive(item):
    if len(item) == 2 and MARK in item:
        if item[MARK] == "number":
            return float(item["value"])
        if item[MARK] == "integer":
            return int(item["value"])
    return item


def _value(text):
    # A whole number arrives as an int, so an int that JavaScript only passes on comes back as it was.
    return json.loads(text, object_hook=_revive)[0]


def _fit(function, values):
    """Give a Python function the arguments JavaScript's calling convention gives a JavaScript one:
    None for each required parameter the caller left out, and nothing beyond the parameters the
    function has. PythonMonkey did this, and the policies are written for it."""
    target = function.__func__ if inspect.ismethod(function) else function
    code = getattr(target, "__code__", None)
    # A builtin, a partial or a mock has no real code object; it gets what JavaScript passed.
    if not isinstance(getattr(code, "co_argcount", None), int) or not isinstance(code.co_flags, int):
        return values
    positional = code.co_argcount - (1 if inspect.ismethod(function) else 0)
    required = positional - len(getattr(target, "__defaults__", None) or ())
    if code.co_flags & inspect.CO_VARARGS:
        count = max(len(values), required)
    elif required > len(values):
        count = required
    else:
        count = min(len(values), positional)
    return values[:count] + [None] * (count - len(values))


def _failed(error):
    # A policy that catches this reads the first line, as it did on PythonMonkey.
    trace = "".join(traceback.format_exception(error)).rstrip()
    return {"ok": False, "message": f"Python {type(error).__name__}: {error}\n{trace}"}


async def _settle(awaitable):
    return await awaitable


def _record(reason, calls):
    """Leave a line for whoever watches the worker, such as autodeploy, which posts it to Slack."""
    home = os.environ.get("HERMES_HOME", "").strip()
    if not home:
        return
    try:
        folder = Path(home) / "logs"
        folder.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        doing = f" It was running {', '.join(sorted(set(calls)))}." if calls else ""
        with (folder / "policy-worker.log").open("a", encoding="utf-8") as log:
            log.write(f"{stamp} {reason}{doing}\n")
    except OSError:
        LOG.debug("Could not record the policy worker's end", exc_info=True)


def _node():
    found = sorted(glob.glob("/opt/hermes/tools/node-*/bin/node"), reverse=True)
    for candidate in (os.environ.get("HERMES_POLICY_NODE"), shutil.which("node"), *found):
        if candidate and os.access(candidate, os.X_OK):
            return candidate
    raise WorkerError("The policies need Node.js. Put node on PATH or set HERMES_POLICY_NODE.")


class _Worker:
    """One Node process, and the threads and tasks that keep it honest."""

    def __init__(self, bridge):
        self.bridge = bridge
        self.alive = False
        self.reason = None
        self.python_since = None

    async def start(self):
        from pygls.client import JsonRPCClient

        # pygls logs every message it sends at INFO, with the values in it.
        logging.getLogger("pygls").setLevel(logging.WARNING)
        ask_read, ask_write = os.pipe()        # what JavaScript needs from Python at once
        answer_read, answer_write = os.pipe()  # and Python's answers
        self.client = JsonRPCClient()

        # pygls keeps notes on the function it is given, which a bound method cannot hold.
        async def host(params):
            return await self.host(params)

        self.client.feature("host")(host)
        self.client.server_exit = self.exited
        env = {**os.environ, "HERMES_POLICY_SYNC_OUT": str(ask_write), "HERMES_POLICY_SYNC_IN": str(answer_read)}
        try:
            await self.client.start_io(
                _node(), f"--max-old-space-size={HEAP_MEGABYTES}", str(Path(__file__).with_name("bridge.cjs")),
                pass_fds=(ask_write, answer_read), env=env,
            )
        finally:
            os.close(ask_write)
            os.close(answer_read)
        self.process = self.client._server
        self.questions = os.fdopen(ask_read, "r", encoding="utf-8")
        self.answers = os.fdopen(answer_write, "w", encoding="utf-8")
        self.alive = True
        threading.Thread(target=self.serve, name="hermes-policy-sync", daemon=True).start()
        self.tasks = [asyncio.create_task(self.log_stderr()), asyncio.create_task(self.watch())]

    # ---- the calls JavaScript awaits

    async def host(self, params):
        try:
            hosts = self.bridge.hosts.get(params.call)
            if hosts is None:
                raise RuntimeError("A Python callback was called after its policy call had finished.")
            function = hosts[params.index]
            result = function(*_fit(function, _value(params.text)))
            if inspect.isawaitable(result):
                result = await result
            return {"ok": True, "text": _text(result, hosts)}
        except Exception as error:
            return _failed(error)

    # ---- the calls JavaScript waits for, on their own thread

    def read(self):
        line = self.questions.readline()
        if not line:
            raise EOFError
        return json.loads(line)

    def write(self, message):
        self.answers.write(json.dumps(message) + "\n")
        self.answers.flush()

    def answer(self, message):
        self.python_since = time.monotonic()
        try:
            hosts = self.bridge.hosts.get(message["call"])
            if hosts is None:
                raise RuntimeError("A Python callback was called after its policy call had finished.")
            function = hosts[message["index"]]
            result = function(*_fit(function, _value(message["text"])))
            if inspect.isawaitable(result):
                # A plain function that hands back something to await: JavaScript is waiting for
                # the value, so wait for it here.
                result = asyncio.run_coroutine_threadsafe(_settle(result), self.bridge.loop).result()
            outcome = {"ok": True, "text": _text(result, hosts)}
        except Exception as error:
            outcome = _failed(error)
        finally:
            self.python_since = None
        self.write({"outcome": outcome})

    def serve(self):
        _local.worker = self
        try:
            while True:
                self.answer(self.read())
        except (EOFError, OSError, ValueError):
            pass  # the worker is gone

    def nested(self, invoke):
        """Run a policy for a Python function JavaScript is waiting for.

        JavaScript's one thread is blocked on this very function, so the request goes down the pipe
        it is reading, and it runs the policy there before it goes on waiting."""
        since, self.python_since = self.python_since, None
        try:
            self.write({"invoke": invoke})
            while True:
                message = self.read()
                if "nested" in message:
                    return message["nested"]
                self.answer(message)
        except (EOFError, OSError, ValueError):
            raise WorkerError(self.reason or "The policy worker ended.") from None
        finally:
            self.python_since = since and time.monotonic()

    # ---- keeping it honest

    async def log_stderr(self):
        async for line in self.process.stderr:
            LOG.warning("policy worker: %s", line.decode("utf-8", "replace").rstrip())

    async def watch(self):
        """End a worker whose JavaScript has stopped. Nothing else can: its one thread is busy."""
        quiet = time.monotonic()
        ping = None
        while self.alive:
            await asyncio.sleep(1)
            now = time.monotonic()
            if ping is None:
                ping = self.client.protocol.send_request_async("ping")
            if ping.done():
                ping.cancelled() or ping.exception()  # a worker that ended is reported elsewhere
                ping, quiet = None, now
                continue
            since = self.python_since
            if since is not None:
                # JavaScript is waiting for Python, so its silence is ours.
                if now - since > SYNC_SECONDS:
                    return self.end(f"a Python function it called did not return for {SYNC_SECONDS:g} seconds")
                quiet = now
            elif now - quiet > STALL_SECONDS:
                return self.end(f"its JavaScript did not answer for {STALL_SECONDS:g} seconds")

    def end(self, reason):
        if not self.alive:
            return
        self.reason = f"The policy worker was ended: {reason}."
        LOG.error("%s Calls in flight fail and the next call starts another worker.", self.reason)
        _record(self.reason, self.bridge.running.values())
        self.alive = False
        self.stop()

    def stop(self):
        try:
            self.process.kill()
        except ProcessLookupError:
            pass  # it had already gone

    async def exited(self, process):
        self.alive = False
        if self.reason is None:
            self.reason = f"The policy worker exited with status {process.returncode}."
            if not self.bridge.closed:
                LOG.error("%s The next call starts another.", self.reason)
                _record(self.reason, self.bridge.running.values())
        for task in self.tasks:
            task.cancel()
        for pipe in (self.questions, self.answers):
            try:
                pipe.close()
            except OSError:
                pass


class _Bridge:
    """The worker, the loop that talks to it, and the callbacks its calls may use."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.ids = itertools.count(1)
        self.hosts = {}
        self.running = {}  # what the worker is doing, for the record when it has to be ended
        self.worker = None
        self.closed = False
        self.thread = threading.Thread(target=self.run, name="hermes-policy-bridge", daemon=True)
        self.thread.start()
        atexit.register(self.close)

    def run(self):
        asyncio.set_event_loop(self.loop)
        self.starting = asyncio.Lock()
        self.loop.run_forever()

    async def ready(self):
        async with self.starting:
            if self.worker is None or not self.worker.alive:
                worker = _Worker(self)
                await worker.start()
                self.worker = worker
            return self.worker

    async def invoke(self, request):
        """Send one call to the worker. A call that used no Python callback did nothing outside
        JavaScript, so it is sent once more when the worker ended under it."""
        for attempt in (1, 2):
            worker = await self.ready()
            if request.hosts:
                self.hosts[request.id] = request.hosts
            self.running[request.id] = request.label
            try:
                outcome = await worker.client.protocol.send_request_async("invoke", request.wire())
            except asyncio.CancelledError:
                raise
            except Exception as error:
                if attempt == 1 and not request.hosts:
                    continue
                await asyncio.sleep(0)  # let the worker's exit be recorded, for the reason
                raise WorkerError(worker.reason or f"The policy worker ended: {error}") from None
            finally:
                self.hosts.pop(request.id, None)
                self.running.pop(request.id, None)
            return {name: getattr(outcome, name, None) for name in ("ok", "text", "waited", "name", "message", "stack")}

    def close(self):
        self.closed = True
        worker = self.worker
        if worker is not None and worker.alive:
            worker.stop()


def _bridge():
    bridge = _runtime.bridges.get(WIRE)
    if bridge is None:
        with _runtime.lock:
            bridge = _runtime.bridges.get(WIRE)
            if bridge is None:
                bridge = _runtime.bridges[WIRE] = _Bridge()
    return bridge


@functools.lru_cache(maxsize=None)
def _policy(filename):
    return str(Path(filename).resolve().with_name("policy.cjs"))


class _Call:
    def __init__(self, filename, function, args):
        self.bridge = _bridge()
        self.hosts = []
        # Encoded on the caller's thread: JavaScript gets the values as they are now.
        self.text = _text([function, args], self.hosts)
        self.path = _policy(filename)
        self.id = next(self.bridge.ids)
        self.function = function
        self.label = f"{function} in {Path(self.path).parent.name}"
        self.holds_loop = False

    def wire(self):
        return {"copy": COPY, "path": self.path, "call": self.id, "text": self.text}

    def result(self, outcome):
        if not outcome["ok"]:
            raise PolicyError(outcome["stack"] or f"{outcome['name']}: {outcome['message']}")
        if outcome.get("waited") and self.holds_loop and ("loop", self.function) not in _warned:
            # Hermes's own watchdog ends a gateway whose loop is held for two minutes, so this only
            # has to be visible.
            _warned.add(("loop", self.function))
            LOG.warning(
                "call() held the event loop it was called from until the asynchronous policy function "
                "%s finished, and would hold it for good if that function needed the loop. Use acall().",
                self.function,
            )
        return _value(outcome["text"])


def _in_event_loop():
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    return True


def call(filename, function, *args):
    request = _Call(filename, function, args)
    bridge = request.bridge
    worker = getattr(_local, "worker", None)
    if worker is not None and worker.alive:
        # In a Python function that JavaScript is waiting for.
        if request.hosts:
            bridge.hosts[request.id] = request.hosts
        try:
            return request.result(worker.nested(request.wire()))
        finally:
            bridge.hosts.pop(request.id, None)
    if threading.current_thread() is bridge.thread:
        raise RuntimeError("call() cannot wait on the bridge's own loop. Use acall().")
    # A plain function answers in well under a millisecond, which an event loop can wait for.
    request.holds_loop = _in_event_loop()
    return request.result(asyncio.run_coroutine_threadsafe(bridge.invoke(request), bridge.loop).result())


async def acall(filename, function, *args):
    request = _Call(filename, function, args)
    bridge = request.bridge
    if threading.current_thread() is bridge.thread:
        return request.result(await bridge.invoke(request))
    return request.result(
        await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(bridge.invoke(request), bridge.loop))
    )


def blocking(function):
    """Expose a blocking Python operation as a Promise without holding the bridge."""
    async def invoke(*values):
        return await asyncio.to_thread(function, *values)

    return invoke


def on_host(function):
    """Expose an operation on the calling asyncio loop, where Hermes owns its clients."""
    host_loop = asyncio.get_running_loop()

    async def invoke(*values):
        async def run():
            result = function(*values)
            return await result if inspect.isawaitable(result) else result

        return await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(run(), host_loop))

    return invoke


async def acall_with_host(filename, function, callbacks, *args, immediate=None):
    """Call a workflow whose native operations have to finish on the Hermes loop."""
    error = None

    def bind(callback):
        async def invoke(*values):
            nonlocal error
            try:
                result = callback(*values)
                return await result if inspect.isawaitable(result) else result
            except Exception as exc:
                error = exc
                raise
        return on_host(invoke)

    host = {name: bind(callback) for name, callback in callbacks.items()}
    host.update(immediate or {})
    try:
        return await acall(filename, function, host, *args)
    except Exception:
        if error is not None:
            raise error from None
        raise
