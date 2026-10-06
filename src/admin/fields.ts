import type { Issue } from '../content/schema';
import { h } from './dom';

/**
 * Form controls. Each is a `.field` with `data-path` (its dot path in the content, matching
 * validation issues) and an error slot, so showIssues() can mark it.
 */

let uid = 0;
const nextId = () => `f${++uid}`;

function field(label: string, path: string, control: HTMLElement, hint?: string, forId?: string) {
  return h(
    'div',
    { class: 'field', 'data-path': path },
    forId ? h('label', { class: 'field-label', for: forId }, label) : h('span', { class: 'field-label' }, label),
    control,
    hint ? h('small', { class: 'field-hint' }, hint) : null,
    h('small', { class: 'field-error' }),
  );
}

export function textField(
  label: string,
  path: string,
  value: string,
  set: (v: string) => void,
  o: { hint?: string; multiline?: boolean; suggestions?: readonly string[]; type?: string } = {},
) {
  const id = nextId();
  const input = o.multiline ? h('textarea', { id, rows: 3 }) : h('input', { id, type: o.type ?? 'text' });
  input.value = value;
  input.addEventListener('input', () => set(input.value));
  const el = field(label, path, input, o.hint, id);
  if (o.suggestions) {
    const listId = nextId();
    input.setAttribute('list', listId);
    el.append(h('datalist', { id: listId }, ...o.suggestions.map((s) => h('option', { value: s }))));
  }
  return el;
}

export function selectField(label: string, path: string, value: string, options: readonly string[], set: (v: string) => void) {
  const id = nextId();
  const select = h('select', { id }, ...options.map((v) => h('option', { value: v, selected: v === value }, v)));
  select.addEventListener('change', () => set(select.value));
  return field(label, path, select, undefined, id);
}

export function rangeField(
  label: string,
  path: string,
  value: number,
  r: { min: number; max: number; step: number; unit?: string },
  set: (v: number) => void,
  hint?: string,
) {
  const id = nextId();
  const range = h('input', { id, type: 'range', min: r.min, max: r.max, step: r.step });
  const num = h('input', { type: 'number', min: r.min, max: r.max, step: r.step, 'aria-label': label });
  range.value = num.value = String(value);
  const sync = (from: HTMLInputElement, to: HTMLInputElement) => {
    to.value = from.value;
    const v = Number(from.value);
    if (from.value !== '' && Number.isFinite(v)) set(v);
  };
  range.addEventListener('input', () => sync(range, num));
  num.addEventListener('input', () => sync(num, range));
  const row = h('div', { class: 'range-row' }, range, num, r.unit ? h('span', { class: 'field-hint' }, r.unit) : null);
  return field(label, path, row, hint, id);
}

export function toggleField(label: string, path: string, value: boolean, set: (v: boolean) => void, hint?: string) {
  const id = nextId();
  const box = h('input', { id, type: 'checkbox', checked: value });
  box.addEventListener('change', () => set(box.checked));
  return h(
    'div',
    { class: 'field toggle', 'data-path': path },
    h('div', { class: 'row' }, box, h('label', { for: id }, label)),
    hint ? h('small', { class: 'field-hint' }, hint) : null,
    h('small', { class: 'field-error' }),
  );
}

export function colorsField(label: string, path: string, value: [string, string], set: (v: [string, string]) => void) {
  const inputs = value.map((c, i) => h('input', { type: 'color', value: c, 'aria-label': `${label} ${i + 1}` }));
  for (const input of inputs) input.addEventListener('input', () => set([inputs[0].value, inputs[1].value]));
  return field(label, path, h('div', { class: 'colors' }, ...inputs), 'The light glowing up from the section, left to right.');
}

/** Chips with an input: Enter or comma adds, × or Backspace on an empty input removes. */
export function tagsField(label: string, path: string, values: string[], set: (v: string[]) => void, hint?: string) {
  const id = nextId();
  const list = [...values];
  const input = h('input', { id, type: 'text', placeholder: 'Add, then press Enter' });
  const box = h('div', { class: 'tags' });
  const commit = () => {
    set([...list]);
    draw();
    input.focus();
  };
  const draw = () =>
    box.replaceChildren(
      ...list.map((t, i) =>
        h(
          'span',
          { class: 'tag' },
          t,
          h('button', { class: 'icon', type: 'button', 'aria-label': `Remove ${t}`, onclick: () => (list.splice(i, 1), commit()) }, '×'),
        ),
      ),
      input,
    );
  const add = () => {
    for (const t of input.value.split(',').map((s) => s.trim()).filter(Boolean)) if (!list.includes(t)) list.push(t);
    input.value = '';
    commit();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      list.pop();
      commit();
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) add();
  });
  draw();
  return field(label, path, box, hint, id);
}

/** Marks the fields under `root` that have issues, with each one's first message. */
export function showIssues(root: HTMLElement, issues: Issue[]) {
  // forEach / Array.from rather than for…of: tsconfig's lib has DOM but not DOM.Iterable.
  root.querySelectorAll('.field.invalid').forEach((el) => {
    el.classList.remove('invalid');
    el.querySelector('.field-error')!.textContent = '';
  });
  for (const issue of issues) {
    const el = root.querySelector(`[data-path="${CSS.escape(issue.path)}"]`);
    if (!el) continue;
    el.classList.add('invalid');
    const slot = el.querySelector('.field-error');
    if (slot && !slot.textContent) slot.textContent = issue.message;
  }
}
