import type { ProjectKind } from '../config/projects';

const STATUS: Record<string, string> = {
  Shipped: '#30D158',
  'In progress': '#FFD60A',
  Prototype: '#BF5AF2',
};

const KIND: Record<ProjectKind, string> = {
  'iOS app': '#4DA3FF',
  'macOS app': '#C7CCD6',
  'Cross-platform app': '#40D9C8',
  Website: '#FFB340',
};

export const statusTint = (s: string) => STATUS[s] ?? '#8E8E93';
export const kindTint = (k: ProjectKind) => KIND[k];
