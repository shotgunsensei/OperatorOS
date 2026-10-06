# OperatorOS sales decks — 5 October 2026

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
