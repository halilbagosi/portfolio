import { describe, expect, it } from 'vitest';
import { MAX_ACHIEVEMENTS, MAX_TIMELINE, type About, type Social } from '../content/schema';
import { aboutLines, cardPad, contactLinks, cutCount, FIT_MAX, FIT_MIN, fitAbout, initialsOf, layoutAbout, LINK, linkAtUv, type CardInput, type Measure, type Op } from './about-card';

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
  achievements: Array.from({ length: 3 }, (_, i) => ({ title: `Award ${i}`, detail: i ? `Detail ${i}` : '', year: i < 2 ? '2024' : '' })),
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
    expect(lines).toContain('Engineer, Acme, 2020–now.');
    expect(lines.at(-1)).toBe('Achievement: Award 2, Detail 2.');
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
  timeline: Array.from({ length: MAX_TIMELINE }, (_, i) => ({
    role: `Principal Staff Software Engineer, Platform ${i}`,
    org: `The Extraordinarily Long Company Name Incorporated ${i}`,
    period: 'January 2012 – December 2024',
  })),
  achievements: Array.from({ length: MAX_ACHIEVEMENTS }, (_, i) => ({
    title: `Apple Design Award finalist for an exceptionally long project name ${i}`,
    detail: 'Recognised for interaction design, accessibility and craft across every platform it shipped on',
    year: '2024',
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
  about: about({ timeline: [], achievements: [], workPreference: '', resume: '', photo: '', skills: ['Go'], bio: 'Hi.' }),
  socials: [],
});
const CASES: [string, () => CardInput][] = [
  ['typical', () => input()],
  ['maximum', maxInput],
  ['minimum', minInput],
];

const ALL_SIZES = Object.entries(SIZES);

describe('layoutAbout', () => {
  for (const [name, make] of CASES)
    for (const [shape, [w, h]] of ALL_SIZES) {
      const pad = cardPad(w, h);
      describe(`${name} content, ${shape} card`, () => {
        const { ops, links } = layoutAbout(make(), w, h, measure, 2);

        it("keeps every line of text inside the card's sides and top", () => {
          for (const op of textOps(ops)) {
            const b = box(op);
            expect(b.x0, op.text).toBeGreaterThanOrEqual(pad);
            expect(b.x1, op.text).toBeLessThanOrEqual(w - pad + 0.5);
            expect(b.y0, op.text).toBeGreaterThanOrEqual(pad);
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

        it('places each link over its text, in order, without overlaps', () => {
          const wanted = contactLinks(make().about, make().socials);
          expect(links.map((l) => l.href)).toEqual(wanted.map((l) => l.href));
          const drawn = textOps(ops).filter((o) => o.color === LINK);
          expect(drawn).toHaveLength(links.length);
          links.forEach((l, i) => {
            const b = box(drawn[i]);
            expect(l.x0 * w, drawn[i].text).toBeLessThanOrEqual(b.x0);
            expect(l.x1 * w, drawn[i].text).toBeGreaterThanOrEqual(b.x1);
            expect(l.y0 * h, drawn[i].text).toBeLessThanOrEqual(b.y0);
            expect(l.y1 * h, drawn[i].text).toBeGreaterThanOrEqual(b.y1);
            // The card is shown at roughly a third of its size on a phone, so 48 layout px is ~17 css px.
            expect((l.y1 - l.y0) * h, l.href).toBeGreaterThanOrEqual(44);
          });
          for (let i = 0; i < links.length; i++)
            for (let j = i + 1; j < links.length; j++) {
              const a = links[i];
              const b = links[j];
              expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `${a.href} / ${b.href}`).toBe(false);
            }
        });
      });
    }

  it('draws a heading for each section with content, and none for an empty one', () => {
    const [w, h] = SIZES.tall;
    const headings = (i: CardInput) =>
      textOps(layoutAbout(i, w, h, measure).ops)
        .filter((o) => o.font.startsWith('600 18px') && o.x === cardPad(w, h))
        .map((o) => o.text);
    expect(headings(input())).toEqual(['About', 'Experience', 'Achievements', 'Skills', 'Contact']);
    expect(headings(minInput())).toEqual(['About', 'Skills', 'Contact']);
  });

  it("sets each entry's date flush right, on its title's baseline", () => {
    const [w, h] = SIZES.tall;
    const t = textOps(layoutAbout(input(), w, h, measure).ops);
    const role = t.find((o) => o.text === 'Role 0')!;
    const date = t.find((o) => o.text === '20XX–20XX' && o.y === role.y)!;
    expect(box(date).x1).toBeCloseTo(w - cardPad(w, h), 6);
  });

  it('shows at most `limit` entries per list, then says how many more there are', () => {
    const { ops, hidden } = layoutAbout(input(), ...SIZES.tall, measure, 2);
    const t = textOps(ops).map((o) => o.text);
    expect(t).toContain('Role 1');
    expect(t).not.toContain('Role 2');
    expect(t).toContain('+ 2 more');
    expect(t).toContain('+ 1 more');
    expect(hidden).toBe(3);
  });

  it('cuts a word wider than the column rather than drawing past it', () => {
    const [w, h] = SIZES.tall;
    const url = `https://example.com/${'a'.repeat(200)}`;
    const { ops } = layoutAbout(input({ bio: `see ${url} for more` }), w, h, measure);
    const cut = textOps(ops).find((o) => o.text.startsWith('https://example.com/'))!;
    expect(cut.text.endsWith('…')).toBe(true);
    expect(box(cut).x1).toBeLessThanOrEqual(w - cardPad(w, h));
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

  it('signs the fine print with the name and the city', () => {
    const t = textOps(layoutAbout(input(), ...SIZES.tall, measure).ops);
    expect(t.some((o) => o.text.startsWith('Designed by Halil Bagosi in City.'))).toBe(true);
  });

  it("balances the wide card's sections over two columns", () => {
    const rules = layoutAbout(input(), ...SIZES.wide, measure).ops.filter((o): o is Extract<Op, { kind: 'rule' }> => o.kind === 'rule');
    expect(new Set(rules.map((r) => r.x)).size).toBe(2);
  });

  it('draws one portrait', () => {
    expect(layoutAbout(input(), ...SIZES.tall, measure).ops.filter((o) => o.kind === 'photo')).toHaveLength(1);
  });
});

describe('fitAbout', () => {
  for (const [name, make] of CASES)
    for (const [shape, [w, h]] of ALL_SIZES)
      describe(`${name} content, ${shape} card`, () => {
        const fit = fitAbout(make(), w, h, measure);
        const pad = cardPad(fit.lw, fit.lh);

        it('keeps the scale within FIT_MIN..FIT_MAX and the logical size at the card aspect', () => {
          expect(fit.scale).toBeGreaterThanOrEqual(FIT_MIN);
          expect(fit.scale).toBeLessThanOrEqual(FIT_MAX);
          expect(fit.lw * fit.scale).toBeCloseTo(w, 6);
          expect(fit.lh * fit.scale).toBeCloseTo(h, 6);
        });

        it('keeps everything inside the padded card', () => {
          for (const op of fit.ops) {
            const [x0, y0, x1, y1] =
              op.kind === 'text'
                ? [box(op).x0, box(op).y0, box(op).x1, box(op).y1]
                : op.kind === 'photo'
                  ? [op.cx - op.r, op.cy - op.r, op.cx + op.r, op.cy + op.r]
                  : op.kind === 'mark'
                    ? [op.x, op.y, op.x + op.s, op.y + op.s]
                    : [op.x, op.y, op.x + op.w, op.y + op.h];
            const label = op.kind === 'text' ? op.text : op.kind;
            expect(x0, label).toBeGreaterThanOrEqual(pad - 0.5);
            expect(y0, label).toBeGreaterThanOrEqual(pad - 0.5);
            expect(x1, label).toBeLessThanOrEqual(fit.lw - pad + 0.5);
            expect(y1, label).toBeLessThanOrEqual(fit.lh - pad + 0.5);
          }
        });

        it('keeps link rects as fractions of the card', () => {
          for (const l of fit.links) for (const v of [l.x0, l.y0, l.x1, l.y1]) expect(v).toBeGreaterThan(0), expect(v).toBeLessThan(1);
        });

        it('stops at the largest scale that fits', () => {
          if (fit.scale >= FIT_MAX - 1e-9 || fit.hidden) return;
          const next = fit.scale + 0.05;
          const l = layoutAbout(make(), w / next, h / next, measure);
          const fits = l.bottom <= h / next - cardPad(w / next, h / next);
          expect(fits && cutCount(l.ops) <= cutCount(layoutAbout(make(), w, h, measure).ops)).toBe(false);
        });
      });

  it('shows every entry of the typical content', () => {
    for (const [w, h] of Object.values(SIZES)) expect(fitAbout(input(), w, h, measure).hidden).toBe(0);
  });

  it(`fits ${MAX_TIMELINE} jobs and ${MAX_ACHIEVEMENTS} achievements on the tall card by shrinking the type`, () => {
    const many = input({
      timeline: Array.from({ length: MAX_TIMELINE }, (_, i) => ({ role: `Role ${i}`, org: `Company ${i}`, period: '2020–2021' })),
      achievements: Array.from({ length: MAX_ACHIEVEMENTS }, (_, i) => ({ title: `Award ${i}`, detail: 'Detail', year: '2024' })),
    });
    const fit = fitAbout(many, ...SIZES.tall, measure);
    expect(fit.hidden).toBe(0);
    expect(fit.scale).toBeLessThan(1);
  });

  it('scales a card with little content up', () => {
    expect(fitAbout(minInput(), ...SIZES.tall, measure).scale).toBeGreaterThan(1);
  });

  it('drops entries, saying how many, when nothing fits at the smallest scale', () => {
    const [w, h] = SIZES.tall;
    const fit = fitAbout(maxInput(), w, h / 2, measure);
    expect(fit.hidden).toBeGreaterThan(0);
    expect(textOps(fit.ops).some((o) => /^\+ \d+ more$/.test(o.text))).toBe(true);
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
