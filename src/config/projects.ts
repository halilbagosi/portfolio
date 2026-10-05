export type ProjectKind = 'iOS app' | 'macOS app' | 'Cross-platform app' | 'Website';

export interface Project {
  title: string;
  kind: ProjectKind;
  /** Short line shown on the resting tile. */
  caption: string;
  purpose: string;
  stack: string[];
  architecture: string;
  duration: string;
  status: string;
  links: { label: string; href: string }[];
  /** Two colours for the light glowing up from the depth of the section. */
  glow: [string, string];
  /** Interface screenshots, shown as a stack inside the section (served from /public). */
  images: string[];
}

// Add or remove entries freely; the bento layout re-flows for any count.
export const projects: Project[] = [
  {
    title: 'Snippets',
    kind: 'macOS app',
    caption: 'Code snippets for macOS',
    purpose: 'A native macOS app to organize, search and live-preview code snippets.',
    stack: ['Swift', 'SwiftUI', 'SwiftData', 'WebKit', 'Metal'],
    architecture: 'SwiftData + multi-engine previews',
    duration: '4 months',
    status: 'In progress',
    links: [{ label: 'GitHub', href: 'https://github.com/halilbagosi/snippets' }],
    glow: ['#2fc8ff', '#5a5bff'],
    images: [1, 2, 3, 4].map((i) => `/shots/snippets-${i}.jpg`),
  },
  {
    title: 'Palettes',
    kind: 'iOS app',
    caption: 'Color palettes for iPhone and iPad',
    purpose: 'Generates color palettes with color theory and on-device Apple Intelligence.',
    stack: ['Swift', 'SwiftUI', 'CloudKit', 'Foundation Models', 'Metal'],
    architecture: 'MVVM, iCloud sync',
    duration: '5 months',
    status: 'In progress',
    links: [{ label: 'GitHub', href: 'https://github.com/halilbagosi/Palettes2.0' }],
    glow: ['#c56bff', '#ff5fae'],
    images: [1, 2, 3, 4].map((i) => `/shots/palettes-${i}.jpg`),
  },
  {
    title: 'MemoryLane',
    kind: 'Cross-platform app',
    caption: 'Memory care for iOS and Android',
    purpose: 'Helps people with dementia keep recognizing loved ones through caregiver-made quizzes.',
    stack: ['TypeScript', 'React Native', 'Expo', 'NestJS', 'PostgreSQL'],
    architecture: 'Expo app + NestJS REST API',
    duration: '6 weeks',
    status: 'Prototype',
    links: [{ label: 'GitHub', href: 'https://github.com/halilbagosi/memorylane' }],
    glow: ['#2fe0a0', '#1f9fb0'],
    images: [1, 2, 3, 4].map((i) => `/shots/memorylane-${i}.jpg`),
  },
  {
    title: 'artpage',
    kind: 'Website',
    caption: 'Art, photography and film portfolio',
    purpose: 'A triptych portfolio where art, photography and film each open into their own world.',
    stack: ['TypeScript', 'Next.js', 'React', 'Tailwind', 'Framer Motion'],
    architecture: 'Static Next.js, markdown content',
    duration: '4 days',
    status: 'In progress',
    links: [{ label: 'GitHub', href: 'https://github.com/halilbagosi/artpage' }],
    glow: ['#ffb43d', '#ff5f7a'],
    images: [1, 2, 3, 4].map((i) => `/shots/artpage-${i}.jpg`),
  },
];
