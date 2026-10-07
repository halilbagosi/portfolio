# Tangible box: grab, flip, laser-etched lid, About underside — design

**Date:** 2026-10-06
**Status:** Approved in conversation; awaiting spec review

## Goal

Make the bento box feel like a real object in the hand:

1. **Grab and turn it** with the mouse or a finger, with momentum, in the overview (lid on or off).
2. **A Space Gray anodised lid** (MacBook-style bead-blasted aluminium) instead of the brushed one.
3. **A laser etches the lid on first load:** name, role, then the owner's socials.
4. **Turning the box onto its back reveals an About section** for recruiters: portrait, bio, years
   of experience, skills, location, availability, contact, résumé and a short timeline.
5. **Swiping up (scrolling down) with the lid on flips the box to its underside**, the opposite
   of putting the lid on. Swiping down (scrolling up) turns it back.

## Decisions

- **Rotation happens in the overview only.** It works with the lid on and with the lid off. It is
  disabled while a section is focused: the top-down section view stays exactly as it is now.
- **With the lid off, the view can't drop below the rim.** The sections are bottomless shafts
  traced in a shader and only look right from above the top plane, so with the lid off the
  camera stays at least ~20° above it and there is no flip. A full flip is possible only with
  the lid on.
- **Release: glide, then settle.** After a flick the box keeps turning with its momentum, then
  springs to the nearest resting face, **Top** or **Underside**. It never rests at an odd angle.
- **Gestures share one vertical axis:**
  `Lid off —(scroll up / swipe down)→ Lid on —(scroll down / swipe up)→ Underside`, and scroll up /
  swipe down rolls the box back from the underside. Tap or click on the lid opens it; scroll down /
  swipe up no longer does.
- **Content lives in `site.json`** under `settings`, validated like everything else and editable
  in the dashboard, including the portrait upload. Seeded with obvious placeholders.
- **Lid finish: Space Gray anodised aluminium.** The laser cuts through the anodised layer and
  exposes bright raw aluminium, so the engraving reads *lighter* than the surface around it.
- **No new dependencies.**

## Approach: the camera orbits the box, not the other way round

Dragging drives a trackball orientation `Q`. The **camera and the lights orbit the box's centre**
by `Q⁻¹`, and the box itself never moves. Because the page is pure black and the lights move with
the view, this looks exactly like turning the object: highlights slide across the metal as they
would on a box turned under fixed studio lights.

This keeps the world axis-aligned, so the shaft shader, the top plate's cut-outs (`uRects` in
world `xz`), `Pointer.onPlane()` hit-testing and the layout code all keep working unchanged.

Rejected alternatives:
- **Rotating the box group.** Every world-`xz` shader and horizontal-plane raycast would have to
  move into box-local space, for an identical picture.
- **A canned flip animation.** It isn't a real 3D object, which is what was asked for.

## Architecture

```
src/input/orbit.ts        NEW   trackball: drag → angular velocity → momentum → settle to a face
src/input/gestures.ts     NEW   wheel / swipe / drag / click arbitration, emits intents (out of main.ts)
src/scene/stage.ts              applies the orbit to camera, lights and environment; Underside framing
src/scene/box.ts                shell shaded in view space; real bottom plate; table hidden with lid on
src/scene/lid.ts                Space Gray anodised material; reveal/heat shader patch; social link regions
src/scene/etch.ts         NEW   etch schedule: raster hatch path + reveal times (pure, no GPU)
src/scene/laser.ts        NEW   laser effect: spot, light, sparks; drives the lid's etch time
src/scene/textures.ts           engraving maps gain the socials line; bead-blast maps replace brushed
src/scene/underside.ts    NEW   bottom plate mesh with the About card + link hit regions
src/scene/about-card.ts   NEW   canvas layout of the About card (pure drawing, no three.js scene code)
src/content/schema.ts           socials, about, hints.flip / hints.back + validation
src/content/site.json           placeholder About + socials
src/admin/views/about.ts  NEW   dashboard "About & socials" view (portrait upload via processPhoto)
src/main.ts                     wiring only: gestures → lid / orbit / focus; hints; a11y; fallback
```

`main.ts` is already ~500 lines. The gesture code (wheel accumulator, swipe detection, click
routing) moves to `gestures.ts` as part of this work, because this change rewrites it anyway.

### 1. Orbit controller (`src/input/orbit.ts`)

State: orientation quaternion `q`, angular velocity `ω` (rad/s around the view's up and right
axes), mode `'drag' | 'glide' | 'settle' | 'rest'`, and `face: 'top' | 'bottom'`.

- **Drag:** horizontal pointer motion rotates about the view-up axis (yaw). Vertical motion
  rotates about the view-right axis (pitch). Gain is ~π radians per viewport height. `ω` is
  estimated from the last ~80 ms of samples.
- **Release → glide:** `ω` decays exponentially (time constant ~0.35 s).
- **Settle:** the face is chosen from the *projected* pitch, i.e. the current pitch plus `ω · τ`.
  That way a flick carries through to the face it is heading for. The orientation then
  slerp-springs (critically damped, ~0.5 s) to that face's rest: `Top = identity` or
  `Underside = 180° about the world X axis`. Yaw always returns to 0, so both faces rest square
  to the viewer.
- **Constraints (`setLimits`):**
  - Lid on: no limits.
  - Lid off: the camera's elevation relative to the top plane is clamped to at least 20°. The
    clamp is soft, rubber-banding at the limit. Only the Top face is allowed.
  - Section focused or lid animating: input is ignored, and the controller settles to Top.
- **Ambient tracking pauses while held.** From pointer-down until the box is back at rest, the
  cursor-driven effects are frozen, and so are their gyro equivalents on phones. These are the
  camera parallax, the lid light and environment sway, the shell sheen, and the touch idle drift.
  The direct manipulation is then the only thing moving the box: no parallax fights the drag. The
  smoothed values ease back in over ~0.4 s once the orbit is at rest, so nothing jumps.
  `main.ts` reads `orbit.engaged` (true from `begin` until `atRest`) and multiplies the ambient
  input by an eased weight that goes to 0 while engaged.
- **API:** `begin(x, y)`, `move(x, y)`, `end()`, `flip(face)` (animated, used by the
  wheel/swipe intents and the a11y buttons), `update(dt)`, `quaternion`, `face`, `atRest`,
  `setLimits({ lidOn, locked })`, `engaged`.
- The pure math is kept in exported functions for tests: face choice from pitch and `ω`, the
  elevation clamp, and the settle target.

### 2. Gestures (`src/input/gestures.ts`)

One place decides what a pointer, wheel or touch sequence means, and emits intents:
`openLid`, `closeLid`, `flip('bottom' | 'top')`, `tap(ndc)` and the drag stream to the orbit.

- **Click vs drag:** a pointer that moves less than 6 px before release is a tap, and is routed
  exactly as clicks are today (lid, links, stack viewer, sections). Past 6 px it becomes a drag:
  the canvas takes pointer capture and the click is swallowed.
- **Cursor:** `grab` over the box in the overview, `grabbing` while dragging. The existing
  `pointer`/`zoom-in` cursors still win over links and stacks.
- **Wheel** (existing 70 px accumulator and 700 ms rest):
  - Lid on, Top: down → `flip('bottom')`.
  - Underside: up → `flip('top')`.
  - Lid off: up → `closeLid` (unchanged).
- **Swipe** (existing deliberate-flick thresholds: ≥60 px, mostly vertical, under 700 ms).
  This is in addition to the physics, which already carries a flick over:
  - Lid on: up → `flip('bottom')`.
  - Underside: down → `flip('top')`.
  - Lid off: down → `closeLid` (unchanged).
  A slow drag never triggers lid intents.
- **Tap on the lid while the box is turned:** settle to Top first, then open the lid when it is
  at rest.
- **Taps on the Underside** hit-test the About card's link regions (see §5).
- The iOS motion-permission first tap keeps its current behaviour.

### 3. Camera, lights and the box's body (`stage.ts`, `box.ts`)

- `Stage.update` computes the camera exactly as now (framing springs, parallax), then rotates
  its position and `up` vector about `target` by `Q⁻¹`. The key light, lid light and
  `scene.environmentRotation` are transformed the same way, so the light rig stays fixed
  relative to the viewer.
- **Underside framing:** `setView('underside')` targets the box's bottom centre and frames the
  plate nearly face-on (like the section top-down view, elevation ~85°, `OUTER_W/D` plus margin),
  so the About text reads at phone size. It is used when the orbit settles on the bottom face.
- **Shell:** the face lighting in the fragment shader moves from world-`xz` normals to view-space
  normals, so the lit side stays consistent as the box turns. The bottom edge gets the same
  hairline rim catch as the top.
- **Bottom:** a real bottom cap (the underside plate, §5) closes the shell at `TOP_Y - WALL_H`.
- **Visibility:** while the lid is fully on (`lid.state === 'closed'`), the table, the wells
  (shafts and stacks) and the chips are hidden. They can't be seen under the lid, and from the
  side or below the depth-ignoring shafts would paint over the walls. They come back as soon as
  the lid starts to lift, and the box is always at Top by then.

### 4. Lid: Space Gray anodised aluminium + laser etching

#### Material (`lid.ts`, `textures.ts`)

- **Base:** `MeshPhysicalMaterial`, metalness 1, Space Gray tint (sRGB `#7d7e80` as a starting point,
  tuned by eye against a MacBook reference), roughness ~0.42, **no anisotropy**, and a
  faint clearcoat (0.15, roughness 0.5) for the anodised oxide layer.
- **Bead-blast micro-texture:** `beadBlastMaps()` replaces `brushedRoughness`. It provides a
  fine isotropic noise roughness map (±0.04) and a very low-strength normal map, giving a soft,
  even, matte sheen with no streaks.
- **Chamfer:** stays polished (diamond-cut edges, as on a MacBook), re-tinted to bright raw
  aluminium (`#e4e6e9`) because the cut goes through the anodising.
- **Engraving look:** where etched, the surface is raw aluminium. Colour lifts toward `#d9dbde`,
  roughness rises slightly (frosted laser finish, ~0.55), and the existing height → normal gives
  the groove edge.

#### What's engraved

- **Name** (as now), **role** (as now), then a smaller **socials** line: each social's `text`
  (e.g. `github.com/handle`) in tracked caps separated by ` · `. In portrait the socials stack
  one per line.
- `engravingMaps()` also returns each line's ink bounding box and each social's UV rectangle.
- **Socials are links:** hovering one shows the `pointer` cursor.
  Clicking opens `href` (`mailto:` allowed). Clicking anywhere else on the lid opens it as before.

#### Etch schedule (`etch.ts`)

`etchSchedule(mask, lines)` produces:
- **The path:** for each text line in order (name → role → socials), a bidirectional raster
  hatch over the line's ink box, like a galvo fiber laser filling text. Row pitch is
  ~3 px of the map. Rows with no ink are jumped over in a fixed short time. Timing is about
  1.6 s for the name, 0.8 s for the role and 1.1 s for the socials, ~3.5 s in total.
- **A reveal-time map:** a `HalfFloatType` `DataTexture`, at quarter resolution of the engraving
  map with linear filtering. Each texel holds the moment (seconds from the start) the spot
  passes over it. Texels outside every line hold 0: nothing is cut there, and keeping them small
  means linear filtering never delays the edge of a glyph.
- `spotAt(t) → { u, v, firing }`: the spot position along the path, and whether there is ink
  under it (from the mask).

#### Etch rendering (`laser.ts` + lid shader patch)

- **Lid shader patch** (`onBeforeCompile`): `revealed = step(tReveal(uv), uTime)`. The engraving's
  colour lift, roughness lift and normal perturbation are multiplied by `revealed`, so unrevealed
  ink looks like plain anodised surface. **Heat:** freshly cut texels add emissive orange,
  `mask · revealed · exp(-(uTime - tReveal) / 0.8 s)`, cooling through deep red to nothing.
- **Spot:** an additive sprite at the surface point, white-hot core with a cool violet halo. Its
  intensity flickers at high frequency. It is visible only while `firing`; between rows and
  jumps it is a faint dim point.
- **Light:** a small `PointLight` (short range) a hair above the spot, flickering with it, so the
  bead-blasted metal around the cut glints.
- **Sparks:** a pool of ~200 `Points` with additive orange-to-red colour, emitted only while
  firing (~120/s). They are ballistic with gravity in box-local space, live 0.3–0.7 s and fade
  with age. They are allocated once and reused.
- **Timing:** starts ~0.5 s after the first frame (after shader warm-up). The "Click to open"
  hint waits until the etch finishes.
- **Skips:**
  - `prefers-reduced-motion`: the engraving is shown complete, with no laser.
  - Reopen-after-rotate reload (`box-open`) and `/#open`: no laser.
  - The lid opening mid-etch: the etch completes instantly (`uTime = ∞`) and the effect stops.
  - Dragging and flipping during the etch is allowed, and the etch keeps going.

### 5. Underside: About (`underside.ts`, `about-card.ts`)

- **Look:** the box's bottom as a dark anodised plate (the shell's colour) with the About card
  laid out like the fine print on the underside of an Apple device. It uses the same supersampled
  canvas text as the labels (`PX`, `SS`, `sharpenText`), is mostly unlit for legibility, and has
  a faint sheen that follows the orbit.
- **Card layout** (wide and tall variants, matching `PORTRAIT`):
  - Round portrait window. With no photo, an initials monogram.
  - Name and role.
  - A large **"N+ years"** figure with the caption "experience".
  - Bio paragraph (wrapped, at most ~4 lines).
  - Skill chips (at most 12, wrapped).
  - Location, and work preference (e.g. "Remote · open to relocation").
  - **Availability:** a green dot when `available`, grey otherwise, with the `availability` text.
  - Timeline: 2–4 rows of `role · org · period`.
  - Contact row: email and résumé.
- **Orientation:** the texture is laid out to read upright from the Underside rest view. This is
  verified by screenshot, and the UVs are flipped if needed.
- **Links:** `about-card.ts` returns UV rectangles for email (`mailto:`), the résumé and each
  social. `underside.ts` exposes `linkAt(uv)`. Taps route there when the face is `bottom`, and
  the hover cursor follows. Links open in a new tab (`noopener`), except `mailto:`.
- The texture is built once at load (and on reload from the dashboard preview). The portrait
  loads asynchronously, the card redraws when it arrives, and it is warmed with the other
  textures in `prewarm()`.

### 6. Content (`schema.ts`, `site.json`)

```ts
interface Social { label: string; text: string; href: string }   // href: http(s):// or mailto:
interface TimelineEntry { role: string; org: string; period: string }
interface About {
  photo: string;            // '' or a /shots/<file> path (SHOT_PATH)
  bio: string;              // required, ≤ 360 chars
  years: number;            // 0–60, shown as "N+"
  location: string;         // required
  workPreference: string;   // optional ('' allowed)
  available: boolean;
  availability: string;     // required, e.g. "Open to new roles"
  skills: string[];         // 1–12 non-empty
  email: string;            // required, simple email shape
  resume: string;           // '' or http(s)://
  timeline: TimelineEntry[];// 0–4, all fields required
}
Settings += { socials: Social[] /* 0–4 */; about: About;
              hints += { flip: HintPair; back: HintPair } }
```

**Placeholders seeded in `site.json`.** They are obviously fake, so they can't ship by
accident:

| Field | Placeholder |
| --- | --- |
| bio | "Placeholder bio — edit in the dashboard." |
| years | 5 |
| location | "City, Country" |
| email | "you@example.com" |
| socials | GitHub `github.com/your-handle`, LinkedIn `linkedin.com/in/your-handle`, Email `you@example.com` |
| timeline | two "Role · Company · 20XX–now" rows |
| photo | `''` (the monogram is shown) |

**Hints:**
- `flip`: desktop "Scroll down to turn it over", touch "Swipe up to turn it over".
- `back`: desktop "Scroll up to turn it back", touch "Swipe down to turn it back".
- On the closed lid, after the etch, the hint alternates `open` ↔ `flip` every ~4 s until the
  user has flipped once. On the Underside, `back` shows once.

### 7. Dashboard (`src/admin/views/about.ts`)

- A new **About & socials** view next to Settings, built from the existing fields (`textField`,
  `toggleField`, `rangeField`) and the same issue display.
- **Portrait:** upload via `processPhoto` (square crop, saved as `/shots/about-portrait.jpg`
  through the existing photo API), with remove (back to the monogram).
- **Socials:** a list editor (add, remove, reorder) capped at 4. Hint text: "Engraved on the lid."
- **Skills:** a comma- or tag-style entry. **Timeline:** a list editor capped at 4.
- The live preview reloads as it does for other settings. Housekeeping's unused-photo cleanup
  counts `about.photo` as used.

### 8. Accessibility and fallback

- The a11y nav gains a **"Turn the box over: About Halil Bagosi"** button (it calls
  `flip('bottom')`), followed by the About content as text, links for email, résumé and socials,
  and a "Turn back" button.
- The socials are also listed after "Open the box".
- The no-WebGL fallback lists the About text, contact and socials above the projects.
- `prefers-reduced-motion`: flips and settles snap (spring stiffness up, no glide), and there is
  no etch.

## Error handling

- **Portrait fails to load:** keep the monogram, `console.warn` once.
- **Half-float textures unavailable** (should not happen with WebGL2): skip the etch and show
  the engraving complete.
- **Invalid content:** blocked by `validate()` exactly as today. The site loader throws in dev,
  and the dashboard shows the issues.
- **Orbit numerics:** the quaternion is renormalised each step, `ω` is clamped (≤ 12 rad/s), and
  `dt` is clamped as elsewhere.

## Testing

- **Vitest:**
  - `schema.test.ts`: socials, about, hints and their limits.
  - `orbit.test.ts`: face choice from projected pitch, the lid-off elevation clamp, the settle
    target, locking.
  - `etch.test.ts`: the hatch visits every ink row, the reveal times are monotone along the
    path, the spot fires only over ink, and the total matches the line budgets.
  - `about-card.test.ts`: link UV rectangles are inside the card and don't overlap.
- **Browser preview, desktop and phone (375×812):**
  - The etch plays on load; the hint appears after it.
  - Drag spins the box with momentum and it settles to Top.
  - Scroll down / swipe up flips it to the Underside; the About card reads upright and its links
    open.
  - Scroll up returns it to Top. Tap opens the lid.
  - With the lid off, the drag stays above the rim, and a section opens top-down with
    manipulation disabled.
  - No console errors. FPS is checked with `?stats`.

## Out of scope

- Dragging the box's position (translation). Only rotation is supported.
- Rotating while a section is focused, and flipping with the lid off.
- Faces other than Top and Underside as resting poses.
