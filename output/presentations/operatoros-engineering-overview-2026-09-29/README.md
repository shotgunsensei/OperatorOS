# OperatorOS engineering overview

The finished presentation is **OperatorOS_Engineering_Overview_2026-09-29.pdf**.

- 38 landscape pages (1120 x 700 PDF points).
- 13 applications, each with eight grouped feature entries and three illustrative case studies.
- Three additional platform scenarios: 42 scenarios in total.
- Platform/runtime diagrams, ten connected workflow contracts, a Resolution Intelligence deep dive, and a proposed 45-minute engineering walkthrough.
- Selectable text, embedded fonts, 38 PDF outline entries, clickable module navigation, and 28 pinned repository references.

Use page 3 as a clickable application index. Pages 8–33 contain the application chapters. For an IT/MSP discussion, begin with pages 4–7, TechDeck on pages 10–11, Script Ops on pages 30–31, and the Resolution Intelligence discussion on page 34.

## Claim boundaries

The source snapshot is `ee9ca05e8346bdb1770932029ae8a9a8d682ef0f` on 2026-09-29. The document describes source capabilities and attributes historical tests and publication evidence to repository records. It is not a new live audit. No application code, provider setting, deployment, customer record, or database was changed to produce this document.

All case studies are illustrative scenarios. Their outputs are expected workflow artifacts; the measurements are proposed pilot checks, not fabricated customer outcomes. OutCall remains unavailable. TechDeck semantic retrieval is implemented in the source snapshot with provider activation disabled. The document retains independent provider, write, role, and deployment acceptance boundaries.

## Editable sources

- `modules.json`: module features, workflow steps, boundaries, and all 39 module scenarios.
- `Module_Features_and_Case_Studies.md`: readable copy for revision or reuse.
- `build_overview.py`: presentation content, typography, diagrams, layout, and PDF generation.
- `source_manifest.json`: source paths, pinned URLs, and SHA-256 hashes.
- `page_index.json`: page-to-topic map.
- `validation.json`: content counts and PDF identity.
- `quality_check.json`: independent PDF geometry, font, link, and full-content checks.
- `previews/`: rendered pages and contact sheets used for visual inspection.

The reproducible builder uses ReportLab, pypdf, pypdfium2, Pillow, Windows Segoe UI/Consolas fonts, and the existing repository logo. From this repository root:

```powershell
& 'C:\Users\John Xodus\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' output/presentations/operatoros-engineering-overview-2026-09-29/build_overview.py
```

The source bundle expects the OperatorOS repository and Windows fonts; the PDF itself is portable and requires no repository access to read. Clicking source references requires access to the GitHub repository.
