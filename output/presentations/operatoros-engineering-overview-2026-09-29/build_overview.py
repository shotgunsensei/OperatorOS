"""Build a source-grounded, vector-first OperatorOS engineering briefing.

Run with the bundled Python (reportlab, Pillow, pypdf, pypdfium2).
No application, database, provider, or deployment access is performed.
"""
from pathlib import Path
import json, math, hashlib, re, subprocess
from html import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE / 'OperatorOS_Engineering_Overview_2026-09-29.pdf'
SHA = 'ee9ca05e8346bdb1770932029ae8a9a8d682ef0f'
BASE = f'https://github.com/shotgunsensei/OperatorOS/blob/{SHA}/'
MODULES = json.loads((HERE / 'modules.json').read_text(encoding='utf-8'))
W, H = 1120, 700
BG, PANEL, LINE = '#080B12', '#121826', '#293547'
WHITE, GRAY, CYAN = '#F8FAFC', '#A7B0C0', '#00C8FF'
INK, MUTED, PAPER = '#122139', '#526179', '#F4F7FB'
FONT_DIR = Path('C:/Windows/Fonts')
for name, fn in [('Body','segoeui.ttf'),('Bold','segoeuib.ttf'),('Light','segoeuil.ttf'),('Mono','consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / fn)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')

SOURCES = [
 ('S01','Canonical catalog and product outcomes','packages/sdk/src/catalog.ts','Names, hierarchy, access classes, coming-soon state; paired with product-value.ts and products.ts.'),
 ('S02','Module capability and integration contracts','packages/sdk/src/product-value.ts','Primary workflow, retained deliverables, provider boundaries, and explicit exclusions for all 13 applications.'),
 ('S03','Runtime registry and exact-host policy','packages/modules/registry.ts','Launch authority and default OutCall denial; test-only launch is explicitly bounded.'),
 ('S04','OperatorOS SSO contract v1','docs/auth/OPERATOROS_SSO_CONTRACT_V1.md','Opaque codes, 60-second expiry, PKCE S256, host-only sessions, role/tenant binding, revocation.'),
 ('S05','Ecosystem integration contract','docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md','Shared authority, tenant enforcement, billing separation, shared-service boundaries.'),
 ('S06','Current release gate and live evidence','docs/CURRENT_RELEASE_GATE.md','Recorded v64 publication/read checks and separate v65 candidate/provider boundary.'),
 ('S07','Ten connected outcomes','docs/CROSS_MODULE_READINESS_REPORT.md','Supported handoffs, source freshness, current access, deduplication, and external-action limits.'),
 ('S08','Current implementation evidence','docs/IMPLEMENTATION_STATUS.md','Dated local checks and limitations; reported historical evidence is not a new test run.'),
 ('S09','Evidence-derived TechDeck documents','docs/techdeck/resolution-intelligence-documents.md','Deterministic assembly, source citations, review, inherited access, and stale-source protection.'),
 ('S10','TechDeck semantic-search guide','docs/techdeck/resolution-intelligence-semantic-search.md','Disabled provider, excerpt review, explicit opt-in, limits, fallback, and no real-model acceptance.'),
 ('S11','Shared customers and account security','docs/modules/SHARED_CUSTOMERS_AND_ACCOUNT_SECURITY_2026-09-21.md','Customer links, shared contact edits, account controls, provider truth, and validation scope.'),
 ('S12','Current parity index','docs/modules/MODULE_PARITY_INDEX.md','Recent overlays and per-surface evidence; newest applicable status takes precedence.'),
 ('M01','TradeFlowKit capability matrix','docs/modules/tradeflowkit/PARITY_MATRIX.md','Jobs, revenue documents, recurring work, exports, and supported recovery.'),
 ('M02','TechDeck capability matrix','docs/modules/techdeck/PARITY_MATRIX.md','Service records, configuration, network, documentation, reporting; supplement with S09/S10.'),
 ('M03','PulseDesk capability matrix','docs/modules/pulsedesk/PARITY_MATRIX.md','Healthcare operations scope, queue ownership, equipment/facility/supply workflows.'),
 ('M04','TorqueShed capability matrix','docs/modules/torqueshed/PARITY_MATRIX.md','Garage, diagnostics, Assist, community, marketplace, and verification boundaries.'),
 ('M05','FaultlineLab capability matrix','docs/modules/faultlinelab/PARITY_MATRIX.md','Versioned challenges, attempts, scoring, authoring, assignments, and exports.'),
 ('M06','Operator Pool Hall capability matrix','docs/modules/ninja-pool-hall/PARITY_MATRIX.md','Supported play modes, durable state, server simulation, and exclusions.'),
 ('M07','BrandForgeOS capability matrix','docs/modules/brandforgeos/PARITY_MATRIX.md','Campaign and brand lifecycle; current direct-provider exclusions are specified in S02.'),
 ('M08','SnapProofOS capability matrix','docs/modules/snapproofos/PARITY_MATRIX.md','Evidence and custody foundation; current reports/shares and connected outcomes use S02/S07.'),
 ('M09','StudyForge AI capability matrix','docs/modules/studyforge-ai/PARITY_MATRIX.md','Complete study packs, persistent learning, authoritative quiz scoring, export, and exclusions.'),
 ('M10','Deploy Ops capability matrix','docs/modules/ninja-launch-kit/PARITY_MATRIX.md','Campaign artifacts, dependencies, readiness, checksum exports, and publication boundary.'),
 ('M11','CallCommand AI and MSP intake','docs/modules/callcommand-ai/MSP_INTAKE_PARITY_MATRIX.md','MSP intake constraints; current receptionist scope and provider setup use S02.'),
 ('M12','Script Ops capability matrix','docs/modules/ninjamation/PARITY_MATRIX.md','Versioned scripts, static checks, review, downloads, and non-execution boundary.'),
 ('M13','OutCall capability matrix','docs/modules/outcall/PARITY_MATRIX.md','Authorized reconstruction is source/local evidence; production remains coming soon.'),
 ('S13','Runtime topology and deployment model','README.md','Shared Next.js/Fastify runtime, private API, host routing; registry overrides stale OutCall summary.'),
 ('S14','Module consolidation record','docs/MODULE_CONSOLIDATION_STATUS.md','Historical restoration detail; later product contracts and current release evidence control current claims.'),
 ('S15','Backup and restore contract','docs/DATABASE_BACKUP_RESTORE.md','One ordered database authority, backup/apply/verify flow, and separate restore acceptance.'),
]
SOURCE_MAP = {s[0]:s for s in SOURCES}
source_snapshot = []
for sid, title, path, note in SOURCES:
    raw = (ROOT/path).read_bytes()
    source_snapshot.append(dict(id=sid,title=title,path=path,sha256=hashlib.sha256(raw).hexdigest(),url=BASE+path,note=note))
(HERE/'source_manifest.json').write_text(json.dumps(dict(as_of='2026-09-29',source_commit=SHA,sources=source_snapshot),indent=2),encoding='utf-8')

c = canvas.Canvas(str(OUT), pagesize=(W,H), pageCompression=1)
c.setTitle('OperatorOS | Platform, Modules & Engineering Use Cases')
c.setAuthor('Shotgun Ninjas Productions, LLC')
c.setSubject('Engineering briefing: 13 applications, 104 grouped feature entries, 42 illustrative scenarios; repository snapshot 2026-09-29')
c.setCreator('OperatorOS source-grounded presentation builder')
c.setViewerPreference('DisplayDocTitle', 'true')
c.showOutline()
PAGE=0
LAYOUT=[]
PAGE_META=[]

def rect(x,y,w,h,fill,stroke=None,r=0):
    c.setFillColor(HexColor(fill)); c.setStrokeColor(HexColor(stroke or fill))
    if r: c.roundRect(x,H-y-h,w,h,r,stroke=bool(stroke),fill=1)
    else: c.rect(x,H-y-h,w,h,stroke=bool(stroke),fill=1)

def line(x1,y1,x2,y2,color=LINE,width=1):
    c.setStrokeColor(HexColor(color)); c.setLineWidth(width); c.line(x1,H-y1,x2,H-y2)

def text(t,x,y,size=14,color=WHITE,font='Body',align='left'):
    c.setFont(font,size); c.setFillColor(HexColor(color))
    if align=='right': c.drawRightString(x,H-y-size*.83,t)
    elif align=='center': c.drawCentredString(x,H-y-size*.83,t)
    else: c.drawString(x,H-y-size*.83,t)
    width=pdfmetrics.stringWidth(t,font,size)
    xx=x-width if align=='right' else x-width/2 if align=='center' else x
    if xx < -1 or xx+width > W+1 or y < -1 or y+size > H+1:
        raise ValueError(f'Page {PAGE} text outside page: {t}')

def para(t,x,y,w,size=14,color=GRAY,leading=None,font='Body',maxh=None):
    style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.38,textColor=HexColor(color),spaceAfter=0)
    p=Paragraph(t,style); pw,ph=p.wrap(w,H)
    if maxh is not None and ph>maxh+.1: raise ValueError(f'Page {PAGE} overflow {ph:.1f}>{maxh}: {t[:80]}')
    if y+ph>H-31: raise ValueError(f'Page {PAGE} paragraph too low: {t[:80]}')
    p.drawOn(c,x,H-y-ph)
    LAYOUT.append(dict(page=PAGE,x=x,y=y,w=pw,h=ph,text=re.sub('<[^>]+>','',t)))
    return ph

def tag(t,x,y,color=CYAN,dark=True):
    tw=pdfmetrics.stringWidth(t,'Bold',9.5)+20
    rect(x,y,tw,21,PANEL if dark else '#E7EDF5',r=4)
    text(t,x+10,y+6,9.5,color if dark else INK,'Bold')
    return tw

def refs(ids,dark=True):
    text('SOURCE NOTES',52,649,8.5,GRAY if dark else MUTED,'Mono')
    x=132
    for sid in ids:
        text(sid,x,649,8.5,CYAN if dark else '#0873A1','Mono')
        width=pdfmetrics.stringWidth(sid,'Mono',8.5)
        c.linkAbsolute('Source register','sources',Rect=(x,H-661,x+width,H-648),thickness=0)
        x += width+12

def start(title,section,dark=True,bookmark=None):
    global PAGE
    PAGE+=1
    rect(0,0,W,H,BG if dark else PAPER)
    rect(0,0,7,H,CYAN if dark else INK)
    text('OPERATOROS',52,26,11,WHITE if dark else INK,'Bold')
    text(section.upper(),1068,28,9,GRAY if dark else MUTED,'Mono',align='right')
    line(52,53,1068,53,LINE if dark else '#D9E1EB')
    text('SHOTGUN NINJAS PRODUCTIONS, LLC',52,677,8,GRAY if dark else MUTED,'Mono')
    text('ENGINEERING BRIEF  /  29 SEP 2026',557,677,8,GRAY if dark else MUTED,'Mono',align='center')
    text(f'{PAGE:02d}',1068,673,13,WHITE if dark else INK,'Mono',align='right')
    mark=bookmark or f'page{PAGE}'
    c.bookmarkPage(mark); c.addOutlineEntry(title,mark,level=0,closed=False)
    PAGE_META.append(dict(page=PAGE,title=title,section=section,bookmark=mark))

def end(): c.showPage()

def heading(kicker,title,sub=None,dark=True,color=CYAN):
    text(kicker.upper(),52,78,10,color if dark else MUTED,'Mono')
    text(title,52,103,34,WHITE if dark else INK,'Bold')
    if sub: para(sub,52,151,1016,14,GRAY if dark else MUTED,maxh=60)

def arrow(x1,y1,x2,y2,color=CYAN):
    line(x1,y1,x2,y2,color,1.3)
    angle=math.atan2(y2-y1,x2-x1)
    for da in [-.55,.55]:
        xx=x2-7*math.cos(angle+da); yy=y2-7*math.sin(angle+da)
        line(xx,yy,x2,y2,color,1.3)

def feature_block(title,body,x,y,w,color=CYAN,dark=True):
    line(x,y,x+30,y,color,3)
    text(title,x,y+13,15,WHITE if dark else INK,'Bold')
    para(body,x,y+38,w,12.5,GRAY if dark else MUTED,maxh=83)

def case_columns(cases,color,top=209,unavailable=False):
    xs=[52,398,744]; cw=324
    for i,(case,x) in enumerate(zip(cases,xs)):
        line(x,top,x+cw,top,'#CBD6E3',1)
        text(f'0{i+1}',x,top+13,32,color,'Light')
        yy=top+58
        ph=para(escape(case['title']),x,yy,cw-5,19,INK,font='Bold',maxh=56)
        yy+=max(58,ph+13)
        for label,key in [('SITUATION','context'),('WORKFLOW','approach'),('EXPECTED OUTPUT','output')]:
            text(label,x,yy,8.5,MUTED,'Mono'); yy+=16
            ph=para(escape(case[key]),x,yy,cw-8,12.2,INK,leading=16,maxh=106)
            yy+=ph+12
        if yy>575: raise ValueError(f'Case too tall on page {PAGE}: {yy}')
        rect(x,578,cw,49,'#E5EBF3',r=4)
        text('MEASURE IN A PILOT',x+12,586,8,MUTED,'Mono')
        para(escape(case['measure']),x+12,600,cw-24,10.1,INK,leading=12.5,maxh=26)

# 01 / Cover
start('OperatorOS engineering overview','Platform / modules / use cases',bookmark='cover')
c.drawImage(str(ROOT/'apps/web/public/brand/operatoros-logo.png'),595,H-90-500,500,500,mask='auto')
text('OPERATOROS',52,102,18,CYAN,'Bold')
for i,t in enumerate(['One platform.','Connected work.','Retained intelligence.']):
    text(t,52,151+i*64,43,WHITE,'Bold')
para('An engineering overview of the platform, its applications, and the workflows that turn operational activity into reusable assets.',52,371,510,18,GRAY,maxh=103)
tag('13 APPLICATIONS',52,510)
tag('42 ILLUSTRATIVE SCENARIOS',185,510)
text('Prepared for engineering colleagues',52,566,15,WHITE,'Bold')
text('John Travis Williams Jr.  /  Shotgun Ninjas Productions, LLC',52,594,11,GRAY)
text('SOURCE SNAPSHOT  ee9ca05e  /  2026-09-29',52,640,9,GRAY,'Mono')
end()

# 02 / Reading guide and thesis
start('The platform thesis','01 / Orientation',bookmark='orientation')
heading('The engineering proposition','Reduce the cost of context.',
        'OperatorOS centralizes authority while purpose-built applications retain their own work models. The intended value is less re-entry, clearer ownership, and evidence that survives the handoff.')
for x,num,label,body in [
    (52,'01','Shared authority','Identity, tenants, roles, subscriptions, entitlements, launch policy, and audit have one parent authority.'),
    (398,'02','Distinct work models','Service revenue, IT resolution, and healthcare operations remain separate main-module workflows.'),
    (744,'03','Reusable outcomes','Reviewed proof, scripts, knowledge, training cases, and campaign packages become durable work products.')]:
    text(num,x,231,50,CYAN,'Light'); text(label,x,294,19,WHITE,'Bold'); para(body,x,329,310,14,GRAY,maxh=100)
line(52,443,1068,443)
text('READ THIS AS A TECHNICAL BRIEF',52,466,10,CYAN,'Mono')
para('<b>Architecture and platform:</b> pages 3–7. <b>Module inventories and case studies:</b> pages 8–33. <b>Resolution Intelligence:</b> page 34. <b>Evaluation and evidence:</b> pages 35–38.',52,492,480,13,GRAY,maxh=85)
para('<b>Case-study method:</b> all 42 scenarios are illustrative, not customer testimonials. Expected outputs are workflow goals; measurement suggestions are not reported results. Feature descriptions are grounded in repository contracts and implementation records.',587,466,481,13,GRAY,maxh=120)
refs(['S01','S02','S05']); end()

# 03 / Module map
start('The application map','02 / Ecosystem',bookmark='map')
heading('One parent / three mains / ten companions','A portfolio with explicit boundaries.',
        'The map shows product scope and access class. Actual access is a server decision; an application category is not a promise that every tenant receives it.')
groups=[('MAIN MODULES',MODULES[:3],52,225,324),('PAID COMPANIONS',MODULES[6:12],398,225,324),('FREE + GATED COMPANIONS',MODULES[3:6]+MODULES[12:],744,225,324)]
for title,items,x,top,cw in groups:
    text(title,x,top,10,CYAN,'Mono'); yy=top+31
    for m in items:
        rect(x,yy,cw,48,PANEL,r=5); rect(x,yy,3,48,m['color'])
        text(m['name'],x+15,yy+8,15,WHITE,'Bold')
        desc={'TradeFlowKit':'Service work + commercial records','TechDeck':'IT context + resolution knowledge','PulseDesk':'Healthcare operations coordination','TorqueShed':'Vehicle history + diagnostic work','FaultlineLab':'Diagnostic practice + investigation traces','Operator Pool Hall':'Browser 8-ball + shared recreation','BrandForge OS':'Brand context + campaign production','SnapProofOS':'Field evidence + approved reports','StudyForge AI':'Source material + study practice','Deploy Ops':'Campaign packages + launch readiness','CallCommand AI':'Receptionist + intake + follow-up','Script Ops':'Reviewed, versioned script assets','OutCall':'Coming soon / production unavailable'}[m['name']]
        text(desc,x+15,yy+29,9.5,GRAY)
        c.linkAbsolute('Open module',m['slug'],Rect=(x,H-yy-48,x+cw,H-yy),thickness=0)
        yy+=57
para('Current commerce separates the selected core product, companion grants, and seats. Legacy plan compatibility is a separate path. No pricing quote or all-modules entitlement is implied by this overview.',52,596,1016,12,GRAY,maxh=40)
refs(['S01','S03']); end()

# 04 / architecture
start('Runtime and authority','03 / Architecture',bookmark='architecture')
heading('Shared runtime / explicit trust boundaries','One authority. Multiple exact hosts.',
        'Next.js web surfaces and a private Fastify API operate as one platform deployment. Module hosts present distinct products; they do not become independent identity or billing systems.')
nodes=[(52,239,246,90,'Browser / module host','Same-origin /api requests\nHost-only application session'),(356,239,310,90,'OperatorOS web runtime','Next.js on public port 5000\nExact registered host routing'),(724,239,344,90,'Private API authority','Fastify on private port 5001\nAuth + tenant + role + entitlement')]
for x,y,w,h,t,b in nodes:
    rect(x,y,w,h,PANEL,LINE,6); text(t,x+16,y+17,16,WHITE,'Bold'); para(b.replace('\n','<br/>'),x+16,y+45,w-32,12,GRAY,maxh=40)
arrow(298,284,352,284); arrow(666,284,720,284)
rect(356,373,310,103,PANEL,LINE,6); text('Shared PostgreSQL authority',373,393,16,WHITE,'Bold')
para('Tenant-scoped records, constraints, audit, durable jobs, outbox/inbox, and ordered database releases.',373,424,276,12,GRAY,maxh=42)
arrow(820,329,820,351); arrow(820,351,514,351); arrow(514,351,514,369)
rect(724,373,344,103,PANEL,LINE,6); text('Configured external providers',741,393,16,WHITE,'Bold')
para('Payments, telephony, AI, email, scanning, and storage retain independent setup and acceptance gates.',741,424,310,12,GRAY,maxh=42)
arrow(963,329,963,369)
para('<b>SSO:</b> a 60-second opaque code is single-use and bound to exact callback, state, nonce, PKCE S256, environment, tenant, module, and entitlement. Redemption revalidates authority.',52,512,487,13,GRAY,maxh=92)
para('<b>Isolation:</b> host-only Secure/HttpOnly cookies; no ambient parent-domain cookie. Server-resolved tenant predicates govern reads, writes, constraints, transactions, and audit. A requested tenant ID is never authority.',581,512,487,13,GRAY,maxh=92)
refs(['S03','S04','S05','S13']); end()

# 05 / shared capabilities
start('Platform capability inventory','04 / Shared services',bookmark='platform')
heading('The reusable foundation','Capabilities every module should not rebuild.',
        'A common control plane reduces duplicated security and business logic while keeping module records, roles, and outcomes explicit.')
blocks=[('Identity and account security','Central sign-in, session lifecycle, role checks, account status, MFA/revocation controls, and exact-host SSO.'),('Tenants and entitlements','Validated memberships, organization selection, module grants, subscription/seat policy, and server-owned launch decisions.'),('Shared customer directory','Organization/contact identity reused by supported applications; shared contact edits avoid automatic rewriting of historical reports.'),('Files, jobs, and exports','Private attachments, configured scanning, durable work queues, usage accounting, export artifacts, and explicit failure/retry states.'),('Billing and service connections','Platform Stripe authority stays separate from module business payments; stored configuration never proves external delivery.'),('Audit and collaboration','Platform audit, shared activity/notifications, tenant messenger, administrative visibility, and scoped record-to-record handoffs.')]
for i,(title,body) in enumerate(blocks):
    feature_block(title,body,52+(i%3)*346,237+(i//3)*162,316,CYAN)
rect(52,579,1016,42,PANEL,r=4)
para('<b>Operational intelligence today:</b> deterministic workday briefs rank recorded exceptions and point to the next action. They do not silently invoice, charge, send, assign, or execute.',68,591,984,11.5,GRAY,maxh=30)
refs(['S04','S05','S11','S12']); end()

# 06 / connected workflows
start('Ten connected outcomes','05 / Connected workflows',bookmark='handoffs')
heading('From adjacent apps to connected work','Handoffs preserve the original context.',
        'Ten registered workflow contracts connect selected records. Each result remains a specific draft, ticket, attachment, or package with a reviewed source version.')
flows=[('01','TradeFlowKit job','SnapProofOS proof work'),('02','Approved SnapProofOS PDF','Originating TradeFlowKit job'),('03','CallCommand analyzed real call','TradeFlowKit lead or customer/job'),('04','CallCommand analyzed real call','PulseDesk operations request'),('05','CallCommand analyzed real call','TechDeck support ticket'),('06','Resolved TechDeck / PulseDesk work','Unpublished FaultlineLab draft'),('07','TorqueShed diagnostic','SnapProofOS diagnostic proof'),('08','Verified / resolved TorqueShed work','Unpublished FaultlineLab draft'),('09','BrandForgeOS campaign','Deploy Ops launch package'),('10','Approved Script Ops revision','Non-executing TechDeck runbook')]
for i,(num,src,dst) in enumerate(flows):
    x=52+(i//5)*526; y=223+(i%5)*66
    text(num,x,y+5,18,CYAN,'Mono'); text(src,x+42,y,12.3,WHITE,'Bold')
    text('→ '+dst,x+42,y+24,12,GRAY)
    line(x,y+54,x+487,y+54)
para('<b>Delivery contract:</b> recheck both applications and source access at queue and delivery; reject changed sources; deduplicate the business operation; retain signed event context and scoped results. Training handoffs require manager review. Live-call handoffs reject simulations.',52,574,1016,12.5,GRAY,maxh=54)
refs(['S07']); end()

# 07 / platform scenarios
start('OperatorOS platform case studies','06 / Platform scenarios',dark=False,bookmark='platform-cases')
heading('Three illustrative platform case studies','Where shared authority pays off.',
        'These are evaluation scenarios using synthetic or approved data. They do not report customer deployments or measured results.',dark=False)
platform_cases=[
 dict(title='One engineer, several workspaces',context='An engineer belongs to two organizations and must reach the right module without mixing records or permissions.',approach='Authenticate centrally, select the organization, and launch an entitled module. Follow a deep link and then return to My Apps; switching organization requires a fresh module authorization.',output='A host-specific session bound to the intended tenant and module, with server-side checks on every protected action.',measure='Cross-tenant denial; deep-link continuity; absence of repeat credential entry.'),
 dict(title='A customer shared across workflows',context='A service customer appears in commercial records, a campaign brand, and field proof, each with different work history.',approach='Use the supported shared customer selector in TradeFlowKit, BrandForge OS, and SnapProofOS. Update the shared contact intentionally and verify current projections without rewriting approved historical reports.',output='One reusable customer identity with independent module records and preserved historical evidence.',measure='Duplicate identity creation; contact consistency; historical report stability.'),
 dict(title='A retry without a duplicate result',context='A reviewed cross-module transfer is interrupted after submission and another authorized person attempts the same outcome.',approach='Queue the supported handoff with its source version. Inspect status and the destination link, then exercise the allowed retry path; changed sources and revoked access should fail closed.',output='A traceable, deduplicated destination result for supported tenant-owned workflows; actor-scoped campaign generation remains distinct.',measure='Duplicate records; stale-source rejection; recoverable retry behavior.')]
case_columns(platform_cases,'#087B9C'); refs(['S04','S07','S11'],False); end()

# 08–33 / Module chapters
for idx,m in enumerate(MODULES):
    color=m['color']
    start(m['name']+' — capabilities',f'{idx+7:02d} / {m["kind"].lower()}',bookmark=m['slug'])
    text(m['kind']+'  /  '+m['access'].upper(),52,79,9,color,'Mono')
    text(m['name'],52,105,37,WHITE,'Bold')
    text(m['headline'],52,157,20,color,'Light')
    para(escape(m['summary']),52,194,744,13.3,GRAY,maxh=58)
    for i,(title,body) in enumerate(m['features']):
        xx=52+(i%2)*380; yy=277+(i//2)*77
        text(f'{i+1:02d}',xx,yy,9,color,'Mono')
        text(title,xx+27,yy-2,12.4,WHITE,'Bold')
        para(escape(body),xx+27,yy+20,326,10.8,GRAY,leading=14,maxh=47)
    rect(831,105,237,451,PANEL,r=8)
    text(m['symbol'],855,125,36,color,'Bold')
    text('THE WORKFLOW',855,181,9,GRAY,'Mono')
    for i,step in enumerate(m['flow']):
        yy=208+i*43
        c.setStrokeColor(HexColor(color)); c.setLineWidth(1.3); c.circle(863,H-yy-8,7,stroke=1,fill=0)
        text(str(i+1),863,yy+2,8,color,'Mono',align='center')
        if i<3: line(863,yy+16,863,yy+36,LINE,1.2)
        text(step,881,yy+1,10.6,WHITE,'Bold')
    line(855,389,1044,389,LINE)
    text('RETAINED OUTPUT',855,407,9,color,'Mono')
    para(escape(m['artifact']),855,432,188,12.2,GRAY,maxh=110)
    rect(52,589,1016,45,PANEL,r=5)
    text('BOUNDARY',65,598,8.5,color,'Mono')
    para(escape(m['boundary']),143,596,909,10.5,GRAY,leading=13.8,maxh=31)
    refs(m['sources']); end()

    start(m['name']+' — case studies',m['name']+' / Illustrative scenarios',dark=False)
    heading('Three illustrative case studies',m['name']+' in practice.',
        ('Gated scenarios only. OutCall remains unavailable; these are future acceptance examples, not present live service.' if m['slug']=='outcall' else 'Problem → workflow → expected output. Measurements are suggested pilot checks, not claimed results.'),dark=False)
    # Keep dark-enough accents on paper for accessible numerical labels.
    col={'#00C8FF':'#087A9F','#38D9A9':'#12785E','#79B8FF':'#2C67A8','#F6C85F':'#8E690E','#AAB5C8':'#526179'}.get(color,'#526A85')
    case_columns(m['cases'],col)
    refs(m['sources'],False); end()

# 34 / intelligence
start('Resolution Intelligence in depth','20 / Technical deep dive',bookmark='intelligence')
heading('Knowledge with provenance and limits','Preserve evidence before adding inference.',
        'TechDeck distinguishes observed source evidence, deterministic projections, human approval, and optional model-based similarity. Those are different kinds of authority.')
cols=[(52,'1','Evidence','Screen structured closeouts. Retain immutable source revisions, actions, failed attempts, side effects, uncertainty, and validation.'),(315,'2','Projection','Build exact/text retrieval and typed relationships. Keep source references and incident access attached to the result.'),(578,'3','Reviewed knowledge','Preview cited KB/runbook drafts. Review and publish through existing controls; changed sources block stale approval.'),(841,'4','Optional similarity','Review excerpts before indexing. Explicitly opt into semantic queries; explain hybrid ranking and retain exact/text fallback.')]
for x,num,title,body in cols:
    text(num,x,230,44,CYAN,'Light'); para(title,x,287,225,19,WHITE,font='Bold',maxh=57); para(body,x,350,225,13,GRAY,maxh=145)
    if x<841: arrow(x+232,252,x+252,252)
rect(52,527,490,98,PANEL,r=6); text('DEPLOYED EVIDENCE: v64',68,541,10,CYAN,'Mono')
para('Repository records publication and owner read checks for import/prompt/search/linked-knowledge surfaces. Production writes, other-role checks, live logout, and restore remain separate acceptance scopes.',68,566,458,11.5,GRAY,maxh=55)
rect(563,527,505,98,PANEL,r=6); text('SOURCE CANDIDATE: v65 / PROVIDER OFF',579,541,10,'#F6C85F','Mono')
para('OpenAI adapter and bounded hybrid retrieval are implemented. Provider activation, production vector capability, real-model relevance, and publication are not established. Similarity is not repair confidence.',579,566,473,11.5,GRAY,maxh=55)
refs(['S06','S08','S09','S10']); end()

# 35 / engineer evaluation
start('A practical engineering evaluation','21 / Suggested walkthrough',dark=False,bookmark='evaluation')
heading('A proposed 45-minute technical walkthrough','Prove the transitions, then discuss scale.',
        'Suggested agenda, not a completed test. Use synthetic records in an approved environment with explicit module grants and a second tenant for denial checks.',dark=False)
agenda=[('00–07','Authority and navigation','Launch TechDeck through OperatorOS, follow a deep link, return to My Apps, and inspect a foreign-tenant denial.'),('07–19','Incident to retained intelligence','Import a synthetic closeout, search an exact identifier, review a failed attempt, and preview a source-cited runbook draft.'),('19–28','An approved asset handoff','Inspect an approved Script Ops revision and its non-executing TechDeck draft; show source identity and review status.'),('28–37','Evidence to work context','Demonstrate a TradeFlowKit-to-SnapProofOS proof workflow only in a separately entitled context; inspect the returned approved PDF.'),('37–45','Failure behavior and discussion','Review stale-source rejection, retry identity, unavailable-provider states, deployment evidence, and open acceptance gates.')]
for i,(time,title,body) in enumerate(agenda):
    yy=213+i*76
    text(time,52,yy+2,17,'#087A9F','Mono'); text(title,161,yy,15,INK,'Bold'); para(body,161,yy+24,887,12,MUTED,maxh=37)
    line(52,yy+65,1068,yy+65,'#D4DEEA')
para('<b>Discussion prompts:</b> Where does authority reside? Which handoff reduces the most re-entry? Which result is a draft versus an external action? What must a production pilot prove before wider use?',52,607,1016,11.5,INK,maxh=34)
refs(['S04','S07','S09','S15'],False); end()

# 36 / evidence
start('Evidence and readiness boundaries','22 / Evidence posture',bookmark='evidence')
heading('Implementation, deployment, and acceptance','Treat evidence as a ladder.',
        'This document is a repository-grounded product and architecture review, not a new deployment audit. Historical records are attributed to their recorded scope and date.')
rows=[('SOURCE','Observed in this review','Current checkout ee9ca05e contains the catalog, contracts, APIs, UI, and documentation used here.'),('LOCAL TESTS','Reported in repository','Phase 5 records 14/14 local release stages, 1,593 API, 108 integration, 52 unit, 32 browser, and 4 visual checks; 36 vector-focused checks are separate.'),('RECORDED LIVE','Specific v64 evidence','The 2026-09-27 record reports v64/64, a published build, 47/47 public checks, and owner read/SSO/deep-link checks. No new live checks were run for this PDF.'),('PROVIDER / WRITE','Acceptance remains scoped','Live calls, payments, messages, model quality, production writes, other roles, data migration, and restore need their own evidence.'),('UNAVAILABLE','An explicit product state','OutCall remains coming soon. New semantic retrieval is provider-disabled. A configured key, a green build, or a rendered page cannot substitute for acceptance.')]
for i,(label,state,body) in enumerate(rows):
    y=213+i*79
    text(label,52,y+7,10,CYAN if i<3 else '#F6C85F','Mono')
    text(state,226,y+2,15,WHITE,'Bold'); para(body,226,y+27,824,11.6,GRAY,maxh=48)
    line(52,y+68,1068,y+68)
refs(['S03','S06','S08','S10','S12']); end()

# 37–38 / source register
for chunk_no in range(2):
    chunk=SOURCES[chunk_no*14:(chunk_no+1)*14]
    start('Source register '+str(chunk_no+1),'23 / Source register',dark=False,bookmark='sources' if chunk_no==0 else 'sources-2')
    heading('Reference register '+str(chunk_no+1)+' / 2','Trace the claims to the repository.',
        'Clickable references are pinned to source commit ee9ca05e. Repository access may be required. Newer release records and current product/registry contracts supersede older status prose.',dark=False)
    for i,(sid,title,path,note) in enumerate(chunk):
        x=52+(i//7)*526; y=213+(i%7)*56
        text(sid,x,y+2,10,'#087A9F','Mono'); text(title,x+41,y,11.5,INK,'Bold')
        c.linkURL(BASE+path,rect=(x+40,H-y-16,x+495,H-y+1),relative=0,thickness=0)
        para(escape(note),x+41,y+20,449,9.4,MUTED,leading=12.2,maxh=28)
        line(x,y+48,x+490,y+48,'#D6DFE9',.7)
    if chunk_no==1:
        para('<b>Editorial precedence:</b> current registry and product contracts resolve stale descriptions (notably OutCall, Deploy Ops, and direct provider connections). Historical module matrices describe implementation provenance; they do not grant new live acceptance.',52,613,1016,10.5,INK,leading=14,maxh=29)
    end()

c.save()
assert PAGE==38, PAGE
reader=PdfReader(str(OUT))
full='\n'.join(p.extract_text() or '' for p in reader.pages)
flat=' '.join(full.split())
for m in MODULES:
    assert m['name'] in flat, m['name']
    for f,_ in m['features']: assert f in flat, (m['name'],f)
    for cs in m['cases']: assert cs['title'] in flat, (m['name'],cs['title'])
assert len(MODULES)==13 and sum(len(m['cases']) for m in MODULES)==39
assert sum(len(m['features']) for m in MODULES)==104
assert all(len(p.extract_text() or '')>100 for p in reader.pages)
qa=dict(pages=len(reader.pages),modules=13,feature_groups=104,module_scenarios=39,platform_scenarios=3,
        total_scenarios=42,words=len(full.split()),bookmarks=len(reader.outline),
        hyperlinks=sum(len(p.get('/Annots',[])) for p in reader.pages),source_commit=SHA,
        pdf_sha256=hashlib.sha256(OUT.read_bytes()).hexdigest(),bytes=OUT.stat().st_size,
        assertions='All module names, 104 feature titles, 39 module scenario titles, and 38 nonempty pages present; bounded paragraph layout passed.')
(HERE/'validation.json').write_text(json.dumps(qa,indent=2),encoding='utf-8')
(HERE/'layout.json').write_text(json.dumps(LAYOUT,indent=2),encoding='utf-8')
(HERE/'page_index.json').write_text(json.dumps(PAGE_META,indent=2),encoding='utf-8')
(HERE/'extracted_text.txt').write_text(full,encoding='utf-8')

# Portable, editable content companion for future revisions.
md=['# OperatorOS engineering overview','',f'Snapshot: 2026-09-29 | commit `{SHA}`','',
    'All case studies are illustrative scenarios, not measured customer outcomes. See the PDF for architecture and platform discussion.','']
for m in MODULES:
    md += [f'## {m["name"]}', '',m['headline'],'',m['summary'],'',f'Access: {m["access"]}','']
    md += [f'- **{t}:** {b}' for t,b in m['features']]
    md += ['', '**Boundary:** '+m['boundary'],'']
    for i,cs in enumerate(m['cases'],1):
        md += [f'### Scenario {i}: {cs["title"]}', '', '**Situation:** '+cs['context'],'', '**Workflow:** '+cs['approach'],'', '**Expected output:** '+cs['output'],'', '**Measure in a pilot:** '+cs['measure'],'']
(HERE/'Module_Features_and_Case_Studies.md').write_text('\n'.join(md),encoding='utf-8')

previews=HERE/'previews'; previews.mkdir(exist_ok=True)
doc=pdfium.PdfDocument(str(OUT))
thumbs=[]
for i,p in enumerate(doc):
    im=p.render(scale=.6).to_pil().convert('RGB')
    im.save(previews/f'page-{i+1:02}.png')
    thumbs.append(im)
for k in range(4):
    chunk=thumbs[k*12:(k+1)*12]
    if not chunk: continue
    sheet=Image.new('RGB',(4*336,3*233),'#D5DCE6'); draw=ImageDraw.Draw(sheet)
    for j,im in enumerate(chunk):
        im.thumbnail((328,205)); x=(j%4)*336+4; y=(j//4)*233+4
        sheet.paste(im,(x,y)); draw.text((x,y+208),f'{k*12+j+1:02d}',fill='#122139')
    sheet.save(previews/f'contact-sheet-{k+1}.jpg',quality=90)
for i in [0,3,7,8,9,10,31,32,33,36,37]:
    im=doc[i].render(scale=1.25).to_pil().convert('RGB')
    im.save(previews/f'page-{i+1:02}-large.png')
print(json.dumps(qa,indent=2))
