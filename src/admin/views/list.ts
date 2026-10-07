import { h } from '../dom';
import { moveItem, newProject, type Store } from '../state';

/** Projects in display order (drag to reorder), visibility toggles, add, and the About and Settings entries. */
export function renderList(root: HTMLElement, store: Store, rerender: () => void) {
  const { projects } = store.content;
  const tab = store.tab;
  let dragFrom = -1;

  const items = projects.map((p, i) => {
    const active = tab.kind === 'project' && tab.index === i;
    const el = h(
      'div',
      {
        class: `item${active ? ' active' : ''}${p.visible ? '' : ' hidden-project'}`,
        draggable: true,
        title: p.visible ? '' : 'Hidden: not shown on the site',
        onclick: () => {
          store.select({ kind: 'project', index: i });
          rerender();
        },
      },
      h('span', { class: 'swatch', style: `background: linear-gradient(135deg, ${p.glow[0]}, ${p.glow[1]})` }),
      h('span', { class: 'item-title' }, p.title || 'Untitled'),
      p.featured ? h('span', { class: 'featured-mark', title: 'Featured: gets the big tile' }, '★') : null,
      h(
        'button',
        {
          class: 'icon',
          type: 'button',
          title: p.visible ? 'Shown on the site — click to hide' : 'Hidden — click to show on the site',
          'aria-label': p.visible ? `Hide ${p.title}` : `Show ${p.title}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            store.change((c) => (c.projects[i].visible = !c.projects[i].visible));
            rerender();
          },
        },
        p.visible ? '●' : '○',
      ),
    );
    const after = (e: DragEvent) => {
      const r = el.getBoundingClientRect();
      return e.clientY > r.top + r.height / 2;
    };
    el.addEventListener('dragstart', (e) => {
      dragFrom = i;
      e.dataTransfer!.effectAllowed = 'move';
    });
    el.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      el.classList.toggle('drop-before', !after(e));
      el.classList.toggle('drop-after', after(e));
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom < 0) return;
      let to = i + (after(e) ? 1 : 0);
      if (dragFrom < to) to--;
      // Keep the same project selected wherever it ends up.
      const selected = store.tab.kind === 'project' ? store.content.projects[store.tab.index] : null;
      store.change((c) => moveItem(c.projects, dragFrom, to));
      if (selected) store.select({ kind: 'project', index: store.content.projects.indexOf(selected) });
      dragFrom = -1;
      rerender();
    });
    el.addEventListener('dragend', () => (dragFrom = -1));
    return el;
  });

  const add = h(
    'button',
    {
      class: 'icon',
      type: 'button',
      title: 'Add a project',
      'aria-label': 'Add a project',
      onclick: () => {
        store.change((c) => c.projects.push(newProject(c.projects.map((p) => p.id))));
        store.select({ kind: 'project', index: store.content.projects.length - 1 });
        rerender();
      },
    },
    '+',
  );

  const about = h(
    'div',
    {
      class: `item about-item${tab.kind === 'about' ? ' active' : ''}`,
      onclick: () => {
        store.select({ kind: 'about' });
        rerender();
      },
    },
    h('span', { class: 'item-title' }, 'About & socials'),
  );

  const settings = h(
    'div',
    {
      class: `item settings-item${tab.kind === 'settings' ? ' active' : ''}`,
      onclick: () => {
        store.select({ kind: 'settings' });
        rerender();
      },
    },
    h('span', { class: 'item-title' }, 'Settings'),
  );

  root.replaceChildren(h('div', { class: 'side-head' }, h('span', {}, 'Projects'), add), ...items, about, settings);
}
