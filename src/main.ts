import * as THREE from 'three';
import { Spring } from './anim/springs';
import { projects, settings } from './config/projects';
import { Motion } from './input/motion';
import { Pointer } from './input/pointer';
import { Lightbox } from './lightbox';
import { createBox, GAP, INTERIOR_D, INTERIOR_W, isPortraitViewport, MAX_WELLS, OUTER_W, PORTRAIT, TOP_Y } from './scene/box';
import { ChipSet } from './scene/chips';
import { expandedLayout, focusSizes, packLayout, rectsFrom, restSizes, type Sizes } from './scene/layout';
import { Lid } from './scene/lid';
import { Stage } from './scene/stage';
import { Well } from './scene/well';

const host = document.getElementById('stage')!;
const hint = document.getElementById('hint')!;
const a11y = document.getElementById('a11y')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;

function showFallback() {
  document.getElementById('vignette')!.hidden = true;
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
// iOS asks for motion access on the first tap, which then only wakes the lid (see the click handler).
const copy = settings.hints;
let openHint = touch ? (motion.needsPermission ? copy.begin.touch : copy.open.touch) : copy.open.desktop;
const closeHint = touch ? copy.close.touch : copy.close.desktop;
const sectionHint = touch ? copy.section.touch : copy.section.desktop;
hint.textContent = openHint;

const box = createBox();
scene.add(box.group);
const lid = new Lid(reduced);
scene.add(lid.group);

const n = Math.min(projects.length, MAX_WELLS);
const closed = packLayout(n, INTERIOR_W, INTERIOR_D, GAP);
const tiles = projects.slice(0, n).map((p, i) => {
  const t = new Well(p, i, reduced);
  t.setRect(closed[i], true);
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
    const r = expandedLayout(n, k, INTERIOR_W, INTERIOR_D, GAP)[k];
    c.build(r.w, r.d);
    c.group.position.set(r.x, 0, r.z);
  });
  const vis = chipSets.map((c) => c.group.visible);
  chipSets.forEach((c) => (c.group.visible = true));
  stage.warm([...tiles.flatMap((t) => t.stack.textures), ...chipSets.flatMap((c) => c.textures)]);
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

const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
if (idle) idle(prewarm);
else setTimeout(prewarm, 300);
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
    from: () => st.topRect(camera, stage.renderer.domElement),
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

function layoutFor(i: number) {
  return i < 0 ? closed : expandedLayout(n, i, INTERIOR_W, INTERIOR_D, GAP);
}

function setFocus(i: number) {
  if (i === focused) return;
  focused = i;
  const rects = layoutFor(i);
  setSizes(i < 0 ? rest : focusSizes(n, i, INTERIOR_W, INTERIOR_D, GAP));
  tiles.forEach((t, k) => t.setState(i >= 0 && k !== i, k === i));
  chipSets.forEach((c, k) => {
    if (k === i) {
      c.build(rects[k].w, rects[k].d);
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
  lid.open();
  hint.classList.remove('show');
}

/** Put the lid back on: sections fold away first, then it comes back down. */
function closeLid() {
  if ((lid.state !== 'gone' && lid.state !== 'leaving') || lightbox.isOpen || viewerReturning) return;
  setFocus(-1);
  lid.close();
  hint.classList.remove('show');
  closeHintTill = 0;
  openHintAt = clock.elapsedTime + 1.6;
}

// Lid gestures: scroll down / swipe up lifts it off; scroll up / swipe down puts it back on.
// Small deltas add up within one gesture; a trigger then rests briefly so trackpad momentum
// doesn't fire it again.
let wheelSum = 0;
let wheelAt = 0;
let gestureRest = 0;
function lidGesture(dir: 1 | -1) {
  const now = performance.now();
  if (now < gestureRest) return;
  gestureRest = now + 700;
  wheelSum = 0;
  if (dir > 0) openLid();
  else closeLid();
}
host.addEventListener(
  'wheel',
  (e) => {
    if (lightbox.isOpen) return;
    const now = performance.now();
    if (now - wheelAt > 250) wheelSum = 0;
    wheelAt = now;
    wheelSum += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    if (Math.abs(wheelSum) > 70) lidGesture(wheelSum > 0 ? 1 : -1);
  },
  { passive: true },
);
let swipeY = 0;
let swipeX = 0;
let swipeT = 0;
host.addEventListener('touchstart', (e) => {
  swipeY = e.touches[0].clientY;
  swipeX = e.touches[0].clientX;
  swipeT = performance.now();
}, { passive: true });
host.addEventListener('touchend', (e) => {
  if (lightbox.isOpen || e.changedTouches.length !== 1) return;
  const dy = e.changedTouches[0].clientY - swipeY;
  const dx = e.changedTouches[0].clientX - swipeX;
  // A deliberate, mostly vertical flick.
  if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(dx) * 1.5 || performance.now() - swipeT > 700) return;
  if (motion.needsPermission) void motion.enable().finally(() => (openHint = hint.textContent = copy.open.touch));
  lidGesture(dy < 0 ? 1 : -1);
});

host.addEventListener('click', () => {
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
      window.open(link, '_blank', 'noopener');
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
});

/** The section under the pointer (in its current or opening layout), or -1. */
function sectionUnderPointer() {
  const p = pointer.onPlane(TOP_Y);
  return p ? cellAt(p.x, p.z) : -1;
}

// Escape folds an open section back into the overview (unless it's closing the photo viewer).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && focused >= 0 && !lightbox.isOpen && !viewerReturning) setFocus(-1);
});

// ---- Loop ----------------------------------------------------------------------------
const local = new THREE.Vector3();
const tiltCursor = new THREE.Vector3();
// Dev convenience: /#open starts with the lid already off.
if (import.meta.env.DEV && location.hash.startsWith('#open')) {
  lid.skip();
  reveal.snap(1);
  const k = Number(location.hash.slice(6));
  if (location.hash.length > 5 && k >= 0 && k < n) {
    setFocus(k); // e.g. #open-1 focuses project 1
    // Fast-forward every spring to rest so captures show the settled state.
    for (let i = 0; i < 3; i++) {
      stepLayout(3);
      stage.update(3);
      tiles.forEach((t) => t.update(3, 0, 1, stage.elevation));
      chipSets[k].setShown(true);
      chipSets[k].update(3, null, stage.pxPerUnit);
    }
  }
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
const clock = new THREE.Clock();
function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 1 / 30);
  stage.adapt(raw);
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
  const par = reduced ? 0 : settings.motion.parallax;
  stage.setParallax(px * par, py * par);
  stage.update(dt);

  // Cursor shapes the steel only: the light slides above the lid, env rotates with it.
  stage.lidLight.position.set(px * 6, 3.0, -py * 4 + 0.5);
  scene.environmentRotation.y = px * 0.6;
  scene.environmentRotation.x = -py * 0.15;
  box.shell.uSheen.value = px * OUTER_W * 0.45;

  lid.update(dt, time);

  reveal.target = lid.openness > 0.25 ? 1 : 0;
  const rv = reveal.step(dt);
  // Hover affordance (mouse only): a closed section brightens a little under the pointer.
  const hovered = !touch && pointer.inside && lid.state === 'gone' && !lightbox.isOpen ? sectionUnderPointer() : -1;
  tiles.forEach((t, k) => t.setHover(k === hovered && k !== focused));
  stepLayout(dt);
  tiles.forEach((t) => t.update(dt, time, rv, stage.elevation));
  const tu = box.top.uniforms;
  tu.uCount.value = n;
  tiles.forEach((t, k) => {
    const r = t.rect;
    tu.uRects.value[k].set(r.x, r.z, r.w, r.d);
    tu.uCol.value[k].set(t.project.glow[0]);
    tu.uI.value[k] = t.glowIntensity * rv;
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
  if ((lid.state === 'closed' || lid.state === 'returning') && pointer.cast([lid.hit], false).length) cursor = 'pointer';
  else if (focused >= 0 && pointer.cast(chipSets[focused].linkMeshes, false).length) cursor = 'pointer';
  else if (focused >= 0 && pointer.cast(tiles[focused].stack.meshes, false).length) cursor = 'zoom-in';
  else if (hovered >= 0 && hovered !== focused) cursor = 'pointer';
  host.style.cursor = cursor;

  stage.render(glassGroups);
  if (focused >= 0) sectionOpened = true;
  if (lid.state !== 'gone') lidOffAt = 0;
  else if (!lidOffAt) lidOffAt = time;
  if (!sectionOpened && !sectionHintOn && lidOffAt && time - lidOffAt > 0.6) {
    sectionHintOn = true;
    hint.textContent = sectionHint;
    hint.classList.add('show');
  }
  if (sectionHintOn && (focused >= 0 || lid.state !== 'gone')) {
    sectionHintOn = false;
    hint.classList.remove('show');
  }
  if (sectionOpened && !closeHintShown && focused < 0 && lid.state === 'gone') {
    closeHintShown = true;
    closeHintAt = time + 1.2;
  }
  if (closeHintTill && focused >= 0) closeHintTill = time; // opening a section clears it
  if (closeHintAt && time > closeHintAt) {
    closeHintAt = 0;
    if (lid.state === 'gone' && focused < 0) {
      hint.textContent = closeHint;
      hint.classList.add('show');
      closeHintTill = time + 3.5;
    }
  }
  if (closeHintTill && time > closeHintTill) {
    closeHintTill = 0;
    hint.classList.remove('show');
  }
  if (openHintAt && time > openHintAt && lid.state === 'closed') {
    openHintAt = 0;
    hint.textContent = openHint;
    hint.classList.add('show');
  }
  if (!hintShown && time > 1.5 && lid.state === 'closed') {
    hintShown = true;
    hint.classList.add('show');
  }
  requestAnimationFrame(frame);
}
frame();
