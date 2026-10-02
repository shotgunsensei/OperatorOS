"""OperatorOS MSP accountability briefing. Artifact generation only."""
from pathlib import Path
import json, math, hashlib, re, unicodedata, zipfile
from html import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import Image,ImageDraw

D=Path(__file__).resolve().parent
ROOT=D.parents[2]
PDF=D/'OperatorOS_MSP_Show_Your_Work.pdf'
REV='737a9d0fa18267c33fb01732ef5be4626e96c1e5'
content=json.loads((D/'msp_content.json').read_text(encoding='utf-8'))
profile_path=D/'module_profiles.json'
if profile_path.exists():
    mods=json.loads(profile_path.read_text(encoding='utf-8'))
else:
    source=D.parent/'operatoros-engineering-overview-2026-09-29/modules.json'
    mods=json.loads(source.read_text(encoding='utf-8'))
    for m in mods:
        m.update(content['profiles'][m['slug']])
    td=next(m for m in mods if m['slug']=='techdeck')
    td['features'][-1]=['Protected reports and audit','Use tenant-scoped report snapshots, private attachments, audited source downloads, and current source-access controls.']
    profile_path.write_text(json.dumps(mods,indent=2),encoding='utf-8')
for m in mods:
    m.update(content['profiles'][m['slug']])
profile_path.write_text(json.dumps(mods,indent=2),encoding='utf-8')
ORDER=['techdeck','snapproofos','ninjamation','faultlinelab','tradeflowkit','pulsedesk','callcommand-ai','brandforgeos','ninja-launch-kit','studyforge-ai','torqueshed','ninja-pool-hall','outcall']
mods=sorted(mods,key=lambda m:ORDER.index(m['slug']))
SOURCES=[
 ('R01','Current product catalog','packages/sdk/src/catalog.ts','Application names, hierarchy, access classification, and OutCall availability.'),
 ('R02','Product outcomes and service limits','packages/sdk/src/product-value.ts','Current module outcomes, integrations, exclusions, and manual/provider boundaries.'),
 ('R03','MSP Resolution Closeout Prompt','docs/prompts/MSP_RESOLUTION_CLOSEOUT_PROMPT.md','Whole-incident chronology, failures, side effects, confidence, validation, and no invented facts.'),
 ('R04','Resolution Intelligence API','docs/techdeck/resolution-intelligence-api.md','Screened import, immutable revisions, explicit mapping, audited raw reads, and exact/text retrieval.'),
 ('R05','Resolution Intelligence data model','docs/techdeck/resolution-intelligence-data-model.md','Source hashes, action/validation records, claim kind, confidence, and typed evidence relationships.'),
 ('R06','Evidence-derived documents','docs/techdeck/resolution-intelligence-documents.md','Cited draft assembly, inherited source access, review, and stale-source protections.'),
 ('R07','Script Ops implementation','apps/api/src/routes/ninjamation-routes.ts','Exact-version approval, critical static findings, current approved downloads, and audit boundaries.'),
 ('R08','Registered module handoffs','docs/CROSS_MODULE_READINESS_REPORT.md','Supported source/destination pairs, current access, source freshness, and deduplication.'),
 ('R09','Identity and tenant authority','docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md','Shared authority, exact-host sessions, tenant enforcement, and module role ceilings.'),
 ('R10','SnapProofOS evidence implementation','apps/api/src/routes/snapproofos-routes.ts','Tenant-scoped cases, evidence, hash-linked custody, report lifecycle, and controls.'),
 ('R11','Core and companion commerce','packages/sdk/src/products.ts','Selected core, companion selection, separate grants, and seat model; no pricing quote in this brief.'),
 ('R12','Current release gate','docs/CURRENT_RELEASE_GATE.md','Recorded v65 publication; semantic provider remains disabled and authenticated v65 acceptance is pending.'),
 ('R13','Semantic-search boundary','docs/techdeck/resolution-intelligence-semantic-search.md','Explicit opt-in, disabled activation, excerpt review, limits, and exact/text fallback.'),
 ('R14','SnapProofOS current capability matrix','docs/modules/snapproofos/PARITY_MATRIX.md','Field work, approved PDF/DOCX reports, controlled shares, custody, and retention scope.'),
 ('R15','Current module parity index','docs/modules/MODULE_PARITY_INDEX.md','Current overlays and limitations; historical implementation records do not grant live acceptance.'),
 ('N01','NIST SP 800-61r3 · April 2025','https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-61r3.pdf','Printed page 29: RS.AN-06 and RS.AN-07 address action records, integrity, provenance, controlled access, and preservation. No product endorsement implied.')
]
base_url=f'https://github.com/shotgunsensei/OperatorOS/blob/{REV}/'
manifest=[]
for sid,title,path,note in SOURCES:
    external=path.startswith('https://')
    manifest.append(dict(id=sid,title=title,path=path,url=path if external else base_url+path,
                         sha256=None if external else hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),note=note))
(D/'source_manifest.json').write_text(json.dumps(dict(source_commit=REV,review_date='2026-09-29',sources=manifest),indent=2),encoding='utf-8')
W,H=1200,750
BG='#07101B'; PANEL='#101E2D'; BORDER='#273B4E'; WHITE='#F5F9FC'; GRAY='#AFC0CE'; CYAN='#30D6FF'; AMBER='#F6BE62'; GREEN='#58DDB2'
PAPER='#F1F5F9'; INK='#132D44'; MUTED='#49647B'
for name,fn in [('Body','segoeui.ttf'),('Bold','segoeuib.ttf'),('Light','segoeuil.ttf'),('Mono','consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/fn)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')
c=canvas.Canvas(str(PDF),pagesize=(W,H),pageCompression=1)
c.setTitle('OperatorOS | Show Your Work: The MSP Accountability Playbook')
c.setAuthor('Shotgun Ninjas Productions, LLC')
c.setSubject('How an MSP uses OperatorOS to cover its ass: scope, decisions, actions, evidence, verification, and handoffs.')
c.setViewerPreference('DisplayDocTitle','true'); c.showOutline()
page=0; index=[]; text_items=[]

def box(x,y,w,h,fill=PANEL,stroke=None,r=0):
    c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke or fill))
    if r: c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=bool(stroke))
    else:c.rect(x,H-y-h,w,h,fill=1,stroke=bool(stroke))
def line(x,y,xx,yy,col=BORDER,th=1):
    c.setStrokeColor(HexColor(col));c.setLineWidth(th);c.line(x,H-y,xx,H-yy)
def txt(s,x,y,size=14,col=WHITE,font='Body',align='left'):
    c.setFont(font,size);c.setFillColor(HexColor(col)); ww=pdfmetrics.stringWidth(s,font,size)
    startx=x-ww if align=='right' else x-ww/2 if align=='center' else x
    if startx<0 or startx+ww>W+1:raise ValueError((page,'text overflow',s))
    c.drawString(startx,H-y-size*.84,s)
    text_items.append(dict(page=page,text=s,x=startx,y=y,w=ww,h=size,kind='text'))
def p(s,x,y,w,size=15,col=GRAY,leading=None,font='Body',maxh=120):
    q=Paragraph(s,ParagraphStyle('x',fontName=font,fontSize=size,leading=leading or size*1.36,textColor=HexColor(col)))
    qw,qh=q.wrap(w,H)
    if qh>maxh+.2 or y+qh>H-39:raise ValueError((page,'paragraph overflow',qh,maxh,s[:110]))
    q.drawOn(c,x,H-y-qh)
    text_items.append(dict(page=page,text=re.sub('<[^>]+>','',s),x=x,y=y,w=qw,h=qh,kind='paragraph'))
    return qh
def arrow(x,y,xx,yy,col=CYAN):
    line(x,y,xx,yy,col,1.5);a=math.atan2(yy-y,xx-x)
    for d in [-.5,.5]:line(xx-8*math.cos(a+d),yy-8*math.sin(a+d),xx,yy,col,1.5)
def chip(s,x,y,col=CYAN,dark=True):
    ww=pdfmetrics.stringWidth(s,'Mono',10)+22;box(x,y,ww,23,PANEL if dark else '#DFE8F0',r=4);txt(s,x+11,y+6,10,col if dark else INK,'Mono');return ww
def start(title,section,dark=True,mark=None):
    global page
    page+=1;box(0,0,W,H,BG if dark else PAPER);box(0,0,7,H,CYAN if dark else INK)
    txt('OPERATOROS',54,25,11,WHITE if dark else INK,'Bold');txt('MSP / SHOW YOUR WORK',220,28,9,GRAY if dark else MUTED,'Mono')
    txt(section.upper(),1146,28,9,GRAY if dark else MUTED,'Mono','right');line(54,53,1146,53,BORDER if dark else '#CFDBE5')
    txt('SHOTGUN NINJAS PRODUCTIONS, LLC',54,726,8,GRAY if dark else MUTED,'Mono')
    txt('ENGINEERING BRIEF  /  29 SEP 2026',600,726,8,GRAY if dark else MUTED,'Mono','center')
    txt(f'{page:02}',1146,721,14,WHITE if dark else INK,'Mono','right')
    key=mark or f'p{page}';c.bookmarkPage(key);c.addOutlineEntry(title,key,0,False);index.append(dict(page=page,title=title,bookmark=key))
def title(kicker,heading,sub=None,dark=True):
    txt(kicker.upper(),54,82,10,CYAN if dark else MUTED,'Mono')
    txt(heading,54,109,37,WHITE if dark else INK,'Bold')
    if sub:p(sub,54,163,1092,14,GRAY if dark else MUTED,maxh=60)
def ref(ids,dark=True):
    txt('BASIS',54,698,8,GRAY if dark else MUTED,'Mono');x=99
    for sid in ids:
        txt(sid,x,698,8.5,CYAN if dark else '#08769A','Mono')
        ww=pdfmetrics.stringWidth(sid,'Mono',8.5)
        c.linkAbsolute('Source register','sources',Rect=(x,H-711,x+ww,H-696),thickness=0);x+=ww+14
def finish():c.showPage()
def block(head,body,x,y,w,col=CYAN,dark=True):
    line(x,y,x+35,y,col,3);txt(head,x,y+15,17,WHITE if dark else INK,'Bold');p(body,x,y+45,w,13.5,GRAY if dark else MUTED,maxh=105)
def bullet_list(items,x,y,w,size=13.5,col=GRAY,spacing=19):
    yy=y
    for b in items:
        box(x,yy+6,4,4,CYAN);hh=p(escape(b),x+15,yy,w-15,size,col,maxh=58);yy+=hh+spacing
    return yy

# 1. New narrative cover.
start('Show your work','The MSP accountability playbook',mark='cover')
txt('HOW CAN I USE OPERATOROS TO',54,100,13,CYAN,'Mono')
txt('COVER MY ASS?',54,127,30,WHITE,'Bold')
for s,y in [('SHOW',204),('YOUR',291),('WORK.',378)]:txt(s,48,y,86,WHITE,'Bold')
p('When the client asks what happened, answer with a record of scope, decisions, actions, evidence, and verification.',54,508,546,19,GRAY,maxh=106)
txt('John Travis Williams Jr.',54,644,13,WHITE,'Bold');txt('Built for engineers, service leads, and MSP owners.',54,668,11,GRAY)
# Deliberate vector evidence orbit, not a product UI screenshot.
cx,cy=903,369
for rad in [110,159,214]:
    c.setStrokeColor(HexColor('#183850'));c.setLineWidth(1);c.circle(cx,H-cy,rad,stroke=1,fill=0)
for k in range(60):
    a=k*math.pi/30;ri=218 if k%5 else 212;ro=222
    line(cx+ri*math.cos(a),cy+ri*math.sin(a),cx+ro*math.cos(a),cy+ro*math.sin(a),'#235369',1)
labels=[('SCOPE',-90),('DECISIONS',-30),('ACTIONS',30),('VALIDATION',90),('OPEN RISK',150),('SOURCES',210)]
for s,degrees in labels:
    a=math.radians(degrees);x=cx+174*math.cos(a);y=cy+174*math.sin(a)
    line(cx+85*math.cos(a),cy+85*math.sin(a),x,y,'#2B6981',1)
    c.setFillColor(HexColor(CYAN));c.circle(x,H-y,5,fill=1,stroke=0)
    w=pdfmetrics.stringWidth(s,'Mono',10)+22;box(x-w/2,y-36,w,23,PANEL,r=4);txt(s,x,y-29,10,CYAN,'Mono','center')
box(cx-90,cy-52,180,104,'#112B3D','#36768E',8)
txt('RECONSTRUCT',cx,cy-23,18,WHITE,'Bold','center');txt('THE RECORD',cx,cy+9,14,CYAN,'Mono','center')
chip('6 DISPUTE SCENARIOS',719,634);chip('13 MODULE PROFILES',942,634)
finish()

# 2. Direct answer.
start('The direct answer','01 / The MSP value')
title('The answer in one sentence','Make your work explainable under pressure.',
      'Use OperatorOS to retain a factual chain from the request and scope to the action, result, remaining risk, and next owner. A reviewer should be able to reconstruct that chain without the original technician.')
for i,(head,body) in enumerate([
 ('What we knew','Client and asset context, symptoms, baseline evidence, prior work, and the limits of what was known.'),
 ('What we were asked to do','The actual request, authorization source, permitted scope, exclusions, window, and approved variations.'),
 ('What we actually did','Named actors, procedure/script versions, chronology, outputs, failures, side effects, and recovery.'),
 ('What we verified','Specific checks, actual results, expected outcomes, pending validation, and the next responsible owner.')]):
    x=54+i*281;txt(f'0{i+1}',x,255,45,CYAN,'Light');p(head,x,317,251,20,WHITE,font='Bold',maxh=64);p(body,x,395,247,14.5,GRAY,maxh=120)
box(54,580,1092,77,PANEL,r=5)
p('<b>The practical stack:</b> TechDeck for technical history; SnapProofOS for reviewed proof; Script Ops for exact-version script governance; FaultlineLab for lessons that become training. Actual module access must be granted.',74,598,1052,15,WHITE,maxh=50)
ref(['R02','R03','R11']);finish()

# 3. Dispute-to-record map.
start('Questions a record must answer','02 / When the questions start',False)
title('Start with the dispute','Know which record you need to retrieve.',
      'A defensible operational answer separates the source fact from interpretation, internal approval, customer response, and uncompleted work.',False)
rows=[
 ('“You broke it.”','Baseline → exact action → post-change checks','TechDeck + external execution evidence'),
 ('“You never warned us.”','Recommendation version → actual response → follow-up','TechDeck + original communication source'),
 ('“We did not authorize that.”','Specific scope/window → authorizing response → actual action','Client approval process + TechDeck / Script Ops'),
 ('“Nobody tested it.”','Defined test → observed result → untested remainder','Resolution Intelligence + retained test output'),
 ('“Nobody told the next tech.”','Chronology → failed steps → current state → owner','TechDeck + handoff acknowledgement'),
 ('“What did you do for this invoice?”','Scope → work capture → report → commercial reference','SnapProofOS + entitled TradeFlowKit or existing PSA')]
for i,(q,record,where) in enumerate(rows):
    yy=236+i*66
    txt(q,54,yy,16,INK,'Bold');p(record,432,yy,714,13,INK,maxh=36);txt(where,432,yy+28,11,MUTED)
    line(54,yy+53,1146,yy+53,'#CFDBE5')
p('The useful outcome is a clear reconstruction, including evidence of an MSP mistake when that is what happened. Selective closeouts weaken the record.',54,651,1092,12.5,INK,maxh=28)
ref(['R03','R04','R07','R14'],False);finish()

# 4. Evidence layers.
start('How a defensible record is assembled','03 / Evidence architecture')
title('From observed work to a reviewed explanation','Keep the source behind the summary.',
      'OperatorOS can organize accepted evidence and its provenance. It cannot manufacture missing authorization, endpoint telemetry, client acknowledgement, or historical facts.')
steps=[('01','Original work','Logs, outputs, photos, request, real responses','Your authorized tools + channels'),('02','Accepted source','Screened import, immutable revision, content hash','TechDeck Resolution Intelligence'),('03','Structured context','Actions, failures, identifiers, validation, relationships','Tenant-scoped projection + search'),('04','Reviewed output','Cited internal guidance or approved customer proof','TechDeck / SnapProofOS review')]
for i,(n,head,body,where) in enumerate(steps):
    x=54+i*281;box(x,256,249,213,PANEL,BORDER,5);txt(n,x+17,276,29,CYAN,'Light');txt(head,x+17,321,18,WHITE,'Bold');p(body,x+17,357,215,13.5,GRAY,maxh=75);p(where,x+17,431,215,10,CYAN,font='Mono',maxh=30)
    if i<3:arrow(x+252,357,x+273,357)
block('Platform guardrails','Exact-host SSO; server-resolved tenant, role, and module access; scoped records; auditable decisions.',54,527,324)
block('Provenance limits','A stored hash supports integrity checking of retained bytes. It does not establish that the original observation was true.',436,527,326,AMBER)
block('Evidence handling','Protect originals and sensitive context. Record collection time and event time separately when known; retain source timezone.',818,527,328)
ref(['R04','R05','R06','R09','N01']);finish()

# 5. Before/during/after SOP.
start('The daily MSP workflow','04 / How to use it')
title('A proposed team operating procedure','Capture while working. Review before closing.',
      'This procedure combines built-in capabilities with deliberate technician actions. It is a recommended operating pattern, not a claim that every step is automatically enforced.')
phases=[('BEFORE','Establish scope and state',[
 'Open the correct client/ticket/asset context in TechDeck.',
 'Attach or reference the actual authorization; record action, window, exclusions, and rollback.',
 'Capture baseline checks and pre-existing faults.',
 'If using a script, identify its approved exact version.']),('DURING','Record the actual sequence',[
 'Use the separately authorized execution tool.',
 'Preserve meaningful outputs, time/timezone, actor, and affected system.',
 'Keep failed attempts, side effects, recovery, and deviations.',
 'Pause and escalate when the work exceeds its authority.']),('AFTER','Close only what you can substantiate',[
 'Run defined checks; distinguish success, failure, and pending work.',
 'Use the Ticket Completion Prompt with approved source context; review its result.',
 'Validate and import the supported export in Resolution Intelligence.',
 'Assign follow-ups; review customer proof and keep actual delivery/response records.'])]
for i,(lab,head,items) in enumerate(phases):
    x=54+i*374;chip(lab,x,235);p(head,x,280,337,22,WHITE,font='Bold',maxh=64);bullet_list(items,x,362,335,13.6,spacing=17)
ref(['R03','R04','R07','R14']);finish()

# 6. Approval semantics.
start('Five different decisions','05 / Authority is specific',False)
title('Do not collapse these into “approved”','Five decisions. Five different meanings.',
      'Attach the actual source of permission when the system stores a record of an external decision. Internal workflow status cannot substitute for that source.',False)
decisions=[('Product access','OperatorOS session, tenant, role, entitlement','The user may use the granted product surface.','Permission to change a client production system.'),('Script approval','Script Ops exact-version review','This reusable source revision passed the internal process.','Authorization to execute it for this client now.'),('Client work authorization','Your approved client/change-control process','The retained source describes who authorized what and when.','A scope expansion inferred from admin access.'),('Report approval','SnapProofOS report review','The internal reviewer approved the selected report snapshot.','Customer receipt, acceptance, payment, or waiver.'),('Client acknowledgement','Actual reply/acceptance source you retain','A person made the statement recorded by that source.','Automatic proof that all risks or obligations were resolved.')]
for i,(what,where,means,notmeans) in enumerate(decisions):
    y=230+i*84
    txt(f'0{i+1}',54,y+1,20,'#08779D','Mono');txt(what,105,y,17,INK,'Bold');p(where,105,y+28,252,11,MUTED,maxh=36)
    p('<b>Establishes:</b> '+means,390,y,353,12.2,INK,maxh=65);p('<b>Does not establish:</b> '+notmeans,785,y,361,12.2,MUTED,maxh=65)
    line(54,y+72,1146,y+72,'#CFDBE5')
ref(['R07','R09','R14'],False);finish()

# 7. Worked synthetic closeout.
start('A closeout that survives review','06 / Worked record example')
title('Synthetic example / no real customer data','Write the facts that let someone reconstruct it.',
      'Use the canonical closeout structure to preserve failed work, uncertainty, and remaining validation. The entries below are illustrative technician records, not captured production events.')
box(54,235,329,398,'#262337','#55485E',6);txt('WEAK CLOSEOUT',73,257,10,AMBER,'Mono')
p('“Restarted service.<br/>Everything is fixed.”',73,297,291,25,WHITE,font='Bold',maxh=100)
bullet_list(['No affected asset or scope.','No baseline or exact action.','No test result or evidence reference.','No failed attempt or side effect.','No owner for remaining validation.'],73,425,284,13,GRAY,15)
txt('A MORE USEFUL RECORD',426,242,10,CYAN,'Mono')
entries=[('CONTEXT','LAB-APP-07 / synthetic tenant; approved service restart within the referenced maintenance window.'),('OBSERVED','09:12 EDT: health check failed before work. Preserve the original output and its collection source.'),('ACTION + FAILURE','09:18: restart attempted; process returned, but the transaction check still failed. Retain both results.'),('VALIDATION','09:26: diagnostic endpoint passed. Full user transaction and overnight stability remain unverified.'),('CURRENT STATE','Service available for the tested path. Root-cause hypothesis remains unconfirmed; record the basis separately.'),('FOLLOW-UP','Assigned engineer to perform the specified transaction check at the agreed time; escalate if failure repeats.')]
for i,(head,body) in enumerate(entries):
    yy=270+i*60;txt(head,426,yy,9,CYAN,'Mono');p(body,567,yy-1,579,12.8,GRAY,maxh=45)
p('A good closeout may show that the work is incomplete. That distinction is part of its value.',54,657,1092,14,WHITE,maxh=28)
ref(['R03','R04','R05']);finish()

# 8–13. Six detailed, clearly synthetic cases.
for case in content['cases']:
    start('Case '+case['id']+' / '+case['quote'],case['category'],False,mark='case'+case['id'])
    txt('ILLUSTRATIVE CASE STUDY '+case['id'],54,81,10,MUTED,'Mono')
    txt('“'+case['quote']+'”',54,108,33,INK,'Bold')
    txt(case['title'],54,157,20,'#08799B','Light')
    p(escape(case['situation']),54,199,727,13.5,MUTED,maxh=69)
    box(842,105,304,520,'#E1EAF1',r=6)
    txt('RETRIEVE THESE RECORDS',861,127,10,INK,'Mono')
    yy=167
    for i,r in enumerate(case['records']):
        txt(str(i+1).zfill(2),861,yy,10,'#08799B','Mono');hh=p(escape(r),892,yy-2,231,13,INK,maxh=57);yy+=max(51,hh+15)
    line(862,450,1126,450,'#BECCD9');txt('PILOT CHECK',861,469,9,MUTED,'Mono');p(escape(case['measure']),861,492,263,12.4,INK,maxh=102)
    for i,(head,body) in enumerate(case['workflow']):
        yy=291+i*88;txt(f'0{i+1}',54,yy,24,'#08799B','Light');txt(head,103,yy,16,INK,'Bold');p(escape(body),103,yy+27,693,12.3,INK,leading=16.1,maxh=56)
    p('<b>The answer your record can support:</b> '+escape(case['answer']),54,575,727,13.4,INK,maxh=77)
    box(54,658,1092,30,'#DFE8F0',r=3);p('<b>Boundary:</b> '+escape(case['limit']),65,664,1070,9.8,MUTED,leading=12,maxh=25)
    ref(case['refs'],False);finish()

# 14. Manual dossier composition.
start('The practical MSP evidence package','13 / Make retrieval useful')
title('A review package you can assemble','Build the packet before the difficult meeting.',
      'Use supported records and exports, then assemble a reviewed package. This is a recommended dossier structure—not a new one-click OperatorOS export or an automatic TechDeck-to-SnapProofOS integration.')
packet=[('01 / Work identity','Client, site, asset, ticket, scope, request, authorizing source, and relevant window.'),('02 / Work chronology','Before state; exact actions; actor and times; failed attempts; side effects; recovery and deviations.'),('03 / Source evidence','Original outputs, captures, notes, file identities, approved procedure revision, and links to retained source.'),('04 / Validation and open risk','Checks actually run, results, observations, uncertainty, untested scope, follow-up owner, and due date.'),('05 / Reviewed explanation','Internal engineering account plus a customer-appropriate report, with limitations and exact report version.'),('06 / Communication record','Actual sending/delivery references and client responses where retained; keep those separate from internal approval.')]
for i,(head,body) in enumerate(packet):block(head,body,54+(i%2)*562,238+(i//2)*133,515,CYAN)
ref(['R03','R04','R06','R14']);finish()

# 15. Honesty about records, privacy, AI.
start('Trustworthy records and AI limits','14 / Trust model')
title('The record needs its own safeguards','Preserve truth, access, and uncertainty.',
      'The point is a faithful explanation of the work, including mistakes. A polished summary becomes useful only when the underlying sources and limitations remain inspectable.')
for i,(head,body) in enumerate([
 ('Keep facts distinct','Separate observed output, client statements, technician interpretation, root-cause hypotheses, and pending checks. Import time is not automatically the event time.'),
 ('Keep the original context','Preserve the accepted source and revision. Screen out secrets; retain protected evidence through authorized storage and access paths. Do not silently rewrite the accepted history.'),
 ('Review every AI-derived statement','Use the closeout prompt with approved context and review the result. Cited document drafts are deterministic. Semantic similarity does not establish repair confidence or causation.'),
 ('Protect the evidence itself','Enforce tenant and source access. Apply an approved retention/hold policy, verify backup/restore, and use external evidence controls where required. Hashes are not independent notarization.')]):
    x=54+(i%2)*562;y=240+(i//2)*176;block(head,body,x,y,505,CYAN if i!=3 else AMBER)
box(54,620,1092,54,PANEL,r=5)
p('Engineering reference: NIST SP 800-61r3, RS.AN-06/07, emphasizes action records and preservation of integrity and provenance, protected by appropriate access and retention practices. This is a design rationale, not a certification or endorsement.',70,633,1060,11.8,GRAY,maxh=36)
ref(['R03','R04','R06','R09','R13','N01']);finish()

# 16. Application relevance and commerce.
start('Which modules actually help an MSP','15 / Portfolio by relevance',mark='module-map')
title('Prioritize the evidence workflow','Use the parts that support your service model.',
      'Start with a TechDeck-led workflow and granted companions. Other core products and optional services require their own access; this map is not an all-apps bundle promise.')
groups=[('DIRECT MSP VALUE',mods[:4],54),('CONTEXT + ENABLEMENT',mods[4:10],430),('SPECIALIST / NOT AN MSP CONTROL',mods[10:],806)]
for lab,group,x in groups:
    txt(lab,x,233,9.3,CYAN,'Mono');yy=265
    for m in group:
        box(x,yy,340,50,PANEL,r=4);box(x,yy,3,50,m['color']);txt(m['name'],x+14,yy+8,15,WHITE,'Bold');txt(m['role'],x+14,yy+31,8,GRAY,'Mono')
        c.linkAbsolute('Module profile',m['slug'],Rect=(x,H-yy-50,x+340,H-yy),thickness=0);yy+=61
box(54,652,1092,29,PANEL,r=3);p('Read pages 18–30 for every application’s features and three short scenarios. Pool Hall and OutCall are explicitly identified as having no current MSP evidence-control role.',67,659,1066,10.8,GRAY,maxh=20)
ref(['R01','R02','R11']);finish()

# 17. Pilot and measurements.
start('A practical pilot for the MSP','16 / A proposed two-week pilot',False)
title('Make the value measurable','Can a second engineer reconstruct the work?',
      'Proposed pilot, not performed results. Start in an approved environment with synthetic or explicitly approved data and validate the intended access, storage, and release state.',False)
steps=[('SET THE RULE','Choose a small sample','Agree on a minimum record: scope source, actor/asset/time, baseline, action, result, failed paths, validation, and next owner.'),('RUN THE WORK','Capture in the normal flow','Use existing PSA/RMM/EDR and communication tools as appropriate. Preserve their outputs; import reviewed closeout records rather than duplicating unverified conclusions.'),('CHALLENGE THE RECORD','Review without the original tech','Give a second engineer the record and one of the six dispute questions. Ask for the supporting source and every remaining uncertainty.'),('DECIDE WHAT TO EXPAND','Measure retrieval and completeness','Track reconstruction time, records missing actual authorization, unowned pending checks, repeated failed steps, and report/source mismatches.')]
for i,(lab,head,body) in enumerate(steps):
    yy=245+i*102;txt(f'0{i+1}',54,yy,28,'#08799B','Light');txt(lab,112,yy+1,9,MUTED,'Mono');txt(head,112,yy+24,19,INK,'Bold');p(body,452,yy+3,694,14,INK,maxh=77);line(54,yy+86,1146,yy+86,'#CFDBE5')
p('<b>Suggested success condition:</b> a reviewer can identify the scope, exact action, evidence, validation limits, and next owner without guessing. Set numeric targets only after measuring your baseline.',54,665,1092,11.7,INK,maxh=32)
ref(['R03','R04','R12'],False);finish()

# 18–30. All original application coverage, reframed around MSP relevance.
profile_ref={'techdeck':['R03','R04','R06'],'snapproofos':['R10','R14'],'ninjamation':['R07','R08'],'faultlinelab':['R02','R08'],'tradeflowkit':['R02','R08','R11'],'pulsedesk':['R02','R08','R11'],'callcommand-ai':['R02','R08'],'brandforgeos':['R02'],'ninja-launch-kit':['R02'],'studyforge-ai':['R02'],'torqueshed':['R02'],'ninja-pool-hall':['R02'],'outcall':['R01','R02']}
for m in mods:
    start(m['name']+' / features and MSP scenarios','Application field guide',mark=m['slug'])
    txt(m['role'],54,82,10,m['color'],'Mono');txt(m['name'],54,109,35,WHITE,'Bold');txt(m['protection'],54,161,18,m['color'],'Light')
    p(escape(m['note']),54,199,1092,12.6,GRAY,maxh=48)
    txt('FEATURE INVENTORY',54,262,9,CYAN,'Mono');txt('THREE ILLUSTRATIVE SCENARIOS',770,262,9,CYAN,'Mono')
    line(730,261,730,650)
    for i,(head,body) in enumerate(m['features']):
        yy=292+i*43.7;txt(str(i+1).zfill(2),54,yy,9,m['color'],'Mono');txt(head,85,yy-2,12.4,WHITE,'Bold');p(escape(body),85,yy+16,607,10.3,GRAY,leading=13.3,maxh=29)
    for i,(head,body) in enumerate(m['cases']):
        yy=294+i*117;txt(str(i+1).zfill(2),770,yy,12,m['color'],'Mono');ph=p(escape(head),804,yy-2,342,15,WHITE,font='Bold',maxh=44);p(escape(body),804,yy+max(27,ph+8),342,12,GRAY,leading=16,maxh=83)
    box(54,664,1092,23,PANEL,r=3);txt(m['kind']+'  /  '+m['access'],66,670,9,GRAY,'Mono')
    ref(['R01','R02']+profile_ref[m['slug']]);finish()

# 31. Honest completion and practical limits.
start('What this does and does not establish','17 / Practical boundaries')
title('A credible answer needs credible limits','Good records reduce ambiguity. They do not erase risk.',
      'OperatorOS supports operational accountability. It does not guarantee liability protection, legal admissibility, regulatory compliance, insurance coverage, or a particular dispute outcome.')
blocks=[('An incomplete record stays incomplete','No tool proves an authorization never captured, a test never performed, a client response never received, or a log that was never collected.'),('Internal status is only its own fact','An approved script, approved report, successful import, saved share, or invoice each proves a different bounded workflow event.'),('Keep independent systems of record','Execution telemetry, original communications, contracts, approved change records, and required external evidence archives retain their own roles.'),('Validate the target environment','The 29 September release record documents v65 publication and 47/47 public checks. Authenticated v65, production write, other-role, live logout, and restore acceptance remain separate.'),('AI is optional and bounded','Exact/text retrieval and deterministic evidence-derived drafts are independent of semantic activation. The reviewed source keeps the new semantic provider disabled.'),('Adopt the workflow before expanding','Validate grant/role boundaries, evidence access, report generation, controlled sharing, and retrieval in the environment the MSP will actually use.')]
for i,(head,body) in enumerate(blocks):block(head,body,54+(i%2)*562,235+(i//2)*137,511,CYAN if i<3 else AMBER)
ref(['R04','R06','R09','R12','R13','R14']);finish()

# 32–33. Pinned source register with small external rationale.
for half in range(2):
    start('Source register '+str(half+1),'Source register',False,mark='sources' if half==0 else 'sources2')
    title('Repository facts + explicit editorial guidance','Trace the capability claims.',
          'Module features come from the reviewed source snapshot. Recommended team procedures and synthetic examples are identified as such. Source links may require GitHub access.',False)
    for i,(sid,head,path,note) in enumerate(SOURCES[half*8:(half+1)*8]):
        x=54+(i//4)*562;y=238+(i%4)*101
        txt(sid,x,y,11,'#08799B','Mono');p(escape(head),x+45,y-2,474,16,INK,font='Bold',maxh=43)
        p(escape(note),x+45,y+44,474,11.6,MUTED,maxh=48);line(x,y+91,x+520,y+91,'#CFDBE5')
        url=path if path.startswith('https://') else base_url+path;c.linkURL(url,rect=(x+43,H-y-38,x+520,H-y+2),relative=0,thickness=0)
    p('Review: 29 September 2026 · reference revision 737a9d0f · published application ee9ca05e. No customer data was used. Scenarios are illustrative; no quantified benefit is asserted.',54,660,1092,11.5,MUTED,maxh=32)
    finish()

c.save();assert page==33,page
reader=PdfReader(str(PDF));full='\n'.join(q.extract_text() or '' for q in reader.pages)
normalize=lambda s:' '.join(unicodedata.normalize('NFKC',s).split())
flat=normalize(full)
checks=[]
for case in content['cases']:
    strings=[case[k] for k in ['quote','title','situation','answer','limit','measure']]+[s for pair in case['workflow'] for s in pair]+case['records']
    checks.extend(strings)
for m in mods:
    checks.extend([m['name'],m['protection'],m['note']]);checks.extend(s for pair in m['features'] for s in pair);checks.extend(s for pair in m['cases'] for s in pair)
missing=[s for s in checks if normalize(s) not in flat]
assert not missing,missing
assert len(mods)==13 and sum(len(m['features']) for m in mods)==104
assert sum(len(m['cases']) for m in mods)==39
report=dict(pages=page,applications=13,feature_groups=104,detailed_msp_cases=6,module_scenarios=39,total_illustrative_scenarios=45,
            source_commit=REV,content_strings_checked=len(checks),missing_content=[],bookmarks=len(reader.outline),
            links=sum(len(q.get('/Annots',[])) for q in reader.pages),bytes=PDF.stat().st_size,sha256=hashlib.sha256(PDF.read_bytes()).hexdigest())
(D/'validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(D/'page_index.json').write_text(json.dumps(index,indent=2),encoding='utf-8');(D/'layout.json').write_text(json.dumps(text_items,indent=2),encoding='utf-8');(D/'extracted_text.txt').write_text(full,encoding='utf-8')
# Editable companion: original wording plus structured examples, not an automated product feature.
md=['# OperatorOS: Show Your Work','', 'How an MSP uses OperatorOS to cover its ass.','',
    'A recommended operational playbook with illustrative scenarios. Product boundaries and source attribution are in the PDF.','']
for case in content['cases']:
    md += [f'## {case["id"]}. {case["quote"]}','',case['situation'],'']
    md += [f'- **{h}:** {b}' for h,b in case['workflow']]
    md += ['', '**Record-supported answer:** '+case['answer'],'', '**Boundary:** '+case['limit'],'', '**Pilot check:** '+case['measure'],'']
for m in mods:
    md += [f'## {m["name"]}', '',m['protection'],'',m['note'],'']+[f'- **{h}:** {b}' for h,b in m['features']]+['']
    md += [f'- **{h}:** {b}' for h,b in m['cases']]+['']
(D/'MSP_Playbook_Content.md').write_text('\n'.join(md),encoding='utf-8')
pv=D/'previews';pv.mkdir(exist_ok=True);doc=pdfium.PdfDocument(str(PDF));thumbs=[]
for i,q in enumerate(doc):
    im=q.render(scale=.6).to_pil().convert('RGB');im.save(pv/f'page-{i+1:02}.png');thumbs.append(im)
for j in range(3):
    chunk=thumbs[j*12:(j+1)*12];sheet=Image.new('RGB',(1440,762),'#D4DFE8');d=ImageDraw.Draw(sheet)
    for i,im in enumerate(chunk):
        im.thumbnail((352,220));x=i%4*360+4;y=i//4*254+4;sheet.paste(im,(x,y));d.text((x,y+226),str(j*12+i+1).zfill(2),fill='#132D44')
    sheet.save(pv/f'contact-{j+1}.jpg',quality=91)
for i in [0,1,3,5,6,7,12,17,18,30,31,32]:doc[i].render(scale=1.25).to_pil().convert('RGB').save(pv/f'page-{i+1:02}-large.png')
print(json.dumps(report,indent=2))
