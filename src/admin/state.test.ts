import { describe, expect, it } from 'vitest';
import { validContent } from '../content/test-fixture';
import { validate } from '../content/schema';
import { moveItem, newProject, Store } from './state';

describe('Store', () => {
  it('is clean until something changes, and clean again once saved', () => {
    const s = new Store(validContent());
    expect(s.dirty).toBe(false);
    s.change((c) => (c.projects[0].title = 'Changed'));
    expect(s.dirty).toBe(true);
    s.markSaved();
    expect(s.dirty).toBe(false);
  });

  it('is clean again when a change is undone by hand', () => {
    const s = new Store(validContent());
    s.change((c) => (c.projects[0].title = 'X'));
    s.change((c) => (c.projects[0].title = 'Alpha'));
    expect(s.dirty).toBe(false);
  });

  it('notifies listeners on change and selection', () => {
    const s = new Store(validContent());
    let calls = 0;
    s.onChange(() => calls++);
    s.change(() => {});
    s.select({ kind: 'settings' });
    expect(calls).toBe(2);
  });

  it('reset replaces content and keeps the selection in range', () => {
    const s = new Store(validContent());
    s.select({ kind: 'project', index: 1 });
    const fewer = validContent();
    fewer.projects.pop();
    s.reset(fewer);
    expect(s.tab).toEqual({ kind: 'project', index: 0 });
    expect(s.dirty).toBe(false);
  });

  it('can select the About tab', () => {
    const s = new Store(validContent());
    s.select({ kind: 'about' });
    expect(s.tab).toEqual({ kind: 'about' });
  });

  it('starts on settings when there are no projects', () => {
    const c = validContent();
    c.projects = [];
    expect(new Store(c).tab).toEqual({ kind: 'settings' });
  });
});

describe('newProject', () => {
  it('makes a unique, hidden draft that only lacks photos', () => {
    const p = newProject(['new-project', 'new-project-2']);
    expect(p.id).toBe('new-project-3');
    expect(p.visible).toBe(false);
    const c = validContent();
    c.projects.push(p);
    expect(validate(c)).toEqual([]);
  });
});

describe('moveItem', () => {
  it('moves an element to a new index', () => {
    const list = ['a', 'b', 'c', 'd'];
    moveItem(list, 0, 2);
    expect(list).toEqual(['b', 'c', 'a', 'd']);
    moveItem(list, 3, 0);
    expect(list).toEqual(['d', 'b', 'c', 'a']);
  });
});
