# Automatic Orbit feedback

Automatic mode runs in the **USB glove companion**. Quest remains wireless and
uses the live laptop-hosted Orbit game. Existing NodeMCU firmware, wiring and
website need no changes.

With the updated companion running, double-click **Automatic VR Feedback.cmd**
in the Makethon folder. For the initial bench test keep the glove off your hand,
threads slack, USB connected and both actuator rails powered. Alternatively:

```powershell
.\.venv\Scripts\python.exe tools\glove_command.py AUTO ARM BOTH ALL
```

Use `AUTO ARM BOTH INDEX` to select the index pair. **Stop Glove.cmd**, `STOP`,
`HOME` or `AUTO OFF` cancels automatic mode and disarms. Manual ARM/JOG/SWEEP
commands also leave automatic mode, so it cannot interfere with a bench test.

## What happens

| Terminal state | Behaviour |
|---|---|
| `AUTO=WAITING_DATA` | No fresh valid right-hand Quest cue or no fresh ESP reply. Outputs are disarmed; mode waits for data. |
| `AUTO=WAITING_NEUTRAL` | Tracking is arriving. Keep the hand clear of objects, without holding a core. Both cue/grip data and the board receipt must confirm zero requests for two seconds. |
| `AUTO=ARMING` | One ARM command was sent. The firmware still checks PCA, D6 and its enabled circuit masks. A positive authenticated receipt must confirm it within one second. |
| `AUTO=ACTIVE` | Configured outputs are armed; Orbit's existing touch/grasp requests control them. |
| `AUTO=BLOCKED` | A hardware fault, firmware time limit, restart or refused ARM cancelled the mode. Correct the cause, then explicitly start automatic mode again. |
| `AUTO=OFF` | Manual mode. Incoming data does not arm anything. |

Cue freshness expires at **250 ms**; the next companion loop requests STOP if
Quest data is stale, tracking is invalid, or fresh ESP replies disappear. The
firmware's independent command lease remains unchanged. Tracking/connection
recovery can re-arm automatically, but only after another two seconds of
neutral data. A static/GitHub page, desktop preview, cached data or Witness
Garden does not qualify.

Orbit uploads touch and grip together through `/api/feedback`, with a bounded
pipeline of up to three regular requests and one reserved stop request. This
avoids waiting for every tunnel reply before sending the next hand sample.
The relay applies both halves together and ignores older sample numbers and
retired page sessions; delayed requests cannot restore an earlier grip or
extend its freshness. Reload the live Quest game after updating these files.

**STOP stays off even while Quest keeps streaming.** Automatic mode does not
re-arm past an open D6 stop, I2C fault, ESP restart, 60-second arm timeout or
three-second continuous servo-pull timeout. It never repeatedly sends ARM to
reset those limits. After a fault/limit, a new local start is required.

The firmware masks still determine which channels are available. ALL selects
only configured channels; it does not enable unverified circuits. Arming is
separate from actual motion: voltage, motor vibration, tendon tension and servo
movement are not measured by the companion.

## Starting an updated companion

After updating Python files, restart the old companion once so it loads the
new code. Close Serial Monitor and run exactly one companion. From the full
repository root:

```powershell
.\.venv\Scripts\python.exe host\run.py wifi-glove --serial-port COM7 --control-file .build/glove-control.txt --key-file local-data/wifi-bench.key
```

It starts in manual/disarmed mode; use the shortcut to enable automatic mode.
To start a prepared automatic session directly, append `--auto-arm ALL` to
that command. INDEX is also accepted. This option requires USB; the Wi-Fi-only
companion keeps manual arming.

Automatic mode is not saved across companion restarts and old AUTO/ARM lines
are skipped. Restarting a service cannot replay a previous session's start.
Use **Check Orbit Foundry.cmd** to verify the game URL, Quest uploads, current
automatic state, fresh ESP replies and output masks. A mode acknowledgement
such as `AUTO FEEDBACK: WAITING_DATA` confirms the local mode request; an
authenticated ESP receipt confirms actual arming.
