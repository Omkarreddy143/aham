"""Temporary Windows power request for a running demo, without changing power settings."""
from contextlib import contextmanager
import ctypes
import os


@contextmanager
def keep_awake():
    kernel = ctypes.windll.kernel32 if os.name == "nt" else None
    requested = kernel and kernel.SetThreadExecutionState(0x80000001)  # CONTINUOUS | SYSTEM_REQUIRED
    if kernel and not requested:
        print("Could not request temporary sleep prevention; keep the laptop awake manually.", flush=True)
    try:
        yield
    finally:
        if requested:
            kernel.SetThreadExecutionState(0x80000000)  # Clear only this thread's request.
