from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'host'))
from aham.serial_glove import SerialPacketLink, LocalCommandFile


class SerialGloveTests(unittest.TestCase):
    def test_packet_framing_and_partial_ack(self):
        device = Mock()
        link = SerialPacketLink('unused', device)
        link.send(b'abc\0')
        device.write.assert_called_with(b'FRAME 61626300\n')
        device.read.side_effect = [b'noise\nFRAME_ACK 6162', b'6300\n']
        with self.assertRaises(BlockingIOError):
            link.recv(128)
        self.assertEqual(link.recv(128), b'abc\0')

    def test_malformed_frames_and_local_command_injection_rejected(self):
        device = Mock()
        link = SerialPacketLink('unused', device)
        device.read.return_value = b'FRAME_ACK invalid\nFRAME_ACK 616263\n'
        with self.assertRaises(BlockingIOError):
            link.recv(128)
        for value in ('ARM BOTH ALL\nSTOP', 'JOG INDEX +999', 'FRAME abc', 'arm both all'):
            with self.assertRaises(ValueError):
                link.send_command(value)
        device.write.assert_not_called()

    def test_local_control_skips_old_arm_and_handles_new_split_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'control.txt'
            path.write_bytes(b'ARM BOTH ALL\n')
            controls, link = LocalCommandFile(path), Mock()
            try:
                controls.poll(link)
                link.send_command.assert_not_called()
                with path.open('ab') as file:
                    file.write(b'ARM MOTOR IND')
                controls.poll(link)
                link.send_command.assert_not_called()
                with path.open('ab') as file:
                    file.write(b'EX\r\nBAD\nSTOP\n')
                controls.poll(link)
                self.assertEqual([call.args[0] for call in link.send_command.call_args_list], ['ARM MOTOR INDEX', 'STOP'])
            finally:
                controls.close()


if __name__ == '__main__':
    unittest.main()
