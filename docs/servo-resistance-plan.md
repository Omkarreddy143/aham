# Orbit Foundry: game-to-glove resistance contract

The scene is implemented; physical servo output is disabled. The team has confirmed both-hand Quest tracking and live contact cue receipt. The new right-hand pickup game needs its headset play-through next.

A separate **one-index hardware bench implementation** is now available: [wiring and quickstart](index-hardware-quickstart.md), [ZIP](../artifacts/AHAM-Index-Hardware.zip). It leaves the scene unchanged, selects only index requests, requires local arming and circuit verification, and limits initial servo travel/duration. Physical actuation remains untested; the other four outputs stay disabled.

## Delivered activity

Orbit Foundry is a 75-second cargo shift. Open the right hand first, close around a nearby core or pinch it, lift at least 7.5 cm (instructions round to 8 cm), carry it to the matching color dock, then open. The first grab starts the clock. Consecutive correct deliveries increase the multiplier from 1 to 2; wrong placement breaks the combo. Delivered cores respawn after 0.9 seconds. Touch the illuminated NEW SHIFT button with the right index fingertip for 0.7 seconds to restart inside VR. No controller or HTML interaction is required during play.

| Core | Virtual mass | Base game resistance | Base score | Grasp vibration cue |
|---|---:|---:|---:|---:|
| Ion / mint | 0.25 kg | 18% | 80 | 95 / pattern 1 |
| Flux / amber | 1 kg | 42% | 130 | 130 / pattern 2 |
| Nova / violet | 3 kg | 68% | 200 | 155 / pattern 3 |

Virtual mass is a game label. It does not claim an equivalent real load. Each finger's dimensionless request uses the selected core's base, up to eight additional percentage points for lift, and its estimated curl engagement. Requests are clamped to 0–80%. The prototype uses equal gravity for all cores, as physically appropriate for free fall; mass changes the requested grip cue. Grasp contact is inferred from the gesture. V4 free fingertip contact uses sphere/rotated-box geometry with a 3 mm exit margin for existing contact; this is not a rigid-body hand solver.

The object follows the right palm for a power grip or the thumb/index midpoint for a pinch, with wrist rotation and the offset captured when grabbed. The virtual hand always displays the actual estimated joints; it is never locked to a fictional grip pose. Pinch closes below 26 mm and releases above 45 mm. A power grip requires at least three non-thumb curls above 25%; it releases when fewer than two exceed 15%. V4 requires 35 ms stable opening, 55 ms stable acquisition and 60 ms visual release; resistance requests clear immediately at the release threshold. Missing/degenerate joints, a missing wrist, a frame gap above 150 ms, a hidden session, or session end releases the core and zeros all five requests. Reacquiring tracking requires opening first. The timer pauses during missing tracking. Throw velocity is capped; the bench catches misplaced cores to keep them reachable.

## Preview route implemented now

```text
Quest right-hand joints -> grasp/lift state -> five normalized requests
  -> HTTPS POST /api/grip-preview -> laptop expiring readout

Quest fingertip/grasp contact -> POST /api/cue
  -> localhost UDP 8767 -> bridge echo -> browser monitor
```

`/api/grip-preview` stores validated software requests only. It sends no UDP, serial, I2C, PWM or servo command. The response and status explicitly report `actuatorsEnabled: false`. Desktop rehearsal submits no requests, allowing a laptop viewer to monitor Quest without overwriting it; the server also zeros any synthetic submission. Reload old desktop tabs after updating. Use one live headset session at a time; the monitor is a shared demo readout, not a multi-device controller or authenticated actuator service.

Example JSON for a held heavy core; channel order is thumb, index, middle, ring, little:

```json
{
  "version": 1,
  "source": "webxr",
  "hand": "right",
  "trackingValid": true,
  "holding": true,
  "objectId": "violet",
  "gripMode": "grip",
  "resistance": [42, 50, 55, 50, 45],
  "referenceCurl": [30, 50, 60, 50, 40]
}
```

All fields are required, no extra fields are accepted. `version` is 1, source is `webxr` or `desktop-preview`, hand is `right`, booleans are strict, object IDs are `mint`, `amber`, `violet` or null, grip mode is `grip`, `pinch` or `none`. Both arrays contain five integers; resistance is 0–80 and reference curl 0–100. Reference curl is captured once at acquisition; it is descriptive optical pose, not a servo position command. Release, preview, or invalid tracking clears holding, object ID and both arrays. The laptop readout expires after 500 ms. A receipt confirms laptop storage, not hardware application. Existing protocol-v1 pressure and mode remain zero.

## Mechanism and physical verification needed next

The [five-finger bench guide](five-finger-hardware.md) now provides a complete PlatformIO receiver, local sender, channels, repeated motor-driver circuit and detached calibration procedure. Defaults disable all outputs; physical power, force and release remain unverified. The retained [one-index guide](index-hardware-quickstart.md) is a separate fallback. Software requests and pulses are not force measurements.

Finger tendons can oppose finger movement and represent grip resistance. A glove attached only to the hand cannot apply a sustained external downward arm load equivalent to lifting a real 3 kg object. This distinction follows the difference between hand-referenced resistance and externally grounded weight feedback; [Docking Haptics](https://arxiv.org/abs/2002.06093) combines a worn hand exoskeleton with a grounded arm to add weight feedback. Optical curl and servo angle also cannot measure tendon tension or guarantee the real hand stays in exactly the virtual pose. Define this demonstration as grip resistance with visual weight cues.

Build one index mechanism on the bench first. Specify which motion the tendon opposes; a tendon that simply pulls fingers closed is not a safe resistance brake. Use a releasable arrangement, compliant travel, measured tension, and a direct mechanical release. Obtain the actual spool radius, slack/release position, minimum/maximum travel, current and allowable tendon load before creating a wearable control law. A future tension/load measurement should enforce limits locally; this hardware set currently has no force sensor. Do not convert the scene's percentage directly into 0–180° servo positions.

The new bench firmware implements local arming, bounded travel and expiry. The physical mechanism must still demonstrate the release behavior represented below:

```text
DISARMED -> local mechanism checks + explicit arm -> READY
READY + valid fresh hold request -> bounded/resisted grip
release / hand loss / local stop / invalid packet / timeout -> verified slack/release
fault -> release + latched DISARMED
```

Calibrate each servo independently. Map channels only after recording release and travel limits:

| Finger | Planned PCA9685 channel | Servo |
|---|---:|---|
| Thumb | 0 | MG90S |
| Index | 1 | MG90S |
| Middle | 2 | MG90S |
| Ring | 3 | MG90S |
| Little | 4 | SG90; validate separately |

The PCA9685 provides PWM timing; it does not sense or limit tendon force. Its outputs are logic/PWM signals, not a servo motor power source. [NXP PCA9685 datasheet](https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf) The mechanical release must work even when power or control disappears; disabling PWM does not itself guarantee slack. Supply servos from a separately rated supply with common signal ground, not NodeMCU GPIO/3.3 V. Measure startup and simultaneous loaded current before choosing the supply; the existing 5 V/2 A adapter is not automatically sufficient for five servos. Retain a local watchdog independent of Quest, laptop and tunnel; determine its deadline from bench measurements and the release mechanism. Ramp requests and travel locally, and confirm release under power loss, disconnect, reset and jam. Do not expose a physical actuator command route through the temporary public monitor tunnel.

Advance index bench -> index fitted glove -> remaining channels only after the preceding release and tracking tests pass. Keep motors and cables out of the headset camera's view of the joints. A fitted glove can change optical pose quality. Physical servo feedback remains pending until these dimensions, power and release behaviors are demonstrated.
