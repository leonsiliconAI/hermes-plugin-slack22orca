"""Run the process-wide PythonMonkey engine on its owning thread.

Hermes may call plugins from its gateway loop, plugin loader and tool workers.
All JavaScript runs on one event loop, on one thread, and that thread holds
Python's global interpreter lock for as long as JavaScript or the engine's
collector runs. A stall there stops every Python thread in the process,
Hermes's own watchdogs included, so this module keeps the engine's work small
and bounded:

- Values cross as JSON text, in both directions, so each side works on its own copy. PythonMonkey 1.5.1 shares the
  buffer of every Python str it hands to JavaScript and, each time the
  JavaScript collector frees one, scans the table of all of them. One
  collection then costs (strings freed x strings shared), which froze the
  gateway for four hours on 2026-11-26. A str holding a character above U+FFFF
  is copied instead, so every text sent to JavaScript starts with one.
- Nothing that refers to the engine leaves its thread: results are plain Python
  values, and errors lose their JavaScript value and their engine frames.
- A policy module is loaded once for each copy of this module. Hermes imports a plugin again
  when it reloads it, so the plugin's old Python keeps the JavaScript it started with and its
  new Python loads the new file.
- If the engine's loop stops turning, a watchdog that needs no lock writes
  every thread's stack to a file and ends the process, so the service
  supervisor starts a new one.

Blocking tool I/O can use asyncio.to_thread inside a Python callback without
blocking the engine.
"""
import asyncio
import atexit
import ctypes
import faulthandler
import functools
import inspect
import itertools
import json
import logging
import math
import os
import sys
import tempfile
import threading
import time
from concurrent.futures import Future
from pathlib import Path
from types import SimpleNamespace

LOG = logging.getLogger(__name__)

# Each standalone mirror includes this module. They share one engine per process.
_runtime = sys.modules.setdefault(
    "_leonsilicon_hermes_pythonmonkey_runtime",
    SimpleNamespace(lock=threading.Lock(), ready=None),
)

# A str with this character is stored four bytes wide, the only kind PythonMonkey copies.
ASTRAL = "\U00010000"
MARK = "$hermes.pythonmonkey"
SAFE_INTEGER = 2 ** 53 - 1
# Identifies this copy of the module among the copies that share the engine.
COPY = object()
_warned = set()
# Collect on a schedule, so that what one collection has to free stays small whatever the engine's
# own heuristics decide.
COLLECT_EVERY = 256
SHUTDOWN_SECONDS = 10


def _deadman_seconds():
    try:
        return max(0.0, float(os.environ.get("HERMES_PYTHONMONKEY_DEADMAN_SECONDS", "120")))
    except ValueError:
        return 120.0


BRIDGE = r"""(function (dispatch) {
  "use strict";
  const MARK = "$hermes.pythonmonkey";

  function encode(value) {
    return JSON.stringify([value], function (key, item) {
      // Python saw undefined as None; keep the key instead of dropping it.
      if (item === undefined) return null;
      if (typeof item === "number" && !Number.isFinite(item))
        return { [MARK]: "number", value: String(item) };
      if (typeof item === "bigint") return { [MARK]: "integer", value: String(item) };
      // Half of a surrogate pair, left by a slice through an emoji, is text Python cannot encode.
      if (typeof item === "string" && !item.isWellFormed()) return item.toWellFormed();
      return item;
    });
  }

  // PythonMonkey gave JavaScript undefined for Python's None, and policies rely on it: a default
  // parameter or a destructuring default applies to undefined, not to null. The key or the array
  // slot stays, as it did.
  function revive(node, call) {
    if (node === null) return undefined;
    if (typeof node !== "object") return node;
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index++) node[index] = revive(node[index], call);
      return node;
    }
    if (node[MARK] === "number") return Number(node.value);
    if (node[MARK] === "integer") return BigInt(node.value);
    if (node[MARK] === "function") {
      const index = node.value;
      return function (...values) {
        return host(call, index, values);
      };
    }
    for (const key of Object.keys(node)) node[key] = revive(node[key], call);
    return node;
  }

  function decode(text, call) {
    return revive(JSON.parse(text)[1], call);
  }

  function host(call, index, values) {
    const answer = dispatch(call, index, encode(values));
    return typeof answer === "string"
      ? decode(answer, call)
      : answer.then((text) => decode(text, call));
  }

  return function (module, text, call) {
    const [name, values] = decode(text, call);
    if (typeof module[name] !== "function")
      throw new TypeError("policy.cjs exports no function named " + name);
    const result = module[name](...values);
    return result !== null && typeof result === "object" && typeof result.then === "function"
      ? result.then(encode)
      : encode(result);
  };
})"""


def _take_cleanup(engine):
    # PythonMonkey 1.5.1 exposes SpiderMonkey's teardown through this capsule.
    # CPython normally invokes it on the main thread during interpreter shutdown.
    # SpiderMonkey must be destroyed on the thread that initialized it.
    capsule = getattr(engine.pythonmonkey, "___cleanup")
    get_destructor = ctypes.pythonapi.PyCapsule_GetDestructor
    get_destructor.argtypes = [ctypes.py_object]
    get_destructor.restype = ctypes.c_void_p
    set_destructor = ctypes.pythonapi.PyCapsule_SetDestructor
    set_destructor.argtypes = [ctypes.py_object, ctypes.c_void_p]
    set_destructor.restype = ctypes.c_int
    destructor = ctypes.PYFUNCTYPE(None, ctypes.py_object)(get_destructor(capsule))
    set_destructor(capsule, None)
    return lambda: destructor(capsule)


def _shutdown(loop, worker):
    _runtime.closed = True
    loop.call_soon_threadsafe(loop.stop)
    # An engine that is stuck must not keep the process from exiting.
    worker.join(SHUTDOWN_SECONDS)


def _serve(ready):
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        if "pythonmonkey" in sys.modules:
            raise RuntimeError("PythonMonkey has already been initialized outside the Hermes plugin runtime")
        import pythonmonkey

        cleanup = _take_cleanup(pythonmonkey)
    except BaseException as exc:
        ready.set_exception(exc)
        return
    atexit.register(_shutdown, loop, threading.current_thread())
    # An engine a copy from before 2026-11-26 started has shared strings waiting to be freed, and
    # freeing them is the stall. Hermes restarts after it installs the plugins, which discards them.
    _runtime.collects = True
    ready.set_result((loop, pythonmonkey))
    try:
        loop.run_forever()
    finally:
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.close()
        cleanup()


def _engine():
    if getattr(_runtime, "closed", False):
        raise RuntimeError("PythonMonkey has shut down")
    with _runtime.lock:
        if _runtime.ready is None:
            _runtime.ready = Future()
            threading.Thread(
                target=_serve, args=(_runtime.ready,),
                name="hermes-pythonmonkey", daemon=True,
            ).start()
    return _runtime.ready.result()


def _shared():
    """What the copies of this module share, whichever copy started the engine.

    Everything but `ids` is read and written on the engine's thread only. The name carries the
    wire format's version: a copy that speaks another format keeps its own.
    """
    shared = getattr(_runtime, "wire1", None)
    if shared is None:
        with _runtime.lock:
            shared = getattr(_runtime, "wire1", None)
            if shared is None:
                shared = _runtime.wire1 = SimpleNamespace(
                    ids=itertools.count(1), bridge=None, modules={}, hosts={},
                    calls=0, collect_every=COLLECT_EVERY, deadman=None, dump=None,
                )
    return shared


def _on_engine(loop):
    return getattr(loop, "_thread_id", None) == threading.get_ident()


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
        return {MARK: "function", "value": len(hosts) - 1}
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
    # json.dumps writes ASCII only, so ASTRAL alone decides how the str is stored.
    return '["' + ASTRAL + '",' + json.dumps(_plain(value, hosts), allow_nan=False, separators=(",", ":")) + "]"


def _revive(item):
    if len(item) == 2 and MARK in item:
        if item[MARK] == "number":
            return float(item["value"])
        if item[MARK] == "integer":
            return int(item["value"])
    return item


def _value(text):
    # str() copies a str that lives in JavaScript's heap, so nothing here keeps a reference into it.
    # A whole number arrives as an int, so an int that JavaScript only passes on comes back as it was.
    return json.loads(str(text), object_hook=_revive)[0]


def _fit(function, values):
    """Give a Python function the arguments JavaScript's calling convention gives a JavaScript one.

    PythonMonkey does this for the functions it wraps: None for each required parameter the caller
    left out, and nothing beyond the parameters the function has.
    """
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


def _dispatch(call, index, text):
    """Run the Python callback JavaScript asked for. JavaScript calls this on the engine's thread."""
    hosts = _shared().hosts.get(int(call))
    if hosts is None:
        raise RuntimeError("A Python callback was called after its policy call had finished.")
    function = hosts[int(index)]
    result = function(*_fit(function, _value(text)))
    if not inspect.isawaitable(result):
        return _text(result, hosts)

    async def settle():
        return _text(await result, hosts)

    return settle()


def _copies(engine):
    """Whether this PythonMonkey copies the texts this module sends, as 1.5.1 does."""
    probe = _text(0, [])
    before = sys.getrefcount(probe)
    engine.eval("(text) => text.length")(probe)
    # A shared str is kept alive by the engine until JavaScript's collector frees its side.
    return sys.getrefcount(probe) == before


def _dump_file():
    home = os.environ.get("HERMES_HOME", "").strip()
    folder = Path(home) / "logs" if home else Path(tempfile.gettempdir())
    try:
        folder.mkdir(parents=True, exist_ok=True)
        return (folder / "pythonmonkey-deadman.log").open("a")
    except OSError:
        return sys.__stderr__


def _watch(shared):
    """Start the watchdog once per process. A process that cannot have one still runs policies."""
    seconds = _deadman_seconds()
    if not seconds or shared.deadman is not None:
        return
    try:
        shared.dump = _dump_file()
        shared.dump.fileno()
        _report_last_stop(shared.dump)
        shared.deadman = asyncio.get_running_loop().create_task(_deadman(seconds, shared.dump))
    except Exception:
        LOG.exception("Could not start the PythonMonkey watchdog")


def _report_last_stop(dump):
    """Say once, in the new process, that the watchdog ended the previous one."""
    if dump is sys.__stderr__:
        return
    try:
        path = Path(dump.name)
        seen = path.with_name(path.name + ".seen")
        size = path.stat().st_size
        reported = int(seen.read_text()) if seen.exists() else 0
        if size > reported:
            stopped = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(path.stat().st_mtime))
            LOG.error(
                "The PythonMonkey watchdog ended a Hermes process at %s: its JavaScript engine had not "
                "run for %s seconds, which happens when JavaScript or other native code keeps Python's "
                "interpreter lock. Every thread's stack is at the end of %s.",
                stopped, format(_deadman_seconds(), "g"), path,
            )
        if size != reported:
            seen.write_text(str(size))
    except (OSError, ValueError):
        LOG.debug("Could not read the PythonMonkey watchdog's file", exc_info=True)


async def _deadman(seconds, dump):
    """End the process when the engine's loop stops turning.

    faulthandler's timer runs on a thread of its own that takes no Python lock, so it still fires
    while JavaScript holds the global interpreter lock, when no Python watchdog can run.
    """
    try:
        while True:
            faulthandler.dump_traceback_later(seconds, exit=True, file=dump)
            await asyncio.sleep(seconds / 6)
    finally:
        faulthandler.cancel_dump_traceback_later()


def _bridge(engine, shared):
    if shared.bridge is None:
        shared.bridge = engine.eval(BRIDGE)(_dispatch)
        if not _copies(engine):
            # Without the copy, shared strings would pile up between collections again.
            shared.collect_every = 1
            LOG.error(
                "This PythonMonkey shares the texts sent to JavaScript instead of copying them, so "
                "JavaScript's collector now runs after every policy call. Pin pythonmonkey==1.5.1.",
            )
        _watch(shared)
    return shared.bridge


def _module(engine, shared, path):
    # The modules live with the engine, not in this copy's globals, so that they are only ever
    # freed on the engine's thread. A load that fails is not kept: the file can be missing while
    # a plugin is being installed.
    module = shared.modules.get((COPY, path))
    if module is None:
        # PythonMonkey's require evaluates the file again on every call, so keep what it returns.
        module = shared.modules[COPY, path] = engine.require(path)
    return module


@functools.lru_cache(maxsize=None)
def _policy(filename):
    return str(Path(filename).resolve().with_name("policy.cjs"))


def _portable(error):
    """Cut an error loose from the engine before another thread gets it.

    A SpiderMonkeyError carries the JavaScript value that was thrown, and a traceback keeps this
    module's frames, which hold JavaScript values too. Freed on another thread, they would change
    the engine's bookkeeping from outside its thread. The message already has the JavaScript stack.
    """
    seen = set()
    link = error
    while link is not None and id(link) not in seen:
        seen.add(id(link))
        if getattr(link, "jsError", None) is not None:
            link.jsError = None
        link.__traceback__ = None
        link = link.__cause__ or link.__context__
    return error


class _Call:
    def __init__(self, filename, function, args):
        self.loop, self.engine = _engine()
        self.shared = _shared()
        self.hosts = []
        # Encoded on the caller's thread: JavaScript gets the values as they are now.
        self.text = _text([function, args], self.hosts)
        self.path = _policy(filename)
        self.id = next(self.shared.ids)
        self.function = function
        self.holds_loop = False

    def start(self):
        bridge = _bridge(self.engine, self.shared)
        module = _module(self.engine, self.shared, self.path)
        if self.hosts:
            self.shared.hosts[self.id] = self.hosts
        return bridge(module, self.text, self.id)

    def finish(self):
        self.shared.hosts.pop(self.id, None)
        self.shared.calls += 1
        if self.shared.calls >= self.shared.collect_every:
            self.shared.calls = 0
            if getattr(_runtime, "collects", False):
                self.engine.collect()

    def run_inline(self):
        try:
            answer = self.start()
            if inspect.isawaitable(answer):
                raise RuntimeError(
                    "call() cannot wait for an asynchronous policy function on the engine's own thread. "
                    "Use acall().",
                )
            return _value(answer)
        finally:
            self.finish()

    async def run(self):
        try:
            try:
                answer = self.start()
                if inspect.isawaitable(answer):
                    if self.holds_loop and ("loop", self.function) not in _warned:
                        # Hermes's own watchdog ends a gateway whose loop is held for two minutes,
                        # and its lock is free in this case, so this only has to be visible.
                        _warned.add(("loop", self.function))
                        LOG.warning(
                            "call() holds the event loop it was called from until the asynchronous policy "
                            "function %s finishes, and for good if that function needs the loop. Use acall().",
                            self.function,
                        )
                    answer = await answer
                return True, _value(answer)
            finally:
                self.finish()
        except Exception as error:
            return False, _portable(error)


def _in_event_loop():
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    return True


def call(filename, function, *args):
    request = _Call(filename, function, args)
    if _on_engine(request.loop):
        # A callback JavaScript is waiting on: waiting for the engine's loop here would never end.
        return request.run_inline()
    # A plain function answers in well under a millisecond, which an event loop can wait for.
    request.holds_loop = _in_event_loop()
    done, value = asyncio.run_coroutine_threadsafe(request.run(), request.loop).result()
    if done:
        return value
    raise value


async def acall(filename, function, *args):
    request = _Call(filename, function, args)
    if _on_engine(request.loop):
        done, value = await request.run()
    else:
        done, value = await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(request.run(), request.loop))
    if done:
        return value
    raise value


def blocking(function):
    """Expose a blocking Python operation as a Promise without blocking PythonMonkey."""
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
