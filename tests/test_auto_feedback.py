"""Automatic feedback lifecycle without a Quest, COM port or powered actuator."""
from copy import deepcopy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'host'))
from aham.auto_feedback import AutoFeedback, quest_state
from aham.serial_glove import LocalCommandFile, SerialPacketLink, board_status


def snapshot():
    return {'mode':'monitor-only',
            'cue':{'ageMs':0,'source':'webxr','hand':'right','trackingValid':True,
                   'duties':[0]*5,'patterns':[0]*5},
            'grip':{'ageMs':0,'source':'webxr','hand':'right','trackingValid':True,
                    'holding':False,'actuatorsEnabled':False,'resistance':[0]*5,
                    'referenceCurl':[0]*5,'objectId':None,'gripMode':'none'}}


def receipt(now, masks=(0,0), reason='MANUAL_STOP'):
    return {'receivedAt':now,'motorMask':masks[0],'servoMask':masks[1],
            'vibration':[0]*5,'resistance':[0]*5,'holding':False,'reason':reason}


def board(now, motors=31, servos=31):
    return {'receivedAt':now,'PCA':1,'STOP_CLOSED':1,'LIVE':1,'M_ALLOWED':motors,'S_ALLOWED':servos}


class AutoFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.mode=AutoFeedback(emit=Mock())

    def step(self, now, source=None, ack=None, status=None, boot=123, elapsed=0):
        return self.mode.step(snapshot() if source is None else source, elapsed,
                              receipt(now) if ack is None else ack,
                              board(now) if status is None else status, boot, now)

    def prepare(self, target='ALL', start=10, motors=31, servos=31):
        self.mode.enable(target)
        commands=[]
        for i in range(42):
            now=start+i*.05
            commands += self.step(now,status=board(now,motors,servos))
        return commands

    def activate(self):
        commands=self.prepare()
        self.assertEqual(commands.count('ARM BOTH ALL'),1)
        self.step(12.1,ack=receipt(12.1,(31,31),'READY'))
        self.assertEqual(self.mode.phase,'ACTIVE')

    def test_disabled_default_does_not_arm_even_with_live_data(self):
        for i in range(60):self.assertEqual(self.step(10+i*.05),[])
        self.assertEqual(self.mode.phase,'OFF')

    def test_real_neutral_source_requires_both_valid_fresh_channels(self):
        self.assertEqual(quest_state(snapshot(),0),(True,True))
        for field,value in (('source','desktop-preview'),('hand','left'),('trackingValid',False),('ageMs',250)):
            data=snapshot();data['cue'][field]=value
            self.assertEqual(quest_state(data,0),(False,False))
        self.assertEqual(quest_state(snapshot(),.25),(False,False))
        self.assertEqual(quest_state(snapshot(),float('nan')),(False,False))
        data=snapshot();data['grip']=None
        self.assertEqual(quest_state(data,0),(True,False))
        data=snapshot();data['cue']['duties']=[999]*5
        self.assertEqual(quest_state(data,0),(False,False))

    def test_two_seconds_then_single_arm_and_confirmed_receipt(self):
        self.activate()
        for i in range(80):
            now=12.15+i*.05
            self.assertNotIn('ARM BOTH ALL',self.step(now,ack=receipt(now,(31,31),'READY')))
        self.assertEqual(self.mode.phase,'ACTIVE')

    def test_contact_hold_and_missing_grip_never_auto_arm(self):
        cases=[]
        for channel,field,value in (('cue','duties',[95]*5),('grip','holding',True),
                                    ('grip','resistance',[20]*5),('grip','referenceCurl',[50]*5)):
            data=snapshot();data[channel][field]=value;cases.append(data)
        cases.append(dict(snapshot(),grip=None))
        for data in cases:
            with self.subTest(data=data):
                self.mode.enable('ALL')
                for i in range(70):
                    self.assertFalse(any(c.startswith('ARM ') for c in self.step(20+i*.05,source=data)))

    def test_no_quest_data_keeps_outputs_disarmed_without_repeating_stop(self):
        self.mode.enable('ALL')
        source={'mode':'monitor-only','cue':None,'grip':None}
        commands=[]
        for i in range(70):commands += self.step(10+i*.05,source=source)
        self.assertNotIn('ARM BOTH ALL',commands)
        self.assertEqual(commands.count('STOP'),0)  # fresh receipt already confirms disarmed
        self.assertEqual(self.mode.phase,'WAITING_DATA')

    def test_tracking_loss_stops_then_recovery_requires_neutral_again(self):
        self.activate()
        data=snapshot();data['cue']['trackingValid']=False
        self.assertIn('STOP',self.step(12.2,source=data,ack=receipt(12.2,(31,31),'READY')))
        self.assertEqual(self.mode.phase,'WAITING_DATA')
        requests=[]
        for i in range(42):requests += self.step(12.3+i*.05)
        self.assertEqual(requests.count('ARM BOTH ALL'),1)

    def test_stale_snapshot_disarms_even_with_fresh_esp_heartbeat(self):
        self.activate()
        self.assertIn('STOP',self.step(12.2,ack=receipt(12.2,(31,31),'READY'),elapsed=.25))
        self.assertEqual(self.mode.phase,'WAITING_DATA')

    def test_stop_and_manual_commands_cancel_automatic_rearming(self):
        for command in ('STOP','HOME','AUTO OFF','ARM BOTH INDEX','JOG INDEX +10','SWEEP INDEX'):
            with self.subTest(command=command):
                self.mode.enable('ALL')
                self.mode.local_commands(command)
                for i in range(50):self.assertEqual(self.step(20+i*.05),[])
                self.assertFalse(self.mode.enabled)

    def test_d6_or_pca_fault_cancels_until_new_local_enable(self):
        for field in ('STOP_CLOSED','PCA'):
            self.mode.enable('ALL');bad=board(10);bad[field]=0
            self.assertEqual(self.step(10,status=bad),['STOP'])
            self.assertEqual(self.mode.phase,'BLOCKED')
            for i in range(50):self.assertEqual(self.step(11+i*.05),[])

    def test_pull_and_arm_timeouts_are_not_reset_by_automatic_mode(self):
        for reason in ('PULL_EXPIRED','ARM_EXPIRED','I2C_FAULT','STOP_OPEN','MANUAL_STOP'):
            with self.subTest(reason=reason):
                self.activate()
                self.assertEqual(self.step(12.2,ack=receipt(12.2,reason=reason)),['STOP'])
                self.assertEqual(self.mode.phase,'BLOCKED')
                self.assertEqual(self.step(12.3),[])

    def test_old_manual_stop_reply_during_arm_does_not_cancel_pending_arm(self):
        self.prepare()
        self.assertEqual(self.mode.phase,'ARMING')
        self.step(12.1,ack=receipt(12.1))
        self.assertEqual(self.mode.phase,'ARMING')
        self.step(12.2,ack=receipt(12.2,(31,31),'READY'))
        self.assertEqual(self.mode.phase,'ACTIVE')

    def test_arm_refusal_is_attempted_once_and_then_blocks(self):
        self.prepare()
        commands=[]
        for i in range(25):commands += self.step(12.1+i*.05)
        self.assertEqual(self.mode.phase,'BLOCKED')
        self.assertNotIn('ARM BOTH ALL',commands)
        self.assertIn('STOP',commands)

    def test_esp_restart_cancels_mode(self):
        self.activate()
        self.assertEqual(self.step(12.2,boot=456),['STOP'])
        self.assertEqual(self.mode.phase,'BLOCKED')

    def test_missing_receipt_or_board_status_prevents_arm(self):
        for ack,status in (({},board(10)),(receipt(10),{})):
            self.mode.enable('ALL')
            for i in range(70):
                self.assertNotIn('ARM BOTH ALL',self.step(10+i*.05,ack=ack,status=status))

    def test_allowed_masks_are_respected_and_index_needs_both_channels(self):
        self.prepare(motors=2,servos=2)
        self.assertEqual(self.mode.expected,(2,2))
        self.prepare(target='INDEX',motors=2,servos=0)
        self.assertEqual(self.mode.phase,'BLOCKED')
        self.prepare(motors=0,servos=0)
        self.assertEqual(self.mode.phase,'BLOCKED')

    def test_sparse_checks_cannot_claim_two_seconds_of_stable_input(self):
        self.mode.enable('ALL')
        self.step(10)
        self.assertNotIn('ARM BOTH ALL',self.step(13))
        self.assertEqual(self.mode.phase,'WAITING_NEUTRAL')

    def test_esp_lease_loss_can_recover_but_never_while_holding(self):
        self.activate()
        self.step(12.2,ack=receipt(12.2,reason='LINK_LOST'))
        self.assertEqual(self.mode.phase,'WAITING_DATA')
        data=snapshot();data['grip']['holding']=True
        for i in range(70):
            self.assertNotIn('ARM BOTH ALL',self.step(12.3+i*.05,source=data))

    def test_stop_is_retried_if_receipts_disappear(self):
        self.activate()
        self.assertIn('STOP',self.step(12.2,ack={}))
        self.assertIn('STOP',self.step(12.5,ack={}))
        self.assertEqual(self.mode.phase,'WAITING_DATA')

    def test_auto_control_is_local_only_and_old_lines_are_skipped(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'.build') as directory:
            path=Path(directory)/'control.txt';path.write_bytes(b'AUTO ARM BOTH ALL\n')
            control=LocalCommandFile(path);link=Mock()
            try:
                control.poll(link,self.mode.local_commands)
                link.send_command.assert_not_called()
                with path.open('ab') as out:out.write(b'AUTO ARM BOTH ALL\nSTOP\n')
                control.poll(link,self.mode.local_commands)
                self.assertEqual([call.args[0] for call in link.send_command.call_args_list],['STOP','STATUS','STOP'])
                self.assertFalse(self.mode.enabled)
            finally:control.close()
        device=Mock();serial=SerialPacketLink('unused',device)
        with self.assertRaises(ValueError):serial.send_command('AUTO ARM BOTH ALL')
        device.write.assert_not_called()

    def test_board_status_requires_complete_bounded_values(self):
        self.assertIsNone(board_status(b'STATUS PCA=1'))
        self.assertIsNone(board_status(b'STATUS PCA=2 STOP_CLOSED=1 LIVE=1 M_ALLOWED=31 S_ALLOWED=31'))
        self.assertIsNone(board_status(b'STATUS PCA=1 STOP_CLOSED=1 LIVE=1 M_ALLOWED=32 S_ALLOWED=31'))
        device=Mock();serial=SerialPacketLink('unused',device)
        device.read.return_value=b'STATUS PCA=1 STOP_CLOSED=1 LIVE=1 M_ALLOWED=31 S_ALLOWED=31\n'
        with patch('aham.serial_glove.time.monotonic',return_value=10):
            with self.assertRaises(BlockingIOError):serial.recv(66)
        self.assertEqual(serial.board_status,board(10))


if __name__=='__main__':unittest.main()
