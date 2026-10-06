# OperatorOS sales meeting playbook

Prepared 5 October 2026 for Shotgun Ninjas Productions, LLC.

Three focused pitches, each supplied as an editable PowerPoint and a matching PDF. Each has 17 main slides and 3 appendix slides. The appendix slides are hidden in the default PowerPoint slide show but remain available in the file. All 20 pages appear in the PDF. Presenter notes are embedded on every slide and also supplied as separate Markdown files.

## Choose the conversation

| Buyer | Lead with | Central value | Example to request |
| --- | --- | --- | --- |
| Trade company owner or operations leader | TradeFlowKit | Keep customer, work, billing and cash follow-up connected | A completed job that waited to be invoiced |
| MSP owner, service leader or senior engineer | TechDeck | Retain context, evidence and a defensible handoff | A ticket that was hard to reconstruct |
| Healthcare operations or department leader | PulseDesk | Give operational work ownership, targets and useful history | A request that kept bouncing between teams |

## Suggested meeting routes

- **10–12 minute first meeting:** slides 1–3, 6, one of 7–9, then 14–17. Ask the discovery question before showing features.
- **20 minute discovery and pitch:** slides 1–7, the most relevant additional scenario, then 10–17. Allow discussion after the scenario and value slide.
- **Technical or operational evaluation:** use the relevant appendix slides 18–20 and the full presenter notes. Test the buyer’s exact required workflow before making a deployment commitment.
- **After the meeting:** send the lane PDF as a leave-behind. Keep the editable PowerPoint and presenter notes for the sales team.

The three scenarios in each deck are illustrative operating examples. They are not customer testimonials, deployment evidence or measured results.

## TradeFlowKit

Opening: “When a job is finished, can the office see what still needs to happen before the money is collected?”

Discovery prompts:

1. Where do qualified inquiries and accepted quotes wait today?
2. How does the office know a job is ready for billing?
3. Which customer or job details do people enter more than once?
4. Which accounting, messaging and payment services must stay in place?

Recommended scenario: slide 7 for lost opportunities; slide 8 for proof of completion; slide 9 for recurring service.

Demo sequence: add/select one customer, create a job and task, prepare a quote, record the customer decision, review the invoice, and inspect the remaining next action. If demonstrating SnapProofOS, prepare and approve the supported handoff in advance using synthetic photos and findings.

Ask for a workflow owner, one service line and a small agreed job sample. Define quote turnaround, completed-but-uninvoiced work, outstanding balances and closeout effort before the pilot begins.

Scope boundary: online payment and outgoing message delivery require a verified connected service. Direct QuickBooks Online synchronization is planned. Do not promise automated dispatch, routing, payment recovery or revenue gains. A recorded payment and a confirmed online settlement are distinct events.

## TechDeck

Opening: “If a different engineer had to explain yesterday’s change to the client, how much of the story could they recover without calling the original technician?”

Discovery prompts:

1. What information is most often missing from an escalation?
2. How are the request, approval reference, external tool output and validation retained?
3. Which repeated fixes should become reviewed team knowledge?
4. Which PSA, RMM, monitoring and remote-access workflows must remain authoritative?

Recommended scenario: slide 7 for accountability and the “cover my ass” concern; slide 8 for engineer handoffs; slide 9 for repeatable knowledge.

Demo sequence: open a client, system and ticket; review time and evidence; inspect the structured closeout; search an identifier; preview a cited knowledge/runbook draft. Use screened synthetic incident data and verify source visibility for the demo role.

Ask for one client, a sample of comparable incidents and a closeout standard. Measure reconstruction effort, specific validation, named follow-ups and reuse of reviewed guidance. Client authorization should be captured as a real approval reference; the deck does not imply an electronic signature or automated risk-acceptance feature.

Scope boundary: scripts and runbooks do not execute on endpoints. Recorded configuration and network information is not automatic discovery or monitoring. Keep execution in authorized external tools. The baseline pitch relies on exact/full-text retrieval and evidence-derived document drafting; it does not require activated semantic search. Records support an explanation but do not guarantee compliance or legal protection.

## PulseDesk

Opening: “Which operational request is somebody chasing today because nobody can see who owns it?”

Discovery prompts:

1. How do equipment, facilities and supply requests reach the responsible team?
2. Where does ownership become unclear during a shift or department handoff?
3. How do requesters receive updates, and when do delays become visible?
4. What information must remain in approved clinical or specialist systems?

Recommended scenario: slide 7 for equipment coordination; slide 8 for facilities handoffs; slide 9 for supply follow-up.

Demo sequence: capture an operations-only request, set location/category, assign an owner and service target, record an internal note and requester update, then close with the operational outcome. Show target status and the workload history. Use routine operational examples with no patient information.

Ask for one department, one request category, an agreed target policy and an accountable pilot owner. Measure intake-to-ownership time, response/resolution target attainment, aged work and completeness of handoffs.

Scope boundary: PulseDesk does not replace an EHR, make clinical decisions or establish equipment safety for clinical use. Do not store patient charts, identifiers or clinical details. Direct Microsoft 365, Google Workspace, IMAP and SendGrid mailbox connections are unavailable in this release. The deck makes no HIPAA certification claim. For legal-office operations, exclude case files, court deadlines, trust accounting and confidential client matters.

## Commercial conversation

The current source package is one flagship per organization, five included seats, one selected eligible organization-wide companion and monthly billing. The OperatorOS home base is free. FaultlineLab, TorqueShed and Operator Pool Hall are free with any account.

The public pricing page and its rendered browser view were checked on 5 October 2026. The dynamic flagship prices and totals displayed **Price unavailable**. Therefore, the sales slides deliberately present package structure and direct the buyer to a confirmed quote; they contain no unverified base-price offer.

Internal catalog reference only: `packages/sdk/src/products.ts` lists TradeFlowKit at $149/month, TechDeck at $99/month and PulseDesk at $149/month; extra companions at $29/month and extra seats at $15/month. Validate the actual current quote, provider/usage charges and final checkout before committing to a price. Do not describe the proposed pilot as free or included onboarding unless separately agreed.

Public references: [Plans](https://operatoros.net/pricing), [Trade companies](https://operatoros.net/for/trades), [MSPs](https://operatoros.net/for/msps), [Healthcare and office operations](https://operatoros.net/for/healthcare-legal), [Contact](https://operatoros.net/john).

## Presenter preparation

Use a dedicated authorized demo workspace with synthetic records and known role permissions. Walk the selected flow end to end before the meeting. Confirm external services separately from the in-product record. If the demo is not ready, use the deck’s workflow diagrams and agree a follow-up demonstration; do not imply that the conceptual diagrams are product screenshots.

The repository release gate records published v65 evidence and disabled semantic activation. Later OpenAI changes have local provider checks, while hosted recovery/publication and authenticated target acceptance remain separate in implementation status. Scope the meeting to supported workflows; validate any AI or external-provider requirement before offering it as live.

## File and rendering notes

PowerPoint text, shapes, connectors, numbers and diagrams are editable. Cover photos and the canonical OperatorOS mark are image assets. The presentations use Segoe UI and Consolas. The PDFs embed the fonts and provide fixed, presentation-ready rendering with bookmarks and clickable links.

PDF and PowerPoint are generated from the same layout definitions. All 60 PDF pages were rendered, the full contact sheets and representative full-size slides were visually reviewed, and all 60 PowerPoint slide structures and notes were checked. No desktop PowerPoint or LibreOffice rendering engine was available for a native application render; the PDF is the verified visual reference.

The source bundle contains the complete reproducible generator, narrative content, original-compatible brand asset copies, layout manifests and quality records. It contains no credentials or customer data.
