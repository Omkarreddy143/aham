"""USB recovery tests use fake links only; no serial port is opened."""
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'host'))
from aham.auto_feedback import AutoFeedback
from aham.serial_glove import LocalCommandFile
from aham.wifi_glove import USBRecovery


class USBRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.old = Mock()
        self.glove = SimpleNamespace(socket=self.old, boot=17,
                                     last_receipt={'sequence':10}, pending={10:'packet'},
                                     last_hello=5)
        self.automatic = AutoFeedback(emit=lambda value: None)
        self.automatic.enable('ALL')
        self.automatic.phase = 'ACTIVE'
        self.factory = Mock()
        self.recovery = USBRecovery('COM7', self.factory, emit=lambda value: None)

    def test_failure_closes_handle_clears_auth_state_and_cancels_auto(self):
        self.recovery.failed(self.glove, self.automatic, None, 10)
        self.old.close.assert_called_once()
        self.assertFalse(self.automatic.enabled)
        self.assertEqual(self.automatic.phase, 'OFF')
        self.assertEqual(self.glove.boot, 0)
        self.assertIsNone(self.glove.last_receipt)
        self.assertEqual(self.glove.pending, {})
        self.assertEqual(self.glove.last_hello, -10)
        self.factory.assert_not_called()

    def test_retry_waits_bounded_delay_and_sends_stop_before_handoff(self):
        self.recovery.failed(self.glove, self.automatic, None, 10)
        self.assertFalse(self.recovery.ready(self.glove, None, 10.49))
        self.factory.assert_not_called()
        link = Mock()
        def first_command(command):
            self.assertEqual(command, 'STOP')
            self.assertIs(self.glove.socket, self.old)
        link.send_command.side_effect = first_command
        self.factory.return_value = link
        self.assertTrue(self.recovery.ready(self.glove, None, 10.5))
        self.assertIs(self.glove.socket, link)
        link.send_command.assert_called_once_with('STOP')
        self.assertTrue(self.recovery.ready(self.glove, None, 10.6))
        self.factory.assert_called_once_with('COM7')
        self.assertFalse(self.automatic.enabled)

    def test_open_failure_retries_later_without_rearming(self):
        link = Mock()
        self.factory.side_effect = [OSError('unplugged'), link]
        self.recovery.failed(self.glove, self.automatic, None, 10)
        self.assertFalse(self.recovery.ready(self.glove, None, 10.5))
        self.assertFalse(self.recovery.ready(self.glove, None, 10.99))
        self.assertEqual(self.factory.call_count, 1)
        self.assertTrue(self.recovery.ready(self.glove, None, 11))
        self.assertEqual(self.factory.call_count, 2)
        link.send_command.assert_called_once_with('STOP')
        self.assertEqual(self.automatic.phase, 'OFF')

    def test_stop_write_failure_closes_new_handle_and_does_not_handoff(self):
        link = Mock()
        link.send_command.side_effect = OSError('gone again')
        self.factory.return_value = link
        self.recovery.failed(self.glove, self.automatic, None, 10)
        self.assertFalse(self.recovery.ready(self.glove, None, 10.5))
        link.close.assert_called_once()
        self.assertIs(self.glove.socket, self.old)
        self.assertEqual(self.recovery.retry_at, 11)
        self.assertFalse(self.automatic.enabled)

    def test_commands_queued_before_and_during_disconnect_are_not_replayed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'control.txt'
            path.write_bytes(b'')
            control = LocalCommandFile(path)
            try:
                with path.open('ab') as file:
                    file.write(b'AUTO ARM BOTH ALL\nARM BOTH ALL\n')
                control.buffer = b'ARM BOTH '
                self.recovery.failed(self.glove, self.automatic, control, 10)
                with path.open('ab') as file:
                    file.write(b'AUTO ARM BOTH ALL\nJOG INDEX +100 10\n')
                link = Mock()
                self.factory.return_value = link
                self.assertTrue(self.recovery.ready(self.glove, control, 10.5))
                control.poll(link, self.automatic.local_commands)
                link.send_command.assert_called_once_with('STOP')
                self.assertFalse(self.automatic.enabled)
                with path.open('ab') as file:
                    file.write(b'AUTO ARM BOTH ALL\n')
                control.poll(link, self.automatic.local_commands)
                self.assertEqual([call.args[0] for call in link.send_command.call_args_list],
                                 ['STOP', 'STOP', 'STATUS'])
                self.assertTrue(self.automatic.enabled)
                self.assertEqual(self.automatic.phase, 'WAITING_DATA')
            finally:
                control.close()

    def test_repeated_failure_does_not_reset_retry_or_repeat_side_effects(self):
        control = Mock()
        self.recovery.failed(self.glove, self.automatic, control, 10)
        self.recovery.failed(self.glove, self.automatic, control, 10.4)
        self.old.close.assert_called_once()
        control.discard_pending.assert_called_once()
        self.assertEqual(self.recovery.retry_at, 10.5)


if __name__ == '__main__':
    unittest.main()
