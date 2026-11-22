export const SECTION_CHANGE_EVENT = 'sections-changed';
export const SECTION_CHANGE_KEY = 'faciload-sections-updated';

export function publishSectionChange(): void {
  window.dispatchEvent(new Event(SECTION_CHANGE_EVENT));
  try { window.localStorage.setItem(SECTION_CHANGE_KEY, crypto.randomUUID()); } catch { /* Same-tab refresh still works when storage is unavailable. */ }
}
