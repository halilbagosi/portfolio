# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-only `/admin` dashboard to add, edit, remove and reorder projects, manage their photos, and edit site-wide settings (identity, hints, motion), writing straight into the repo's content files.

**Architecture:** All content moves into `src/content/site.json`, validated by one shared `validate()` in `src/content/schema.ts`. A Vite plugin (`vite/admin-plugin.ts`) adds dev-only API routes (read/write content, upload photos, list/delete unused photos) and fills identity into `index.html`. The dashboard is a plain-TypeScript page served raw at `/admin` (so Vite's reload-on-change never wipes unsaved edits), with a live iframe preview of the real site.

**Tech Stack:** TypeScript, Vite 8 (dev server + plugin API), vitest, three.js site (existing). No new dependencies.

## Global Constraints

- Local only: the API and `/admin` exist only under the Vite dev server (`configureServer`), and only answer requests from the local machine (127.0.0.1 / ::1). Nothing admin-related ships in `npm run build`.
- No new dependencies (runtime or dev).
- Content file: `src/content/site.json`; photos: `public/shots/`, named `<project-id>-<n>.jpg` by the server, never by the client.
- Validation limits, verbatim from the spec: 1–12 visible projects; `id` matches `^[a-z0-9-]+$` and is unique; required non-empty `title, kind, caption, purpose, architecture, duration, status`; `kind` ∈ `iOS app | macOS app | Cross-platform app | Website`; `glow` = two `#rrggbb`; link label non-empty and href `http(s)://`; visible projects need ≥ 1 image; images are `/shots/<file>`; settings strings non-empty; `photoDwell` 0.5–10, `gyroDegrees` 5–45, `parallax` 0–2.
- Photo processing: fit within 2400 px (desktop) or 1290 px wide (phone shots, aspect < 0.75), JPEG quality 0.88; warn below 1200 px (desktop, longest side) / 900 px wide (phone).
- Never delete a photo file implicitly; only via the explicit "unused photos" action, after confirmation.
- Code style: match the repo — 2-space indent, single quotes, semicolons, comment density like `src/scene/*.ts` (explain *why*), `import type` for types (`verbatimModuleSyntax`).
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File map

| File | Responsibility |
|---|---|
| `src/content/schema.ts` | Content types, constants, `validate()`, `formatIssue()` |
| `src/content/site.json` | The content (settings + projects) |
| `src/content/test-fixture.ts` | `validContent()` for tests |
| `src/content/schema.test.ts` | Validation tests |
| `src/content/photo-files.ts` | `nextPhotoName`, `shotFile`, `unusedPhotos` (pure, shared with plugin) |
| `src/content/photo-files.test.ts` | Tests for the above |
| `src/config/projects.ts` | Loads + validates `site.json`; exports `projects`, `settings`, `loadContent` |
| `src/config/projects.test.ts` | Loader tests |
| `vite/admin-plugin.ts` | Dev API + `/admin` route + `index.html` identity tokens |
| `vite.config.ts` | Registers the plugin |
| `src/admin/admin.html`, `admin.css` | Dashboard page + styles |
| `src/admin/main.ts` | Boot, layout, save/discard, status |
| `src/admin/dom.ts` | `h()` element helper |
| `src/admin/fields.ts` | Form controls + `showIssues()` |
| `src/admin/api.ts` | Fetch wrappers |
| `src/admin/state.ts` (+ test) | `Store`, `newProject`, `moveItem` |
| `src/admin/photos.ts` (+ test) | `targetSize`, `sizeWarning`, `processPhoto` |
| `src/admin/views/list.ts` | Project list |
| `src/admin/views/project-form.ts` | Project editor |
| `src/admin/views/settings.ts` | Settings editor |
| `src/admin/views/preview.ts` | Live preview iframe |
| `src/admin/views/photo-strip.ts` | Photo management |
| `src/admin/views/housekeeping.ts` | Unused photos action |

Note: the spec put `admin.html` at the repo root; it lives at `src/admin/admin.html` and is served raw at `/admin`. A root `admin.html` would be served through Vite's HTML pipeline, which injects the HMR client — saving `site.json` would then full-reload the dashboard too and drop the selection and in-progress edits.

---

### Task 1: Content schema, validation and `site.json`

**Files:**
- Create: `src/content/schema.ts`, `src/content/site.json`, `src/content/test-fixture.ts`, `src/content/schema.test.ts`
- Modify: `tsconfig.json` (add `resolveJsonModule`)

**Interfaces:**
- Produces:
  - `type ProjectKind`, `interface Project`, `interface ProjectLink`, `interface HintPair`, `interface Settings`, `interface SiteContent`, `interface Issue { path: string; message: string; project?: string }`
  - `const KINDS: readonly ProjectKind[]`, `STATUSES`, `MAX_PROJECTS = 12`, `ID_PATTERN`, `SHOT_PATH`
  - `validate(input: unknown): Issue[]`, `formatIssue(i: Issue): string`
  - `validContent(): SiteContent` (tests only)

- [ ] **Step 1: Enable JSON imports**

In `tsconfig.json`, under `/* Bundler mode */`, add after `"allowImportingTsExtensions": true,`:

```json
    "resolveJsonModule": true,
```

- [ ] **Step 2: Write the schema module (types + constants, validate stubbed to fail)**

Create `src/content/schema.ts`:

```ts
/**
 * The site's content: settings plus projects, stored in src/content/site.json and edited by the
 * dashboard (/admin). One validator serves the site loader, the dev-server API and the dashboard.
 */

export const KINDS = ['iOS app', 'macOS app', 'Cross-platform app', 'Website'] as const;
export type ProjectKind = (typeof KINDS)[number];
/** Statuses with their own colour (tints.ts); others are allowed but shown neutral. */
export const STATUSES = ['Shipped', 'In progress', 'Prototype'] as const;
/** The box has this many sections at most. */
export const MAX_PROJECTS = 12;
export const ID_PATTERN = /^[a-z0-9-]+$/;
/** A photo served from public/shots (no folders, no dot-files). */
export const SHOT_PATH = /^\/shots\/(?!\.)[A-Za-z0-9._-]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const HREF = /^https?:\/\/\S+$/;

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  /** Stable slug: names the project's photo files and identifies it in the dashboard. */
  id: string;
  /** Hidden projects stay in the dashboard but are not shown on the site. */
  visible: boolean;
  title: string;
  kind: ProjectKind;
  /** Short line shown on the resting tile. */
  caption: string;
  purpose: string;
  stack: string[];
  architecture: string;
  duration: string;
  status: string;
  links: ProjectLink[];
  /** Two colours for the light glowing up from the depth of the section. */
  glow: [string, string];
  /** Interface screenshots, shown as a stack inside the section (served from /public). */
  images: string[];
}

export interface HintPair {
  desktop: string;
  touch: string;
}

export interface Settings {
  identity: { name: string; role: string; title: string; description: string };
  hints: { open: HintPair; begin: { touch: string }; section: HintPair; close: HintPair };
  motion: { photoDwell: number; gyroDegrees: number; parallax: number; lidKnock: boolean; topDownOnOpen: boolean };
}

export interface SiteContent {
  settings: Settings;
  projects: Project[];
}

/** One problem: where it is (dot path into the content), what's wrong, and which project. */
export interface Issue {
  path: string;
  message: string;
  project?: string;
}

export const formatIssue = (i: Issue) => (i.project ? `${i.project}: ${i.message}` : i.message);

/** Every problem with the content (empty when valid). Accepts anything, e.g. parsed JSON. */
export function validate(_input: unknown): Issue[] {
  return [{ path: '', message: 'not implemented' }];
}
```

- [ ] **Step 3: Create the content file**

Create `src/content/site.json` (the existing projects from `src/config/projects.ts`, plus ids and visibility):

```json
{
  "settings": {
    "identity": {
      "name": "Halil Bagosi",
      "role": "Software Engineer",
      "title": "Halil Bagosi — Software Engineer",
      "description": "Halil Bagosi, software engineer. Selected projects."
    },
    "hints": {
      "open": { "desktop": "Click to open", "touch": "Tap to open" },
      "begin": { "touch": "Tap to begin" },
      "section": { "desktop": "Click a section to open it", "touch": "Tap a section to open it" },
      "close": { "desktop": "Scroll up to close", "touch": "Swipe down to close" }
    },
    "motion": { "photoDwell": 2, "gyroDegrees": 18, "parallax": 1, "lidKnock": true, "topDownOnOpen": true }
  },
  "projects": [
    {
      "id": "snippets",
      "visible": true,
      "title": "Snippets",
      "kind": "macOS app",
      "caption": "Code snippets for macOS",
      "purpose": "A native macOS app to organize, search and live-preview code snippets.",
      "stack": ["Swift", "SwiftUI", "SwiftData", "WebKit", "Metal"],
      "architecture": "SwiftData + multi-engine previews",
      "duration": "4 months",
      "status": "In progress",
      "links": [{ "label": "GitHub", "href": "https://github.com/halilbagosi/snippets" }],
      "glow": ["#2fc8ff", "#5a5bff"],
      "images": ["/shots/snippets-1.jpg", "/shots/snippets-2.jpg", "/shots/snippets-3.jpg", "/shots/snippets-4.jpg"]
    },
    {
      "id": "palettes",
      "visible": true,
      "title": "Palettes",
      "kind": "iOS app",
      "caption": "Color palettes for iPhone and iPad",
      "purpose": "Generates color palettes with color theory and on-device Apple Intelligence.",
      "stack": ["Swift", "SwiftUI", "CloudKit", "Foundation Models", "Metal"],
      "architecture": "MVVM, iCloud sync",
      "duration": "5 months",
      "status": "In progress",
      "links": [{ "label": "GitHub", "href": "https://github.com/halilbagosi/Palettes2.0" }],
      "glow": ["#c56bff", "#ff5fae"],
      "images": ["/shots/palettes-1.jpg", "/shots/palettes-2.jpg", "/shots/palettes-3.jpg", "/shots/palettes-4.jpg"]
    },
    {
      "id": "memorylane",
      "visible": true,
      "title": "MemoryLane",
      "kind": "Cross-platform app",
      "caption": "Memory care for iOS and Android",
      "purpose": "Helps people with dementia keep recognizing loved ones through caregiver-made quizzes.",
      "stack": ["TypeScript", "React Native", "Expo", "NestJS", "PostgreSQL"],
      "architecture": "Expo app + NestJS REST API",
      "duration": "6 weeks",
      "status": "Prototype",
      "links": [{ "label": "GitHub", "href": "https://github.com/halilbagosi/memorylane" }],
      "glow": ["#2fe0a0", "#1f9fb0"],
      "images": ["/shots/memorylane-1.jpg", "/shots/memorylane-2.jpg", "/shots/memorylane-3.jpg", "/shots/memorylane-4.jpg"]
    },
    {
      "id": "artpage",
      "visible": true,
      "title": "artpage",
      "kind": "Website",
      "caption": "Art, photography and film portfolio",
      "purpose": "A triptych portfolio where art, photography and film each open into their own world.",
      "stack": ["TypeScript", "Next.js", "React", "Tailwind", "Framer Motion"],
      "architecture": "Static Next.js, markdown content",
      "duration": "4 days",
      "status": "In progress",
      "links": [{ "label": "GitHub", "href": "https://github.com/halilbagosi/artpage" }],
      "glow": ["#ffb43d", "#ff5f7a"],
      "images": ["/shots/artpage-1.jpg", "/shots/artpage-2.jpg", "/shots/artpage-3.jpg", "/shots/artpage-4.jpg"]
    }
  ]
}
```

- [ ] **Step 4: Create the test fixture**

Create `src/content/test-fixture.ts`:

```ts
import type { SiteContent } from './schema';

/** A small, valid content object; a fresh copy each call so tests can mutate it. */
export function validContent(): SiteContent {
  return {
    settings: {
      identity: { name: 'Ada Lovelace', role: 'Engineer', title: 'Ada — Engineer', description: 'Selected projects.' },
      hints: {
        open: { desktop: 'Click to open', touch: 'Tap to open' },
        begin: { touch: 'Tap to begin' },
        section: { desktop: 'Click a section', touch: 'Tap a section' },
        close: { desktop: 'Scroll up to close', touch: 'Swipe down to close' },
      },
      motion: { photoDwell: 2, gyroDegrees: 18, parallax: 1, lidKnock: true, topDownOnOpen: true },
    },
    projects: [
      {
        id: 'alpha',
        visible: true,
        title: 'Alpha',
        kind: 'iOS app',
        caption: 'First',
        purpose: 'Does alpha things.',
        stack: ['Swift'],
        architecture: 'MVVM',
        duration: '2 months',
        status: 'Shipped',
        links: [{ label: 'GitHub', href: 'https://github.com/x/alpha' }],
        glow: ['#112233', '#445566'],
        images: ['/shots/alpha-1.jpg'],
      },
      {
        id: 'beta',
        visible: true,
        title: 'Beta',
        kind: 'Website',
        caption: 'Second',
        purpose: 'Does beta things.',
        stack: [],
        architecture: 'Static',
        duration: '1 week',
        status: 'Prototype',
        links: [],
        glow: ['#aabbcc', '#ddeeff'],
        images: ['/shots/beta-1.jpg', '/shots/beta-2.jpg'],
      },
    ],
  };
}
```

- [ ] **Step 5: Write the failing tests**

Create `src/content/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatIssue, MAX_PROJECTS, validate, type SiteContent } from './schema';
import site from './site.json';
import { validContent } from './test-fixture';

/** Issues after applying one change to a valid fixture. */
function issuesAfter(change: (c: SiteContent) => void) {
  const c = validContent();
  change(c);
  return validate(c);
}

function expectIssue(change: (c: SiteContent) => void, path: string, text: string) {
  const issues = issuesAfter(change);
  const hit = issues.find((i) => i.path === path);
  expect(hit, `expected an issue at ${path}, got ${JSON.stringify(issues)}`).toBeDefined();
  expect(hit!.message).toContain(text);
}

describe('validate', () => {
  it('accepts valid content', () => {
    expect(validate(validContent())).toEqual([]);
  });

  it('accepts the real site.json', () => {
    expect(validate(site)).toEqual([]);
  });

  it('rejects non-objects', () => {
    expect(validate(null).length).toBeGreaterThan(0);
    expect(validate([]).length).toBeGreaterThan(0);
  });

  it('requires identity fields', () => {
    expectIssue((c) => (c.settings.identity.name = ' '), 'settings.identity.name', 'required');
  });

  it('requires every hint', () => {
    expectIssue((c) => (c.settings.hints.section.touch = ''), 'settings.hints.section.touch', 'required');
    expectIssue((c) => (c.settings.hints.begin.touch = ''), 'settings.hints.begin.touch', 'required');
  });

  it('keeps motion values in range', () => {
    expectIssue((c) => (c.settings.motion.photoDwell = 0.2), 'settings.motion.photoDwell', 'between 0.5 and 10');
    expectIssue((c) => (c.settings.motion.gyroDegrees = 90), 'settings.motion.gyroDegrees', 'between 5 and 45');
    expectIssue((c) => (c.settings.motion.parallax = -1), 'settings.motion.parallax', 'between 0 and 2');
  });

  it('requires motion switches to be booleans', () => {
    expectIssue((c) => ((c.settings.motion as unknown as Record<string, unknown>).lidKnock = 'yes'), 'settings.motion.lidKnock', 'on or off');
  });

  it('requires project text fields', () => {
    expectIssue((c) => (c.projects[0].title = ''), 'projects.0.title', 'required');
    expectIssue((c) => (c.projects[1].duration = '  '), 'projects.1.duration', 'required');
  });

  it('names the project in the issue', () => {
    const issue = issuesAfter((c) => (c.projects[0].caption = '')).find((i) => i.path === 'projects.0.caption')!;
    expect(issue.project).toBe('Alpha');
    expect(formatIssue(issue)).toBe('Alpha: caption is required.');
  });

  it('checks ids: format and uniqueness', () => {
    expectIssue((c) => (c.projects[0].id = 'Has Space'), 'projects.0.id', 'a–z');
    expectIssue((c) => (c.projects[1].id = 'alpha'), 'projects.1.id', 'used twice');
  });

  it('checks the kind', () => {
    expectIssue((c) => ((c.projects[0] as unknown as Record<string, unknown>).kind = 'Game'), 'projects.0.kind', 'one of');
  });

  it('checks glow colours', () => {
    expectIssue((c) => (c.projects[0].glow = ['#123', '#445566']), 'projects.0.glow', '#rrggbb');
  });

  it('checks links', () => {
    expectIssue((c) => (c.projects[0].links[0].href = 'github.com/x'), 'projects.0.links.0.href', 'http');
    expectIssue((c) => (c.projects[0].links[0].label = ''), 'projects.0.links.0.label', 'required');
  });

  it('checks stack entries', () => {
    expectIssue((c) => (c.projects[0].stack = ['Swift', '']), 'projects.0.stack', 'empty');
  });

  it('checks photo paths, including traversal', () => {
    expectIssue((c) => (c.projects[0].images = ['/elsewhere/a.jpg']), 'projects.0.images', '/shots/');
    expectIssue((c) => (c.projects[0].images = ['/shots/../x.jpg']), 'projects.0.images', '/shots/');
  });

  it('needs a photo for visible projects only', () => {
    expectIssue((c) => (c.projects[0].images = []), 'projects.0.images', 'at least one photo');
    expect(
      issuesAfter((c) => {
        c.projects[0].images = [];
        c.projects[0].visible = false;
      }),
    ).toEqual([]);
  });

  it('needs at least one visible project', () => {
    expectIssue((c) => c.projects.forEach((p) => (p.visible = false)), 'projects', 'At least one');
  });

  it(`allows at most ${MAX_PROJECTS} visible projects`, () => {
    expectIssue(
      (c) => {
        const base = c.projects[0];
        c.projects = Array.from({ length: MAX_PROJECTS + 1 }, (_, i) => ({ ...base, id: `p${i}` }));
      },
      'projects',
      `At most ${MAX_PROJECTS}`,
    );
  });
});
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/content/schema.test.ts`
Expected: FAIL — e.g. `accepts valid content` gets `[{ path: '', message: 'not implemented' }]`.

- [ ] **Step 7: Implement `validate`**

In `src/content/schema.ts`, replace the stub `validate` with:

```ts
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** Every problem with the content (empty when valid). Accepts anything, e.g. parsed JSON. */
export function validate(input: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isObj(input)) return [{ path: '', message: 'Content must be an object with settings and projects.' }];
  validateSettings(input.settings, issues);
  validateProjects(input.projects, issues);
  return issues;
}

function validateSettings(s: unknown, issues: Issue[]) {
  if (!isObj(s)) {
    issues.push({ path: 'settings', message: 'Settings are missing.' });
    return;
  }
  const { identity, hints, motion } = s;
  if (!isObj(identity)) issues.push({ path: 'settings.identity', message: 'Identity is missing.' });
  else
    for (const k of ['name', 'role', 'title', 'description'])
      if (!filled(identity[k])) issues.push({ path: `settings.identity.${k}`, message: `${k} is required.` });

  if (!isObj(hints)) issues.push({ path: 'settings.hints', message: 'Hints are missing.' });
  else {
    for (const k of ['open', 'section', 'close']) {
      const pair = hints[k];
      for (const d of ['desktop', 'touch'])
        if (!isObj(pair) || !filled(pair[d])) issues.push({ path: `settings.hints.${k}.${d}`, message: 'This hint is required.' });
    }
    const begin = hints.begin;
    if (!isObj(begin) || !filled(begin.touch)) issues.push({ path: 'settings.hints.begin.touch', message: 'This hint is required.' });
  }

  if (!isObj(motion)) issues.push({ path: 'settings.motion', message: 'Motion settings are missing.' });
  else {
    const range = (k: string, lo: number, hi: number) => {
      const v = motion[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi)
        issues.push({ path: `settings.motion.${k}`, message: `Must be between ${lo} and ${hi}.` });
    };
    range('photoDwell', 0.5, 10);
    range('gyroDegrees', 5, 45);
    range('parallax', 0, 2);
    for (const k of ['lidKnock', 'topDownOnOpen'])
      if (typeof motion[k] !== 'boolean') issues.push({ path: `settings.motion.${k}`, message: 'Must be on or off.' });
  }
}

function validateProjects(list: unknown, issues: Issue[]) {
  if (!Array.isArray(list)) {
    issues.push({ path: 'projects', message: 'Projects must be a list.' });
    return;
  }
  const ids = new Set<string>();
  let visible = 0;
  list.forEach((p: unknown, i) => {
    const at = (field: string) => `projects.${i}.${field}`;
    if (!isObj(p)) {
      issues.push({ path: `projects.${i}`, message: `Project ${i + 1} is not an object.` });
      return;
    }
    const project = filled(p.title) ? String(p.title) : `Project ${i + 1}`;
    const add = (field: string, message: string) => issues.push({ path: at(field), message, project });

    if (typeof p.id !== 'string' || !ID_PATTERN.test(p.id)) add('id', 'id may only use a–z, 0–9 and dashes.');
    else if (ids.has(p.id)) add('id', `id "${p.id}" is used twice.`);
    else ids.add(p.id);
    if (typeof p.visible !== 'boolean') add('visible', 'visible must be on or off.');
    for (const k of ['title', 'caption', 'purpose', 'architecture', 'duration', 'status']) if (!filled(p[k])) add(k, `${k} is required.`);
    if (!(KINDS as readonly unknown[]).includes(p.kind)) add('kind', `kind must be one of ${KINDS.join(', ')}.`);
    if (!Array.isArray(p.stack) || !p.stack.every(filled)) add('stack', 'Stack entries cannot be empty.');
    if (!Array.isArray(p.glow) || p.glow.length !== 2 || !p.glow.every((g) => typeof g === 'string' && HEX.test(g)))
      add('glow', 'Glow needs two #rrggbb colours.');
    if (!Array.isArray(p.links)) add('links', 'Links must be a list.');
    else
      p.links.forEach((l: unknown, j) => {
        if (!isObj(l) || !filled(l.label)) add(`links.${j}.label`, `Link ${j + 1}: label is required.`);
        if (!isObj(l) || typeof l.href !== 'string' || !HREF.test(l.href)) add(`links.${j}.href`, `Link ${j + 1}: needs an http(s):// address.`);
      });
    if (!Array.isArray(p.images) || !p.images.every((s) => typeof s === 'string' && SHOT_PATH.test(s)))
      add('images', 'Photos must be /shots/<file> paths.');
    else if (p.visible === true && p.images.length === 0) add('images', 'A visible project needs at least one photo.');
    if (p.visible === true) visible++;
  });
  if (visible < 1) issues.push({ path: 'projects', message: 'At least one project must be visible.' });
  if (visible > MAX_PROJECTS)
    issues.push({ path: 'projects', message: `At most ${MAX_PROJECTS} projects can be visible (the box has ${MAX_PROJECTS} sections).` });
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run src/content/schema.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add tsconfig.json src/content
git commit -m "Add content schema, validator and site.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Site reads `site.json` and settings

**Files:**
- Modify: `src/config/projects.ts` (replace contents), `src/main.ts`, `src/scene/textures.ts:90-104`, `src/scene/lid.ts`, `src/scene/stack.ts:64-66,206`, `src/input/motion.ts`
- Create: `src/config/projects.test.ts`

**Interfaces:**
- Consumes: `validate`, `formatIssue`, `Project`, `ProjectKind`, `Settings`, `SiteContent` from `src/content/schema.ts`; `validContent()` from the fixture.
- Produces: `src/config/projects.ts` exports `loadContent(raw: unknown): { projects: Project[]; settings: Settings }`, `projects: Project[]` (visible only, in order), `settings: Settings`, and re-exports `type Project, ProjectKind`. `engravingMaps(w, h, name, role, scale = 1)`.

- [ ] **Step 1: Write the failing loader test**

Create `src/config/projects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validContent } from '../content/test-fixture';
import { loadContent, projects, settings } from './projects';

describe('loadContent', () => {
  it('keeps visible projects in order and drops hidden ones', () => {
    const c = validContent();
    c.projects[0].visible = false;
    expect(loadContent(c).projects.map((p) => p.id)).toEqual(['beta']);
  });

  it('throws with every problem listed', () => {
    const c = validContent();
    c.projects[0].title = '';
    c.settings.motion.parallax = 9;
    // Settings are checked before projects, so their issues come first.
    expect(() => loadContent(c)).toThrow(/site\.json is invalid[\s\S]*between 0 and 2[\s\S]*title is required/);
  });

  it('loads the real content', () => {
    expect(projects.length).toBeGreaterThan(0);
    expect(settings.identity.name.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/config/projects.test.ts`
Expected: FAIL — `loadContent` is not exported.

- [ ] **Step 3: Replace the loader**

Replace the whole of `src/config/projects.ts` with:

```ts
import raw from '../content/site.json';
import { formatIssue, validate, type Project, type Settings, type SiteContent } from '../content/schema';

export type { Project, ProjectKind } from '../content/schema';

/**
 * Validates content and returns what the site shows: visible projects in order, and settings.
 * Content is edited in the dashboard (/admin) or by hand in src/content/site.json.
 */
export function loadContent(input: unknown): { projects: Project[]; settings: Settings } {
  const issues = validate(input);
  if (issues.length) throw new Error(`src/content/site.json is invalid:\n- ${issues.map(formatIssue).join('\n- ')}`);
  const content = input as SiteContent;
  return { projects: content.projects.filter((p) => p.visible), settings: content.settings };
}

export const { projects, settings } = loadContent(raw);
```

- [ ] **Step 4: Run the loader test**

Run: `npx vitest run src/config/projects.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Identity on the lid engraving**

In `src/scene/textures.ts`, change the `engravingMaps` signature and the two hard-coded lines:

```ts
export function engravingMaps(w: number, h: number, name: string, role: string, scale = 1) {
```

```ts
  drawTracked(hc, name.toUpperCase(), w / 2, y, u * 0.85);
  hc.font = `500 ${u * 1.35}px ${FONT}`;
  drawTracked(hc, role.toUpperCase(), w / 2, y + u * 3.3, u * 0.7);
```

In `src/scene/lid.ts`, add the import and pass identity:

```ts
import { settings } from '../config/projects';
```

```ts
    const { height, mask } = engravingMaps(res, Math.round(res * aspect), settings.identity.name, settings.identity.role, PORTRAIT ? 1.3 : 1);
```

- [ ] **Step 6: Lid knock switch**

In `src/scene/lid.ts`, in `update`, change the knock condition to:

```ts
    if (!this.reduced && settings.motion.lidKnock && this.state === 'closed' && time > this.nextKnock) {
```

- [ ] **Step 7: Photo dwell**

In `src/scene/stack.ts`, add the import:

```ts
import { settings } from '../config/projects';
```

and replace the `DWELL` constant (lines 64–65):

```ts
/** How long each photo stays on top before the next flip, once it has arrived (s); set in the dashboard. */
const DWELL = settings.motion.photoDwell;
```

- [ ] **Step 8: Gyro range**

In `src/input/motion.ts`, add at the top:

```ts
import { settings } from '../config/projects';
```

and in `update`, replace both `/ 18` divisors:

```ts
    const range = settings.motion.gyroDegrees; // degrees of tilt for the full effect
    const tx = Math.max(-1, Math.min(1, (this.rawX - this.baseX) / range));
    const ty = Math.max(-1, Math.min(1, (this.rawY - this.baseY) / range));
```

- [ ] **Step 9: Hints, parallax, top-down and the screen-reader text in `main.ts`**

Change the import:

```ts
import { projects, settings } from './config/projects';
```

Replace the hint block (currently lines 46–50):

```ts
// iOS asks for motion access on the first tap, which then only wakes the lid (see the click handler).
const copy = settings.hints;
let openHint = touch ? (motion.needsPermission ? copy.begin.touch : copy.open.touch) : copy.open.desktop;
const closeHint = touch ? copy.close.touch : copy.close.desktop;
const sectionHint = touch ? copy.section.touch : copy.section.desktop;
hint.textContent = openHint;
```

Replace both occurrences of `(openHint = hint.textContent = 'Tap to open')` with:

```ts
(openHint = hint.textContent = copy.open.touch)
```

In `setFocus`, replace the `stage.setView(...)` line:

```ts
  stage.setView(i < 0 || !settings.motion.topDownOnOpen ? null : rects[i], reduced);
```

Replace `openBtn.textContent = 'Open the box: Halil Bagosi, software engineer';` with:

```ts
openBtn.textContent = `Open the box: ${settings.identity.name}, ${settings.identity.role}`;
```

Replace `const par = reduced ? 0 : 1;` with:

```ts
  const par = reduced ? 0 : settings.motion.parallax;
```

- [ ] **Step 10: Run everything**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (layout 72 + schema 18 + loader 3 = 93).

- [ ] **Step 11: Check the site still looks and behaves the same**

With the dev server running, open `http://localhost:5173/`: the lid reads "HALIL BAGOSI / SOFTWARE ENGINEER", the hint reads "Click to open", opening and clicking a section works, and photos flip every ~2 s while hovering a stack.

- [ ] **Step 12: Commit**

```bash
git add src/config src/main.ts src/scene/textures.ts src/scene/lid.ts src/scene/stack.ts src/input/motion.ts
git commit -m "Load projects and settings from site.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Photo-file helpers and the dev-server plugin

**Files:**
- Create: `src/content/photo-files.ts`, `src/content/photo-files.test.ts`, `vite/admin-plugin.ts`
- Modify: `vite.config.ts`, `index.html`

**Interfaces:**
- Consumes: `ID_PATTERN`, `SHOT_PATH`, `validate`, `formatIssue`, `SiteContent` from schema.
- Produces:
  - `nextPhotoName(id: string, existing: string[]): string`, `shotFile(path: string): string | null`, `unusedPhotos(content: SiteContent, files: string[]): string[]`
  - HTTP API (dev only, localhost only):
    - `GET /__admin/content` → `SiteContent`
    - `PUT /__admin/content` (JSON body) → `{ ok: true }` | 422 `{ errors: string[] }`
    - `POST /__admin/photo?project=<id>` (body `image/jpeg`) → `{ path: string }` | 4xx `{ errors: string[] }`
    - `GET /__admin/unused-photos` → `{ files: string[] }`
    - `DELETE /__admin/unused-photos` (body `{ files: string[] }`) → `{ deleted: string[] }`
    - `GET /admin` → the dashboard HTML (raw)
  - `index.html` tokens `{{site.title}}`, `{{site.description}}`, `{{site.noscript}}`, `{{site.name}}`, `{{site.role}}`

- [ ] **Step 1: Write the failing helper tests**

Create `src/content/photo-files.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextPhotoName, shotFile, unusedPhotos } from './photo-files';
import { validContent } from './test-fixture';

describe('nextPhotoName', () => {
  it('starts at 1', () => {
    expect(nextPhotoName('alpha', [])).toBe('alpha-1.jpg');
  });

  it('goes one past the highest number in use for that project', () => {
    expect(nextPhotoName('snippets', ['snippets-1.jpg', 'snippets-4.jpg', 'palettes-9.jpg', 'snippets-x.jpg'])).toBe('snippets-5.jpg');
  });

  it('does not confuse ids that share a prefix', () => {
    expect(nextPhotoName('art', ['artpage-3.jpg'])).toBe('art-1.jpg');
  });

  it('rejects unsafe ids', () => {
    expect(() => nextPhotoName('../x', [])).toThrow();
  });
});

describe('shotFile', () => {
  it('returns the file name of a /shots path', () => {
    expect(shotFile('/shots/a-1.jpg')).toBe('a-1.jpg');
  });

  it('rejects anything outside public/shots', () => {
    expect(shotFile('/shots/../x.jpg')).toBeNull();
    expect(shotFile('/shots/.env')).toBeNull();
    expect(shotFile('/other/a.jpg')).toBeNull();
    expect(shotFile('/shots/sub/a.jpg')).toBeNull();
  });
});

describe('unusedPhotos', () => {
  it('lists image files no project uses, ignoring other files', () => {
    const files = ['alpha-1.jpg', 'beta-1.jpg', 'beta-2.jpg', 'old-1.jpg', 'notes.txt', '.DS_Store'];
    expect(unusedPhotos(validContent(), files)).toEqual(['old-1.jpg']);
  });

  it('counts hidden projects as using their photos', () => {
    const c = validContent();
    c.projects[1].visible = false;
    expect(unusedPhotos(c, ['beta-1.jpg'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/content/photo-files.test.ts`
Expected: FAIL — cannot resolve `./photo-files`.

- [ ] **Step 3: Implement the helpers**

Create `src/content/photo-files.ts`:

```ts
import { ID_PATTERN, SHOT_PATH, type SiteContent } from './schema';

/**
 * Photo file rules shared by the dev-server API and the dashboard. Names are always generated
 * here (<id>-<n>.jpg), never taken from an upload, so a request can't write outside public/shots.
 */

/** Next free name for a project's photo: one past the highest <id>-<n>.jpg already there. */
export function nextPhotoName(id: string, existing: string[]): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid project id: ${id}`);
  const own = new RegExp(`^${id}-(\\d+)\\.jpg$`); // id is [a-z0-9-] only: safe in a pattern
  let max = 0;
  for (const f of existing) {
    const m = own.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${id}-${max + 1}.jpg`;
}

/** The file name behind a /shots/<file> path, or null for anything else. */
export function shotFile(path: string): string | null {
  return SHOT_PATH.test(path) ? path.slice('/shots/'.length) : null;
}

/** Image files in public/shots that no project (visible or hidden) refers to. */
export function unusedPhotos(content: SiteContent, files: string[]): string[] {
  const used = new Set(content.projects.flatMap((p) => p.images.map(shotFile)));
  return files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('.') && !used.has(f)).sort();
}
```

- [ ] **Step 4: Run the helper tests**

Run: `npx vitest run src/content/photo-files.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the plugin**

Create `vite/admin-plugin.ts`. (Like `vite.config.ts`, this file is outside `tsconfig`'s `src` include and is not type-checked by `tsc`; all logic worth testing lives in `src/content/`.)

```ts
import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { nextPhotoName, shotFile, unusedPhotos } from '../src/content/photo-files';
import { formatIssue, ID_PATTERN, validate, type SiteContent } from '../src/content/schema';

/**
 * The content dashboard's backend. Dev server only (configureServer never runs in a build), and
 * only for requests from this machine: `npm run dev:phone` exposes the server on the network,
 * and phones must not be able to write files.
 *
 * Also fills identity tokens ({{site.title}} …) in index.html, in dev and in builds.
 */
export function adminPlugin(): Plugin {
  let root = process.cwd();
  const contentFile = () => path.join(root, 'src/content/site.json');
  const shotsDir = () => path.join(root, 'public/shots');
  const readContent = async () => JSON.parse(await readFile(contentFile(), 'utf8')) as SiteContent;

  async function route(req: IncomingMessage, res: ServerResponse, url: URL) {
    const { pathname } = url;
    const method = req.method ?? 'GET';
    if (pathname === '/__admin/content' && method === 'GET') return send(res, 200, await readContent());
    if (pathname === '/__admin/content' && method === 'PUT') return saveContent(req, res);
    if (pathname === '/__admin/photo' && method === 'POST') return savePhoto(req, res, url.searchParams.get('project') ?? '');
    if (pathname === '/__admin/unused-photos' && method === 'GET') return send(res, 200, { files: await listUnused() });
    if (pathname === '/__admin/unused-photos' && method === 'DELETE') return deleteUnused(req, res);
    throw new HttpError(404, 'Unknown admin route.');
  }

  async function saveContent(req: IncomingMessage, res: ServerResponse) {
    let body: unknown;
    try {
      body = JSON.parse((await readBody(req, 2e6)).toString('utf8'));
    } catch {
      throw new HttpError(400, 'The content is not valid JSON.');
    }
    const errors = validate(body).map(formatIssue);
    if (!errors.length) {
      // The browser can't see the disk: make sure every photo it refers to really exists.
      const files = new Set(await readdir(shotsDir()));
      for (const p of (body as SiteContent).projects)
        for (const img of p.images) if (!files.has(shotFile(img) ?? '')) errors.push(`${p.title}: photo ${img} is not in public/shots.`);
    }
    if (errors.length) return send(res, 422, { errors });
    // Write next to the target and rename: a crash mid-write can't leave a half-written file.
    const tmp = `${contentFile()}.${randomUUID()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`);
    await rename(tmp, contentFile());
    send(res, 200, { ok: true });
  }

  async function savePhoto(req: IncomingMessage, res: ServerResponse, id: string) {
    if (!ID_PATTERN.test(id)) throw new HttpError(400, 'Give the project a valid id (a–z, 0–9, dashes) before adding photos.');
    if (!(req.headers['content-type'] ?? '').startsWith('image/jpeg')) throw new HttpError(415, 'Photos must be uploaded as JPEG.');
    const data = await readBody(req, 15e6);
    if (data.length < 3 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new HttpError(415, 'That file is not a JPEG.');
    // Parallel uploads may pick the same name: 'wx' refuses to overwrite, so try the next one.
    for (let attempt = 0; attempt < 5; attempt++) {
      const name = nextPhotoName(id, await readdir(shotsDir()));
      try {
        await writeFile(path.join(shotsDir(), name), data, { flag: 'wx' });
        return send(res, 200, { path: `/shots/${name}` });
      } catch (e) {
        if ((e as { code?: string }).code !== 'EEXIST') throw e;
      }
    }
    throw new HttpError(409, 'Could not find a free file name; try again.');
  }

  async function listUnused() {
    return unusedPhotos(await readContent(), await readdir(shotsDir()));
  }

  async function deleteUnused(req: IncomingMessage, res: ServerResponse) {
    const body = JSON.parse((await readBody(req, 1e5)).toString('utf8')) as { files?: unknown };
    const asked = Array.isArray(body.files) ? body.files : [];
    // Re-check on the server: only files that are unused right now, by the saved content.
    const unused = new Set(await listUnused());
    const deleted = asked.filter((f): f is string => typeof f === 'string' && unused.has(f));
    for (const f of deleted) await unlink(path.join(shotsDir(), f));
    send(res, 200, { deleted });
  }

  return {
    name: 'portfolio-admin',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        if (!html.includes('{{site.')) return html;
        const { identity } = (await readContent()).settings;
        const values: Record<string, string> = {
          title: identity.title,
          description: identity.description,
          name: identity.name,
          role: identity.role,
          noscript: `${identity.name}, ${identity.role.toLowerCase()}. Enable JavaScript to open the box.`,
        };
        return html.replace(/\{\{site\.(\w+)\}\}/g, (token, key: string) => (key in values ? escapeHtml(values[key]) : token));
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const isAdmin = url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname.startsWith('/__admin/');
        if (!isAdmin) return next();
        if (!isLocal(req)) return send(res, 403, { errors: ['The dashboard only works on this computer.'] });
        const handle =
          url.pathname.startsWith('/__admin/')
            ? route(req, res, url)
            : // Served raw, not through Vite's HTML pipeline: no HMR client, so saving content
              // (which reloads the site) never reloads the dashboard and loses its state.
              readFile(path.join(root, 'src/admin/admin.html'), 'utf8').then((html) => {
                res.setHeader('content-type', 'text/html; charset=utf-8');
                res.end(html);
              });
        handle.catch((e: unknown) => {
          if (e instanceof HttpError) send(res, e.status, { errors: [e.message] });
          else send(res, 500, { errors: [e instanceof Error ? e.message : String(e)] });
        });
      });
    },
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isLocal(req: IncomingMessage) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, `Upload is larger than ${Math.round(limit / 1e6)} MB.`));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
```

- [ ] **Step 6: Register the plugin**

Replace `vite.config.ts` with:

```ts
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { adminPlugin } from './vite/admin-plugin';

// `npm run dev:phone` serves over HTTPS on the local network: phones only expose the motion
// sensors (tilt) to secure pages. The certificate is self-signed, so the phone warns once.
// The admin plugin adds the content dashboard (/admin) to the dev server only.
export default defineConfig(({ mode }) => ({
  plugins: [adminPlugin(), ...(mode === 'phone' ? [basicSsl({ name: 'portfolio-dev' })] : [])],
}));
```

- [ ] **Step 7: Identity tokens in `index.html`**

In `index.html` replace the identity text:

```html
    <meta name="description" content="{{site.description}}" />
    <title>{{site.title}}</title>
```

```html
    <noscript><p class="fallback">{{site.noscript}}</p></noscript>
    <div id="fallback" hidden>
      <h1>{{site.name}}</h1>
      <p>{{site.role}}</p>
```

- [ ] **Step 8: Create a placeholder dashboard page so `/admin` resolves**

Create `src/admin/admin.html` (fleshed out in Task 5):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Portfolio dashboard</title>
  </head>
  <body>
    <p>Dashboard coming soon.</p>
  </body>
</html>
```

- [ ] **Step 9: Exercise the API**

Vite restarts itself when the config changes. First make sure `localhost:5173` is this repo's server: `lsof -nP -iTCP:5173 -sTCP:LISTEN` has shown two different node processes on 5173 before (one on 127.0.0.1, one on ::1). If so, stop the stale one or run this repo's server on another port (`npx vite --port 5174`) and use that port below. Then run each and check the result:

```bash
curl -s localhost:5173/__admin/content | head -c 120
```
Expected: starts with `{"settings":{"identity":{"name":"Halil Bagosi"`.

```bash
curl -s -X PUT localhost:5173/__admin/content -H 'content-type: application/json' -d '{"settings":{},"projects":[]}' -w '\n%{http_code}\n'
```
Expected: `{"errors":[…]}` and `422`; `src/content/site.json` unchanged (`git diff --stat src/content` is empty).

```bash
curl -s -X POST 'localhost:5173/__admin/photo?project=snippets' -H 'content-type: image/jpeg' --data-binary @public/shots/snippets-1.jpg
```
Expected: `{"path":"/shots/snippets-5.jpg"}`.

```bash
curl -s localhost:5173/__admin/unused-photos
```
Expected: `{"files":["snippets-5.jpg"]}`.

```bash
curl -s -X DELETE localhost:5173/__admin/unused-photos -H 'content-type: application/json' -d '{"files":["snippets-5.jpg","snippets-1.jpg"]}'
```
Expected: `{"deleted":["snippets-5.jpg"]}` (snippets-1 is in use, so it is kept); `ls public/shots | wc -l` is 16.

```bash
curl -s -X POST 'localhost:5173/__admin/photo?project=../x' -H 'content-type: image/jpeg' --data-binary @public/shots/snippets-1.jpg -w '\n%{http_code}\n'
```
Expected: an error and `400`.

```bash
curl -s localhost:5173/ | grep -E '<title>|description'
```
Expected: `<title>Halil Bagosi — Software Engineer</title>` and the description filled in.

```bash
curl -s localhost:5173/admin | grep -c 'Portfolio dashboard'
```
Expected: `1`.

- [ ] **Step 10: Run all tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all pass (101 tests).

- [ ] **Step 11: Commit**

```bash
git add src/content/photo-files.ts src/content/photo-files.test.ts vite vite.config.ts index.html src/admin/admin.html
git commit -m "Add dev-only admin API and identity tokens in index.html

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dashboard foundations (state, photos, API client, DOM helpers)

**Files:**
- Create: `src/admin/state.ts`, `src/admin/state.test.ts`, `src/admin/photos.ts`, `src/admin/photos.test.ts`, `src/admin/api.ts`, `src/admin/dom.ts`, `src/admin/fields.ts`

**Interfaces:**
- Consumes: schema types; the HTTP API from Task 3.
- Produces:
  - `type Tab = { kind: 'project'; index: number } | { kind: 'settings' }`
  - `class Store { content: SiteContent; tab: Tab; get dirty(): boolean; change(fn: (c: SiteContent) => void): void; select(tab: Tab): void; markSaved(): void; reset(content: SiteContent): void; onChange(fn: () => void): void }`
  - `newProject(existingIds: string[]): Project`, `moveItem<T>(list: T[], from: number, to: number): void`
  - `PHONE_ASPECT = 0.75`, `targetSize(w, h): { w: number; h: number; phone: boolean }`, `sizeWarning(w, h): string | null`, `processPhoto(file: File): Promise<{ blob: Blob; w: number; h: number; warning: string | null }>`
  - `class ApiError extends Error { errors: string[] }`, `api.load(): Promise<SiteContent>`, `api.save(c): Promise<{ ok: true }>`, `api.uploadPhoto(projectId, blob): Promise<{ path: string }>`, `api.unusedPhotos(): Promise<{ files: string[] }>`, `api.deleteUnused(files): Promise<{ deleted: string[] }>`
  - `h(tag, props?, ...children)`
  - `textField(label, path, value, set, opts?)`, `selectField(label, path, value, options, set)`, `rangeField(label, path, value, range, set, hint?)`, `toggleField(label, path, value, set, hint?)`, `colorsField(label, path, value, set)`, `tagsField(label, path, values, set, hint?)`, `showIssues(root, issues)`

- [ ] **Step 1: Write the failing state and photo tests**

Create `src/admin/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validContent } from '../content/test-fixture';
import { validate } from '../content/schema';
import { moveItem, newProject, Store } from './state';

describe('Store', () => {
  it('is clean until something changes, and clean again once saved', () => {
    const s = new Store(validContent());
    expect(s.dirty).toBe(false);
    s.change((c) => (c.projects[0].title = 'Changed'));
    expect(s.dirty).toBe(true);
    s.markSaved();
    expect(s.dirty).toBe(false);
  });

  it('is clean again when a change is undone by hand', () => {
    const s = new Store(validContent());
    s.change((c) => (c.projects[0].title = 'X'));
    s.change((c) => (c.projects[0].title = 'Alpha'));
    expect(s.dirty).toBe(false);
  });

  it('notifies listeners on change and selection', () => {
    const s = new Store(validContent());
    let calls = 0;
    s.onChange(() => calls++);
    s.change(() => {});
    s.select({ kind: 'settings' });
    expect(calls).toBe(2);
  });

  it('reset replaces content and keeps the selection in range', () => {
    const s = new Store(validContent());
    s.select({ kind: 'project', index: 1 });
    const fewer = validContent();
    fewer.projects.pop();
    s.reset(fewer);
    expect(s.tab).toEqual({ kind: 'project', index: 0 });
    expect(s.dirty).toBe(false);
  });

  it('starts on settings when there are no projects', () => {
    const c = validContent();
    c.projects = [];
    expect(new Store(c).tab).toEqual({ kind: 'settings' });
  });
});

describe('newProject', () => {
  it('makes a unique, hidden draft that only lacks photos', () => {
    const p = newProject(['new-project', 'new-project-2']);
    expect(p.id).toBe('new-project-3');
    expect(p.visible).toBe(false);
    const c = validContent();
    c.projects.push(p);
    expect(validate(c)).toEqual([]);
  });
});

describe('moveItem', () => {
  it('moves an element to a new index', () => {
    const list = ['a', 'b', 'c', 'd'];
    moveItem(list, 0, 2);
    expect(list).toEqual(['b', 'c', 'a', 'd']);
    moveItem(list, 3, 0);
    expect(list).toEqual(['d', 'b', 'c', 'a']);
  });
});
```

Create `src/admin/photos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sizeWarning, targetSize } from './photos';

describe('targetSize', () => {
  it('fits desktop shots within 2400px', () => {
    expect(targetSize(3000, 2000)).toEqual({ w: 2400, h: 1600, phone: false });
  });

  it('never upscales', () => {
    expect(targetSize(1000, 600)).toEqual({ w: 1000, h: 600, phone: false });
    expect(targetSize(1179, 2556)).toEqual({ w: 1179, h: 2556, phone: true });
  });

  it('fits phone shots to 1290px wide', () => {
    expect(targetSize(1500, 3000)).toEqual({ w: 1290, h: 2580, phone: true });
  });
});

describe('sizeWarning', () => {
  it('warns about small phone shots', () => {
    expect(sizeWarning(506, 1100)).toMatch(/soft on phones/);
  });

  it('warns about small desktop shots', () => {
    expect(sizeWarning(1000, 700)).toMatch(/soft on phones/);
  });

  it('is quiet for large enough photos', () => {
    expect(sizeWarning(1179, 2556)).toBeNull();
    expect(sizeWarning(1400, 875)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/admin`
Expected: FAIL — cannot resolve `./state` / `./photos`.

- [ ] **Step 3: Implement the store**

Create `src/admin/state.ts`:

```ts
import type { Project, SiteContent } from '../content/schema';

export type Tab = { kind: 'project'; index: number } | { kind: 'settings' };

const snapshot = (c: SiteContent) => JSON.stringify(c);

/**
 * The dashboard's staged content. Edits change it in place; nothing reaches the disk until Save.
 * "Dirty" compares against the last saved snapshot, so undoing an edit by hand counts as clean.
 */
export class Store {
  content: SiteContent;
  tab: Tab;
  private saved: string;
  private listeners = new Set<() => void>();

  constructor(content: SiteContent) {
    this.content = content;
    this.saved = snapshot(content);
    this.tab = content.projects.length ? { kind: 'project', index: 0 } : { kind: 'settings' };
  }

  get dirty() {
    return snapshot(this.content) !== this.saved;
  }

  change(fn: (c: SiteContent) => void) {
    fn(this.content);
    this.emit();
  }

  select(tab: Tab) {
    this.tab = tab;
    this.emit();
  }

  markSaved() {
    this.saved = snapshot(this.content);
    this.emit();
  }

  /** Replace everything (e.g. discard: reload from disk). */
  reset(content: SiteContent) {
    this.content = content;
    this.saved = snapshot(content);
    if (this.tab.kind === 'project' && this.tab.index >= content.projects.length)
      this.tab = content.projects.length ? { kind: 'project', index: 0 } : { kind: 'settings' };
    this.emit();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

/** A hidden draft with a unique id; valid except that it has no photos yet (fine while hidden). */
export function newProject(existingIds: string[]): Project {
  let id = 'new-project';
  for (let n = 2; existingIds.includes(id); n++) id = `new-project-${n}`;
  return {
    id,
    visible: false,
    title: 'New project',
    kind: 'iOS app',
    caption: 'One line about it',
    purpose: 'What it does, and for whom.',
    stack: [],
    architecture: 'How it is built',
    duration: '1 month',
    status: 'In progress',
    links: [],
    glow: ['#2fc8ff', '#5a5bff'],
    images: [],
  };
}

export function moveItem<T>(list: T[], from: number, to: number) {
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}
```

- [ ] **Step 4: Implement photo processing**

Create `src/admin/photos.ts`:

```ts
/** Below this width/height a screenshot is a phone screenshot (same threshold as the card corners). */
export const PHONE_ASPECT = 0.75;

/**
 * Output size for an uploaded photo. Desktop shots fit within 2400px, phone shots within 1290px
 * wide: sharp on a 3x phone in the viewer, without shipping camera-sized files. Never upscales.
 */
export function targetSize(w: number, h: number) {
  const phone = w / h < PHONE_ASPECT;
  const k = phone ? Math.min(1, 1290 / w) : Math.min(1, 2400 / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k), phone };
}

/** A warning when a photo is too small to look sharp on a phone, else null. */
export function sizeWarning(w: number, h: number): string | null {
  const phone = w / h < PHONE_ASPECT;
  const small = phone ? w < 900 : Math.max(w, h) < 1200;
  if (!small) return null;
  return `Only ${w}×${h}px — may look soft on phones (aim for ${phone ? '900px wide' : '1200px'} or more).`;
}

/** Decode any image the browser can read, downscale it, and encode it as JPEG. */
export async function processPhoto(file: File) {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This browser cannot read that image (try JPEG or PNG).');
  });
  const { w, h } = targetSize(bitmap.width, bitmap.height);
  const warning = sizeWarning(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', 0.88),
  );
  return { blob, w, h, warning };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/admin`
Expected: PASS (13 tests).

- [ ] **Step 6: API client**

Create `src/admin/api.ts`:

```ts
import type { SiteContent } from '../content/schema';

/** A failed request, carrying the server's list of problems. */
export class ApiError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('\n'));
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { errors?: string[] };
  if (!res.ok) throw new ApiError(body.errors ?? [`${res.status} ${res.statusText}`]);
  return body as T;
}

const send = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** The dev server's admin routes (vite/admin-plugin.ts). */
export const api = {
  load: () => fetch('/__admin/content').then((r) => json<SiteContent>(r)),
  save: (c: SiteContent) => fetch('/__admin/content', send('PUT', c)).then((r) => json<{ ok: true }>(r)),
  uploadPhoto: (projectId: string, blob: Blob) =>
    fetch(`/__admin/photo?project=${encodeURIComponent(projectId)}`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: blob,
    }).then((r) => json<{ path: string }>(r)),
  unusedPhotos: () => fetch('/__admin/unused-photos').then((r) => json<{ files: string[] }>(r)),
  deleteUnused: (files: string[]) => fetch('/__admin/unused-photos', send('DELETE', { files })).then((r) => json<{ deleted: string[] }>(r)),
};
```

- [ ] **Step 7: DOM helper**

Create `src/admin/dom.ts`:

```ts
type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown>;

/**
 * Tiny element builder. `onclick`-style props become listeners, `class` sets the class name,
 * known DOM properties are assigned (value, checked, draggable…), anything else is an attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el) (el as unknown as Props)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
```

- [ ] **Step 8: Form fields**

Create `src/admin/fields.ts`:

```ts
import type { Issue } from '../content/schema';
import { h } from './dom';

/**
 * Form controls. Each is a `.field` with `data-path` (its dot path in the content, matching
 * validation issues) and an error slot, so showIssues() can mark it.
 */

let uid = 0;
const nextId = () => `f${++uid}`;

function field(label: string, path: string, control: HTMLElement, hint?: string, forId?: string) {
  return h(
    'div',
    { class: 'field', 'data-path': path },
    forId ? h('label', { class: 'field-label', for: forId }, label) : h('span', { class: 'field-label' }, label),
    control,
    hint ? h('small', { class: 'field-hint' }, hint) : null,
    h('small', { class: 'field-error' }),
  );
}

export function textField(
  label: string,
  path: string,
  value: string,
  set: (v: string) => void,
  o: { hint?: string; multiline?: boolean; suggestions?: readonly string[]; type?: string } = {},
) {
  const id = nextId();
  const input = o.multiline ? h('textarea', { id, rows: 3 }) : h('input', { id, type: o.type ?? 'text' });
  input.value = value;
  input.addEventListener('input', () => set(input.value));
  const el = field(label, path, input, o.hint, id);
  if (o.suggestions) {
    const listId = nextId();
    input.setAttribute('list', listId);
    el.append(h('datalist', { id: listId }, ...o.suggestions.map((s) => h('option', { value: s }))));
  }
  return el;
}

export function selectField(label: string, path: string, value: string, options: readonly string[], set: (v: string) => void) {
  const id = nextId();
  const select = h('select', { id }, ...options.map((v) => h('option', { value: v, selected: v === value }, v)));
  select.addEventListener('change', () => set(select.value));
  return field(label, path, select, undefined, id);
}

export function rangeField(
  label: string,
  path: string,
  value: number,
  r: { min: number; max: number; step: number; unit?: string },
  set: (v: number) => void,
  hint?: string,
) {
  const id = nextId();
  const range = h('input', { id, type: 'range', min: r.min, max: r.max, step: r.step });
  const num = h('input', { type: 'number', min: r.min, max: r.max, step: r.step, 'aria-label': label });
  range.value = num.value = String(value);
  const sync = (from: HTMLInputElement, to: HTMLInputElement) => {
    to.value = from.value;
    const v = Number(from.value);
    if (from.value !== '' && Number.isFinite(v)) set(v);
  };
  range.addEventListener('input', () => sync(range, num));
  num.addEventListener('input', () => sync(num, range));
  const row = h('div', { class: 'range-row' }, range, num, r.unit ? h('span', { class: 'field-hint' }, r.unit) : null);
  return field(label, path, row, hint, id);
}

export function toggleField(label: string, path: string, value: boolean, set: (v: boolean) => void, hint?: string) {
  const id = nextId();
  const box = h('input', { id, type: 'checkbox', checked: value });
  box.addEventListener('change', () => set(box.checked));
  return h(
    'div',
    { class: 'field toggle', 'data-path': path },
    h('div', { class: 'row' }, box, h('label', { for: id }, label)),
    hint ? h('small', { class: 'field-hint' }, hint) : null,
    h('small', { class: 'field-error' }),
  );
}

export function colorsField(label: string, path: string, value: [string, string], set: (v: [string, string]) => void) {
  const inputs = value.map((c, i) => h('input', { type: 'color', value: c, 'aria-label': `${label} ${i + 1}` }));
  for (const input of inputs) input.addEventListener('input', () => set([inputs[0].value, inputs[1].value]));
  return field(label, path, h('div', { class: 'colors' }, ...inputs), 'The light glowing up from the section, left to right.');
}

/** Chips with an input: Enter or comma adds, × or Backspace on an empty input removes. */
export function tagsField(label: string, path: string, values: string[], set: (v: string[]) => void, hint?: string) {
  const id = nextId();
  const list = [...values];
  const input = h('input', { id, type: 'text', placeholder: 'Add, then press Enter' });
  const box = h('div', { class: 'tags' });
  const commit = () => {
    set([...list]);
    draw();
    input.focus();
  };
  const draw = () =>
    box.replaceChildren(
      ...list.map((t, i) =>
        h(
          'span',
          { class: 'tag' },
          t,
          h('button', { class: 'icon', type: 'button', 'aria-label': `Remove ${t}`, onclick: () => (list.splice(i, 1), commit()) }, '×'),
        ),
      ),
      input,
    );
  const add = () => {
    for (const t of input.value.split(',').map((s) => s.trim()).filter(Boolean)) if (!list.includes(t)) list.push(t);
    input.value = '';
    commit();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      list.pop();
      commit();
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) add();
  });
  draw();
  return field(label, path, box, hint, id);
}

/** Marks the fields under `root` that have issues, with each one's first message. */
export function showIssues(root: HTMLElement, issues: Issue[]) {
  // forEach / Array.from rather than for…of: tsconfig's lib has DOM but not DOM.Iterable.
  root.querySelectorAll('.field.invalid').forEach((el) => {
    el.classList.remove('invalid');
    el.querySelector('.field-error')!.textContent = '';
  });
  for (const issue of issues) {
    const el = root.querySelector(`[data-path="${CSS.escape(issue.path)}"]`);
    if (!el) continue;
    el.classList.add('invalid');
    const slot = el.querySelector('.field-error');
    if (slot && !slot.textContent) slot.textContent = issue.message;
  }
}
```

- [ ] **Step 9: Typecheck and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all pass (114 tests).

- [ ] **Step 10: Commit**

```bash
git add src/admin
git commit -m "Add dashboard state, photo processing, API client and form fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The dashboard page (list, project form, settings, preview, save)

**Files:**
- Create: `src/admin/admin.css`, `src/admin/main.ts`, `src/admin/views/list.ts`, `src/admin/views/project-form.ts`, `src/admin/views/settings.ts`, `src/admin/views/preview.ts`
- Modify: `src/admin/admin.html` (replace placeholder)

**Interfaces:**
- Consumes: everything from Task 4; `validate`, `formatIssue`, `KINDS`, `STATUSES` from schema.
- Produces:
  - `renderList(root: HTMLElement, store: Store, rerender: () => void): void`
  - `renderProjectForm(root: HTMLElement, store: Store, index: number, cb: { rerender: () => void; refreshList: () => void }, photos: (index: number) => HTMLElement): void`
  - `renderSettings(root: HTMLElement, store: Store): void`
  - `class Preview { el: HTMLElement; show(hash: string, force?: boolean): void; reload(): void }`

- [ ] **Step 1: The page**

Replace `src/admin/admin.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Portfolio dashboard</title>
    <link rel="stylesheet" href="/src/admin/admin.css" />
  </head>
  <body>
    <div id="app"><p class="boot">Loading…</p></div>
    <script type="module" src="/src/admin/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Styles**

Create `src/admin/admin.css`:

```css
:root {
  color-scheme: dark;
  --bg: #0b0b0d;
  --panel: #141417;
  --line: rgba(255, 255, 255, 0.08);
  --text: #e8e8ed;
  --muted: rgba(235, 235, 245, 0.55);
  --accent: #4da3ff;
  --danger: #ff6961;
  --warn: #ffd60a;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 14px/1.45 ui-sans-serif, -apple-system, "SF Pro Text", Inter, sans-serif; -webkit-font-smoothing: antialiased; }
button, input, select, textarea { font: inherit; color: inherit; }
.boot { padding: 24px; color: var(--muted); }

.app { display: grid; grid-template-columns: 240px minmax(440px, 1fr) minmax(360px, 42%); grid-template-rows: auto 1fr; height: 100vh; }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.top h1 { font-size: 15px; font-weight: 600; margin: 0 10px 0 0; }
.status { color: var(--muted); font-size: 13px; }
.status.dirty { color: var(--warn); }
.status.bad { color: var(--danger); }
.spacer { flex: 1; }

.btn { border: 1px solid var(--line); background: rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 6px 12px; cursor: pointer; transition: background-color 0.15s ease, transform 0.16s var(--ease-out); }
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.45; cursor: default; transform: none; }
.btn.primary { background: var(--accent); border-color: transparent; color: #04121f; font-weight: 600; }
.btn.danger { color: var(--danger); }
.btn.small { padding: 3px 8px; font-size: 12px; }
@media (hover: hover) and (pointer: fine) { .btn:not(:disabled):hover { background-color: rgba(255, 255, 255, 0.12); } .btn.primary:not(:disabled):hover { background-color: #6cb4ff; } }

.side { border-right: 1px solid var(--line); overflow: auto; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
.side-head { display: flex; justify-content: space-between; align-items: center; padding: 2px 8px 8px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
.item { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer; user-select: none; }
.item.active { background: rgba(77, 163, 255, 0.16); }
.item.hidden-project .item-title { color: var(--muted); font-style: italic; }
.item.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
.item.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
.item.settings-item { margin-top: auto; }
@media (hover: hover) and (pointer: fine) { .item:not(.active):hover { background: rgba(255, 255, 255, 0.05); } }
.swatch { width: 14px; height: 14px; border-radius: 4px; flex: none; }
.item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon { border: 0; background: none; color: var(--muted); cursor: pointer; padding: 2px 5px; border-radius: 5px; }
@media (hover: hover) and (pointer: fine) { .icon:hover { color: var(--text); background: rgba(255, 255, 255, 0.08); } }

.editor { overflow: auto; padding: 20px 24px 64px; }
.editor-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.editor-head h2 { font-size: 20px; margin: 0; }
.section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 24px 0 10px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field-label { font-size: 12px; color: var(--muted); }
.field input[type=text], .field input[type=url], .field input[type=number], .field textarea, .field select, .tags { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; outline: none; }
.field input:focus-visible, .field textarea:focus-visible, .field select:focus-visible, .tags:focus-within { border-color: var(--accent); }
.field textarea { resize: vertical; }
.field-hint { color: var(--muted); font-size: 12px; }
.field-error { color: var(--danger); font-size: 12px; }
.field-error:empty { display: none; }
.field.invalid input, .field.invalid textarea, .field.invalid select, .field.invalid .tags, .field.invalid .photos { border-color: var(--danger); }
.row { display: flex; gap: 8px; align-items: center; }
.range-row { display: flex; gap: 10px; align-items: center; }
.range-row input[type=range] { flex: 1; accent-color: var(--accent); }
.range-row input[type=number] { width: 80px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tag { background: rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 2px 2px 2px 8px; display: flex; gap: 2px; align-items: center; }
.tags input { border: 0; background: none; outline: none; flex: 1; min-width: 140px; padding: 2px; }
.colors { display: flex; gap: 10px; }
.colors input[type=color] { width: 52px; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: none; padding: 2px; cursor: pointer; }
.link-row { display: grid; grid-template-columns: 160px 1fr auto; gap: 8px; align-items: start; }
.link-row .icon { margin-top: 24px; }

.photos { display: flex; flex-wrap: wrap; gap: 10px; border: 1px solid transparent; border-radius: 12px; }
.photo { position: relative; width: 124px; border-radius: 10px; overflow: hidden; background: var(--panel); border: 1px solid var(--line); cursor: grab; }
.photo img { display: block; width: 100%; height: 124px; object-fit: cover; }
.photo-bar { display: flex; justify-content: flex-end; gap: 2px; padding: 4px; }
.badge { position: absolute; top: 6px; left: 6px; background: rgba(0, 0, 0, 0.65); border-radius: 6px; padding: 1px 6px; font-size: 11px; }
.photo.drop-target { outline: 2px solid var(--accent); }
.dropzone { width: 124px; min-height: 158px; border: 1px dashed rgba(255, 255, 255, 0.25); border-radius: 10px; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: 12px; padding: 10px; cursor: pointer; }
.dropzone.over, .dropzone:focus-visible { border-color: var(--accent); color: var(--text); outline: none; }
.messages { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.msg.warn { color: var(--warn); }
.msg.error { color: var(--danger); }
.msg.info { color: var(--muted); }

.issues { margin: 0 0 16px; padding: 10px 12px; border: 1px solid rgba(255, 105, 97, 0.4); background: rgba(255, 105, 97, 0.08); border-radius: 10px; font-size: 13px; }
.issues ul { margin: 6px 0 0; padding-left: 18px; }
.issues:empty { display: none; }

.preview { border-left: 1px solid var(--line); display: flex; flex-direction: column; min-width: 0; }
.preview-bar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.preview-stage { flex: 1; position: relative; overflow: hidden; background: #000; }
.preview-stage iframe { position: absolute; left: 50%; top: 50%; border: 0; background: #000; transform-origin: center; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { border: 0; background: none; padding: 3px 10px; cursor: pointer; color: var(--muted); }
.seg button.on { background: rgba(255, 255, 255, 0.1); color: var(--text); }

.toast { position: fixed; bottom: 16px; left: 50%; translate: -50% 0; background: #1f1f24; border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px; opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
.toast.show { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .btn, .toast { transition: none; } }
```

- [ ] **Step 3: Project list**

Create `src/admin/views/list.ts`:

```ts
import { h } from '../dom';
import { moveItem, newProject, type Store } from '../state';

/** Projects in display order (drag to reorder), visibility toggles, add, and the Settings entry. */
export function renderList(root: HTMLElement, store: Store, rerender: () => void) {
  const { projects } = store.content;
  const tab = store.tab;
  let dragFrom = -1;

  const items = projects.map((p, i) => {
    const active = tab.kind === 'project' && tab.index === i;
    const el = h(
      'div',
      {
        class: `item${active ? ' active' : ''}${p.visible ? '' : ' hidden-project'}`,
        draggable: true,
        title: p.visible ? '' : 'Hidden: not shown on the site',
        onclick: () => {
          store.select({ kind: 'project', index: i });
          rerender();
        },
      },
      h('span', { class: 'swatch', style: `background: linear-gradient(135deg, ${p.glow[0]}, ${p.glow[1]})` }),
      h('span', { class: 'item-title' }, p.title || 'Untitled'),
      h(
        'button',
        {
          class: 'icon',
          type: 'button',
          title: p.visible ? 'Shown on the site — click to hide' : 'Hidden — click to show on the site',
          'aria-label': p.visible ? `Hide ${p.title}` : `Show ${p.title}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            store.change((c) => (c.projects[i].visible = !c.projects[i].visible));
            rerender();
          },
        },
        p.visible ? '●' : '○',
      ),
    );
    const after = (e: DragEvent) => {
      const r = el.getBoundingClientRect();
      return e.clientY > r.top + r.height / 2;
    };
    el.addEventListener('dragstart', (e) => {
      dragFrom = i;
      e.dataTransfer!.effectAllowed = 'move';
    });
    el.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      el.classList.toggle('drop-before', !after(e));
      el.classList.toggle('drop-after', after(e));
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom < 0) return;
      let to = i + (after(e) ? 1 : 0);
      if (dragFrom < to) to--;
      // Keep the same project selected wherever it ends up.
      const selected = store.tab.kind === 'project' ? store.content.projects[store.tab.index] : null;
      store.change((c) => moveItem(c.projects, dragFrom, to));
      if (selected) store.select({ kind: 'project', index: store.content.projects.indexOf(selected) });
      dragFrom = -1;
      rerender();
    });
    el.addEventListener('dragend', () => (dragFrom = -1));
    return el;
  });

  const add = h(
    'button',
    {
      class: 'icon',
      type: 'button',
      title: 'Add a project',
      'aria-label': 'Add a project',
      onclick: () => {
        store.change((c) => c.projects.push(newProject(c.projects.map((p) => p.id))));
        store.select({ kind: 'project', index: store.content.projects.length - 1 });
        rerender();
      },
    },
    '+',
  );

  const settings = h(
    'div',
    {
      class: `item settings-item${tab.kind === 'settings' ? ' active' : ''}`,
      onclick: () => {
        store.select({ kind: 'settings' });
        rerender();
      },
    },
    h('span', { class: 'item-title' }, 'Settings'),
  );

  root.replaceChildren(h('div', { class: 'side-head' }, h('span', {}, 'Projects'), add), ...items, settings);
}
```

- [ ] **Step 4: Project form**

Create `src/admin/views/project-form.ts`:

```ts
import { KINDS, STATUSES, type Project } from '../../content/schema';
import { h } from '../dom';
import { colorsField, selectField, tagsField, textField, toggleField } from '../fields';
import type { Store } from '../state';

/**
 * Editor for one project. Text edits change the store without re-rendering (keeps focus);
 * structural edits (links, delete) re-render. Photos come from `photos(index)`.
 */
export function renderProjectForm(
  root: HTMLElement,
  store: Store,
  index: number,
  cb: { rerender: () => void; refreshList: () => void },
  photos: (index: number) => HTMLElement,
) {
  const p = store.content.projects[index];
  const path = (k: string) => `projects.${index}.${k}`;
  const set =
    <K extends keyof Project>(k: K) =>
    (v: Project[K]) =>
      store.change((c) => (c.projects[index][k] = v));

  const heading = h('h2', {}, p.title || 'Untitled');
  const remove = () => {
    if (!confirm(`Delete "${p.title}"? Its photos stay on disk until you remove unused photos.`)) return;
    store.change((c) => c.projects.splice(index, 1));
    const left = store.content.projects.length;
    store.select(left ? { kind: 'project', index: Math.min(index, left - 1) } : { kind: 'settings' });
    cb.rerender();
  };

  const links = h(
    'div',
    {},
    ...p.links.map((l, j) =>
      h(
        'div',
        { class: 'link-row' },
        textField('Label', path(`links.${j}.label`), l.label, (v) => store.change((c) => (c.projects[index].links[j].label = v))),
        textField('Address', path(`links.${j}.href`), l.href, (v) => store.change((c) => (c.projects[index].links[j].href = v)), {
          type: 'url',
        }),
        h(
          'button',
          {
            class: 'icon',
            type: 'button',
            'aria-label': `Remove link ${j + 1}`,
            onclick: () => {
              store.change((c) => c.projects[index].links.splice(j, 1));
              cb.rerender();
            },
          },
          '✕',
        ),
      ),
    ),
    h(
      'button',
      {
        class: 'btn small',
        type: 'button',
        onclick: () => {
          store.change((c) => c.projects[index].links.push({ label: 'GitHub', href: 'https://github.com/' }));
          cb.rerender();
        },
      },
      'Add link',
    ),
  );

  root.replaceChildren(
    h(
      'div',
      { class: 'editor-head' },
      heading,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn danger', type: 'button', onclick: remove }, 'Delete project'),
    ),
    toggleField('Show on the site', path('visible'), p.visible, (v) => {
      set('visible')(v);
      cb.refreshList();
    }),

    h('div', { class: 'section-title' }, 'Basics'),
    h(
      'div',
      { class: 'grid2' },
      textField('Title', path('title'), p.title, (v) => {
        set('title')(v);
        heading.textContent = v || 'Untitled';
        cb.refreshList();
      }),
      textField('ID', path('id'), p.id, set('id'), { hint: 'Names its photo files: a–z, 0–9 and dashes.' }),
      selectField('Kind', path('kind'), p.kind, KINDS, (v) => set('kind')(v as Project['kind'])),
      textField('Status', path('status'), p.status, set('status'), { suggestions: STATUSES, hint: 'Shipped, In progress and Prototype get a colour.' }),
    ),
    textField('Caption', path('caption'), p.caption, set('caption'), { hint: 'The short line on the closed section.' }),
    textField('Purpose', path('purpose'), p.purpose, set('purpose'), { multiline: true, hint: 'One or two sentences, shown when the section is open.' }),

    h('div', { class: 'section-title' }, 'Details'),
    tagsField('Stack', path('stack'), p.stack, set('stack')),
    h(
      'div',
      { class: 'grid2' },
      textField('Architecture', path('architecture'), p.architecture, set('architecture')),
      textField('Built in', path('duration'), p.duration, set('duration'), { hint: 'e.g. 4 months' }),
    ),
    colorsField('Glow', path('glow'), p.glow, (v) => {
      set('glow')(v);
      cb.refreshList();
    }),

    h('div', { class: 'section-title' }, 'Links'),
    links,

    h('div', { class: 'section-title' }, 'Photos'),
    photos(index),
  );
}
```

- [ ] **Step 5: Settings form**

Create `src/admin/views/settings.ts`:

```ts
import type { Settings } from '../../content/schema';
import { h } from '../dom';
import { rangeField, textField, toggleField } from '../fields';
import type { Store } from '../state';

/** Identity, hint copy and motion tuning. Edits change the store in place; no re-render needed. */
export function renderSettings(root: HTMLElement, store: Store) {
  const s = store.content.settings;
  const edit = (fn: (s: Settings) => void) => store.change((c) => fn(c.settings));
  const hint = (label: string, key: 'open' | 'section' | 'close') =>
    h(
      'div',
      { class: 'grid2' },
      textField(`${label} — desktop`, `settings.hints.${key}.desktop`, s.hints[key].desktop, (v) => edit((x) => (x.hints[key].desktop = v))),
      textField(`${label} — touch`, `settings.hints.${key}.touch`, s.hints[key].touch, (v) => edit((x) => (x.hints[key].touch = v))),
    );

  root.replaceChildren(
    h('div', { class: 'editor-head' }, h('h2', {}, 'Settings')),

    h('div', { class: 'section-title' }, 'Identity'),
    h(
      'div',
      { class: 'grid2' },
      textField('Name', 'settings.identity.name', s.identity.name, (v) => edit((x) => (x.identity.name = v)), { hint: 'Engraved on the lid.' }),
      textField('Role', 'settings.identity.role', s.identity.role, (v) => edit((x) => (x.identity.role = v)), { hint: 'Engraved under your name.' }),
    ),
    textField('Page title', 'settings.identity.title', s.identity.title, (v) => edit((x) => (x.identity.title = v)), { hint: 'Browser tab and search results.' }),
    textField('Description', 'settings.identity.description', s.identity.description, (v) => edit((x) => (x.identity.description = v)), {
      multiline: true,
      hint: 'Search results and link previews.',
    }),

    h('div', { class: 'section-title' }, 'Hints'),
    hint('Open the box', 'open'),
    textField('Wake the lid (iPhone, first tap asks for motion)', 'settings.hints.begin.touch', s.hints.begin.touch, (v) =>
      edit((x) => (x.hints.begin.touch = v)),
    ),
    hint('Open a section', 'section'),
    hint('Put the lid back', 'close'),

    h('div', { class: 'section-title' }, 'Motion'),
    rangeField('Time on each photo', 'settings.motion.photoDwell', s.motion.photoDwell, { min: 0.5, max: 10, step: 0.5, unit: 's' }, (v) =>
      edit((x) => (x.motion.photoDwell = v)),
    ),
    rangeField(
      'Gyro range',
      'settings.motion.gyroDegrees',
      s.motion.gyroDegrees,
      { min: 5, max: 45, step: 1, unit: '°' },
      (v) => edit((x) => (x.motion.gyroDegrees = v)),
      'How far to tilt a phone for the full effect. Lower is more sensitive.',
    ),
    rangeField('Parallax', 'settings.motion.parallax', s.motion.parallax, { min: 0, max: 2, step: 0.1, unit: '×' }, (v) =>
      edit((x) => (x.motion.parallax = v)),
    ),
    toggleField('Lid knocks now and then', 'settings.motion.lidKnock', s.motion.lidKnock, (v) => edit((x) => (x.motion.lidKnock = v))),
    toggleField('Look straight down at an open section', 'settings.motion.topDownOnOpen', s.motion.topDownOnOpen, (v) =>
      edit((x) => (x.motion.topDownOnOpen = v)),
    ),
  );
}
```

- [ ] **Step 6: Preview**

Create `src/admin/views/preview.ts`:

```ts
import { h } from '../dom';

const SIZES = { desktop: { w: 1280, h: 800 }, phone: { w: 390, h: 844 } } as const;
type Mode = keyof typeof SIZES;

/**
 * The real site in an iframe, at a desktop or phone size scaled to fit. It opens on the edited
 * project through the site's dev-only #open-<index> hash. Saving content reloads it on its own
 * (Vite reloads the site when site.json changes).
 */
export class Preview {
  readonly el: HTMLElement;
  private frame = h('iframe', { title: 'Site preview' });
  private stage = h('div', { class: 'preview-stage' }, this.frame);
  private mode: Mode = 'desktop';
  private hash = '#open';
  private n = 0;

  constructor() {
    const buttons = (Object.keys(SIZES) as Mode[]).map((m) =>
      h(
        'button',
        {
          type: 'button',
          class: m === this.mode ? 'on' : '',
          onclick: () => {
            this.mode = m;
            for (const b of buttons) b.classList.toggle('on', b.textContent === m);
            this.fit();
          },
        },
        m,
      ),
    );
    this.el = h(
      'section',
      { class: 'preview' },
      h(
        'div',
        { class: 'preview-bar' },
        h('span', {}, 'Preview'),
        h('span', { class: 'spacer' }),
        h('div', { class: 'seg' }, ...buttons),
        h('button', { class: 'btn small', type: 'button', onclick: () => this.reload() }, 'Reload'),
      ),
      this.stage,
    );
    new ResizeObserver(() => this.fit()).observe(this.stage);
    this.reload();
  }

  /** Point the preview at `hash`; the site reads it on load, so a change means a reload. */
  show(hash: string, force = false) {
    if (hash === this.hash && !force) return;
    this.hash = hash;
    this.reload();
  }

  reload() {
    // A changing query makes it a real navigation (a hash-only change wouldn't reload).
    this.frame.src = `/?preview=${++this.n}${this.hash}`;
  }

  private fit() {
    const size = SIZES[this.mode];
    const r = this.stage.getBoundingClientRect();
    const s = Math.min(r.width / size.w, r.height / size.h, 1);
    Object.assign(this.frame.style, { width: `${size.w}px`, height: `${size.h}px`, transform: `translate(-50%, -50%) scale(${s})` });
  }
}
```

- [ ] **Step 7: App shell, status and save**

Create `src/admin/main.ts`:

```ts
import { formatIssue, validate } from '../content/schema';
import { api, ApiError } from './api';
import { h } from './dom';
import { showIssues } from './fields';
import { Store } from './state';
import { renderList } from './views/list';
import { Preview } from './views/preview';
import { renderProjectForm } from './views/project-form';
import { renderSettings } from './views/settings';

/**
 * The content dashboard (dev only, /admin). Edits are staged in a Store; Save validates and writes
 * src/content/site.json through the dev server, which reloads the site (and the preview).
 */

const app = document.getElementById('app')!;
const status = h('span', { class: 'status', role: 'status' });
const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => void save() }, 'Save');
const discardBtn = h('button', { class: 'btn', type: 'button', onclick: () => void discard() }, 'Discard changes');
const side = h('nav', { class: 'side', 'aria-label': 'Projects' });
const issuesBox = h('div', { class: 'issues' });
const form = h('div');
const editor = h('main', { class: 'editor' }, issuesBox, form);
const preview = new Preview();
const toastEl = h('div', { class: 'toast' });
let store: Store;
/** Problems the server reported on the last save (e.g. a missing photo file). */
let serverErrors: string[] = [];

/** Placeholder until Task 6 adds the photo strip. */
let photosView = (_index: number): HTMLElement => h('p', { class: 'field-hint' }, 'Photos are managed in the next step.');
export function setPhotosView(fn: (index: number) => HTMLElement) {
  photosView = fn;
}

function render() {
  renderList(side, store, render);
  const t = store.tab;
  if (t.kind === 'project' && store.content.projects[t.index])
    renderProjectForm(form, store, t.index, { rerender: render, refreshList: () => renderList(side, store, render) }, (i) => photosView(i));
  else renderSettings(form, store);
  refresh();
  preview.show(previewHash());
}

/** The site opened on the edited project (visible ones only); otherwise the open box. */
function previewHash() {
  const t = store.tab;
  if (t.kind !== 'project') return '#open';
  const p = store.content.projects[t.index];
  if (!p?.visible) return '#open';
  return `#open-${store.content.projects.filter((q) => q.visible).indexOf(p)}`;
}

/** Status line, problem list, field marks and button states, after any change. */
function refresh() {
  const issues = validate(store.content);
  showIssues(form, issues);
  const messages = [...serverErrors, ...issues.map(formatIssue)];
  issuesBox.replaceChildren(
    ...(messages.length
      ? [h('strong', {}, `${messages.length} problem${messages.length > 1 ? 's' : ''} to fix before saving`), h('ul', {}, ...messages.map((m) => h('li', {}, m)))]
      : []),
  );
  saveBtn.disabled = !store.dirty || issues.length > 0;
  discardBtn.disabled = !store.dirty;
  status.textContent = issues.length ? 'Fix the problems to save' : store.dirty ? 'Unsaved changes' : 'All changes saved';
  status.className = `status${issues.length ? ' bad' : store.dirty ? ' dirty' : ''}`;
}

async function save() {
  if (!store.dirty || validate(store.content).length) return refresh();
  saveBtn.disabled = true;
  status.textContent = 'Saving…';
  try {
    await api.save(store.content);
    serverErrors = [];
    store.markSaved();
    preview.show(previewHash(), true);
    toast('Saved — the site is updated');
  } catch (e) {
    serverErrors = e instanceof ApiError ? e.errors : [String(e)];
    refresh();
  }
}

async function discard() {
  if (!confirm('Discard all unsaved changes?')) return;
  store.reset(await api.load());
  serverErrors = [];
  render();
}

let toastTimer = 0;
export function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2400);
}

async function boot() {
  try {
    store = new Store(await api.load());
  } catch (e) {
    app.replaceChildren(h('p', { class: 'boot' }, `Couldn't load the content (${e instanceof Error ? e.message : e}). Is the dev server running?`));
    return;
  }
  store.onChange(refresh);
  const top = h('header', { class: 'top' }, h('h1', {}, 'Portfolio dashboard'), status, h('span', { class: 'spacer' }), discardBtn, saveBtn);
  app.replaceChildren(h('div', { class: 'app' }, top, side, editor, preview.el), toastEl);
  render();
}

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    void save();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (store?.dirty) e.preventDefault();
});

void boot();
```

- [ ] **Step 8: Typecheck and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all pass (114 tests).

- [ ] **Step 9: Check it in the browser**

Open `http://localhost:5173/admin`. Verify, in order:
1. The four projects are listed; Snippets is selected; the preview shows the site opened on Snippets.
2. Edit Snippets' caption → status shows "Unsaved changes", Save is enabled.
3. Clear the title → the field turns red with "title is required.", the problem box lists it, Save is disabled; restore it.
4. Settings → change "Open the box — desktop" to "Click the lid" → Save → toast "Saved"; the preview reloads; `git diff src/content/site.json` shows the change. Change it back and save.
5. Drag MemoryLane above Palettes → Save → the preview shows the new order; drag it back and save.
6. Click `+` → a hidden "New project" appears and is selected, with no problems listed; delete it (confirm) → back to 4 projects; status "All changes saved".
7. Make an edit, reload the page → the browser asks before leaving.

- [ ] **Step 10: Commit**

```bash
git add src/admin
git commit -m "Add the dashboard page: project list, editor, settings and live preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Photos and housekeeping

**Files:**
- Create: `src/admin/views/photo-strip.ts`, `src/admin/views/housekeeping.ts`
- Modify: `src/admin/main.ts` (use the photo strip; add the "Unused photos…" button)

**Interfaces:**
- Consumes: `api.uploadPhoto`, `api.unusedPhotos`, `api.deleteUnused`, `processPhoto`, `Store`, `moveItem`, `toast`, `setPhotosView`.
- Produces: `photoStrip(store: Store, index: number): HTMLElement`, `cleanUnusedPhotos(store: Store, toast: (m: string) => void): Promise<void>`.

- [ ] **Step 1: Photo strip**

Create `src/admin/views/photo-strip.ts`:

```ts
import { api } from '../api';
import { h } from '../dom';
import { processPhoto } from '../photos';
import { moveItem, type Store } from '../state';

/**
 * A project's photos: add (drop files or click), drag to reorder (first = top of the stack),
 * replace, remove. Uploads are resized in the browser and written to public/shots right away;
 * the project only refers to them once saved. Removing never deletes the file.
 */
export function photoStrip(store: Store, index: number): HTMLElement {
  // Hold the project itself, not its index: uploads finish later, maybe after a reorder.
  const project = store.content.projects[index];
  const strip = h('div', { class: 'photos' });
  const messages = h('div', { class: 'messages' });
  let dragFrom = -1;

  const note = (text: string, kind: 'info' | 'warn' | 'error') => {
    const line = h('div', { class: `msg ${kind}` }, text);
    messages.append(line);
    return line;
  };

  async function upload(files: File[], replaceAt = -1) {
    for (const file of files) {
      const line = note(`Adding ${file.name}…`, 'info');
      try {
        const out = await processPhoto(file);
        const { path } = await api.uploadPhoto(project.id, out.blob);
        const at = replaceAt;
        store.change(() => (at >= 0 ? (project.images[at] = path) : project.images.push(path)));
        replaceAt = -1; // only the first file replaces; any others are added
        if (out.warning) {
          line.className = 'msg warn';
          line.textContent = `${file.name}: ${out.warning}`;
        } else line.remove();
        draw();
      } catch (e) {
        line.className = 'msg error';
        line.textContent = `${file.name}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  function pick(multiple: boolean, replaceAt = -1) {
    const input = h('input', { type: 'file', accept: 'image/*', multiple });
    input.addEventListener('change', () => void upload(Array.from(input.files ?? []), replaceAt));
    input.click();
  }

  const dropzone = h('div', { class: 'dropzone', role: 'button', tabindex: 0, onclick: () => pick(true) }, 'Drop photos here, or click to add');
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(true);
    }
  });
  dropzone.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dropzone.classList.add('over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('over');
    void upload(Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/')));
  });

  function draw() {
    strip.replaceChildren(
      ...project.images.map((src, i) => {
        const card = h(
          'div',
          { class: 'photo', draggable: true },
          h('img', { src, alt: `Photo ${i + 1}`, loading: 'lazy' }),
          i === 0 ? h('span', { class: 'badge' }, 'Top') : null,
          h(
            'div',
            { class: 'photo-bar' },
            h('button', { class: 'icon', type: 'button', title: 'Replace', 'aria-label': `Replace photo ${i + 1}`, onclick: () => pick(false, i) }, '⟳'),
            h(
              'button',
              {
                class: 'icon',
                type: 'button',
                title: 'Remove from this project (the file stays until you remove unused photos)',
                'aria-label': `Remove photo ${i + 1}`,
                onclick: () => {
                  store.change(() => project.images.splice(i, 1));
                  draw();
                },
              },
              '✕',
            ),
          ),
        );
        card.addEventListener('dragstart', (e) => {
          dragFrom = i;
          e.dataTransfer!.effectAllowed = 'move';
        });
        card.addEventListener('dragover', (e) => {
          if (dragFrom < 0) return;
          e.preventDefault();
          card.classList.add('drop-target');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          if (dragFrom >= 0 && dragFrom !== i) store.change(() => moveItem(project.images, dragFrom, i));
          dragFrom = -1;
          draw();
        });
        card.addEventListener('dragend', () => (dragFrom = -1));
        return card;
      }),
      dropzone,
    );
  }

  draw();
  // The field wrapper lets validation ("needs at least one photo") mark the strip.
  return h('div', { class: 'field', 'data-path': `projects.${index}.images` }, strip, h('small', { class: 'field-error' }), messages);
}
```

- [ ] **Step 2: Housekeeping**

Create `src/admin/views/housekeeping.ts`:

```ts
import { api } from '../api';
import type { Store } from '../state';

/**
 * Deletes photo files that no saved project uses, after showing the list. Only with everything
 * saved: photos added since the last save are on disk but not yet referenced by the saved file,
 * so they would look unused.
 */
export async function cleanUnusedPhotos(store: Store, toast: (m: string) => void) {
  if (store.dirty) {
    alert('Save or discard your changes first: photos added since the last save would count as unused.');
    return;
  }
  try {
    const { files } = await api.unusedPhotos();
    if (!files.length) return toast('No unused photos');
    if (!confirm(`Delete ${files.length} photo${files.length > 1 ? 's' : ''} that no project uses?\n\n${files.join('\n')}`)) return;
    const { deleted } = await api.deleteUnused(files);
    toast(`Deleted ${deleted.length} photo${deleted.length === 1 ? '' : 's'}`);
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}
```

- [ ] **Step 3: Wire them into the app**

In `src/admin/main.ts`:

Add imports:

```ts
import { cleanUnusedPhotos } from './views/housekeeping';
import { photoStrip } from './views/photo-strip';
```

Replace the placeholder block

```ts
/** Placeholder until Task 6 adds the photo strip. */
let photosView = (_index: number): HTMLElement => h('p', { class: 'field-hint' }, 'Photos are managed in the next step.');
export function setPhotosView(fn: (index: number) => HTMLElement) {
  photosView = fn;
}
```

with nothing, and in `render()` replace `(i) => photosView(i)` with `(i) => photoStrip(store, i)`.

In `boot()`, add the button before `discardBtn`:

```ts
  const unused = h('button', { class: 'btn', type: 'button', onclick: () => void cleanUnusedPhotos(store, toast) }, 'Unused photos…');
  const top = h('header', { class: 'top' }, h('h1', {}, 'Portfolio dashboard'), status, h('span', { class: 'spacer' }), unused, discardBtn, saveBtn);
```

Change `export function toast` to `function toast` (no other module imports it).

- [ ] **Step 4: Typecheck and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all pass (114 tests).

- [ ] **Step 5: Check photos in the browser**

At `http://localhost:5173/admin`:
1. Select Palettes; drag photo 3 onto photo 1 → it becomes "Top"; Save → the preview's stack shows it first.
2. Add a photo by clicking the drop zone and choosing `public/shots/memorylane-1.jpg` (506×1100) → it appears, with a yellow "may look soft on phones" note; a new `palettes-5.jpg` exists in `public/shots/`.
3. Remove it (✕) → status "All changes saved" again if nothing else changed (the file stays).
4. Restore the original order, Save.
5. "Unused photos…" → lists `palettes-5.jpg` → confirm → toast "Deleted 1 photo"; the file is gone.
6. Add a project with `+`, give it a title, upload one photo, tick "Show on the site", Save → it appears in the preview's box. Then delete it, Save, and remove its unused photo.

- [ ] **Step 6: Commit**

```bash
git add src/admin
git commit -m "Add photo management and unused-photo cleanup to the dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification

**Files:** none (unless a check fails).

- [ ] **Step 1: Full test and type run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all pass (114 tests).

- [ ] **Step 2: Production build contains no dashboard**

Run:

```bash
npm run build && ls dist && grep -rl "__admin\|Portfolio dashboard" dist || echo "no admin in build"; grep -o '<title>[^<]*</title>' dist/index.html
```

Expected: `dist` holds `index.html`, `assets`, `shots`, `favicon.svg` only; `no admin in build`; `<title>Halil Bagosi — Software Engineer</title>`.

- [ ] **Step 3: Not reachable from another device**

With `npm run dev:phone` running, from this Mac:

```bash
curl -sk https://$(ipconfig getifaddr en0):5173/__admin/content -w '\n%{http_code}\n'
```

Expected: `{"errors":["The dashboard only works on this computer."]}` and `403` (the request arrives on the LAN address, not loopback).

- [ ] **Step 4: The site itself is unchanged**

Open `http://localhost:5173/`: lid, opening, sections, photo viewer, closing the lid all work as before.

- [ ] **Step 5: Commit any fixes**

If any step needed a fix, commit it:

```bash
git add -A
git commit -m "Fix issues found in final dashboard verification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
