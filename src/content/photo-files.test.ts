import { describe, expect, it } from 'vitest';
import { nextPhotoName, shotFile, unusedPhotos } from './photo-files';
import { validContent } from './test-fixture';

describe('nextPhotoName', () => {
  it('starts at 1', () => {
    expect(nextPhotoName('alpha', [])).toBe('alpha-1.jpg');
  });

  it('goes one past the highest number in use for that project', () => {
    expect(nextPhotoName('snippets', ['snippets-1.jpg', 'snippets-4.jpg', 'palettes-9.jpg', 'snippets-x.jpg'])).toBe('snippets-5.jpg');
  });

  it('does not confuse ids that share a prefix', () => {
    expect(nextPhotoName('art', ['artpage-3.jpg'])).toBe('art-1.jpg');
  });

  it('rejects unsafe ids', () => {
    expect(() => nextPhotoName('../x', [])).toThrow();
  });
});

describe('shotFile', () => {
  it('returns the file name of a /shots path', () => {
    expect(shotFile('/shots/a-1.jpg')).toBe('a-1.jpg');
  });

  it('rejects anything outside public/shots', () => {
    expect(shotFile('/shots/../x.jpg')).toBeNull();
    expect(shotFile('/shots/.env')).toBeNull();
    expect(shotFile('/other/a.jpg')).toBeNull();
    expect(shotFile('/shots/sub/a.jpg')).toBeNull();
  });
});

describe('unusedPhotos', () => {
  it('lists image files no project uses, ignoring other files', () => {
    const files = ['alpha-1.jpg', 'beta-1.jpg', 'beta-2.jpg', 'old-1.jpg', 'notes.txt', '.DS_Store'];
    expect(unusedPhotos(validContent(), files)).toEqual(['old-1.jpg']);
  });

  it('counts hidden projects as using their photos', () => {
    const c = validContent();
    c.projects[1].visible = false;
    expect(unusedPhotos(c, ['beta-1.jpg'])).toEqual([]);
  });

  it('counts the About portrait as used', () => {
    const c = validContent();
    c.settings.about.photo = '/shots/about-1.jpg';
    expect(unusedPhotos(c, ['alpha-1.jpg', 'beta-1.jpg', 'beta-2.jpg', 'about-1.jpg'])).toEqual([]);
  });
});
