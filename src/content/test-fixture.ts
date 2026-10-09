import type { SiteContent } from './schema';

/** A small, valid content object; a fresh copy each call so tests can mutate it. */
export function validContent(): SiteContent {
  return {
    settings: {
      identity: { name: 'Ada Lovelace', role: 'Engineer', title: 'Ada — Engineer', description: 'Selected projects.' },
      icon: { text: 'AL', background: '#111111', color: '#ffffff' },
      hints: {
        open: { desktop: 'Click to open', touch: 'Tap to open' },
        begin: { touch: 'Tap to begin' },
        section: { desktop: 'Click a section', touch: 'Tap a section' },
        close: { desktop: 'Scroll up to close', touch: 'Swipe down to close' },
        flip: { desktop: 'Scroll down to turn it over', touch: 'Swipe up to turn it over' },
        back: { desktop: 'Scroll up to turn it back', touch: 'Swipe down to turn it back' },
      },
      motion: { photoDwell: 2, gyroDegrees: 18, parallax: 1, lidKnock: true, topDownOnOpen: true },
      socials: [
        { label: 'GitHub', text: 'github.com/ada', href: 'https://github.com/ada' },
        { label: 'Email', text: 'ada@example.com', href: 'mailto:ada@example.com' },
      ],
      about: {
        photo: '',
        bio: 'Builds analytical engines.',
        years: 5,
        location: 'London, UK',
        workPreference: 'Remote',
        available: true,
        availability: 'Open to new roles',
        skills: ['Swift', 'TypeScript'],
        email: 'ada@example.com',
        resume: '',
        timeline: [{ role: 'Engineer', org: 'Engines Ltd', period: '2020–now' }],
      },
    },
    projects: [
      {
        id: 'alpha',
        visible: true,
        title: 'Alpha',
        kind: 'iOS app',
        caption: 'First',
        purpose: 'Does alpha things.',
        stack: ['Swift'],
        architecture: 'MVVM',
        duration: '2 months',
        status: 'Shipped',
        links: [{ label: 'GitHub', href: 'https://github.com/x/alpha' }],
        glow: ['#112233', '#445566'],
        images: ['/shots/alpha-1.jpg'],
      },
      {
        id: 'beta',
        visible: true,
        title: 'Beta',
        kind: 'Website',
        caption: 'Second',
        purpose: 'Does beta things.',
        stack: [],
        architecture: 'Static',
        duration: '1 week',
        status: 'Prototype',
        links: [],
        glow: ['#aabbcc', '#ddeeff'],
        images: ['/shots/beta-1.jpg', '/shots/beta-2.jpg'],
      },
    ],
  };
}
