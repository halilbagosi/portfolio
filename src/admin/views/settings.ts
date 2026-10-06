import type { Settings } from '../../content/schema';
import { h } from '../dom';
import { rangeField, textField, toggleField } from '../fields';
import type { Store } from '../state';

/** Identity, hint copy and motion tuning. Edits change the store in place; no re-render needed. */
export function renderSettings(root: HTMLElement, store: Store) {
  const s = store.content.settings;
  const edit = (fn: (s: Settings) => void) => store.change((c) => fn(c.settings));
  const hint = (label: string, key: 'open' | 'section' | 'close') =>
    h(
      'div',
      { class: 'grid2' },
      textField(`${label} — desktop`, `settings.hints.${key}.desktop`, s.hints[key].desktop, (v) => edit((x) => (x.hints[key].desktop = v))),
      textField(`${label} — touch`, `settings.hints.${key}.touch`, s.hints[key].touch, (v) => edit((x) => (x.hints[key].touch = v))),
    );

  root.replaceChildren(
    h('div', { class: 'editor-head' }, h('h2', {}, 'Settings')),

    h('div', { class: 'section-title' }, 'Identity'),
    h(
      'div',
      { class: 'grid2' },
      textField('Name', 'settings.identity.name', s.identity.name, (v) => edit((x) => (x.identity.name = v)), { hint: 'Engraved on the lid.' }),
      textField('Role', 'settings.identity.role', s.identity.role, (v) => edit((x) => (x.identity.role = v)), { hint: 'Engraved under your name.' }),
    ),
    textField('Page title', 'settings.identity.title', s.identity.title, (v) => edit((x) => (x.identity.title = v)), { hint: 'Browser tab and search results.' }),
    textField('Description', 'settings.identity.description', s.identity.description, (v) => edit((x) => (x.identity.description = v)), {
      multiline: true,
      hint: 'Search results and link previews.',
    }),

    h('div', { class: 'section-title' }, 'Hints'),
    hint('Open the box', 'open'),
    textField('Wake the lid (iPhone, first tap asks for motion)', 'settings.hints.begin.touch', s.hints.begin.touch, (v) =>
      edit((x) => (x.hints.begin.touch = v)),
    ),
    hint('Open a section', 'section'),
    hint('Put the lid back', 'close'),

    h('div', { class: 'section-title' }, 'Motion'),
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
