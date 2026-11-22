import { useRef,useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { pointerWithin, rectIntersection, type Modifier } from '@dnd-kit/core';
import { DndContext,DragOverlay,PointerSensor,KeyboardSensor,useSensor,useSensors,useDraggable,useDroppable,type DragEndEvent,type DragStartEvent } from '@dnd-kit/core';
import { motion,useReducedMotion } from 'framer-motion';
import { DurationPicker } from './Schedule/SchedulePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { type FacultySession,type FunctionType,type LoadDesignation,sessionDuration } from '../lib/teaching-load';
import type { ScheduleSlot } from '../lib/schedule-slots';
import { formatTime12h } from './Schedule/schedule-time';
export const FUNCTION_COLORS:Record<FunctionType,string>={RESEARCH:'#D1FAE5',EXTENSION:'#DBEAFE',IMP:'#EDE9FE',CONSULTATION:'#FEF3C7',DESIGNATION:'#FCE7F3',OVERLOAD:'#FFEDD5'};
const days=['MON','TUE','WED','THU','FRI','SAT'];
const anchorNewBlock: Modifier = ({transform,activatorEvent,activeNodeRect,active}) => {
  if (active?.data.current?.sessionId || !activeNodeRect || !activatorEvent || !('clientX' in activatorEvent)) return transform;
  const pointer = activatorEvent as PointerEvent;
  return {...transform,x:transform.x + pointer.clientX-activeNodeRect.left,y:transform.y + pointer.clientY-activeNodeRect.top};
};
const mins=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
const time=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export type SessionInput=Omit<FacultySession,'id'>;
function Chip({type,id,label}:{type:FunctionType;id?:string;label:string}){
  const drag=useDraggable({id:`chip-${type}-${id??''}`,data:{type,faculty_designation_id:id??null}});
  return <button ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="tlp-chip rounded-full border border-black px-3 py-2 text-xs font-semibold text-black touch-none" style={{background:FUNCTION_COLORS[type]}}>{label}</button>;
}
function DropCell({day,start}:{day:string;start:string}){
  const drop=useDroppable({id:`${day}-${start}`,data:{day,start}});
  return <div ref={drop.setNodeRef} className={`tlp-drop-cell h-7 border-b border-black ${drop.isOver?'tlp-drop-active':'bg-white'}`} aria-label={`${day} ${formatTime12h(start)}`} />;
}
function SessionBlock({session,start,onDelete,readOnly}:{session:FacultySession;start:number;onDelete:(session:FacultySession)=>void;readOnly:boolean}){
  const drag=useDraggable({id:session.id,data:{...session,sessionId:session.id},disabled:readOnly});
  return <div ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} style={{position:'absolute',top:(mins(session.start_time)-start)/30*28,height:sessionDuration(session)*56,left:2,right:2,background:FUNCTION_COLORS[session.type],zIndex:drag.isDragging?30:10}} className={`tlp-session group overflow-hidden rounded border border-ink/20 p-1 text-[10px] text-ink touch-none ${drag.isDragging?'opacity-0':''}`}>
    <strong>{session.type}</strong><div>{formatTime12h(session.start_time)} - {formatTime12h(session.end_time)}</div>
    {!readOnly&&<button className="tlp-remove absolute right-1 bottom-1 rounded border border-black bg-white px-1 font-semibold text-black" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onDelete(session);}} aria-label={`Remove ${session.type} ${session.day_of_week} ${formatTime12h(session.start_time)}`}>Remove</button>}
  </div>;
}
export function TeachingLoadPlanner({slots,sessions,designations,minimum,onSave,onDelete,readOnly=false}:{slots:ScheduleSlot[];sessions:FacultySession[];designations:LoadDesignation[];minimum:number;onSave:(data:SessionInput,id?:string)=>Promise<void>;onDelete:(id:string)=>void;readOnly?:boolean}){
  const reduce=useReducedMotion();
  const gridMinimum=Math.ceil(minimum*2)/2;
  const maximum=23.5;
  const [duration,setDuration]=useState(Math.max(1,gridMinimum));
  const [message,setMessage]=useState('');const [shake,setShake]=useState(0);
  const [activeDrag,setActiveDrag]=useState<Record<string,unknown>|null>(null);
  const [sessionToDelete,setSessionToDelete]=useState<FacultySession|null>(null);
  const [activeWidth,setActiveWidth]=useState(132);const [activeHeight,setActiveHeight]=useState(56);const gridRef=useRef<HTMLDivElement|null>(null);
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor));
  const start=Math.min(420,...slots.map(s=>mins(s.start_time)),...sessions.map(s=>mins(s.start_time)));
  const end=Math.max(1200,...slots.map(s=>mins(s.end_time)),...sessions.map(s=>mins(s.end_time)));
  const periods=Array.from({length:Math.ceil((end-start)/30)},(_,i)=>time(start+i*30));
  const activeHours=activeDrag?.sessionId?sessionDuration(activeDrag as unknown as FacultySession):duration;
  async function save(data:SessionInput,id?:string){setMessage('');try{await onSave(data,id);}catch(error){setMessage(error instanceof Error?error.message:'Could not save session');setShake(n=>n+1);}}
  function onDrop(event:DragEndEvent){
    if(readOnly)return;
    const data=event.active.data.current;const target=event.over?.data.current;if(!data || !target)return;
    const hours=data.sessionId?sessionDuration(data as FacultySession):duration;
    const column=gridRef.current?.querySelector<HTMLElement>(`.tlp-day-column[data-day="${target.day}"]`);
    const cell=column?.querySelector<HTMLElement>('.tlp-drop-cell');
    const translated=event.active.rect.current.translated;
    const dropStart=data.sessionId && column && cell && translated ? start+Math.max(0,Math.round((translated.top-column.getBoundingClientRect().top)/cell.getBoundingClientRect().height))*30 : mins(target.start);
    const end=dropStart+hours*60;
    if(end>=1440){setMessage('Session must end before midnight');return;}
    void save({type:data.type,faculty_designation_id:data.faculty_designation_id,day_of_week:target.day,start_time:time(dropStart),end_time:time(end)},data.sessionId);
  }
  return <section className={`teaching-load-planner${readOnly?' tlp-read-only':''}`}>
    <div className="tlp-section-heading"><div><p className="tlp-kicker">Function schedule</p><h2>{readOnly?'Submitted weekly timetable':'Weekly function planner'}</h2><p>{readOnly?'This is the immutable timetable snapshot attached to this submission.':'Plot faculty functions alongside the read-only teaching schedule. Sessions align to 30-minute slots.'}</p></div>{!readOnly&&<span className="tlp-duration-note">Minimum {minimum}h · overload in whole hours</span>}</div>
    {!readOnly&&<DurationPicker value={duration} remaining={maximum} cap={maximum} minimum={gridMinimum} note={`Minimum ${minimum}h; overload requires whole hours.`} onStep={delta=>setDuration(v=>Math.max(gridMinimum,Math.min(maximum,v+delta*.5)))} onCommit={raw=>{const v=Number(raw);if(Number.isFinite(v)&&v>=gridMinimum&&v<=maximum&&Number.isInteger(v*2))setDuration(v);}} />}
    <motion.div key={shake} animate={reduce?{}:{x:message?[0,-5,5,-3,0]:0}}>{message&&<p role="alert" className="my-2 text-sm text-red-700">{message}</p>}</motion.div>
    <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)} onDragStart={(event:DragStartEvent)=>{setActiveDrag(event.active.data.current as Record<string,unknown>);const column=gridRef.current?.querySelector<HTMLElement>('.tlp-day-column');const cell=column?.querySelector<HTMLElement>('.tlp-drop-cell');const rect=event.active.rect.current.initial;const scale=cell ? cell.getBoundingClientRect().height/28 : 1;const hours=event.active.data.current?.sessionId?sessionDuration(event.active.data.current as FacultySession):duration;setActiveWidth(event.active.data.current?.sessionId && rect ? rect.width : Math.max(40,(column?.getBoundingClientRect().width ?? 136)-4*scale));setActiveHeight(event.active.data.current?.sessionId && rect ? rect.height : hours*56*scale);}} onDragEnd={event=>{onDrop(event);setActiveDrag(null);}} onDragCancel={()=>setActiveDrag(null)}>
      {!readOnly&&<div className="tlp-palette" aria-label="Session types and color legend">{(['RESEARCH','EXTENSION','IMP','CONSULTATION','OVERLOAD'] as FunctionType[]).map(t=><Chip key={t} type={t} label={t} />)}{designations.map(d=><Chip key={d.id} type="DESIGNATION" id={d.id} label={d.name}/>)}</div>}
      {readOnly&&<div className="tlp-palette tlp-read-only-legend" aria-label="Session color legend">{(['RESEARCH','EXTENSION','IMP','CONSULTATION','OVERLOAD'] as FunctionType[]).map(t=><span key={t} style={{'--session-color':FUNCTION_COLORS[t]} as CSSProperties}>{t}</span>)}{designations.map(d=><span key={d.id} style={{'--session-color':FUNCTION_COLORS.DESIGNATION} as CSSProperties}>{d.name}</span>)}</div>}
      <div className="tlp-viewport"><div ref={gridRef} className="tlp-grid grid min-w-[900px]" style={{gridTemplateColumns:'76px repeat(6,minmax(120px,1fr))'}}>
        <div className="tlp-heading text-xs">TIME</div>{days.map(d=><div key={d} className="tlp-heading text-center text-xs font-semibold">{d}</div>)}
        <div>{periods.map(t=><div key={t} className="tlp-time h-7 border-b text-[10px]">{formatTime12h(t)}</div>)}</div>
        {days.map(d=><div key={d} data-day={d} className="tlp-day-column relative border-l border-black" style={{height:periods.length*28}}>
          {periods.includes('12:00')&&periods.includes('12:30')&&<div aria-label="Lunch break from 12:00 PM to 1:00 PM" className="tlp-lunch-band" style={{top:(mins('12:00')-start)/30*28,height:56}}><span>12:00 PM – 1:00 PM · LUNCH</span></div>}
          {periods.map(t=><DropCell key={t} day={d} start={t}/>)}
          {slots.filter(s=>s.day_of_week===d).map(s=><div key={s.id} className="tlp-teaching pointer-events-none absolute left-1 right-1 overflow-hidden rounded p-1 text-[10px]" style={{top:(mins(s.start_time)-start)/30*28,height:(mins(s.end_time)-mins(s.start_time))/30*28}}>{s.subject_code}<br/>{s.section_label}<br/>{s.room_name??'TBA'}</div>)}
          {sessions.filter(s=>s.day_of_week===d).map(s=><SessionBlock key={s.id} session={s} start={start} onDelete={setSessionToDelete} readOnly={readOnly}/>)}
        </div>)}
      </div></div>
      {!readOnly&&createPortal(<DragOverlay modifiers={[anchorNewBlock]} zIndex={1000} adjustScale={false} dropAnimation={null}>
        {activeDrag&&<div className="tlp-drag-overlay box-border overflow-hidden rounded border border-dashed border-black p-1 text-[10px] text-black" style={{width:activeWidth,height:activeHeight,backgroundColor:'#FFFFFF',opacity:.45}}>{String(activeDrag.type??'SESSION')}<br/>{activeDrag.start_time&&activeDrag.end_time?`${formatTime12h(String(activeDrag.start_time))} – ${formatTime12h(String(activeDrag.end_time))}`:`${activeHours} hour${activeHours===1?'':'s'} · drop into a time slot`}</div>}
      </DragOverlay>,document.body)}
    </DndContext>
    {!readOnly&&<ConfirmDialog open={Boolean(sessionToDelete)} title="Remove function session?" message={sessionToDelete?`Remove the ${sessionToDelete.type.toLowerCase()} session on ${sessionToDelete.day_of_week} from ${formatTime12h(sessionToDelete.start_time)} to ${formatTime12h(sessionToDelete.end_time)}?`:''} confirmLabel="Remove session" onConfirm={()=>{if(sessionToDelete){onDelete(sessionToDelete.id);setSessionToDelete(null);}}} onCancel={()=>setSessionToDelete(null)} />}
  </section>;
}

