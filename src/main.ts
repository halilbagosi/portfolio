import * as THREE from 'three';
import { Spring } from './anim/springs';
import { projects, settings } from './config/projects';
import { Gestures } from './input/gestures';
import { Motion } from './input/motion';
import { Orbit, topElevation, type Face } from './input/orbit';
import { Pointer } from './input/pointer';
import { Lightbox } from './lightbox';
import { createBox, ELEVATION, GAP, INTERIOR_D, INTERIOR_W, isPortraitViewport, MAX_WELLS, OUTER_D, OUTER_W, PORTRAIT, TOP_Y } from './scene/box';
import { aboutLines, contactLinks } from './scene/about-card';
import { ChipSet } from './scene/chips';
import { expandedLayout, focusSizes, packLayout, rectsFrom, restSizes, type Sizes } from './scene/layout';
import { Laser } from './scene/laser';
import { Lid } from './scene/lid';
import { Stage } from './scene/stage';
import { Underside } from './scene/underside';
import { Well } from './scene/well';

const host = document.getElementById('stage')!;
const hint = document.getElementById('hint')!;
/** Above the box: how to open it. The flip and the other hints stay below it. */
const hintTop = document.getElementById('hint-top')!;
const a11y = document.getElementById('a11y')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;

function showFallback() {
  hint.hidden = true;
  const list = document.getElementById('fallback-list')!;
  for (const p of projects) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = p.links[0]?.href ?? '#';
    a.textContent = `${p.title}: ${p.purpose}`;
    li.appendChild(a);
    list.appendChild(li);
  }
  // The About as plain text and links, above the project list (textContent: it comes from site.json).
  const about = document.getElementById('fallback-about')!;
  for (const line of aboutLines(settings.about)) about.appendChild(Object.assign(document.createElement('p'), { textContent: line }));
  const contact = document.createElement('p');
  for (const l of contactLinks(settings.about, settings.socials)) {
    const a = Object.assign(document.createElement('a'), { href: l.href, textContent: l.label });
    contact.append(a, ' ');
  }
  about.appendChild(contact);
  document.getElementById('fallback')!.hidden = false;
}

let stage: Stage;
try {
  stage = new Stage(host);
} catch {
  showFallback();
  throw new Error('WebGL2 unavailable');
}

const { scene, camera } = stage;
const pointer = new Pointer(host, camera);
const motion = new Motion();
// The box in the hand: drags turn it, a flick up rolls it onto its back (the About card).
const VIEW = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
const orbit = new Orbit(
  VIEW,
  () => Math.PI / Math.max(1, host.clientHeight),
  reduced,
);
/** A tap on the lid while the box is turned: it opens once the box has settled on its top. */
let pendingOpen = false;
/** "Turn the box over" with the lid off: it turns once the lid is back on. */
let pendingFlip = false;
/** Swiping back from the About card with the lid off: the project to open once the box is upright. */
let pendingFocus = -1;
/** The face the camera is framed for: the overview (top) or the About card straight on (bottom). */
let shownFace: Face = 'top';
// iOS asks for motion access on the first tap, which then only wakes the lid (see the click handler).
const copy = settings.hints;
let openHint = touch ? (motion.needsPermission ? copy.begin.touch : copy.open.touch) : copy.open.desktop;
const closeHint = touch ? copy.close.touch : copy.close.desktop;
const sectionHint = touch ? copy.section.touch : copy.section.desktop;
hintTop.textContent = openHint;
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
  hintTop.classList.remove('show');
}
/** The two hints for a box at rest with its lid on: open above it, and (until it has been turned) flip below. */
function showRestHints() {
  hintTop.textContent = openHint;
  hintTop.classList.add('show');
  if (!flippedOnce) showHint(flipHint);
}
/** Motion permission was asked: the open hint is now the plain one, but a hint already showing something else stays. */
function permissionAsked() {
  if (hintTop.textContent === openHint) hintTop.textContent = copy.open.touch;
  openHint = copy.open.touch;
}
/** Cross-fades the hint to new text: out, swap, in. */
function swapHint(text: string) {
  hideHint();
  swapTimer = window.setTimeout(() => showHint(text), 400);
}

const box = createBox();
scene.add(box.group);
const underside = new Underside();
box.group.add(underside.mesh);
try {
  const { identity, about, socials } = settings;
  underside.showAbout({ name: identity.name, role: identity.role, about, socials }, about.photo);
} catch (err) {
  console.warn('About card failed to draw; the back of the box stays blank.', err); // never take the scene down
}
const lid = new Lid(reduced);
scene.add(lid.group);

const n = Math.min(projects.length, MAX_WELLS);
const closed = packLayout(n, INTERIOR_W, INTERIOR_D, GAP);
const tiles = projects.slice(0, n).map((p, i) => {
  const t = new Well(p, i, reduced);
  t.setRect(closed[i], true);
  t.restRect = closed[i];
  t.setDest(closed[i]);
  const open = expandedLayout(n, i, INTERIOR_W, INTERIOR_D, GAP)[i];
  t.focusTall = open.d > open.w;
  scene.add(t.group);
  return t;
});
const shared = { scene: stage.backdrop.texture, res: stage.res };
const chipSets = projects.slice(0, n).map((p) => {
  const c = new ChipSet(p, shared);
  scene.add(c.group);
  return c;
});
const glassGroups = chipSets.map((c) => c.group);
// The overview's smaller sections share one label size, set by whichever fits it least, so their
// titles and captions line up instead of each shrinking to its own text. A tall box has no lead section.
const matched = tiles.filter((_, k) => k > 0 || PORTRAIT);
function matchLabels() {
  if (matched.length < 2) return;
  const caps = { kind: Infinity, title: Infinity, caption: Infinity };
  for (const t of matched) for (const key of ['kind', 'title', 'caption'] as const) caps[key] = Math.min(caps[key], t.restFit[key]);
  for (const t of matched) t.caps = caps;
}
const reveal = new Spring(0, 30, 1);

// Layout motion: one spring per column width and row height (critically damped, ~0.45s).
// Every in-between frame is a valid grid, so sections never slide through each other.
const rest = restSizes(n, INTERIOR_W, INTERIOR_D, GAP);
const mkSpring = (v: number) => new Spring(v, 200, 1);
const colSprings = rest.cols.map(mkSpring);
const rowSprings = rest.rows.map((col) => col.map(mkSpring));
const liveSizes: Sizes = { cols: [...rest.cols], rows: rest.rows.map((c) => [...c]) };
function setSizes(s: Sizes) {
  colSprings.forEach((sp, c) => (sp.target = s.cols[c]));
  rowSprings.forEach((col, c) => col.forEach((sp, r) => (sp.target = s.rows[c][r])));
}
function stepLayout(dt: number) {
  colSprings.forEach((sp, c) => (liveSizes.cols[c] = sp.step(dt)));
  rowSprings.forEach((col, c) => col.forEach((sp, r) => (liveSizes.rows[c][r] = sp.step(dt))));
  const rects = rectsFrom(n, liveSizes, INTERIOR_W, INTERIOR_D, GAP);
  tiles.forEach((t, k) => t.setRect(rects[k], true));
}

// Build every project's chips and warm shaders/textures while the lid is still on.
function prewarm() {
  chipSets.forEach((c, k) => {
    const r = openLayout(k)[k];
    c.build(r.w, r.d, tiles[k].focusSide());
    c.group.position.set(r.x, 0, r.z);
  });
  const vis = chipSets.map((c) => c.group.visible);
  chipSets.forEach((c) => (c.group.visible = true));
  // Sealed under the lid the wells are hidden; show them for the warm-up (the frame re-hides them).
  tiles.forEach((t) => (t.group.visible = true));
  box.table.visible = true;
  stage.warm([...tiles.flatMap((t) => t.stack.textures), ...chipSets.flatMap((c) => c.textures), underside.texture]);
  chipSets.forEach((c, k) => (c.group.visible = vis[k]));
}
// The box's shape is fixed per load (wide on landscape screens, tall on portrait ones). When the
// viewport flips (a phone rotates), reload into the other shape, keeping the lid off if it was.
const REOPEN = 'box-open';
let flipTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(flipTimer);
  flipTimer = window.setTimeout(() => {
    if (isPortraitViewport() === PORTRAIT) return;
    try {
      if (lid.state !== 'closed') sessionStorage.setItem(REOPEN, '1');
    } catch {
      /* storage blocked: it just starts closed */
    }
    location.reload();
  }, 250);
});
let reopen = false;
try {
  reopen = sessionStorage.getItem(REOPEN) === '1';
  sessionStorage.removeItem(REOPEN);
} catch {
  /* ignore */
}
if (reopen) {
  lid.skip();
  reveal.snap(1);
}
// First load: a laser engraves the lid. Not on a reopen, under reduced motion, or for dev hashes.
const laser = reduced || reopen || (import.meta.env.DEV && location.hash !== '') ? null : new Laser(lid, scene);

const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
// After the lead screenshots have loaded: a phone shot's aspect picks how its section opens (see Well.focusSide).
const leadsLoaded = Promise.race([Promise.all(tiles.map((t) => t.stack.leadLoaded)), new Promise((r) => setTimeout(r, 4000))]);
void leadsLoaded.then(() => (idle ? idle(prewarm) : setTimeout(prewarm, 300)));
const lightbox = new Lightbox();

/** True from opening the viewer until its image has landed back on the card. */
let viewerReturning = false;

function openViewer(k: number) {
  const st = tiles[k].stack;
  viewerReturning = true;
  lightbox.open({
    title: projects[k].title,
    urls: st.urls,
    index: st.topIndex,
    from: () => st.topQuad(camera, stage.renderer.domElement),
    onClose: (i) => st.setTop(i),
    onReturned: () => {
      st.held = false; // the image is back in place: the card takes over seamlessly
      viewerReturning = false;
    },
  });
  st.held = true; // the image is the card now (set after open: a reopen fires the previous onReturned)
  viewerReturning = true;
}

// ---- Focus (click / tap / keyboard) -------------------------------------------------
let focused = -1;

/**
 * Sizes with section i open. In a tall box, a section with landscape shots takes only the depth
 * its full-width facts and full-width shots need; the strips around it share the rest.
 */
function openSizes(i: number) {
  const t = tiles[i];
  if (!PORTRAIT || !t.focusTall || t.focusSide()) return focusSizes(n, i, INTERIOR_W, INTERIOR_D, GAP);
  const base = expandedLayout(n, i, INTERIOR_W, INTERIOR_D, GAP)[i];
  chipSets[i].build(base.w, base.d, false);
  t.factsDepth = chipSets[i].factsDepth;
  return focusSizes(n, i, INTERIOR_W, INTERIOR_D, GAP, 0.5, t.stackedDepth(base.w));
}
const openLayout = (i: number) => rectsFrom(n, openSizes(i), INTERIOR_W, INTERIOR_D, GAP);

function layoutFor(i: number) {
  return i < 0 ? closed : openLayout(i);
}

function setFocus(i: number) {
  if (i === focused) return;
  focused = i;
  const rects = layoutFor(i);
  setSizes(i < 0 ? rest : openSizes(i));
  tiles.forEach((t, k) => {
    t.setState(i >= 0 && k !== i, k === i);
    t.setDest(rects[k]);
  });
  chipSets.forEach((c, k) => {
    if (k === i) {
      c.build(rects[k].w, rects[k].d, tiles[k].focusSide());
      c.group.position.set(rects[k].x, 0, rects[k].z);
    }
    if (k !== i) c.setShown(false); // shown once its section has mostly opened (see frame loop)
  });
  a11yButtons.forEach((b, k) => b.setAttribute('aria-expanded', String(k === i)));
  // Open: glide over the section and look straight down at it. Closed: back to the usual tilt.
  stage.setView(i < 0 || !settings.motion.topDownOnOpen ? null : rects[i], reduced);
}

function cellAt(x: number, z: number) {
  const rects = layoutFor(focused);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (Math.abs(x - r.x) <= r.w / 2 + GAP / 2 && Math.abs(z - r.z) <= r.d / 2 + GAP / 2) return i;
  }
  return -1;
}

// ---- Accessibility layer: real buttons and links mirror the 3D scene ----------------
const openBtn = document.createElement('button');
openBtn.textContent = `Open the box: ${settings.identity.name}, ${settings.identity.role}`;
openBtn.addEventListener('click', openLid);
a11y.appendChild(openBtn);

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
// The lid's engraved socials are canvas-only, so they get real links here.
for (const s of settings.socials) a11y.appendChild(a11yLink(`${s.label}: ${s.text}`, s.href));

/** Turn the box onto its back (putting the lid on first if it is off). */
function turnOver() {
  pendingOpen = false;
  if (lid.state === 'gone') {
    // Lid off: it turns over as it is.
    if (focused >= 0) setFocus(-1);
    orbit.setLimits(true, !canTurn());
    orbit.flip('bottom');
  } else if (lid.state === 'closed') {
    if (focused >= 0) {
      // A project button focused under the closed lid would keep the orbit locked; the lock is only re-read per frame.
      setFocus(-1);
      orbit.setLimits(true, !canTurn());
    }
    orbit.flip('bottom');
  } else {
    closeLid();
    // closeLid refuses while the viewer is up; then there is no lid on its way, so nothing to wait for.
    pendingFlip = lid.state === 'returning';
  }
}
const aboutBtn = document.createElement('button');
aboutBtn.textContent = `Turn the box over: About ${settings.identity.name}`;
aboutBtn.addEventListener('click', turnOver);
a11y.appendChild(aboutBtn);
const aboutSection = document.createElement('section');
aboutSection.setAttribute('aria-label', `About ${settings.identity.name}`);
for (const line of aboutLines(settings.about)) aboutSection.appendChild(Object.assign(document.createElement('p'), { textContent: line }));
// The socials are already linked at the top of the nav; only what isn't (email, résumé) is added here.
const listed = new Set(settings.socials.map((s) => s.href));
for (const l of contactLinks(settings.about, settings.socials)) if (!listed.has(l.href)) aboutSection.appendChild(a11yLink(l.label, l.href));
const backBtn = document.createElement('button');
backBtn.textContent = 'Turn the box back';
backBtn.addEventListener('click', () => orbit.flip('top'));
aboutSection.appendChild(backBtn);
a11y.appendChild(aboutSection);

// A turn is silent otherwise: say which side is showing, and offer only the button that applies.
const faceStatus = Object.assign(document.createElement('div'), { className: 'sr-only' });
faceStatus.setAttribute('role', 'status');
faceStatus.setAttribute('aria-live', 'polite');
document.body.appendChild(faceStatus);
let a11yFace: Face = 'top';
function syncFaceControls(face: Face) {
  const back = face === 'bottom';
  // A disabled button drops focus to the page, so note who had it first and hand it to the button that took over.
  const active = document.activeElement;
  aboutBtn.disabled = back;
  backBtn.disabled = !back;
  if (active === (back ? aboutBtn : backBtn)) (back ? backBtn : aboutBtn).focus();
}
backBtn.disabled = true;
const a11yButtons = projects.slice(0, n).map((p, i) => {
  const b = document.createElement('button');
  b.textContent = `${p.title}, ${p.kind}: ${p.purpose} Built with ${p.stack.join(', ')}. ${p.architecture}. ${p.duration}. ${p.status}.`;
  b.setAttribute('aria-expanded', 'false');
  b.addEventListener('focus', () => {
    openLid();
    setFocus(i);
  });
  a11y.appendChild(b);
  for (const l of p.links) {
    const a = document.createElement('a');
    a.href = l.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = `${p.title} on ${l.label}`;
    a.addEventListener('focus', () => setFocus(i));
    a11y.appendChild(a);
  }
  return b;
});

// ---- Pointer -------------------------------------------------------------------------
function openLid() {
  if (lid.state !== 'closed' && lid.state !== 'returning') return;
  pendingFlip = false; // asking for the lid off overrides a turn that was waiting on it
  // Turned or still moving: bring it back onto its top first; it opens once settled.
  if (lid.state === 'closed' && (!orbit.atRest || orbit.face !== 'top')) {
    orbit.flip('top');
    pendingOpen = true;
    return;
  }
  lid.open();
  laser?.finish(); // lifting it off ends the etch at once
  hideHint();
}

/** Put the lid back on: sections fold away first, then it comes back down. */
function closeLid() {
  if ((lid.state !== 'gone' && lid.state !== 'leaving') || lightbox.isOpen || viewerReturning) return;
  setFocus(-1);
  lid.close();
  hideHint();
  closeHintTill = 0;
  openHintAt = clock.elapsedTime + 1.6;
}

// ---- Gestures: taps, drags (turning the box), scrolls and swipes ---------------------
function openLink(href: string) {
  if (href.startsWith('mailto:')) location.href = href;
  else window.open(href, '_blank', 'noopener');
}

/**
 * One scroll or swipe, along a single axis. Up / swipe down puts the lid on; the opposite, down /
 * swipe up, rolls the sealed box onto its back to show the About card, and up / swipe down rolls it
 * back. Opening the lid is a tap or click only.
 */
function onVertical(dir: 1 | -1, source: 'wheel' | 'swipe' | 'key') {
  if (source === 'swipe' && motion.needsPermission) void motion.enable().finally(permissionAsked);
  if (lid.state === 'gone' && focused >= 0 && !viewerReturning) {
    // A project is open: step through them in dashboard order. Before the first closes the lid,
    // past the last rolls the box onto its back.
    const next = focused + dir;
    if (next < 0) closeLid();
    else if (next >= n) turnOver();
    else setFocus(next);
    return;
  }
  if (lid.state === 'gone' && orbit.face === 'bottom' && dir < 0 && n > 0) {
    orbit.flip('top'); // back from the About card to the last project
    pendingFocus = n - 1;
    return;
  }
  if (dir > 0 && lid.state === 'closed') pendingOpen = false; // turning away from the top drops a tap's pending open
  if (lid.state === 'closed') orbit.flip(dir > 0 ? 'bottom' : 'top');
  else if (lid.state === 'gone' && orbit.face === 'bottom') orbit.flip('top'); // lid off, on its back: scrolling up turns it back
  else if (lid.state === 'gone' && dir > 0 && focused < 0) orbit.flip('bottom');
  else if (dir < 0) closeLid();
}

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

function onTap() {
  // iOS grants motion only from a tap. The first tap on the closed lid asks for it and leaves the
  // lid on, so the steel can follow the tilt before it opens; the next tap opens it.
  if (touch && motion.needsPermission && lid.state === 'closed') {
    void motion.enable().finally(permissionAsked);
    return;
  }
  if (touch) void motion.enable();
  const link = linkUnderPointer();
  if (link) return openLink(link);
  if (orbit.face === 'bottom') return; // on its back only the card's links respond
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

/** The section under the pointer (in its current or opening layout), or -1. */
function sectionUnderPointer() {
  const p = pointer.onPlane(TOP_Y);
  return p ? cellAt(p.x, p.z) : -1;
}

// Escape folds an open section back into the overview (unless it's closing the photo viewer).
// Arrow down / up step like a scroll or swipe: through the projects, onto the About card and back.
window.addEventListener('keydown', (e) => {
  if (lightbox.isOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && focused >= 0 && !viewerReturning) setFocus(-1);
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!e.repeat) onVertical(e.key === 'ArrowDown' ? 1 : -1, 'key');
  }
});

// ---- Loop ----------------------------------------------------------------------------
const local = new THREE.Vector3();
const tiltCursor = new THREE.Vector3();
/** How far above the lid the cursor's light hangs. */
const LIGHT_H = 4.2;
const LIGHT_REACH = 1.15;
const lightAim = new THREE.Vector3();
const lightPos = new THREE.Vector3();
// Dev convenience: /#open starts with the lid already off.
if (import.meta.env.DEV && location.hash.startsWith('#open')) {
  lid.skip();
  reveal.snap(1);
  const k = Number(location.hash.slice(6));
  // Once the lead shots are in, so the section opens in the layout their aspect picks.
  if (location.hash.length > 5 && k >= 0 && k < n) void leadsLoaded.then(() => {
    setFocus(k); // e.g. #open-1 focuses project 1
    // Fast-forward every spring to rest so captures show the settled state.
    for (let i = 0; i < 3; i++) {
      stepLayout(3);
      stage.update(3);
      tiles.forEach((t) => t.update(3, 0, 1, stage.restEye));
      chipSets[k].setShown(true);
      chipSets[k].update(3, null, stage.pxPerUnit);
    }
  });
}

// Dev convenience: /#about starts with the box on its back, showing the About card.
if (import.meta.env.DEV && location.hash === '#about') {
  orbit.snap('bottom');
  shownFace = 'bottom';
  stage.setView('underside', true);
}

// Dev: /?stats shows the live render resolution and frame rate (to check sharpness on a phone).
const stats = import.meta.env.DEV && new URLSearchParams(location.search).has('stats') ? document.createElement('div') : null;
if (stats) {
  stats.style.cssText = 'position:fixed;top:env(safe-area-inset-top);left:8px;z-index:20;font:12px ui-monospace,monospace;color:#9f9;pointer-events:none';
  document.body.appendChild(stats);
}
let statFrames = 0;
let statSince = 0;

let hintShown = false;
/** With the lid off: how to open a section, shown until one has been opened. */
let sectionHintOn = false;
let sectionOpened = false;
let lidOffAt = 0;
/** Back at the overview after opening a section: a one-off note on how to put the lid back. */
let closeHintShown = false;
let closeHintAt = 0;
let closeHintTill = 0;
/** After closing: bring the open hint back once the lid has settled. */
let openHintAt = 0;
/** Lid on, until the box has been turned over once: the flip hint shows under the open hint. */
let flippedOnce = false;
/** On its back: how to turn it back, once. */
let backHintShown = false;
let backHintTill = 0;
/** The face the hints last reacted to: a change of it (even a snap) puts them aside and re-arms the open hint. */
let hintFace: Face = 'top';
/** Cursor / tilt as the scene uses it: frozen while the box is held, easing back in after. */
let ambX = 0;
let ambY = 0;
let ambientIn = 1;
const orbitM4 = new THREE.Matrix4();
const clock = new THREE.Clock();
/** The previous frame's display timestamp (ms), from requestAnimationFrame. */
let lastStamp = -1;
function frame(stamp?: number) {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 1 / 30);
  // Pace by the display's own timestamps: callbacks run late after a long frame and then catch up
  // a few ms apart, which read as a refresh far faster than the screen's and cost phones their 3x.
  if (stamp !== undefined) {
    if (lastStamp >= 0) stage.adapt((stamp - lastStamp) / 1000);
    lastStamp = stamp;
  }
  const time = clock.elapsedTime;
  if (stats) {
    statFrames++;
    if (time - statSince > 1) {
      const c = stage.renderer.domElement;
      stats.textContent = `${Math.round(statFrames / (time - statSince))} fps · ${stage.pixelRatio.toFixed(2)}x of ${devicePixelRatio}x · ${c.width}×${c.height}`;
      statFrames = 0;
      statSince = time;
    }
  }

  pointer.update(dt);
  motion.update(dt);
  let px = pointer.sx;
  let py = pointer.sy;
  if (motion.active) {
    px = motion.x;
    py = motion.y;
  } else if (touch) {
    px = Math.sin(time * 0.35) * 0.5;
    py = Math.cos(time * 0.27) * 0.3;
  }
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
  orbit.setLimits(true, !canTurn());
  orbit.update(dt);
  if (orbit.dragging) {
    pendingOpen = pendingFlip = false;
    pendingFocus = -1;
  }
  if (pendingFocus >= 0 && orbit.atRest && orbit.face === 'top') {
    const k = pendingFocus;
    pendingFocus = -1;
    if (lid.state === 'gone') setFocus(k);
  }
  if (pendingOpen && orbit.atRest && orbit.face === 'top') {
    pendingOpen = false;
    openLid();
  }
  if (pendingFlip && lid.state === 'closed' && orbit.atRest) {
    pendingFlip = false;
    orbit.flip('bottom');
  }
  if (orbit.face !== a11yFace) {
    a11yFace = orbit.face;
    syncFaceControls(a11yFace);
    faceStatus.textContent = a11yFace === 'bottom' ? 'Showing About' : 'Showing the top of the box';
  }
  // Lying on its back, the camera frames the About card straight on; upright, the usual overview.
  if (orbit.face !== shownFace && focused < 0) {
    shownFace = orbit.face;
    stage.setView(shownFace === 'bottom' ? 'underside' : null, reduced);
  }
  stage.orbit.copy(orbit.quaternion);
  const par = reduced ? 0 : settings.motion.parallax;
  stage.setParallax(ambX * par, ambY * par);
  // Cursor shapes the steel only: the light slides above the lid, env rotates with it.
  // The light sits right over the point of the lid under the cursor (the box's centre when the
  // cursor has left, the tilt's sweep on touch), eased so it glides rather than snaps.
  if (!touch && pointer.inside && ambientIn > 0) {
    pointer.onPlane(TOP_Y, lightAim);
    lightAim.x = THREE.MathUtils.clamp(lightAim.x, -OUTER_W / 2, OUTER_W / 2);
    lightAim.z = THREE.MathUtils.clamp(lightAim.z, -OUTER_D / 2, OUTER_D / 2);
  } else lightAim.set(ambX * OUTER_W * 0.5, 0, -ambY * OUTER_D * 0.5);
  // The glow on rough metal skews toward the middle of the lid, so aim past the cursor.
  lightAim.x *= LIGHT_REACH;
  lightAim.z *= LIGHT_REACH;
  const lk = 1 - Math.exp(-dt * 12);
  lightPos.x += (lightAim.x - lightPos.x) * lk;
  lightPos.z += (lightAim.z - lightPos.z) * lk;
  stage.lidLightRest.set(lightPos.x, LIGHT_H, lightPos.z);
  stage.envSway.set(-ambY * 0.15, ambX * 0.6, 0);
  stage.update(dt);
  box.shell.uSheen.value = ambX * OUTER_W * 0.45;
  box.shell.uOrbit.value.setFromMatrix4(orbitM4.makeRotationFromQuaternion(orbit.quaternion));
  underside.sheen = ambX * 0.35;

  lid.update(dt, time);
  laser?.update(dt, stage.pxPerUnitAtOne);

  reveal.target = lid.openness > 0.25 ? 1 : 0;
  const rv = reveal.step(dt);
  // Hover affordance (mouse only): a closed section brightens a little under the pointer.
  const hovered = !touch && pointer.inside && lid.state === 'gone' && !lightbox.isOpen ? sectionUnderPointer() : -1;
  tiles.forEach((t, k) => t.setHover(k === hovered && k !== focused));
  stepLayout(dt);
  // Turned away from above, the open wells would show through the walls and the base: they fade out first.
  const above = THREE.MathUtils.smoothstep(topElevation(orbit.quaternion, VIEW), 0.04, 0.3);
  const rvSeen = rv * above;
  tiles.forEach((t) => t.update(dt, time, rvSeen, stage.restEye));
  matchLabels(); // from this frame's fits (they change only as the photos load)
  const tu = box.top.uniforms;
  tu.uCount.value = n;
  tiles.forEach((t, k) => {
    const r = t.rect;
    tu.uRects.value[k].set(r.x, r.z, r.w, r.d);
    tu.uCol.value[k].set(t.project.glow[0]);
    tu.uI.value[k] = t.glowIntensity * rvSeen;
  });

  // Hover cursor for the glass: the pointer on desktop; on touch, tilting the phone sweeps a
  // virtual cursor across the focused section, so the same tilt, sheen and lift play out.
  const tilt = touch && motion.active && !lightbox.isOpen;
  if (focused >= 0) {
    let p: THREE.Vector3 | null = null;
    if (pointer.inside && !touch) p = pointer.onPlane(TOP_Y + 0.2);
    else if (tilt) {
      const r = tiles[focused].rect;
      p = tiltCursor.set(r.x + motion.x * r.w * 0.5, TOP_Y + 0.2, r.z - motion.y * r.d * 0.5);
    }
    if (p) {
      const g = chipSets[focused].group;
      local.copy(p).sub(g.position);
      local.x /= g.scale.x;
      local.z /= g.scale.z;
    }
  }
  // Glass arrives once its section has mostly opened, so it never hangs over a neighbour.
  if (focused >= 0) chipSets[focused].setShown(tiles[focused].focusProgress > 0.7);
  chipSets.forEach((c, k) => {
    const has = k === focused && ((pointer.inside && !touch) || tilt);
    c.update(dt, has ? local : null, stage.pxPerUnit);
  });

  tiles.forEach((t, k) => {
    // Touch has no hover: an open section deals through its screenshots on its own.
    const over =
      k === focused && !lightbox.isOpen && (touch ? lid.state === 'gone' : pointer.inside && pointer.cast(t.stack.meshes, false).length > 0);
    t.stack.setHovered(over);
  });

  let cursor = '';
  if (touch) cursor = ''; // no cursor on touch: skip the raycast chain
  else if (gestures.dragging) cursor = 'grabbing';
  else if (lid.state === 'returning' && pointer.inside && pointer.cast([lid.hit], false).length) cursor = 'pointer';
  else if (focused >= 0 && pointer.cast(chipSets[focused].linkMeshes, false).length) cursor = 'pointer';
  else if (focused >= 0 && pointer.cast(tiles[focused].stack.meshes, false).length) cursor = 'zoom-in';
  else if (hovered >= 0 && hovered !== focused) cursor = 'pointer';
  else if (pointer.inside && linkUnderPointer()) cursor = 'pointer';
  else if (canTurn() && pointer.inside && pointer.cast(grabbable, false).length) cursor = 'grab';
  host.style.cursor = cursor;

  // Lid fully on: nothing inside can be seen. Hidden, so the depth-ignoring shafts and the deep
  // cards can't show through the walls or the bottom while the box is turned.
  const sealed = lid.state === 'closed' || above <= 0;
  box.table.visible = !sealed;
  for (const t of tiles) t.group.visible = !sealed;

  stage.render(glassGroups);
  if (focused >= 0) sectionOpened = true;
  if (lid.state !== 'gone') lidOffAt = 0;
  else if (!lidOffAt) lidOffAt = time;
  const lidOffTop = orbit.face === 'top' && orbit.atRest;
  if (!sectionOpened && !sectionHintOn && lidOffAt && lidOffTop && time - lidOffAt > 0.6) {
    sectionHintOn = true;
    showHint(sectionHint);
  }
  if (sectionHintOn && (focused >= 0 || lid.state !== 'gone' || !lidOffTop)) {
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
  const introDone = laser ? laser.cutDone : time > 1.5;
  const restingTop = lid.state === 'closed' && orbit.face === 'top' && orbit.atRest;
  if (orbit.face === 'bottom') flippedOnce = true;
  // hideHint also cancels a swap still waiting out its fade. Lid off: the section hint stays.
  if (orbit.engaged && hintShown && lid.state === 'closed' && !backHintTill) hideHint();
  // Armed by a change of face as well as by grabbing: with reduced motion the turn snaps within a frame.
  if (orbit.face !== hintFace) {
    hintFace = orbit.face;
    if (hintShown && lid.state === 'closed') {
      openHintAt = time + 1.2;
      if (!backHintTill) hideHint(); // reduced motion snaps the turn, so nothing else has hidden the hint
    }
  }
  if (orbit.engaged && hintShown && lid.state === 'closed') openHintAt = time + 1.2;
  if (openHintAt && time > openHintAt && restingTop) {
    openHintAt = 0;
    showRestHints();
  }
  if (!hintShown && introDone && restingTop) {
    hintShown = true;
    showRestHints();
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
  requestAnimationFrame(frame);
}
frame();
