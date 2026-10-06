import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { nextPhotoName, shotFile, unusedPhotos } from '../src/content/photo-files';
import { formatIssue, ID_PATTERN, validate, type SiteContent } from '../src/content/schema';

/**
 * The content dashboard's backend. Dev server only (configureServer never runs in a build), and
 * only for requests from this machine: `npm run dev:phone` exposes the server on the network,
 * and phones must not be able to write files.
 *
 * Also fills identity tokens ({{site.title}} …) in index.html, in dev and in builds.
 */
export function adminPlugin(): Plugin {
  let root = process.cwd();
  const contentFile = () => path.join(root, 'src/content/site.json');
  const shotsDir = () => path.join(root, 'public/shots');
  const readContent = async () => JSON.parse(await readFile(contentFile(), 'utf8')) as SiteContent;

  async function route(req: IncomingMessage, res: ServerResponse, url: URL) {
    const { pathname } = url;
    const method = req.method ?? 'GET';
    if (pathname === '/__admin/content' && method === 'GET') return send(res, 200, await readContent());
    if (pathname === '/__admin/content' && method === 'PUT') return saveContent(req, res);
    if (pathname === '/__admin/photo' && method === 'POST') return savePhoto(req, res, url.searchParams.get('project') ?? '');
    if (pathname === '/__admin/unused-photos' && method === 'GET') return send(res, 200, { files: await listUnused() });
    if (pathname === '/__admin/unused-photos' && method === 'DELETE') return deleteUnused(req, res);
    throw new HttpError(404, 'Unknown admin route.');
  }

  async function saveContent(req: IncomingMessage, res: ServerResponse) {
    let body: unknown;
    try {
      body = JSON.parse((await readBody(req, 2e6)).toString('utf8'));
    } catch {
      throw new HttpError(400, 'The content is not valid JSON.');
    }
    const errors = validate(body).map(formatIssue);
    if (!errors.length) {
      // The browser can't see the disk: make sure every photo it refers to really exists.
      const files = new Set(await readdir(shotsDir()));
      for (const p of (body as SiteContent).projects)
        for (const img of p.images) if (!files.has(shotFile(img) ?? '')) errors.push(`${p.title}: photo ${img} is not in public/shots.`);
      const portrait = (body as SiteContent).settings.about.photo;
      if (portrait && !files.has(shotFile(portrait) ?? '')) errors.push(`About: portrait ${portrait} is not in public/shots.`);
    }
    if (errors.length) return send(res, 422, { errors });
    // Write next to the target and rename: a crash mid-write can't leave a half-written file.
    const tmp = `${contentFile()}.${randomUUID()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`);
    await rename(tmp, contentFile());
    send(res, 200, { ok: true });
  }

  async function savePhoto(req: IncomingMessage, res: ServerResponse, id: string) {
    if (!ID_PATTERN.test(id)) throw new HttpError(400, 'Give the project a valid id (a–z, 0–9, dashes) before adding photos.');
    if (!(req.headers['content-type'] ?? '').startsWith('image/jpeg')) throw new HttpError(415, 'Photos must be uploaded as JPEG.');
    const data = await readBody(req, 15e6);
    if (data.length < 3 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new HttpError(415, 'That file is not a JPEG.');
    // Parallel uploads may pick the same name: 'wx' refuses to overwrite, so try the next one.
    for (let attempt = 0; attempt < 5; attempt++) {
      const name = nextPhotoName(id, await readdir(shotsDir()));
      try {
        await writeFile(path.join(shotsDir(), name), data, { flag: 'wx' });
        return send(res, 200, { path: `/shots/${name}` });
      } catch (e) {
        if ((e as { code?: string }).code !== 'EEXIST') throw e;
      }
    }
    throw new HttpError(409, 'Could not find a free file name; try again.');
  }

  async function listUnused() {
    return unusedPhotos(await readContent(), await readdir(shotsDir()));
  }

  async function deleteUnused(req: IncomingMessage, res: ServerResponse) {
    const raw = await readBody(req, 1e5);
    let body: { files?: unknown };
    try {
      body = JSON.parse(raw.toString('utf8')) as { files?: unknown };
    } catch {
      throw new HttpError(400, 'The request is not valid JSON.');
    }
    const asked = Array.isArray(body.files) ? body.files : [];
    // Re-check on the server: only files that are unused right now, by the saved content.
    const unused = new Set(await listUnused());
    const deleted = asked.filter((f): f is string => typeof f === 'string' && unused.has(f));
    for (const f of deleted) await unlink(path.join(shotsDir(), f));
    send(res, 200, { deleted });
  }

  return {
    name: 'portfolio-admin',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        if (!html.includes('{{site.')) return html;
        const { identity } = (await readContent()).settings;
        const values: Record<string, string> = {
          title: identity.title,
          description: identity.description,
          name: identity.name,
          role: identity.role,
          noscript: `${identity.name}, ${identity.role.toLowerCase()}. Enable JavaScript to open the box.`,
        };
        return html.replace(/\{\{site\.(\w+)\}\}/g, (token, key: string) => (key in values ? escapeHtml(values[key]) : token));
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const isAdmin = url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname.startsWith('/__admin/');
        if (!isAdmin) return next();
        if (!isLocal(req)) return send(res, 403, { errors: ['The dashboard only works on this computer.'] });
        const handle =
          url.pathname.startsWith('/__admin/')
            ? route(req, res, url)
            : // Served raw, not through Vite's HTML pipeline: no HMR client, so saving content
              // (which reloads the site) never reloads the dashboard and loses its state.
              readFile(path.join(root, 'src/admin/admin.html'), 'utf8').then((html) => {
                res.setHeader('content-type', 'text/html; charset=utf-8');
                res.end(html);
              });
        handle.catch((e: unknown) => {
          if (e instanceof HttpError) send(res, e.status, { errors: [e.message] });
          else send(res, 500, { errors: [e instanceof Error ? e.message : String(e)] });
        });
      });
    },
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The connection must come from this machine AND be addressed to it by name. The address alone
 * isn't enough: a web page whose domain rebinds to 127.0.0.1 would reach the API from the user's
 * browser. Vite's own host check blocks that too; this keeps it blocked if that is ever relaxed.
 */
function isLocal(req: IncomingMessage) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) return false;
  // HTTPS (`npm run dev:phone`) is served over HTTP/2, which names the host in :authority, not Host.
  const authority = req.headers[':authority'];
  const host = ((typeof authority === 'string' ? authority : undefined) ?? req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');
  return ['localhost', '127.0.0.1', '::1'].includes(host);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, `Upload is larger than ${Math.round(limit / 1e6)} MB.`));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
