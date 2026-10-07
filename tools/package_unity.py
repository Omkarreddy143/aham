"""Build a Unity Assets import ZIP with stable .meta GUIDs; no Unity installation required."""
from pathlib import Path
import uuid
import zipfile

root = Path(__file__).resolve().parents[1]
asset = root / 'unity' / 'Assets' / 'AHAM'
for path in [asset] + sorted(asset.rglob('*')):
    if path.suffix == '.meta':
        continue
    relative = path.relative_to(root / 'unity').as_posix()
    guid = uuid.uuid5(uuid.NAMESPACE_URL, 'aham:' + relative).hex
    meta = path.with_name(path.name + '.meta')
    if meta.exists():
        continue
    body = 'fileFormatVersion: 2\nguid: ' + guid + '\n'
    if path.is_dir():
        body += 'folderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData:\n  assetBundleName:\n  assetBundleVariant:\n'
    elif path.suffix == '.cs':
        body += 'MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n  userData:\n  assetBundleName:\n  assetBundleVariant:\n'
    meta.write_text(body)
output = root / 'artifacts' / 'AHAM-Unity-Starter.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(asset.with_name('AHAM.meta'), 'AHAM.meta')
    for path in sorted(asset.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(root / 'unity' / 'Assets').as_posix())
    archive.write(root / 'docs' / 'quickstart.md', 'AHAM/QUICKSTART.md')
    archive.write(root / 'docs' / 'hardware-bringup.md', 'AHAM/hardware-bringup.md')
    archive.write(root / 'docs' / 'index-finger-mvp.md', 'AHAM/index-finger-mvp.md')
    archive.write(root / 'docs' / 'index-finger-step-by-step.md', 'AHAM/index-finger-step-by-step.md')
print(output)
