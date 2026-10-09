# Witness Garden AI voice guide

Four English narration clips use Microsoft's `en-IN-NeerjaNeural` synthesized
voice. No person's voice is cloned or represented as a live speaker. Original
AHAM text gives only brief activity instructions and one reflective question
per chapter. The two-minute demo leaves the Tattva explanation to the presenters.

Generated at build time using [edge-tts](https://github.com/rany2/edge-tts).
The generation script is `tools/generate_garden_voice.py`. `guide.json` stores
the transcript and sentence timestamps received with the audio. MP3 playback
and captions run locally after downloading; the experience makes no speech
service call during a presentation. The built scene needs no Python packages.

The voice is labeled AI in the interface. Music and interaction chimes are
synthesized locally in Web Audio. Music automatically becomes quieter while
narration plays; voice and music have separate volume controls.
