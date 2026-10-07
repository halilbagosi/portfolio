import { MAX_BIO, MAX_SKILLS, MAX_SOCIALS, MAX_TIMELINE, MAX_YEARS, type About, type Settings } from '../../content/schema';
import { api } from '../api';
import { h } from '../dom';
import { rangeField, tagsField, textField, toggleField } from '../fields';
import { processPhoto } from '../photos';
import { moveItem, type Store } from '../state';

/** Up, down and remove buttons for one row of a list editor. */
function rowActions(i: number, n: number, move: (from: number, to: number) => void, remove: () => void) {
  const btn = (label: string, text: string, disabled: boolean, onclick: () => void) =>
    h('button', { class: 'icon', type: 'button', title: label, 'aria-label': label, disabled, onclick }, text);
  return h(
    'div',
    { class: 'row-actions' },
    btn('Move up', '↑', i === 0, () => move(i, i - 1)),
    btn('Move down', '↓', i === n - 1, () => move(i, i + 1)),
    btn('Remove', '×', false, remove),
  );
}

/**
 * A list editor's frame. The error slot comes first: showIssues() fills the first one under the
 * element, which must be the list's own ("At most 4 …"), not that of the first row's first field.
 */
const listField = (path: string, ...rows: HTMLElement[]) =>
  h('div', { class: 'field list-field', 'data-path': path }, h('small', { class: 'field-error' }), ...rows);

/** One row of a list editor: three fields side by side, then the row's buttons. */
const listRow = (fields: HTMLElement[], ...actions: Parameters<typeof rowActions>) =>
  h('div', { class: 'list-row' }, h('div', { class: 'grid3' }, ...fields), rowActions(...actions));

/** The "add a row" button under a list: disabled, and saying why, once the list is full. */
const addButton = (full: boolean, fullLabel: string, label: string, add: () => void) =>
  h('button', { class: 'btn', type: 'button', disabled: full, onclick: add }, full ? fullLabel : label);

/**
 * The About card on the box's underside (portrait, bio, experience, contact) and the socials
 * engraved on its lid. Field edits change the store in place; adding, removing or moving rows
 * re-renders the view.
 */
export function renderAbout(root: HTMLElement, store: Store, rerender: () => void) {
  const s = store.content.settings;
  const a = s.about;
  const edit = (fn: (s: Settings) => void) => store.change((c) => fn(c.settings));
  const ed = (fn: (a: About) => void) => edit((x) => fn(x.about));
  /** A structural change: the rows themselves change, so draw the view again. */
  const restructure = (fn: (s: Settings) => void) => {
    edit(fn);
    rerender();
  };

  // Portrait: uploaded through the same photo pipeline as screenshots (the server names it about-<n>.jpg).
  const status = h('small', { class: 'field-hint' }, a.photo || 'No portrait: your initials are shown in the circle.');
  const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload a portrait' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    // Reset so choosing the same file again still fires `change`.
    file.value = '';
    if (!f) return;
    status.textContent = 'Uploading…';
    // One upload at a time: a second pick mid-flight would race the first and leave an orphan file.
    file.disabled = true;
    try {
      const { blob, warning } = await processPhoto(f);
      const { path } = await api.uploadPhoto('about', blob);
      restructure((x) => (x.about.photo = path));
      if (warning) alert(warning);
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      file.disabled = false;
    }
  });
  const removePhoto = () => restructure((x) => (x.about.photo = ''));
  const portrait = h(
    'div',
    { class: 'field', 'data-path': 'settings.about.photo' },
    h('span', { class: 'field-label' }, 'Portrait'),
    h(
      'div',
      { class: 'portrait-row' },
      a.photo ? h('img', { class: 'portrait', src: a.photo, alt: '' }) : h('div', { class: 'portrait empty' }),
      file,
      a.photo ? h('button', { class: 'btn', type: 'button', onclick: removePhoto }, 'Remove') : null,
    ),
    status,
    h('small', { class: 'field-error' }),
  );

  const socials = s.socials.map((so, i) => {
    const at = `settings.socials.${i}`;
    const set = (k: keyof typeof so) => (v: string) => edit((x) => (x.socials[i][k] = v));
    return listRow(
      [
        textField('Label', `${at}.label`, so.label, set('label'), { hint: 'On the About card, e.g. GitHub.' }),
        textField('Engraved text', `${at}.text`, so.text, set('text'), { hint: 'On the lid, e.g. github.com/you.' }),
        textField('Link', `${at}.href`, so.href, set('href'), { hint: 'https://… or mailto:…' }),
      ],
      i,
      s.socials.length,
      (from, to) => restructure((x) => moveItem(x.socials, from, to)),
      () => restructure((x) => x.socials.splice(i, 1)),
    );
  });

  const timeline = a.timeline.map((t, i) => {
    const at = `settings.about.timeline.${i}`;
    const set = (k: keyof typeof t) => (v: string) => ed((x) => (x.timeline[i][k] = v));
    return listRow(
      [
        textField('Role', `${at}.role`, t.role, set('role')),
        textField('Company or school', `${at}.org`, t.org, set('org')),
        textField('Period', `${at}.period`, t.period, set('period'), { hint: 'e.g. 2022–now' }),
      ],
      i,
      a.timeline.length,
      (from, to) => restructure((x) => moveItem(x.about.timeline, from, to)),
      () => restructure((x) => x.about.timeline.splice(i, 1)),
    );
  });

  const socialsFull = s.socials.length >= MAX_SOCIALS;
  const timelineFull = a.timeline.length >= MAX_TIMELINE;

  root.replaceChildren(
    h('div', { class: 'editor-head' }, h('h2', {}, 'About & socials')),

    h('div', { class: 'section-title' }, 'Socials — engraved on the lid'),
    listField('settings.socials', ...socials),
    addButton(socialsFull, `The lid fits ${MAX_SOCIALS}`, 'Add a social', () =>
      restructure((x) => x.socials.push({ label: '', text: '', href: 'https://' })),
    ),

    h('div', { class: 'section-title' }, 'About — on the underside'),
    portrait,
    textField('Bio', 'settings.about.bio', a.bio, (v) => ed((x) => (x.bio = v)), {
      multiline: true,
      maxLength: MAX_BIO,
      hint: `Two or three sentences, up to ${MAX_BIO} characters.`,
    }),
    rangeField('Years of experience', 'settings.about.years', a.years, { min: 0, max: MAX_YEARS, step: 1, unit: 'years' }, (v) => ed((x) => (x.years = v)), 'Shown as “N+”.'),
    h(
      'div',
      { class: 'grid2' },
      textField('Location', 'settings.about.location', a.location, (v) => ed((x) => (x.location = v))),
      textField('Work preference', 'settings.about.workPreference', a.workPreference, (v) => ed((x) => (x.workPreference = v)), {
        hint: 'e.g. Remote · open to relocation (optional).',
      }),
    ),
    h(
      'div',
      { class: 'grid2' },
      toggleField('Available', 'settings.about.available', a.available, (v) => ed((x) => (x.available = v)), 'Green dot when on, grey when off.'),
      textField('Availability', 'settings.about.availability', a.availability, (v) => ed((x) => (x.availability = v)), {
        hint: 'e.g. Open to new roles.',
      }),
    ),
    tagsField('Skills', 'settings.about.skills', a.skills, (v) => ed((x) => (x.skills = v)), `Up to ${MAX_SKILLS}, shown as chips.`, MAX_SKILLS),
    h(
      'div',
      { class: 'grid2' },
      textField('Email', 'settings.about.email', a.email, (v) => ed((x) => (x.email = v))),
      textField('Résumé link', 'settings.about.resume', a.resume, (v) => ed((x) => (x.resume = v)), { hint: 'https://… (optional).' }),
    ),

    h('div', { class: 'section-title' }, 'Experience'),
    listField('settings.about.timeline', ...timeline),
    addButton(timelineFull, `Up to ${MAX_TIMELINE} entries`, 'Add an entry', () =>
      restructure((x) => x.about.timeline.push({ role: '', org: '', period: '' })),
    ),
  );
}
