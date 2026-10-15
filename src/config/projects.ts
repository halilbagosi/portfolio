import raw from '../content/site.json';
import { lang as siteLang, type Lang } from '../i18n';
import { localize, shown, type ShownProject } from '../content/localize';
import { formatIssue, siteOrder, validate, type Settings, type SiteContent } from '../content/schema';

export type { Project, ProjectKind } from '../content/schema';
export type { ShownProject };

/**
 * Validates content and returns what the site shows: visible projects in order (the featured one
 * first, so it gets the big tile), and settings.
 * Content is edited in the dashboard (/admin) or by hand in src/content/site.json.
 *
 * Photo paths are stored from the site root (/shots/…); `base` is where the site is published
 * (e.g. /portfolio/ on GitHub Pages), so they are rewritten to sit under it.
 */
export function loadContent(input: unknown, base = import.meta.env.BASE_URL, lang: Lang = siteLang): { projects: ShownProject[]; settings: Settings } {
  const issues = validate(input);
  if (issues.length) throw new Error(`src/content/site.json is invalid:\n- ${issues.map(formatIssue).join('\n- ')}`);
  const content = input as SiteContent;
  const at = (src: string) => base + src.slice(1);
  const words = localize(content, lang);
  // Same order and length as content.projects, so each shown project is paired with its original (its kind and status key the colours).
  const paired = content.projects.map((p, i) => shown(p, words.projects[i], lang));
  const projects = siteOrder(paired).map((p) => ({ ...p, images: p.images.map(at) }));
  const about = { ...words.settings.about, photo: words.settings.about.photo && at(words.settings.about.photo) };
  return { projects, settings: { ...words.settings, about } };
}

export const { projects, settings } = loadContent(raw);
