import { apiFetch } from './api';

export interface Designation {
  id: string;
  name: string;
  default_hours: number;
  service_credit_hours: number;
  grants_service_credit: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DesignationInput {
  name: string;
  default_hours: number;
  service_credit_hours: number;
  grants_service_credit: boolean;
}

export function listDesignations(): Promise<{ data: Designation[]; meta: { total: number; page: number; pageSize: number; pageCount: number } }> {
  return apiFetch<{ data: Designation[]; meta: { total: number; page: number; pageSize: number; pageCount: number } }>('/api/designations?page=1&pageSize=100&sortBy=name&sortDir=asc');
}

export function createDesignation(input: DesignationInput): Promise<{ designation: Designation }> {
  return apiFetch<{ designation: Designation }>('/api/designations', { method: 'POST', body: JSON.stringify(input) });
}

export function updateDesignation(id: string, input: Partial<DesignationInput>): Promise<{ designation: Designation }> {
  return apiFetch<{ designation: Designation }>(`/api/designations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function deleteDesignation(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/designations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
