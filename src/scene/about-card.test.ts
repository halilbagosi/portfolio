import { describe, expect, it } from 'vitest';
import type { About, Social } from '../content/schema';
import { aboutLines, contactLinks, initialsOf, layoutAbout, type CardInput, type Measure, type Op } from './about-card';

/** Fake text widths: 0.55 em per character, plus tracking between characters. */
const measure: Measure = (t, font, tracking = 0) => [...t].length * parseFloat(font.split(' ')[1]) * 0.55 + tracking * Math.max(0, [...t].length - 1);

const about = (o: Partial<About> = {}): About => ({
  photo: '',
  bio: 'lorem ipsum dolor sit amet '.repeat(13).trim(),
  years: 7,
  location: 'City, Country',
  workPreference: 'Remote · open to relocation',
  available: true,
  availability: 'Open to new roles',
  skills: Array.from({ length: 12 }, (_, i) => `Skill ${i + 1}`),
  email: 'you@example.com',
  resume: 'https://example.com/cv.pdf',
  timeline: Array.from({ length: 4 }, (_, i) => ({ role: `Role ${i}`, org: `Company ${i}`, period: '20XX–20XX' })),
  ...o,
});
const socials: Social[] = [
  { label: 'GitHub', text: 'github.com/you', href: 'https://github.com/you' },
  { label: 'LinkedIn', text: 'linkedin.com/in/you', href: 'https://linkedin.com/in/you' },
  { label: 'Email', text: 'you@example.com', href: 'mailto:you@example.com' },
];
const input = (o: Partial<About> = {}): CardInput => ({ name: 'Halil Bagosi', role: 'Software Engineer', about: about(o), socials });
const SIZES = { wide: [1395, 933], tall: [933, 1615] } as const;

describe('contactLinks', () => {
  it('lists email, résumé, then socials without repeating the email', () => {
    expect(contactLinks(about(), socials).map((l) => l.href)).toEqual([
      'mailto:you@example.com',
      'https://example.com/cv.pdf',
      'https://github.com/you',
      'https://linkedin.com/in/you',
    ]);
  });

  it('leaves out the résumé when there is none', () => {
    expect(contactLinks(about({ resume: '' }), []).map((l) => l.label)).toEqual(['you@example.com']);
  });
});

describe('aboutLines and initials', () => {
  it('turns the About into plain sentences', () => {
    const lines = aboutLines(about({ timeline: [{ role: 'Engineer', org: 'Acme', period: '2020–now' }] }));
    expect(lines).toContain('7+ years of experience.');
    expect(lines).toContain('Based in City, Country · Remote · open to relocation.');
    expect(lines.at(-1)).toBe('Engineer, Acme, 2020–now.');
  });

  it('takes up to two initials', () => {
    expect(initialsOf('Halil Bagosi')).toBe('HB');
    expect(initialsOf('Ada  King Lovelace')).toBe('AK');
  });
});

describe('layoutAbout', () => {
  for (const [shape, [w, h]] of Object.entries(SIZES)) {
    it(`keeps every line of text inside the card (${shape})`, () => {
      const { ops } = layoutAbout(input(), w, h, measure);
      for (const op of ops) {
        if (op.kind !== 'text') continue;
        expect(op.x, op.text).toBeGreaterThanOrEqual(0);
        expect(op.x + measure(op.text, op.font, op.tracking), op.text).toBeLessThanOrEqual(w + 0.5);
        expect(op.y, op.text).toBeLessThanOrEqual(h);
      }
    });

    it(`places each link inside the card without overlaps (${shape})`, () => {
      const { links } = layoutAbout(input(), w, h, measure);
      expect(links.map((l) => l.href)).toEqual(contactLinks(about(), socials).map((l) => l.href));
      for (const l of links) {
        expect(l.x0).toBeGreaterThanOrEqual(0);
        expect(l.y0).toBeGreaterThanOrEqual(0);
        expect(l.x1).toBeLessThanOrEqual(1);
        expect(l.y1).toBeLessThanOrEqual(1);
      }
      for (let i = 0; i < links.length; i++)
        for (let j = i + 1; j < links.length; j++) {
          const a = links[i];
          const b = links[j];
          const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
          expect(overlap, `${a.href} / ${b.href}`).toBe(false);
        }
    });
  }

  it('cuts a long bio short with an ellipsis', () => {
    const { ops } = layoutAbout(input(), ...SIZES.wide, measure);
    const bio = ops.filter((o): o is Extract<Op, { kind: 'text' }> => o.kind === 'text' && o.font.startsWith('400 21px'));
    expect(bio.length).toBeLessThanOrEqual(4);
    expect(bio.at(-1)!.text.endsWith('…')).toBe(true);
  });

  it('draws one portrait', () => {
    expect(layoutAbout(input(), ...SIZES.tall, measure).ops.filter((o) => o.kind === 'photo')).toHaveLength(1);
  });
});
