import { describe, expect, it } from 'vitest';
import { loadContent } from '../config/projects';
import { validate } from './schema';
import { validContent } from './test-fixture';

describe('Albanian content', () => {
  it('shows the English when nothing is translated, with built-in Albanian hints and headings', () => {
    const c = validContent();
    const { settings, projects } = loadContent(c, '/', 'sq');
    expect(projects[0].title).toBe(c.projects[0].title);
    expect(settings.about.bio).toBe(c.settings.about.bio);
    expect(settings.hints.open.desktop).toBe('Kliko për ta hapur');
    expect(settings.card.headings.about).toBe('Rreth meje');
    expect(projects[0].kindLabel).not.toBe(projects[0].kind);
  });

  it('uses the entered Albanian, and keeps the English status for its colour', () => {
    const c = validContent();
    c.projects[0].sq = { caption: 'Një rresht', status: 'Në progres' };
    c.settings.sq = { bio: 'Ndërton motorë analitikë.', hints: { open: { desktop: 'Hap' } } };
    c.settings.about.timeline[0].sq = { role: 'Inxhinier softueri' };
    const { settings, projects } = loadContent(c, '/', 'sq');
    expect(projects[0].caption).toBe('Një rresht');
    expect(projects[0].statusLabel).toBe('Në progres');
    expect(projects[0].status).toBe(c.projects[0].status);
    expect(settings.about.bio).toBe('Ndërton motorë analitikë.');
    expect(settings.hints.open).toEqual({ desktop: 'Hap', touch: 'Prek për ta hapur' });
    expect(settings.about.timeline[0].role).toBe('Inxhinier softueri');
  });

  it('leaves English untouched', () => {
    const c = validContent();
    c.projects[0].sq = { caption: 'Një rresht' };
    expect(loadContent(c, '/', 'en').projects[0].caption).toBe(c.projects[0].caption);
  });

  it('rejects Albanian text that is not text', () => {
    const c = validContent();
    (c.projects[0] as unknown as { sq: unknown }).sq = { caption: 5 };
    expect(validate(c).some((i) => i.path === 'projects.0.sq.caption')).toBe(true);
  });
});
