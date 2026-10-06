import { api } from '../api';
import { h } from '../dom';
import { processPhoto } from '../photos';
import { moveItem, type Store } from '../state';

/**
 * A project's photos: add (drop files or click), drag to reorder (first = top of the stack),
 * replace, remove. Uploads are resized in the browser and written to public/shots right away;
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

  function draw() {
    strip.replaceChildren(
      ...project.images.map((src, i) => {
        const card = h(
          'div',
          { class: 'photo', draggable: true },
          h('img', { src, alt: `Photo ${i + 1}`, loading: 'lazy' }),
          i === 0 ? h('span', { class: 'badge' }, 'Top') : null,
          h(
            'div',
            { class: 'photo-bar' },
            h('button', { class: 'icon', type: 'button', title: 'Replace', 'aria-label': `Replace photo ${i + 1}`, onclick: () => pick(false, i) }, '⟳'),
            h(
              'button',
              {
                class: 'icon',
                type: 'button',
                title: 'Remove from this project (the file stays until you remove unused photos)',
                'aria-label': `Remove photo ${i + 1}`,
                onclick: () => {
                  store.change(() => project.images.splice(i, 1));
                  draw();
                },
              },
              '✕',
            ),
          ),
        );
        card.addEventListener('dragstart', (e) => {
          dragFrom = i;
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
          if (dragFrom >= 0 && dragFrom !== i) store.change(() => moveItem(project.images, dragFrom, i));
          dragFrom = -1;
          draw();
        });
        card.addEventListener('dragend', () => (dragFrom = -1));
        return card;
      }),
      dropzone,
    );
  }

  draw();
  // The field wrapper lets validation ("needs at least one photo") mark the strip.
  return h('div', { class: 'field', 'data-path': `projects.${index}.images` }, strip, h('small', { class: 'field-error' }), messages, input);
}
