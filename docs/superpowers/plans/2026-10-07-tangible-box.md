# Tangible Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3D bento box something you can grab, turn and flip. Give it a Space Gray anodised lid that a laser engraves with the owner's name, role and socials on first load. Put a recruiter-facing About card on its underside, reached by swiping up (scrolling down) with the lid on.

**Architecture:** Turning the box is drawn by orbiting the camera and its lights around the box's centre by the inverse of a trackball quaternion (`src/input/orbit.ts`). The world stays axis-aligned, so the existing shaft shader, top-plate cut-outs and plane raycasts keep working. Gestures (tap / drag / wheel / swipe) move out of `main.ts` into `src/input/gestures.ts`. The etch is a pure raster-hatch schedule (`src/scene/etch.ts`) that produces a half-float reveal-time map. The lid's material reads that map through an `onBeforeCompile` patch, and `src/scene/laser.ts` draws the spot, light and sparks. The About card is laid out by a pure function (`src/scene/about-card.ts`) and drawn on a canvas texture on a real bottom plate (`src/scene/underside.ts`).

**Tech Stack:** TypeScript 6, three.js r186 (WebGL2), Vite 8, Vitest 5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-tangible-box-design.md`

## Global Constraints

- No new dependencies.
- Code style: match the surrounding code. Comment density is high and explains *why*. Small focused files. 2-space indent, single quotes, semicolons, ~130-char lines.
- `tsconfig` has `noUnusedLocals` / `noUnusedParameters`: no unused privates, locals or parameters.
- Rotation only in the overview (lid on or off). It is disabled while a section is focused, and the top-down section view is unchanged.
- Lid off: the camera stays ≥ 20° above the top plane (hard stop 10°), and there is no flip.
- Gestures: `Open ←(scroll up / swipe down)— Lid on —(scroll down / swipe up)→ Underside`. Tap/click on the lid opens it.
- While the box is held (`orbit.engaged`), cursor and gyro tracking freeze. They ease back in over ~0.4 s.
- Lid: Space Gray anodised `#7d7e80`, roughness ~0.42 (bead-blast noise ±0.04), no anisotropy, clearcoat 0.15 / 0.5. Raw-aluminium engraving `#d9dbde`, roughness 0.55. Chamfer `#e4e6e9`, roughness 0.08.
- Etch budgets: name 1.6 s, role 0.8 s, socials 1.1 s. Travel between lines 0.15 s, empty rows 0.012 s, start delay 0.5 s, heat cools with τ 0.8 s.
- The etch is skipped under `prefers-reduced-motion`, on the `box-open` reopen reload, and on any dev hash (`#open…`, `#about`).
- Content limits: socials ≤ 4, skills 1–12, timeline ≤ 4, bio ≤ 360 chars, years an integer 0–60.
- Placeholders in `site.json` must be obviously fake (`you@example.com`, `your-handle`, `City, Country`, `20XX`).
- After code changes, run `graphify update .` (project CLAUDE.md).
- Test command: `npx vitest run`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/content/schema.ts` | modify | `Social`, `TimelineEntry`, `About`, `hints.flip/back` types and validation |
| `src/content/test-fixture.ts` | modify | Fixture gains socials, about, flip/back hints |
| `src/content/site.json` | modify | Placeholder About and socials |
| `src/content/photo-files.ts` | modify | The About portrait counts as a used photo |
| `src/config/projects.ts` | modify | The portrait path is served under the base path |
| `vite/admin-plugin.ts` | modify | Save checks that the portrait file exists |
| `src/input/orbit.ts` | create | Trackball: drag, momentum, settle to a face, limits (pure math, tested) |
| `src/input/gestures.ts` | create | Tap / drag / wheel / swipe arbitration, emits intents |
| `src/scene/stage.ts` | modify | Camera and lights orbit by the inverse quaternion; Underside framing |
| `src/scene/box.ts` | modify | Shell shaded as seen (orbit-aware), exports `roundedRectShape`, returns shell mesh and table |
| `src/scene/underside.ts` | create | Bottom plate mesh; About card texture; link hit-test |
| `src/scene/about-card.ts` | create | Pure About layout (ops + link rects) and canvas drawing |
| `src/scene/textures.ts` | modify | `beadBlastRoughness`; `engravingMaps` gains socials, line boxes and link boxes |
| `src/scene/lid.ts` | modify | Anodised material, engraving shader patch, social links, etch time |
| `src/scene/etch.ts` | create | Pure raster-hatch etch schedule and reveal times |
| `src/scene/laser.ts` | create | Laser spot, light and sparks; drives the etch time |
| `src/main.ts` | modify | Wiring: gestures → lid / orbit / focus, ambient freeze, visibility, cursor, hints, a11y, fallback |
| `index.html` | modify | Fallback About slot; nav label |
| `src/admin/state.ts` | modify | `Tab` gains `{ kind: 'about' }` |
| `src/admin/views/about.ts` | create | Dashboard "About & socials" view |
| `src/admin/views/list.ts`, `src/admin/views/settings.ts`, `src/admin/main.ts`, `src/admin/admin.css` | modify | Nav entry, flip/back hints, routing, list-editor styles |

---

### Task 1: Content model: socials, About, flip/back hints

**Files:**
- Modify: `src/content/schema.ts`
- Modify: `src/content/test-fixture.ts`
- Modify: `src/content/site.json`
- Modify: `src/content/photo-files.ts`
- Modify: `src/config/projects.ts`
- Modify: `vite/admin-plugin.ts`
- Test: `src/content/schema.test.ts`, `src/content/photo-files.test.ts`, `src/config/projects.test.ts`

**Interfaces:**
- Produces:
  - `interface Social { label: string; text: string; href: string }`
  - `interface TimelineEntry { role: string; org: string; period: string }`
  - `interface About { photo: string; bio: string; years: number; location: string; workPreference: string; available: boolean; availability: string; skills: string[]; email: string; resume: string; timeline: TimelineEntry[] }`
  - `Settings` gains `socials: Social[]`, `about: About`, and `hints.flip` / `hints.back` (`HintPair`)
  - Constants: `MAX_SOCIALS = 4`, `MAX_SKILLS = 12`, `MAX_TIMELINE = 4`, `MAX_BIO = 360`
  - `loadContent()` returns `settings.about.photo` prefixed with the base path (when it's not empty)

- [ ] **Step 1: Extend the fixture**

In `src/content/test-fixture.ts`, replace the `hints` and `motion` lines of `settings` with:

```ts
      hints: {
        open: { desktop: 'Click to open', touch: 'Tap to open' },
        begin: { touch: 'Tap to begin' },
        section: { desktop: 'Click a section', touch: 'Tap a section' },
        close: { desktop: 'Scroll up to close', touch: 'Swipe down to close' },
        flip: { desktop: 'Scroll down to turn it over', touch: 'Swipe up to turn it over' },
        back: { desktop: 'Scroll up to turn it back', touch: 'Swipe down to turn it back' },
      },
      motion: { photoDwell: 2, gyroDegrees: 18, parallax: 1, lidKnock: true, topDownOnOpen: true },
      socials: [
        { label: 'GitHub', text: 'github.com/ada', href: 'https://github.com/ada' },
        { label: 'Email', text: 'ada@example.com', href: 'mailto:ada@example.com' },
      ],
      about: {
        photo: '',
        bio: 'Builds analytical engines.',
        years: 5,
        location: 'London, UK',
        workPreference: 'Remote',
        available: true,
        availability: 'Open to new roles',
        skills: ['Swift', 'TypeScript'],
        email: 'ada@example.com',
        resume: '',
        timeline: [{ role: 'Engineer', org: 'Engines Ltd', period: '2020–now' }],
      },
```

- [ ] **Step 2: Write the failing schema tests**

Change the import line at the top of `src/content/schema.test.ts` to:

```ts
import { formatIssue, MAX_BIO, MAX_PROJECTS, MAX_SKILLS, MAX_SOCIALS, MAX_TIMELINE, siteOrder, validate, type SiteContent } from './schema';
```

Append this to the end of the file:

```ts
describe('socials and about', () => {
  it('requires the flip and back hints', () => {
    expectIssue((c) => (c.settings.hints.flip.touch = ''), 'settings.hints.flip.touch', 'required');
    expectIssue((c) => (c.settings.hints.back.desktop = ' '), 'settings.hints.back.desktop', 'required');
  });

  it('fits at most MAX_SOCIALS socials on the lid', () => {
    expectIssue(
      (c) => (c.settings.socials = Array.from({ length: MAX_SOCIALS + 1 }, (_, i) => ({ label: `S${i}`, text: 'x', href: 'https://x.dev' }))),
      'settings.socials',
      `At most ${MAX_SOCIALS}`,
    );
  });

  it('accepts https and mailto social links only', () => {
    expect(issuesAfter((c) => (c.settings.socials[0].href = 'mailto:a@b.co'))).toEqual([]);
    expectIssue((c) => (c.settings.socials[0].href = 'ftp://x'), 'settings.socials.0.href', 'http(s)://');
    expectIssue((c) => (c.settings.socials[1].href = 'mailto:nope'), 'settings.socials.1.href', 'mailto:');
  });

  it('requires each social label and engraved text', () => {
    expectIssue((c) => (c.settings.socials[0].label = ''), 'settings.socials.0.label', 'required');
    expectIssue((c) => (c.settings.socials[0].text = ' '), 'settings.socials.0.text', 'required');
  });

  it('requires the About text fields', () => {
    expectIssue((c) => (c.settings.about.bio = ''), 'settings.about.bio', 'required');
    expectIssue((c) => (c.settings.about.location = ' '), 'settings.about.location', 'required');
    expectIssue((c) => (c.settings.about.availability = ''), 'settings.about.availability', 'required');
  });

  it('keeps the bio short', () => {
    expectIssue((c) => (c.settings.about.bio = 'x'.repeat(MAX_BIO + 1)), 'settings.about.bio', `under ${MAX_BIO}`);
  });

  it('keeps years a whole number from 0 to 60', () => {
    expectIssue((c) => (c.settings.about.years = 61), 'settings.about.years', 'whole number');
    expectIssue((c) => (c.settings.about.years = 2.5), 'settings.about.years', 'whole number');
  });

  it('checks the email, résumé and portrait', () => {
    expectIssue((c) => (c.settings.about.email = 'nope'), 'settings.about.email', 'valid email');
    expectIssue((c) => (c.settings.about.resume = 'www.x.dev/cv.pdf'), 'settings.about.resume', 'http(s)://');
    expectIssue((c) => (c.settings.about.photo = '/elsewhere/me.jpg'), 'settings.about.photo', '/shots/');
    expect(issuesAfter((c) => ((c.settings.about.resume = 'https://x.dev/cv.pdf'), (c.settings.about.photo = '/shots/about-1.jpg')))).toEqual([]);
  });

  it('requires available to be on or off', () => {
    expectIssue((c) => ((c.settings.about as unknown as Record<string, unknown>).available = 'yes'), 'settings.about.available', 'on or off');
  });

  it(`lists 1 to ${MAX_SKILLS} skills`, () => {
    expectIssue((c) => (c.settings.about.skills = []), 'settings.about.skills', `1 to ${MAX_SKILLS}`);
    expectIssue((c) => (c.settings.about.skills = Array.from({ length: MAX_SKILLS + 1 }, (_, i) => `S${i}`)), 'settings.about.skills', `1 to ${MAX_SKILLS}`);
    expectIssue((c) => (c.settings.about.skills = ['Swift', '']), 'settings.about.skills', 'none empty');
  });

  it('limits and checks the timeline', () => {
    const entry = { role: 'R', org: 'O', period: 'P' };
    expectIssue((c) => (c.settings.about.timeline = Array.from({ length: MAX_TIMELINE + 1 }, () => ({ ...entry }))), 'settings.about.timeline', `At most ${MAX_TIMELINE}`);
    expectIssue((c) => (c.settings.about.timeline[0].org = ''), 'settings.about.timeline.0.org', 'required');
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run src/content/schema.test.ts`
Expected: FAIL. TypeScript/vitest reports `MAX_BIO` and the other new constants as not exported, and the new cases fail.

- [ ] **Step 4: Implement the schema**

In `src/content/schema.ts`:

1. Under `export const MAX_PROJECTS = 12;`, add:

```ts
/** The lid has room for this many engraved socials. */
export const MAX_SOCIALS = 4;
export const MAX_SKILLS = 12;
export const MAX_TIMELINE = 4;
export const MAX_BIO = 360;
```

2. Under `const HREF = /^https?:\/\/\S+$/;`, add:

```ts
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAILTO = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

3. Replace the `Settings` interface with:

```ts
/** A profile link, engraved on the lid (`text`) and listed on the About card (`label`). */
export interface Social {
  label: string;
  text: string;
  /** http(s):// or mailto: */
  href: string;
}

export interface TimelineEntry {
  role: string;
  org: string;
  period: string;
}

/** The About card on the box's underside: what a recruiter wants to know. */
export interface About {
  /** '' (initials are shown) or a /shots/<file> path. */
  photo: string;
  bio: string;
  /** Shown as "N+". */
  years: number;
  location: string;
  /** e.g. "Remote · open to relocation" ('' to leave out). */
  workPreference: string;
  available: boolean;
  /** e.g. "Open to new roles". */
  availability: string;
  skills: string[];
  email: string;
  /** '' or an http(s):// link to a résumé. */
  resume: string;
  timeline: TimelineEntry[];
}

export interface Settings {
  identity: { name: string; role: string; title: string; description: string };
  hints: { open: HintPair; begin: { touch: string }; section: HintPair; close: HintPair; flip: HintPair; back: HintPair };
  motion: { photoDwell: number; gyroDegrees: number; parallax: number; lidKnock: boolean; topDownOnOpen: boolean };
  socials: Social[];
  about: About;
}
```

4. In `validateSettings`, change `const { identity, hints, motion } = s;` to `const { identity, hints, motion, socials, about } = s;`. Change the hint loop's list `['open', 'section', 'close']` to `['open', 'section', 'close', 'flip', 'back']`. At the very end of the function, after the motion `else { ... }` block, add:

```ts
  validateSocials(socials, issues);
  validateAbout(about, issues);
```

5. Add these functions after `validateSettings`:

```ts
function validateSocials(list: unknown, issues: Issue[]) {
  if (!Array.isArray(list)) {
    issues.push({ path: 'settings.socials', message: 'Socials must be a list.' });
    return;
  }
  if (list.length > MAX_SOCIALS) issues.push({ path: 'settings.socials', message: `At most ${MAX_SOCIALS} socials fit on the lid.` });
  list.forEach((s: unknown, i) => {
    const at = `settings.socials.${i}`;
    if (!isObj(s) || !filled(s.label)) issues.push({ path: `${at}.label`, message: `Social ${i + 1}: label is required.` });
    if (!isObj(s) || !filled(s.text)) issues.push({ path: `${at}.text`, message: `Social ${i + 1}: engraved text is required.` });
    if (!isObj(s) || typeof s.href !== 'string' || !(HREF.test(s.href) || MAILTO.test(s.href)))
      issues.push({ path: `${at}.href`, message: `Social ${i + 1}: needs an http(s):// or mailto: address.` });
  });
}

function validateAbout(a: unknown, issues: Issue[]) {
  const at = (k: string) => `settings.about.${k}`;
  if (!isObj(a)) {
    issues.push({ path: 'settings.about', message: 'About is missing.' });
    return;
  }
  for (const k of ['bio', 'location', 'availability']) if (!filled(a[k])) issues.push({ path: at(k), message: `${k} is required.` });
  if (typeof a.bio === 'string' && a.bio.length > MAX_BIO) issues.push({ path: at('bio'), message: `Keep the bio under ${MAX_BIO} characters.` });
  if (typeof a.workPreference !== 'string') issues.push({ path: at('workPreference'), message: 'Work preference must be text (it may be empty).' });
  if (typeof a.years !== 'number' || !Number.isInteger(a.years) || a.years < 0 || a.years > 60)
    issues.push({ path: at('years'), message: 'Must be a whole number between 0 and 60.' });
  if (typeof a.available !== 'boolean') issues.push({ path: at('available'), message: 'Must be on or off.' });
  if (typeof a.email !== 'string' || !EMAIL.test(a.email)) issues.push({ path: at('email'), message: 'Needs a valid email address.' });
  if (a.resume !== '' && (typeof a.resume !== 'string' || !HREF.test(a.resume)))
    issues.push({ path: at('resume'), message: 'Needs an http(s):// address, or leave it empty.' });
  if (a.photo !== '' && (typeof a.photo !== 'string' || !SHOT_PATH.test(a.photo)))
    issues.push({ path: at('photo'), message: 'The portrait must be a /shots/<file> path, or empty.' });
  if (!Array.isArray(a.skills) || a.skills.length < 1 || a.skills.length > MAX_SKILLS || !a.skills.every(filled))
    issues.push({ path: at('skills'), message: `List 1 to ${MAX_SKILLS} skills, none empty.` });
  if (!Array.isArray(a.timeline)) issues.push({ path: at('timeline'), message: 'Timeline must be a list.' });
  else {
    if (a.timeline.length > MAX_TIMELINE) issues.push({ path: at('timeline'), message: `At most ${MAX_TIMELINE} timeline entries.` });
    a.timeline.forEach((t: unknown, i) => {
      for (const k of ['role', 'org', 'period'])
        if (!isObj(t) || !filled(t[k])) issues.push({ path: at(`timeline.${i}.${k}`), message: `Timeline ${i + 1}: ${k} is required.` });
    });
  }
}
```

- [ ] **Step 5: Add placeholders to `site.json`**

In `src/content/site.json`, inside `settings.hints`, after the `"close": {…}` object, add (note the comma after `close`'s closing brace):

```json
      "flip": {
        "desktop": "Scroll down to turn it over",
        "touch": "Swipe up to turn it over"
      },
      "back": {
        "desktop": "Scroll up to turn it back",
        "touch": "Swipe down to turn it back"
      }
```

Inside `settings`, after the `"motion": {…}` object, add (with a comma after `motion`'s closing brace):

```json
    "socials": [
      { "label": "GitHub", "text": "github.com/your-handle", "href": "https://github.com/your-handle" },
      { "label": "LinkedIn", "text": "linkedin.com/in/your-handle", "href": "https://www.linkedin.com/in/your-handle" },
      { "label": "Email", "text": "you@example.com", "href": "mailto:you@example.com" }
    ],
    "about": {
      "photo": "",
      "bio": "Placeholder bio — edit in the dashboard. Two or three sentences on what you build, how you work and what you are looking for next.",
      "years": 5,
      "location": "City, Country",
      "workPreference": "Remote · open to relocation",
      "available": true,
      "availability": "Open to new roles",
      "skills": ["Swift", "SwiftUI", "TypeScript", "three.js", "WebGL"],
      "email": "you@example.com",
      "resume": "",
      "timeline": [
        { "role": "Role title", "org": "Company", "period": "20XX–now" },
        { "role": "Role title", "org": "Company", "period": "20XX–20XX" }
      ]
    }
```

- [ ] **Step 6: Run the schema tests**

Run: `npx vitest run src/content/schema.test.ts`
Expected: PASS, including `accepts the real site.json`.

- [ ] **Step 7: Write the failing photo and loader tests**

Append to the `describe('unusedPhotos', …)` block in `src/content/photo-files.test.ts`:

```ts
  it('counts the About portrait as used', () => {
    const c = validContent();
    c.settings.about.photo = '/shots/about-1.jpg';
    expect(unusedPhotos(c, ['alpha-1.jpg', 'beta-1.jpg', 'beta-2.jpg', 'about-1.jpg'])).toEqual([]);
  });
```

Append to the `describe('loadContent', …)` block in `src/config/projects.test.ts`:

```ts
  it('serves the About portrait under the base path, and leaves no portrait empty', () => {
    const c = validContent();
    expect(loadContent(c, '/portfolio/').settings.about.photo).toBe('');
    c.settings.about.photo = '/shots/about-1.jpg';
    expect(loadContent(c, '/portfolio/').settings.about.photo).toBe('/portfolio/shots/about-1.jpg');
  });
```

- [ ] **Step 8: Run them and watch them fail**

Run: `npx vitest run src/content/photo-files.test.ts src/config/projects.test.ts`
Expected: FAIL. The portrait is listed as unused, and the path is not prefixed.

- [ ] **Step 9: Implement**

In `src/content/photo-files.ts`, replace the body of `unusedPhotos` with:

```ts
  const used = new Set(content.projects.flatMap((p) => p.images.map(shotFile)));
  if (content.settings.about.photo) used.add(shotFile(content.settings.about.photo));
  return files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('.') && !used.has(f)).sort();
```

and change its doc comment to `/** Image files in public/shots that no project (visible or hidden) and not the About portrait refers to. */`.

In `src/config/projects.ts`, replace the last two lines of `loadContent` (`const projects = …` and `return …`) with:

```ts
  const at = (src: string) => base + src.slice(1);
  const projects = siteOrder(content.projects).map((p) => ({ ...p, images: p.images.map(at) }));
  const about = { ...content.settings.about, photo: content.settings.about.photo && at(content.settings.about.photo) };
  return { projects, settings: { ...content.settings, about } };
```

In `vite/admin-plugin.ts`, inside `saveContent`, directly after the `for (const p of (body as SiteContent).projects) …` loop, add:

```ts
      const portrait = (body as SiteContent).settings.about.photo;
      if (portrait && !files.has(shotFile(portrait) ?? '')) errors.push(`About: portrait ${portrait} is not in public/shots.`);
```

- [ ] **Step 10: Run all tests and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/content src/config vite/admin-plugin.ts
git commit -m "Add socials, About and flip/back hints to the content model"
```

---

### Task 2: Orbit controller (trackball with momentum and faces)

**Files:**
- Create: `src/input/orbit.ts`
- Test: `src/input/orbit.test.ts`

**Interfaces:**
- Produces:
  - `type Face = 'top' | 'bottom'`
  - `FACE_Q: Record<Face, THREE.Quaternion>`. `top` is identity; `bottom` is −π about X (the top rolls away from the viewer).
  - `faceToward(q, view): Face`
  - `topElevation(q, view): number`. This is the sine of the viewer's elevation above the box's top plane.
  - `project(q, omega, tau): THREE.Quaternion`
  - `errorVector(q, target, omega, out?): THREE.Vector3`
  - `class Orbit`:
    - `constructor(view: THREE.Vector3, radPerPx: () => number, reduced = false)`
    - `quaternion`, `omega`, `face`
    - `begin(x, y, now?) → boolean`, `move(x, y, now?)`, `end(now?)`
    - `flip(face)`, `snap(face)`, `setLimits(lidOn, locked)`, `update(dt)`
    - getters `engaged`, `atRest`, `dragging`

- [ ] **Step 1: Write the failing tests**

Create `src/input/orbit.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { errorVector, FACE_Q, faceToward, Orbit, topElevation } from './orbit';

const EL = THREE.MathUtils.degToRad(57);
const view = new THREE.Vector3(0, Math.sin(EL), Math.cos(EL));
const K = Math.PI / 800; // radians per pixel: an 800px-tall viewport
const make = (reduced = false) => new Orbit(view, () => K, reduced);
const settle = (o: Orbit, each?: (o: Orbit) => void) => {
  for (let i = 0; i < 600 && !o.atRest; i++) {
    o.update(1 / 60);
    each?.(o);
  }
};
const angleTo = (o: Orbit, f: 'top' | 'bottom') => o.quaternion.angleTo(FACE_Q[f]);

describe('faces', () => {
  it('knows which face looks at the viewer', () => {
    expect(faceToward(FACE_Q.top, view)).toBe('top');
    expect(faceToward(FACE_Q.bottom, view)).toBe('bottom');
  });

  it('measures the viewer’s elevation above the top plane', () => {
    expect(topElevation(FACE_Q.top, view)).toBeCloseTo(Math.sin(EL));
    expect(topElevation(FACE_Q.bottom, view)).toBeCloseTo(-Math.sin(EL));
  });

  it('turns a half turn the way it already spins', () => {
    const away = errorVector(FACE_Q.top, FACE_Q.bottom, new THREE.Vector3(-1, 0, 0));
    const toward = errorVector(FACE_Q.top, FACE_Q.bottom, new THREE.Vector3(1, 0, 0));
    expect(away.x).toBeLessThan(0);
    expect(toward.x).toBeGreaterThan(0);
    expect(away.length()).toBeCloseTo(Math.PI);
  });
});

describe('Orbit', () => {
  it('settles back to the top after a small, slow drag', () => {
    const o = make();
    expect(o.begin(0, 500, 0)).toBe(true);
    o.move(0, 480, 100);
    o.end(400); // paused before letting go: no momentum
    expect(o.engaged).toBe(true);
    settle(o);
    expect(o.atRest).toBe(true);
    expect(o.face).toBe('top');
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('turns onto its underside after a flick up', () => {
    const o = make();
    o.begin(0, 500, 0);
    o.move(0, 450, 16);
    o.move(0, 400, 32);
    o.end(40);
    settle(o);
    expect(o.face).toBe('bottom');
    expect(angleTo(o, 'bottom')).toBeLessThan(1e-3);
  });

  it('with the lid off, cannot be flicked over and stays above the rim', () => {
    const o = make();
    o.setLimits(false, false);
    o.begin(0, 500, 0);
    let low = 1;
    for (let i = 1; i <= 40; i++) {
      o.move(0, 500 - i * 60, i * 16); // drags up 2400px: far past the rim if unchecked
      low = Math.min(low, topElevation(o.quaternion, view));
    }
    o.end(40 * 16 + 8);
    settle(o, (s) => (low = Math.min(low, topElevation(s.quaternion, view))));
    expect(low).toBeGreaterThanOrEqual(Math.sin(THREE.MathUtils.degToRad(10)) - 1e-6);
    expect(o.face).toBe('top');
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('ignores input while locked', () => {
    const o = make();
    o.setLimits(true, true);
    expect(o.begin(0, 0, 0)).toBe(false);
    o.move(300, 300, 16);
    expect(angleTo(o, 'top')).toBe(0);
  });

  it('flips over its far edge and back, never rolling toward the viewer', () => {
    const o = make();
    o.flip('bottom');
    let towardViewer = -Infinity;
    const up = new THREE.Vector3();
    settle(o, (s) => (towardViewer = Math.max(towardViewer, up.set(0, 1, 0).applyQuaternion(s.quaternion).z)));
    expect(towardViewer).toBeLessThanOrEqual(1e-3); // the top went away from the viewer (allowing for step error at the end)
    expect(o.face).toBe('bottom');
    expect(angleTo(o, 'bottom')).toBeLessThan(1e-3);
    o.flip('top');
    settle(o);
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('does not flip to the underside with the lid off', () => {
    const o = make();
    o.setLimits(false, false);
    o.flip('bottom');
    expect(o.atRest).toBe(true);
    expect(o.face).toBe('top');
  });

  it('settles back to the top when locked mid-turn', () => {
    const o = make();
    o.flip('bottom');
    o.update(1 / 60);
    o.setLimits(true, true);
    settle(o);
    expect(o.face).toBe('top');
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('snaps instead of animating under reduced motion', () => {
    const o = make(true);
    o.flip('bottom');
    o.update(1 / 60);
    expect(o.atRest).toBe(true);
    expect(angleTo(o, 'bottom')).toBeLessThan(1e-6);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/input/orbit.test.ts`
Expected: FAIL with `Failed to resolve import "./orbit"`.

- [ ] **Step 3: Implement `src/input/orbit.ts`**

```ts
import * as THREE from 'three';

export type Face = 'top' | 'bottom';

const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** Resting orientations: as it sits, or rolled back over its far edge onto its lid. */
export const FACE_Q: Record<Face, THREE.Quaternion> = {
  top: new THREE.Quaternion(),
  bottom: new THREE.Quaternion().setFromAxisAngle(X, -Math.PI),
};

/** Lid off: lowest the viewer may get above the top plane (soft limit, then a hard stop). */
const MIN_OPEN = Math.sin(THREE.MathUtils.degToRad(20));
const HARD_OPEN = Math.sin(THREE.MathUtils.degToRad(10));
/** Settle spring, critically damped (~0.5 s). */
const STIFF = 60;
const DAMP = 2 * Math.sqrt(STIFF);
/** How far a flick is projected ahead to pick the face it is heading for (seconds, capped angle). */
const TAU = 0.35;
const MAX_LEAD = 1.9;
const MAX_W = 12;
/** A pause this long before letting go means there is no flick. */
const STILL_MS = 80;

const tmpV = new THREE.Vector3();

/** Sine of the viewer's elevation above the box's top plane (`view`: unit direction from the box to the viewer). */
export function topElevation(q: THREE.Quaternion, view: THREE.Vector3) {
  return tmpV.copy(UP).applyQuaternion(q).dot(view);
}

/** The face turned toward the viewer. */
export function faceToward(q: THREE.Quaternion, view: THREE.Vector3): Face {
  return topElevation(q, view) >= 0 ? 'top' : 'bottom';
}

/** Where a box turning at ω would end up as its spin dies away (lead capped below a half turn). */
export function project(q: THREE.Quaternion, omega: THREE.Vector3, tau: number) {
  const angle = Math.min(omega.length() * tau, MAX_LEAD);
  if (angle < 1e-6) return q.clone();
  return new THREE.Quaternion().setFromAxisAngle(omega.clone().normalize(), angle).multiply(q);
}

/**
 * Rotation vector (axis × angle) from q to target the short way. Near a half turn both ways are
 * about as short, so it keeps going the way it already spins (ω): a flick decides the direction.
 */
export function errorVector(q: THREE.Quaternion, target: THREE.Quaternion, omega: THREE.Vector3, out = new THREE.Vector3()) {
  const e = target.clone().multiply(q.clone().invert());
  if (e.w < 0) e.set(-e.x, -e.y, -e.z, -e.w);
  const s = Math.sqrt(Math.max(0, 1 - e.w * e.w));
  if (s < 1e-7) return out.set(0, 0, 0);
  let angle = 2 * Math.acos(Math.min(1, e.w));
  out.set(e.x / s, e.y / s, e.z / s);
  if (angle > 2.5 && out.dot(omega) < 0) {
    out.negate();
    angle = 2 * Math.PI - angle;
  }
  return out.multiplyScalar(angle);
}

/**
 * The box in the hand. Dragging turns it about world axes as seen (sideways about the vertical,
 * up and down about the horizontal), so it always follows the finger. Let go and it springs to a
 * resting face, carrying the flick's momentum. A quick flick up rolls it onto its back.
 * The scene draws this by orbiting the camera the other way (Stage).
 */
export class Orbit {
  readonly quaternion = new THREE.Quaternion();
  /** Angular velocity (world axes, rad/s). */
  readonly omega = new THREE.Vector3();
  /** The face it rests on, or is heading to. */
  face: Face = 'top';
  private mode: 'rest' | 'drag' | 'settle' = 'rest';
  private lidOn = true;
  private locked = false;
  private last = { x: 0, y: 0, t: 0 };
  private flick = new THREE.Vector3();
  private stepQ = new THREE.Quaternion();
  private err = new THREE.Vector3();
  private axis = new THREE.Vector3();

  constructor(
    private view: THREE.Vector3,
    private radPerPx: () => number,
    private reduced = false,
  ) {}

  /** From grabbing until it has come to rest. */
  get engaged() {
    return this.mode !== 'rest';
  }

  get atRest() {
    return this.mode === 'rest';
  }

  get dragging() {
    return this.mode === 'drag';
  }

  /**
   * Lid on: free, and both faces. Lid off: stays above the rim and on the top. Locked (a section is
   * open, the lid is moving): no input, and it goes back to the top.
   */
  setLimits(lidOn: boolean, locked: boolean) {
    this.lidOn = lidOn;
    this.locked = locked;
    if (locked && this.mode === 'drag') {
      this.omega.set(0, 0, 0);
      this.settleTo('top');
    }
    if ((locked || !lidOn) && this.face !== 'top') this.settleTo('top');
  }

  begin(x: number, y: number, now = performance.now()) {
    if (this.locked) return false;
    this.mode = 'drag';
    this.omega.set(0, 0, 0);
    this.flick.set(0, 0, 0);
    this.last = { x, y, t: now };
    return true;
  }

  move(x: number, y: number, now = performance.now()) {
    if (this.mode !== 'drag') return;
    const k = this.radPerPx();
    const dt = Math.max(1e-3, (now - this.last.t) / 1000);
    const yaw = (x - this.last.x) * k; // right: the front turns right (about world Y)
    let pitch = (y - this.last.y) * k; // up: the top rolls away (about world X, negative)
    this.last = { x, y, t: now };
    const before = topElevation(this.quaternion, this.view);
    let next = this.turned(yaw, pitch);
    if (!this.lidOn) {
      // Above the rim only: past the soft limit the drag gets heavy, at the hard stop it stops.
      const e = topElevation(next, this.view);
      if (e < MIN_OPEN && e < before) {
        pitch *= 0.25;
        next = this.turned(yaw, pitch);
        if (topElevation(next, this.view) < HARD_OPEN) next = this.turned(yaw, (pitch = 0));
        if (topElevation(next, this.view) < HARD_OPEN) return;
      }
    }
    this.quaternion.copy(next).normalize();
    // Velocity for the flick: a short running average of the drag.
    this.flick.lerp(tmpV.set(pitch / dt, yaw / dt, 0), 1 - Math.exp(-dt / 0.05));
  }

  end(now = performance.now()) {
    if (this.mode !== 'drag') return;
    this.omega.copy(now - this.last.t > STILL_MS ? tmpV.set(0, 0, 0) : this.flick).clampLength(0, MAX_W);
    this.settleTo(this.lidOn ? faceToward(project(this.quaternion, this.omega, TAU), this.view) : 'top');
  }

  /** Turn to a face: onto its back over the far edge, or back toward the viewer. */
  flip(face: Face) {
    if (this.locked || this.mode === 'drag' || face === this.face || (face === 'bottom' && !this.lidOn)) return;
    this.omega.set(face === 'bottom' ? -6 : 6, 0, 0);
    this.settleTo(face);
  }

  /** Straight to a face, no motion. */
  snap(face: Face) {
    this.face = face;
    this.quaternion.copy(FACE_Q[face]);
    this.omega.set(0, 0, 0);
    this.mode = 'rest';
  }

  update(dt: number) {
    if (this.mode !== 'settle') return;
    if (this.reduced) return this.snap(this.face);
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    const target = FACE_Q[this.face];
    for (let i = 0; i < n; i++) {
      errorVector(this.quaternion, target, this.omega, this.err);
      this.omega.addScaledVector(this.err, STIFF * h).addScaledVector(this.omega, -DAMP * h);
      const w = this.omega.length();
      if (w > 1e-9) {
        this.stepQ.setFromAxisAngle(this.axis.copy(this.omega).divideScalar(w), w * h);
        this.quaternion.premultiply(this.stepQ).normalize();
      }
    }
    if (errorVector(this.quaternion, target, this.omega, this.err).length() < 1e-3 && this.omega.length() < 1e-2) this.snap(this.face);
  }

  private settleTo(face: Face) {
    this.face = face;
    this.mode = 'settle';
  }

  /** The current orientation turned by yaw (world Y) and pitch (world X), as seen. */
  private turned(yaw: number, pitch: number) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')).multiply(this.quaternion);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/input/orbit.test.ts`
Expected: PASS (all 11 tests).

If "flips over its far edge" fails with a positive `towardViewer`, the flip is rolling the wrong way: `FACE_Q.bottom` must be −π about X, and `flip('bottom')` must seed `omega.x` negative. If "a flick up" fails with face `top`, log `faceToward(project(…))` in `end()`: the lead must be ≥ π/2 minus the dragged angle.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/input/orbit.ts src/input/orbit.test.ts
git commit -m "Add the orbit controller: drag, momentum and settling to a face"
```

---

### Task 3: Gestures module (move tap / wheel / swipe out of main.ts)

**Files:**
- Create: `src/input/gestures.ts`
- Test: `src/input/gestures.test.ts`
- Modify: `src/main.ts` (the `// Lid gestures:` block through the end of the click handler)

**Interfaces:**
- Produces:
  - `class WheelSum { push(deltaY, deltaMode, now): 1 | -1 | 0; reset() }`
  - `swipeDir(dx, dy, ms): 1 | -1 | 0`
  - `DRAG_SLOP = 6`
  - `interface GestureHandlers { tap(): void; dragStart(x, y): boolean; dragMove(x, y): void; dragEnd(): void; vertical(dir: 1 | -1, source: 'wheel' | 'swipe'): void; enabled(): boolean }`
  - `class Gestures { constructor(el, handlers); dragging: boolean }`
- In `main.ts`: `openLink(href)`, `onVertical(dir, source)`, `onTap()`. Behaviour is unchanged in this task: scroll down / swipe up still opens the lid, and drags are refused.

- [ ] **Step 1: Write the failing tests**

Create `src/input/gestures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { swipeDir, WheelSum } from './gestures';

describe('WheelSum', () => {
  it('fires once the deltas of one gesture add past 70px', () => {
    const w = new WheelSum();
    expect(w.push(40, 0, 0)).toBe(0);
    expect(w.push(40, 0, 50)).toBe(1);
    expect(w.push(40, 0, 60)).toBe(0); // starts over after firing
  });

  it('forgets deltas after a 250ms pause', () => {
    const w = new WheelSum();
    w.push(60, 0, 0);
    expect(w.push(20, 0, 400)).toBe(0);
  });

  it('counts line-mode deltas as 16px lines, both ways', () => {
    const w = new WheelSum();
    expect(w.push(-5, 1, 0)).toBe(-1);
  });
});

describe('swipeDir', () => {
  it('reads a quick vertical flick', () => {
    expect(swipeDir(0, -120, 200)).toBe(1); // finger up: like scrolling down
    expect(swipeDir(10, 120, 200)).toBe(-1);
  });

  it('ignores short, slow or sideways moves', () => {
    expect(swipeDir(0, -40, 200)).toBe(0);
    expect(swipeDir(0, -120, 900)).toBe(0);
    expect(swipeDir(100, -120, 200)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/input/gestures.test.ts`
Expected: FAIL with `Failed to resolve import "./gestures"`.

- [ ] **Step 3: Implement `src/input/gestures.ts`**

```ts
/**
 * What a press, drag, scroll or swipe on the scene means. One place decides, so a drag that turns
 * the box is never also a click, and trackpad momentum never fires a scroll twice.
 */

/** Wheel deltas add up within one gesture; past 70px it counts as one scroll. */
export class WheelSum {
  private sum = 0;
  private at = -Infinity;

  push(deltaY: number, deltaMode: number, now: number): 1 | -1 | 0 {
    if (now - this.at > 250) this.sum = 0;
    this.at = now;
    this.sum += deltaY * (deltaMode === 1 ? 16 : 1);
    if (Math.abs(this.sum) <= 70) return 0;
    const dir = this.sum > 0 ? 1 : -1;
    this.sum = 0;
    return dir;
  }

  reset() {
    this.sum = 0;
  }
}

/** A deliberate, mostly vertical flick: 1 = swipe up (like scrolling down), -1 = swipe down, 0 = not one. */
export function swipeDir(dx: number, dy: number, ms: number): 1 | -1 | 0 {
  if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(dx) * 1.5 || ms > 700) return 0;
  return dy < 0 ? 1 : -1;
}

/** Pixels a press may wander and still be a tap. */
export const DRAG_SLOP = 6;

export interface GestureHandlers {
  /** A click or tap that was not a drag (the Pointer already holds its position). */
  tap(): void;
  /** The press moved past the slop: start turning the box. False refuses (nothing to turn now). */
  dragStart(x: number, y: number): boolean;
  dragMove(x: number, y: number): void;
  dragEnd(): void;
  /** One scroll or swipe step: 1 = scroll down / swipe up, -1 = scroll up / swipe down. */
  vertical(dir: 1 | -1, source: 'wheel' | 'swipe'): void;
  /** False while something else (the photo viewer) owns the input. */
  enabled(): boolean;
}

export class Gestures {
  dragging = false;
  private wheel = new WheelSum();
  private rest = 0;
  private down: { id: number; x: number; y: number; t: number; touch: boolean; refused: boolean } | null = null;
  private swallowClick = false;

  constructor(
    private el: HTMLElement,
    private h: GestureHandlers,
  ) {
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e, false));
    el.addEventListener('pointercancel', (e) => this.onUp(e, true));
    el.addEventListener('click', () => this.onClick());
  }

  /** Scrolls and swipes rest briefly after firing, so trackpad momentum doesn't fire them again. */
  private fire(dir: 1 | -1, source: 'wheel' | 'swipe') {
    const now = performance.now();
    if (now < this.rest) return;
    this.rest = now + 700;
    this.wheel.reset();
    this.h.vertical(dir, source);
  }

  private onWheel(e: WheelEvent) {
    if (!this.h.enabled() || this.dragging) return;
    const dir = this.wheel.push(e.deltaY, e.deltaMode, performance.now());
    if (dir) this.fire(dir, 'wheel');
  }

  private onDown(e: PointerEvent) {
    // A new press: a click swallowed after a touch drag (which never sends one) can't eat this one.
    this.swallowClick = false;
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !this.h.enabled()) return;
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse', refused: false };
  }

  private onMove(e: PointerEvent) {
    const d = this.down;
    if (!d || e.pointerId !== d.id || d.refused) return;
    if (!this.dragging) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_SLOP) return;
      if (!this.h.dragStart(d.x, d.y)) {
        d.refused = true; // still a swipe candidate, and a mouse release still clicks
        return;
      }
      this.dragging = true;
      this.el.setPointerCapture(e.pointerId);
    }
    this.h.dragMove(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    const d = this.down;
    if (!d || e.pointerId !== d.id) return;
    this.down = null;
    if (this.dragging) {
      this.dragging = false;
      this.swallowClick = true;
      this.h.dragEnd();
    }
    if (!cancelled && d.touch && this.h.enabled()) {
      const dir = swipeDir(e.clientX - d.x, e.clientY - d.y, performance.now() - d.t);
      if (dir) this.fire(dir, 'swipe');
    }
  }

  private onClick() {
    if (this.swallowClick) {
      this.swallowClick = false;
      return;
    }
    this.h.tap();
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/input/gestures.test.ts`
Expected: PASS.

- [ ] **Step 5: Switch `main.ts` to Gestures (no behaviour change)**

In `src/main.ts`, add the import `import { Gestures } from './input/gestures';` (alphabetically, after `./config/projects`).

Delete everything from the line `// Lid gestures: scroll down / swipe up lifts it off; scroll up / swipe down puts it back on.` through the closing `});` of `host.addEventListener('click', () => { … });`. That is the wheel listener, both touch listeners and the click listener, together with the variables `wheelSum`, `wheelAt`, `gestureRest`, `swipeY`, `swipeX`, `swipeT` and the function `lidGesture`. In its place, insert:

```ts
// ---- Gestures: taps, drags (turning the box), scrolls and swipes ---------------------
function openLink(href: string) {
  if (href.startsWith('mailto:')) location.href = href;
  else window.open(href, '_blank', 'noopener');
}

/** One scroll or swipe: down / up lifts the lid off, up / down puts it back on. */
function onVertical(dir: 1 | -1, source: 'wheel' | 'swipe') {
  if (source === 'swipe' && motion.needsPermission) void motion.enable().finally(() => (openHint = hint.textContent = copy.open.touch));
  if (dir > 0) openLid();
  else closeLid();
}

function onTap() {
  // iOS grants motion only from a tap. The first tap on the closed lid asks for it and leaves the
  // lid on, so the steel can follow the tilt before it opens; the next tap opens it.
  if (touch && motion.needsPermission && lid.state === 'closed') {
    void motion.enable().finally(() => (openHint = hint.textContent = copy.open.touch));
    return;
  }
  if (touch) void motion.enable();
  if (lid.state === 'closed' || lid.state === 'returning') {
    if (pointer.cast([lid.hit], false).length) openLid();
    return;
  }
  // Taps count once the lid is mostly off, so a quick tap during its exit isn't swallowed.
  if (lid.state !== 'gone' && lid.openness < 0.7) return;
  if (focused >= 0) {
    const hit = pointer.cast(chipSets[focused].linkMeshes, false)[0];
    const link = hit?.object.userData.link as string | undefined;
    if (link) {
      openLink(link);
      return;
    }
  }
  if (focused >= 0 && pointer.cast(tiles[focused].stack.meshes, false).length) {
    openViewer(focused); // full-size, undistorted view of the screenshots
    return;
  }
  // Click a section to open it, or another one to switch. Clicking the open section again, or
  // outside the box, goes back to the overview.
  const i = sectionUnderPointer();
  setFocus(i === focused ? -1 : i);
}

new Gestures(host, {
  tap: onTap,
  dragStart: () => false, // turning the box comes with the orbit
  dragMove: () => {},
  dragEnd: () => {},
  vertical: onVertical,
  enabled: () => !lightbox.isOpen,
});
```

- [ ] **Step 6: Typecheck, test, check in the browser**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all PASS.

Start the dev server (`npm run dev`, through the preview tool) and open `http://localhost:5173/`. Check:
- Click the lid: it opens.
- Scroll up: it closes. Scroll down: it opens.
- Click a section: it opens.
- In the phone viewport (375×812), a tap opens the lid and a vertical swipe down closes it.
- No console errors.

- [ ] **Step 7: Commit**

```bash
git add src/input/gestures.ts src/input/gestures.test.ts src/main.ts
git commit -m "Move tap, scroll and swipe handling into a gestures module"
```

---

### Task 4: Turn the box: camera orbit, shell shading, bottom plate, ambient freeze

**Files:**
- Modify: `src/scene/stage.ts`
- Modify: `src/scene/box.ts`
- Create: `src/scene/underside.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Orbit` (Task 2), `Gestures` (Task 3)
- Produces:
  - `stage.ts`: `export const PIVOT`; `Stage.orbit: THREE.Quaternion` (the box's orientation as seen); `Stage.lidLightRest: THREE.Vector3`; `Stage.envSway: THREE.Euler`
  - `box.ts`: `export function roundedRectShape`; `createBox()` returns `{ group, top, shell: { uSheen, uOrbit, uPivot }, shellMesh, table }`
  - `underside.ts`: `class Underside { readonly mesh; get texture(): THREE.Texture; set sheen(x: number); setCard(tex: THREE.Texture) }`
  - `main.ts`: `const orbit`, `const gestures`, `const underside`, `let pendingOpen`, ambient freeze

- [ ] **Step 1: Orbit the camera and lights in `stage.ts`**

In `src/scene/stage.ts`:

1. Under the `VIEW_MARGIN` constant, add:

```ts
/** The box's centre: what it turns about. */
export const PIVOT = new THREE.Vector3(0, TOP_Y - WALL_H / 2, 0);
const tmpQ = new THREE.Quaternion();
```

2. In the class fields, after `readonly lidLight: THREE.PointLight;`, add:

```ts
  private readonly key: THREE.DirectionalLight;
  /**
   * The box's orientation as seen. Turning it is drawn as the camera and its lights circling the
   * other way: the world stays put, so everything laid out in it (sections, hit-tests) still holds.
   */
  readonly orbit = new THREE.Quaternion();
  private orbitInv = new THREE.Quaternion();
  /** Where the lights sit with the box at rest; they circle with the camera. */
  private keyRest = new THREE.Vector3(-4, 10, 6);
  readonly lidLightRest = new THREE.Vector3(0, 3, 0.5);
  /** The environment's sway with the cursor, before the orbit. */
  readonly envSway = new THREE.Euler();
```

3. In the constructor, replace

```ts
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(-4, 10, 6);
    this.lidLight = new THREE.PointLight(0xffffff, 22, 14, 1.4);
    this.scene.add(key, this.lidLight);
```

with

```ts
    this.key = new THREE.DirectionalLight(0xffffff, 1.2);
    this.key.position.copy(this.keyRest);
    this.lidLight = new THREE.PointLight(0xffffff, 22, 14, 1.4);
    this.lidLight.position.copy(this.lidLightRest);
    this.scene.add(this.key, this.lidLight);
```

4. In `update(dt)`, replace the final line `this.camera.lookAt(this.lookTarget.copy(tg));` with:

```ts
    // Orbit: the camera, its target and the lights circle the box's centre by the inverse of the
    // box's turn, so on screen the box itself turns under a fixed studio light.
    const inv = this.orbitInv.copy(this.orbit).invert();
    const around = (v: THREE.Vector3) => v.sub(PIVOT).applyQuaternion(inv).add(PIVOT);
    around(this.camera.position);
    this.camera.up.applyQuaternion(inv);
    this.camera.lookAt(around(this.lookTarget.copy(tg)));
    around(this.restEye);
    around(this.key.position.copy(this.keyRest));
    around(this.lidLight.position.copy(this.lidLightRest));
    this.scene.environmentRotation.setFromQuaternion(tmpQ.setFromEuler(this.envSway).premultiply(inv));
```

- [ ] **Step 2: Shell shaded as seen, plus exports, in `box.ts`**

In `src/scene/box.ts`:

1. Change `function roundedRectShape<T extends THREE.Path>(` to `export function roundedRectShape<T extends THREE.Path>(`.

2. In `createShell()`, replace `const uniforms = { uSheen: { value: 0 } };` with:

```ts
  const uniforms = {
    uSheen: { value: 0 },
    /** The box's orientation as seen (Stage.orbit): shading follows the box, not the world. */
    uOrbit: { value: new THREE.Matrix3() },
    uPivot: { value: new THREE.Vector3(0, TOP_Y - WALL_H / 2, 0) },
  };
```

3. Replace the whole `fragmentShader` of `createShell()` with:

```ts
    fragmentShader: /* glsl */ `
      ${sdRoundGLSL}
      uniform float uSheen;
      uniform mat3 uOrbit;
      uniform vec3 uPivot;
      varying float vV;
      varying vec3 vWorld;
      void main() {
        // Shade the box as it is seen: turned by the orbit, so the lit side stays put as it turns.
        // Flat-ish normal from screen derivatives: which way this bit of wall faces in plan.
        vec3 n = uOrbit * normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 p = uOrbit * (vWorld - uPivot);
        vec2 nxz = normalize(n.xz + 1e-5);
        float front = smoothstep(0.0, 1.0, abs(nxz.y));    // faces toward / away from the viewer
        float left = smoothstep(0.2, 1.0, abs(nxz.x)) * step(p.x, 0.0); // the key light is up and left
        float face = 0.45 + 0.55 * front + 0.2 * left;

        // Falloff into black: bright just under the edge that is up, gone well before the other.
        float h = clamp(0.5 - p.y / ${WALL_H.toFixed(3)}, 0.0, 1.0);
        float fall = pow(1.0 - smoothstep(0.0, 0.85, h), 1.8);
        vec3 col = vec3(0.042) * fall * face;
        // Sheen: a soft vertical band of light drifting across the front with the parallax.
        col += vec3(0.03) * exp(-pow((p.x - uSheen) / 1.6, 2.0)) * fall * front;
        // Rims: hairlines where the wall meets the top or the bottom, like a chamfer catching
        // light, on whichever edge is up.
        float rim = (1.0 - smoothstep(0.0, 0.035, vV)) + smoothstep(0.965, 1.0, vV);
        col += vec3(0.06) * rim * (1.0 - h) * (0.6 + 0.4 * front);
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither: no banding in the long gradient
        gl_FragColor = vec4(max(col, 0.0), 1.0);
        #include <colorspace_fragment>
      }`,
```

4. In `createBox()`, change the return to `return { group, top, shell: shell.uniforms, shellMesh: shell.mesh, table: tableMesh };`.

- [ ] **Step 3: Create `src/scene/underside.ts` (plain plate for now)**

```ts
import * as THREE from 'three';
import { OUTER_D, OUTER_R, OUTER_W, roundedRectShape, TOP_Y, WALL_H } from './box';
import { TEXT_LOD_BIAS } from './textures';

/** Dark anodised plate until the About card is drawn. */
function plainPlate() {
  const t = new THREE.DataTexture(new Uint8Array([11, 11, 12, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * The box's bottom: a plate closing the walls, facing down. It carries the About card, laid out
 * to read upright when the box lies on its back (its front edge then at the top of the screen).
 */
export class Underside {
  readonly mesh: THREE.Mesh;
  private uniforms = { uMap: { value: plainPlate() as THREE.Texture }, uSheen: { value: 0 } };

  constructor() {
    const geo = new THREE.ShapeGeometry(roundedRectShape(OUTER_W, OUTER_D, OUTER_R, new THREE.Shape()), 16);
    // Shape coordinates → 0..1 across the plate, so the card fills it edge to edge.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / OUTER_W + 0.5, pos.getY(i) / OUTER_D + 0.5);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uSheen;
        varying vec2 vUv;
        void main() {
          vec3 col = texture2D(uMap, vUv, ${TEXT_LOD_BIAS.toFixed(2)}).rgb;
          // A soft band of light drifting across with the parallax, like the walls' sheen.
          col += vec3(0.018) * exp(-pow((vUv.x - 0.5 - uSheen) / 0.22, 2.0));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    // Facing down; shape +y runs to the box's front (+z), so the card's top is the front edge.
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = TOP_Y - WALL_H;
  }

  get texture(): THREE.Texture {
    return this.uniforms.uMap.value;
  }

  /** Sheen position across the plate (0 = centre). */
  set sheen(x: number) {
    this.uniforms.uSheen.value = x;
  }

  setCard(tex: THREE.Texture) {
    this.uniforms.uMap.value = tex;
  }
}
```

- [ ] **Step 4: Wire the orbit into `main.ts`**

In `src/main.ts`:

1. Imports:
   - Add `import { Orbit } from './input/orbit';` and `import { Underside } from './scene/underside';`.
   - In the `./scene/box` import, add `ELEVATION`.

2. After `const motion = new Motion();`, add:

```ts
// The box in the hand: drags turn it, a flick up rolls it onto its back (the About card).
const orbit = new Orbit(new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION)), () => Math.PI / Math.max(1, host.clientHeight), reduced);
/** A tap on the lid while the box is turned: it opens once the box has settled on its top. */
let pendingOpen = false;
```

3. After `scene.add(box.group);`, add:

```ts
const underside = new Underside();
box.group.add(underside.mesh);
```

4. In `prewarm()`, directly before `stage.warm(…)`, add:

```ts
  // Sealed under the lid the wells are hidden; show them for the warm-up (the frame re-hides them).
  tiles.forEach((t) => (t.group.visible = true));
  box.table.visible = true;
```

5. Replace the start of `openLid()`:

```ts
function openLid() {
  if (lid.state !== 'closed' && lid.state !== 'returning') return;
  lid.open();
```

with:

```ts
function openLid() {
  if (lid.state !== 'closed' && lid.state !== 'returning') return;
  // Turned or still moving: bring it back onto its top first; it opens once settled.
  if (lid.state === 'closed' && (!orbit.atRest || orbit.face !== 'top')) {
    orbit.flip('top');
    pendingOpen = true;
    return;
  }
  lid.open();
```

6. Replace the `new Gestures(host, { … });` call with:

```ts
const gestures = new Gestures(host, {
  tap: onTap,
  dragStart: (x, y) => orbit.begin(x, y),
  dragMove: (x, y) => orbit.move(x, y),
  dragEnd: () => orbit.end(),
  vertical: onVertical,
  enabled: () => !lightbox.isOpen,
});
/** What the pointer can grab to turn the box. */
const grabbable = [lid.hit, box.shellMesh, box.top.mesh, underside.mesh];
const canTurn = () => focused < 0 && !lightbox.isOpen && (lid.state === 'closed' || lid.state === 'gone');
```

7. Above `const clock = new THREE.Clock();`, add:

```ts
/** Cursor / tilt as the scene uses it: frozen while the box is held, easing back in after. */
let ambX = 0;
let ambY = 0;
let ambientIn = 1;
const orbitM4 = new THREE.Matrix4();
```

8. In `frame()`, replace everything from `const par = reduced ? 0 : settings.motion.parallax;` through `box.shell.uSheen.value = px * OUTER_W * 0.45;` with:

```ts
  // Holding the box: the hand turns it, so the cursor and tilt stop steering the view and the
  // light. They ease back in once it has settled.
  ambientIn = orbit.engaged ? 0 : Math.min(1, ambientIn + dt / 0.4);
  if (ambientIn > 0) {
    const k = ambientIn * ambientIn * (3 - 2 * ambientIn);
    ambX += (px - ambX) * k;
    ambY += (py - ambY) * k;
  }
  // Turning: free with the lid on, above the rim with it off, not while a section is open or the
  // lid is moving.
  orbit.setLimits(lid.state === 'closed', focused >= 0 || lightbox.isOpen || (lid.state !== 'closed' && lid.state !== 'gone'));
  orbit.update(dt);
  if (pendingOpen && orbit.atRest && orbit.face === 'top') {
    pendingOpen = false;
    openLid();
  }
  stage.orbit.copy(orbit.quaternion);
  const par = reduced ? 0 : settings.motion.parallax;
  stage.setParallax(ambX * par, ambY * par);
  // Cursor shapes the steel only: the light slides above the lid, env rotates with it.
  stage.lidLightRest.set(ambX * 6, 3.0, -ambY * 4 + 0.5);
  stage.envSway.set(-ambY * 0.15, ambX * 0.6, 0);
  stage.update(dt);
  box.shell.uSheen.value = ambX * OUTER_W * 0.45;
  box.shell.uOrbit.value.setFromMatrix4(orbitM4.makeRotationFromQuaternion(orbit.quaternion));
  underside.sheen = ambX * 0.35;
```

9. Replace the cursor block (from `let cursor = '';` through `host.style.cursor = cursor;`) with:

```ts
  let cursor = '';
  if (gestures.dragging) cursor = 'grabbing';
  else if (focused >= 0 && pointer.cast(chipSets[focused].linkMeshes, false).length) cursor = 'pointer';
  else if (focused >= 0 && pointer.cast(tiles[focused].stack.meshes, false).length) cursor = 'zoom-in';
  else if (hovered >= 0 && hovered !== focused) cursor = 'pointer';
  else if (canTurn() && pointer.inside && pointer.cast(grabbable, false).length) cursor = 'grab';
  host.style.cursor = cursor;

  // Lid fully on: nothing inside can be seen. Hidden, so the depth-ignoring shafts and the deep
  // cards can't show through the walls or the bottom while the box is turned.
  const sealed = lid.state === 'closed';
  box.table.visible = !sealed;
  for (const t of tiles) t.group.visible = !sealed;
```

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all PASS.

- [ ] **Step 6: Check in the browser**

With the dev server on `http://localhost:5173/`:
1. Lid on: drag the box sideways and up/down. It follows the pointer and the cursor shows `grab` / `grabbing`. Let go slowly: it springs back square. Flick up: it rolls away over its far edge and rests on its back, showing the dark bottom plate. Drag down from there: it comes back.
2. While dragging, moving the pointer elsewhere no longer sways the light or the parallax. After letting go they ease back within about 0.4 s, with no jump.
3. Walls look as before at rest. Turned, the lit side stays consistent and the edge that's up has a hairline rim. No section shafts show through the walls or the bottom.
4. Open the lid (click). Drag: it turns but can't go below about 20° over the rim. Let go: it settles square. Click a section: it opens top-down, and dragging does nothing.
5. While the box is turned, click the lid: it settles to the top, then opens.
6. Phone viewport (375×812, touch): a drag turns it, tilt or idle drift stops while held, and a tap on the lid still opens it.
7. `read_console_messages`: no errors.
8. Take screenshots: the box turned about 30° and resting on its back.

If the sections show through the walls at low angles with the lid off, raise `MIN_OPEN` / `HARD_OPEN` in `orbit.ts` to 30° / 20° and note it in the commit message.

- [ ] **Step 7: Commit**

```bash
git add src/scene/stage.ts src/scene/box.ts src/scene/underside.ts src/main.ts
git commit -m "Let the box be grabbed and turned: camera orbit, as-seen shell shading, bottom plate"
```

---

### Task 5: Flip gestures, Underside framing, hints, dev `#about`

**Files:**
- Modify: `src/scene/stage.ts` (`setView`)
- Modify: `src/main.ts`

**Interfaces:**
- Produces:
  - `Stage.setView(v: ViewRect | 'underside' | null, snap = false)`
  - `main.ts`: `showHint(text)`, `hideHint()`, `swapHint(text)`, `let shownFace: Face`
  - Dev hash `#about` starts on the underside

- [ ] **Step 1: Underside framing in `stage.ts`**

Change the `setView` signature and add a first branch:

```ts
  /**
   * Overview (null): the box at its usual tilt. A section: the camera moves over it and looks
   * straight down, framing it, so nothing on it is foreshortened. Underside: the same straight-on
   * framing of the whole plate; with the box rolled onto its back (the orbit), that is its bottom.
   */
  setView(r: ViewRect | 'underside' | null, snap = false) {
    if (r === 'underside') {
      this.vEl.target = TOP_DOWN;
      this.vX.target = 0;
      this.vY.target = TOP_Y;
      this.vZ.target = 0;
      this.vW.target = OUTER_W + VIEW_MARGIN;
      this.vH.target = OUTER_D + VIEW_MARGIN;
    } else if (r) {
```

(The existing `if (r) { … } else { … }` becomes `else if (r) { … } else { … }`, with its body unchanged.)

- [ ] **Step 2: Gestures map to flips in `main.ts`**

Replace `onVertical` with:

```ts
/**
 * One scroll or swipe, along a single axis: lid off ←(up / down)— lid on —(down / up)→ on its
 * back, showing the About card. Opposite to putting the lid on, so it reads as "further down".
 */
function onVertical(dir: 1 | -1, source: 'wheel' | 'swipe') {
  if (source === 'swipe' && motion.needsPermission) void motion.enable().finally(() => (openHint = hint.textContent = copy.open.touch));
  if (lid.state === 'closed') orbit.flip(dir > 0 ? 'bottom' : 'top');
  else if (dir < 0) closeLid();
}
```

Add `import type { Face } from './input/orbit';` (merge with the existing orbit import: `import { Orbit, type Face } from './input/orbit';`).

- [ ] **Step 3: Frame the card when the box lies on its back**

After `let pendingOpen = false;`, add:

```ts
/** The face the camera is framed for: the overview (top) or the About card straight on (bottom). */
let shownFace: Face = 'top';
```

In `frame()`, directly after the `pendingOpen` check from Task 4, add:

```ts
  // Lying on its back, the camera frames the About card straight on; upright, the usual overview.
  if (orbit.face !== shownFace && focused < 0) {
    shownFace = orbit.face;
    stage.setView(shownFace === 'bottom' ? 'underside' : null, reduced);
  }
```

- [ ] **Step 4: Dev `#about`**

Directly after the dev `#open` block (the `if (import.meta.env.DEV && location.hash.startsWith('#open')) { … }`), add:

```ts
// Dev convenience: /#about starts with the box on its back, showing the About card.
if (import.meta.env.DEV && location.hash === '#about') {
  orbit.snap('bottom');
  shownFace = 'bottom';
  stage.setView('underside', true);
}
```

- [ ] **Step 5: Hint helpers**

After `hint.textContent = openHint;` near the top of `main.ts`, add:

```ts
const flipHint = touch ? copy.flip.touch : copy.flip.desktop;
const backHint = touch ? copy.back.touch : copy.back.desktop;

let swapTimer = 0;
function showHint(text: string) {
  clearTimeout(swapTimer);
  hint.textContent = text;
  hint.classList.add('show');
}
function hideHint() {
  clearTimeout(swapTimer);
  hint.classList.remove('show');
}
/** Cross-fades the hint to new text: out, swap, in. */
function swapHint(text: string) {
  hideHint();
  swapTimer = window.setTimeout(() => showHint(text), 400);
}
```

In `openLid()` and `closeLid()`, replace `hint.classList.remove('show');` with `hideHint();`.

Above `const clock = new THREE.Clock();`, next to the other hint state, add:

```ts
/** Lid on, until the box has been turned over once: the open hint takes turns with how to turn it. */
let flippedOnce = false;
let cycleAt = 0;
/** On its back: how to turn it back, once. */
let backHintShown = false;
let backHintTill = 0;
```

- [ ] **Step 6: Replace the hint section of `frame()`**

Replace everything from `if (focused >= 0) sectionOpened = true;` through the closing brace of `if (!hintShown && time > 1.5 && lid.state === 'closed') { … }` (just before `requestAnimationFrame(frame);`) with:

```ts
  if (focused >= 0) sectionOpened = true;
  if (lid.state !== 'gone') lidOffAt = 0;
  else if (!lidOffAt) lidOffAt = time;
  if (!sectionOpened && !sectionHintOn && lidOffAt && time - lidOffAt > 0.6) {
    sectionHintOn = true;
    showHint(sectionHint);
  }
  if (sectionHintOn && (focused >= 0 || lid.state !== 'gone')) {
    sectionHintOn = false;
    hideHint();
  }
  if (sectionOpened && !closeHintShown && focused < 0 && lid.state === 'gone') {
    closeHintShown = true;
    closeHintAt = time + 1.2;
  }
  if (closeHintTill && focused >= 0) closeHintTill = time; // opening a section clears it
  if (closeHintAt && time > closeHintAt) {
    closeHintAt = 0;
    if (lid.state === 'gone' && focused < 0) {
      showHint(closeHint);
      closeHintTill = time + 3.5;
    }
  }
  if (closeHintTill && time > closeHintTill) {
    closeHintTill = 0;
    hideHint();
  }

  // Lid on. Turning the box puts the hints aside; back at rest on its top, the open hint returns.
  const introDone = time > 1.5;
  const restingTop = lid.state === 'closed' && orbit.face === 'top' && orbit.atRest;
  if (orbit.face === 'bottom') flippedOnce = true;
  if (orbit.engaged && hintShown) {
    if (hint.classList.contains('show') && !backHintTill) hideHint();
    if (lid.state === 'closed') openHintAt = time + 1.2;
  }
  if (openHintAt && time > openHintAt && restingTop) {
    openHintAt = 0;
    showHint(openHint);
    cycleAt = time + 4;
  }
  if (!hintShown && introDone && restingTop) {
    hintShown = true;
    showHint(openHint);
    cycleAt = time + 4;
  }
  if (restingTop && !flippedOnce && cycleAt && time > cycleAt && hint.classList.contains('show')) {
    cycleAt = time + 4;
    swapHint(hint.textContent === openHint ? flipHint : openHint);
  }
  if (orbit.face === 'bottom' && orbit.atRest && !backHintShown) {
    backHintShown = true;
    swapHint(backHint);
    backHintTill = time + 3.5;
  }
  if (backHintTill && (time > backHintTill || orbit.face !== 'bottom')) {
    backHintTill = 0;
    hideHint();
  }
```

- [ ] **Step 7: Typecheck, test, browser check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all PASS.

In the browser at `http://localhost:5173/`:
1. Lid on: scroll down. The box rolls over its far edge and the camera frames the (still plain) bottom plate straight on, edge to edge. Scroll up: it rolls back and the overview returns.
2. The hint alternates "Click to open" and "Scroll down to turn it over" every ~4 s until the first flip. On the back, "Scroll up to turn it back" shows once for ~3.5 s.
3. Lid off: scroll down does nothing, and scroll up puts the lid on.
4. Phone viewport: a swipe up flips it and a swipe down flips it back. A swipe down with the lid off closes it.
5. `/#about` loads straight onto the underside.
6. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/scene/stage.ts src/main.ts
git commit -m "Flip the box onto its back by scrolling down or swiping up; frame the underside"
```

---

### Task 6: The About card on the underside

**Files:**
- Create: `src/scene/about-card.ts`
- Test: `src/scene/about-card.test.ts`
- Modify: `src/scene/underside.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `About`, `Social` (Task 1); `Underside` (Task 4); `FONT`, `drawTracked` from `textures.ts`
- Produces:
  - `about-card.ts`:
    - `CARD_PX = 220`, `CARD_SS = 2`
    - `type Op`, `interface CardLink { href; x0; y0; x1; y1 }` (fractions of the card, y down), `interface CardInput { name; role; about; socials }`, `type Measure`
    - `layoutAbout(input, w, h, measure): { ops: Op[]; links: CardLink[] }`
    - `drawAbout(ctx, ops, w, h, o: { initials; corner; photo? })`
    - `contactLinks(about, socials)`, `aboutLines(about)`, `initialsOf(name)`
  - `Underside.showAbout(input: CardInput, photoUrl: string)`, `Underside.linkAt(uv: THREE.Vector2): string | null`
  - `main.ts`: `linkUnderPointer(): string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/about-card.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { About, Social } from '../content/schema';
import { aboutLines, contactLinks, initialsOf, layoutAbout, type CardInput, type Measure, type Op } from './about-card';

/** Fake text widths: 0.55 em per character, plus tracking between characters. */
const measure: Measure = (t, font, tracking = 0) => [...t].length * parseFloat(font.split(' ')[1]) * 0.55 + tracking * Math.max(0, [...t].length - 1);

const about = (o: Partial<About> = {}): About => ({
  photo: '',
  bio: 'lorem ipsum dolor sit amet '.repeat(13).trim(),
  years: 7,
  location: 'City, Country',
  workPreference: 'Remote · open to relocation',
  available: true,
  availability: 'Open to new roles',
  skills: Array.from({ length: 12 }, (_, i) => `Skill ${i + 1}`),
  email: 'you@example.com',
  resume: 'https://example.com/cv.pdf',
  timeline: Array.from({ length: 4 }, (_, i) => ({ role: `Role ${i}`, org: `Company ${i}`, period: '20XX–20XX' })),
  ...o,
});
const socials: Social[] = [
  { label: 'GitHub', text: 'github.com/you', href: 'https://github.com/you' },
  { label: 'LinkedIn', text: 'linkedin.com/in/you', href: 'https://linkedin.com/in/you' },
  { label: 'Email', text: 'you@example.com', href: 'mailto:you@example.com' },
];
const input = (o: Partial<About> = {}): CardInput => ({ name: 'Halil Bagosi', role: 'Software Engineer', about: about(o), socials });
const SIZES = { wide: [1395, 933], tall: [933, 1615] } as const;

describe('contactLinks', () => {
  it('lists email, résumé, then socials without repeating the email', () => {
    expect(contactLinks(about(), socials).map((l) => l.href)).toEqual([
      'mailto:you@example.com',
      'https://example.com/cv.pdf',
      'https://github.com/you',
      'https://linkedin.com/in/you',
    ]);
  });

  it('leaves out the résumé when there is none', () => {
    expect(contactLinks(about({ resume: '' }), []).map((l) => l.label)).toEqual(['you@example.com']);
  });
});

describe('aboutLines and initials', () => {
  it('turns the About into plain sentences', () => {
    const lines = aboutLines(about({ timeline: [{ role: 'Engineer', org: 'Acme', period: '2020–now' }] }));
    expect(lines).toContain('7+ years of experience.');
    expect(lines).toContain('Based in City, Country · Remote · open to relocation.');
    expect(lines.at(-1)).toBe('Engineer, Acme, 2020–now.');
  });

  it('takes up to two initials', () => {
    expect(initialsOf('Halil Bagosi')).toBe('HB');
    expect(initialsOf('Ada  King Lovelace')).toBe('AK');
  });
});

describe('layoutAbout', () => {
  for (const [shape, [w, h]] of Object.entries(SIZES)) {
    it(`keeps every line of text inside the card (${shape})`, () => {
      const { ops } = layoutAbout(input(), w, h, measure);
      for (const op of ops) {
        if (op.kind !== 'text') continue;
        expect(op.x, op.text).toBeGreaterThanOrEqual(0);
        expect(op.x + measure(op.text, op.font, op.tracking), op.text).toBeLessThanOrEqual(w + 0.5);
        expect(op.y, op.text).toBeLessThanOrEqual(h);
      }
    });

    it(`places each link inside the card without overlaps (${shape})`, () => {
      const { links } = layoutAbout(input(), w, h, measure);
      expect(links.map((l) => l.href)).toEqual(contactLinks(about(), socials).map((l) => l.href));
      for (const l of links) {
        expect(l.x0).toBeGreaterThanOrEqual(0);
        expect(l.y0).toBeGreaterThanOrEqual(0);
        expect(l.x1).toBeLessThanOrEqual(1);
        expect(l.y1).toBeLessThanOrEqual(1);
      }
      for (let i = 0; i < links.length; i++)
        for (let j = i + 1; j < links.length; j++) {
          const a = links[i];
          const b = links[j];
          const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
          expect(overlap, `${a.href} / ${b.href}`).toBe(false);
        }
    });
  }

  it('cuts a long bio short with an ellipsis', () => {
    const { ops } = layoutAbout(input(), ...SIZES.wide, measure);
    const bio = ops.filter((o): o is Extract<Op, { kind: 'text' }> => o.kind === 'text' && o.font.startsWith('400 21px'));
    expect(bio.length).toBeLessThanOrEqual(4);
    expect(bio.at(-1)!.text.endsWith('…')).toBe(true);
  });

  it('draws one portrait', () => {
    expect(layoutAbout(input(), ...SIZES.tall, measure).ops.filter((o) => o.kind === 'photo')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/scene/about-card.test.ts`
Expected: FAIL with `Failed to resolve import "./about-card"`.

- [ ] **Step 3: Implement `src/scene/about-card.ts`**

```ts
import type { About, Social } from '../content/schema';
import { drawTracked, FONT } from './textures';

/** Layout pixels per world unit (the labels' scale), and the canvas's backing scale on top. */
export const CARD_PX = 220;
export const CARD_SS = 2;

const WHITE = '#f5f5f7';
const BODY = 'rgba(245,245,247,0.78)';
const MUTED = 'rgba(235,235,245,0.45)';
const LINK = '#6cb4ff';
const GREEN = '#30d158';
const GREY = '#8e8e93';
const f = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;
const LABEL = f(600, 13);
const LABEL_TRACK = 1.8;
const GAP = 28;

/** One thing to draw, in layout px (y down; text at its baseline). */
export type Op =
  | { kind: 'text'; x: number; y: number; text: string; font: string; color: string; tracking: number }
  | { kind: 'photo'; cx: number; cy: number; r: number }
  | { kind: 'pill'; x: number; y: number; w: number; h: number }
  | { kind: 'dot'; cx: number; cy: number; r: number; color: string }
  | { kind: 'rule'; x: number; y: number; w: number; h: number };

/** A clickable area, as fractions of the card (0..1, y down). */
export interface CardLink {
  href: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CardInput {
  name: string;
  role: string;
  about: About;
  socials: Social[];
}

/** Width of text in a font, with optional tracking between characters. */
export type Measure = (text: string, font: string, tracking?: number) => number;

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Email, résumé, then every social that isn't that same email: what a recruiter clicks. */
export function contactLinks(about: About, socials: Social[]): { label: string; href: string }[] {
  const mail = `mailto:${about.email}`;
  return [
    { label: about.email, href: mail },
    ...(about.resume ? [{ label: 'Résumé', href: about.resume }] : []),
    ...socials.filter((s) => s.href !== mail).map((s) => ({ label: s.label, href: s.href })),
  ];
}

/** The About as plain sentences, for screen readers and the no-WebGL page. */
export function aboutLines(a: About): string[] {
  return [
    a.bio,
    `${a.years}+ years of experience.`,
    `Based in ${a.location}${a.workPreference ? ` · ${a.workPreference}` : ''}.`,
    a.availability,
    `Skills: ${a.skills.join(', ')}.`,
    ...a.timeline.map((t) => `${t.role}, ${t.org}, ${t.period}.`),
  ];
}

/** Text cut to fit a width, with an ellipsis. */
function fit(text: string, font: string, maxW: number, measure: Measure, tracking = 0) {
  if (measure(text, font, tracking) <= maxW) return text;
  let t = text;
  while (t && measure(`${t}…`, font, tracking) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Words wrapped to a width, at most `maxLines` (the last one ellipsed if cut). */
function wrap(text: string, font: string, maxW: number, maxLines: number, measure: Measure) {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure(next, font) > maxW) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  if (out.length <= maxLines) return out;
  const kept = out.slice(0, maxLines);
  kept[maxLines - 1] = fit(`${kept[maxLines - 1]}…`, font, maxW, measure).replace(/……$/, '…');
  return kept;
}

/**
 * The About card: what to draw (layout px, CARD_PX per world unit) and where its links are. Wide
 * cards set the person on the left and the details in a right column; tall ones stack everything.
 * Pure: `measure` supplies text widths, so it is tested without a canvas.
 */
export function layoutAbout(input: CardInput, w: number, h: number, measure: Measure): { ops: Op[]; links: CardLink[] } {
  const ops: Op[] = [];
  const links: CardLink[] = [];
  const a = input.about;
  const wide = w > h;
  const pad = wide ? 64 : 56;

  const text = (x: number, y: number, t: string, font: string, color: string, tracking = 0) => {
    ops.push({ kind: 'text', x, y, text: t, font, color, tracking });
    return measure(t, font, tracking);
  };
  const label = (x: number, y: number, t: string) => text(x, y, t.toUpperCase(), LABEL, MUTED, LABEL_TRACK);

  /** A titled block in a column, from y; returns the y below it. */
  type Block = (x: number, y: number, colW: number) => number;

  const bio: Block = (x, y, colW) => {
    label(x, y + 13, 'About');
    y += 13 + 16;
    for (const l of wrap(a.bio, f(400, 21), colW, wide ? 4 : 6, measure)) {
      text(x, y + 21, l, f(400, 21), BODY);
      y += 30;
    }
    return y;
  };

  const skills: Block = (x, y, colW) => {
    label(x, y + 13, 'Skills');
    y += 13 + 14;
    const font = f(500, 16);
    const ph = 32;
    let cx = x;
    for (const s of a.skills) {
      const t = fit(s, font, colW - 28, measure);
      const pw = measure(t, font) + 28;
      if (cx > x && cx + pw > x + colW) {
        cx = x;
        y += ph + 8;
      }
      ops.push({ kind: 'pill', x: cx, y, w: pw, h: ph });
      text(cx + 14, y + 22, t, font, WHITE);
      cx += pw + 8;
    }
    return y + ph;
  };

  const place: Block = (x, y, colW) => {
    const half = a.workPreference ? (colW - 24) / 2 : colW;
    const value = f(500, 20);
    label(x, y + 13, 'Location');
    text(x, y + 47, fit(a.location, value, half, measure), value, WHITE);
    if (a.workPreference) {
      label(x + half + 24, y + 13, 'Work');
      text(x + half + 24, y + 47, fit(a.workPreference, value, half, measure), value, WHITE);
    }
    return y + 53;
  };

  const timeline: Block = (x, y, colW) => {
    label(x, y + 13, 'Experience');
    y += 13 + 12;
    for (const t of a.timeline) {
      text(x, y + 20, fit(t.role, f(600, 19), colW, measure), f(600, 19), WHITE);
      text(x, y + 44, fit(`${t.org} · ${t.period}`, f(400, 17), colW, measure), f(400, 17), MUTED);
      y += 52;
    }
    return y - 6;
  };

  const contact: Block = (x, y, colW) => {
    label(x, y + 13, 'Contact');
    y += 13 + 12;
    const font = f(500, 19);
    let cx = x;
    for (const l of contactLinks(a, input.socials)) {
      const t = fit(l.label, font, colW - 8, measure);
      const lw = measure(t, font);
      if (cx > x && cx + lw > x + colW) {
        cx = x;
        y += 30;
      }
      text(cx, y + 20, t, font, LINK);
      links.push({ href: l.href, x0: Math.max(0, cx - 4) / w, y0: (y - 2) / h, x1: Math.min(w, cx + lw + 4) / w, y1: (y + 26) / h });
      cx += lw + 22;
    }
    return y + 26;
  };

  /** Portrait, name and role: stacked, or the name beside the portrait. Returns the y below. */
  const person = (x: number, y: number, colW: number, r: number, beside: boolean) => {
    ops.push({ kind: 'photo', cx: x + r, cy: y + r, r });
    const name = f(600, 40);
    const role = f(500, 15);
    if (beside) {
      const tx = x + 2 * r + 28;
      const tw = colW - 2 * r - 28;
      text(tx, y + r - 4, fit(input.name, name, tw, measure), name, WHITE);
      text(tx, y + r + 30, fit(input.role.toUpperCase(), role, tw, measure, 2.2), role, MUTED, 2.2);
      return y + 2 * r;
    }
    y += 2 * r + 30;
    text(x, y + 36, fit(input.name, name, colW, measure), name, WHITE);
    text(x, y + 68, fit(input.role.toUpperCase(), role, colW, measure, 2.2), role, MUTED, 2.2);
    return y + 72;
  };

  /** The big "N+" with its caption, then availability. Returns the y below. */
  const years = (x: number, y: number, colW: number) => {
    const size = wide ? 108 : 96;
    const base = y + size * 0.82;
    const nw = text(x, base, `${a.years}+`, f(600, size), WHITE);
    label(x + nw + 16, base - 22, 'Years of');
    label(x + nw + 16, base, 'experience');
    y = base + 30;
    ops.push({ kind: 'dot', cx: x + 7, cy: y + 13, r: 6, color: a.available ? GREEN : GREY });
    text(x + 24, y + 20, fit(a.availability, f(500, 19), colW - 24, measure), f(500, 19), WHITE);
    return y + 30;
  };

  const blocks: Block[] = [bio, skills, place, ...(a.timeline.length ? [timeline] : []), contact];
  const column = (x: number, y: number, colW: number) => {
    for (const b of blocks) y = b(x, y, colW) + GAP;
  };

  if (wide) {
    const inner = w - pad * 2;
    const leftW = Math.round(inner * 0.32);
    const rightX = pad + leftW + 56;
    const y = person(pad, pad, leftW, Math.min(96, leftW * 0.3), false);
    years(pad, y + GAP, leftW);
    ops.push({ kind: 'rule', x: rightX - 28, y: pad, w: 1.5, h: h - pad * 2 });
    column(rightX, pad, w - pad - rightX);
  } else {
    const colW = w - pad * 2;
    let y = person(pad, pad, colW, 84, true) + GAP;
    y = years(pad, y, colW) + GAP;
    ops.push({ kind: 'rule', x: pad, y, w: colW, h: 1.5 });
    column(pad, y + 1.5 + GAP, colW);
  }
  return { ops, links };
}

function portrait(ctx: CanvasRenderingContext2D, op: Extract<Op, { kind: 'photo' }>, initials: string, photo?: HTMLImageElement) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
  ctx.clip();
  if (photo?.naturalWidth) {
    // Cover the circle, centred.
    const k = Math.max((2 * op.r) / photo.naturalWidth, (2 * op.r) / photo.naturalHeight);
    const pw = photo.naturalWidth * k;
    const ph = photo.naturalHeight * k;
    ctx.drawImage(photo, op.cx - pw / 2, op.cy - ph / 2, pw, ph);
  } else {
    const g = ctx.createLinearGradient(op.cx - op.r, op.cy - op.r, op.cx + op.r, op.cy + op.r);
    g.addColorStop(0, '#3a3a3e');
    g.addColorStop(1, '#1c1c1f');
    ctx.fillStyle = g;
    ctx.fillRect(op.cx - op.r, op.cy - op.r, op.r * 2, op.r * 2);
    ctx.fillStyle = WHITE;
    ctx.font = f(600, Math.round(op.r * 0.75));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, op.cx, op.cy + op.r * 0.04);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draws the card on a canvas CARD_SS times its layout size: a dark anodised plate (a touch
 * lighter in the middle) with a machined hairline border following its rounded corners.
 */
export function drawAbout(
  ctx: CanvasRenderingContext2D,
  ops: Op[],
  w: number,
  h: number,
  o: { initials: string; corner: number; photo?: HTMLImageElement },
) {
  ctx.save();
  ctx.setTransform(CARD_SS, 0, 0, CARD_SS, 0, 0);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#121214');
  g.addColorStop(1, '#09090a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(20, 20, w - 40, h - 40, Math.max(4, o.corner - 20));
  ctx.stroke();
  for (const op of ops) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (op.kind === 'text') {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      if (op.tracking) drawTracked(ctx, op.text, 0, op.y, op.tracking, op.x);
      else ctx.fillText(op.text, op.x, op.y);
    } else if (op.kind === 'pill') {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(op.x, op.y, op.w, op.h, op.h / 2);
      ctx.fill();
      ctx.stroke();
    } else if (op.kind === 'dot') {
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.kind === 'rule') {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else portrait(ctx, op, o.initials, o.photo);
  }
  ctx.restore();
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/scene/about-card.test.ts`
Expected: PASS.

If "inside the card (wide)" fails on `y`, the right column overflows: lower the wide bio to 3 lines, or `GAP` to 24.

- [ ] **Step 5: `Underside.showAbout` and `linkAt`**

In `src/scene/underside.ts`:

1. Update the imports:

```ts
import { CARD_PX, CARD_SS, drawAbout, initialsOf, layoutAbout, type CardInput, type CardLink, type Measure } from './about-card';
```

2. Add the field `private links: CardLink[] = [];` after `uniforms`.

3. Add these methods before `setCard`:

```ts
  /** Draws the About card onto the plate, and again once the portrait has loaded. */
  showAbout(input: CardInput, photoUrl: string) {
    const w = Math.round(OUTER_W * CARD_PX);
    const h = Math.round(OUTER_D * CARD_PX);
    const canvas = document.createElement('canvas');
    canvas.width = w * CARD_SS;
    canvas.height = h * CARD_SS;
    const ctx = canvas.getContext('2d')!;
    const measure: Measure = (t, font, tracking = 0) => {
      ctx.font = font;
      return ctx.measureText(t).width + tracking * Math.max(0, [...t].length - 1);
    };
    const { ops, links } = layoutAbout(input, w, h, measure);
    this.links = links;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const look = { initials: initialsOf(input.name), corner: OUTER_R * CARD_PX };
    const draw = (photo?: HTMLImageElement) => {
      drawAbout(ctx, ops, w, h, { ...look, photo });
      tex.needsUpdate = true;
    };
    draw();
    this.setCard(tex);
    if (!photoUrl) return;
    const img = new Image();
    img.onload = () => draw(img);
    img.onerror = () => console.warn(`The About portrait did not load (${photoUrl}); showing initials.`);
    img.src = photoUrl;
  }

  /** The link on the card at a hit's uv, if any. */
  linkAt(uv: THREE.Vector2): string | null {
    const x = uv.x;
    const y = 1 - uv.y; // the card runs top-down, uv bottom-up
    return this.links.find((l) => x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1)?.href ?? null;
  }
```

- [ ] **Step 6: Wire the card into `main.ts`**

1. After `box.group.add(underside.mesh);`, add:

```ts
underside.showAbout({ name: settings.identity.name, role: settings.identity.role, about: settings.about, socials: settings.socials }, settings.about.photo);
```

2. In `prewarm()`, change `stage.warm([...tiles.flatMap((t) => t.stack.textures), ...chipSets.flatMap((c) => c.textures)]);` to:

```ts
  stage.warm([...tiles.flatMap((t) => t.stack.textures), ...chipSets.flatMap((c) => c.textures), underside.texture]);
```

3. Above `function onTap()`, add:

```ts
/** The link under the pointer, if any: on the About card when the box rests on its back. */
function linkUnderPointer(): string | null {
  if (orbit.face === 'bottom' && orbit.atRest) {
    const hit = pointer.cast([underside.mesh], false)[0];
    return hit?.uv ? underside.linkAt(hit.uv) : null;
  }
  return null;
}
```

4. In `onTap()`, directly after `if (touch) void motion.enable();`, add:

```ts
  const link = linkUnderPointer();
  if (link) return openLink(link);
  if (orbit.face === 'bottom') return; // on its back only the card's links respond
```

5. In the cursor block, add this line directly before the `else if (canTurn() && …) cursor = 'grab';` line:

```ts
  else if (!gestures.dragging && linkUnderPointer()) cursor = 'pointer';
```

- [ ] **Step 7: Typecheck, test, browser check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all PASS.

In the browser:
1. Open `/#about` at desktop size. The card reads upright and not mirrored. Initials are in the circle; name, role, "5+ YEARS OF EXPERIENCE", the green dot with "Open to new roles", bio, skill pills, location/work, timeline and contact links are visible. Nothing is clipped by the rounded corners. Take a screenshot.
2. If the text is upside down or mirrored, the plate's uv mapping is flipped. Fix it in `Underside`'s constructor (`uv.setXY(i, 1 - …, …)` for mirrored, `…, 0.5 - pos.getY(i) / OUTER_D` for upside down) **and** mirror the same axis in `linkAt`. Re-check.
3. Hover the email: the cursor shows `pointer`. Click LinkedIn: a new tab opens (you can close it). Clicking the email triggers `mailto:`.
4. Phone viewport (375×812) at `/#about`: the tall card layout fills the screen and the text is legible. Take a screenshot.
5. From the overview, scroll down. The card comes up as the box rolls over, with no flash of the plain plate.
6. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/scene/about-card.ts src/scene/about-card.test.ts src/scene/underside.ts src/main.ts
git commit -m "Draw the About card on the box's underside, with clickable contact links"
```

---

### Task 7: Space Gray anodised lid with engraved, clickable socials

**Files:**
- Modify: `src/scene/textures.ts`
- Modify: `src/scene/lid.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `settings.socials` (Task 1); `linkUnderPointer` (Task 6)
- Produces:
  - `textures.ts`:
    - `beadBlastRoughness(w, h, base = 0.42, spread = 0.04): THREE.CanvasTexture`
    - `interface PxBox { x0; y0; x1; y1 }`
    - `interface Engraving { height; mask; lines: PxBox[]; links: (PxBox & { href: string })[] }`
    - `engravingMaps(w, h, name, role, socials, o?: { scale?: number; stack?: boolean }): Engraving`
    - `brushedRoughness` is removed.
  - `lid.ts`: `export const LID_TOP`; `Lid.linkAt(hit: THREE.Intersection): string | null`; private `mapW`, `mapH`, `links`

- [ ] **Step 1: Bead-blast roughness and socials in the engraving (`textures.ts`)**

Replace the whole `brushedRoughness` function with:

```ts
/**
 * Bead-blasted anodised aluminium (a MacBook's finish): an even, fine-grained matte. Per-pixel
 * noise around the base roughness and no direction, so the sheen is soft, with no streaks.
 */
export function beadBlastRoughness(w: number, h: number, base = 0.42, spread = 0.04): THREE.CanvasTexture {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = Math.round((base + (Math.random() * 2 - 1) * spread) * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
```

Replace the whole `engravingMaps` function (and its doc comment) with:

```ts
/** A rectangle on a canvas, in its pixels. */
export interface PxBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Engraving {
  /** Height map: white = surface, black = groove. */
  height: HTMLCanvasElement;
  /** Where the metal is cut (grey 0–200), for shading and for the laser. */
  mask: HTMLCanvasElement;
  /** Each engraved line's ink box, in the order the laser takes them: name, role, socials. */
  lines: PxBox[];
  /** Each social's box, with its link. */
  links: (PxBox & { href: string })[];
}

/** Width of text as drawTracked sets it. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number) {
  const chars = [...text];
  return chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + tracking * (chars.length - 1);
}

/**
 * Engraving maps: name and role, then the socials in smaller type (as many per line as fit, or
 * one per line on the tall lid), all centred as one block.
 */
export function engravingMaps(
  w: number,
  h: number,
  name: string,
  role: string,
  socials: { text: string; href: string }[],
  o: { scale?: number; stack?: boolean } = {},
): Engraving {
  const height = canvas(w, h);
  const hc = height.getContext('2d')!;
  hc.fillStyle = '#fff';
  hc.fillRect(0, 0, w, h);
  hc.fillStyle = '#000';
  hc.textBaseline = 'alphabetic';
  const u = (w / 100) * (o.scale ?? 1); // layout unit
  const type = {
    name: { size: u * 4.4, track: u * 0.85 },
    role: { size: u * 1.35, track: u * 0.7 },
    social: { size: u * 1.0, track: u * 0.45 },
  };
  const font = (t: { size: number }) => `500 ${t.size}px ${FONT}`;

  // Socials: as many per line as fit in most of the width (one per line when stacked).
  const gap = u * 2.4;
  hc.font = font(type.social);
  const rows: { text: string; href: string; w: number }[][] = [];
  for (const s of socials) {
    const text = s.text.toUpperCase();
    const item = { text, href: s.href, w: trackedWidth(hc, text, type.social.track) };
    const row = rows[rows.length - 1];
    const used = row ? row.reduce((a, b) => a + b.w + gap, 0) : 0;
    if (row && !o.stack && used + item.w <= w * 0.86) row.push(item);
    else rows.push([item]);
  }

  // Baselines below the name's. The block (the name's cap top to the last baseline) is centred.
  const roleAt = u * 3.3;
  const socialAt = roleAt + u * 3.4;
  const socialLine = u * 2.1;
  const lastAt = rows.length ? socialAt + socialLine * (rows.length - 1) : roleAt;
  const yName = h / 2 + (type.name.size * 0.74 - lastAt) / 2;

  const pad = Math.ceil(u * 0.3);
  const box = (x: number, width: number, y: number, size: number): PxBox => ({
    x0: Math.max(0, x - pad),
    x1: Math.min(w, x + width + pad),
    y0: Math.max(0, y - size * 0.8 - pad),
    y1: Math.min(h, y + size * 0.25 + pad),
  });
  const lines: PxBox[] = [];
  const links: (PxBox & { href: string })[] = [];
  const line = (text: string, y: number, t: { size: number; track: number }) => {
    hc.font = font(t);
    const tw = trackedWidth(hc, text, t.track);
    drawTracked(hc, text, w / 2, y, t.track);
    lines.push(box(w / 2 - tw / 2, tw, y, t.size));
  };
  line(name.toUpperCase(), yName, type.name);
  line(role.toUpperCase(), yName + roleAt, type.role);
  hc.font = font(type.social);
  rows.forEach((row, r) => {
    const y = yName + socialAt + socialLine * r;
    const total = row.reduce((a, b) => a + b.w, 0) + gap * (row.length - 1);
    let x = w / 2 - total / 2;
    for (const item of row) {
      drawTracked(hc, item.text, 0, y, type.social.track, x);
      links.push({ ...box(x, item.w, y, type.social.size), href: item.href });
      x += item.w + gap;
    }
    lines.push(box(w / 2 - total / 2, total, y, type.social.size));
  });

  const mask = canvas(w, h);
  const mc = mask.getContext('2d')!;
  mc.drawImage(height, 0, 0);
  const d = mc.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = ((255 - d.data[i]) / 255) * 200;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
  }
  mc.putImageData(d, 0, 0);
  return { height, mask, lines, links };
}
```

- [ ] **Step 2: The anodised lid (`lid.ts`)**

1. Change the textures import to `import { beadBlastRoughness, engravingMaps, heightToNormal, type PxBox } from './textures';`.

2. Under `const REST_Y = TOP_Y + CHAMFER;`, add:

```ts
/** The lid's top surface in its own space (the extrusion's front cap: depth plus the bevel). */
export const LID_TOP = LT - CHAMFER;
/** Space Gray anodised aluminium, as on a MacBook. */
const ANODISED = '#7d7e80';
/** Raw aluminium, where the laser has cut through the anodising: bright and a little frosted. */
const RAW = new THREE.Color('#d9dbde');

/**
 * Shades the engraving as cut metal: where the mask says the laser went through the anodising,
 * the surface turns raw aluminium (lighter, a little rougher). The normal map gives the groove.
 */
function engrave(m: THREE.MeshPhysicalMaterial, mask: THREE.Texture) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask };
    sh.uniforms.uRaw = { value: RAW };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;\nuniform vec3 uRaw;\nfloat cut;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ncut = texture2D(uMask, vNormalMapUv).r * (255.0 / 200.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRaw, cut);',
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, cut);');
  };
  m.customProgramCacheKey = () => 'lid-engrave';
}
```

3. Change the class doc comment to:

```ts
/**
 * Space Gray anodised aluminium lid: bead-blasted top with a diamond-cut chamfer, laser-engraved
 * with name, role and socials (raw metal shows where the laser cut). The only lit object in the scene.
 */
```

4. Add fields after `private mats: THREE.MeshPhysicalMaterial[];`:

```ts
  /** The engraving map's size, and each engraved social's box on it. */
  private mapW: number;
  private mapH: number;
  private links: (PxBox & { href: string })[];
```

5. Replace the constructor from its first line through the end of the `top` material (`});` after `transparent: true,`) with:

```ts
  constructor(private reduced: boolean) {
    const aspect = LD / LW;
    // The tall (portrait) lid spans a phone's width (~1200 device px at 3x): a bit over that keeps
    // the engraving crisp without the full desktop map's cost.
    this.mapW = PORTRAIT ? 1600 : 2048;
    this.mapH = Math.round(this.mapW * aspect);
    // Narrow lid: larger type, and the socials one per line.
    const eng = engravingMaps(this.mapW, this.mapH, settings.identity.name, settings.identity.role, settings.socials, {
      scale: PORTRAIT ? 1.3 : 1,
      stack: PORTRAIT,
    });
    this.links = eng.links;
    const normal = heightToNormal(eng.height, 3.6);
    const rough = beadBlastRoughness(1024, Math.round(1024 * aspect));
    // Extrude caps use shape coordinates as UVs: map them onto 0..1.
    for (const t of [normal, rough]) {
      t.repeat.set(1 / LW, 1 / LD);
      t.offset.set(0.5, 0.5);
    }
    // Sampled through the normal map's (already mapped) uv in the shader patch.
    const mask = new THREE.CanvasTexture(eng.mask);
    mask.colorSpace = THREE.NoColorSpace;

    const top = new THREE.MeshPhysicalMaterial({
      color: ANODISED,
      metalness: 1,
      roughness: 1,
      roughnessMap: rough,
      normalMap: normal,
      clearcoat: 0.15, // the anodised oxide layer
      clearcoatRoughness: 0.5,
      transparent: true,
    });
    engrave(top, mask);
```

6. Change the edge material's colour from `'#eef0f3'` to `'#e4e6e9'`, and update its comment to `// Diamond-cut edges: polished raw aluminium (cut through the anodising), so they flash as the cursor moves.`

7. Add this method after `get openness()`:

```ts
  /** The social engraved where a ray hit the lid's top, if any. */
  linkAt(hit: THREE.Intersection): string | null {
    if (!hit.uv || !hit.face || hit.face.normal.y < 0.9) return null; // the top cap only
    // Cap uvs are shape coordinates; the map's y runs down while shape y runs to the back.
    const x = (hit.uv.x / LW + 0.5) * this.mapW;
    const y = (0.5 - hit.uv.y / LD) * this.mapH;
    return this.links.find((l) => x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1)?.href ?? null;
  }
```

- [ ] **Step 3: Lid links in `main.ts`**

Replace `linkUnderPointer()` with:

```ts
/** The link under the pointer, if any: a social on the closed lid, or on the About card. */
function linkUnderPointer(): string | null {
  if (!orbit.atRest) return null;
  if (orbit.face === 'bottom') {
    const hit = pointer.cast([underside.mesh], false)[0];
    return hit?.uv ? underside.linkAt(hit.uv) : null;
  }
  if (lid.state === 'closed') {
    const hit = pointer.cast([lid.hit], false)[0];
    return hit ? lid.linkAt(hit) : null;
  }
  return null;
}
```

- [ ] **Step 4: Typecheck, test, browser check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors (in particular, nothing still imports `brushedRoughness`), all PASS.

In the browser:
1. The lid is Space Gray: an even, fine matte with no streaks. Name and role are engraved in lighter raw metal. Below them, `GITHUB.COM/YOUR-HANDLE · LINKEDIN.COM/IN/YOUR-HANDLE · YOU@EXAMPLE.COM` sits on one or two centred lines. The chamfer flashes bright.
2. Move the cursor: highlights roll softly across the matte top. Take a screenshot.
3. Hover a social: the cursor shows `pointer`. Clicking GitHub opens a new tab and the lid stays on. Clicking elsewhere on the lid opens it.
4. Phone viewport: the socials are stacked one per line and legible. Tapping one opens it. Take a screenshot.
5. If a click on a social opens the wrong one, or the lid opens instead, invert the `y` mapping in `Lid.linkAt` (`(hit.uv.y / LD + 0.5)` vs `(0.5 - hit.uv.y / LD)`) and re-test.
6. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/scene/textures.ts src/scene/lid.ts src/main.ts
git commit -m "Space Gray anodised lid with engraved, clickable socials"
```

---

### Task 8: Etch schedule (pure raster hatch + reveal times)

**Files:**
- Create: `src/scene/etch.ts`
- Test: `src/scene/etch.test.ts`

**Interfaces:**
- Produces:
  - `interface Box { x0; y0; x1; y1 }`, `interface EtchLine extends Box { duration: number }`
  - `interface Row { y; x0; x1; dir: 1 | -1; t0; t1; ink: boolean }`
  - `interface Ink { data: ArrayLike<number>; width; height; stride }`
  - `JUMP = 0.012`, `TRAVEL = 0.15`
  - `class EtchSchedule`:
    - `constructor(ink: Ink, lines: EtchLine[], pitch: number)`
    - `rows: Row[]`, `total: number`
    - `spotAt(t): { x: number; y: number; firing: boolean }`
    - `timeAt(x, y): number`
    - `revealTimes(scale): { data: Float32Array; width: number; height: number }` (rows top-down, like the canvas)

- [ ] **Step 1: Write the failing tests**

Create `src/scene/etch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EtchSchedule, TRAVEL, type Ink } from './etch';

/** 100×40 grey map (1 value per pixel): ink in two rectangles, like two engraved lines. */
function ink(): Ink {
  const width = 100;
  const height = 40;
  const data = new Uint8Array(width * height);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = 200;
  };
  fill(20, 10, 80, 20); // "name"
  fill(30, 28, 60, 32); // "role"
  return { data, width, height, stride: 1 };
}
const lines = [
  { x0: 15, y0: 8, x1: 85, y1: 22, duration: 1 },
  { x0: 25, y0: 26, x1: 65, y1: 34, duration: 0.5 },
];
const make = () => new EtchSchedule(ink(), lines, 2);

describe('EtchSchedule', () => {
  it('spends each line’s budget, plus the travel between lines', () => {
    expect(make().total).toBeCloseTo(1 + TRAVEL + 0.5, 9);
  });

  it('hatches back and forth, row after row, in time order', () => {
    const { rows } = make();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].t0).toBeGreaterThanOrEqual(rows[i - 1].t1 - 1e-12);
      if (rows[i].y > rows[i - 1].y && rows[i].x0 === rows[i - 1].x0) expect(rows[i].dir).toBe(-rows[i - 1].dir as 1 | -1);
    }
  });

  it('visits every row that has ink', () => {
    const s = make();
    for (let y = 10; y < 20; y++) expect(s.rows.some((r) => r.ink && Math.abs(r.y - y) <= 1)).toBe(true);
  });

  it('times along each row run in the direction of travel', () => {
    const s = make();
    for (const r of s.rows) {
      const a = s.timeAt(r.dir > 0 ? r.x0 + 1 : r.x1 - 1, r.y);
      const b = s.timeAt(r.dir > 0 ? r.x1 - 1 : r.x0 + 1, r.y);
      expect(b).toBeGreaterThanOrEqual(a);
      expect(a).toBeGreaterThanOrEqual(r.t0 - 1e-9);
      expect(b).toBeLessThanOrEqual(r.t1 + 1e-9);
    }
  });

  it('is zero outside every line (nothing to cut there)', () => {
    expect(make().timeAt(5, 2)).toBe(0);
  });

  it('fires over ink only, and stops at the end', () => {
    const s = make();
    const row = s.rows.find((r) => r.ink && r.y > 10 && r.y < 20)!;
    const mid = (row.t0 + row.t1) / 2; // halfway along: x = 50, inside the ink
    expect(s.spotAt(mid).firing).toBe(true);
    const early = row.t0 + (row.t1 - row.t0) * 0.02; // x ≈ 16 or 84: outside the ink
    expect(s.spotAt(early).firing).toBe(false);
    expect(s.spotAt(s.total + 1).firing).toBe(false);
  });

  it('samples reveal times on a coarser grid', () => {
    const r = make().revealTimes(4);
    expect(r.width).toBe(25);
    expect(r.height).toBe(10);
    expect(Math.max(...r.data)).toBeLessThanOrEqual(make().total);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/scene/etch.test.ts`
Expected: FAIL with `Failed to resolve import "./etch"`.

- [ ] **Step 3: Implement `src/scene/etch.ts`**

```ts
/**
 * The laser's route over the lid's engraving map, like a galvo fiber laser filling text: line by
 * line (name, role, socials), a back-and-forth raster hatch over each line's ink. Rows without ink
 * are jumped quickly. Pure (pixels and seconds), so it is tested without a GPU.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface EtchLine extends Box {
  /** Seconds to spend on this line. */
  duration: number;
}

export interface Row {
  y: number;
  x0: number;
  x1: number;
  /** 1: left to right. */
  dir: 1 | -1;
  t0: number;
  t1: number;
  ink: boolean;
}

/** A grey map: `data[(y * width + x) * stride]` is how deep to cut there (0 = not at all). */
export interface Ink {
  data: ArrayLike<number>;
  width: number;
  height: number;
  stride: number;
}

/** Seconds for a row with nothing to cut. */
export const JUMP = 0.012;
/** Seconds to move on to the next line. */
export const TRAVEL = 0.15;
const INK = 40;

export class EtchSchedule {
  readonly rows: Row[] = [];
  readonly total: number;
  private spans: { box: Box; first: number; count: number }[] = [];

  constructor(
    private ink: Ink,
    lines: EtchLine[],
    private pitch: number,
  ) {
    let t = 0;
    lines.forEach((line, li) => {
      if (li > 0) t += TRAVEL;
      const ys: number[] = [];
      for (let y = line.y0 + pitch / 2; y < line.y1; y += pitch) ys.push(y);
      const inked = ys.map((y) => this.rowHasInk(line, y));
      const n = inked.filter(Boolean).length;
      const rowT = n ? Math.max(0, line.duration - (ys.length - n) * JUMP) / n : 0;
      this.spans.push({ box: line, first: this.rows.length, count: ys.length });
      ys.forEach((y, i) => {
        const dt = inked[i] ? rowT : JUMP;
        this.rows.push({ y, x0: line.x0, x1: line.x1, dir: i % 2 ? -1 : 1, t0: t, t1: t + dt, ink: inked[i] });
        t += dt;
      });
    });
    this.total = t;
  }

  /** Where the spot is at time t (map pixels), and whether it is cutting. */
  spotAt(t: number): { x: number; y: number; firing: boolean } {
    const last = this.rows[this.rows.length - 1];
    if (!last) return { x: 0, y: 0, firing: false };
    if (t >= this.total) return { x: last.dir > 0 ? last.x1 : last.x0, y: last.y, firing: false };
    const r = this.rowAt(t);
    if (t > r.t1) return { x: r.dir > 0 ? r.x1 : r.x0, y: r.y, firing: false }; // moving to the next line
    const f = (t - r.t0) / (r.t1 - r.t0 || 1);
    const x = r.dir > 0 ? r.x0 + f * (r.x1 - r.x0) : r.x1 - f * (r.x1 - r.x0);
    return { x, y: r.y, firing: r.ink && this.near(x, r.y) };
  }

  /** The moment the spot passes over pixel (x, y); 0 outside every line (nothing is cut there). */
  timeAt(x: number, y: number): number {
    for (const s of this.spans) {
      const b = s.box;
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1 || !s.count) continue;
      const i = Math.min(s.count - 1, Math.max(0, Math.floor((y - b.y0) / this.pitch)));
      const r = this.rows[s.first + i];
      const f = Math.min(1, Math.max(0, (x - r.x0) / (r.x1 - r.x0 || 1)));
      return r.t0 + (r.dir > 0 ? f : 1 - f) * (r.t1 - r.t0);
    }
    return 0;
  }

  /** Reveal times on a grid `scale` times coarser than the map, rows top-down like the canvas. */
  revealTimes(scale: number) {
    const width = Math.ceil(this.ink.width / scale);
    const height = Math.ceil(this.ink.height / scale);
    const data = new Float32Array(width * height);
    for (let j = 0; j < height; j++)
      for (let i = 0; i < width; i++) data[j * width + i] = this.timeAt((i + 0.5) * scale, (j + 0.5) * scale);
    return { data, width, height };
  }

  /** The row being cut at t: the last one started by then. */
  private rowAt(t: number) {
    let lo = 0;
    let hi = this.rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.rows[mid].t0 <= t) lo = mid;
      else hi = mid - 1;
    }
    return this.rows[lo];
  }

  private at(x: number, y: number) {
    const { data, width, height, stride } = this.ink;
    const xi = Math.min(width - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(height - 1, Math.max(0, Math.round(y)));
    return data[(yi * width + xi) * stride];
  }

  private rowHasInk(b: Box, y: number) {
    for (let yy = Math.floor(y - this.pitch / 2); yy < y + this.pitch / 2; yy++)
      for (let x = Math.floor(b.x0); x <= b.x1; x++) if (this.at(x, yy) > INK) return true;
    return false;
  }

  /** Ink within 2px of a point (the spot is a little wider than one pixel). */
  private near(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (this.at(x + dx, y + dy) > INK) return true;
    return false;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/scene/etch.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/scene/etch.ts src/scene/etch.test.ts
git commit -m "Add the etch schedule: a raster hatch over the engraving with reveal times"
```

---

### Task 9: Laser etching on first load

**Files:**
- Modify: `src/scene/lid.ts`
- Create: `src/scene/laser.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `EtchSchedule` (Task 8); `engravingMaps().lines` (Task 7); `LID_TOP` (Task 7)
- Produces:
  - `Lid.etch: EtchSchedule`, `Lid.setEtchTime(t: number)`, `Lid.surfacePoint(x, y, out): THREE.Vector3`
  - `class Laser { constructor(lid: Lid); update(dt: number, pxScale: number); finish(); done: boolean; get cutDone(): boolean }`

- [ ] **Step 1: Reveal and heat in the lid's shader (`lid.ts`)**

1. Add the import `import { EtchSchedule } from './etch';`.

2. Under `const RAW = …`, add:

```ts
/** Etch time meaning "long finished": everything cut, cooled. */
const DONE = 1e4;
/** The normal map's chunk with the groove relief scaled by whether the laser has passed. */
const OPENED_NORMALS = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * opened;');

/** The etch's reveal times as a half-float texture (rows flipped: a DataTexture's first row is v = 0). */
function revealTexture(etch: EtchSchedule) {
  const t = etch.revealTimes(4);
  const data = new Uint16Array(t.width * t.height);
  for (let j = 0; j < t.height; j++)
    for (let i = 0; i < t.width; i++) data[(t.height - 1 - j) * t.width + i] = THREE.DataUtils.toHalfFloat(t.data[j * t.width + i]);
  const tex = new THREE.DataTexture(data, t.width, t.height, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
```

3. Replace the whole `engrave` function with:

```ts
/**
 * Shades the engraving as cut metal, as far as the laser has got: where it has passed (reveal
 * time ≤ etch time) the mask turns the surface raw aluminium (lighter, a little rougher) and the
 * groove's relief appears. Freshly cut metal glows orange and cools through red to nothing.
 */
function engrave(m: THREE.MeshPhysicalMaterial, mask: THREE.Texture, reveal: THREE.Texture) {
  const uniforms = { uMask: { value: mask }, uRaw: { value: RAW }, uReveal: { value: reveal }, uEtchTime: { value: DONE } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uMask;
uniform sampler2D uReveal;
uniform vec3 uRaw;
uniform float uEtchTime;
float cut;    // cut through to raw metal (0..1)
float opened; // the laser has passed here (0 or 1)
float heat;   // freshly cut, still glowing`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float tCut = texture2D(uReveal, vNormalMapUv).r;
opened = step(tCut, uEtchTime);
cut = texture2D(uMask, vNormalMapUv).r * (255.0 / 200.0) * opened;
heat = cut * exp(-max(uEtchTime - tCut, 0.0) / 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, uRaw, cut);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, cut);')
      .replace('#include <normal_fragment_maps>', OPENED_NORMALS)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += mix(vec3(0.5, 0.04, 0.0), vec3(1.0, 0.5, 0.12), heat) * heat * 2.5;`,
      );
  };
  m.customProgramCacheKey = () => 'lid-engrave';
  return uniforms;
}
```

4. Add fields after `private links: …;`:

```ts
  /** The laser's route over the engraving. */
  readonly etch: EtchSchedule;
  private cut: { uEtchTime: { value: number } };
```

5. In the constructor, replace `engrave(top, mask);` with:

```ts
    // The laser's route: name, role, then the socials, each with its time budget.
    const px = eng.mask.getContext('2d')!.getImageData(0, 0, this.mapW, this.mapH).data;
    const budget = (i: number) => (i === 0 ? 1.6 : i === 1 ? 0.8 : 1.1 / (eng.lines.length - 2));
    this.etch = new EtchSchedule(
      { data: px, width: this.mapW, height: this.mapH, stride: 4 },
      eng.lines.map((b, i) => ({ ...b, duration: budget(i) })),
      Math.max(2, Math.round(this.mapW / 700)),
    );
    this.cut = engrave(top, mask, revealTexture(this.etch));
```

6. Add these methods after `linkAt`:

```ts
  /** Seconds into the etch: what has been cut by then shows, and freshly cut metal glows. */
  setEtchTime(t: number) {
    this.cut.uEtchTime.value = t;
  }

  /** A point just above the lid's top (its own space) for engraving-map pixel (x, y). */
  surfacePoint(x: number, y: number, out: THREE.Vector3) {
    return out.set((x / this.mapW - 0.5) * LW, LID_TOP + 0.003, (y / this.mapH - 0.5) * LD);
  }
```

- [ ] **Step 2: Create `src/scene/laser.ts`**

```ts
import * as THREE from 'three';
import { LID_TOP, type Lid } from './lid';

const SPARKS = 200;
const GRAVITY = -4.5;
/** Seconds before the laser starts: shaders and textures have warmed by then. */
const DELAY = 0.5;
/** Seconds after the last cut for the glow to cool before the effect is put away. */
const COOL = 1.5;

/** Soft round glow: white, alpha falling off from the centre. */
function glowTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

const glowMat = (map: THREE.Texture, color: string) =>
  new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });

/**
 * The laser at work on the lid when the page first loads: a white-hot spot with a violet halo, a
 * small light skimming the metal with it, and orange sparks thrown off while it cuts. It lives in
 * the lid's group, so it rides the lid's knocks. It drives the lid's etch time; the lid shades what
 * has been cut, and the glow of fresh grooves.
 */
export class Laser {
  done = false;
  private t = -DELAY;
  private core: THREE.Sprite;
  private halo: THREE.Sprite;
  private light = new THREE.PointLight('#d4c8ff', 0, 0.9, 2);
  private sparks: THREE.Points;
  private pos = new Float32Array(SPARKS * 3);
  private vel = new Float32Array(SPARKS * 3);
  private life = new Float32Array(SPARKS);
  private span = new Float32Array(SPARKS).fill(1);
  private heat = new Float32Array(SPARKS);
  private next = 0;
  private carry = 0;
  private spot = new THREE.Vector3();

  constructor(private lid: Lid) {
    const glow = glowTexture();
    this.core = new THREE.Sprite(glowMat(glow, '#ffffff'));
    this.core.scale.setScalar(0.05);
    this.halo = new THREE.Sprite(glowMat(glow, '#8f7dff'));
    this.halo.scale.setScalar(0.26);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1));
    this.sparks = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aHeat;
          uniform float uScale;
          varying float vHeat;
          void main() {
            vHeat = aHeat;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(1.0, 0.012 * uScale * (0.4 + aHeat) / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vHeat;
          void main() {
            float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
            vec3 c = mix(vec3(0.7, 0.08, 0.0), vec3(1.0, 0.75, 0.35), vHeat);
            gl_FragColor = vec4(c * vHeat * 2.0, a * vHeat);
          }`,
      }),
    );
    this.sparks.frustumCulled = false; // they fly about; the bounds would go stale
    lid.group.add(this.core, this.halo, this.light, this.sparks);
    lid.setEtchTime(-1); // nothing cut yet
  }

  /** The last groove is cut (the glow may still be cooling). */
  get cutDone() {
    return this.done || this.t >= this.lid.etch.total;
  }

  /** `pxScale`: device pixels per world unit at distance 1 (for the sparks' size). */
  update(dt: number, pxScale: number) {
    if (this.done) return;
    this.t += dt;
    const etch = this.lid.etch;
    this.lid.setEtchTime(this.t < 0 ? -1 : this.t);
    const s = etch.spotAt(Math.max(0, this.t));
    const active = this.t >= 0 && this.t < etch.total;
    const on = active && s.firing;
    this.lid.surfacePoint(s.x, s.y, this.spot);
    const flicker = 0.75 + Math.random() * 0.25;
    this.core.position.copy(this.spot);
    this.halo.position.copy(this.spot);
    this.core.material.opacity = on ? flicker : active ? 0.08 : 0;
    this.halo.material.opacity = on ? 0.55 * flicker : active ? 0.04 : 0;
    this.light.position.copy(this.spot).y += 0.06;
    this.light.intensity = on ? 2.5 * flicker : 0;
    if (on) {
      this.carry += dt * 120;
      while (this.carry >= 1) {
        this.carry--;
        this.emit();
      }
    }
    this.stepSparks(dt);
    (this.sparks.material as THREE.ShaderMaterial).uniforms.uScale.value = pxScale;
    if (this.t > etch.total + COOL) this.finish();
  }

  /** Ends the etch at once: everything cut and cooled, the effect put away. */
  finish() {
    if (this.done) return;
    this.done = true;
    this.lid.setEtchTime(1e4);
    this.core.visible = this.halo.visible = this.sparks.visible = false;
    this.light.intensity = 0; // stays in the scene: removing a light would recompile the lid's shader
  }

  private emit() {
    const i = this.next;
    this.next = (this.next + 1) % SPARKS;
    this.pos.set([this.spot.x, this.spot.y, this.spot.z], i * 3);
    this.vel.set([(Math.random() - 0.5) * 1.6, 0.6 + Math.random(), (Math.random() - 0.5) * 1.6], i * 3);
    this.life[i] = this.span[i] = 0.3 + Math.random() * 0.4;
  }

  private stepSparks(dt: number) {
    for (let i = 0; i < SPARKS; i++) {
      if (this.life[i] <= 0) {
        this.heat[i] = 0;
        continue;
      }
      const k = i * 3;
      this.vel[k + 1] += GRAVITY * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.life[i] -= dt;
      if (this.pos[k + 1] < LID_TOP) this.life[i] = 0; // fell back onto the metal
      this.heat[i] = Math.max(0, this.life[i] / this.span[i]);
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.aHeat.needsUpdate = true;
  }
}
```

- [ ] **Step 3: Wire the laser into `main.ts`**

1. Add the import `import { Laser } from './scene/laser';`.

2. Directly after the `if (reopen) { lid.skip(); reveal.snap(1); }` block, add:

```ts
// First load: a laser engraves the lid. Not on a reopen, under reduced motion, or for dev hashes.
const laser = reduced || reopen || (import.meta.env.DEV && location.hash !== '') ? null : new Laser(lid);
```

3. In `openLid()`, after `lid.open();`, add `laser?.finish(); // lifting it off ends the etch at once`.

4. In `frame()`, directly after `lid.update(dt, time);`, add:

```ts
  laser?.update(dt, stage.res.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
```

5. In the hint section, change `const introDone = time > 1.5;` to:

```ts
  const introDone = laser ? laser.cutDone : time > 1.5;
```

- [ ] **Step 4: Typecheck, test, browser check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all PASS.

In the browser (plain `http://localhost:5173/`, no hash, reload a few times):
1. About 0.5 s after load, a white-hot spot with a violet halo zips back and forth over the name. The letters appear behind it as bright raw metal and glow orange, cooling to red, then nothing. Orange sparks spray up and fall back. The light glints on the matte metal around the spot. Then the role is cut, then the socials. The whole run takes about 3.5 s.
2. The "Click to open" hint appears once the last social is cut.
3. Click during the etch: the lid lifts off at once and the etch ends (no sparks left hanging).
4. Drag the box during the etch: it turns and the laser keeps cutting, riding the lid.
5. With reduced motion emulated (or `/#open`), the engraving is complete straight away and there is no laser.
6. `?stats` on the phone viewport: fps stays at the display rate during the etch.
7. No console errors. Capture a screenshot mid-etch.

If nothing is ever revealed, check the reveal texture's orientation: try removing the row flip in `revealTexture`. If the whole engraving shows from the start, check that the patched shader compiled by searching the console for shader errors.

- [ ] **Step 5: Commit**

```bash
git add src/scene/lid.ts src/scene/laser.ts src/main.ts
git commit -m "Laser-etch the lid on first load: spot, light, sparks and cooling grooves"
```

---

### Task 10: Accessibility layer and no-WebGL fallback

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `aboutLines`, `contactLinks` (Task 6); `orbit.flip` (Task 2)
- Produces: a11y "Turn the box over" / "Turn back" buttons, the About text and links; the fallback About block; `let pendingFlip`

- [ ] **Step 1: `index.html`**

Change `<nav id="a11y" class="sr-only" aria-label="Projects"></nav>` to `<nav id="a11y" class="sr-only" aria-label="Portfolio"></nav>`. Inside `<div id="fallback" hidden>`, between `<p>{{site.role}}</p>` and `<ul id="fallback-list"></ul>`, add `<section id="fallback-about" aria-label="About"></section>`.

- [ ] **Step 2: Fallback About in `main.ts`**

1. Add the import `import { aboutLines, contactLinks } from './scene/about-card';`.

2. In `showFallback()`, before `document.getElementById('fallback')!.hidden = false;`, add:

```ts
  const about = document.getElementById('fallback-about')!;
  for (const line of aboutLines(settings.about)) about.appendChild(Object.assign(document.createElement('p'), { textContent: line }));
  const contact = document.createElement('p');
  for (const l of contactLinks(settings.about, settings.socials)) {
    const a = Object.assign(document.createElement('a'), { href: l.href, textContent: l.label });
    contact.append(a, ' ');
  }
  about.appendChild(contact);
```

- [ ] **Step 3: a11y About controls**

1. After `let pendingOpen = false;`, add:

```ts
/** "Turn it over" with the lid off: it turns once the lid is back on. */
let pendingFlip = false;
```

2. Directly after `a11y.appendChild(openBtn);`, add:

```ts
function a11yLink(text: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  if (!href.startsWith('mailto:')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  a.textContent = text;
  return a;
}
for (const s of settings.socials) a11y.appendChild(a11yLink(`${s.label}: ${s.text}`, s.href));

/** Turn the box onto its back (putting the lid on first if it is off). */
function showAbout() {
  if (lid.state === 'closed') orbit.flip('bottom');
  else {
    pendingFlip = true;
    closeLid();
  }
}
const aboutBtn = document.createElement('button');
aboutBtn.textContent = `Turn the box over: About ${settings.identity.name}`;
aboutBtn.addEventListener('click', showAbout);
a11y.appendChild(aboutBtn);
const aboutSection = document.createElement('section');
aboutSection.setAttribute('aria-label', `About ${settings.identity.name}`);
for (const line of aboutLines(settings.about)) aboutSection.appendChild(Object.assign(document.createElement('p'), { textContent: line }));
for (const l of contactLinks(settings.about, settings.socials)) aboutSection.appendChild(a11yLink(l.label, l.href));
const backBtn = document.createElement('button');
backBtn.textContent = 'Turn the box back';
backBtn.addEventListener('click', () => orbit.flip('top'));
aboutSection.appendChild(backBtn);
a11y.appendChild(aboutSection);
```

3. In `frame()`, directly after the `pendingOpen` check, add:

```ts
  if (pendingFlip && lid.state === 'closed' && orbit.atRest) {
    pendingFlip = false;
    orbit.flip('bottom');
  }
```

- [ ] **Step 4: Typecheck, test, browser check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all PASS.

In the browser:
1. Tab from the page start: "Open the box…", then the socials, then "Turn the box over…".
2. Pressing Enter on "Turn the box over" flips it.
3. Tab moves through the About links, then "Turn the box back", which flips it back.
4. Focusing a project button while on the back turns it upright, then opens the lid.
5. With the lid off, "Turn the box over" puts the lid on, then flips.
6. `read_page` lists the About section's text.
7. Fallback: run `document.getElementById('fallback').hidden = false` via `javascript_tool` to preview the structure. The About paragraphs and contact links render above the list. (It is only shown for real without WebGL2.)

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "About in the accessibility layer and the no-WebGL fallback"
```

---

### Task 11: Dashboard "About & socials" view

**Files:**
- Modify: `src/admin/state.ts`
- Create: `src/admin/views/about.ts`
- Modify: `src/admin/views/list.ts`, `src/admin/views/settings.ts`, `src/admin/main.ts`, `src/admin/admin.css`
- Test: `src/admin/state.test.ts`

**Interfaces:**
- Consumes: `MAX_SOCIALS`, `MAX_TIMELINE`, `MAX_BIO`, `About`, `Settings` (Task 1); `processPhoto`; `api.uploadPhoto`; `moveItem`
- Produces:
  - `Tab = { kind: 'project'; index } | { kind: 'settings' } | { kind: 'about' }`
  - `renderAbout(root: HTMLElement, store: Store, rerender: () => void)`
  - The preview hash `#about`

- [ ] **Step 1: Failing state test**

Append to `src/admin/state.test.ts`, inside its top-level `describe`. If the file's helpers differ, adapt only the fixture call. `validContent` is in `../content/test-fixture`, so add `import { validContent } from '../content/test-fixture';` if it isn't imported yet:

```ts
  it('can select the About tab', () => {
    const s = new Store(validContent());
    s.select({ kind: 'about' });
    expect(s.tab).toEqual({ kind: 'about' });
  });
```

Run: `npx vitest run src/admin/state.test.ts`
Expected: FAIL at type level (`'about'` is not assignable to `Tab`). Vitest strips types, so confirm the failure with `npx tsc --noEmit`, which errors on this line.

- [ ] **Step 2: Extend `Tab`**

In `src/admin/state.ts`, change the `Tab` type to:

```ts
export type Tab = { kind: 'project'; index: number } | { kind: 'settings' } | { kind: 'about' };
```

Run: `npx tsc --noEmit && npx vitest run src/admin/state.test.ts`
Expected: no errors, PASS.

- [ ] **Step 3: Create `src/admin/views/about.ts`**

```ts
import { MAX_BIO, MAX_SOCIALS, MAX_TIMELINE, type About, type Settings } from '../../content/schema';
import { api } from '../api';
import { h } from '../dom';
import { rangeField, tagsField, textField, toggleField } from '../fields';
import { processPhoto } from '../photos';
import { moveItem, type Store } from '../state';

/** Up, down and remove buttons for one row of a list editor. */
function rowActions(i: number, n: number, move: (from: number, to: number) => void, remove: () => void) {
  const btn = (label: string, text: string, disabled: boolean, onclick: () => void) =>
    h('button', { class: 'icon', type: 'button', title: label, 'aria-label': label, disabled, onclick }, text);
  return h(
    'div',
    { class: 'row-actions' },
    btn('Move up', '↑', i === 0, () => move(i, i - 1)),
    btn('Move down', '↓', i === n - 1, () => move(i, i + 1)),
    btn('Remove', '×', false, remove),
  );
}

/**
 * The About card on the box's underside (portrait, bio, experience, contact) and the socials
 * engraved on its lid. Field edits change the store in place; adding, removing or moving rows
 * re-renders the view.
 */
export function renderAbout(root: HTMLElement, store: Store, rerender: () => void) {
  const s = store.content.settings;
  const a = s.about;
  const edit = (fn: (s: Settings) => void) => store.change((c) => fn(c.settings));
  const ed = (fn: (a: About) => void) => edit((x) => fn(x.about));
  /** A structural change: the rows themselves change, so draw the view again. */
  const restructure = (fn: (s: Settings) => void) => {
    edit(fn);
    rerender();
  };

  // Portrait: uploaded through the same photo pipeline as screenshots (saved as about-<n>.jpg).
  const status = h('small', { class: 'field-hint' }, a.photo ? a.photo : 'No portrait: your initials are shown in the circle.');
  const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload a portrait' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    status.textContent = 'Uploading…';
    try {
      const { blob, warning } = await processPhoto(f);
      const { path } = await api.uploadPhoto('about', blob);
      restructure((x) => (x.about.photo = path));
      if (warning) alert(warning);
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    }
  });
  const portrait = h(
    'div',
    { class: 'field', 'data-path': 'settings.about.photo' },
    h('span', { class: 'field-label' }, 'Portrait'),
    h(
      'div',
      { class: 'portrait-row' },
      a.photo ? h('img', { class: 'portrait', src: a.photo, alt: '' }) : h('div', { class: 'portrait empty' }),
      file,
      a.photo ? h('button', { class: 'btn', type: 'button', onclick: () => restructure((x) => (x.about.photo = '')) }, 'Remove') : null,
    ),
    status,
    h('small', { class: 'field-error' }),
  );

  const socials = s.socials.map((so, i) =>
    h(
      'div',
      { class: 'list-row' },
      h(
        'div',
        { class: 'grid3' },
        textField('Label', `settings.socials.${i}.label`, so.label, (v) => edit((x) => (x.socials[i].label = v)), { hint: 'On the About card, e.g. GitHub.' }),
        textField('Engraved text', `settings.socials.${i}.text`, so.text, (v) => edit((x) => (x.socials[i].text = v)), { hint: 'On the lid, e.g. github.com/you.' }),
        textField('Link', `settings.socials.${i}.href`, so.href, (v) => edit((x) => (x.socials[i].href = v)), { hint: 'https://… or mailto:…' }),
      ),
      rowActions(i, s.socials.length, (from, to) => restructure((x) => moveItem(x.socials, from, to)), () => restructure((x) => x.socials.splice(i, 1))),
    ),
  );

  const timeline = a.timeline.map((t, i) =>
    h(
      'div',
      { class: 'list-row' },
      h(
        'div',
        { class: 'grid3' },
        textField('Role', `settings.about.timeline.${i}.role`, t.role, (v) => ed((x) => (x.timeline[i].role = v))),
        textField('Company or school', `settings.about.timeline.${i}.org`, t.org, (v) => ed((x) => (x.timeline[i].org = v))),
        textField('Period', `settings.about.timeline.${i}.period`, t.period, (v) => ed((x) => (x.timeline[i].period = v)), { hint: 'e.g. 2022–now' }),
      ),
      rowActions(i, a.timeline.length, (from, to) => restructure((x) => moveItem(x.about.timeline, from, to)), () => restructure((x) => x.about.timeline.splice(i, 1))),
    ),
  );

  root.replaceChildren(
    h('div', { class: 'editor-head' }, h('h2', {}, 'About & socials')),

    h('div', { class: 'section-title' }, 'Socials — engraved on the lid'),
    h('div', { class: 'list-field', 'data-path': 'settings.socials' }, ...socials, h('small', { class: 'field-error' })),
    h(
      'button',
      {
        class: 'btn',
        type: 'button',
        disabled: s.socials.length >= MAX_SOCIALS,
        onclick: () => restructure((x) => x.socials.push({ label: '', text: '', href: 'https://' })),
      },
      s.socials.length >= MAX_SOCIALS ? `The lid fits ${MAX_SOCIALS}` : 'Add a social',
    ),

    h('div', { class: 'section-title' }, 'About — on the underside'),
    portrait,
    textField('Bio', 'settings.about.bio', a.bio, (v) => ed((x) => (x.bio = v)), { multiline: true, hint: `Two or three sentences, up to ${MAX_BIO} characters.` }),
    rangeField('Years of experience', 'settings.about.years', a.years, { min: 0, max: 60, step: 1, unit: 'years' }, (v) => ed((x) => (x.years = v)), 'Shown as “N+”.'),
    h(
      'div',
      { class: 'grid2' },
      textField('Location', 'settings.about.location', a.location, (v) => ed((x) => (x.location = v))),
      textField('Work preference', 'settings.about.workPreference', a.workPreference, (v) => ed((x) => (x.workPreference = v)), {
        hint: 'e.g. Remote · open to relocation (optional).',
      }),
    ),
    h(
      'div',
      { class: 'grid2' },
      toggleField('Available', 'settings.about.available', a.available, (v) => ed((x) => (x.available = v)), 'Green dot when on, grey when off.'),
      textField('Availability', 'settings.about.availability', a.availability, (v) => ed((x) => (x.availability = v)), { hint: 'e.g. Open to new roles.' }),
    ),
    tagsField('Skills', 'settings.about.skills', a.skills, (v) => ed((x) => (x.skills = v)), 'Up to 12, shown as chips.'),
    h(
      'div',
      { class: 'grid2' },
      textField('Email', 'settings.about.email', a.email, (v) => ed((x) => (x.email = v))),
      textField('Résumé link', 'settings.about.resume', a.resume, (v) => ed((x) => (x.resume = v)), { hint: 'https://… (optional).' }),
    ),

    h('div', { class: 'section-title' }, 'Experience'),
    h('div', { class: 'list-field', 'data-path': 'settings.about.timeline' }, ...timeline, h('small', { class: 'field-error' })),
    h(
      'button',
      {
        class: 'btn',
        type: 'button',
        disabled: a.timeline.length >= MAX_TIMELINE,
        onclick: () => restructure((x) => x.about.timeline.push({ role: '', org: '', period: '' })),
      },
      a.timeline.length >= MAX_TIMELINE ? `Up to ${MAX_TIMELINE} entries` : 'Add an entry',
    ),
  );
}
```

- [ ] **Step 4: Styles in `src/admin/admin.css`**

After the `.grid2` rules, add:

```css
.grid3 { display: grid; grid-template-columns: 1fr 1.4fr 1.4fr; gap: 0 var(--s3); align-items: start; }
@container (max-width: 640px) { .grid3 { grid-template-columns: 1fr; } }
.list-row { display: grid; grid-template-columns: 1fr auto; gap: var(--s2); align-items: start; padding-top: var(--s3); border-top: 1px solid var(--line, rgba(127,127,127,.2)); }
.list-row:first-child { border-top: 0; padding-top: 0; }
.row-actions { display: flex; gap: 2px; padding-top: 22px; }
.list-field { margin-bottom: var(--s3); }
.portrait-row { display: flex; align-items: center; gap: var(--s3); }
.portrait { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; flex: none; background: var(--raised-hover); }
```

- [ ] **Step 5: Navigation, routing, hints**

In `src/admin/views/list.ts`, before `const settings = h(…)`, add:

```ts
  const about = h(
    'div',
    {
      class: `item settings-item${tab.kind === 'about' ? ' active' : ''}`,
      onclick: () => {
        store.select({ kind: 'about' });
        rerender();
      },
    },
    h('span', { class: 'item-title' }, 'About & socials'),
  );
```

Then change the last line to `root.replaceChildren(h('div', { class: 'side-head' }, h('span', {}, 'Projects'), add), ...items, about, settings);`.

In `src/admin/main.ts`:
- Add the import `import { renderAbout } from './views/about';`.
- In `render()`, change `else renderSettings(form, store);` to:

```ts
  else if (t.kind === 'about') renderAbout(form, store, render);
  else renderSettings(form, store);
```

- In `previewHash()`, directly after `const t = store.tab;`, add `if (t.kind === 'about') return '#about';`.

In `src/admin/views/settings.ts`:
- Change the `hint` helper's key type to `'open' | 'section' | 'close' | 'flip' | 'back'`.
- After `hint('Put the lid back', 'close'),`, add:

```ts
    hint('Turn it over (About)', 'flip'),
    hint('Turn it back', 'back'),
```

- [ ] **Step 6: Typecheck, test, browser check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all PASS.

In the browser at `http://localhost:5173/admin`:
1. The sidebar shows "About & socials". It opens the view, and the preview shows the site on its underside (`#about`).
2. Edit the bio: the status shows "Unsaved changes". Clear the email: the field is marked "Needs a valid email address." and Save is disabled. Restore the email.
3. Add a social (up to 4, after which the button says "The lid fits 4"), reorder it with ↑ and remove it with ×.
4. Add and remove a timeline entry.
5. Upload a portrait image. The thumbnail shows and the path is `/shots/about-1.jpg`. Save. The preview reloads with the photo in the circle.
6. Remove the portrait and Save: the initials come back.
7. Settings shows the two new hint pairs.
8. Revert the test edits: Discard, or restore the placeholders and Save. Use "Unused photos…" to delete the test portrait if it is no longer referenced.
9. No console errors.

- [ ] **Step 7: Commit**

```bash
git add src/admin
git commit -m "Dashboard: About & socials view with portrait upload and list editors"
```

---

### Task 12: Final verification

**Files:** none new.

- [ ] **Step 1: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no type errors, and the build succeeds. The build output under `dist/` includes `shots/`.

- [ ] **Step 2: End-to-end walk-through (desktop, 1280×800)**

On `http://localhost:5173/`:
1. The etch plays.
2. The hint shows, then alternates with "Scroll down to turn it over".
3. Drag to turn the box with momentum, while the cursor and light freeze. It settles square.
4. Scroll down to the About card: links work and "Scroll up to turn it back" shows once.
5. Scroll up back to the top.
6. Click the lid open. Drag stays above the rim.
7. Click a section: top-down, and dragging does nothing.
8. Escape, then scroll up: the lid goes back on.
9. Capture screenshots at each stage.

- [ ] **Step 3: Phone walk-through (375×812, touch)**

Same flow with taps and swipes:
- Swipe up flips the box and swipe down flips it back.
- Tap opens the lid; swipe down closes it.
- Drag turns the box while tilt is frozen.
- The tall card and the stacked socials are legible.
- `?stats`: the frame rate holds during the etch and the drag.

- [ ] **Step 4: Reduced motion**

Emulate `prefers-reduced-motion: reduce` (e.g. `javascript_tool` cannot emulate it; use the OS setting, or temporarily force `reduced = true` locally without committing).
- There is no etch; the engraving shows complete.
- Flips snap instead of animating.
- There is no lid knock.

- [ ] **Step 5: Update the knowledge graph and commit any fixes**

Run: `graphify update .`
Expected: the graph updates without errors.

If any fixes were made during verification:

```bash
git add -A src index.html
git commit -m "Polish after verification of the tangible box"
```
