import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WeeklyFunctionPlannerPage } from './WeeklyFunctionPlannerPage';
import { useAuthStore } from '../store/auth.store';
import { useTermStore } from '../store/term.store';
import { apiFetch } from '../lib/api';
import { getLoadSettings, type TeachingLoad } from '../lib/teaching-load';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('../lib/teaching-load', async (importOriginal) => ({ ...await importOriginal<typeof import('../lib/teaching-load')>(), getLoadSettings: vi.fn() }));
vi.mock('./TeachingLoadPlanner', () => ({
  TeachingLoadPlanner: ({ minimum, onSave }: { minimum: number; onSave: (data: { type: 'RESEARCH'; day_of_week: string; start_time: string; end_time: string; faculty_designation_id: null }, id?: string) => Promise<void> }) => <div>
    <span>Minimum {minimum}h</span>
    <button type="button" onClick={() => void onSave({ type: 'RESEARCH', faculty_designation_id: null, day_of_week: 'MON', start_time: '10:00', end_time: '11:00' }, 'session-1')}>Mock move session</button>
  </div>,
}));

const load: TeachingLoad = {
  lecture_hours: 4, lab_hours: 2, weighted_lab_hours: 1.4, teaching_hours: 5.4, preps: 2,
  prep_breakdown: [], prep_ceiling: 21, prep_ceiling_source: 'TIER', teaching_overload: 0, claimable_overload_hours: 0,
  teaching_service_credit: 0, overload_plotted_hours: 0, claim_session_hours: 0, overload_remaining_to_plot: 0,
  regular_teaching_hours: 5.4, designation_hours: 1, total_faculty_time: 7.4, remaining_to_target: 32.6, service_credits: .5,
  weekly_hours: 40, functions: { research: { declared: 1, plotted: 1, counted: 1 }, extension: { declared: 1, plotted: 0, counted: 0 }, imp: { declared: 0, plotted: 0, counted: 0 }, consultation: { declared: 4, plotted: 0, counted: 0 } },
  designations: [{ id: 'designation-1', name: 'Coordinator', hours: 2, service_credit: .5, grants_service_credit: true, plotted_hours: 1, accepted: true, counted_hours: 1 }],
  sessions: [{ id: 'session-1', type: 'RESEARCH', day_of_week: 'MON', start_time: '08:00', end_time: '09:00', faculty_designation_id: null }],
  students_by_section: [{ section_id: 'section-1', section_name: 'IE 2A', student_count: 30 }], total_students: 30,
  effectivity: { start: null, end: null, source: 'TERM' }, warnings: [],
};
const initial = {
  draft: { id: 'draft-1', revision: 2, sessions: load.sessions, updated_at: '2026-11-16T03:00:00.000Z' },
  sessions: load.sessions, pendingSubmission: { id: 'submission-1', status: 'PENDING', submitted_at: '2026-11-16T03:00:00.000Z' },
  latestSubmission: { id: 'submission-1', status: 'PENDING', feedback: '', submitted_at: '2026-11-16T03:00:00.000Z', reviewed_at: null },
  approvedSubmission: { id: 'approved-1', reviewed_at: '2026-11-15T03:00:00.000Z' }, approvedSessions: load.sessions,
  teachingSlots: [], load,
};
const corrected = { ...initial, draft: { ...initial.draft, revision: 3, sessions: [{ ...load.sessions[0]!, start_time: '10:00', end_time: '11:00' }] }, sessions: [{ ...load.sessions[0]!, start_time: '10:00', end_time: '11:00' }], pendingSubmission: null, latestSubmission: { ...initial.latestSubmission, status: 'WITHDRAWN' } };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  delete document.documentElement.dataset.plannerAppearance;
  useAuthStore.setState({ user: { id: 'faculty-user', email: 'planner@example.test', role: 'FACULTY', facultyId: 'faculty-1' }, isAuthenticated: true, isInitializing: false });
  useTermStore.setState({ status: 'ready', selectedTermId: 'term-1', terms: [{ id: 'term-1', label: '2026–2027 Second Semester', school_year: '2026-2027', semester: 'SECOND', is_active: true, created_at: '' }] });
  vi.mocked(getLoadSettings).mockResolvedValue({ settings: { lab_coefficient: .7, weekly_hours: 40, consultation_hours: 4, min_research: 1, min_extension: 1, min_imp: 0, min_session_hours: 1.5, prep_tiers: [] } });
  vi.mocked(apiFetch).mockResolvedValue(initial as never);
});
afterEach(() => { cleanup(); delete document.documentElement.dataset.plannerAppearance; });

describe('Weekly Function Planner page', () => {
  it('shows a separate workload summary and half-hour function planner', async () => {
    render(<MemoryRouter><WeeklyFunctionPlannerPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Weekly Function Planner' })).toBeInTheDocument();
    expect(screen.getByText('Minimum 1.5h')).toBeInTheDocument();
    expect(screen.getByText('7.4h')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel submission' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });

  it('shares the dark appearance preference with the notification shell', async () => {
    render(<MemoryRouter><WeeklyFunctionPlannerPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Weekly Function Planner' });
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(document.documentElement.dataset.plannerAppearance).toBe('dark'));
    expect(window.localStorage.getItem('plannerAppearance')).toBe('dark');
  });

  it('asks before the first pending edit, withdraws it on save, and keeps the approved version final', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(initial as never)
      .mockResolvedValueOnce({ draft: { revision: 3 } } as never)
      .mockResolvedValueOnce(corrected as never);
    render(<MemoryRouter><WeeklyFunctionPlannerPage /></MemoryRouter>);
    await screen.findByText('Pending review');
    fireEvent.click(screen.getByRole('button', { name: 'Mock move session' }));
    expect(await screen.findByRole('dialog', { name: 'Withdraw this submission to edit?' })).toBeInTheDocument();
    expect(screen.getByText(/saving this change will withdraw the pending submission/i)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save correction & withdraw' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/faculty/faculty-1/planner-draft?termId=term-1', expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"expectedRevision":2') }));
    expect(await screen.findByText('Approved final')).toBeInTheDocument();
    expect(screen.getByText('Draft · revision 3')).toBeInTheDocument();
  });

  it('shows Chair draft entries with row actions and without a create/open control', async () => {
    useAuthStore.setState({ user: { id: 'chair', email: 'chair@example.test', role: 'CHAIR', facultyId: null }, isAuthenticated: true, isInitializing: false });
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ notifications: [], unreadCount: 0, pendingReviewCount: 1 } as never)
      .mockResolvedValueOnce({ data: [{ id: 'submission-1', status: 'PENDING', faculty_id: 'faculty-1', faculty_name: 'Maria Santos', employee_no: 'F-001', term_id: 'term-1', term_label: '2026-2027 First Semester', submitted_at: '2026-11-16T03:00:00.000Z' }] } as never);
    render(<MemoryRouter><WeeklyFunctionPlannerPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Faculty planner submissions' })).toBeInTheDocument();
    expect(screen.getByText(/Click a faculty row to view that faculty member’s draft/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View timetable/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create \/ Open draft/ })).not.toBeInTheDocument();
  });
});
