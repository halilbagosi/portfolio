# Admin dashboard — design

**Date:** 2026-10-06
**Status:** Approved in conversation; awaiting spec review

## Goal

A dashboard for managing the portfolio's content without editing code: add, edit, remove and
reorder projects, manage each project's photos, and change site-wide settings (identity, hint
copy, motion tuning). It runs only on the owner's Mac, inside the existing Vite dev server.

## Decisions

- **Local only.** The dashboard exists only while `npm run dev` (or `dev:phone`) is running.
  No login, database or hosting changes. Edits are written to files in the repo; publishing is
  the existing build + deploy.
- **Approach: a Vite dev-server plugin plus an `/admin` page** in the same project (rejected: a
  separate Node server — more moving parts; an off-the-shelf git CMS — heavy, can't preview the
  3D box or process photos the way the stack needs).
- **No new dependencies.** Plain TypeScript + DOM for the dashboard, matching the site. Photo
  resizing happens in the browser with a canvas.
- **Scope:** projects and photos, plus settings for identity, hints and motion.

## Architecture

```
src/content/site.json        single source of truth (settings + ordered projects)
src/content/schema.ts        types + validate(content) → errors[] (shared by site, plugin, admin)
src/config/projects.ts       typed loader: imports site.json, validates, exports projects + settings
vite/admin-plugin.ts         dev-only API (apply: 'serve') + build-time index.html fill
admin.html, src/admin/*      the dashboard page (dev only)
public/shots/                photos (unchanged location)
```

### Content file (`src/content/site.json`)

```jsonc
{
  "settings": {
    "identity": { "name": "Halil Bagosi", "role": "Software Engineer",
                  "title": "Halil Bagosi — Software Engineer",
                  "description": "Halil Bagosi, software engineer. Selected projects." },
    "hints": {
      "open":    { "desktop": "Click to open",               "touch": "Tap to open" },
      "begin":   { "touch": "Tap to begin" },                 // iOS motion-permission tap
      "section": { "desktop": "Click a section to open it",  "touch": "Tap a section to open it" },
      "close":   { "desktop": "Scroll up to close",          "touch": "Swipe down to close" }
    },
    "motion": { "photoDwell": 2, "gyroDegrees": 18, "parallax": 1,
                "lidKnock": true, "topDownOnOpen": true }
  },
  "projects": [ /* Project, in display order */ ]
}
```

`Project` keeps today's fields — `title, kind, caption, purpose, stack[], architecture, duration,
status, links[{label, href}], glow[2], images[]` — and adds `id` (stable slug, used for photo
file names and the preview link) and `visible` (hidden projects stay in the dashboard but are not
shown on the site).

### Validation (`src/content/schema.ts`)

One `validate(content): string[]` used in three places: the site loader, the plugin (before
every write), and the dashboard (inline, before Save). Rules:

- 1–12 visible projects (the box holds at most 12 sections); unique `id`s matching `^[a-z0-9-]+$`.
- Required non-empty: `title, kind, caption, purpose, architecture, duration, status`.
- `kind` ∈ the four kinds in `tints.ts`; `status` is free text, but the dashboard offers the
  three known statuses (Shipped, In progress, Prototype), which have colours.
- `glow`: two `#rrggbb` colours. Links: non-empty label, `http(s)://` href.
- Visible projects need ≥ 1 image; every image path is `/shots/<file>` and the file exists
  (existence is checked by the plugin only, since the browser can't see the disk).
- Settings: strings non-empty; `photoDwell` 0.5–10, `gyroDegrees` 5–45, `parallax` 0–2.

### Plugin (`vite/admin-plugin.ts`)

Registered in `vite.config.ts` for both serve and build. The API routes and the `/admin` page are
added in `configureServer`, which only runs under the dev server, so neither exists in a
production build; `admin.html` is not a build input.

| Route | Does |
|---|---|
| `GET /__admin/content` | Returns `site.json`. |
| `PUT /__admin/content` | Validates (incl. image files exist); writes via temp file + rename; 422 with the error list on failure. |
| `POST /__admin/photo?project=<id>` | Body: a JPEG. Saves as `public/shots/<id>-<n>.jpg` (next free `n`); returns its path. Rejects non-JPEG, bodies > 15 MB, and unknown/invalid ids. Names are generated, never taken from the client. |
| `GET /__admin/unused-photos` | Files in `public/shots/` not referenced by any project. |
| `DELETE /__admin/unused-photos` | Deletes exactly the listed unused files (re-checked server-side). Only on explicit request from the dashboard. |

Also, in both serve and build: `transformIndexHtml` fills the page `<title>` and meta
description from `settings.identity`.

Writing `site.json` triggers Vite's normal reload of the site, so the preview updates on save.

### Dashboard (`admin.html`, `src/admin/`)

Plain TypeScript + DOM, dark and minimal like the site. Small modules:
`api.ts` (fetch wrappers), `state.ts` (staged content + dirty tracking), `photos.ts`
(resize/encode/size checks), `views/*.ts` (project list, project form, photo strip, settings).

- **Left — projects:** list in display order; drag to reorder; add (creates a draft with a
  generated id, hidden until it has a photo); delete (confirm); visibility toggle.
- **Middle — editor:** the selected project's form: text fields, kind and status dropdowns,
  stack as tags, links as rows, two glow colour pickers. **Photos:** thumbnail strip with
  drag-and-drop/file-picker upload, drag to reorder (first = top of the stack), replace, remove.
  A **Settings** tab holds identity, hints and motion.
- **Right — live preview:** an iframe of the real site, opened on the edited project
  (`/#open-<index>`, its position among visible projects), reloaded after each save. A hidden
  project previews as the overview, since it isn't on the site.
- **Save model:** edits are staged; one Save writes everything. Unsaved changes are flagged, and
  leaving the page asks first. "Discard changes" reloads from disk. Validation errors show next
  to their fields and block Save.
- **Photos are processed in the browser before upload:** decoded, downscaled to fit 2400 px
  (desktop) or 1290 px wide (phone shots, aspect < 0.75), encoded as JPEG (quality 0.88). Files
  smaller than 1200 px (desktop) / 900 px wide (phone) get a "may look soft on phones" warning,
  but are still accepted.
- **Housekeeping:** a "Remove unused photos" action lists unreferenced files and deletes them
  only after confirmation. Removing a photo from a project never deletes its file by itself.

## Site changes

- `projects.ts` loads and validates `site.json`; exports `projects` (visible only, in order)
  and `settings`. Broken content throws with the validation errors (shown in Vite's overlay).
- Settings replace hard-coded values:
  - identity → lid engraving (`textures.ts`), screen-reader "open the box" text, no-WebGL
    fallback heading/role (`main.ts`, `index.html`), page title + description (plugin);
  - hints → hint strings in `main.ts`;
  - motion → `DWELL` (`stack.ts`), gyro range (`motion.ts`), parallax factor (`main.ts`),
    lid knock (`lid.ts`), top-down on open (`main.ts`/`stage.ts`).
- The `#open-<index>` dev hash already exists and is reused for the preview.

## Error handling

- Plugin: validates every write; never writes invalid content; upload paths are generated and
  confined to `public/shots/`; clear JSON error responses.
- Dashboard: failed saves keep staged edits and show the server's errors; photo processing
  failures are reported per file; network errors are shown without losing edits.
- Site: invalid `site.json` → descriptive error, not a blank box.

## Testing

- Unit (vitest): `validate` (a valid fixture; each rule violated individually), photo file
  naming / next free index / path confinement, photo size classification.
- Existing layout tests unchanged.
- Manual end-to-end in the browser: add a project, upload and reorder photos, edit fields and
  settings, hide a project, save, and confirm the site reflects it; confirm `npm run build`
  output contains no admin route or page.

## Out of scope

Login, online editing, photo cropping, multi-step undo (beyond discarding unsaved changes),
editing the tint colour tables.
