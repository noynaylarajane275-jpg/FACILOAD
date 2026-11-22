import { useEffect, useState } from 'react';
import { SECTION_CHANGE_EVENT, SECTION_CHANGE_KEY } from '../lib/section-events';

/** Refresh section references and joined labels, including other open tabs. */
export function useSectionRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const onStorage = (event: StorageEvent) => { if (event.key === SECTION_CHANGE_KEY) refresh(); };
    window.addEventListener(SECTION_CHANGE_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SECTION_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return revision;
}
