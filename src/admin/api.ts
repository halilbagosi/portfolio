import type { SiteContent } from '../content/schema';

/** A failed request, carrying the server's list of problems. */
export class ApiError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('\n'));
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { errors?: string[] };
  if (!res.ok) throw new ApiError(body.errors ?? [`${res.status} ${res.statusText}`]);
  return body as T;
}

const send = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** The dev server's admin routes (vite/admin-plugin.ts). */
export const api = {
  load: () => fetch('/__admin/content').then((r) => json<SiteContent>(r)),
  save: (c: SiteContent) => fetch('/__admin/content', send('PUT', c)).then((r) => json<{ ok: true }>(r)),
  uploadPhoto: (projectId: string, blob: Blob) =>
    fetch(`/__admin/photo?project=${encodeURIComponent(projectId)}`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: blob,
    }).then((r) => json<{ path: string }>(r)),
  unusedPhotos: () => fetch('/__admin/unused-photos').then((r) => json<{ files: string[] }>(r)),
  deleteUnused: (files: string[]) => fetch('/__admin/unused-photos', send('DELETE', { files })).then((r) => json<{ deleted: string[] }>(r)),
};
