"""Package tracked working-tree source without nesting generated artifacts."""
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
tracked = subprocess.run(
    ['git', 'ls-files', '-z'], cwd=root, check=True, stdout=subprocess.PIPE
).stdout.decode('utf-8').split('\0')
output = root / 'artifacts' / 'AHAM-Starter.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(tracked):
        if not name or name.startswith('artifacts/'):
            continue
        path = root / name
        if path.is_file():
            archive.write(path, name)
print(output)
