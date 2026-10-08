"""Recovery identity, state preservation and sleep-request lifecycle; no live services stopped."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("vr_link", ROOT / "tools/vr_link.py")
vr_link = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vr_link)
sys.path.insert(0, str(ROOT / "host"))
from aham import runtime


class RecoveryTests(unittest.TestCase):
    def test_only_complete_quick_tunnel_hostnames_are_extracted(self):
        self.assertEqual(vr_link.quick_origin("URL: https://sample-core.trycloudflare.com |"),
                         "https://sample-core.trycloudflare.com")
        for value in ("https://sample.example", "http://sample.trycloudflare.com",
                      "https://sample.trycloudflare.com.evil.example"):
            self.assertIsNone(vr_link.quick_origin(value))

    def test_saved_pid_is_not_enough_to_stop_a_process(self):
        record = {"Name": "cloudflared.exe", "ExecutablePath": str(vr_link.TUNNEL),
                  "CommandLine": 'cloudflared tunnel --url http://127.0.0.1:8890 --protocol http2'}
        self.assertTrue(vr_link.managed(record, "tunnel"))
        self.assertFalse(vr_link.managed(dict(record, ExecutablePath=r"C:\other\cloudflared.exe"), "tunnel"))
        self.assertFalse(vr_link.managed(dict(record, CommandLine="cloudflared tunnel --url http://127.0.0.1:9000"), "tunnel"))
        server = {"Name": "python.exe", "ExecutablePath": str(vr_link.PYTHON),
                  "CommandLine": 'python -u host/run.py webxr --external-origin https://old.trycloudflare.com'}
        self.assertTrue(vr_link.managed(server, "server", "https://old.trycloudflare.com"))
        self.assertFalse(vr_link.managed(server, "server", "https://new.trycloudflare.com"))
        self.assertFalse(vr_link.managed(dict(server, ExecutablePath=r"C:\other\python.exe"), "server",
                                         "https://old.trycloudflare.com"))

    def test_reused_pid_is_refused_before_any_stop_command(self):
        record = {"ProcessId": 123, "Name": "python.exe", "ExecutablePath": r"C:\other\python.exe",
                  "CommandLine": "python unrelated.py"}
        with patch.object(vr_link, "process_table", return_value=[record]), patch.object(vr_link.subprocess, "run") as run:
            with self.assertRaises(RuntimeError):
                vr_link.stop_managed({"serverPid": 123, "origin": "https://old.trycloudflare.com"}, ("server",))
            run.assert_not_called()

    def test_saving_link_preserves_sender_and_esp_settings(self):
        with tempfile.TemporaryDirectory(dir=ROOT / ".build") as directory:
            build = Path(directory)
            value = {"origin": "https://new.trycloudflare.com", "espIp": "10.0.0.18", "espPort": 4212,
                     "wifiGlovePid": 123, "wifiGloveLog": "existing.log", "serverPid": 456, "tunnelPid": 789}
            with patch.object(vr_link, "BUILD", build), patch.object(vr_link, "STATE", build / "quest-wireless.json"):
                vr_link.save_state(value)
            self.assertEqual(json.loads((build / "quest-wireless.json").read_text()), value)
            self.assertEqual(json.loads((build / "quest-restore.json").read_text()), value)

    def test_healthy_open_does_not_restart_a_tunnel(self):
        with patch.object(vr_link, "health", return_value=True), patch.object(vr_link, "stop_managed") as stop:
            self.assertEqual(vr_link.refresh({"origin": "https://live.trycloudflare.com"}), "https://live.trycloudflare.com")
            stop.assert_not_called()


class TemporaryPowerTests(unittest.TestCase):
    def test_power_request_is_cleared_even_after_server_error(self):
        kernel = Mock()
        kernel.SetThreadExecutionState.return_value = 1
        with patch.object(runtime.os, "name", "nt"), patch.object(runtime.ctypes, "windll", create=True) as dll:
            dll.kernel32 = kernel
            with self.assertRaises(RuntimeError), runtime.keep_awake():
                raise RuntimeError("server stopped")
        self.assertEqual(kernel.SetThreadExecutionState.call_args_list[0].args, (0x80000001,))
        self.assertEqual(kernel.SetThreadExecutionState.call_args_list[-1].args, (0x80000000,))


if __name__ == "__main__":
    unittest.main()
