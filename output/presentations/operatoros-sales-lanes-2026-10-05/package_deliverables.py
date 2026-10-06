from pathlib import Path
import json, hashlib, zipfile, shutil
from deck_content import DECKS, COMMON_SOURCES

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
sourcepaths=sorted(set(COMMON_SOURCES+[s for d in DECKS for s in d['extra_sources']]))
source_manifest={
 'prepared':'2026-10-05','source_commit':'62fb640c',
 'scope':'Three sales lane decks; source-supported features, illustrative scenarios, no universal deployment acceptance claim.',
 'pricing_observation':'Public page and rendered browser showed dynamic Price unavailable fields on 2026-10-05. Base prices are not printed on buyer slides.',
 'web_sources':['https://operatoros.net/pricing']+['https://operatoros.net/for/'+d['lane'] for d in DECKS],
 'sources':[{'path':p,'sha256':hashlib.sha256((REPO/p).read_bytes()).hexdigest()} for p in sourcepaths],
 'images':[{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'assets').glob('*.png'))],
 'visual_acceptance':{'all_pdf_pages_rendered':60,'all_contact_sheets_reviewed':True,'representative_full_size_pages_reviewed':True,
                      'native_powerpoint_rendered':False,'native_powerpoint_limitation':'PowerPoint/LibreOffice rendering engine not installed. Editable structures, XML, geometry and notes validated; matching PDF is visual reference.'},
}
(ROOT/'source_manifest.json').write_text(json.dumps(source_manifest,indent=2),encoding='utf-8')

readme='''# OperatorOS sales decks — 5 October 2026

Three distinct widescreen sales presentations: TradeFlowKit, TechDeck and PulseDesk.

- Each deck: 20 slides / 17-slide main pitch + 3 hidden PowerPoint appendix slides.
- PPTX: editable native text, shapes and diagrams, with speaker notes on all slides.
- PDF: matching fixed layout, embedded fonts, clickable calls to action and page bookmarks.
- All scenarios are illustrative. No fabricated clients, ROI, testimonials or certification claims.
- Use Sales_Meeting_Playbook.md for discovery, a short meeting route and demo preparation.
- Current base pricing needs quote verification; the public dynamic prices were unavailable during review.

Use the PDF when predictable visual rendering matters. The PPTX is editable; Segoe UI and Consolas are the design fonts. The PDF and PPTX are produced from the same master layout rather than a desktop PowerPoint export. See quality_check.json and the playbook for validation scope.

Rebuild with Python 3 and python-pptx, reportlab, Pillow, pypdf and pypdfium2. The generator reads Segoe UI / Consolas from C:/Windows/Fonts. Run build_decks.py then validate_decks.py. Presentation assets are included. package_deliverables.py additionally uses the canonical repository to refresh source hashes.

The sales kit ZIP contains all six presentation files plus presenter notes and the playbook. The separate source ZIP contains content, generation scripts, assets, layout/source manifests and the quality record. Nothing is published or sent externally.
'''
(ROOT/'README.md').write_text(readme,encoding='utf-8')

sales=[p for p in ROOT.iterdir() if p.suffix in ['.pdf','.pptx'] or p.name.endswith('_Presenter_Notes.md')]
sales += [ROOT/'Sales_Meeting_Playbook.md',ROOT/'README.md',ROOT/'OperatorOS_Sales_Decks_Preview.jpg']
with zipfile.ZipFile(ROOT/'OperatorOS_Three_Lane_Sales_Kit.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sales:z.write(p,p.name)

sources=[p for p in ROOT.iterdir() if p.suffix in ['.py','.json','.md']]+list((ROOT/'assets').glob('*'))
with zipfile.ZipFile(ROOT/'OperatorOS_Sales_Decks_Editable_Source.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sources:z.write(p,str(p.relative_to(ROOT)))

files=[p for p in ROOT.iterdir() if p.suffix in ['.pdf','.pptx','.zip']]
summary=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
(ROOT/'delivery_manifest.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
