# OperatorOS — Show Your Work

**Final presentation:** `OperatorOS_MSP_Show_Your_Work.pdf`

This revised 33-page PDF answers: **“How can I use OperatorOS to cover my ass?”** It is written for MSP engineers, service leads, and owners. It replaces a catalog-first presentation with a practical explanation of service accountability: retain what was known, requested, authorized, done, tested, communicated, and left unresolved.

## Contents

- Pages 1–7: the direct answer, dispute-to-record map, evidence architecture, before/during/after procedure, approval distinctions, and a synthetic closeout example.
- Pages 8–13: six detailed illustrative disputes: change blame, ignored warnings, disputed authorization, unperformed validation, lost handoff context, and disputed billing.
- Pages 14–17: recommended review packet, record/privacy/AI limits, clickable module relevance map, and a proposed pilot.
- Pages 18–30: all 13 applications, 104 grouped feature entries, and three short scenarios per application.
- Pages 31–33: practical boundaries and pinned source references.

There are 45 illustrative scenarios in total: six detailed MSP cases and 39 short module scenarios. No scenario is presented as a measured customer outcome. All company/device examples are synthetic.

## How to present it

For a 15-minute coworker introduction, use pages 1–6, one relevant case from pages 8–13, and pages 16–17. Keep the module field guide available for questions. For a fuller engineering discussion, include the closeout example, evidence architecture, and the TechDeck, SnapProofOS, and Script Ops profiles on pages 18–20.

## Claim boundaries

The product review is grounded in reference commit `737a9d0fa18267c33fb01732ef5be4626e96c1e5` from 2026-09-29, including the publication record for application source `ee9ca05e8346bdb1770932029ae8a9a8d682ef0f`. The document distinguishes built-in functionality, recommended technician procedures, and external systems/processes. It does not promise automated endpoint capture, client e-signature, blanket all-module access, legal immunity, or a particular dispute outcome. Source-state and documented deployment evidence are distinguished; the PDF creation did not perform live acceptance.

A separate release workflow completed during artifact creation. Its committed evidence now records v65 publication and 47/47 public checks. The final PDF reflects that record while retaining provider-disabled status and the pending authenticated v65 acceptance boundary. The artifact task did not modify the release workflow or its files.

The NIST reference supports the engineering rationale for records and provenance. It is not a compliance assessment, endorsement, or certification of OperatorOS.

## Editable source and validation

- `msp_content.json`: six detailed cases and the MSP framing/scenarios for each module.
- `module_profiles.json`: complete standalone module data including feature lists.
- `build_msp_pdf.py`: all presentation text, vector artwork, typography, layout, and PDF generation.
- `MSP_Playbook_Content.md`: readable case and module copy.
- `MSP_Ticket_Record_Template.md`: suggested copy/paste record structure for the team's existing process.
- `source_manifest.json`: source paths, pinned URLs, and file hashes.
- `validation.json`, `quality_check.json`: content and independent PDF checks.
- `previews/`: all rendered pages plus contact sheets used for visual review.

Rebuild from the repository root using the bundled Python runtime:

```powershell
& 'C:\Users\John Xodus\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' output/presentations/operatoros-msp-accountability-2026-09-29/build_msp_pdf.py
& 'C:\Users\John Xodus\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' output/presentations/operatoros-msp-accountability-2026-09-29/check_msp_pdf.py
```

The portable PDF has embedded fonts and selectable text. Rebuilding requires ReportLab, pypdf, pypdfium2, Pillow, pdfplumber, the repository source paths, and Windows Segoe UI/Consolas fonts. Source links require repository access.
