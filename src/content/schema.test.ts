import { describe, expect, it } from 'vitest';
import { formatIssue, MAX_PROJECTS, validate, type SiteContent } from './schema';
import site from './site.json';
import { validContent } from './test-fixture';

/** Issues after applying one change to a valid fixture. */
function issuesAfter(change: (c: SiteContent) => void) {
  const c = validContent();
  change(c);
  return validate(c);
}

function expectIssue(change: (c: SiteContent) => void, path: string, text: string) {
  const issues = issuesAfter(change);
  const hit = issues.find((i) => i.path === path);
  expect(hit, `expected an issue at ${path}, got ${JSON.stringify(issues)}`).toBeDefined();
  expect(hit!.message).toContain(text);
}

describe('validate', () => {
  it('accepts valid content', () => {
    expect(validate(validContent())).toEqual([]);
  });

  it('accepts the real site.json', () => {
    expect(validate(site)).toEqual([]);
  });

  it('rejects non-objects', () => {
    expect(validate(null).length).toBeGreaterThan(0);
    expect(validate([]).length).toBeGreaterThan(0);
  });

  it('requires identity fields', () => {
    expectIssue((c) => (c.settings.identity.name = ' '), 'settings.identity.name', 'required');
  });

  it('requires every hint', () => {
    expectIssue((c) => (c.settings.hints.section.touch = ''), 'settings.hints.section.touch', 'required');
    expectIssue((c) => (c.settings.hints.begin.touch = ''), 'settings.hints.begin.touch', 'required');
  });

  it('keeps motion values in range', () => {
    expectIssue((c) => (c.settings.motion.photoDwell = 0.2), 'settings.motion.photoDwell', 'between 0.5 and 10');
    expectIssue((c) => (c.settings.motion.gyroDegrees = 90), 'settings.motion.gyroDegrees', 'between 5 and 45');
    expectIssue((c) => (c.settings.motion.parallax = -1), 'settings.motion.parallax', 'between 0 and 2');
  });

  it('requires motion switches to be booleans', () => {
    expectIssue((c) => ((c.settings.motion as unknown as Record<string, unknown>).lidKnock = 'yes'), 'settings.motion.lidKnock', 'on or off');
  });

  it('requires project text fields', () => {
    expectIssue((c) => (c.projects[0].title = ''), 'projects.0.title', 'required');
    expectIssue((c) => (c.projects[1].duration = '  '), 'projects.1.duration', 'required');
  });

  it('names the project in the issue', () => {
    const issue = issuesAfter((c) => (c.projects[0].caption = '')).find((i) => i.path === 'projects.0.caption')!;
    expect(issue.project).toBe('Alpha');
    expect(formatIssue(issue)).toBe('Alpha: caption is required.');
  });

  it('checks ids: format and uniqueness', () => {
    expectIssue((c) => (c.projects[0].id = 'Has Space'), 'projects.0.id', 'a–z');
    expectIssue((c) => (c.projects[1].id = 'alpha'), 'projects.1.id', 'used twice');
  });

  it('checks the kind', () => {
    expectIssue((c) => ((c.projects[0] as unknown as Record<string, unknown>).kind = 'Game'), 'projects.0.kind', 'one of');
  });

  it('checks glow colours', () => {
    expectIssue((c) => (c.projects[0].glow = ['#123', '#445566']), 'projects.0.glow', '#rrggbb');
  });

  it('checks links', () => {
    expectIssue((c) => (c.projects[0].links[0].href = 'github.com/x'), 'projects.0.links.0.href', 'http');
    expectIssue((c) => (c.projects[0].links[0].label = ''), 'projects.0.links.0.label', 'required');
  });

  it('checks stack entries', () => {
    expectIssue((c) => (c.projects[0].stack = ['Swift', '']), 'projects.0.stack', 'empty');
  });

  it('checks photo paths, including traversal', () => {
    expectIssue((c) => (c.projects[0].images = ['/elsewhere/a.jpg']), 'projects.0.images', '/shots/');
    expectIssue((c) => (c.projects[0].images = ['/shots/../x.jpg']), 'projects.0.images', '/shots/');
  });

  it('needs a photo for visible projects only', () => {
    expectIssue((c) => (c.projects[0].images = []), 'projects.0.images', 'at least one photo');
    expect(
      issuesAfter((c) => {
        c.projects[0].images = [];
        c.projects[0].visible = false;
      }),
    ).toEqual([]);
  });

  it('needs at least one visible project', () => {
    expectIssue((c) => c.projects.forEach((p) => (p.visible = false)), 'projects', 'At least one');
  });

  it(`allows at most ${MAX_PROJECTS} visible projects`, () => {
    expectIssue(
      (c) => {
        const base = c.projects[0];
        c.projects = Array.from({ length: MAX_PROJECTS + 1 }, (_, i) => ({ ...base, id: `p${i}` }));
      },
      'projects',
      `At most ${MAX_PROJECTS}`,
    );
  });
});
