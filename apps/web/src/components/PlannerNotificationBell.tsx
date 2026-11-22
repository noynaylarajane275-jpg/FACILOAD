import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { TeachingLoadPlanner } from '../pages/TeachingLoadPlanner';
import type { FacultySession, TeachingLoad } from '../lib/teaching-load';
import type { ScheduleSlot } from '../lib/schedule-slots';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import './planner-notifications.css';

type PlannerNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  submission: { id: string; status: string; faculty_id: string; term_id: string } | null;
};
type ReviewItem = { id: string; status: string; faculty_id: string; faculty_name: string; employee_no: string; term_id: string; term_label: string; submitted_at: string };
type Review = {
  id: string;
  status: string;
  feedback: string;
  submitted_at: string;
  faculty: { id: string; name: string; employee_no: string };
  term: { id: string; label: string };
  sessions: FacultySession[];
  teachingSlots: ScheduleSlot[];
  load: TeachingLoad;
};
type NotificationResponse = { notifications: PlannerNotification[]; unreadCount: number; pendingReviewCount: number };

const timestamp = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function PlannerNotificationBell({ history = false }: { history?: boolean } = {}): JSX.Element | null {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [notificationView, setNotificationView] = useState<'activity' | 'review'>('activity');
  const [data, setData] = useState<NotificationResponse>({ notifications: [], unreadCount: 0, pendingReviewCount: 0 });
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [deleteTarget,setDeleteTarget]=useState<ReviewItem|null>(null);
  const [editing, setEditing] = useState(false);
  const [editedSessions, setEditedSessions] = useState<FacultySession[]>([]);
  const [previewLoad, setPreviewLoad] = useState<TeachingLoad | null>(null);
  const [calculating, setCalculating] = useState(false);
  useEffect(() => {
    if (!editing || !review) return;
    let current = true;
    setCalculating(true);
    const timer = window.setTimeout(() => {
      void apiFetch<{load:TeachingLoad}>(`/api/planner-reviews/${review.id}/preview`,{method:'POST',body:JSON.stringify({sessions:editedSessions})})
        .then(result => {if(current) {setPreviewLoad(result.load);setError('');}})
        .catch(cause => {if(current) setError(cause instanceof Error ? cause.message : 'Could not calculate hours');})
        .finally(() => {if(current) setCalculating(false);});
    },150);
    return () => {current=false;window.clearTimeout(timer);};
  },[editing,review?.id,editedSessions]);
  const displayedLoad = editing && previewLoad ? previewLoad : review?.load;
  const [loadingReview, setLoadingReview] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chair = user?.role === 'CHAIR';

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const response = await apiFetch<NotificationResponse>('/api/notifications');
      setData(response);
      if (chair) {
        const pending = await apiFetch<{ data: ReviewItem[] }>('/api/planner-reviews?history=true');
        setReviews(pending.data);
      }
    } catch {
      // A transient poll failure leaves the latest visible notification state in place.
    }
  }, [chair, user, history]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer); }, [refresh]);

  async function openReview(id: string, requestEdit = false): Promise<void> {
    setEditing(false);
    setConfirmEdit(false);
    setLoadingReview(id); setError('');
    try {
      const response = await apiFetch<{ submission: Review }>(`/api/planner-reviews/${id}`);
      setReview(response.submission); setFeedback(''); setOpen(false);
      setConfirmEdit(requestEdit);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the submitted planner'); }
    finally { setLoadingReview(''); }
  }

  async function openNotification(item: PlannerNotification): Promise<void> {
    if (!item.read_at) {
      await apiFetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' }).catch(() => undefined);
    }
    await refresh();
    if (chair && item.submission?.id) await openReview(item.submission.id);
    else if (!chair) { setOpen(false); navigate('/weekly-planner'); }
  }

  async function decide(decision: 'APPROVE' | 'REJECT'): Promise<void> {
    if (!review) return;
    setBusy(true); setError('');
    try {
      await apiFetch(`/api/planner-reviews/${review.id}`, { method: 'POST', body: JSON.stringify({ decision, feedback }) });
      const updated=await apiFetch<{submission:Review}>(`/api/planner-reviews/${review.id}`);
      setReview(updated.submission); setFeedback(''); await refresh();
      window.dispatchEvent(new Event('planner-final-updated'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the submission'); }
    finally { setBusy(false); }
  }

  if (!user) return null;
  return <>
    {history && <section className="weekly-planner-message planner-submission-history" aria-label="Planner submission history">
      <h2>Faculty planner submissions</h2>
      <p>Click a faculty row to view that faculty member’s draft. Use Edit or Delete on the same row.</p>
      <button type="button" onClick={() => void refresh()}>Refresh submissions</button>
      {reviews.length ? [...reviews].reverse().map(item => <div className="planner-review-row planner-submission-entry" key={item.id}>
        <button type="button" className="planner-submission-preview" onClick={() => void openReview(item.id)} disabled={Boolean(loadingReview)}>
          <span><strong>{item.faculty_name}</strong><small>{item.term_label} · {timestamp(item.submitted_at)}</small></span>
          <span className={`planner-state-tag state-${item.status.toLowerCase()}`}>{item.status}</span><span>View timetable</span>
        </button>
        <div className="planner-submission-actions">
          {<button type="button" disabled={Boolean(loadingReview)} onClick={() => void openReview(item.id, true)}>Edit</button>}
          <button type="button" className="is-delete" title="Delete draft" onClick={() => setDeleteTarget(item)}>Delete</button>
        </div>
      </div>) : <p>No faculty planner submissions yet.</p>}
      {error && <p role="alert">{error}</p>}
    </section>}
    <div className="planner-notification-anchor" hidden={history}>
      <AnimatePresence>
        {open && <motion.aside
          id="planner-notification-panel"
          role="region"
          aria-label="Planner notifications"
          className="planner-notification-panel"
          initial={reduce ? false : { opacity: 0, y: 10, scale: .98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, y: 8, scale: .98 }}
          transition={{ duration: reduce ? 0 : .16 }}
        >
          <header className="planner-notification-head">
            <div><p className="planner-overline">Faculty planner</p><h2>Notifications</h2></div>
            <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}>X</button>
          </header>
          {chair && <div className="planner-notification-tabs" role="group" aria-label="Notification view">
            <button type="button" aria-pressed={notificationView === 'activity'} onClick={() => setNotificationView('activity')}>Recent activity</button>
            <button type="button" aria-pressed={notificationView === 'review'} onClick={() => setNotificationView('review')}>Draft update ({data.pendingReviewCount})</button>
          </div>}
          {chair && notificationView === 'review' && <section className="planner-review-list" aria-label="Draft updates">
            <div className="planner-section-title"><strong>Draft update</strong><span>{data.pendingReviewCount}</span></div>
            {reviews.length ? reviews.map((item) => <button className="planner-review-row" type="button" key={item.id} onClick={() => void openReview(item.id)} disabled={Boolean(loadingReview)}>
              <span><strong>{item.faculty_name}</strong><small>{item.employee_no} | {item.term_label} | {item.status}</small></span>
              <span className="planner-review-action">{loadingReview === item.id ? 'Opening...' : 'Preview'}</span>
            </button>) : <p className="planner-empty">No submissions need review.</p>}
          </section>}
          <section hidden={chair && notificationView !== 'activity'} className="planner-notification-list" aria-label="Recent notifications">
            <div className="planner-section-title"><strong>Recent activity</strong><span>{data.unreadCount ? `${data.unreadCount} new` : 'Up to date'}</span></div>
            {data.notifications.length ? data.notifications.slice(0, 10).map((item) => <div className="planner-activity-entry" key={item.id}><button type="button" className={`planner-notification-row${item.read_at ? '' : ' is-unread'}`} onClick={() => void openNotification(item)}>
              <span className={`planner-status-dot type-${item.type.toLowerCase()}`} aria-hidden="true" />
              <span className="planner-notification-copy"><strong>{item.title}</strong><span>{item.message}</span><span className="planner-notification-status">{item.type.replaceAll('_', ' ').toLowerCase()}</span><time dateTime={item.created_at}>{timestamp(item.created_at)}</time></span>
              <span className="planner-notification-open">{chair ? 'Preview' : 'Open planner'}</span>
              {!item.read_at && <span className="planner-unread-mark" aria-label="Unread" />}
            </button><button type="button" className="planner-activity-archive" aria-label={`Archive ${item.title}`} title="Archive activity" onClick={() => void apiFetch(`/api/notifications/${item.id}`, {method: 'DELETE'}).then(refresh).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not archive activity'))}>?</button></div>) : <p className="planner-empty">No planner notifications yet.</p>}
          </section>
          {notificationView === 'activity' && data.unreadCount > 0 && <button type="button" className="planner-mark-read" onClick={() => void apiFetch('/api/notifications/read-all', { method: 'PATCH' }).then(refresh)}>Mark all as read</button>}
        </motion.aside>}
      </AnimatePresence>
      <button
        type="button"
        className="planner-notification-trigger"
        aria-label={`Planner notifications${data.unreadCount ? `, ${data.unreadCount} unread` : ''}${chair && data.pendingReviewCount ? `, ${data.pendingReviewCount} pending reviews` : ''}`}
        aria-expanded={open}
        aria-controls="planner-notification-panel"
        onClick={() => { setOpen((current) => !current); void refresh(); }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10 20h4"/></svg>
        {data.unreadCount > 0 && <span className="planner-notification-red-dot" aria-hidden="true" />}
        {chair && data.pendingReviewCount > 0 && <span className="planner-pending-count">{data.pendingReviewCount}</span>}
      </button>
    </div>
    <Modal open={Boolean(review)} title={review ? `Review planner | ${review.faculty.name}` : 'Review planner'} panelClassName="planner-review-dialog" onClose={busy ? () => undefined : () => setReview(null)}>
      {review && <div className="planner-review-modal">
        <div className="planner-review-meta"><span>{review.term.label}</span><span>Submitted {timestamp(review.submitted_at)}</span><span className={`planner-state-tag state-${review.status.toLowerCase()}`}>{review.status}</span></div>
        {editing && <div className="planner-review-actions">
          <button type="button" disabled={busy} onClick={() => setEditing(false)}>Discard changes</button>
          <button type="button" className="planner-approve-button" disabled={busy || calculating || Boolean(error)} onClick={async () => {
            setBusy(true); setError('');
            try { const result = await apiFetch<{submission:Review}>(`/api/planner-reviews/${review.id}`,{method:'PUT',body:JSON.stringify({sessions:editedSessions})}); setReview(result.submission); setEditing(false); await refresh(); window.dispatchEvent(new Event('planner-final-updated')); }
            catch(cause) { setError(cause instanceof Error ? cause.message : 'Could not save revision'); }
            finally { setBusy(false); }
          }}>{busy ? 'Saving...' : 'Save planner'}</button>
        </div>}
        <TeachingLoadPlanner slots={review.teachingSlots} sessions={editing ? editedSessions : review.sessions} designations={review.load.designations} minimum={1} onSave={async (session,id) => {setEditedSessions(current => id ? current.map(item => item.id === id ? {...session,id} as FacultySession : item) : [...current,{...session,id:crypto.randomUUID()} as FacultySession]);}} onDelete={id => setEditedSessions(current => current.filter(item => item.id !== id))} readOnly={!editing} />
        <section className="planner-snapshot-summary">
          <h3>{editing ? 'Editing hours breakdown' : 'Submitted hours breakdown'}</h3>{editing && calculating && <p role="status">Updating hours...</p>}
          <div className="planner-snapshot-grid">
            {(['research', 'extension', 'imp', 'consultation'] as const).map((key) => <div key={key}><span>{key}</span><strong>{displayedLoad!.functions[key].plotted}h plotted | {displayedLoad!.functions[key].counted}h counted</strong></div>)}
            <div><span>Teaching overload</span><strong>{displayedLoad!.overload_plotted_hours}h plotted | {displayedLoad!.claimable_overload_hours}h claimable</strong></div>
            {displayedLoad!.designations.map((item) => <div key={item.id ?? item.name}><span>{item.name}</span><strong>{item.plotted_hours}h plotted | {item.counted_hours}h counted</strong></div>)}
            <div><span>Weekly total</span><strong>{displayedLoad!.total_faculty_time}h / {displayedLoad!.weekly_hours}h</strong></div>
            <div><span>Total students</span><strong>{displayedLoad!.total_students}</strong></div>
          </div>
        </section>
        {error && <p role="alert" className="planner-review-error">{error}</p>}
        {review.status === 'PENDING' && !editing && <>
          <label className="planner-rejection-label">Rejection reason <span>(required to reject)</span><textarea rows={2} maxLength={1000} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
          <div className="planner-review-actions"><button disabled={busy || !feedback.trim()} className="planner-reject-button" type="button" onClick={() => void decide('REJECT')}>{busy ? 'Saving...' : 'Reject with reason'}</button><button disabled={busy} className="planner-approve-button" type="button" onClick={() => void decide('APPROVE')}>{busy ? 'Saving...' : 'Final approval - sync Teaching Load'}</button></div>
        </>}
      </div>}
    </Modal>
    <ConfirmDialog open={Boolean(deleteTarget)} title="Delete planner draft?" message="This removes the submission. The faculty editable draft and finalized Teaching Load are preserved." confirmLabel="Delete draft" onCancel={()=>setDeleteTarget(null)} onConfirm={()=>{if(!deleteTarget)return;void apiFetch(`/api/planner-reviews/${deleteTarget.id}`,{method:'DELETE'}).then(async()=>{setDeleteTarget(null);setReview(null);await refresh();}).catch(cause=>setError(cause instanceof Error?cause.message:'Could not delete draft'));}} />
    <ConfirmDialog open={confirmEdit} title="Edit faculty function planner?" message="Saving will overwrite this planner and sync the faculty draft. Changes to an approved planner sync to Teaching Load when saved. Pending planners require final approval. The summary updates while you edit." confirmLabel="Start editing" onCancel={() => setConfirmEdit(false)} onConfirm={() => {setConfirmEdit(false);setPreviewLoad(review?.load ?? null);setEditedSessions(review?.sessions ?? []);setEditing(true);}} />
  </>;
}


