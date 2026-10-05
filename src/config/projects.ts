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
