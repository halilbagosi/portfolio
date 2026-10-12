import { api } from '../api';
import { h } from '../dom';
import { processPhoto } from '../photos';
import { moveItem, type Store } from '../state';

/**
 * A project's photos: add (drop files or click), reorder (drag, or the arrows; first = top of the
 * stack, the order the site deals them in), replace, remove. Uploads are resized in the browser and written to public/shots right away;
 * the project only refers to them once saved. Removing never deletes the file.
 */
export function photoStrip(store: Store, index: number): HTMLElement {
  // Hold the project itself, not its index: uploads finish later, maybe after a reorder.
  const project = store.content.projects[index];
  const strip = h('div', { class: 'photos' });
  const messages = h('div', { class: 'messages' });
  let dragFrom = -1;

  const note = (text: string, kind: 'info' | 'warn' | 'error') => {
    const line = h('div', { class: `msg ${kind}` }, text);
    messages.append(line);
    return line;
  };

  async function upload(files: File[], replaceAt = -1) {
    for (const file of files) {
      const line = note(`Adding ${file.name}…`, 'info');
      try {
        const out = await processPhoto(file);
        const { path } = await api.uploadPhoto(project.id, out.blob);
        const at = replaceAt;
        store.change(() => (at >= 0 ? (project.images[at] = path) : project.images.push(path)));
        replaceAt = -1; // only the first file replaces; any others are added
        if (out.warning) {
          line.className = 'msg warn';
          line.textContent = `${file.name}: ${out.warning}`;
        } else line.remove();
        draw();
      } catch (e) {
        line.className = 'msg error';
        line.textContent = `${file.name}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  // One file input, kept in the page: Safari opens the picker for a detached input but never
  // fires its change event, so the chosen files would be silently dropped.
  let pickReplaceAt = -1;
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = ''; // so choosing the same file again still counts as a change
    void upload(files, pickReplaceAt);
  });

  function pick(multiple: boolean, replaceAt = -1) {
    input.multiple = multiple;
    pickReplaceAt = replaceAt;
    input.click();
  }

  const dropzone = h('div', { class: 'dropzone', role: 'button', tabindex: 0, onclick: () => pick(true) }, 'Drop photos here, or click to add');
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(true);
    }
  });
  dropzone.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dropzone.classList.add('over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('over');
    void upload(Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/')));
  });

  /** A card's place in the strip, read when it is used: cards are kept across redraws and move around. */
  const indexOf = (card: HTMLElement) => Array.prototype.indexOf.call(strip.children, card) as number;

  /** Reorders the stack (first = top, the order it deals in). */
  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= project.images.length) return;
    store.change(() => moveItem(project.images, from, to));
    draw();
  }

  function makeCard(src: string) {
    const btn = (label: string, text: string, onclick: () => void, cls = 'icon') =>
      h('button', { class: cls, type: 'button', title: label, 'aria-label': label, onclick }, text);
    const at = () => indexOf(card);
    const first = btn('Make it the first photo', '⤒', () => move(at(), 0));
    const left = btn('Move earlier', '←', () => move(at(), at() - 1));
    const right = btn('Move later', '→', () => move(at(), at() + 1));
    const badge = h('span', { class: 'badge' });
    const card: HTMLElement = h(
      'div',
      { class: 'photo', draggable: true },
      h('img', { src, alt: '', draggable: false }),
      badge,
      h(
        'div',
        { class: 'photo-bar' },
        first,
        left,
        right,
        h('span', { class: 'spacer' }),
        btn('Replace', '⟳', () => pick(false, at())),
        btn('Remove from this project (the file stays until you remove unused photos)', '✕', () => {
          store.change(() => project.images.splice(at(), 1));
          draw();
        }),
      ),
    );
    /** Number, badge and the buttons that apply, for where the card now sits. */
    const label = (i: number, n: number) => {
      badge.textContent = i === 0 ? 'Top' : String(i + 1);
      badge.classList.toggle('top', i === 0);
      (card.querySelector('img') as HTMLImageElement).alt = `Photo ${i + 1}`;
      first.disabled = left.disabled = i === 0;
      right.disabled = i === n - 1;
    };
    card.addEventListener('dragstart', (e) => {
      dragFrom = at();
      e.dataTransfer!.effectAllowed = 'move';
    });
    card.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      card.classList.add('drop-target');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drop-target');
      const to = at();
      if (dragFrom >= 0) move(dragFrom, to);
      dragFrom = -1;
    });
    card.addEventListener('dragend', () => (dragFrom = -1));
    return { card, label };
  }

  /** Cards by photo, kept across redraws so a change never rebuilds (and reloads) the whole strip. */
  let cards: { src: string; card: HTMLElement; label: (i: number, n: number) => void }[] = [];

  /**
   * Brings the strip in line with the project's photos, moving only what changed. The strip never
   * empties on the way, and the editor's scroll and the focused button are kept, so adding, moving or
   * removing a photo leaves the page where it was.
   */
  function draw() {
    const scroller = strip.closest<HTMLElement>('.editor');
    const top = scroller?.scrollTop ?? 0;
    const pageTop = document.scrollingElement?.scrollTop ?? 0;
    const active = document.activeElement as HTMLElement | null;
    const pool = cards;
    cards = project.images.map((src) => {
      const k = pool.findIndex((c) => c.src === src);
      return k >= 0 ? pool.splice(k, 1)[0] : { src, ...makeCard(src) };
    });
    for (const c of pool) c.card.remove();
    cards.forEach((c, i) => {
      if (strip.children[i] !== c.card) strip.insertBefore(c.card, strip.children[i] ?? null);
      c.label(i, cards.length);
    });
    if (dropzone.parentNode !== strip || strip.lastElementChild !== dropzone) strip.append(dropzone);
    if (active && active !== document.activeElement && strip.contains(active) && !(active as HTMLButtonElement).disabled)
      active.focus({ preventScroll: true });
    if (scroller) scroller.scrollTop = top;
    if (document.scrollingElement) document.scrollingElement.scrollTop = pageTop;
  }

  draw();
  // The field wrapper lets validation ("needs at least one photo") mark the strip.
  return h('div', { class: 'field', 'data-path': `projects.${index}.images` }, strip, h('small', { class: 'field-error' }), messages, input);
}
