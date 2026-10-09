# AHAM — final three-minute demonstration

**Choose Witness Garden on the dashboard.** Orbit Foundry remains available as the second option. The garden is a guided exploration of Tattva 5: agency, body ownership, identity and awareness of body and mind.

**Final-demo fallback, verified in the desktop browser:** [open the fixed Witness Garden build](https://rawcdn.githack.com/Omkarreddy143/aham/6c86d47ba8d798922f62a5dcbff712d50487d21b/webxr/witness.html). This serves the public repository version independently of the laptop tunnel. If the hosting service shows its source notice, check that the destination is `Omkarreddy143/aham` and select **Open the page**. Then select **Enter VR** on Quest. The shortcut **Open Final Demo.cmd** opens this address on the laptop. The [static dashboard](https://rawcdn.githack.com/Omkarreddy143/aham/6c86d47ba8d798922f62a5dcbff712d50487d21b/webxr/index.html) also offers both scenes, but the original game's ESP relay requires the laptop-hosted URL. The static copy has no laptop feedback API.

## Before the judges arrive

1. Prefer the fixed garden link above for this presentation. Alternatively, keep the laptop server/tunnel running long enough for Quest Browser to load the page and open the current HTTPS address saved in `VR-LINK.txt`. The latter exposes the live feedback relay for the original game.
2. Choose **Witness Garden**, optionally select **Hand appearance** (warm, light or deep skin), enable Quest hand tracking, put controllers aside, and select **Enter VR · begin journey**. Sound starts with this press. Music defaults to 70%, guide voice to 95%; both have separate controls before entering. Set a comfortable headset volume. Music automatically softens during speech.
3. Start facing forward. The garden positions itself once relative to the initial headset pose. Hold either hand in view. In chapter one, pinch a floating seed with thumb and index, carry it over the glowing bowl, then open to plant. In chapter two, extend an index finger and draw in the air. In chapter three, hold both open hands close together with a small gap for about one second; a mandala forms and the hand appearance changes.
4. For spectators, use the Quest's existing casting setup if available. The laptop's garden page is a separate **simulated desktop rehearsal**, not a mirror of the headset. Label it accordingly if used as a fallback.
5. The bundled English **AI voice guide** explains each activity and its Tattva connection. Captions appear inside VR. Let the guide speak, or mute it before entering if a teammate will use the script below. The four chapters advance automatically over **180 visible seconds**. NEXT and RESTART are fingertip buttons inside VR. The desktop controls affect only that browser's own journey.

The experience, scenery, synthesized music and bundled narration operate locally after loading. Narration is generated at build time with Microsoft's English neural TTS voice; the browser does not contact a speech service during the presentation. Four clips total about 144 seconds of speech within the 180-second journey, leaving room for each activity. Physical feedback is not needed for this presentation. The firmware and original game remain separate.

The updated garden includes curved banks, trees, rocks, grasses, lilies, gently shaded water, clouds and birds. Its continuous left/right hand meshes follow Quest's 25 joint positions and orientations. **Inspect hands**, **Open hands** and **Close hands** are desktop rehearsal controls; Quest hands always follow actual tracking. The assets are bundled with the scene and carry their MIT license.

## Timed narration — speak while the participant acts

### 0:00–0:45 · Agency: “I act”

**Participant:** Open and close both hands, then pinch a seed, carry it above the bowl and open the pinch. A flower grows over about two seconds.

**Presenter:**

“This is AHAM, our exploration of the sense of ‘I’. Our theme asks us to explore consciousness beyond body and mind through an artificial sense of Self. The Quest cameras estimate the real hand's joints; our WebXR browser scene renders those movements as a virtual hand. No Unity installation is needed. Watch the fingers move together. This is agency: ‘I am causing that action’. We begin with a question: does controlling a virtual hand also make it feel like your hand?”

### 0:45–1:35 · Ownership: “Is this mine?”

**Participant:** Extend an index finger and draw a ribbon of light through the air. The trace gradually fades; touching the lights still creates ripples and chimes.

**Presenter:**

“Now a fingertip event connects the artificial hand to the world through light and sound. The participant sees their movement produce an immediate response. The organizer's phantom-hand idea asks how an event on an artificial hand can become personally meaningful. Agency means ‘I control it’; ownership means ‘it feels like mine’. These can differ. Ask our participant: does this feel like something you control, something you own, both, or neither? Their answer matters more than our assumption. This scene provides visual and auditory cues; it does not claim physical touch.”

### 1:35–2:20 · Identity: “The form changes”

**Participant:** Bring both open hands within about 40 cm, with a gap between the palms, and hold for about one second. A growing mandala marks the gesture and changes the hand's appearance. Separate the hands to repeat. Forms also change automatically every eight seconds in this chapter.

**Presenter:**

“The hand now changes its colour and becomes a transparent wire form, while the participant's real movement continues to control it. The representation is changing. Notice whether the feeling ‘mine’ changes with it. This makes the Tattva visible: the body representation is one layer, and the mind's identification with it is another. The participant can notice both. We built the glove as an additional feedback path and verified all five servos and five vibrators separately on the bench. This final experience focuses on what we can demonstrate clearly: movement, interaction and reflection.”

### 2:20–3:00 · Awareness: “I notice”

**Participant:** Relax the hands and look at the translucent hand, the garden and the closing question.

**Presenter:**

“The Gita expresses the distinction as:

*idaṃ śarīraṃ kaunteya kṣetram ity abhidhīyate; etad yo vetti taṃ prāhuḥ kṣetrajña iti tad-vidaḥ.*

The body is the field; the one who knows it is the knower of the field. Our virtual hand is observed. The thought ‘my hand’ can also be observed. The theme invites us to reflect on the awareness of both. AHAM does not prove consciousness beyond the body or create consciousness in software. It makes the question experiential: when the form and the feeling change, what is aware of that change?”

## The verse and its connection

**Bhagavad Gita 13.2**, using the numbering in the [IIT Kanpur Gita Supersite edition](https://www.gitasupersite.iitk.ac.in/srimad?choose=1&ecsiva=1&etassa=1&field_chapter_value=13&field_nsutra_value=2&language=dv&setgb=1):

> इदं शरीरं कौन्तेय क्षेत्रमित्यभिधीयते।
> एतद्यो वेत्ति तं प्राहुः क्षेत्रज्ञ इति तद्विदः॥

Use the meaning even if Sanskrit recitation is uncomfortable. This is the philosophical interpretation of the experience, not a measured consciousness result.

## If asked about the implementation

“Quest Browser runs JavaScript and Three.js using WebXR hand tracking. Both hands expose up to 25 joint poses. Pinch distance with hysteresis controls carrying a seed; release above the bowl grows a flower. Index extension and motion draw a bounded ribbon, and a stable two-hand gesture forms a mandala. Tracking loss cancels carried seeds and resets gestures. A local 180-second timeline changes the hand materials, voice chapters and in-world prompts. The voice uses bundled MP3s and timed captions; music and chimes use Web Audio. The fixed repository-hosted HTTPS copy runs independently of our laptop tunnel. The original game still computes haptic requests for our separate ESP8266/PCA9685 glove path.”

## Evidence to present accurately

- Team-confirmed earlier: Quest hand tracking and ESP receipt of changing game requests.
- Team-confirmed bench results: all five servo horns moved; all five vibration motors vibrated.
- New garden: desktop rendering, chapter controls and local logic tests checked. A final Quest rehearsal is still required to verify its headset layout, reach and sound.
- Live VR-driven glove feedback and a body-ownership illusion have not been established. Do not describe the bench test as a completed live glove demonstration.

**Closing sentence:** “AHAM connects an artificial body to real action, then asks us to notice the difference between the body, the sense of ‘mine’, and the awareness of both.”
