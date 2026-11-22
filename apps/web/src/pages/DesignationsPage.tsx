import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  createDesignation,
  deleteDesignation,
  listDesignations,
  updateDesignation,
  type Designation,
  type DesignationInput,
} from '../lib/designations';
import { useAuthStore } from '../store/auth.store';
import { MANAGEMENT_ROLES } from '../config/navigation';

const emptyForm: DesignationInput = {
  name: '',
  default_hours: 1,
  service_credit_hours: 0,
  grants_service_credit: false,
};

const inputClass = 'mt-1 w-full rounded-xl border border-brand-500/20 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15';

export function DesignationsPage(): JSX.Element {
  const canEdit = useAuthStore((state) => Boolean(state.user && MANAGEMENT_ROLES.includes(state.user.role)));
  const { pushToast } = useToast();
  const [rows, setRows] = useState<Designation[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<DesignationInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const response = await listDesignations();
      setRows(response.data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  function openCreate(): void {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(row: Designation): void {
    setEditing(row);
    setFormOpen(true);
    setForm({
      name: row.name,
      default_hours: row.default_hours,
      service_credit_hours: row.service_credit_hours,
      grants_service_credit: row.grants_service_credit,
    });
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) await updateDesignation(editing.id, form);
      else await createDesignation(form);
      pushToast('success', editing ? 'Designation updated.' : 'Designation created.');
      setEditing(null);
      setFormOpen(false);
      setReloadKey((value) => value + 1);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Could not save the designation.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDesignation(deleteTarget.id);
      pushToast('success', 'Designation removed from the active catalog.');
      setDeleteTarget(null);
      setReloadKey((value) => value + 1);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Could not remove the designation.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="designations-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Faculty workload</p>
          <h1 id="designations-title" className="mt-1 text-2xl font-semibold text-primary-dark">Designations</h1>
          <p className="mt-1 text-sm text-slate-600">Manage term assignments such as department roles, research leads, and committee work.</p>
        </div>
        {canEdit ? <button type="button" onClick={openCreate} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600">Add designation</button> : null}
      </div>

      {status === 'loading' ? <p role="status" className="glass-card px-4 py-9 text-center text-sm text-slate-600">Loading designations…</p> : null}
      {status === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-7 text-center">
          <p className="text-sm font-medium text-red-700">Could not load designations.</p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100">Retry</button>
        </div>
      ) : null}
      {status === 'ready' ? rows.length === 0 ? (
        <div className="glass-card border-dashed px-4 py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">No designations in the catalog yet.</p>
          <p className="mt-1 text-sm text-slate-600">Add a designation before assigning it to a faculty member.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3 font-semibold">Designation</th><th className="px-5 py-3 text-right font-semibold">Default hours</th><th className="px-5 py-3 text-right font-semibold">Service credit</th><th className="px-5 py-3 font-semibold">Credit rule</th>{canEdit ? <th className="px-5 py-3 text-right font-semibold">Actions</th> : null}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{row.default_hours}h</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{row.service_credit_hours}h</td>
                    <td className="px-5 py-3 text-slate-600">{row.grants_service_credit ? 'Counts outside the 40-hour target' : 'No service credit'}</td>
                    {canEdit ? <td className="space-x-2 whitespace-nowrap px-5 py-3 text-right"><button type="button" onClick={() => openEdit(row)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Edit</button><button type="button" onClick={() => setDeleteTarget(row)} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">Remove</button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal open={formOpen} title={editing ? 'Edit designation' : 'Add designation'} onClose={() => setFormOpen(false)}>
        <form className="space-y-4" onSubmit={save}>
          <label className="block text-sm font-medium text-slate-700">Name<input className={inputClass} maxLength={120} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="block text-sm font-medium text-slate-700">Default weekly hours<input className={inputClass} type="number" min="0.5" max="40" step="0.5" required value={form.default_hours} onChange={(event) => setForm({ ...form, default_hours: Number(event.target.value) })} /></label>
          <label className="block text-sm font-medium text-slate-700">Service credit hours<input className={inputClass} type="number" min="0" max="40" step="0.5" value={form.service_credit_hours} onChange={(event) => setForm({ ...form, service_credit_hours: Number(event.target.value) })} /></label>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1 accent-brand-500" checked={form.grants_service_credit} onChange={(event) => setForm({ ...form, grants_service_credit: event.target.checked })} /><span>Service credit for this role is counted outside the 40-hour faculty target.</span></label>
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save designation'}</button></div>
        </form>
      </Modal>

      <Modal open={deleteTarget !== null} title="Remove designation?" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-slate-600">“{deleteTarget?.name}” will be removed from the active catalog. Past faculty assignments remain available in their load history.</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{deleting ? 'Removing…' : 'Remove designation'}</button></div>
      </Modal>
    </section>
  );
}
