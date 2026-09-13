"""Read tracked source inventory; inventory coverage is not semantic review coverage."""
import csv, hashlib, json, subprocess
from pathlib import Path

root = Path('C:/Dev/OperatorOS')
out = Path(__file__).parent
paths = subprocess.check_output(['git', 'ls-files'], cwd=root, text=True).splitlines()
exts = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.ps1', '.sh', '.css', '.sql'}
rows = []
for name in paths:
    path = root / name
    if path.suffix not in exts or not path.is_file():
        continue
    content = path.read_bytes()
    category = ('quarantined-import' if name.startswith('apps/modules/') else
                'api' if name.startswith('apps/api/src/') else
                'web' if name.startswith('apps/web/src/') else
                'native' if name.startswith('apps/torqueshed-native/') else
                'runner' if name.startswith('apps/runner-gateway/') else
                'packages' if name.startswith('packages/') else
                'tests' if '/test/' in name or '/e2e/' in name else
                'scripts' if name.startswith('scripts/') else 'other')
    rows.append(dict(path=name, category=category, lines=len(content.splitlines()),
                     bytes=len(content), sha256=hashlib.sha256(content).hexdigest(),
                     review_level='inventory only; see report for traced paths'))
with (out / 'source-inventory.csv').open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader(); writer.writerows(rows)
summary = {k: dict(files=sum(r['category'] == k for r in rows),
                  lines=sum(r['lines'] for r in rows if r['category'] == k))
           for k in sorted({r['category'] for r in rows})}
(out / 'inventory-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
print('Largest active source files:')
print(json.dumps(sorted([r for r in rows if r['category'] in ['api','web','native','runner','packages']],
                        key=lambda r:r['lines'], reverse=True)[:18], indent=2))
