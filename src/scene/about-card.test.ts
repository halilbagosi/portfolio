import { describe, expect, it } from 'vitest';
import type { About, Social } from '../content/schema';
import { aboutLines, cardPad, contactLinks, FIT_MAX, fitAbout, initialsOf, layoutAbout, linkAtUv, type CardInput, type Measure, type Op } from './about-card';

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

type TextOp = Extract<Op, { kind: 'text' }>;
const textOps = (ops: Op[]) => ops.filter((o): o is TextOp => o.kind === 'text');
const sizeOf = (font: string) => parseFloat(font.split(' ')[1]);
/** A text op's box: ascent above the baseline, descent below. */
const box = (o: TextOp) => ({ x0: o.x, x1: o.x + measure(o.text, o.font, o.tracking), y0: o.y - sizeOf(o.font) * 0.8, y1: o.y + sizeOf(o.font) * 0.2 });

const long = (s: string, n: number) => (s.repeat(Math.ceil(n / s.length))).slice(0, n);
/** The most the content limits allow, with a single unbroken word in the bio. */
const maxAbout = (): Partial<About> => ({
  bio: `${long('lorem ipsum dolor sit amet ', 120)}https://example.com/${'a'.repeat(110)} ${long('dolor ', 100)}`.slice(0, 360),
  years: 60,
  location: 'Llanfairpwllgwyngyll, Isle of Anglesey, United Kingdom',
  workPreference: 'Hybrid or fully remote, open to relocation within Europe',
  availability: 'Open to new roles from the first of next month',
  skills: Array.from({ length: 12 }, (_, i) => `Distributed Systems ${i + 1}`),
  email: 'firstname.lastname@very-long-company-domain.example.com',
  timeline: Array.from({ length: 4 }, (_, i) => ({
    role: `Principal Staff Software Engineer, Platform ${i}`,
    org: `The Extraordinarily Long Company Name Incorporated ${i}`,
    period: 'January 2012 – December 2024',
  })),
});
const maxInput = (): CardInput => ({
  name: 'Bartholomew Montgomery-Featherstonehaugh',
  role: 'Principal Staff Software Engineer and Technical Lead',
  about: about(maxAbout()),
  socials: [
    { label: 'GitHub Profile', text: 'x', href: 'https://github.com/you' },
    { label: 'LinkedIn Profile', text: 'x', href: 'https://linkedin.com/in/you' },
    { label: 'Personal Website', text: 'x', href: 'https://you.example.com' },
    { label: 'Mastodon', text: 'x', href: 'https://mastodon.social/@you' },
  ],
});
const minInput = (): CardInput => ({
  name: 'Al',
  role: 'Dev',
  about: about({ timeline: [], workPreference: '', resume: '', photo: '', skills: ['Go'], bio: 'Hi.' }),
  socials: [],
});
const CASES: [string, () => CardInput][] = [
  ['typical', () => input()],
  ['maximum', maxInput],
  ['minimum', minInput],
];

describe('layoutAbout', () => {
  for (const [name, make] of CASES)
    for (const [shape, [w, h]] of Object.entries(SIZES)) {
      const pad = cardPad(w, h);
      describe(`${name} content, ${shape} card`, () => {
        const { ops, links } = layoutAbout(make(), w, h, measure);

        it('keeps every line of text inside the padded card', () => {
          for (const op of textOps(ops)) {
            const b = box(op);
            expect(b.x0, op.text).toBeGreaterThanOrEqual(pad);
            expect(b.x1, op.text).toBeLessThanOrEqual(w - pad + 0.5);
            expect(b.y1, op.text).toBeLessThanOrEqual(h - pad);
          }
        });

        it('keeps pills, the portrait and the rule inside the padded card', () => {
          for (const op of ops) {
            if (op.kind === 'pill') {
              expect(op.x).toBeGreaterThanOrEqual(pad);
              expect(op.x + op.w).toBeLessThanOrEqual(w - pad + 0.5);
              expect(op.y + op.h).toBeLessThanOrEqual(h - pad);
            } else if (op.kind === 'photo') {
              expect(op.cx - op.r).toBeGreaterThanOrEqual(pad);
              expect(op.cy + op.r).toBeLessThanOrEqual(h - pad);
            } else if (op.kind === 'rule') {
              expect(op.x + op.w).toBeLessThanOrEqual(w - pad);
              expect(op.y + op.h).toBeLessThanOrEqual(h - pad);
            }
          }
        });

        it('never lets two lines of text overlap', () => {
          const boxes = textOps(ops).map((o) => ({ o, ...box(o) }));
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i];
              const b = boxes[j];
              const overlap = a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
              expect(overlap, `${a.o.text} / ${b.o.text}`).toBe(false);
            }
        });

        it('places each link inside the card, covering its text, without overlaps', () => {
          const wanted = contactLinks(make().about, make().socials);
          expect(links.map((l) => l.href)).toEqual(wanted.map((l) => l.href));
          // Each link's rect must cover the text op drawn for it (the clamp-free intent), in the same order.
          const drawn = textOps(ops).filter((o) => o.color.startsWith('#6c'));
          expect(drawn).toHaveLength(links.length);
          links.forEach((l, i) => {
            const b = box(drawn[i]);
            expect(l.x0 * w, drawn[i].text).toBeLessThanOrEqual(b.x0);
            expect(l.x1 * w, drawn[i].text).toBeGreaterThanOrEqual(b.x1);
            expect(l.y0 * h, drawn[i].text).toBeLessThanOrEqual(b.y0);
            expect(l.y1 * h, drawn[i].text).toBeGreaterThanOrEqual(b.y1);
            // The touch overhang may reach into the margin, but not past the hairline border (20px in).
            expect(l.x0 * w).toBeGreaterThanOrEqual(20);
            expect(l.y0 * h).toBeGreaterThanOrEqual(20);
            expect(l.x1 * w).toBeLessThanOrEqual(w - 20);
            expect(l.y1 * h).toBeLessThanOrEqual(h - 20);
          });
          for (let i = 0; i < links.length; i++)
            for (let j = i + 1; j < links.length; j++) {
              const a = links[i];
              const b = links[j];
              const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
              expect(overlap, `${a.href} / ${b.href}`).toBe(false);
            }
        });

        it('gives each link a finger-sized target', () => {
          // The card is shown at roughly a third of its size on a phone, so 48 layout px is ~17 css px.
          for (const l of links) expect((l.y1 - l.y0) * h, l.href).toBeGreaterThanOrEqual(44);
        });
      });
    }

  it('cuts a long bio short with an ellipsis', () => {
    const { ops } = layoutAbout(input(), ...SIZES.wide, measure);
    const bio = ops.filter((o): o is Extract<Op, { kind: 'text' }> => o.kind === 'text' && o.font.startsWith('400 21px'));
    expect(bio.length).toBeLessThanOrEqual(4);
    expect(bio.at(-1)!.text.endsWith('…')).toBe(true);
  });

  it('cuts a word wider than the column rather than drawing past it', () => {
    const [w, h] = SIZES.tall;
    const url = `https://example.com/${'a'.repeat(200)}`;
    const { ops } = layoutAbout(input({ bio: `see ${url} for more` }), w, h, measure);
    const bio = textOps(ops).filter((o) => o.font.startsWith('400 21px'));
    expect(bio.some((o) => o.text.startsWith('https://example.com/') && o.text.endsWith('…'))).toBe(true);
    for (const o of bio) expect(box(o).x1).toBeLessThanOrEqual(w - cardPad(w, h));
  });

  it('does not split an emoji when it cuts text', () => {
    const [w, h] = SIZES.tall;
    const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
    // Widths by UTF-16 length, so a cut that stopped on half a pair would fit and be kept.
    const units: Measure = (t, font) => t.length * sizeOf(font) * 0.275;
    for (let n = 30; n <= 60; n++) {
      const { ops } = layoutAbout(input({ location: '😀'.repeat(n) }), w, h, units);
      for (const o of textOps(ops)) expect(o.text, `${n} emoji`).not.toMatch(lone);
    }
  });

  it('stacks Location and Work at full width instead of cutting a long Work value', () => {
    const [w, h] = SIZES.tall;
    const work = 'Hybrid or fully remote, open to relocation';
    const { ops } = layoutAbout(input({ workPreference: work }), w, h, measure);
    const value = textOps(ops).find((o) => o.text === work);
    expect(value, 'Work value drawn whole').toBeDefined();
    expect(value!.text).not.toContain('…');
    const loc = textOps(ops).find((o) => o.text === 'City, Country')!;
    expect(value!.y).toBeGreaterThan(loc.y);
    expect(value!.x).toBe(loc.x);
  });

  it('keeps Location and Work side by side when both fit at half width', () => {
    const [w, h] = SIZES.tall;
    const { ops } = layoutAbout(input({ workPreference: 'Remote' }), w, h, measure);
    const t = textOps(ops);
    expect(t.find((o) => o.text === 'Remote')!.y).toBe(t.find((o) => o.text === 'City, Country')!.y);
  });

  it('draws one portrait', () => {
    expect(layoutAbout(input(), ...SIZES.tall, measure).ops.filter((o) => o.kind === 'photo')).toHaveLength(1);
  });
});

describe('layoutAbout bottom', () => {
  it('reports where the lowest op reaches, at most the padded card', () => {
    for (const [, make] of CASES)
      for (const [w, h] of Object.values(SIZES)) {
        const { ops, bottom } = layoutAbout(make(), w, h, measure);
        expect(bottom).toBeLessThanOrEqual(h - cardPad(w, h));
        const lowest = Math.max(
          ...ops.map((o) =>
            o.kind === 'text' ? o.y + sizeOf(o.font) * 0.2 : o.kind === 'photo' || o.kind === 'dot' ? o.cy + o.r : o.kind === 'pill' ? o.y + o.h : 0,
          ),
        );
        expect(bottom).toBeGreaterThanOrEqual(lowest);
      }
  });

  it('is larger for more content', () => {
    const [w, h] = SIZES.tall;
    expect(layoutAbout(maxInput(), w, h, measure).bottom).toBeGreaterThan(layoutAbout(minInput(), w, h, measure).bottom);
  });
});

describe('fitAbout', () => {
  for (const [name, make] of CASES)
    for (const [shape, [w, h]] of Object.entries(SIZES))
      describe(`${name} content, ${shape} card`, () => {
        const fit = fitAbout(make(), w, h, measure);
        const lay = layoutAbout(make(), fit.lw, fit.lh, measure);

        it('keeps the scale within 1..FIT_MAX and the logical size at the card aspect', () => {
          expect(fit.scale).toBeGreaterThanOrEqual(1);
          expect(fit.scale).toBeLessThanOrEqual(FIT_MAX);
          expect(fit.lw * fit.scale).toBeCloseTo(w, 6);
          expect(fit.lh * fit.scale).toBeCloseTo(h, 6);
        });

        it('fits its content inside the padded card at that scale', () => {
          expect(lay.bottom).toBeLessThanOrEqual(fit.lh - cardPad(fit.lw, fit.lh));
          expect(fit.ops).toEqual(lay.ops);
          expect(fit.links).toEqual(lay.links);
        });

        it('stops at the largest scale that fits', () => {
          if (fit.scale >= FIT_MAX - 1e-9) return;
          const next = fit.scale + 0.05;
          const l = layoutAbout(make(), w / next, h / next, measure);
          expect(l.bottom).toBeGreaterThan(h / next - cardPad(w / next, h / next));
        });

        it('draws the same ops as layoutAbout when it picks scale 1', () => {
          if (fit.scale !== 1) return;
          expect(fit.ops).toEqual(layoutAbout(make(), w, h, measure).ops);
        });
      });

  it('scales a tall card with little content up', () => {
    const [w, h] = SIZES.tall;
    const fit = fitAbout(minInput(), w, h, measure);
    expect(fit.scale).toBeGreaterThan(1);
    expect(layoutAbout(minInput(), fit.lw, fit.lh, measure).bottom).toBeLessThanOrEqual(fit.lh - cardPad(fit.lw, fit.lh));
  });

  it('falls back to scale 1 when nothing fits', () => {
    const [w, h] = SIZES.tall;
    const fit = fitAbout(maxInput(), w, h / 3, measure);
    expect(fit.scale).toBe(1);
    expect(fit.ops).toEqual(layoutAbout(maxInput(), w, h / 3, measure).ops);
  });

  it('keeps link rects as fractions of the card', () => {
    const [w, h] = SIZES.tall;
    const fit = fitAbout(minInput(), w, h, measure);
    for (const l of fit.links) for (const v of [l.x0, l.y0, l.x1, l.y1]) expect(v).toBeGreaterThan(0), expect(v).toBeLessThan(1);
  });
});

describe('linkAtUv', () => {
  // A card link near the top-left (y down): uv.y runs bottom-up, so it sits at a high v.
  const links = [{ href: 'https://a.example', x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.2 }];

  it('finds the link at the same spot read top-down, flipping uv.y', () => {
    expect(linkAtUv(links, 0.2, 0.85)).toBe('https://a.example');
  });

  it('does not find it at the mirrored spot', () => {
    expect(linkAtUv(links, 0.2, 0.15)).toBeNull();
  });
});
