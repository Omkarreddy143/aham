"""Package the confirmed Tattva, spectator cards and team preparation materials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'artifacts/AHAM-Judging-Pack.zip'
names = ['docs/final-demo-3min.md', 'docs/images/witness-garden.jpg', 'docs/images/witness-garden-natural.jpg', 'docs/images/witness-hands-natural.jpg', 'docs/images/witness-garden-guided.jpg', 'docs/images/witness-garden-2min.jpg', 'Open Final Demo.cmd',
         'docs/judging-preparation.md', 'docs/judging-talk.md',
         'docs/tattva-explanation.md', 'docs/judging-cards.html',
         'docs/judging-observations.csv', 'docs/verification.md']
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in names:
        archive.write(root / name, name)
    archive.writestr('START-HERE.txt',
        'AHAM judging preparation: build 25 / experience and impact 25 / Tattva 50\n\n'
        'Confirmed theme: Consciousness is beyond the body and mind.\n'
        'FINAL SUBMISSION: Witness Garden, a two-minute Tattva journey.\n'
        'Start with docs/final-demo-3min.md for the current narration and setup.\n'
        'Open Final Demo.cmd opens the fixed garden build without the laptop tunnel.\n'
        'The dashboard also preserves the original Orbit Foundry game.\n'
        'Team-confirmed: Quest tracking, ESP requests, all five servos and five vibrators in separate bench tests.\n'
        'Live VR-driven physical feedback and body ownership are not established.\n'
        'Earlier judging-preparation/talk documents remain as background planning notes.\n'
        'Read docs/tattva-explanation.md for the shlokas, meanings and sources.\n'
        'Open docs/judging-cards.html in a browser for offline spectator labels, or print it.\n'
        'The cards send no commands and display no live measurements.\n'
        'The CSV is blank: enter only actual observations; do not invent results.\n'
        'The final guide uses four chapters over 120 seconds, with no actuator commands.\n'
        'https://github.com/Omkarreddy143/aham\n')
print(output)
