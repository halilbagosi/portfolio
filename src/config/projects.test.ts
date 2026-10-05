import { describe, expect, it } from 'vitest';
import { validContent } from '../content/test-fixture';
import { loadContent, projects, settings } from './projects';

describe('loadContent', () => {
  it('keeps visible projects in order and drops hidden ones', () => {
    const c = validContent();
    c.projects[0].visible = false;
    expect(loadContent(c).projects.map((p) => p.id)).toEqual(['beta']);
  });

  it('throws with every problem listed', () => {
    const c = validContent();
    c.projects[0].title = '';
    c.settings.motion.parallax = 9;
    // Settings are checked before projects, so their issues come first.
    expect(() => loadContent(c)).toThrow(/site\.json is invalid[\s\S]*between 0 and 2[\s\S]*title is required/);
  });

  it('loads the real content', () => {
    expect(projects.length).toBeGreaterThan(0);
    expect(settings.identity.name.length).toBeGreaterThan(0);
  });
});
