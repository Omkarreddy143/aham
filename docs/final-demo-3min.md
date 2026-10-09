# AHAM — final two-minute demonstration

Choose **Witness Garden** on the dashboard. The AI voice now gives only brief activity instructions and one question per chapter. **Your team explains the Tattva.** The full journey lasts 120 visible seconds; speech totals about 40 seconds.

[Open Witness Garden](https://rawcdn.githack.com/Omkarreddy143/aham/a6a62029d04cd8a23a72ab4965a4021613491652/webxr/witness.html) or the [two-experience dashboard](https://rawcdn.githack.com/Omkarreddy143/aham/a6a62029d04cd8a23a72ab4965a4021613491652/webxr/index.html). The shortcut **Open Final Demo.cmd** uses the fixed repository-hosted garden. This mode sends no actuator commands; Orbit Foundry's live glove feedback still needs the laptop relay.

## Setup

1. Open the updated HTTPS page in Quest Browser. Enable hand tracking and put controllers aside.
2. Choose a hand appearance, set a comfortable headset volume, then press **Enter VR · begin journey**. Music defaults to 70%, voice to 95%; music softens during speech. Voice/music have separate controls before entering VR.
3. Face forward when starting. The bowl and seeds anchor within reaching distance. NEXT and RESTART are fingertip controls inside VR.
4. Use Quest casting for spectators if available. The laptop page is a separate simulated rehearsal. Its preview buttons demonstrate reactions; they do not control the Quest.
5. The files and voice clips run locally after loading. The timeline and speech pause when the page/session becomes hidden. A final Quest rehearsal is still needed for reach and sound comfort.

## Two-minute sequence

| Time | Participant activity | Brief voice prompt and question |
|---|---|---|
| 0:00–0:35 | Pinch a seed, carry it over the bowl, open to plant a flower. | “Pinch a seed. Carry it over the glowing bowl, then open your fingers to plant it. Does controlling this hand make it yours?” |
| 0:35–1:05 | Extend an index finger and draw light through the air. | “Point your index finger and draw a ribbon of light. Does this feel like your hand, or something you control?” |
| 1:05–1:40 | Bring two open hands close together, with a small gap, and hold for about one second. Separate to repeat. | “Bring both open hands close together and hold. Watch the mandala and your changing hands. When the form changes, does the sense of mine change?” |
| 1:40–2:00 | Rest the hands and observe. | “Let your hands rest. Notice your hand, then the thought, my hand. What is aware of both?” |

Each voice clip lasts about 9–12 seconds and plays once on chapter entry. Captions appear inside VR. The remaining time is for action, reflection and the team's explanation. **Replay chapter guide** is available on the page before entering VR. NEXT can shorten the rehearsal further.

## Presenter cues — explain during the quiet gaps

- **Agency:** Quest cameras estimate hand joints, and WebXR maps them to a virtual hand. The participant causes the movement and the flower growth: “I act.”
- **Ownership:** Control and “this feels like my hand” are different experiences. Ask the participant what they actually feel; do not assume ownership.
- **Identity:** The hand's appearance changes while control continues. Invite the participant to notice whether the sense of “mine” changes.
- **Witness:** The virtual hand is observed, and the thought “my hand” can also be observed. Connect this to the organizers' theme: consciousness beyond identification with body and mind.

Optional closing verse: **Bhagavad Gita 13.2**, using the [IIT Kanpur Gita Supersite numbering](https://www.gitasupersite.iitk.ac.in/srimad?choose=1&ecsiva=1&etassa=1&field_chapter_value=13&field_nsutra_value=2&language=dv&setgb=1):

> इदं शरीरं कौन्तेय क्षेत्रमित्यभिधीयते।
> एतद्यो वेत्ति तं प्राहुः क्षेत्रज्ञ इति तद्विदः॥

Paraphrase: “The body is the field; the one who knows it is the knower.” The prototype invites philosophical reflection; it does not prove consciousness beyond the body or create consciousness in software.

## Implementation and evidence

Three.js and WebXR track up to 25 joints per hand. Pinch distance with hysteresis controls seed carrying; release over the bowl grows a flower. A straight index draws a bounded ribbon. Two open hands held close together charge the mandala. Tracking loss cancels carries and resets gestures. A local 120-second timeline changes hand materials, instructions and bundled AI voice clips with sentence-timed captions. Music/chimes use Web Audio.

The fixed HTTPS garden works independently of the temporary laptop tunnel after loading. No voice-service request is made during the presentation. The original game and ESP8266/PCA9685 feedback path remain separate.

Team-confirmed earlier: Quest tracking and ESP receipt of changing game requests; all five servos and all five vibrators worked in separate bench tests. Live Quest-driven glove feedback and a body-ownership illusion have not been established. New garden gestures, reach and sound still require the headset rehearsal.