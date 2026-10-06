import { formatIssue, siteOrder, validate } from '../content/schema';
import { api, ApiError } from './api';
import { h } from './dom';
import { showIssues } from './fields';
import { Store } from './state';
import { cleanUnusedPhotos } from './views/housekeeping';
import { renderList } from './views/list';
import { photoStrip } from './views/photo-strip';
import { Preview } from './views/preview';
import { renderProjectForm } from './views/project-form';
import { renderSettings } from './views/settings';

/**
 * The content dashboard (dev only, /admin). Edits are staged in a Store; Save validates and writes
 * src/content/site.json through the dev server, which reloads the site (and the preview).
 */

const app = document.getElementById('app')!;
const status = h('span', { class: 'status', role: 'status' });
const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => void save() }, 'Save');
const discardBtn = h('button', { class: 'btn', type: 'button', onclick: () => void discard() }, 'Discard changes');
const side = h('nav', { class: 'side', 'aria-label': 'Projects' });
const issuesBox = h('div', { class: 'issues' });
const form = h('div');
const editor = h('main', { class: 'editor' }, issuesBox, form);
const preview = new Preview();
const toastEl = h('div', { class: 'toast' });
let store: Store;
/** Problems the server reported on the last save (e.g. a missing photo file). */
let serverErrors: string[] = [];

function render() {
  renderList(side, store, render);
  const t = store.tab;
  if (t.kind === 'project' && store.content.projects[t.index])
    renderProjectForm(form, store, t.index, { rerender: render, refreshList: () => renderList(side, store, render) }, (i) => photoStrip(store, i));
  else renderSettings(form, store);
  refresh();
  preview.show(previewHash());
}

/** The site opened on the edited project (visible ones only); otherwise the open box. */
function previewHash() {
  const t = store.tab;
  if (t.kind !== 'project') return '#open';
  const p = store.content.projects[t.index];
  if (!p?.visible) return '#open';
  return `#open-${siteOrder(store.content.projects).indexOf(p)}`;
}

/** Status line, problem list, field marks and button states, after any change. */
function refresh() {
  const issues = validate(store.content);
  showIssues(form, issues);
  const messages = [...serverErrors, ...issues.map(formatIssue)];
  issuesBox.replaceChildren(
    ...(messages.length
      ? [h('strong', {}, `${messages.length} problem${messages.length > 1 ? 's' : ''} to fix before saving`), h('ul', {}, ...messages.map((m) => h('li', {}, m)))]
      : []),
  );
  saveBtn.disabled = !store.dirty || issues.length > 0;
  discardBtn.disabled = !store.dirty;
  status.textContent = issues.length ? 'Fix the problems to save' : store.dirty ? 'Unsaved changes' : 'All changes saved';
  status.className = `status${issues.length ? ' bad' : store.dirty ? ' dirty' : ''}`;
}

async function save() {
  if (!store.dirty || validate(store.content).length) return refresh();
  saveBtn.disabled = true;
  status.textContent = 'Saving…';
  try {
    await api.save(store.content);
    serverErrors = [];
    store.markSaved();
    preview.show(previewHash(), true);
    toast('Saved — the site is updated');
  } catch (e) {
    serverErrors = e instanceof ApiError ? e.errors : [String(e)];
    refresh();
  }
}

async function discard() {
  if (!confirm('Discard all unsaved changes?')) return;
  store.reset(await api.load());
  serverErrors = [];
  render();
}

let toastTimer = 0;
function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2400);
}

async function boot() {
  try {
    store = new Store(await api.load());
  } catch (e) {
    app.replaceChildren(h('p', { class: 'boot' }, `Couldn't load the content (${e instanceof Error ? e.message : e}). Is the dev server running?`));
    return;
  }
  store.onChange(refresh);
  const unused = h('button', { class: 'btn', type: 'button', onclick: () => void cleanUnusedPhotos(store, toast) }, 'Unused photos…');
  const top = h('header', { class: 'top' }, h('h1', {}, 'Portfolio dashboard'), status, h('span', { class: 'spacer' }), unused, discardBtn, saveBtn);
  app.replaceChildren(h('div', { class: 'app' }, top, side, editor, preview.el), toastEl);
  render();
}

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    void save();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (store?.dirty) e.preventDefault();
});

void boot();
