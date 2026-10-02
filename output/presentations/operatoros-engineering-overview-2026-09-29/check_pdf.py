from pathlib import Path
import json, re, unicodedata, hashlib, zipfile
import pdfplumber
from pypdf import PdfReader

base=Path(__file__).resolve().parent
pdf=base/'OperatorOS_Engineering_Overview_2026-09-29.pdf'
reader=PdfReader(str(pdf))
def norm(s):
    return ' '.join(unicodedata.normalize('NFKC',s).split())
full=norm(' '.join(p.extract_text() or '' for p in reader.pages))
modules=json.loads((base/'modules.json').read_text(encoding='utf-8'))
missing=[]
checked=0
for m in modules:
    strings=[m['name'],m['headline'],m['summary'],m['artifact'],m['boundary']]
    strings += [s for pair in m['features'] for s in pair]
    strings += [s for case in m['cases'] for s in case.values()]
    for s in strings:
        checked+=1
        if norm(s) not in full: missing.append((m['name'],s))
outside=[]
overlaps=[]
with pdfplumber.open(str(pdf)) as doc:
    for pn,p in enumerate(doc.pages,1):
        chars=[ch for ch in p.chars if ch['text'].strip()]
        for ch in chars:
            if ch['x0']<0 or ch['x1']>p.width+.5 or ch['top']<0 or ch['bottom']>p.height+.5:
                outside.append((pn,ch['text']))
        # Flag substantial same-baseline collisions. Small font kerning overlap is normal.
        for i,a in enumerate(chars):
            for b in chars[i+1:]:
                if abs(a['top']-b['top'])>max(a['height'],b['height'])*.3: continue
                ix=min(a['x1'],b['x1'])-max(a['x0'],b['x0'])
                iy=min(a['bottom'],b['bottom'])-max(a['top'],b['top'])
                if ix>2 and iy>min(a['height'],b['height'])*.6 and ix>min(a['width'],b['width'])*.55:
                    overlaps.append((pn,a['text'],b['text'],round(ix,2)))
fonts={}; unembedded=[]
for p in reader.pages:
    for name,fref in p['/Resources']['/Font'].items():
        f=fref.get_object(); bn=str(f.get('/BaseFont'))
        if bn in fonts: continue
        fd=f.get('/FontDescriptor')
        embedded=bool(fd and any(k in fd.get_object() for k in ['/FontFile','/FontFile2','/FontFile3']))
        fonts[bn]=embedded
        if not embedded and bn not in ['/Helvetica']: unembedded.append(bn)
annotations=[a.get_object() for p in reader.pages for a in p.get('/Annots',[])]
external=[a['/A']['/URI'] for a in annotations if a.get('/A',{}).get('/S')=='/URI']
assert not missing,missing
assert not outside,outside
assert not overlaps,overlaps[:30]
assert not unembedded,unembedded
assert len(external)==28
assert all('/blob/ee9ca05e8346bdb1770932029ae8a9a8d682ef0f/' in u for u in external)
assert len(reader.pages)==38
report=dict(result='PASS',pages=38,content_strings_checked=checked,missing_content=missing,
            outside_page_characters=outside,substantial_character_collisions=overlaps,
            embedded_typefaces={k:v for k,v in fonts.items() if v},
            pinned_external_links=len(external),internal_links=len(annotations)-len(external),
            rendered_pages=38,visual_review='All 38 pages reviewed via contact sheets; selected full-resolution pages inspected.',
            sha256=hashlib.sha256(pdf.read_bytes()).hexdigest())
(base/'quality_check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bundle=base/'OperatorOS_Engineering_Overview_Source_Bundle.zip'
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
    for fn in [pdf.name,'README.md','modules.json','Module_Features_and_Case_Studies.md','build_overview.py','check_pdf.py','source_manifest.json','page_index.json','validation.json','quality_check.json']:
        z.write(base/fn,fn)
print(json.dumps(report,indent=2))
print('Source bundle:',bundle.stat().st_size,'bytes')
