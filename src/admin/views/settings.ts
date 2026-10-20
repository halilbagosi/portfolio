import type { LayoutSettings, LookSettings, Settings } from '../../content/schema';
import { iconSvg, LAYOUT_RANGES, MAX_GLOW, MAX_ICON_RADIUS, MAX_ICON_TEXT } from '../../content/schema';
import { api } from '../api';
import { h } from '../dom';
import { colorField, hideable, rangeField, textField, toggleField } from '../fields';
import { processPhoto } from '../photos';
import { DEFAULT_SQ } from '../../i18n';
import { HINT_KEYS, isHidden } from '../../content/schema';
import { setHidden, setSq, type Store } from '../state';

/** Identity, icon, hint copy, colours, section sizes and motion tuning. Edits change the store in place; no re-render needed. */
export function renderSettings(root: HTMLElement, store: Store) {
  const s = store.content.settings;
  const edit = (fn: (s: Settings) => void) => store.change((c) => fn(c.settings));
  const look = (label: string, key: Exclude<keyof LookSettings, 'glowStrength'>, hint: string) =>
    colorField(label, `settings.look.${key}`, s.look[key], (v) => edit((x) => (x.look[key] = v)), hint);
  const hint = (label: string, key: 'open' | 'section' | 'close' | 'flip' | 'back') =>
    h(
      'div',
      { class: 'grid2' },
      textField(`${label} — desktop`, `settings.hints.${key}.desktop`, s.hints[key].desktop, (v) => edit((x) => (x.hints[key].desktop = v))),
      textField(`${label} — touch`, `settings.hints.${key}.touch`, s.hints[key].touch, (v) => edit((x) => (x.hints[key].touch = v))),
    );

  const sq = s.sq ?? {};
  const sqText = (k: 'role' | 'title' | 'description', label: string, o: { multiline?: boolean; hint?: string } = {}) =>
    textField(`${label} — Albanian`, `settings.sq.${k}`, sq[k] ?? '', (v) => edit((x) => setSq(x, k, v)), { ...o, placeholder: s.identity[k] });
  const sqIdentity = h('div', {}, sqText('title', 'Page title'), sqText('description', 'Description', { multiline: true }));
  const sqHint = (k: 'begin' | (typeof HINT_KEYS)[number], d: 'desktop' | 'touch') => {
    const mine = (sq.hints?.[k] as Record<string, string> | undefined)?.[d] ?? '';
    const fallback = (DEFAULT_SQ.hints[k] as Record<string, string>)[d];
    const label = k === 'begin' ? 'Wake the lid' : { open: 'Open the box', section: 'Open a section', close: 'Put the lid back', flip: 'Turn it over', back: 'Turn it back' }[k];
    return textField(`${label} — ${d} — Albanian`, `settings.sq.hints.${k}.${d}`, mine, (v) =>
      edit((x) => {
        const top = (x.sq ??= {});
        const hints = (top.hints ??= {});
        const pair = ((hints as Record<string, Record<string, string>>)[k] ??= {});
        if (v.trim()) pair[d] = v;
        else delete pair[d];
        if (!Object.keys(pair).length) delete (hints as Record<string, unknown>)[k];
        if (!Object.keys(hints).length) delete top.hints;
        if (!Object.keys(top).length) delete x.sq;
      }), { placeholder: fallback });
  };

  root.replaceChildren(
    h('div', { class: 'editor-head' }, h('h2', {}, 'Settings')),

    h('div', { class: 'section-title' }, 'Identity'),
    textField('Name', 'settings.identity.name', s.identity.name, (v) => edit((x) => (x.identity.name = v)), { hint: 'Engraved on the lid.' }),
    h(
      'div',
      { class: 'grid2' },
      hideable(textField('Role', 'settings.identity.role', s.identity.role, (v) => edit((x) => (x.identity.role = v)), { hint: 'Engraved under your name.' }), isHidden(s.identity, 'role'), (on) =>
        edit((x) => setHidden(x.identity, 'role', on)),
      ),
      sqText('role', 'Role', { hint: 'Engraved instead when a visitor picks SQ. Empty: the English role.' }),
    ),
    textField('Page title', 'settings.identity.title', s.identity.title, (v) => edit((x) => (x.identity.title = v)), { hint: 'Browser tab and search results.' }),
    textField('Description', 'settings.identity.description', s.identity.description, (v) => edit((x) => (x.identity.description = v)), {
      multiline: true,
      hint: 'Search results and link previews.',
    }),

    h('div', { class: 'section-title' }, 'Site icon'),
    iconEditor(s, edit),

    h('div', { class: 'section-title' }, 'Hints'),
    hint('Open the box', 'open'),
    textField('Wake the lid (iPhone, first tap asks for motion)', 'settings.hints.begin.touch', s.hints.begin.touch, (v) =>
      edit((x) => (x.hints.begin.touch = v)),
    ),
    hint('Open a section', 'section'),
    hint('Put the lid back', 'close'),
    hint('Turn it over (About)', 'flip'),
    hint('Turn it back', 'back'),

    h('div', { class: 'section-title' }, 'Albanian (Shqip) — identity and hints'),
    h('small', { class: 'field-hint' }, 'Shown when a visitor picks SQ. Leave a field empty for the built-in Albanian (hints) or the English (identity). Your name and the site icon are the same in both.'),
    sqIdentity,
    h('div', { class: 'grid2' }, ...HINT_KEYS.flatMap((k) => (['desktop', 'touch'] as const).map((d) => sqHint(k, d)))),
    sqHint('begin', 'touch'),

    h('div', { class: 'section-title' }, 'Colours'),
    h(
      'div',
      { class: 'grid2' },
      look('Lid', 'lid', 'The anodised metal of the lid.'),
      look('Engraving', 'engraving', 'Where the laser cut your name and links into the lid.'),
      look('Lid edge', 'lidEdge', 'The bevel around the lid.'),
      look('Walls', 'walls', 'The sides of the box, where the light is full on.'),
      look('Plate', 'plate', 'The top of the box, between the sections.'),
      look('Page', 'background', 'Behind the box.'),
      look('Laser glow', 'laser', 'The beam’s glow while it engraves the lid.'),
    ),
    rangeField(
      'Glow strength',
      'settings.look.glowStrength',
      s.look.glowStrength,
      { min: 0, max: MAX_GLOW, step: 0.05, unit: '×' },
      (v) => edit((x) => (x.look.glowStrength = v)),
      'How brightly the sections glow. Each project’s two glow colours are set on the project.',
    ),

    h('div', { class: 'section-title' }, 'Section sizes'),
    layoutField('Featured section width (overview)', 'leadWidth', s, edit, 'Share of the box the big tile takes before anything is opened. Wide screens.'),
    layoutField('Featured section open width', 'featuredWidth', s, edit, 'Share of the box the featured section takes across when open. Wide screens.'),
    layoutField('Featured section open length', 'featuredDepth', s, edit, 'Share of the box it takes front to back when open, centred. 100 is the full length. Wide screens.'),
    layoutField('Other sections open width', 'openWidth', s, edit, 'Share of the box any other open section takes across; the rest shrink to strips. Wide screens.'),
    layoutField(
      'Other sections open length',
      'openDepth',
      s,
      edit,
      'Share of the box they take front to back when open. On a phone the box is one column with no featured tile, so this applies to every section there.',
    ),

    h('div', { class: 'section-title' }, 'Motion'),
    rangeField(
      'Flip speed',
      'settings.motion.flipSpeed',
      s.motion.flipSpeed,
      { min: 0.25, max: 3, step: 0.05, unit: '×' },
      (v) => edit((x) => (x.motion.flipSpeed = v)),
      'How fast a screenshot flips to the next one. Above 1 is quicker.',
    ),
    rangeField('Time on each photo', 'settings.motion.photoDwell', s.motion.photoDwell, { min: 0.5, max: 10, step: 0.5, unit: 's' }, (v) =>
      edit((x) => (x.motion.photoDwell = v)),
    ),
    rangeField(
      'Gyro range',
      'settings.motion.gyroDegrees',
      s.motion.gyroDegrees,
      { min: 5, max: 45, step: 1, unit: '°' },
      (v) => edit((x) => (x.motion.gyroDegrees = v)),
      'How far to tilt a phone for the full effect. Lower is more sensitive.',
    ),
    rangeField('Parallax', 'settings.motion.parallax', s.motion.parallax, { min: 0, max: 2, step: 0.1, unit: '×' }, (v) =>
      edit((x) => (x.motion.parallax = v)),
    ),
    toggleField('Lid knocks now and then', 'settings.motion.lidKnock', s.motion.lidKnock, (v) => edit((x) => (x.motion.lidKnock = v))),
    toggleField('Look straight down at an open section', 'settings.motion.topDownOnOpen', s.motion.topDownOnOpen, (v) =>
      edit((x) => (x.motion.topDownOnOpen = v)),
    ),
  );
}

/** One section size, as a percentage of the box. */
function layoutField(label: string, key: keyof LayoutSettings, s: Settings, edit: (fn: (s: Settings) => void) => void, hint: string) {
  const [min, max] = LAYOUT_RANGES[key];
  return rangeField(label, `settings.layout.${key}`, s.layout[key], { min, max, step: 1, unit: '%' }, (v) => edit((x) => (x.layout[key] = v)), hint);
}

/**
 * The browser-tab icon: letters, two colours and the corner radius, with a live preview; or an
 * uploaded image, used as it is. Applies after a reload of the site.
 */
function iconEditor(s: Settings, edit: (fn: (s: Settings) => void) => void) {
  const preview = h('img', { class: 'icon-preview', alt: 'Icon preview', width: 64, height: 64 });
  const draw = () => {
    preview.src = s.icon.image || `data:image/svg+xml,${encodeURIComponent(iconSvg(s.icon))}`;
    status.textContent = s.icon.image ? `Using ${s.icon.image}. Remove it to use the letters again.` : 'Or upload an image (square works best).';
    remove.hidden = !s.icon.image;
  };
  const status = h('small', { class: 'field-hint' });
  const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload an icon image' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = ''; // so choosing the same file again still fires `change`
    if (!f) return;
    status.textContent = 'Uploading…';
    file.disabled = true;
    try {
      const { blob } = await processPhoto(f);
      const { path } = await api.uploadPhoto('icon', blob);
      edit((x) => (x.icon.image = path));
      draw();
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      file.disabled = false;
    }
  });
  const remove = h('button', { class: 'btn', type: 'button', onclick: () => (edit((x) => (x.icon.image = '')), draw()) }, 'Remove image');
  const image = h(
    'div',
    { class: 'field', 'data-path': 'settings.icon.image' },
    h('span', { class: 'field-label' }, 'Image'),
    h('div', { class: 'portrait-row' }, file, remove),
    status,
    h('small', { class: 'field-error' }),
  );
  const color = (label: string, key: 'background' | 'color') => {
    const input = h('input', { type: 'color', value: s.icon[key], 'aria-label': label });
    input.addEventListener('input', () => {
      edit((x) => (x.icon[key] = input.value));
      draw();
    });
    return h('div', { class: 'field', 'data-path': `settings.icon.${key}` }, h('span', { class: 'field-label' }, label), h('div', { class: 'colors' }, input), h('small', { class: 'field-error' }));
  };
  draw();
  return h(
    'div',
    { class: 'grid2' },
    textField(
      'Letters',
      'settings.icon.text',
      s.icon.text,
      (v) => {
        edit((x) => (x.icon.text = v));
        draw();
      },
      { maxLength: MAX_ICON_TEXT, hint: 'Your initials, shown in the browser tab.' },
    ),
    preview,
    color('Background', 'background'),
    color('Letters colour', 'color'),
    rangeField('Corner radius', 'settings.icon.radius', s.icon.radius, { min: 0, max: MAX_ICON_RADIUS, step: 1 }, (v) => {
      edit((x) => (x.icon.radius = v));
      draw();
    }, '0 is square, 50 a circle.'),
    image,
  );
}
