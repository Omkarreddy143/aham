"""Optional build-time narration generation; playback needs no online speech service.

Install edge-tts in .build/voice-tools or your own Python environment before use.
Only the public narration below is sent to Microsoft's online TTS service.
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.build/voice-tools'))
import edge_tts

CHAPTERS = [
    "Welcome to Aham, the Witness Garden. Our theme asks us to explore the sense of self in body and mind. Move your hands. This digital hand follows your intention. Pinch a floating seed between thumb and index finger. Carry it over the glowing bowl, then open your fingers. Watch a flower grow. You chose an action, and the world answered. This is agency: the feeling that I act. Does control alone make this hand yours?",
    "Now point with your index finger and move it slowly. A ribbon of light follows your movement. We often say, my hand, my action, my thought. Agency means I control it. Body ownership means it feels like part of me. They are related, but they are different experiences. Follow your light trail. Notice the hand you see, the intention to move, and the thought that calls it mine. Which of these can you observe?",
    "Bring both open hands close together, with a little space between them. Hold for a moment. A mandala forms between your palms. Your virtual hands change their appearance, yet you can still guide them. Is the sense of mine attached to the colour, the shape, or the movement? This scene invites a question about identity. When the representation changes, what remains familiar? Separate your hands, and try the gesture again.",
    "Let your hands open and rest. The petals settle. Notice a sensation. Now notice a thought about that sensation. In the Bhagavad Gita, the body is described as the field, and the one who knows it as the knower. Our Tattva invites reflection on awareness beyond identification with body and mind. This prototype does not prove a theory of consciousness. It makes a changing body and a changing experience visible. What is aware of both?",
]

async def main():
    output = ROOT / 'webxr/assets/narration'
    output.mkdir(parents=True, exist_ok=True)
    chapters = []
    for index, text in enumerate(CHAPTERS):
        captions = []
        # Sentence timestamps come from the same audio stream, rather than guesses.
        communicate = edge_tts.Communicate(text, 'en-IN-NeerjaNeural', rate='-4%', boundary='SentenceBoundary')
        with (output / f'chapter-{index}.mp3').open('wb') as audio:
            async for chunk in communicate.stream():
                if chunk['type'] == 'audio':
                    audio.write(chunk['data'])
                elif chunk['type'] == 'SentenceBoundary':
                    captions.append({'start':chunk['offset']/10_000_000,
                                     'end':(chunk['offset']+chunk['duration'])/10_000_000,
                                     'text':chunk['text']})
        chapters.append({'file':f'./assets/narration/chapter-{index}.mp3', 'text':text, 'captions':captions})
        print(f'Chapter {index+1}: {len(captions)} captions, ends {captions[-1]["end"]:.1f}s', flush=True)
    (output / 'guide.json').write_text(json.dumps({'voice':'Microsoft en-IN-NeerjaNeural (AI synthesized)', 'chapters':chapters}, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    asyncio.run(main())
