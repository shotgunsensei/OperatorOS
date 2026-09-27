# Phase 4 browser evidence

Captured on 2026-09-27 from the final aggregate production-artifact browser run
on Windows, using Chromium, task-owned disposable PostgreSQL and canonical-host
loopback TLS. These images contain synthetic incident/user/tenant data only.
They are review evidence, not replacements for existing visual baselines.

| Capture | State |
| --- | --- |
| [Desktop preview](draft-preview-desktop.png) | 1440px incident detail and nonpersistent evidence preview |
| [Mobile preview](draft-preview-mobile.png) | 390px full incident detail, preview and explicit audience acknowledgement |
| [Mobile document editor](document-editor-mobile.png) | Edited version 2 with source reference and revision history |
| [Published document](document-published-desktop.png) | Version 6, two linked incidents and internal publication |
| [Linked knowledge](linked-knowledge-desktop.png) | Desktop library with published status and provenance |
| [Stale source on mobile](linked-knowledge-stale-mobile.png) | Source revision 2 with retained revision 1 guidance and visible warning |

The Playwright journey also checks zero preview persistence, edit/link/workflow
mutations, six stored document revisions, exact-host authentication, embedded
deep-link refresh in another tenant, zero page errors, WCAG 2.2 AA axe checks
and no horizontal overflow. See [the review](../../resolution-intelligence-phase4-review.md)
and [the exact verification record](../../../IMPLEMENTATION_STATUS.md).
