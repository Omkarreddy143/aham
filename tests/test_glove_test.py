"""Standalone tests never require a VR source and cannot start from stale/unarmed receipts."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "host"))
from aham.glove_test import Request, TestWindow, can_test, parse_command, test_packet
from aham.wifi_bench import authenticated
from aham.wifi_glove import BODY, COMMAND

KEY = bytes(range(32))  # Public test vector only.


def receipt(now=10, motor=0, servo=0, reason="READY"):
    return {"receivedAt": now, "motorMask": motor, "servoMask": servo, "reason": reason}


class StandaloneTests(unittest.TestCase):
    def test_default_packet_is_zero_and_authenticated(self):
        packet = test_packet(Request(), 123, 456, 10, 100, KEY)
        self.assertEqual(packet.kind, COMMAND)
        body = BODY.unpack(authenticated(packet, BODY.size, KEY))
        self.assertEqual(body[:3], (123, 456, 250))
        self.assertEqual(body[3:], (0,) * 16)

    def test_all_named_tests_select_only_the_correct_channel(self):
        for finger in range(5):
            for kind, flags, start, end, value in (("motor", 1, 4, 9, 95), ("grip", 2, 14, 19, 20)):
                packet = test_packet(Request(kind, finger), 123, 456, 10, 100, KEY)
                body = BODY.unpack(authenticated(packet, BODY.size, KEY))
                selected = [0] * 5
                selected[finger] = value
                self.assertEqual(body[3], flags)
                self.assertEqual(list(body[start:end]), selected)
                self.assertEqual(body[9:14], (0,) * 5)
                self.assertEqual(body[14:19] if kind == "motor" else body[4:9], (0,) * 5)

    def test_bad_request_and_missing_boot_are_rejected(self):
        for kind, finger in (("all", 0), ("motor", 5), ("grip", -1), ("motor", True)):
            with self.assertRaises(ValueError):
                Request(kind, finger)
        with self.assertRaises(ValueError):
            test_packet(Request(), 123, 0, 10, 100, KEY)

    def test_parser_requires_named_finger_and_fixed_request(self):
        self.assertEqual(parse_command("  motor index\n"), Request("motor", 1))
        self.assertEqual(parse_command("GRIP LITTLE"), Request("grip", 4))
        self.assertEqual(parse_command("stop"), "zero")
        for text in ("motor ALL", "motor", "motor INDEX 255", "grip INDEX 80", "ARM BOTH ALL"):
            with self.assertRaises(ValueError):
                parse_command(text)

    def test_start_needs_fresh_ready_receipt_and_exactly_one_armed_kind(self):
        req = Request("motor", 1)
        self.assertTrue(can_test(req, receipt(motor=2), 10.1))
        for r in (None, receipt(motor=0), receipt(motor=31), receipt(motor=4),
                  receipt(motor=2, servo=2), receipt(motor=2, reason="I2C_FAULT"),
                  receipt(motor=2, reason="STOP_OPEN")):
            self.assertFalse(can_test(req, r, 10.1))
        self.assertFalse(can_test(req, receipt(motor=2), 10.25))
        self.assertFalse(can_test(req, receipt(now=11, motor=2), 10))
        self.assertTrue(can_test(Request("grip", 1), receipt(servo=2), 10.1))

    def test_window_expires_and_enforces_one_second_pause(self):
        window = TestWindow()
        req = Request("motor", 1)
        self.assertTrue(window.start(req, receipt(motor=2), 10))
        self.assertFalse(window.start(req, receipt(motor=2), 10.1))
        self.assertEqual(window.current(receipt(now=12.99, motor=2), 12.99), req)
        self.assertEqual(window.current(receipt(now=13, motor=2), 13), Request())
        self.assertFalse(window.start(req, receipt(now=13.5, motor=2), 13.5))
        self.assertTrue(window.start(req, receipt(now=14.01, motor=2), 14.01))

    def test_grip_has_two_second_window_then_zero(self):
        window = TestWindow()
        self.assertTrue(window.start(Request("grip", 1), receipt(servo=2), 10))
        self.assertEqual(window.current(receipt(now=11.99, servo=2), 11.99), Request("grip", 1))
        self.assertEqual(window.current(receipt(now=12, servo=2), 12), Request())

    def test_tracking_receipt_loss_disarm_or_zero_cancels_without_resuming(self):
        req = Request("motor", 1)
        for bad in (None, receipt(motor=0), receipt(motor=2, reason="STOP_OPEN"), receipt(now=9, motor=2)):
            window = TestWindow()
            self.assertTrue(window.start(req, receipt(motor=2), 10))
            self.assertEqual(window.current(bad, 10.1), Request())
            self.assertEqual(window.current(receipt(now=10.15, motor=2), 10.15), Request())
        window = TestWindow()
        self.assertTrue(window.start(req, receipt(motor=2), 10))
        window.zero()
        self.assertEqual(window.current(receipt(now=10.1, motor=2), 10.1), Request())


if __name__ == "__main__":
    unittest.main()
