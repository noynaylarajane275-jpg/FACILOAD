import { StudentClassProgramSheet } from '../components/StudentClassProgramSheet';
import { useSectionRevision } from '../hooks/useSectionRevision';
import { useEffect,useState } from 'react';
import { useParams,useSearchParams } from 'react-router-dom';
import { apiAssetUrl } from '../lib/api';
import { getProgramForm,type ProgramForm } from '../lib/program-forms';
import { FUNCTION_COLORS } from './TeachingLoadPlanner';
import { downloadProgramWorkbook } from '../lib/program-download';
import './program-print.css';
import './student-program.css';
const days=['MON','TUE','WED','THU','FRI','SAT'];
const minutes=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3,5));
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const facultyClock=(n:number)=>`${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')}`;
/** Keep explicitly overridden clashes visible in separate lanes on the form. */
export function layoutProgramBlocks<T extends {day:string;start:string;end:string}>(input:T[]){
  const output:(T&{lane:number;lanes:number})[]=[];
  for(const day of days){
    let group:(T&{lane:number})[]=[],ends:number[]=[],groupEnd=0;
    const flush=()=>{output.push(...group.map(block=>({...block,lanes:ends.length})));group=[];ends=[];groupEnd=0;};
    for(const block of input.filter(b=>b.day===day).sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end))){
      const start=minutes(block.start),end=minutes(block.end);
      if(group.length&&start>=groupEnd)flush();
      let lane=ends.findIndex(value=>value<=start);if(lane<0)lane=ends.length;
      ends[lane]=end;groupEnd=Math.max(groupEnd,end);group.push({...block,lane});
    }
    flush();
  }
  return output;
}
export function ProgramTimetable({form}:{form:ProgramForm}){
  const blocks=layoutProgramBlocks([...form.slots.map(s=>({id:s.id,day:s.day_of_week,start:s.start_time,end:s.end_time,label:`${s.subject_code}${s.session_type==='LAB'?' L':''}\n${s.section_label}\n${s.room_name??'TBA'}`,color:s.color??'#D1FAE5'})),...(form.load?.sessions??[]).map(s=>({id:s.id,day:s.day_of_week,start:s.start_time,end:s.end_time,label:s.type,color:FUNCTION_COLORS[s.type]}))]);
  const start=Math.floor(Math.min(420,...blocks.map(b=>minutes(b.start)))/30)*30,end=Math.ceil(Math.max(1200,...blocks.map(b=>minutes(b.end)))/30)*30;
  const rows=Array.from({length:(end-start)/30},(_,i)=>start+i*30);
  const heights=rows.map(()=>18);
  for(const block of blocks){const first=Math.max(0,Math.floor((minutes(block.start)-start)/30)),last=Math.ceil((minutes(block.end)-start)/30);const lines=block.label.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/Math.max(8,32/block.lanes))),0);const required=(lines*11+6)/(last-first);for(let i=first;i<last;i++)heights[i]=Math.max(heights[i],required);}
  const offsets=[0];for(const height of heights)offsets.push(offsets[offsets.length-1]+height);
  return <div className="program-timetable" style={{gridTemplateColumns:'70px repeat(6,minmax(0,1fr))'}}><strong>TIME</strong>{days.map(day=><strong key={day}>{day}</strong>)}<div>{rows.map((v,i)=><div className="program-period" style={{height:heights[i]}} key={v}>{clock(v)}–{clock(v+30)}</div>)}</div>
    {days.map(day=><div key={day} className="program-day" style={{height:offsets[offsets.length-1]}}>{rows.map((v,i)=><div key={v} style={{height:heights[i]}} className="program-period"/>)}{blocks.filter(b=>b.day===day).map(b=><div key={b.id} className="program-block" style={{left:`calc(${b.lane*100/b.lanes}% + 1px)`,right:'auto',width:`calc(${100/b.lanes}% - 2px)`,top:offsets[Math.floor((minutes(b.start)-start)/30)],height:offsets[Math.ceil((minutes(b.end)-start)/30)]-offsets[Math.floor((minutes(b.start)-start)/30)],background:b.color,color:'#000000'}}>{b.label}</div>)}</div>)}
  </div>;
}
export function ProgramLoadSummary({form}:{form:ProgramForm}){
  const load=form.load;if(!load)return null;
  const metrics=[['Lecture hours',load.lecture_hours],['Laboratory hours',load.lab_hours],['Weighted laboratory hours',load.weighted_lab_hours],['Teaching hours',load.teaching_hours],['Preparations',load.preps],['Regular ceiling',`${load.prep_ceiling} (${load.prep_ceiling_source})`],['Regular teaching hours',load.regular_teaching_hours],['Teaching Overload',load.teaching_overload],['Claimable overload',load.claimable_overload_hours],['Overload plotted',load.overload_plotted_hours],['Claim for Teaching Overload',load.claim_session_hours],['Overload remaining to plot',load.overload_remaining_to_plot],['Teaching Service Credit',load.teaching_service_credit],['Service Credits (not counted in 40)',load.service_credits],...Object.entries(load.functions).map(([key,value])=>[`${key} (plotted / counted)`,`${value.plotted} / ${value.counted}`]),['Designation hours',load.designation_hours],['Total faculty time / target',`${load.total_faculty_time} / ${load.weekly_hours}`],['Remaining to target',load.remaining_to_target]];
  return <div className="program-summary"><h2>Teaching Load</h2><table><tbody>{metrics.map(([label,value])=><tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
    <h3>Designations</h3><table><thead><tr><th>Designation</th><th>Assigned</th><th>Plotted</th><th>Counted</th><th>Accepted</th></tr></thead><tbody>{load.designations.map(d=><tr key={d.id}><td>{d.name}</td><td>{d.hours}</td><td>{d.plotted_hours}</td><td>{d.counted_hours}</td><td>{d.accepted?'Yes':'No'}</td></tr>)}</tbody></table>
    <h3>Claim for Teaching Overload — sessions</h3><table><tbody>{load.sessions.filter(s=>s.type==='OVERLOAD').map(s=><tr key={s.id}><td>{s.day_of_week}</td><td>{s.start_time}–{s.end_time}</td></tr>)}</tbody></table>
    <h3>Students per distinct section</h3><table><tbody>{load.students_by_section.map(s=><tr key={s.section_id}><td>{s.section_name}</td><td>{s.student_count??'Not entered'}</td></tr>)}<tr><th>Total students</th><td>{load.total_students}</td></tr></tbody></table>
    {load.warnings.length>0&&<div className="program-warnings"><h3>Warnings</h3><ul>{load.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
  </div>;
}
const FACULTY_DAYS=['MON','TUE','WED','THU','FRI'];
type PrintBlock={id:string;day:string;start:string;end:string;label:string;color:string};
export function FacultyReferenceTimetable({form,referenceStyle=false}:{form:ProgramForm;referenceStyle?:boolean}){
  const blocks:PrintBlock[]=[...form.slots.map(s=>({id:s.id,day:s.day_of_week,start:s.start_time,end:s.end_time,label:`${s.subject_code}${s.session_type==='LAB'?' LAB':''}\n${s.section_label}\n${s.room_name??'TBA'}`,color:s.color??'#D1FAE5'})),...(form.load?.sessions??[]).map(s=>({id:s.id,day:s.day_of_week,start:s.start_time,end:s.end_time,label:s.type,color:FUNCTION_COLORS[s.type]}))];
  const start=420,end=1140;
  const lunchFree=true;
  const rowHeight=referenceStyle?24:16;
  const periods:{start:number;end:number;lunch:boolean;height:number}[]=[];
  for(let value=start;value<end;){const lunch=lunchFree&&value===720;const next=lunch?780:value+30;periods.push({start:value,end:next,lunch,height:lunch?rowHeight*2:rowHeight});value=next;}
  const offsets=[0];for(const p of periods)offsets.push(offsets[offsets.length-1]+p.height);
  const offset=(value:number)=>{let total=0;for(const p of periods){if(value<=p.start)return total;if(value>=p.end){total+=p.height;continue;}return total+(value-p.start)/(p.end-p.start)*p.height;}return total;};
  const days=FACULTY_DAYS;
  const placed=layoutProgramBlocks(blocks).filter(b=>days.includes(b.day));
  return <div className="faculty-reference-grid" style={{gridTemplateColumns:`58px repeat(${days.length},minmax(0,1fr))`}}><strong className="frg-head">TIME / PERIOD</strong>{days.map(d=><strong className="frg-head" key={d}>{({MON:'MONDAY',TUE:'TUESDAY',WED:'WEDNESDAY',THU:'THURSDAY',FRI:'FRIDAY',SAT:'SATURDAY'} as Record<string,string>)[d]}</strong>)}
    <div className="frg-times">{periods.map(p=><div key={p.start} className={p.lunch?'frg-lunch-time':''} style={{height:p.height}}>{p.lunch?<>12:00 PM<br/>- 1:00 PM</>:<>{facultyClock(p.start)} - {facultyClock(p.end)}</>}</div>)}</div>
    {days.map(day=><div key={day} className="frg-day" style={{height:offsets.at(-1)}}>{periods.map(p=><div key={p.start} className="frg-cell" style={{height:p.height}}/>)}{placed.filter(b=>b.day===day).map(b=>{const lunchConflict=minutes(b.start)<780&&minutes(b.end)>720;return <div key={b.id} className={`frg-block${lunchConflict?' frg-block-lunch-conflict':''}`} title={lunchConflict?'Scheduled during lunch break — review conflict':undefined} style={{top:offset(minutes(b.start)),height:Math.max(rowHeight,offset(minutes(b.end))-offset(minutes(b.start))),left:`calc(${b.lane*100/b.lanes}% + 1px)`,width:`calc(${100/b.lanes}% - 2px)`,background:b.color,color:'#000000'}}>{b.label}</div>;})}</div>)}
    {start<=720&&end>=780&&<div className="frg-lunch" style={{top:`calc(var(--frg-header-height) + ${offset(720)}px)`,height:rowHeight*2}}><span>LUNCH BREAK</span></div>}
  </div>;
}
function FacultyWorkloadTable({form}:{form:ProgramForm}){
  const load=form.load;if(!load)return null;
  const assignments=form.assignments??[];
  const functions=[['Research',load.functions.research],['Extension',load.functions.extension],['IMP',load.functions.imp],['Consultation',load.functions.consultation]] as const;
  const designations=[load.designations[0],load.designations[1]];
  const assignmentRows=Array.from({length:8},(_,index)=>assignments[index]);
  const weightedTotal=(a:NonNullable<typeof assignments[number]>)=>a.lecture_hours+a.lab_hours*(load.lab_hours?load.weighted_lab_hours/load.lab_hours:0.7);
  return <div className="faculty-reference-load">
    <table className="frl-table"><colgroup><col/><col/><col/><col/><col/><col/></colgroup><thead><tr><th>Workload</th><th>Lecture Hrs/Wk</th><th>Lab Hrs./Wk</th><th>Total</th><th colSpan={2}>Remarks</th></tr></thead><tbody>
      <tr className="frl-section"><th colSpan={4}>A. Teaching Load:</th><td>No. of Preparations:</td><td>{load.preps}</td></tr>
      {assignmentRows.map((a,index)=><tr key={a?.id??`teaching-${index}`} className="frl-data-row"><td>{a?`${a.subject_code} ${a.section_label}`:''}</td><td>{a?.lecture_hours.toFixed(2)??''}</td><td>{a?.lab_hours.toFixed(2)??''}</td><td>{a?weightedTotal(a).toFixed(2):''}</td><td>{index===0?'Service Credits:':index===2?'Teaching Overload:':''}</td><td>{index===0?load.service_credits.toFixed(2):index===2?load.teaching_overload.toFixed(2):''}</td></tr>)}
      <tr className="frl-subtotal"><th>Sub-Total</th><td>{load.lecture_hours.toFixed(2)}</td><td>{load.lab_hours.toFixed(2)}</td><td>{load.teaching_hours.toFixed(2)}</td><td colSpan={2}></td></tr>
      <tr className="frl-spacer"><td colSpan={6}></td></tr>
      <tr className="frl-section"><th colSpan={4}>B. Other Functions:</th><td>Total Number of Students:</td><td>{load.total_students}</td></tr>
      {functions.map(([name,value])=><tr key={name}><td>{name}</td><td>{value.counted.toFixed(2)}</td><td></td><td></td><td colSpan={2}></td></tr>)}
      <tr className="frl-subtotal"><th>Sub-Total</th><td>{functions.reduce((sum,[,value])=>sum+value.counted,0).toFixed(2)}</td><td></td><td>{functions.reduce((sum,[,value])=>sum+value.counted,0).toFixed(2)}</td><td colSpan={2}></td></tr>
      <tr className="frl-spacer"><td colSpan={6}></td></tr>
      <tr className="frl-section"><th colSpan={4}>C. Designation</th><td>TOTAL:</td><td>{load.designation_hours.toFixed(2)}</td></tr>
      {['Dept.Chair','BITS Adviser'].map((label,index)=><tr key={label}><td>{label}</td><td>{designations[index]?.hours.toFixed(2)??''}</td><td></td><td>{designations[index]?.counted_hours.toFixed(2)??''}</td><td colSpan={2}></td></tr>)}
      <tr className="frl-subtotal"><th>Sub-Total</th><td>{load.designation_hours.toFixed(2)}</td><td></td><td>{load.designation_hours.toFixed(2)}</td><td colSpan={2}></td></tr>
      <tr className="frl-spacer"><td colSpan={6}></td></tr>
      <tr className="frl-grand"><th colSpan={3}>Grand Total (A+B+C)</th><th>{load.total_faculty_time.toFixed(2)}</th><td colSpan={2}></td></tr>
    </tbody></table>
  </div>;
}
function FacultyClassProgramSheet({form,signatures}:{form:ProgramForm;signatures:{slot:string;name:string;title:string}[]}){
  return <article className="program-sheet faculty-reference-sheet"><header className="frh">
    <div className="frh-school-logo">{form.settings.school_logo_path&&<img src={apiAssetUrl(form.settings.school_logo_path)??''} alt="PIT logo"/>}</div>
    <div className="frh-cote-logo"><img src="/cote-logo.png" alt="College of Technology and Engineering logo"/></div>
    <div className="frh-school"><p>{form.settings.school_lines.split('\n').map((line,i)=><span key={i}>{line}<br/></span>)}</p><p><b>{form.settings.college_lines}</b></p><h1>INSTRUCTOR'S CLASS PROGRAM</h1></div>
    <div className="frh-control"><p>Ref. Code : {form.template.ref_code||'PIT-COTE-FOR-3-2-01B'}</p><p>Rev. No. : {form.template.revision||'00'}</p><p>Page No. : 1 of 1</p><p>Date : March 21, 2022</p><p>Prep. By : Process Owner</p><p>Rev. by : QMS-DIRC</p><p>Appr. By :</p></div>
  </header><div className="frh-spacer"/><section className="frh-fields"><p><b>Name:</b> {form.entity.name}</p><p><b>Term:</b> {form.term.label}</p><p><b>Academic Rank:</b> {form.entity.rank??''}</p><p><b>Department:</b> {form.settings.department}</p><p></p><p><b>College:</b> {form.settings.college_lines}</p></section><div className="frh-spacer"/>
    <FacultyReferenceTimetable form={form} referenceStyle/><p className="frh-directions">Indicate subject, year, section, and room.</p><div className="frh-spacer"/><FacultyWorkloadTable form={form}/><div className="frh-spacer"/>
    <table className="frh-signatures"><tbody><tr><th>ACTION TAKEN</th><th colSpan={2}>NAME</th><th colSpan={2}>POSITION</th><th>SIGNATURE</th></tr>{signatures.map((s,index)=><tr key={s.slot}><td>{['Prepared by:','Reviewed by:','Verified by:','Approved by:'][index]??`${s.slot} by:`}</td><td colSpan={2}>{s.name}</td><td colSpan={2}>{['Faculty','Chair','Dean, COTE','VP-Academic Affairs'][index]??s.title}</td><td></td></tr>)}</tbody></table>
  </article>;
}
export function ProgramPrintPage(){
  const sectionRevision = useSectionRevision();
  const {kind='',id=''}=useParams();const [query]=useSearchParams();const termId=query.get('termId')??'';
  const [form,setForm]=useState<ProgramForm|null>(null),[error,setError]=useState(''),[tick,setTick]=useState(0);
  const [selected,setSelected]=useState<Record<string,string>>({}),[custom,setCustom]=useState<Record<string,string>>({});
  const [downloading,setDownloading]=useState(false),[exportError,setExportError]=useState('');
  useEffect(()=>{let active=true;setForm(null);setError('');void getProgramForm(kind,id,new URLSearchParams({termId})).then(data=>{if(active){setForm(data);setSelected(Object.fromEntries(data.signatures.map(s=>[s.slot,s.option_id??'custom'])));setCustom(Object.fromEntries(data.signatures.map(s=>[s.slot,s.name])));}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load form');});return()=>{active=false;};},[kind,id,termId,tick,sectionRevision]);
  useEffect(()=>{document.body.classList.add('printing-program');return()=>document.body.classList.remove('printing-program');},[]);
  useEffect(()=>{
    if(form?.kind!=='faculty'&&form?.kind!=='sections')return;
    const printPageStyle=document.createElement('style');
    printPageStyle.dataset.facultyClassProgram='true';
    printPageStyle.textContent=form.kind==='sections'?'@media print { @page { size: A4 portrait; margin: .3in .25in; } }':'@media print { @page { size: 8in 13in; margin: .2in; } }';
    document.head.append(printPageStyle);
    return()=>printPageStyle.remove();
  },[form?.kind]);
  if(error)return <div role="alert">{error}<button onClick={()=>setTick(n=>n+1)}>Retry</button></div>;
  if(!form)return <p role="status">Loading program form…</p>;
  const signatures=form.signatures.map(s=>{const option=form.signatory_options.find(o=>o.id===selected[s.slot]);return {...s,name:selected[s.slot]==='custom'?custom[s.slot]??'':option?.name??s.name,title:selected[s.slot]==='custom'?'':option?.title??s.title};});
  const invalid=signatures.filter(s=>form.kind!=='sections'||s.slot==='PREPARED').some(s=>!s.name.trim());
  return <div className={`program-print-root${form.kind==='faculty'?' print-faculty-class-program':form.kind==='sections'?' print-student-class-program':''}`}><div className="no-print mb-5 rounded-xl border border-leaf-200 bg-white p-4"><h1 className="text-lg font-semibold">Print {form.template.title}</h1><p className="my-2 text-sm">Choose signatories before printing. Custom names apply to this print only.</p><div className="flex flex-wrap gap-3">{signatures.filter(s=>form.kind!=='sections'||s.slot==='PREPARED').map(s=><label key={s.slot} className="text-sm">{s.slot}<select aria-label={`${s.slot} signatory`} className="mx-2 rounded border p-2" value={selected[s.slot]??''} onChange={e=>setSelected(v=>({...v,[s.slot]:e.target.value}))}>{form.signatory_options.filter(o=>o.slot===s.slot).map(o=><option key={o.id} value={o.id}>{o.name} — {o.title}</option>)}<option value="custom">Custom name</option></select>{selected[s.slot]==='custom'&&<input aria-label={`${s.slot} custom name`} maxLength={160} className="rounded border p-2" value={custom[s.slot]??''} onChange={e=>setCustom(v=>({...v,[s.slot]:e.target.value}))}/>}</label>)}</div><button disabled={invalid} onClick={()=>window.print()} className="mt-3 rounded-lg bg-leaf-500 px-4 py-2 disabled:opacity-50">Print program</button>{form.kind!=='sections'&&!form.template.ref_code&&<p className="mt-2 text-sm text-amber-700">This form’s approved reference code needs to be set in Form Settings.</p>}{form.kind!=='sections'&&!form.settings.tuv_logo_path&&<p className="mt-2 text-sm text-amber-700">TUV NORD logo has not been uploaded.</p>}</div>
    <div className="no-print mb-4"><button disabled={invalid||downloading} onClick={()=>{setDownloading(true);setExportError('');const signatures=Object.fromEntries(form.signatures.filter(s=>form.kind!=='faculty'||s.slot!=='PREPARED').map(s=>[`sig_${s.slot.toLowerCase()}`,selected[s.slot]==='custom'?custom[s.slot]:selected[s.slot]]));void downloadProgramWorkbook(form.kind,form.entity.id,termId,`${form.template.title} - ${form.entity.name}`,signatures).catch(e=>setExportError(e instanceof Error?e.message:'Could not export workbook')).finally(()=>setDownloading(false));}} className="rounded-lg border border-leaf-300 bg-white px-4 py-2 disabled:opacity-50">{downloading?'Preparing Excel…':'Export Excel with these signatories'}</button>{exportError&&<p role="alert" className="text-red-700">{exportError}</p>}</div>
    {form.kind==='faculty'?<FacultyClassProgramSheet form={form} signatures={signatures}/>:form.kind==='sections'?<StudentClassProgramSheet form={form} preparedBy={signatures.find(s=>s.slot==='PREPARED')?.name??''} preparedTitle={signatures.find(s=>s.slot==='PREPARED')?.title??''}/>:<article className="program-sheet"><div className="program-header"><div>{form.settings.school_logo_path&&<img src={apiAssetUrl(form.settings.school_logo_path)??''} alt="School logo"/>}</div><div>{form.settings.school_lines.split('\n').map((line,i)=><p key={i}>{line}</p>)}<h1>{form.template.title}</h1><p>{form.term.label}</p></div><div className="program-control">{form.settings.tuv_logo_path&&<img src={apiAssetUrl(form.settings.tuv_logo_path)??''} alt="TUV NORD logo"/>}<p>Ref. Code: {form.template.ref_code}</p><p>Revision: {form.template.revision}</p></div></div>
      <div className="program-fields"><p><strong>Room:</strong> {form.entity.name}</p><p><strong>Effectivity:</strong> {form.effectivity.start??'Not set'} to {form.effectivity.end??'Not set'}</p><p><strong>College:</strong> {form.settings.college_lines}</p><p><strong>Department:</strong> {form.settings.department}</p><p><strong>Program:</strong> {form.settings.program}</p>{form.entity.rank&&<p><strong>Academic rank:</strong> {form.entity.rank}</p>}</div>
      <ProgramTimetable form={form}/><ProgramLoadSummary form={form}/><div className="program-signatures">{signatures.map(s=><div key={s.slot}><p>{s.slot} BY:</p><strong>{s.name}</strong><p>{s.title}</p></div>)}</div>
    </article>}</div>;
}
