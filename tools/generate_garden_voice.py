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
    "Pinch a seed. Carry it over the glowing bowl, then open your fingers to plant it. Does controlling this hand make it yours?",
    "Point your index finger and draw a ribbon of light. Does this feel like your hand, or something you control?",
    "Bring both open hands close together and hold. Watch the mandala and your changing hands. When the form changes, does the sense of mine change?",
    "Let your hands rest. Notice your hand, then the thought, my hand. What is aware of both?",
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
