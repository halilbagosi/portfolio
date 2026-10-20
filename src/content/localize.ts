import { DEFAULT_SQ, kindLabel, type Lang } from '../i18n';
import { HINT_KEYS, isHidden, type Project, type Settings, type SiteContent } from './schema';

/** A project as the site shows it: its words in the chosen language, plus the labels for its kind and status. */
export type ShownProject = Project & { kindLabel: string; statusLabel: string };

/** `sq` where it has text, else `fallback`. */
const pick = (sq: string | undefined, fallback: string) => (sq?.trim() ? sq : fallback);

/**
 * The content in one language. English is the content as written; for Albanian each field takes its
 * `sq` wording where one was entered, then (for the site's own hints and headings) a built-in Albanian
 * default, then the English. Names, links, colours and photos are shared by both languages.
 */
export function localize(content: SiteContent, lang: Lang): { settings: Settings; projects: Project[] } {
  if (lang === 'en') return { settings: content.settings, projects: content.projects };
  const s = content.settings;
  const sq = s.sq ?? {};
  const hints = { ...s.hints };
  for (const k of HINT_KEYS) {
    const mine = sq.hints?.[k];
    hints[k] = {
      desktop: pick(mine?.desktop, DEFAULT_SQ.hints[k].desktop),
      touch: pick(mine?.touch, DEFAULT_SQ.hints[k].touch),
    };
  }
  hints.begin = { touch: pick(sq.hints?.begin?.touch, DEFAULT_SQ.hints.begin.touch) };
  const headings = { ...s.card.headings };
  for (const k of Object.keys(headings) as (keyof typeof headings)[]) headings[k] = pick(sq.headings?.[k], DEFAULT_SQ.headings[k]);
  const settings: Settings = {
    ...s,
    identity: { ...s.identity, role: pick(sq.role, s.identity.role), title: pick(sq.title, s.identity.title), description: pick(sq.description, s.identity.description) },
    hints,
    card: {
      ...s.card,
      headings,
      yearsLabel: pick(sq.yearsLabel, DEFAULT_SQ.yearsLabel),
      finePrint: { ...s.card.finePrint, text: pick(sq.finePrint, DEFAULT_SQ.finePrint) },
    },
    about: {
      ...s.about,
      bio: pick(sq.bio, s.about.bio),
      location: pick(sq.location, s.about.location),
      workPreference: s.about.workPreference ? pick(sq.workPreference, s.about.workPreference) : '',
      availability: pick(sq.availability, s.about.availability),
      timeline: s.about.timeline.map((e) => ({ ...e, role: pick(e.sq?.role, e.role), org: pick(e.sq?.org, e.org), period: pick(e.sq?.period, e.period) })),
      achievements: s.about.achievements.map((a) => ({ ...a, title: pick(a.sq?.title, a.title), detail: a.detail ? pick(a.sq?.detail, a.detail) : '' })),
    },
  };
  const projects = content.projects.map((p) => ({
    ...p,
    title: pick(p.sq?.title, p.title),
    caption: pick(p.sq?.caption, p.caption),
    purpose: pick(p.sq?.purpose, p.purpose),
    architecture: pick(p.sq?.architecture, p.architecture),
    duration: pick(p.sq?.duration, p.duration),
    status: pick(p.sq?.status, p.status),
  }));
  return { settings, projects };
}

/** Adds the display labels: the kind in the chosen language, and the status as it is shown (its colour follows the English status). */
export function shown(original: Project, localized: Project, lang: Lang): ShownProject {
  const p = { ...localized, kindLabel: kindLabel(original.kind, lang), statusLabel: localized.status, status: original.status };
  return { ...blank(p), kindLabel: isHidden(p, 'kind') ? '' : p.kindLabel, statusLabel: isHidden(p, 'status') ? '' : p.statusLabel };
}

/** An owner as the site shows it: each hidden text field reads as empty, each hidden list as none (the kind and status keep their values, for colour). */
function blank<T extends { hidden?: readonly string[] }>(o: T): T {
  if (!o.hidden?.length) return o;
  const out: Record<string, unknown> = { ...o };
  for (const k of o.hidden) {
    if (k === 'kind' || k === 'status') continue;
    const v = out[k];
    out[k] = Array.isArray(v) ? [] : typeof v === 'string' ? '' : v;
  }
  return out as T;
}

/** The settings as the site shows them: hidden fields read as empty (`years` stays a number: check isHidden). */
export function withoutHidden(s: Settings): Settings {
  return {
    ...s,
    identity: blank(s.identity),
    about: { ...blank(s.about), timeline: s.about.timeline.map(blank), achievements: s.about.achievements.map(blank) },
  };
}
