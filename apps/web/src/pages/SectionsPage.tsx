import { useTermStore } from '../store/term.store';
import { downloadProgramWorkbook } from '../lib/program-download';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { createSection, deleteSection, listSections, updateSection, type Section } from '../lib/sections';
import { useSectionRevision } from '../hooks/useSectionRevision';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100';
const secondary = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const primary = 'rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50';

export function SectionsPage(): JSX.Element {
  const { pushToast } = useToast();
  const termId = useTermStore(state => state.selectedTermId);
  const terms = useTermStore(state => state.terms);
  const termStatus = useTermStore(state => state.status);
  const loadTerms = useTermStore(state => state.loadTerms);
  const selectTerm = useTermStore(state => state.selectTerm);
  const [exporting, setExporting] = useState('');
  useEffect(() => { if (termStatus === 'idle') void loadTerms(); }, [termStatus, loadTerms]);
  const revision = useSectionRevision();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [editor, setEditor] = useState<Section | 'new' | null>(null);
  const [name, setName] = useState('');
  const [year, setYear] = useState('1');
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    void listSections().then(result => {
      if (current) { setSections(result.data); setError(''); }
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : 'Could not load sections.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision, retry]);

  function openEditor(section: Section | 'new'): void {
    setEditor(section);
    setName(section === 'new' ? '' : section.name);
    setYear(section === 'new' ? yearFilter || '1' : String(section.year_level));
    setFormError('');
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!editor || busy) return;
    if (!name.trim() || name.trim().length > 60) { setFormError('Enter a section name of 1 to 60 characters.'); return; }
    setBusy(true); setFormError('');
    try {
      const input = { name: name.trim(), year_level: Number(year) };
      if (editor === 'new') await createSection(input);
      else await updateSection(editor.id, input);
      setEditor(null);
      pushToast('success', editor === 'new' ? 'Section added.' : 'Section updated across linked workloads and schedules.');
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Could not save the section.'); }
    finally { setBusy(false); }
  }

  async function remove(): Promise<void> {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await deleteSection(deleteTarget.id);
      setDeleteTarget(null);
      pushToast('success', 'Section deleted.');
    } catch (cause) {
      setDeleteTarget(null);
      setError(cause instanceof Error ? cause.message : 'Could not delete the section.');
    } finally { setBusy(false); }
  }

  const visible = sections.filter(section => (!yearFilter || section.year_level === Number(yearFilter)) && section.label.toLowerCase().includes(search.trim().toLowerCase()));

  return <section aria-labelledby="sections-title" className="space-y-5 font-sans">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 id="sections-title" className="text-2xl font-semibold text-slate-900">Section Management</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Manage the sections used in workload assignments, schedule plotting, and class programs.</p></div>
      <button type="button" className={primary} onClick={() => openEditor('new')}>Add section</button>
    </header>
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <label className="min-w-48 flex-1 text-sm text-slate-600">Search sections<input type="search" className={`${field} mt-1`} placeholder="Search by section name" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="text-sm text-slate-600">Year level<select className={`${field} mt-1`} value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="">All years</option>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>Year {value}</option>)}</select></label>
        <label className="text-sm text-slate-600">Schedule term<select aria-label="Section schedule term" className={`${field} mt-1`} value={termId ?? ''} onChange={event => selectTerm(event.target.value)}><option value="">Select term</option>{terms.map(term => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
        <span className="pb-2 text-sm text-slate-500">{visible.length} {visible.length === 1 ? 'section' : 'sections'}</span>
      </div>
      {error && <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Refresh</button></div>}
      {loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">Loading sections...</p> : visible.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{sections.length ? 'No sections match these filters.' : 'No sections yet. Add a section to use it in workload assignments.'}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-3 font-medium">Section name</th><th scope="col" className="px-5 py-3 font-medium">Year level</th><th scope="col" className="px-5 py-3 font-medium">Used in planning as</th><th scope="col" className="px-5 py-3 text-right font-medium">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{visible.map(section => <tr key={section.id} className="hover:bg-red-50/30"><td className="px-5 py-4 font-medium text-slate-900">{section.name}</td><td className="px-5 py-4 text-slate-600">Year {section.year_level}</td><td className="px-5 py-4 text-slate-600">{section.label}</td><td className="px-5 py-4"><div className="flex flex-wrap justify-end gap-2">{termId ? <Link className={secondary} aria-label={`Print schedule for ${section.name}`} to={`/print/sections/${section.id}?termId=${termId}`}>Print schedule</Link> : <button type="button" disabled className={secondary} title="Select a term first">Print schedule</button>}<button type="button" className={secondary} disabled={!termId || Boolean(exporting)} onClick={() => { if (!termId) return; setExporting(section.id); void downloadProgramWorkbook('sections', section.id, termId, `Section Schedule - ${section.name}`).catch(cause => pushToast('error', cause instanceof Error ? cause.message : 'Could not export schedule')).finally(() => setExporting('')); }}>{exporting === section.id ? 'Exporting...' : 'Export section schedule'}</button><button type="button" className={secondary} aria-label={`Edit ${section.name}`} onClick={() => openEditor(section)}>Edit</button><button type="button" className="rounded-lg border border-red-200 px-3 py-2 font-medium text-red-700 hover:bg-red-50" aria-label={`Delete ${section.name}`} onClick={() => setDeleteTarget(section)}>Delete</button></div></td></tr>)}</tbody>
      </table></div>}
    </div>
    <p className="text-sm text-slate-500">Changes use the same section record throughout the system. <Link to="/workload-assignment" className="font-medium text-red-700 underline underline-offset-2">Open workload assignments</Link></p>
    <Modal open={editor !== null} title={editor === 'new' ? 'Add section' : 'Edit section'} onClose={() => { if (!busy) setEditor(null); }}>
      <form onSubmit={event => void save(event)} className="space-y-4">
        <label className="block text-sm text-slate-700">Section name<input autoFocus required maxLength={60} className={`${field} mt-1`} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. BSIT 1A" /></label>
        <label className="block text-sm text-slate-700">Year level<select required className={`${field} mt-1`} value={year} onChange={event => setYear(event.target.value)}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>Year {value}</option>)}</select></label>
        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={busy} className={secondary} onClick={() => setEditor(null)}>Cancel</button><button type="submit" disabled={busy} className={primary}>{busy ? 'Saving...' : editor === 'new' ? 'Add section' : 'Save changes'}</button></div>
      </form>
    </Modal>
    <ConfirmDialog open={deleteTarget !== null} title="Delete section?" message={`Delete ${deleteTarget?.label ?? 'this section'}? Sections linked to workload assignments cannot be deleted.`} confirmLabel="Delete section" pending={busy} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
  </section>;
}
