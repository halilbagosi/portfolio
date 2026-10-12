# Graph Report - portfolio  (2026-10-12)

## Corpus Check
- 92 files · ~338,541 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 809 nodes · 1480 edges · 53 communities (35 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `43a3e5e3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.ts
- stack.ts
- Architecture
- schema.ts
- h
- Well
- compilerOptions
- package.json
- ChipSet
- box.ts
- Lightbox
- Stage
- Admin dashboard — design
- File map
- Motion
- Preview
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
- progress.md
- Task 9 report: Laser etching on first load
- Store
- textures.ts
- setFocus
- Motion
- Pointer
- Task 7 report: Space Gray anodised lid with engraved, clickable socials
- task-8-brief.md
- task-9-brief.md
- chips.ts
- Motion
- Lightbox
- Task 8 report: Etch schedule
- Well
- final-fix-brief.md
- task-10-brief.md
- task-11-brief.md
- task-12-brief.md
- setFocus
- Task 10 report: Accessibility layer and no-WebGL fallback
- Task 11 report: Dashboard "About & socials" view

## God Nodes (most connected - your core abstractions)
1. `h()` - 30 edges
2. `Lightbox` - 28 edges
3. `Well` - 20 edges
4. `Store` - 18 edges
5. `frame()` - 17 edges
6. `CardStack` - 17 edges
7. `compilerOptions` - 17 edges
8. `Orbit` - 16 edges
9. `renderAbout()` - 15 edges
10. `Lid` - 15 edges

## Surprising Connections (you probably didn't know these)
- `renderAbout()` --indirect_call--> `f()`  [INFERRED]
  src/admin/views/about.ts → src/scene/about-card.ts
- `iconEditor()` --indirect_call--> `f()`  [INFERRED]
  src/admin/views/settings.ts → src/scene/about-card.ts
- `iconEditor()` --indirect_call--> `input()`  [INFERRED]
  src/admin/views/settings.ts → src/scene/about-card.test.ts
- `validateProjects()` --indirect_call--> `project()`  [INFERRED]
  src/content/schema.ts → src/input/orbit.ts
- `engravingMaps()` --indirect_call--> `f()`  [INFERRED]
  src/scene/textures.ts → src/scene/about-card.ts

## Import Cycles
- None detected.

## Communities (53 total, 18 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.05
Nodes (37): a11yButtons, aboutBtn, aboutSection, backBtn, box, chipSets, clock, closed (+29 more)

### Community 1 - "stack.ts"
Cohesion: 0.29
Nodes (3): openLayout(), prewarm(), ChipSet

### Community 2 - "Architecture"
Cohesion: 0.10
Nodes (20): 1. Orbit controller (`src/input/orbit.ts`), 2. Gestures (`src/input/gestures.ts`), 3. Camera, lights and the box's body (`stage.ts`, `box.ts`), 4. Lid: Space Gray anodised aluminium + laser etching, 5. Underside: About (`underside.ts`, `about-card.ts`), 6. Content (`schema.ts`, `site.json`), 7. Dashboard (`src/admin/views/about.ts`), 8. Accessibility and fallback (+12 more)

### Community 3 - "schema.ts"
Cohesion: 0.22
Nodes (6): nextPhotoName(), shotFile(), unusedPhotos(), f(), adminPlugin(), HttpError

### Community 4 - "h"
Cohesion: 0.05
Nodes (85): api, ApiError, Child, h(), Props, colorsField(), field(), nextId() (+77 more)

### Community 5 - "Well"
Cohesion: 0.09
Nodes (8): Card, CardStack, easeLeave, easeMove, loader, plane, SLOT_ROT, slotPose()

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 7 - "package.json"
Cohesion: 0.11
Nodes (17): dependencies, three, devDependencies, @types/three, typescript, vite, @vitejs/plugin-basic-ssl, vitest (+9 more)

### Community 8 - "ChipSet"
Cohesion: 0.21
Nodes (4): openSizes(), stepLayout(), Rect, Well

### Community 9 - "box.ts"
Cohesion: 0.08
Nodes (21): Cadence, run(), cornerPoint(), createBox(), createShell(), createTopPlate(), ELEVATION, isPortraitViewport() (+13 more)

### Community 10 - "Lightbox"
Cohesion: 0.09
Nodes (14): errorVector(), Face, FACE_Q, faceToward(), HARD_OPEN, MIN_OPEN, Orbit, project() (+6 more)

### Community 11 - "Stage"
Cohesion: 0.18
Nodes (4): GestureHandlers, Gestures, swipeDir(), WheelSum

### Community 12 - "Admin dashboard — design"
Cohesion: 0.15
Nodes (12): Admin dashboard — design, Architecture, Content file (`src/content/site.json`), Dashboard (`admin.html`, `src/admin/`), Decisions, Error handling, Goal, Out of scope (+4 more)

### Community 13 - "File map"
Cohesion: 0.18
Nodes (10): Admin Dashboard Implementation Plan, File map, Global Constraints, Task 1: Content schema, validation and `site.json`, Task 2: Site reads `site.json` and settings, Task 3: Photo-file helpers and the dev-server plugin, Task 4: Dashboard foundations (state, photos, API client, DOM helpers), Task 5: The dashboard page (list, project form, settings, preview, save) (+2 more)

### Community 14 - "Motion"
Cohesion: 0.12
Nodes (15): File Structure, Global Constraints, Tangible Box Implementation Plan, Task 10: Accessibility layer and no-WebGL fallback, Task 11: Dashboard "About & socials" view, Task 12: Final verification, Task 1: Content model: socials, About, flip/back hints, Task 2: Orbit controller (trackball with momentum and faces) (+7 more)

### Community 15 - "Preview"
Cohesion: 0.06
Nodes (45): Spring, Project, ProjectKind, Chip, GlassShared, LabelTex, pill(), drawGlyph() (+37 more)

### Community 16 - "Task 2 report: site reads site.json and settings"
Cohesion: 0.22
Nodes (8): Concerns, Files changed, Fix 2 (yaw-only momentum still breaks the hard stop on a tilted box), Fix (review finding: lid-off flick glides past the 10 degree hard stop), Self-review, Task 2 report: Orbit controller, TDD evidence, What I did

### Community 18 - "Task 1 report: content schema, validation and site.json"
Cohesion: 0.29
Nodes (6): Concerns, Files changed, Self-review, Task 1 report: Content model (socials, About, flip/back hints), TDD evidence, What I did

### Community 20 - "Task 3 report"
Cohesion: 0.25
Nodes (7): Concerns, Files changed, main.ts adaptations, Self-review, Task 3 report: Gestures module, TDD, What I did

### Community 25 - "task-4-report.md"
Cohesion: 0.22
Nodes (8): Adaptations, Commits, Concerns (unverified visually), Files changed, Self-review, Task 4 report: Turn the box, Tests, What was done

### Community 27 - "task-5-report.md"
Cohesion: 0.20
Nodes (9): Adaptations, Files changed, Fixes 2 (re-review), Fixes (review round), Item 3 answer, Self-review / concerns, Task 5 report: Flip gestures, Underside framing, hints, dev #about, Tests (+1 more)

### Community 29 - "task-6-report.md"
Cohesion: 0.22
Nodes (8): Adaptations, Concerns, Files changed, Fixes (review round), Self-review, Task 6 report: The About card on the underside, TDD evidence, What I did

### Community 32 - "Task 9 report: Laser etching on first load"
Cohesion: 0.22
Nodes (8): Adaptations, Concerns, Files changed, Fixes (review round), Self-review, Task 9 report: Laser etching on first load, Test evidence, What I did

### Community 33 - "Store"
Cohesion: 0.06
Nodes (50): About, CardSettings, Social, showFallback(), aboutLines(), BODY, CardInput, CardLink (+42 more)

### Community 34 - "textures.ts"
Cohesion: 0.08
Nodes (12): Box, EtchLine, EtchSchedule, Ink, Row, ink(), lines, make() (+4 more)

### Community 35 - "setFocus"
Cohesion: 0.29
Nodes (6): Adaptations / concerns, Follow-up: scale must not ellipsize whole text, Follow-up: Work value cut at larger phone scale, Task 12 fix report: About card scales up to fill the card, Tests (about-card.test.ts), What was done

### Community 38 - "Task 7 report: Space Gray anodised lid with engraved, clickable socials"
Cohesion: 0.25
Nodes (7): Adaptations, Files changed, Fixes (after review), Self-review / concerns, Task 7 report: Space Gray anodised lid with engraved, clickable socials, Test evidence, What was done

### Community 41 - "chips.ts"
Cohesion: 0.23
Nodes (9): frame(), hideHint(), matchLabels(), openLid(), showHint(), showRestHints(), swapHint(), syncFaceControls() (+1 more)

### Community 43 - "Lightbox"
Cohesion: 0.13
Nodes (13): cubicBezier(), homography(), lerpQuad(), matrix3d(), Pt, Quad, rectQuad(), CARD_RADIUS (+5 more)

### Community 45 - "Task 8 report: Etch schedule"
Cohesion: 0.33
Nodes (5): Concerns (minor, none blocking), Fixes (review findings I1, M1-M6), Self-review, Task 8 report: Etch schedule, TDD evidence

### Community 46 - "Well"
Cohesion: 0.30
Nodes (13): expandedLayout(), focusSizes(), lerpSizes(), OpenShare, packLayout(), rectsFrom(), restSizes(), Sizes (+5 more)

### Community 51 - "setFocus"
Cohesion: 0.20
Nodes (14): canTurn(), cellAt(), closeLid(), layoutFor(), linkUnderPointer(), onTap(), onVertical(), openLink() (+6 more)

### Community 52 - "Task 10 report: Accessibility layer and no-WebGL fallback"
Cohesion: 0.22
Nodes (8): Adaptations from the brief, Concerns, Files changed, Fixes (review follow-up), Self-review, Task 10 report: Accessibility layer and no-WebGL fallback, Tests, What was done

### Community 53 - "Task 11 report: Dashboard "About & socials" view"
Cohesion: 0.18
Nodes (10): Adaptations from the brief, Concerns, Files changed (all committed except none left), Fix round (review), Self-review, Task 11 report: Dashboard "About & socials" view, TDD evidence, Upload verification (vite/admin-plugin.ts): no plugin change needed (+2 more)

## Knowledge Gaps
- **282 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+277 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Lightbox` connect `Lightbox` to `main.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Well` connect `ChipSet` to `main.ts`, `chips.ts`, `Well`, `Preview`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `CardStack` connect `Well` to `ChipSet`, `Preview`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _282 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `h` be split into smaller, more focused modules?**
  _Cohesion score 0.050140056022408966 - nodes in this community are weakly interconnected._