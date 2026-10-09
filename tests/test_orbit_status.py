"""Connection diagnosis without a headset, a serial owner change or actuation."""
import importlib.util
from concurrent.futures import Future
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import MagicMock, Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
spec = importlib.util.spec_from_file_location('orbit_status', ROOT / 'tools/orbit_status.py')
status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(status)

RECEIPT = ('ESP FIVE seq=123 ESP_LINK=LIVE QUEST=RIGHT_HAND_TRACKING '
           'VIB=[0, 95, 0, 0, 0] RES%=[0, 14, 0, 0, 0] HOLD=True '
           'M_ARM=0 S_ARM=0 PWM=[0, 0, 0, 0, 0] '
           'SERVO_US=[1500, 1500, 1500, 1500, 1500] S_SIGNAL=0 LAST_REASON=LINK_LOST')
BOARD = 'USB BOARD: STATUS PCA=1 STOP_CLOSED=1 WIFI=1 LIVE=1 AGE_MS=10 M_ALLOWED=31 S_ALLOWED=31'


def probe(data):
    return {'ok': True, 'data': data}


def right_input(**changes):
    return dict(source='webxr', hand='right', trackingValid=True, ageMs=0, duties=[0]*5, **changes)


class StatusTests(unittest.TestCase):
    def report(self, **changes):
        values = dict(settings={'origin':'https://current.trycloudflare.com', 'gloveSerialPort':'COM7'},
                      local={'ok':True}, public={'ok':True}, game={'ok':True},
                      preview=probe({'cue':right_input()}), connection=probe({'accepted':12, 'rejected':0}),
                      companion={'alive':True, 'receipt':status.parse_receipt(RECEIPT), 'receiptAgeMs':0,
                                 'board':status.parse_board(BOARD), 'boardAgeMs':0}, ports=['COM7'])
        values.update(changes)
        return status.make_report(**values)

    def test_fresh_zero_hand_input_is_live_and_disarmed_is_separate(self):
        text, ready = self.report()
        self.assertTrue(ready)
        self.assertIn('WORKING QUEST LINK: https://current.trycloudflare.com/game.html', text)
        self.assertIn('QUEST -> LAPTOP: LIVE', text)
        self.assertIn('ESP REPLIES: LIVE', text)
        self.assertIn('OUTPUTS: DISARMED', text)
        self.assertIn('PCA9685: DETECTED', text)
        self.assertIn('D6 STOP LOOP: CLOSED', text)
        self.assertIn('Last board stop reason (may be historical): LINK_LOST', text)
        self.assertIn('matching hotspot Wi-Fi is not required', text)

    def test_stale_input_preview_and_tracking_loss_are_distinguished(self):
        for cue, label in ((dict(right_input(), ageMs=250), 'WAITING'),
                           (dict(right_input(), source='desktop-preview'), 'PREVIEW'),
                           (dict(right_input(), trackingValid=False), 'HAND_LOST'),
                           (dict(right_input(), hand='left'), 'HAND_LOST')):
            with self.subTest(label=label):
                self.assertEqual(status.classify_input({'cue':cue}, {}), label)
        self.assertEqual(status.classify_input({'cue':right_input()}, {}, elapsed_ms=251), 'WAITING')
        self.assertEqual(status.classify_input({}, {'lastUpload':{'ageMs':0,'status':403}}), 'REJECTED')

    def test_failed_public_link_never_becomes_a_working_link(self):
        text, ready = self.report(public={'ok':False,'error':'HTTP 1033'})
        self.assertFalse(ready)
        self.assertIn('WORKING QUEST LINK: not verified', text)
        self.assertIn('Last saved link (not confirmed working)', text)
        self.assertIn('Refresh VR Link.cmd', text)

    def test_automatic_waiting_state_has_neutral_data_guidance(self):
        ack=status.parse_receipt(RECEIPT+' AUTO=WAITING_DATA')
        text,_=self.report(companion={'alive':True,'receipt':ack,'receiptAgeMs':0})
        self.assertIn('AUTOMATIC FEEDBACK: WAITING_DATA',text)
        self.assertIn('Automatic mode is waiting',text)
        self.assertIn('two seconds',text)
        self.assertNotIn('Manual mode requires',text)

    def test_old_receipt_and_board_status_are_not_live(self):
        companion={'alive':True,'receipt':status.parse_receipt(RECEIPT),'receiptAgeMs':0,
                   'board':status.parse_board(BOARD),'boardAgeMs':0,'sampledAt':time.monotonic()-10}
        text, ready = self.report(companion=companion)
        self.assertFalse(ready)
        self.assertIn('ESP REPLIES: NO FRESH REPLY', text)
        self.assertNotIn('PCA9685: DETECTED', text)
        self.assertIn('Do not start a duplicate companion', text)
        self.assertNotIn('REQUESTS RECEIVED BY ESP', text)

    def test_wifi_network_requirement_and_missing_usb_guidance(self):
        text, _ = self.report(settings={'origin':'https://current.trycloudflare.com','espIp':'10.0.0.18'})
        self.assertIn('laptop and ESP must share', text)
        text, _ = self.report(ports=[])
        self.assertIn('USB PORT: NOT DETECTED', text)
        self.assertIn('USB DATA cable', text)

    def test_companion_pid_reuse_and_wrong_transport_are_rejected(self):
        settings={'wifiGlovePid':77,'gloveSerialPort':'COM7'}
        record={'ProcessId':77,'Name':'python.exe','ExecutablePath':str(status.vr_link.PYTHON),
                'CommandLine':'python -u host/run.py wifi-glove --serial-port COM7'}
        self.assertTrue(status.companion_alive(settings,[record]))
        for command in ('python unrelated.py','python host/run.py wifi-glove --serial-port COM8'):
            self.assertFalse(status.companion_alive(settings,[dict(record,CommandLine=command)]))
        self.assertFalse(status.companion_alive(settings,[dict(record,ProcessId=78)]))
        self.assertFalse(status.companion_alive({'wifiGlovePid':77},[record]))

    def test_local_runner_is_recognized_but_unrelated_runner_is_not(self):
        record={'ProcessId':77,'Name':'python.exe','ExecutablePath':str(status.vr_link.PYTHON),
                'CommandLine':f'python -u "{status.ROOT / ".build/wifi-glove-live-runner.py"}"'}
        self.assertTrue(status.companion_alive({'wifiGlovePid':77},[record]))
        self.assertFalse(status.companion_alive({'wifiGlovePid':77},[dict(record,CommandLine='python -u other-runner.py')]))
        self.assertFalse(status.companion_alive({'wifiGlovePid':77},[dict(record,ExecutablePath='C:/other/python.exe')]))

    def test_receipt_parser_rejects_malformed_and_out_of_range_fields(self):
        self.assertIsNotNone(status.parse_receipt(RECEIPT))
        for value in (RECEIPT.replace('seq=123','seq=999999'), RECEIPT.replace('M_ARM=0','M_ARM=32'),
                      RECEIPT.replace('[0, 95, 0, 0, 0]','[0, 200, 0, 0, 0]'),
                      RECEIPT.replace('[0, 95, 0, 0, 0]','[0, 95]'), 'unrelated '+RECEIPT):
            self.assertIsNone(status.parse_receipt(value))
        self.assertIsNotNone(status.parse_board(BOARD))
        self.assertIsNone(status.parse_board(BOARD.replace('PCA=1','PCA=2')))
        self.assertIsNone(status.parse_board('USB BOARD: STATUS WIFI=1'))

    def test_old_log_is_ignored_and_only_status_is_appended(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.build') as directory:
            root=Path(directory);build=root/'.build';build.mkdir()
            log=build/'live.log';log.write_text(RECEIPT+'\n')
            control=build/'glove-control.txt';control.write_bytes(b'OLD COMMAND\n')
            with patch.object(status,'ROOT',root):
                result=status.sample_companion({'wifiGloveLog':str(log),'gloveSerialPort':'COM7'},True,seconds=.12)
                self.assertIsNone(status.confined_log({'wifiGloveLog':str(root/'outside.log')}))
            self.assertIsNone(result['receipt'])
            self.assertEqual(control.read_bytes(),b'OLD COMMAND\nSTATUS\n')

    def test_new_log_bytes_confirm_reply_and_board_status(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.build') as directory:
            root=Path(directory);build=root/'.build';build.mkdir()
            log=build/'live.log';log.write_text('')
            def append():
                time.sleep(.05)
                with log.open('a') as output:output.write(RECEIPT+'\n'+BOARD+'\n')
            worker=threading.Thread(target=append)
            with patch.object(status,'ROOT',root):
                worker.start()
                try:result=status.sample_companion({'wifiGloveLog':str(log)},True,seconds=.2)
                finally:worker.join()
            self.assertEqual(result['receipt']['sequence'],123)
            self.assertEqual(result['board']['PCA'],1)
            self.assertLess(result['receiptAgeMs'],1000)
            self.assertFalse((build/'glove-control.txt').exists())

    def test_http_probe_rejects_non_relay_json_unrelated_game_and_redirect(self):
        opener=MagicMock();response=Mock(status=200)
        opener.open.return_value.__enter__.return_value=response
        with patch.object(status,'build_opener',return_value=opener):
            response.read.return_value=json.dumps({'mode':'monitor-only'}).encode()
            self.assertTrue(status.http_probe('http://test/api/status')['ok'])
            response.read.return_value=b'{"mode":"other"}'
            self.assertFalse(status.http_probe('http://test/api/status')['ok'])
            response.read.return_value=b'<h1>Other site</h1>'
            self.assertFalse(status.http_probe('http://test/game.html','game')['ok'])
            response.read.return_value=b'Orbit Foundry <script src="./app.js"></script>'
            self.assertTrue(status.http_probe('http://test/game.html','game')['ok'])
            response.status=302
            self.assertFalse(status.http_probe('http://test/game.html','game')['ok'])

    def test_check_never_calls_recovery_or_opens_serial(self):
        import serial
        from serial.tools import list_ports
        def endpoint(url,kind='json',timeout=4):
            if url.endswith('wifi-preview'):return probe({'cue':right_input()})
            return probe({'mode':'monitor-only'})
        with patch.object(status.vr_link,'load_state',return_value={'origin':'https://current.trycloudflare.com'}), \
             patch.object(status.vr_link,'process_table',return_value=[]), \
             patch.object(status,'http_probe',side_effect=endpoint), \
             patch.object(status.vr_link,'refresh') as refresh, patch.object(serial,'Serial') as serial_open, \
             patch.object(list_ports,'comports',return_value=[]):
            text,ready=status.check_once()
            self.assertIn('NO FRESH REPLY',text)
            self.assertFalse(ready)
            refresh.assert_not_called();serial_open.assert_not_called()

    def test_watch_tail_ignores_history_then_keeps_following_new_receipts(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.build') as directory:
            root=Path(directory);build=root/'.build';build.mkdir()
            log=build/'live.log';log.write_text(RECEIPT+'\n')
            control=build/'glove-control.txt';control.write_bytes(b'')
            settings={'wifiGloveLog':str(log),'gloveSerialPort':'COM7'}
            with patch.object(status,'ROOT',root):
                tail=status.CompanionTail()
                self.assertIsNone(tail.read(settings,True)['receipt'])
                with log.open('a') as output:output.write(RECEIPT.replace('seq=123','seq=124')+'\n'+BOARD+'\n')
                first=tail.read(settings,True)
                self.assertEqual(first['receipt']['sequence'],124)
                self.assertEqual(first['board']['PCA'],1)
                with log.open('a') as output:output.write(RECEIPT.replace('seq=123','seq=125')+'\n')
                self.assertEqual(tail.read(settings,True)['receipt']['sequence'],125)
                tail.received_at-=3
                self.assertGreaterEqual(tail.read(settings,True)['receiptAgeMs'],3000)
                self.assertIsNone(tail.read(settings,False)['receipt'])
                log.write_bytes(b'')
                self.assertIsNone(tail.read(settings,True)['receipt'])
            self.assertEqual(control.read_bytes(),b'STATUS\n')

    def test_watch_updates_live_values_without_waiting_for_link_reverification(self):
        settings={'origin':'https://current.trycloudflare.com','wifiGlovePid':77,'gloveSerialPort':'COM7'}
        pool=Mock();pending=Future();pool.submit.return_value=pending
        cache=dict(public={'ok':True},game={'ok':True},alive=True,ports=['COM7'],
                   inventory_error=None,checkedAt=time.monotonic())
        ack=status.parse_receipt(RECEIPT)
        sample={'alive':True,'receipt':ack,'receiptAgeMs':0,'board':status.parse_board(BOARD),'boardAgeMs':0}
        def endpoint(url,**kwargs):
            return probe({'cue':right_input()}) if url.endswith('wifi-preview') else probe({'accepted':12})
        with patch.object(status,'ThreadPoolExecutor',return_value=pool), \
             patch.object(status.vr_link,'load_state',return_value=settings), \
             patch.object(status,'http_probe',side_effect=endpoint), \
             patch.object(status,'check_once') as slow_check:
            monitor=status.WatchMonitor()
            monitor.check()  # Start background verification without blocking.
            self.assertFalse(pending.done())
            pending.set_result(cache)
            monitor.tail.read=Mock(return_value=sample)
            text,ready=monitor.check()
            self.assertTrue(ready)
            self.assertIn('LIVE WATCH #2',text)
            self.assertIn('sequence=123',text)
            monitor.cached['checkedAt']=time.monotonic()-16
            pool.submit.return_value=Future()  # Slow recheck remains in flight.
            sample['receipt']=dict(ack,sequence=124,vibration=[0,160,0,0,0])
            text,ready=monitor.check()
            self.assertTrue(ready)
            self.assertIn('sequence=124',text)
            self.assertIn('VIB=[0, 160, 0, 0, 0]',text)
            self.assertFalse(monitor.future.done())
            monitor.cached['checkedAt']=time.monotonic()-46
            text,ready=monitor.check()
            self.assertFalse(ready)
            self.assertIn('WORKING QUEST LINK: not verified',text)
            slow_check.assert_not_called()
            monitor.close()

    def test_watch_origin_change_does_not_keep_verifying_the_old_link(self):
        settings={'origin':'https://old.trycloudflare.com'}
        pool=Mock();pool.submit.return_value=Future()
        with patch.object(status,'ThreadPoolExecutor',return_value=pool), \
             patch.object(status.vr_link,'load_state',side_effect=lambda:dict(settings)), \
             patch.object(status,'http_probe',return_value=probe({})):
            monitor=status.WatchMonitor();monitor.check()
            monitor.cached=dict(public={'ok':True},game={'ok':True},alive=False,ports=None,
                                inventory_error=None,checkedAt=time.monotonic())
            settings['origin']='https://new.trycloudflare.com'
            text,ready=monitor.check()
            self.assertFalse(ready)
            self.assertIn('Last saved link (not confirmed working): https://new.trycloudflare.com/game.html',text)
            self.assertNotIn('WORKING QUEST LINK: https://old',text)
            monitor.close()

    def test_watch_display_places_values_and_path_before_long_recovery_guidance(self):
        report,_=self.report()
        compact=status.watch_display('LIVE WATCH #3\n'+report)
        self.assertLess(compact.index('DATA PATH:'),compact.index('WORKING QUEST LINK:'))
        self.assertLess(compact.index('VIB='),compact.index('WORKING QUEST LINK:'))
        self.assertIn('PWM=',compact)
        self.assertIn('SERVO_US=',compact)
        self.assertIn('ESP RECEIPT: sequence=123',compact)
        self.assertIn('ORBIT-STATUS.txt',compact)
        self.assertNotIn('Check only: no ARM',compact)


if __name__=='__main__':unittest.main()
