import raw from '../content/site.json';
import { formatIssue, siteOrder, validate, type Project, type Settings, type SiteContent } from '../content/schema';

export type { Project, ProjectKind } from '../content/schema';

/**
 * Validates content and returns what the site shows: visible projects in order (the featured one
 * first, so it gets the big tile), and settings.
 * Content is edited in the dashboard (/admin) or by hand in src/content/site.json.
 *
 * Photo paths are stored from the site root (/shots/…); `base` is where the site is published
 * (e.g. /portfolio/ on GitHub Pages), so they are rewritten to sit under it.
 */
export function loadContent(input: unknown, base = import.meta.env.BASE_URL): { projects: Project[]; settings: Settings } {
  const issues = validate(input);
  if (issues.length) throw new Error(`src/content/site.json is invalid:\n- ${issues.map(formatIssue).join('\n- ')}`);
  const content = input as SiteContent;
  const projects = siteOrder(content.projects).map((p) => ({ ...p, images: p.images.map((src) => base + src.slice(1)) }));
  return { projects, settings: content.settings };
}

export const { projects, settings } = loadContent(raw);
