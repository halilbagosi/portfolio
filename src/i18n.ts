import type { ProjectKind } from './content/schema';

/** The site's languages. English is the content as written; Albanian is the optional `sq` wording in site.json. */
export type Lang = 'en' | 'sq';
export const LANGS: readonly Lang[] = ['en', 'sq'];
export const LANG_NAMES: Record<Lang, string> = { en: 'English', sq: 'Shqip' };
const STORE = 'lang';
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'sq';

/** ?lang= (for links and the dashboard preview), then the visitor's last choice, then the browser's language. */
function detect(): Lang {
  if (typeof location === 'undefined') return 'en';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (isLang(q)) return q;
    const saved = localStorage.getItem(STORE);
    if (isLang(saved)) return saved;
  } catch {
    // storage blocked: fall through to the browser's language
  }
  return navigator.language?.toLowerCase().startsWith('sq') ? 'sq' : 'en';
}
export const lang: Lang = detect();

/** The scene is drawn once from the content, so a new language is a reload. */
export function setLang(next: Lang) {
  try {
    localStorage.setItem(STORE, next);
  } catch {
    // not remembered; the ?lang= below still switches this load
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.replace(url);
}

/** The site's fixed words (labels the content doesn't carry). */
const UI = {
  en: {
    open: 'Open the box: {name}, {role}',
    turnOver: 'Turn the box over: About {name}',
    aboutOf: 'About {name}',
    turnBack: 'Turn the box back',
    showingAbout: 'Showing About',
    showingTop: 'Showing the top of the box',
    stack: 'Stack',
    architecture: 'Architecture',
    timeline: 'Timeline',
    status: 'Status',
    viewOn: 'View on {label}',
    builtWith: 'Built with',
    projectOn: '{title} on {label}',
    resume: 'Résumé',
    years: '{n}+ years of experience.',
    basedIn: 'Based in {where}',
    skills: 'Skills',
    achievement: 'Achievement',
    screenshots: 'Screenshots',
    prev: 'Previous screenshot',
    next: 'Next screenshot',
    close: 'Close',
    noscript: 'Enable JavaScript to open the box.',
    switcher: 'Language',
  },
  sq: {
    open: 'Hap kutinë: {name}, {role}',
    turnOver: 'Ktheje kutinë përmbys: Rreth {name}',
    aboutOf: 'Rreth {name}',
    turnBack: 'Ktheje kutinë mbrapsht',
    showingAbout: 'Po shfaqet profili',
    showingTop: 'Po shfaqet pjesa e sipërme e kutisë',
    stack: 'Teknologjitë',
    architecture: 'Arkitektura',
    timeline: 'Koha',
    status: 'Statusi',
    viewOn: 'Shiko në {label}',
    builtWith: 'Ndërtuar me',
    projectOn: '{title} në {label}',
    resume: 'CV',
    years: '{n}+ vjet përvojë.',
    basedIn: 'Banon në {where}',
    skills: 'Aftësitë',
    achievement: 'Arritje',
    screenshots: 'Pamje ekrani',
    prev: 'Pamja e mëparshme',
    next: 'Pamja tjetër',
    close: 'Mbyll',
    noscript: 'Aktivizo JavaScript për ta hapur kutinë.',
    switcher: 'Gjuha',
  },
} satisfies Record<Lang, Record<string, string>>;
export type UiKey = keyof (typeof UI)['en'];

export function t(key: UiKey, vars: Record<string, string | number> = {}, l: Lang = lang) {
  return UI[l][key].replace(/\{(\w+)\}/g, (token, k: string) => String(vars[k] ?? token));
}

const KINDS_SQ: Record<ProjectKind, string> = {
  'iOS app': 'Aplikacion iOS',
  'macOS app': 'Aplikacion macOS',
  'Cross-platform app': 'Aplikacion ndër-platformë',
  Website: 'Faqe interneti',
};
export const kindLabel = (k: ProjectKind, l: Lang = lang) => (l === 'sq' ? (KINDS_SQ[k] ?? k) : k);

/** Albanian for the site's own text when the dashboard leaves it empty (also shown there as placeholders). */
export const DEFAULT_SQ = {
  hints: {
    open: { desktop: 'Kliko për ta hapur', touch: 'Prek për ta hapur' },
    begin: { touch: 'Prek për të nisur' },
    section: { desktop: 'Kliko një seksion për ta hapur', touch: 'Prek një seksion për ta hapur' },
    close: { desktop: 'Rrotullo lart për ta mbyllur', touch: 'Rrëshqit poshtë për ta mbyllur' },
    flip: { desktop: 'Rrotullo poshtë për ta kthyer', touch: 'Rrëshqit lart për ta kthyer' },
    back: { desktop: 'Rrotullo lart për ta kthyer mbrapsht', touch: 'Rrëshqit poshtë për ta kthyer mbrapsht' },
  },
  headings: { about: 'Rreth meje', experience: 'Përvoja', achievements: 'Arritjet', skills: 'Aftësitë', contact: 'Kontakti' },
  yearsLabel: 'vjet përvojë',
  finePrint: 'Dizajnuar nga {name}. Montuar në shfletues.',
} as const;
