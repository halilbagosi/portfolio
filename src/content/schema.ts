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
/** The lid has room for this many engraved socials. */
export const MAX_SOCIALS = 4;
export const MAX_SKILLS = 12;
export const MAX_TIMELINE = 8;
export const MAX_ACHIEVEMENTS = 8;
export const MAX_BIO = 360;
export const MAX_YEARS = 60;
export const ID_PATTERN = /^[a-z0-9-]+$/;
/** A photo served from public/shots (no folders, no dot-files). */
export const SHOT_PATH = /^\/shots\/(?!\.)[A-Za-z0-9._-]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const HREF = /^https?:\/\/\S+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAILTO = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ProjectLink {
  label: string;
  href: string;
}

/** The Albanian wording of a project's text. Anything left empty falls back to the English. */
export type ProjectSq = Partial<Record<(typeof PROJECT_SQ_KEYS)[number], string>>;
export const PROJECT_SQ_KEYS = ['title', 'caption', 'purpose', 'architecture', 'duration', 'status'] as const;

export interface Project {
  /** Stable slug: names the project's photo files and identifies it in the dashboard. */
  id: string;
  /** Hidden projects stay in the dashboard but are not shown on the site. */
  visible: boolean;
  /** Shown in the big lead tile. One project at most; with none, the first visible one is. */
  featured?: boolean;
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
  /** Albanian wording (optional). */
  sq?: ProjectSq;
}

export interface HintPair {
  desktop: string;
  touch: string;
}

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
  /** Albanian wording (optional). */
  sq?: Partial<Record<'role' | 'org' | 'period', string>>;
}

/** Something to be proud of: a title, and optionally a line of detail and when. */
export interface Achievement {
  title: string;
  /** '' to leave out. */
  detail: string;
  /** e.g. "2025" ('' to leave out). */
  year: string;
  /** Albanian wording (optional). */
  sq?: Partial<Record<'title' | 'detail', string>>;
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
  achievements: Achievement[];
}

/** The browser-tab icon: a few letters on a rounded square, or an uploaded image instead. */
export interface SiteIcon {
  text: string;
  background: string;
  color: string;
  /** Corner radius of the square, 0 (square) to 50 (a circle). */
  radius: number;
  /** '' (the letters are drawn) or a /shots/<file> image used as the icon as it is. */
  image: string;
}
export const MAX_ICON_TEXT = 3;
export const MAX_ICON_RADIUS = 50;

/** The icon as an SVG document (also served inline as the page's favicon). */
export function iconSvg({ text, background, color, radius }: SiteIcon): string {
  const t = text.trim().toUpperCase().replace(/[&<>"']/g, '');
  const size = t.length <= 1 ? 64 : t.length === 2 ? 46 : 34;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="${background}"/>` +
    `<text x="50" y="50" dy=".35em" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-weight="700" ` +
    `font-size="${size}" letter-spacing="-1" fill="${color}">${t}</text></svg>`
  );
}

/** Section sizes, each a share of the box in percent. */
export interface LayoutSettings {
  /** Overview, wide box: the lead (featured) section's share of the width. */
  leadWidth: number;
  /** A section open, wide box: its column's share of the width (the others close to strips). */
  openWidth: number;
  /** A section open: its share of the depth when it shares a column (every section, in a tall box). */
  openDepth: number;
  /** The featured section open, wide box: its share of the width. */
  featuredWidth: number;
  /** The featured section open, wide box: its share of the depth (centred; 100 = all of it). */
  featuredDepth: number;
}
/** Allowed range per layout value (percent). */
export const LAYOUT_RANGES: Record<keyof LayoutSettings, [number, number]> = {
  leadWidth: [30, 70],
  openWidth: [50, 95],
  openDepth: [50, 95],
  featuredWidth: [50, 95],
  featuredDepth: [40, 100],
};

/** The line along the bottom of the About card: two printed marks and a sentence. */
export interface FinePrint {
  show: boolean;
  /** {name}, {role}, {city} and {location} are filled in. '' leaves only the marks. */
  text: string;
  /** The crossed-out bin mark. */
  bin: boolean;
  /** The ring mark, with letters inside it. */
  ring: boolean;
  /** The ring's letters: '' for your initials. */
  ringText: string;
}
export const MAX_RING_TEXT = 3;
export const MAX_FINE_PRINT = 160;

export const CARD_HEADINGS = ['about', 'experience', 'achievements', 'skills', 'contact'] as const;
export type CardHeading = (typeof CARD_HEADINGS)[number];

/** The About card's own words: its section headings, the experience fact and the fine print. */
export interface CardSettings {
  headings: Record<CardHeading, string>;
  /** After "N+" in the facts, e.g. "years experience". */
  yearsLabel: string;
  finePrint: FinePrint;
}

/** The box's colours (#rrggbb) and how brightly the sections glow. */
export interface LookSettings {
  /** The lid's anodised finish. */
  lid: string;
  /** The engraving, where the laser cut through to bare metal. */
  engraving: string;
  /** The lid's chamfered edge. */
  lidEdge: string;
  /** The box's walls. */
  walls: string;
  /** The top plate between the sections. */
  plate: string;
  /** The page behind the box. */
  background: string;
  /** The laser's glow while it engraves the lid. */
  laser: string;
  /** How brightly the sections glow (each project's own two colours), × the usual. */
  glowStrength: number;
}
export const LOOK_COLOURS = ['lid', 'engraving', 'lidEdge', 'walls', 'plate', 'background', 'laser'] as const;
export const MAX_GLOW = 2;

export const HINT_KEYS = ['open', 'section', 'close', 'flip', 'back'] as const;
export type HintKey = (typeof HINT_KEYS)[number];
export const SETTINGS_SQ_TEXT = [
  'role', 'title', 'description', 'bio', 'location', 'workPreference', 'availability', 'yearsLabel', 'finePrint',
] as const;

/** The Albanian wording of the site's own text. Anything left empty falls back to a built-in Albanian default, then to the English. */
export type SettingsSq = Partial<Record<(typeof SETTINGS_SQ_TEXT)[number], string>> & {
  headings?: Partial<Record<CardHeading, string>>;
  hints?: { [K in HintKey]?: Partial<HintPair> } & { begin?: { touch?: string } };
};

export interface Settings {
  identity: { name: string; role: string; title: string; description: string };
  icon: SiteIcon;
  hints: { open: HintPair; begin: { touch: string }; section: HintPair; close: HintPair; flip: HintPair; back: HintPair };
  motion: { photoDwell: number; flipSpeed: number; gyroDegrees: number; parallax: number; lidKnock: boolean; topDownOnOpen: boolean };
  look: LookSettings;
  layout: LayoutSettings;
  card: CardSettings;
  socials: Social[];
  about: About;
  /** Albanian wording (optional). */
  sq?: SettingsSq;
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

/** The projects the site shows, in its order: visible ones, the featured one first (the big tile). */
export function siteOrder<T extends Project>(projects: T[]): T[] {
  const shown = projects.filter((p) => p.visible);
  const lead = shown.findIndex((p) => p.featured);
  if (lead > 0) shown.unshift(...shown.splice(lead, 1));
  return shown;
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
  const { identity, hints, motion, socials, about, icon, layout, card, look } = s;
  if (!isObj(identity)) issues.push({ path: 'settings.identity', message: 'Identity is missing.' });
  else
    for (const k of ['name', 'role', 'title', 'description'])
      if (!filled(identity[k])) issues.push({ path: `settings.identity.${k}`, message: `${k} is required.` });

  if (!isObj(hints)) issues.push({ path: 'settings.hints', message: 'Hints are missing.' });
  else {
    for (const k of ['open', 'section', 'close', 'flip', 'back']) {
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
    range('flipSpeed', 0.25, 3);
    range('gyroDegrees', 5, 45);
    range('parallax', 0, 2);
    for (const k of ['lidKnock', 'topDownOnOpen'])
      if (typeof motion[k] !== 'boolean') issues.push({ path: `settings.motion.${k}`, message: 'Must be on or off.' });
  }

  if (!isObj(icon)) issues.push({ path: 'settings.icon', message: 'Icon is missing.' });
  else {
    if (!filled(icon.text) || (icon.text as string).trim().length > MAX_ICON_TEXT)
      issues.push({ path: 'settings.icon.text', message: `Icon text needs 1 to ${MAX_ICON_TEXT} characters.` });
    for (const k of ['background', 'color'])
      if (typeof icon[k] !== 'string' || !HEX.test(icon[k] as string)) issues.push({ path: `settings.icon.${k}`, message: 'Needs a #rrggbb colour.' });
    if (typeof icon.radius !== 'number' || !Number.isFinite(icon.radius) || icon.radius < 0 || icon.radius > MAX_ICON_RADIUS)
      issues.push({ path: 'settings.icon.radius', message: `Must be between 0 and ${MAX_ICON_RADIUS}.` });
    if (icon.image !== '' && (typeof icon.image !== 'string' || !SHOT_PATH.test(icon.image)))
      issues.push({ path: 'settings.icon.image', message: 'The icon image must be a /shots/<file> path, or empty.' });
  }

  if (!isObj(look)) issues.push({ path: 'settings.look', message: 'Colours are missing.' });
  else {
    for (const k of LOOK_COLOURS)
      if (typeof look[k] !== 'string' || !HEX.test(look[k] as string)) issues.push({ path: `settings.look.${k}`, message: 'Needs a #rrggbb colour.' });
    const g = look.glowStrength;
    if (typeof g !== 'number' || !Number.isFinite(g) || g < 0 || g > MAX_GLOW)
      issues.push({ path: 'settings.look.glowStrength', message: `Must be between 0 and ${MAX_GLOW}.` });
  }

  if (!isObj(layout)) issues.push({ path: 'settings.layout', message: 'Layout settings are missing.' });
  else
    for (const [k, [lo, hi]] of Object.entries(LAYOUT_RANGES)) {
      const v = layout[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) issues.push({ path: `settings.layout.${k}`, message: `Must be between ${lo} and ${hi}%.` });
    }

  validateCard(card, issues);

  validateSocials(socials, issues);
  validateAbout(about, issues);
  validateSettingsSq(s.sq, issues);
}

/** Optional Albanian text: an object whose listed keys, where present, are strings. */
function checkSq(v: unknown, keys: readonly string[], path: string, issues: Issue[], project?: string) {
  if (v === undefined) return;
  if (!isObj(v)) {
    issues.push({ path, message: 'The Albanian text is malformed.', project });
    return;
  }
  for (const k of keys)
    if (v[k] !== undefined && typeof v[k] !== 'string') issues.push({ path: `${path}.${k}`, message: 'Albanian text must be text.', project });
}

function validateSettingsSq(sq: unknown, issues: Issue[]) {
  const at = 'settings.sq';
  checkSq(sq, SETTINGS_SQ_TEXT, at, issues);
  if (!isObj(sq)) return;
  checkSq(sq.headings, CARD_HEADINGS, `${at}.headings`, issues);
  if (sq.hints === undefined) return;
  if (!isObj(sq.hints)) return void issues.push({ path: `${at}.hints`, message: 'The Albanian text is malformed.' });
  for (const k of HINT_KEYS) checkSq(sq.hints[k], ['desktop', 'touch'], `${at}.hints.${k}`, issues);
  checkSq(sq.hints.begin, ['touch'], `${at}.hints.begin`, issues);
}

function validateCard(card: unknown, issues: Issue[]) {
  const at = (k: string) => `settings.card.${k}`;
  if (!isObj(card)) {
    issues.push({ path: 'settings.card', message: 'About card settings are missing.' });
    return;
  }
  const { headings, finePrint: fp } = card;
  for (const k of CARD_HEADINGS)
    if (!isObj(headings) || !filled(headings[k])) issues.push({ path: at(`headings.${k}`), message: 'This heading is required.' });
  if (!filled(card.yearsLabel)) issues.push({ path: at('yearsLabel'), message: 'This label is required.' });
  if (!isObj(fp)) {
    issues.push({ path: at('finePrint'), message: 'Fine print settings are missing.' });
    return;
  }
  for (const k of ['show', 'bin', 'ring']) if (typeof fp[k] !== 'boolean') issues.push({ path: at(`finePrint.${k}`), message: 'Must be on or off.' });
  if (typeof fp.text !== 'string' || fp.text.length > MAX_FINE_PRINT)
    issues.push({ path: at('finePrint.text'), message: `Fine print is text of up to ${MAX_FINE_PRINT} characters (it may be empty).` });
  if (typeof fp.ringText !== 'string' || fp.ringText.trim().length > MAX_RING_TEXT)
    issues.push({ path: at('finePrint.ringText'), message: `Up to ${MAX_RING_TEXT} letters, or empty for your initials.` });
}

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
  if (typeof a.years !== 'number' || !Number.isInteger(a.years) || a.years < 0 || a.years > MAX_YEARS)
    issues.push({ path: at('years'), message: `Must be a whole number between 0 and ${MAX_YEARS}.` });
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
      if (isObj(t)) checkSq(t.sq, ['role', 'org', 'period'], at(`timeline.${i}.sq`), issues);
    });
  }
  if (!Array.isArray(a.achievements)) issues.push({ path: at('achievements'), message: 'Achievements must be a list.' });
  else {
    if (a.achievements.length > MAX_ACHIEVEMENTS)
      issues.push({ path: at('achievements'), message: `At most ${MAX_ACHIEVEMENTS} achievements.` });
    a.achievements.forEach((t: unknown, i) => {
      if (!isObj(t) || !filled(t.title)) issues.push({ path: at(`achievements.${i}.title`), message: `Achievement ${i + 1}: title is required.` });
      for (const k of ['detail', 'year'])
        if (isObj(t) && typeof t[k] !== 'string')
          issues.push({ path: at(`achievements.${i}.${k}`), message: `Achievement ${i + 1}: ${k} must be text (it may be empty).` });
      if (isObj(t)) checkSq(t.sq, ['title', 'detail'], at(`achievements.${i}.sq`), issues);
    });
  }
}

function validateProjects(list: unknown, issues: Issue[]) {
  if (!Array.isArray(list)) {
    issues.push({ path: 'projects', message: 'Projects must be a list.' });
    return;
  }
  const ids = new Set<string>();
  let visible = 0;
  let featured = false;
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
    if (p.featured !== undefined && typeof p.featured !== 'boolean') add('featured', 'featured must be on or off.');
    else if (p.featured === true) {
      if (featured) add('featured', 'Only one project can be featured.');
      featured = true;
    }
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
    checkSq(p.sq, PROJECT_SQ_KEYS, at('sq'), issues, project);
    if (p.visible === true) visible++;
  });
  if (visible < 1) issues.push({ path: 'projects', message: 'At least one project must be visible.' });
  if (visible > MAX_PROJECTS)
    issues.push({ path: 'projects', message: `At most ${MAX_PROJECTS} projects can be visible (the box has ${MAX_PROJECTS} sections).` });
}
