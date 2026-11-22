import { apiFetch } from './api';

import { publishSectionChange } from './section-events';

export interface Section {
  id: string;
  year_level: number;
  name: string;
  /** "1A (Year 1)" — ready-made dropdown label from the API. */
  label: string;
  created_at: string;
  updated_at: string;
}

export interface SectionListResult {
  data: Section[];
  meta: { total: number };
}

export interface SectionInput {
  year_level: number;
  name: string;
}

export function listSections(
  query: { search?: string; year_level?: number } = {},
): Promise<SectionListResult> {
  const params = new URLSearchParams();
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.year_level !== undefined) {
    params.set('year_level', String(query.year_level));
  }
  const qs = params.toString();
  return apiFetch<SectionListResult>(`/api/sections${qs ? `?${qs}` : ''}`);
}

export async function createSection(input: SectionInput): Promise<{ section: Section }> {
  const result = await apiFetch<{ section: Section }>('/api/sections', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  publishSectionChange();
  return result;
}

export async function updateSection(id: string, input: Partial<SectionInput>): Promise<{ section: Section }> {
  const result = await apiFetch<{ section: Section }>(`/api/sections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  publishSectionChange();
  return result;
}

export async function deleteSection(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/sections/${id}`, { method: 'DELETE' });
  publishSectionChange();
}
