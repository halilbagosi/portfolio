import { describe, expect, it } from 'vitest';
import { loadContent } from '../config/projects';
import { validate } from './schema';
import { validContent } from './test-fixture';

describe('Hidden fields', () => {
  it('shows a hidden field as empty, in both languages, and keeps its text in the content', () => {
    const c = validContent();
    c.projects[0].hidden = ['architecture', 'stack', 'links', 'kind', 'status'];
    c.projects[0].sq = { architecture: 'Arkitektura' };
    c.settings.about.hidden = ['bio', 'skills'];
    c.settings.identity.hidden = ['role'];
    c.settings.about.timeline[0].hidden = ['org'];
    for (const lang of ['en', 'sq'] as const) {
      const { settings, projects } = loadContent(c, '/', lang);
      expect(projects[0].architecture).toBe('');
      expect(projects[0].stack).toEqual([]);
      expect(projects[0].links).toEqual([]);
      expect(projects[0].kindLabel).toBe('');
      expect(projects[0].statusLabel).toBe('');
      expect(settings.about.bio).toBe('');
      expect(settings.about.skills).toEqual([]);
      expect(settings.identity.role).toBe('');
      expect(settings.about.timeline[0].org).toBe('');
      expect(settings.about.timeline[0].role).toBe(c.settings.about.timeline[0].role);
    }
    expect(c.projects[0].architecture).not.toBe('');
  });

  it('lets a hidden required field be empty', () => {
    const c = validContent();
    c.projects[0].architecture = '';
    c.settings.about.bio = '';
    c.settings.about.email = '';
    c.settings.about.skills = [];
    expect(validate(c).map((i) => i.path)).toEqual(
      expect.arrayContaining(['projects.0.architecture', 'settings.about.bio', 'settings.about.email', 'settings.about.skills']),
    );
    c.projects[0].hidden = ['architecture'];
    c.settings.about.hidden = ['bio', 'email', 'skills'];
    expect(validate(c)).toEqual([]);
  });

  it('rejects hiding a field that cannot be hidden', () => {
    const c = validContent();
    (c.projects[0] as unknown as { hidden: string[] }).hidden = ['title'];
    expect(validate(c).some((i) => i.path === 'projects.0.hidden')).toBe(true);
  });
});
