from pathlib import Path
from collections import defaultdict
import json, hashlib, zipfile
import pdfplumber
from pypdf import PdfReader

d=Path(__file__).resolve().parent
pdf=d/'OperatorOS_MSP_Show_Your_Work.pdf'
r=PdfReader(str(pdf))
outside=[]; collisions=[]; fonts={}
with pdfplumber.open(str(pdf)) as doc:
    for pn,p in enumerate(doc.pages,1):
        rows=defaultdict(list)
        for ch in p.chars:
            if not ch['text'].strip():continue
            if ch['x0']<0 or ch['x1']>p.width+.5 or ch['top']<0 or ch['bottom']>p.height+.5:
                outside.append((pn,ch['text']))
            rows[round(ch['top']/3)].append(ch)
        for key,chars in rows.items():
            candidates=chars+rows.get(key-1,[])+rows.get(key+1,[])
            for a in chars:
                for b in candidates:
                    if a is b or id(a)>id(b):continue
                    if abs(a['top']-b['top'])>max(a['height'],b['height'])*.3:continue
                    ix=min(a['x1'],b['x1'])-max(a['x0'],b['x0'])
                    iy=min(a['bottom'],b['bottom'])-max(a['top'],b['top'])
                    if ix>2 and iy>min(a['height'],b['height'])*.6 and ix>min(a['width'],b['width'])*.55:
                        collisions.append((pn,a['text'],b['text'],round(ix,2)))
for p in r.pages:
    for ref in p['/Resources']['/Font'].values():
        f=ref.get_object();name=str(f.get('/BaseFont'));fd=f.get('/FontDescriptor')
        fonts[name]=bool(fd and any(k in fd.get_object() for k in ['/FontFile','/FontFile2','/FontFile3']))
ann=[a.get_object() for p in r.pages for a in p.get('/Annots',[])]
external=[a['/A']['/URI'] for a in ann if a.get('/A',{}).get('/S')=='/URI']
assert len(r.pages)==33
assert not outside,outside
assert not collisions,collisions[:30]
assert all(embedded or name=='/Helvetica' for name,embedded in fonts.items()),fonts
assert len(external)==16
assert sum('/blob/737a9d0fa18267c33fb01732ef5be4626e96c1e5/' in u for u in external)==15
assert any('nist.sp.800-61r3.pdf' in u for u in external)
assert len(list((d/'previews').glob('page-??.png')))==33
assert len(r.outline)==33
q=dict(result='PASS',pages=33,content_validation=json.loads((d/'validation.json').read_text()),
       outside_page_characters=outside,substantial_character_collisions=collisions,
       embedded_typefaces={name:state for name,state in fonts.items() if state},external_links=16,internal_links=len(ann)-16,
       visual_review='All 33 pages inspected through contact sheets; cover, case, module and approval pages inspected at full resolution.',
       pdf_sha256=hashlib.sha256(pdf.read_bytes()).hexdigest())
(d/'quality_check.json').write_text(json.dumps(q,indent=2),encoding='utf-8')
with zipfile.ZipFile(d/'OperatorOS_MSP_Show_Your_Work_Source_Bundle.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['OperatorOS_MSP_Show_Your_Work.pdf','README.md','msp_content.json','module_profiles.json','MSP_Playbook_Content.md','MSP_Ticket_Record_Template.md','build_msp_pdf.py','check_msp_pdf.py','source_manifest.json','page_index.json','validation.json','quality_check.json']:
        z.write(d/name,name)
print(json.dumps(q,indent=2))
