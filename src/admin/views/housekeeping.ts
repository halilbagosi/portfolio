import { api } from '../api';
import type { Store } from '../state';

/**
 * Deletes photo files that no saved project uses, after showing the list. Only with everything
 * saved: photos added since the last save are on disk but not yet referenced by the saved file,
 * so they would look unused.
 */
export async function cleanUnusedPhotos(store: Store, toast: (m: string) => void) {
  if (store.dirty) {
    alert('Save or discard your changes first: photos added since the last save would count as unused.');
    return;
  }
  try {
    const { files } = await api.unusedPhotos();
    if (!files.length) return toast('No unused photos');
    if (!confirm(`Delete ${files.length} photo${files.length > 1 ? 's' : ''} that no project uses?\n\n${files.join('\n')}`)) return;
    const { deleted } = await api.deleteUnused(files);
    toast(`Deleted ${deleted.length} photo${deleted.length === 1 ? '' : 's'}`);
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}
