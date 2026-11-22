import { useSectionRevision } from '../hooks/useSectionRevision';
import { useEffect, useState } from 'react';
import { motion,useReducedMotion } from 'framer-motion';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { MANAGEMENT_ROLES } from '../config/navigation';
import { useTermStore,selectSelectedTerm } from '../store/term.store';
import { listFaculty,type FacultyMember } from '../lib/faculty';
import { getTeachingLoad,getLoadSettings,getDesignations,type TeachingLoad,type LoadSettings,type Designation } from '../lib/teaching-load';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { downloadProgramWorkbook } from '../lib/program-download';
import './teaching-load-experience.css';

/** Reads the existing server engine; no client-side duplicate calculation. */
export function TeachingLoadPage(): JSX.Element {
  const sectionRevision = useSectionRevision();
  const user=useAuthStore(s=>s.user);const manage=Boolean(user&&MANAGEMENT_ROLES.includes(user.role));
  const [selected,setSelected]=useState('');
  const [theme,setTheme]=useState<'light'|'dark'>(()=>window.localStorage.getItem('plannerAppearance')==='dark'?'dark':'light');
  const facultyId=manage?selected:user?.facultyId;
  const termId = useTermStore((s) => s.selectedTermId);
  const termStatus=useTermStore(s=>s.status),loadTerms=useTermStore(s=>s.loadTerms),terms=useTermStore(s=>s.terms),selectTerm=useTermStore(s=>s.selectTerm),term=useTermStore(selectSelectedTerm);
  const [load,setLoad]=useState<TeachingLoad|null>(null);const [settings,setSettings]=useState<LoadSettings|null>(null);
  const [faculties,setFaculties]=useState<FacultyMember[]>([]),[designations,setDesignations]=useState<Designation[]>([]);
  const [tick,setTick]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const update=()=>setTick(value=>value+1);window.addEventListener('planner-final-updated',update);return()=>window.removeEventListener('planner-final-updated',update);},[]);
  const [consultationTarget,setConsultationTarget]=useState(4);
  const [students,setStudents]=useState<Record<string,string>>({});
  const [assign,setAssign]=useState(false),[master,setMaster]=useState(false),[designationId,setDesignationId]=useState('');
  const [assignedHours,setAssignedHours]=useState(0),[assignedCredit,setAssignedCredit]=useState(0);
  const [editing,setEditing]=useState(''),[draft,setDraft]=useState({name:'',default_hours:0,service_credit_hours:0,grants_service_credit:false});
  const reduce=useReducedMotion(),{pushToast}=useToast();
  const field='rounded-lg border border-leaf-200 bg-white px-3 py-2 text-sm text-ink';
  const panel='rounded-2xl border border-leaf-100 bg-white p-5';
  const button='rounded-lg bg-leaf-500 px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50';
  useEffect(()=>{if(termStatus==='idle')void loadTerms();},[termStatus,loadTerms]);
  useEffect(()=>{window.localStorage.setItem('plannerAppearance',theme);document.documentElement.dataset.plannerAppearance=theme;},[theme]);
  useEffect(()=>{if(!manage)return;let active=true;void listFaculty({pageSize:100}).then(async(first)=>{
    const rest=await Promise.all(Array.from({length:Math.max(0,first.meta.pageCount-1)},(_,i)=>listFaculty({pageSize:100,page:i+2})));
    if(active)setFaculties([...first.data,...rest.flatMap(r=>r.data)]);
  }).catch(()=>{if(active)setError('Could not load faculty choices.');});return()=>{active=false;};},[manage]);
  useEffect(() => {
    let current = true;
    setLoad(null);setError('');
    if(facultyId&&termId)void Promise.all([getTeachingLoad(facultyId,termId),getLoadSettings(),getDesignations()]).then(([res,config,master])=>{
      if(!current)return;setLoad(res.load);setSettings(config.settings);setDesignations(master.data);
      setConsultationTarget(res.load.functions.consultation.declared);
      setStudents(Object.fromEntries(res.load.students_by_section.map(s=>[s.section_id,s.student_count===null?'':String(s.student_count)])));
    }).catch(()=>{if(current)setError('Could not load teaching load. Please retry.');});
    return () => {current=false;};
  },[facultyId,termId,tick,sectionRevision]);
  const endpoint=(part:string)=>`/api/faculty/${facultyId}/${part}?termId=${termId}`;
  async function mutate(path:string,method:string,body?:unknown){setBusy(true);try{await apiFetch(path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})});setTick(v=>v+1);pushToast('success','Program updated.');}catch(e){pushToast('error',e instanceof Error?e.message:'Could not update program');throw e;}finally{setBusy(false);}}
  const run=(promise:Promise<unknown>)=>{void promise.catch(()=>{});};
  const selectedDesignation=designations.find(d=>d.id===designationId);
  return <motion.div initial={reduce?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} className="teaching-load-experience" data-load-theme={theme}>
    <div className="tl-experience-header"><div><span className="tl-kicker">Faculty workload · {term?.label??'Term overview'}</span><h1>Teaching Load</h1><p>See how instruction, functions and designations add up against your weekly target.</p></div>
      <div className="flex flex-wrap gap-3">{manage&&<label className="text-sm">Faculty<select aria-label="Teaching load faculty" className={`${field} ml-2`} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select faculty…</option>{faculties.map(f=><option key={f.id} value={f.id}>{f.last_name}, {f.first_name}</option>)}</select></label>}
      <label className="text-sm">Term<select aria-label="Teaching load term" className={`${field} ml-2`} value={termId??''} onChange={e=>selectTerm(e.target.value)}><option value="">Select term…</option>{terms.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <div className="tl-theme-toggle" role="group" aria-label="Teaching load appearance"><span>Appearance</span><button type="button" aria-pressed={theme==='light'} onClick={()=>setTheme('light')}>Light</button><button type="button" aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}>Dark</button></div></div>
    </div>
    {error?<div role="alert" className={panel}>{error}<button onClick={()=>setTick(v=>v+1)} className={`${button} ml-3`}>Retry</button></div>:!facultyId||!termId?<div className={`${panel} border-dashed`}>{!facultyId&&!manage?'Your account must be linked to a faculty record by the Chair.':'Select a faculty member and term to view the program.'}</div>:!load||!settings?<div role="status" className={`${panel} animate-pulse h-48`}>Loading teaching load…</div>:<>
      <div className="tl-load-metrics grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{[
        ['Lecture',`${load.lecture_hours}h`],['Lab',`${load.lab_hours}h × ${settings.lab_coefficient} = ${load.weighted_lab_hours}h`],['Teaching hours',`${load.teaching_hours}h`],['Preps',String(load.preps)],['Regular ceiling',`${load.prep_ceiling}h · ${load.prep_ceiling_source}`],
      ].map(([label,value],i)=><motion.div key={label} initial={reduce?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:reduce?0:i*.04}} className={`${panel} tl-load-metric`}><p className="text-xs text-ink/60">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p>{label==='Preps'&&<details className="text-xs"><summary>Preparation breakdown</summary>{load.prep_breakdown.map(p=><p key={p.subject_id+p.component}>{p.subject_code??'Subject'} · {p.component}</p>)}</details>}</motion.div>)}</div>
      <div className="tl-load-highlights grid gap-4 lg:grid-cols-3"><section className={`${panel} tl-target-card flex items-center gap-5`}>
        <div className="tl-target-ring relative h-28 w-28 shrink-0" role="progressbar" aria-label="Weekly target progress" aria-valuenow={Math.round(Math.min(100,load.total_faculty_time/load.weekly_hours*100))} aria-valuemin={0} aria-valuemax={100}><svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="#F5DDE2" strokeWidth="8"/><circle cx="50" cy="50" r="42" fill="none" stroke="#C51D41" strokeWidth="8" strokeDasharray="264" strokeDashoffset={264*(1-Math.min(1,load.total_faculty_time/load.weekly_hours))}/></svg><div className="absolute inset-0 flex items-center justify-center text-xl font-bold">{load.total_faculty_time}h</div></div>
        <div><h2 className="font-semibold">Progress toward weekly target</h2><p>of {load.weekly_hours} hours</p><p className="text-sm text-ink/60">{load.remaining_to_target}h remaining</p><p className="mt-2 text-xs">Overload and Service Credits are tracked separately.</p></div>
      </section><section className={`${panel} tl-overload-card`}><h2 className="font-semibold">Teaching overload</h2><p className="mt-2 text-2xl font-bold">{load.teaching_overload}h</p><p className="text-sm">Claimable: {load.claimable_overload_hours}h</p><p className="text-sm">Teaching Service Credit: {load.teaching_service_credit}h</p></section>
      <section className={`${panel} tl-credit-card`}><h2 className="font-semibold">Service Credits</h2><p className="mt-2 text-2xl font-bold">{load.service_credits}h</p><p className="text-sm text-ink/60">From accepted, eligible designations. Not counted in {load.weekly_hours}.</p></section></div>
      <section className={panel}><h2 className="font-semibold">Claim for Teaching Overload</h2><p className="my-2 text-sm">Claimable {load.claimable_overload_hours}h · Plotted {load.overload_plotted_hours}h · Remaining to plot {load.overload_remaining_to_plot}h · Claim session hours {load.claim_session_hours}h</p>
        <progress aria-label="Overload claim progress" value={load.claim_session_hours} max={Math.max(1,load.claimable_overload_hours)} className="w-full accent-leaf-500"/>
        {load.sessions.filter(s=>s.type==='OVERLOAD').length===0?<p className="text-sm text-ink/60">No overload sessions plotted.</p>:<ul className="mt-2 text-sm">{load.sessions.filter(s=>s.type==='OVERLOAD').map(s=><li key={s.id}>{s.day_of_week} {s.start_time}–{s.end_time}</li>)}</ul>}
      </section>
      <div className="grid gap-4 lg:grid-cols-2"><section className={panel}><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Designations</h2>{manage&&<div className="flex gap-2"><button className={button} onClick={()=>setAssign(true)}>Assign designation</button><button className={field} onClick={()=>setMaster(true)}>Manage list</button></div>}</div>
        {load.designations.length===0?<p className="mt-3 text-sm text-ink/60">No designations assigned for this term.</p>:<ul className="mt-3 space-y-3">{load.designations.map(d=><li key={d.id} className="flex justify-between gap-3 border-b border-leaf-100 pb-2"><div><strong className="text-sm">{d.name}</strong><p className="text-xs">{d.hours}h assigned · {d.plotted_hours}h plotted · {d.counted_hours}h counted · {d.accepted?'Accepted':'Not accepted'}</p></div>{manage&&<button className="text-xs text-red-700" onClick={()=>run(mutate(`/api/faculty-designations/${d.id}`,'DELETE'))}>Remove</button>}</li>)}</ul>}
      </section><section className={panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Other Functions</h2><p className="text-xs text-ink/60">Hours are counted automatically from valid plotted sessions.</p></div>{manage&&<form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();if(!settings)return;run(mutate(endpoint('functions'),'PUT',{research_hours:settings.min_research,extension_hours:settings.min_extension,imp_hours:settings.min_imp,consultation_hours:consultationTarget}));}}><label className="text-xs">Consultation target<input aria-label="Consultation target hours" type="number" min={settings.min_session_hours} step="0.5" value={consultationTarget} onChange={e=>setConsultationTarget(Number(e.target.value))} className={`${field} mt-1 block w-28`}/></label><button className={button} disabled={busy}>Save target</button></form>}</div>
        <div className="mt-4 space-y-4">{(['research','extension','imp','consultation'] as const).map(key=>{const fn=load.functions[key],minimum=key==='research'?settings.min_research:key==='extension'?settings.min_extension:key==='imp'?settings.min_imp:fn.declared;return <div key={key}><div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm"><strong className="capitalize">{key}</strong><span>{fn.counted}h counted · {fn.plotted}h plotted{key==='consultation'?` / ${minimum}h target`:minimum>0?` · ${minimum}h minimum`:''}</span></div><progress aria-label={`${key} hours progress`} value={Math.min(fn.counted,load.weekly_hours)} max={load.weekly_hours} className="h-3 w-full accent-leaf-500"/></div>;})}</div>
      </section></div>
      <form className={panel} onSubmit={e=>{e.preventDefault();run(mutate(endpoint('students'),'PUT',{students:Object.entries(students).filter(([,v])=>v!=='').map(([section_id,value])=>({section_id,student_count:Number(value)}))}));}}><h2 className="font-semibold">Students per section</h2><p className="text-sm text-ink/60">Each section counts once across all subjects.</p><div className="my-3 grid gap-3 sm:grid-cols-3">{load.students_by_section.map(s=><label key={s.section_id} className="text-sm">{s.section_name}<input aria-label={`Students in ${s.section_name}`} type="number" min="0" max="200" step="1" placeholder="Not entered" className={`${field} mt-1 w-full`} value={students[s.section_id]??''} onChange={e=>setStudents(v=>({...v,[s.section_id]:e.target.value}))}/></label>)}</div><p className="my-3 font-semibold">Total students: {Object.values(students).reduce((n,v)=>n+(Number(v)||0),0)}</p><button disabled={busy||load.students_by_section.length===0} className={button}>Save student counts</button></form>
      <section className={panel}><h2 className="font-semibold">Term effectivity</h2><p className="text-sm">{load.effectivity.start??'Not set'} to {load.effectivity.end??'Not set'} · Applies to the whole term. Manage it in Form Settings.</p></section>
      {load.warnings.length>0&&<section className={`${panel} border-amber-200 bg-amber-50`}><h2 className="font-semibold">Warnings</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{load.warnings.map(w=><li key={w}>{w}</li>)}</ul></section>}
      <div className="flex flex-wrap items-center gap-4"><p className="text-xs text-ink/50">{term?.label}</p><a href="/weekly-planner" className="inline-flex items-center rounded-lg border border-leaf-300 bg-white px-4 py-2 text-sm font-semibold text-leaf-800 shadow-sm">Open Weekly Function Planner</a><a href={`/print/faculty/${facultyId}?termId=${termId}`} className="inline-flex cursor-pointer items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:cursor-pointer hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Print Faculty Class Program</a><button className={button} disabled={busy} onClick={()=>{if(!facultyId||!termId)return;setBusy(true);void downloadProgramWorkbook('faculty',facultyId,termId,'Faculty Class Program').catch(e=>pushToast('error',e instanceof Error?e.message:'Could not export workbook')).finally(()=>setBusy(false));}}>Export Faculty Excel</button></div>
    </>}
    <Modal open={assign} onClose={()=>setAssign(false)} title="Assign designation" panelClassName="teaching-load-dialog"><form className="space-y-3 p-6 pt-0" onSubmit={e=>{e.preventDefault();run(mutate(`/api/faculty/${facultyId}/designations`,'POST',{designation_id:designationId,term_id:termId,hours:assignedHours,service_credit:assignedCredit}).then(()=>setAssign(false)));}}>
      <label className="block text-sm">Designation<select required className={`${field} w-full`} value={designationId} onChange={e=>{setDesignationId(e.target.value);const d=designations.find(v=>v.id===e.target.value);setAssignedHours(d?.default_hours??0);setAssignedCredit(d?.service_credit_hours??0);}}><option value="">Select…</option>{designations.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="block text-sm">Assigned hours<input className={`${field} w-full`} type="number" min="0" step="0.5" required value={assignedHours} onChange={e=>setAssignedHours(Number(e.target.value))}/></label>
      {selectedDesignation?.grants_service_credit&&<label className="block text-sm">Service Credit<input className={`${field} w-full`} type="number" min="0" step="0.5" value={assignedCredit} onChange={e=>setAssignedCredit(Number(e.target.value))}/></label>}<button disabled={busy} className={button}>Assign</button>
    </form></Modal>
    <Modal open={master} onClose={()=>setMaster(false)} title="Designation list" panelClassName="teaching-load-dialog"><div className="max-h-[70vh] overflow-y-auto p-6 pt-0"><ul className="mb-4 space-y-2">{designations.map(d=><li key={d.id} className="flex items-center justify-between gap-2 text-sm">{d.name} · {d.default_hours}h<div className="flex gap-2"><button onClick={()=>{setEditing(d.id);setDraft({name:d.name,default_hours:d.default_hours,service_credit_hours:d.service_credit_hours,grants_service_credit:d.grants_service_credit});}}>Edit</button><button className="text-red-700" onClick={()=>run(mutate(`/api/designations/${d.id}`,'DELETE'))}>Remove</button></div></li>)}</ul><form className="space-y-2" onSubmit={e=>{e.preventDefault();run(mutate(`/api/designations${editing?`/${editing}`:''}`,editing?'PATCH':'POST',draft).then(()=>{setEditing('');setDraft({name:'',default_hours:0,service_credit_hours:0,grants_service_credit:false});}));}}>
      <label className="block text-sm">Name<input required value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))} className={`${field} w-full`}/></label><label className="block text-sm">Default hours<input required min="0" step="0.5" type="number" value={draft.default_hours} onChange={e=>setDraft(v=>({...v,default_hours:Number(e.target.value)}))} className={`${field} w-full`}/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.grants_service_credit} onChange={e=>setDraft(v=>({...v,grants_service_credit:e.target.checked}))}/>Grants Service Credit</label><label className="block text-sm">Default Service Credit<input min="0" step="0.5" type="number" value={draft.service_credit_hours} onChange={e=>setDraft(v=>({...v,service_credit_hours:Number(e.target.value)}))} className={`${field} w-full`}/></label><button disabled={busy} className={button}>{editing?'Update designation':'Create designation'}</button>
    </form></div></Modal>
  </motion.div>;
}
