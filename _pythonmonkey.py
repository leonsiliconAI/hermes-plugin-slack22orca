"""Run the process-wide PythonMonkey engine on its owning thread.

Hermes may call plugins from its gateway loop, plugin loader and tool workers.
All JavaScript and proxy conversions run on one event loop. Blocking tool I/O
can use asyncio.to_thread inside a Python callback without blocking the engine.
"""
import asyncio
import atexit
import ctypes
import inspect
import sys
import threading
from concurrent.futures import Future
from pathlib import Path
from types import SimpleNamespace

# Each standalone mirror includes this module. They share one engine per process.
_runtime = sys.modules.setdefault(
    "_leonsilicon_hermes_pythonmonkey_runtime",
    SimpleNamespace(lock=threading.Lock(), ready=None),
)


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
    loop.call_soon_threadsafe(loop.stop)
    worker.join()


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
    with _runtime.lock:
        if _runtime.ready is None:
            _runtime.ready = Future()
            threading.Thread(
                target=_serve, args=(_runtime.ready,),
                name="hermes-pythonmonkey", daemon=True,
            ).start()
    return _runtime.ready.result()


def _native(value, engine):
    if value is engine.null:
        return None
    if isinstance(value, engine.JSObjectProxy):
        return {key: _native(item, engine) for key, item in value.items()}
    if isinstance(value, engine.JSArrayProxy):
        return [_native(item, engine) for item in value]
    return value


def _submit(filename, function, args):
    loop, engine = _engine()

    async def invoke():
        module = engine.require(str(Path(filename).resolve().with_name("policy.cjs")))
        result = module[function](*args)
        if inspect.isawaitable(result):
            result = await result
        return _native(result, engine)

    return asyncio.run_coroutine_threadsafe(invoke(), loop)


def call(filename, function, *args):
    return _submit(filename, function, args).result()


async def acall(filename, function, *args):
    return await asyncio.wrap_future(_submit(filename, function, args))


def blocking(function):
    """Expose a blocking Python operation as a Promise without blocking PythonMonkey."""
    async def invoke(*values):
        _, engine = _engine()
        return await asyncio.to_thread(function, *(_native(value, engine) for value in values))

    return invoke


def on_host(function):
    """Expose an operation on the calling asyncio loop, where Hermes owns its clients."""
    host_loop = asyncio.get_running_loop()

    async def invoke(*values):
        _, engine = _engine()
        args = tuple(_native(value, engine) for value in values)

        async def run():
            result = function(*args)
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
