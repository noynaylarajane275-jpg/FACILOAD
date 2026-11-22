import { apiFetch } from './api';

export interface FacultyLoadDesignation {
  id: string;
  faculty_id: string;
  designation_id: string;
  designation_name: string;
  designation_grants_service_credit: boolean;
  term_id: string;
  hours: number;
  service_credit: number;
  assigned_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FacultyDesignationInput {
  designation_id: string;
  term_id: string;
  hours: number;
  service_credit?: number;
}

export function listFacultyDesignations(facultyId: string, termId: string): Promise<FacultyLoadDesignation[]> {
  const params = new URLSearchParams({ termId });
  return apiFetch<FacultyLoadDesignation[]>(`/api/faculty/${encodeURIComponent(facultyId)}/designations?${params.toString()}`);
}

export function assignFacultyDesignation(facultyId: string, input: FacultyDesignationInput): Promise<{ designation: FacultyLoadDesignation }> {
  return apiFetch<{ designation: FacultyLoadDesignation }>(`/api/faculty/${encodeURIComponent(facultyId)}/designations`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateFacultyDesignation(id: string, input: Partial<Pick<FacultyDesignationInput, 'hours' | 'service_credit'>>): Promise<{ designation: FacultyLoadDesignation }> {
  return apiFetch<{ designation: FacultyLoadDesignation }>(`/api/faculty-designations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteFacultyDesignation(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/faculty-designations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
