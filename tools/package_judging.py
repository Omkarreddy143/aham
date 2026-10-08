"""Package the confirmed Tattva, spectator cards and team preparation materials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'artifacts/AHAM-Judging-Pack.zip'
names = ['docs/judging-preparation.md', 'docs/judging-talk.md',
         'docs/tattva-explanation.md', 'docs/judging-cards.html',
         'docs/judging-observations.csv', 'docs/verification.md']
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in names:
        archive.write(root / name, name)
    archive.writestr('START-HERE.txt',
        'AHAM judging preparation: build 25 / experience and impact 25 / Tattva 50\n\n'
        'Confirmed theme: Consciousness is beyond the body and mind.\n'
        'Current output: actual Quest tracking and ESP request receipts; no verified physical haptics.\n'
        'Start with docs/judging-preparation.md, then rehearse docs/judging-talk.md.\n'
        'Read docs/tattva-explanation.md for the shlokas, meanings and sources.\n'
        'Open docs/judging-cards.html in a browser for offline spectator labels, or print it.\n'
        'The cards send no commands and display no live measurements.\n'
        'The CSV is blank: enter only actual observations; do not invent results.\n'
        'No presentation duration is assumed. No hardware/settings/website changes are needed.\n'
        'https://github.com/Omkarreddy143/aham\n')
print(output)
