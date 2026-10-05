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
