import type { Project, SiteContent } from '../content/schema';

export type Tab = { kind: 'project'; index: number } | { kind: 'settings' };

const snapshot = (c: SiteContent) => JSON.stringify(c);

/**
 * The dashboard's staged content. Edits change it in place; nothing reaches the disk until Save.
 * "Dirty" compares against the last saved snapshot, so undoing an edit by hand counts as clean.
 */
export class Store {
  content: SiteContent;
  tab: Tab;
  private saved: string;
  private listeners = new Set<() => void>();

  constructor(content: SiteContent) {
    this.content = content;
    this.saved = snapshot(content);
    this.tab = content.projects.length ? { kind: 'project', index: 0 } : { kind: 'settings' };
  }

  get dirty() {
    return snapshot(this.content) !== this.saved;
  }

  change(fn: (c: SiteContent) => void) {
    fn(this.content);
    this.emit();
  }

  select(tab: Tab) {
    this.tab = tab;
    this.emit();
  }

  markSaved() {
    this.saved = snapshot(this.content);
    this.emit();
  }

  /** Replace everything (e.g. discard: reload from disk). */
  reset(content: SiteContent) {
    this.content = content;
    this.saved = snapshot(content);
    if (this.tab.kind === 'project' && this.tab.index >= content.projects.length)
      this.tab = content.projects.length ? { kind: 'project', index: 0 } : { kind: 'settings' };
    this.emit();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

/** A hidden draft with a unique id; valid except that it has no photos yet (fine while hidden). */
export function newProject(existingIds: string[]): Project {
  let id = 'new-project';
  for (let n = 2; existingIds.includes(id); n++) id = `new-project-${n}`;
  return {
    id,
    visible: false,
    title: 'New project',
    kind: 'iOS app',
    caption: 'One line about it',
    purpose: 'What it does, and for whom.',
    stack: [],
    architecture: 'How it is built',
    duration: '1 month',
    status: 'In progress',
    links: [],
    glow: ['#2fc8ff', '#5a5bff'],
    images: [],
  };
}

export function moveItem<T>(list: T[], from: number, to: number) {
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}
