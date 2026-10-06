import { ID_PATTERN, SHOT_PATH, type SiteContent } from './schema';

/**
 * Photo file rules shared by the dev-server API and the dashboard. Names are always generated
 * here (<id>-<n>.jpg), never taken from an upload, so a request can't write outside public/shots.
 */

/** Next free name for a project's photo: one past the highest <id>-<n>.jpg already there. */
export function nextPhotoName(id: string, existing: string[]): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid project id: ${id}`);
  const own = new RegExp(`^${id}-(\\d+)\\.jpg$`); // id is [a-z0-9-] only: safe in a pattern
  let max = 0;
  for (const f of existing) {
    const m = own.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${id}-${max + 1}.jpg`;
}

/** The file name behind a /shots/<file> path, or null for anything else. */
export function shotFile(path: string): string | null {
  return SHOT_PATH.test(path) ? path.slice('/shots/'.length) : null;
}

/** Image files in public/shots that no project (visible or hidden) refers to. */
export function unusedPhotos(content: SiteContent, files: string[]): string[] {
  const used = new Set(content.projects.flatMap((p) => p.images.map(shotFile)));
  return files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('.') && !used.has(f)).sort();
}
