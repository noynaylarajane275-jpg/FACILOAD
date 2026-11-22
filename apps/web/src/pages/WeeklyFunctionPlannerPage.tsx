import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useTermStore } from '../store/term.store';
import { getLoadSettings, type FacultySession, type LoadSettings, type TeachingLoad } from '../lib/teaching-load';
import type { ScheduleSlot } from '../lib/schedule-slots';
import { TeachingLoadPlanner, type SessionInput } from './TeachingLoadPlanner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PlannerNotificationBell } from '../components/PlannerNotificationBell';
import './weekly-function-planner.css';

type PlannerState = {
  draft: { id: string; revision: number; sessions: FacultySession[]; updated_at: string } | null;
  sessions: FacultySession[];
  pendingSubmission: { id: string; status: string; submitted_at: string } | null;
  latestSubmission: { id: string; status: string; feedback: string; submitted_at: string; reviewed_at: string | null } | null;
  approvedSubmission: { id: string; reviewed_at: string | null } | null;
  approvedSessions: FacultySession[];
  teachingSlots: ScheduleSlot[];
  load: TeachingLoad;
};

const timeLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function WeeklyFunctionPlannerPage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const termId = useTermStore((state) => state.selectedTermId);
  const terms = useTermStore((state) => state.terms);
  const termStatus = useTermStore((state) => state.status);
  const loadTerms = useTermStore((state) => state.loadTerms);
  const selectTerm = useTermStore((state) => state.selectTerm);
  const reduce = useReducedMotion();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('plannerAppearance') === 'dark' ? 'dark' : 'light');
  const [state, setState] = useState<PlannerState | null>(null);
  const [settings, setSettings] = useState<LoadSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingEdit, setPendingEdit] = useState<FacultySession[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const facultyId = user?.facultyId ?? null;
  const isFaculty = user?.role === 'FACULTY';
  const endpoint = useMemo(() => facultyId && termId ? `/api/faculty/${facultyId}/planner-draft?termId=${termId}` : '', [facultyId, termId]);

  useEffect(() => { if (termStatus === 'idle') void loadTerms(); }, [termStatus, loadTerms]);
  useEffect(() => { window.localStorage.setItem('plannerAppearance', theme); document.documentElement.dataset.plannerAppearance = theme; }, [theme]);

  const refresh = useCallback(async () => {
    if (!endpoint) { setState(null); return; }
    setLoading(true); setError('');
    try {
      const [planner, config] = await Promise.all([
        apiFetch<PlannerState>(endpoint),
        getLoadSettings(),
      ]);
      setState(planner); setSettings(config.settings);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the weekly planner'); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function persistSessions(sessions: FacultySession[]): Promise<void> {
    if (!facultyId || !termId || !state) return;
    setBusy(true); setError('');
    try {
      await apiFetch(`/api/faculty/${facultyId}/planner-draft?termId=${termId}`, {
        method: 'PUT',
        body: JSON.stringify({ sessions, expectedRevision: state.draft?.revision ?? 0 }),
      });
      await refresh();
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : 'Could not save the planner draft');
      throw cause;
    } finally { setBusy(false); }
  }

  async function prepareChange(sessions: FacultySession[]): Promise<void> {
    if (state?.pendingSubmission) {
      setPendingEdit(sessions);
      return;
    }
    await persistSessions(sessions);
  }

  async function saveSession(data: SessionInput, id?: string): Promise<void> {
    const sessions = state?.sessions ?? [];
    const next = id
      ? sessions.map((session) => session.id === id ? { ...data, id } : session)
      : [...sessions, { ...data, id: crypto.randomUUID() }];
    await prepareChange(next as FacultySession[]);
  }

  async function deleteSession(id: string): Promise<void> {
    await prepareChange((state?.sessions ?? []).filter((session) => session.id !== id));
  }

  async function confirmCorrection(): Promise<void> {
    if (!pendingEdit) return;
    const next = pendingEdit;
    setPendingEdit(null);
    await persistSessions(next).catch(() => undefined);
  }

  async function submit(): Promise<void> {
    if (!facultyId || !termId) return;
    setBusy(true); setError('');
    try {
      await apiFetch(`/api/faculty/${facultyId}/planner-draft/submit?termId=${termId}`, { method: 'POST' });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit planner'); }
    finally { setBusy(false); }
  }

  async function cancelSubmission(): Promise<void> {
    if (!facultyId || !termId) return;
    setBusy(true); setError(''); setCancelOpen(false);
    try {
      await apiFetch(`/api/faculty/${facultyId}/planner-draft/cancel-submission?termId=${termId}`, { method: 'POST' });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel submission'); }
    finally { setBusy(false); }
  }

  const targetProgress = state ? Math.min(100, Math.max(0, state.load.total_faculty_time / state.load.weekly_hours * 100)) : 0;
  return <motion.div
    className="weekly-planner-page"
    data-planner-theme={theme}
    initial={reduce ? false : { opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <header className="weekly-planner-hero">
      <div className="weekly-planner-title">
        <span className="weekly-planner-eyebrow">Faculty workspace · {terms.find((item) => item.id === termId)?.label ?? 'Select a term'}</span>
        <h1>Weekly Function Planner</h1>
        <p>Plot your faculty functions in half-hour increments. Teaching assignments stay fixed while drafts move through Chairman review.</p>
      </div>
      <div className="weekly-planner-tools">
        <label>Term<select aria-label="Planner term" value={termId ?? ''} onChange={(event) => selectTerm(event.target.value)}><option value="">Select term</option>{terms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div className="weekly-planner-theme" role="group" aria-label="Planner appearance"><span>Appearance</span><button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button><button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button></div>
      </div>
    </header>

    {!isFaculty ? <PlannerNotificationBell history />
      : !facultyId ? <section className="weekly-planner-message"><h2>Faculty profile not linked</h2><p>Ask the Chair to link this account to your faculty record before plotting a weekly planner.</p></section>
      : !termId ? <section className="weekly-planner-message"><h2>Select an academic term</h2><p>Choose a term above to load your approved planner and draft.</p></section>
      : loading && !state ? <section role="status" className="weekly-planner-loading">Loading your planner…</section>
      : error && !state ? <section role="alert" className="weekly-planner-message"><p>{error}</p><button type="button" onClick={() => void refresh()}>Retry</button></section>
      : state && settings && <>
        <section className="weekly-planner-status-row" aria-label="Planner status">
          <div className="weekly-planner-status-card"><span className="weekly-status-label">Editable version</span><strong>{state.draft ? `Draft · revision ${state.draft.revision}` : state.approvedSubmission ? 'Approved planner' : 'New planner'}</strong><small>{state.draft?.updated_at ? `Last saved ${timeLabel(state.draft.updated_at)}` : 'Draft edits are saved separately from the final planner.'}</small></div>
          <div className={`weekly-planner-status-card ${state.pendingSubmission ? 'is-pending' : state.approvedSubmission ? 'is-approved' : ''}`}><span className="weekly-status-label">Chairman approval</span><strong>{state.pendingSubmission ? 'Pending review' : state.latestSubmission?.status === 'REJECTED' ? 'Changes requested' : state.approvedSubmission ? 'Approved final' : 'Not submitted'}</strong><small>{state.pendingSubmission ? `Submitted ${timeLabel(state.pendingSubmission.submitted_at)}` : state.latestSubmission?.status === 'REJECTED' ? state.latestSubmission.feedback : state.approvedSubmission?.reviewed_at ? `Final since ${timeLabel(state.approvedSubmission.reviewed_at)}` : 'Submit your saved draft to request approval.'}</small></div>
          <div className="weekly-planner-actions">
            {state.pendingSubmission ? <button type="button" className="weekly-cancel-submission" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel submission</button> : <button type="button" className="weekly-submit-button" disabled={busy || !state.draft} onClick={() => void submit()}>{busy ? 'Working…' : 'Submit draft for approval'}</button>}
          </div>
        </section>

        {error && <p role="alert" className="weekly-planner-error">{error}</p>}

        <section className="weekly-load-overview" aria-label="Teaching load overview">
          <div className="weekly-load-heading"><div><span className="weekly-planner-eyebrow">This term</span><h2>Workload at a glance</h2></div><span className="weekly-load-target">{state.load.total_faculty_time}h <small>/ {state.load.weekly_hours}h target</small></span></div>
          <div className="weekly-load-track" role="progressbar" aria-label="Progress toward weekly target" aria-valuenow={Math.round(targetProgress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${targetProgress}%` }} /></div>
          <div className="weekly-load-metrics">
            <div><span>Teaching time</span><strong>{state.load.teaching_hours}h</strong><small>{state.load.lecture_hours}h lecture · {state.load.weighted_lab_hours}h weighted lab</small></div>
            <div><span>Regular ceiling</span><strong>{state.load.prep_ceiling}h</strong><small>{state.load.preps} preparation{state.load.preps === 1 ? '' : 's'} · {state.load.prep_ceiling_source.toLowerCase()}</small></div>
            <div><span>Overload · service credit</span><strong>{state.load.teaching_overload}h · {state.load.teaching_service_credit}h</strong><small>{state.load.claimable_overload_hours}h claimable overload</small></div>
            <div><span>Other functions</span><strong>{Object.values(state.load.functions).reduce((sum, item) => sum + item.counted, 0)}h</strong><small>Counted from valid plotted sessions</small></div>
            <div><span>Designations · credits</span><strong>{state.load.designation_hours}h · {state.load.service_credits} credits</strong><small>Credits are outside the weekly target</small></div>
            <div><span>Time remaining</span><strong>{state.load.remaining_to_target}h</strong><small>Overload and service credits excluded</small></div>
          </div>
        </section>

        <div className={busy || pendingEdit ? 'weekly-planner-busy' : ''} aria-busy={busy}>
          <TeachingLoadPlanner
            slots={state.teachingSlots}
            sessions={state.sessions}
            designations={state.load.designations}
            minimum={settings.min_session_hours}
            onSave={saveSession}
            onDelete={deleteSession}
            readOnly={busy || Boolean(pendingEdit)}
          />
        </div>

        {state.load.warnings.length > 0 && <section className="weekly-planner-warnings"><h2>Load checks</h2><ul>{state.load.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}
        <p className="weekly-planner-note">Your approved planner remains the final program until a replacement draft is approved. Lunch is shown from 12:00 PM to 1:00 PM.</p>
      </>}

    <ConfirmDialog
      open={Boolean(pendingEdit)}
      panelClassName="weekly-planner-dialog"
      title="Withdraw this submission to edit?"
      message="Saving this change will withdraw the pending submission. Your edits will remain as a draft, but you must submit them again for Chairman approval. The previously approved planner stays final."
      confirmLabel="Save correction & withdraw"
      pending={busy}
      onConfirm={() => void confirmCorrection()}
      onCancel={() => setPendingEdit(null)}
    />
    <ConfirmDialog
      open={cancelOpen}
      panelClassName="weekly-planner-dialog"
      title="Cancel planner submission?"
      message="This will cancel the pending review and keep your editable draft. The previously approved planner, if any, remains final."
      confirmLabel="Cancel submission"
      onConfirm={() => void cancelSubmission()}
      onCancel={() => setCancelOpen(false)}
    />
  </motion.div>;
}
