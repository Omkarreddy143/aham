"""Local automatic arming for USB; firmware checks and output limits stay final."""
import math

from .wifi_monitor import channels, fresh

ZERO = [0] * 5
NEUTRAL_SECONDS = 2.0
RECEIPT_SECONDS = .25


def quest_state(snapshot, elapsed):
    """Require real right-hand cues. Missing grip cannot prove a neutral hand."""
    if (not isinstance(snapshot, dict) or snapshot.get('mode') != 'monitor-only'
            or not math.isfinite(elapsed) or elapsed < 0):
        return False, False
    cue, grip = snapshot.get('cue'), snapshot.get('grip')
    def tracked(value):
        return (fresh(value, 250, elapsed) and value.get('source') == 'webxr'
                and value.get('hand') == 'right' and value.get('trackingValid') is True)
    if not tracked(cue):
        return False, False
    try:
        duties = channels(cue.get('duties'), 160)
        patterns = channels(cue.get('patterns'), 3)
    except ValueError:
        return False, False
    neutral = False
    if tracked(grip) and grip.get('holding') is False and grip.get('actuatorsEnabled') is False:
        try:
            neutral = (duties == ZERO and patterns == ZERO
                       and channels(grip.get('resistance'), 80) == ZERO
                       and channels(grip.get('referenceCurl'), 100) == ZERO
                       and grip.get('objectId') is None and grip.get('gripMode') == 'none')
        except ValueError:
            pass
    return True, neutral


class AutoFeedback:
    """Data loss disarms and waits. STOP and hardware faults cancel auto mode.

    Reacquisition requires two seconds of neutral VR data. An ARM is attempted
    once and must be confirmed; it is never repeated to extend firmware limits.
    """
    def __init__(self, emit=None):
        self.emit = emit or (lambda value: print(value, flush=True))
        self.enabled = False
        self.target = 'ALL'
        self.phase = 'OFF'
        self.boot = None
        self.neutral_at = self.arm_at = None
        self.neutral_sample_at = None
        self.last_status = self.last_stop = float('-inf')
        self.expected = (0, 0)
        self.stop_pending = False

    def change(self, phase, detail=''):
        if phase != self.phase or detail:
            self.phase = phase
            self.emit('AUTO FEEDBACK: ' + phase + (' - ' + detail if detail else ''))

    def enable(self, target):
        if target not in ('INDEX', 'ALL'):
            raise ValueError('Automatic feedback selects INDEX or ALL')
        self.enabled = True
        self.target = target
        self.boot = self.neutral_at = self.arm_at = None
        self.neutral_sample_at = None
        self.expected = (0, 0)
        self.last_status = self.last_stop = float('-inf')
        self.stop_pending = True
        self.change('WAITING_DATA', target + '; fresh neutral Quest data required')

    def cancel(self, reason='local STOP/manual command'):
        self.enabled = False
        self.neutral_at = self.arm_at = None
        self.change('OFF', reason)

    def block(self, reason):
        self.enabled = False
        self.neutral_at = self.arm_at = None
        self.change('BLOCKED', reason + '; start automatic mode again after correction')

    def local_commands(self, command):
        if command.startswith('AUTO ARM BOTH '):
            self.enable(command.rsplit(' ', 1)[1])
            return ['STOP', 'STATUS']
        if command == 'AUTO OFF':
            self.cancel('disabled locally')
            return ['STOP']
        if command in ('STOP', 'HOME') or command.startswith(('ARM ', 'JOG ', 'SWEEP ')):
            self.cancel()
        return [command]

    def step(self, snapshot, elapsed, receipt, board, boot, now):
        if not self.enabled:
            return []
        if self.boot is None and boot:
            self.boot = boot
        elif self.boot is not None and boot != self.boot:
            self.block('ESP restarted or session changed')
            return ['STOP']
        commands = []
        if now - self.last_status >= .5:
            commands.append('STATUS')
            self.last_status = now
        received_at = receipt.get('receivedAt') if isinstance(receipt, dict) else None
        connected = (isinstance(received_at, (int, float)) and
                     0 <= now - received_at < RECEIPT_SECONDS and bool(boot))
        board_at = board.get('receivedAt') if isinstance(board, dict) else None
        board_fresh = isinstance(board_at, (int, float)) and 0 <= now - board_at < 1
        if board_fresh and (not board['PCA'] or not board['STOP_CLOSED']):
            self.block('PCA missing or D6 stop open')
            return ['STOP']
        masks = (receipt['motorMask'], receipt['servoMask']) if connected else None
        if connected and masks == (0, 0):
            self.stop_pending = False
        if connected:
            reason = receipt.get('reason')
            if reason == 'I2C_FAULT' or (self.phase == 'ACTIVE' and reason in (
                    'STOP_OPEN', 'PULL_EXPIRED', 'ARM_EXPIRED', 'MANUAL_STOP', 'SESSION_CHANGED')):
                self.block(reason)
                return ['STOP']
        live, neutral = quest_state(snapshot, elapsed)
        if self.phase in ('ACTIVE', 'ARMING') and masks == (0, 0) and receipt.get('reason') == 'LINK_LOST':
            self.neutral_at = self.neutral_sample_at = self.arm_at = None
            self.change('WAITING_DATA')
            return commands
        if not live or not connected:
            if self.phase in ('ACTIVE', 'ARMING') or (masks and any(masks)):
                self.stop_pending = True
            self.neutral_at = self.neutral_sample_at = self.arm_at = None
            self.change('WAITING_DATA')
            if self.stop_pending and now - self.last_stop >= .25:
                commands.append('STOP')
                self.last_stop = now
            return commands
        if self.phase == 'ACTIVE':
            if masks != self.expected:
                self.block('ESP outputs disarmed or selection changed')
                return ['STOP']
            return commands
        if self.phase == 'ARMING':
            # One older zero reply can arrive after writing ARM. Positive masks
            # confirm actual application; a refusal is bounded to one second.
            if received_at > self.arm_at and masks == self.expected:
                self.change('ACTIVE')
            elif now - self.arm_at >= 1:
                self.block('ARM not confirmed; check firmware masks/PCA/D6')
                return ['STOP']
            return commands
        self.change('WAITING_NEUTRAL')
        board_ready = (board_fresh and board.get('LIVE') == 1 and
                       board.get('M_ALLOWED') is not None and board.get('S_ALLOWED') is not None)
        neutral_receipt = (masks == (0, 0) and receipt.get('vibration') == ZERO
                           and receipt.get('resistance') == ZERO and receipt.get('holding') is False)
        if not neutral or not neutral_receipt or not board_ready:
            self.neutral_at = self.neutral_sample_at = None
            if masks != (0, 0) and now - self.last_stop >= .25:
                commands.append('STOP'); self.last_stop = now
            return commands
        selected = 2 if self.target == 'INDEX' else 31
        expected = (selected & board['M_ALLOWED'], selected & board['S_ALLOWED'])
        if not any(expected) or (self.target == 'INDEX' and expected != (2, 2)):
            self.block('requested circuits are not enabled in firmware')
            return ['STOP']
        if self.neutral_at is None or now - self.neutral_sample_at >= .25:
            self.neutral_at = now
        self.neutral_sample_at = now
        if now - self.neutral_at >= NEUTRAL_SECONDS:
            self.expected = expected
            self.arm_at = now
            self.change('ARMING', self.target)
            commands.append('ARM BOTH ' + self.target)
        return commands
