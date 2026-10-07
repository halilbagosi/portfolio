import { KINDS, STATUSES, type Project } from '../../content/schema';
import { h } from '../dom';
import { colorsField, selectField, tagsField, textField, toggleField } from '../fields';
import type { Store } from '../state';

/**
 * Editor for one project. Text edits change the store without re-rendering (keeps focus);
 * structural edits (links, delete) re-render. Photos come from `photos(index)`.
 */
export function renderProjectForm(
  root: HTMLElement,
  store: Store,
  index: number,
  cb: { rerender: () => void; refreshList: () => void },
  photos: (index: number) => HTMLElement,
) {
  const p = store.content.projects[index];
  const path = (k: string) => `projects.${index}.${k}`;
  const set =
    <K extends keyof Project>(k: K) =>
    (v: Project[K]) =>
      store.change((c) => (c.projects[index][k] = v));

  const heading = h('h2', {}, p.title || 'Untitled');
  const remove = () => {
    if (!confirm(`Delete "${p.title}"? Its photos stay on disk until you remove unused photos.`)) return;
    store.change((c) => c.projects.splice(index, 1));
    const left = store.content.projects.length;
    store.select(left ? { kind: 'project', index: Math.min(index, left - 1) } : { kind: 'settings' });
    cb.rerender();
  };

  const links = h(
    'div',
    {},
    ...p.links.map((l, j) =>
      h(
        'div',
        { class: 'link-row' },
        textField('Label', path(`links.${j}.label`), l.label, (v) => store.change((c) => (c.projects[index].links[j].label = v))),
        textField('Address', path(`links.${j}.href`), l.href, (v) => store.change((c) => (c.projects[index].links[j].href = v)), {
          type: 'url',
        }),
        h(
          'button',
          {
            class: 'icon',
            type: 'button',
            'aria-label': `Remove link ${j + 1}`,
            onclick: () => {
              store.change((c) => c.projects[index].links.splice(j, 1));
              cb.rerender();
            },
          },
          '✕',
        ),
      ),
    ),
    h(
      'button',
      {
        class: 'btn small',
        type: 'button',
        onclick: () => {
          store.change((c) => c.projects[index].links.push({ label: 'GitHub', href: 'https://github.com/' }));
          cb.rerender();
        },
      },
      'Add link',
    ),
  );

  root.replaceChildren(
    h(
      'div',
      { class: 'editor-head' },
      heading,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn danger', type: 'button', onclick: remove }, 'Delete project'),
    ),
    toggleField('Show on the site', path('visible'), p.visible, (v) => {
      set('visible')(v);
      cb.refreshList();
    }),
    toggleField(
      'Featured',
      path('featured'),
      p.featured === true,
      (v) => {
        // One featured project at most: featuring this one unfeatures the others.
        store.change((c) => {
          for (const q of c.projects) delete q.featured;
          if (v) c.projects[index].featured = true;
        });
        cb.refreshList();
      },
      'Gets the big tile on the site. With none featured, the first project does.',
    ),

    h('div', { class: 'section-title' }, 'Basics'),
    h(
      'div',
      { class: 'grid2' },
      textField('Title', path('title'), p.title, (v) => {
        set('title')(v);
        heading.textContent = v || 'Untitled';
        cb.refreshList();
      }),
      textField('ID', path('id'), p.id, set('id'), { hint: 'Names its photo files: a–z, 0–9 and dashes.' }),
      selectField('Kind', path('kind'), p.kind, KINDS, (v) => set('kind')(v as Project['kind'])),
      textField('Status', path('status'), p.status, set('status'), { suggestions: STATUSES, hint: 'Shipped, In progress and Prototype get a colour.' }),
    ),
    textField('Caption', path('caption'), p.caption, set('caption'), { hint: 'The short line on the closed section.' }),
    textField('Purpose', path('purpose'), p.purpose, set('purpose'), { multiline: true, hint: 'One or two sentences, shown when the section is open.' }),

    h('div', { class: 'section-title' }, 'Details'),
    tagsField('Stack', path('stack'), p.stack, set('stack')),
    h(
      'div',
      { class: 'grid2' },
      textField('Architecture', path('architecture'), p.architecture, set('architecture')),
      textField('Built in', path('duration'), p.duration, set('duration'), { hint: 'e.g. 4 months' }),
    ),
    colorsField('Glow', path('glow'), p.glow, (v) => {
      set('glow')(v);
      cb.refreshList();
    }),

    h('div', { class: 'section-title' }, 'Links'),
    links,

    h('div', { class: 'section-title' }, 'Photos'),
    photos(index),
  );
}
