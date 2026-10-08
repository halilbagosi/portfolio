# Graph Report - portfolio  (2026-10-06)

## Corpus Check
- 60 files · ~105,661 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 411 nodes · 756 edges · 30 communities (18 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `16e48bb9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.ts
- well.ts
- main.ts
- schema.ts
- h
- Well
- compilerOptions
- package.json
- Store
- box.ts
- Lightbox
- Stage
- Admin dashboard — design
- File map
- Motion
- Task 2 report: site reads site.json and settings
- Task 1 report: content schema, validation and site.json
- Final fix report (commit aacef00)
- Task 3 report
- task-1-brief.md
- task-2-brief.md
- task-3-brief.md
- task-4-brief.md
- task-4-report.md
- task-5-brief.md
- task-5-report.md
- task-6-brief.md
- task-6-report.md
- task-7-brief.md

## God Nodes (most connected - your core abstractions)
1. `h()` - 23 edges
2. `Store` - 17 edges
3. `compilerOptions` - 17 edges
4. `Well` - 15 edges
5. `CardStack` - 14 edges
6. `Stage` - 14 edges
7. `validate()` - 13 edges
8. `SiteContent` - 12 edges
9. `renderProjectForm()` - 11 edges
10. `Spring` - 11 edges

## Surprising Connections (you probably didn't know these)
- `validateProjects()` --indirect_call--> `field()`  [INFERRED]
  src/content/schema.ts → src/admin/fields.ts
- `refresh()` --indirect_call--> `formatIssue()`  [INFERRED]
  src/admin/main.ts → src/content/schema.ts
- `boot()` --calls--> `h()`  [EXTRACTED]
  src/admin/main.ts → src/admin/dom.ts
- `refresh()` --calls--> `h()`  [EXTRACTED]
  src/admin/main.ts → src/admin/dom.ts
- `renderList()` --calls--> `h()`  [EXTRACTED]
  src/admin/views/list.ts → src/admin/dom.ts

## Import Cycles
- None detected.

## Communities (30 total, 12 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.06
Nodes (43): Pointer, a11yButtons, box, cellAt(), chipSets, clock, closed, closeLid() (+35 more)

### Community 1 - "well.ts"
Cohesion: 0.08
Nodes (27): ProjectKind, prewarm(), Chip, ChipSet, GlassShared, LabelTex, pill(), Lid (+19 more)

### Community 2 - "main.ts"
Cohesion: 0.10
Nodes (24): api, ApiError, showIssues(), boot(), discard(), discardBtn, editor, form (+16 more)

### Community 3 - "schema.ts"
Cohesion: 0.10
Nodes (25): previewHash(), loadContent(), { projects, settings }, nextPhotoName(), shotFile(), unusedPhotos(), filled(), formatIssue() (+17 more)

### Community 4 - "h"
Cohesion: 0.23
Nodes (16): Child, h(), Props, colorsField(), field(), nextId(), rangeField(), selectField() (+8 more)

### Community 5 - "Well"
Cohesion: 0.07
Nodes (13): Spring, frame(), Card, CardStack, loader, plane, SLOT_ROT, sharpenText() (+5 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 7 - "package.json"
Cohesion: 0.11
Nodes (17): dependencies, three, devDependencies, @types/three, typescript, vite, @vitejs/plugin-basic-ssl, vitest (+9 more)

### Community 8 - "Store"
Cohesion: 0.25
Nodes (7): moveItem(), newProject(), snapshot(), Store, Tab, renderList(), SiteContent

### Community 9 - "box.ts"
Cohesion: 0.19
Nodes (14): createBox(), createShell(), createTopPlate(), ELEVATION, isPortraitViewport(), PORTRAIT, ringTmp, roundedRectShape() (+6 more)

### Community 10 - "Lightbox"
Cohesion: 0.27
Nodes (4): CARD_RADIUS, Lightbox, OpenOptions, Rect

### Community 12 - "Admin dashboard — design"
Cohesion: 0.15
Nodes (12): Admin dashboard — design, Architecture, Content file (`src/content/site.json`), Dashboard (`admin.html`, `src/admin/`), Decisions, Error handling, Goal, Out of scope (+4 more)

### Community 13 - "File map"
Cohesion: 0.18
Nodes (10): Admin Dashboard Implementation Plan, File map, Global Constraints, Task 1: Content schema, validation and `site.json`, Task 2: Site reads `site.json` and settings, Task 3: Photo-file helpers and the dev-server plugin, Task 4: Dashboard foundations (state, photos, API client, DOM helpers), Task 5: The dashboard page (list, project form, settings, preview, save) (+2 more)

### Community 16 - "Task 2 report: site reads site.json and settings"
Cohesion: 0.29
Nodes (6): Deviations, Full run, Implemented, Self-review, Task 2 report: site reads site.json and settings, TDD

### Community 18 - "Task 1 report: content schema, validation and site.json"
Cohesion: 0.33
Nodes (5): Full suite and typecheck, Implemented, Self-review, Task 1 report: content schema, validation and site.json, TDD evidence

### Community 19 - "Final fix report (commit aacef00)"
Cohesion: 0.40
Nodes (4): Changes, curl (dev server is listening on [::1]:5173 only, so 127.0.0.1 was refused (000, curl exit 7); equivalents via [::1]), Final fix report (commit aacef00), Verification

### Community 20 - "Task 3 report"
Cohesion: 0.40
Nodes (4): Commands, Concerns, Task 3 report, What was done

## Knowledge Gaps
- **130 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Project` connect `schema.ts` to `Store`, `well.ts`, `h`, `Well`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `Stage` connect `Stage` to `main.ts`, `box.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _130 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05909090909090909 - nodes in this community are weakly interconnected._
- **Should `well.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08414634146341464 - nodes in this community are weakly interconnected._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10416666666666667 - nodes in this community are weakly interconnected._
- **Should `schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10128205128205128 - nodes in this community are weakly interconnected._