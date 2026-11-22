import type { CSSProperties } from 'react';
import { CalendarDaysIcon, ChartPieIcon, GridIcon, LayerGroupIcon, UsersGearIcon } from './icons';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CLASSES = [
  { day: 1, row: 2, length: 2, title: 'IT 101', detail: 'BSIT 1A · Room 201', tone: 'berry' },
  { day: 2, row: 1, length: 2, title: 'IT 202', detail: 'BSIT 2A · Lab 1', tone: 'rose' },
  { day: 3, row: 3, length: 3, title: 'IT 203 Lab', detail: 'BSIT 2B · Lab 2', tone: 'berry' },
  { day: 4, row: 2, length: 2, title: 'IT 104', detail: 'BSIT 1B · Room 202', tone: 'rose' },
  { day: 5, row: 1, length: 2, title: 'IT 305', detail: 'BSIT 3A · Room 201', tone: 'berry' },
  { day: 1, row: 6, length: 2, title: 'IT 102 Lab', detail: 'BSIT 1A · Lab 1', tone: 'rose' },
  { day: 2, row: 5, length: 2, title: 'IT 204', detail: 'BSIT 2B · Room 202', tone: 'berry' },
  { day: 4, row: 6, length: 2, title: 'IT 306', detail: 'BSIT 3A · Room 201', tone: 'berry' },
  { day: 5, row: 5, length: 2, title: 'Consultation', detail: 'Faculty function', tone: 'rose' },
  { day: 6, row: 3, length: 2, title: 'IT 301', detail: 'BSIT 3B · Lab 1', tone: 'berry' },
];

/** Shared illustration; it never reads or presents faculty's private data. */
export function SchedulePreview({ compact = false }: { compact?: boolean }): JSX.Element {
  return <div className={`landing-schedule-preview${compact ? ' is-compact' : ''}`} aria-label={compact ? undefined : 'Example weekly schedule'}>
    <aside className="landing-preview-sidebar"><div className="landing-preview-brand"><LayerGroupIcon /><b>FACILOAD</b></div>{[{ icon: GridIcon, label: 'Dashboard' }, { icon: CalendarDaysIcon, label: 'Schedule' }, { icon: UsersGearIcon, label: 'Faculty' }, { icon: ChartPieIcon, label: 'Teaching Load' }].map(({ icon: Icon, label }) => <span key={label} className={label === 'Schedule' ? 'is-active' : ''}><Icon />{label}</span>)}<div className="landing-preview-avatar"><span>MS</span><small>Maria Santos<br /><b>Faculty</b></small></div></aside>
    <div className="landing-preview-main"><div className="landing-preview-title"><div><small>2026–2027 · First semester</small><h3>Weekly Schedule</h3></div><span className="landing-preview-example">Preview</span></div>
      <div className="landing-preview-calendar"><span />{DAYS.map(day => <b key={day} className="landing-preview-day">{day}</b>)}
        {['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM'].map((time, row) => <div key={time} className="landing-preview-time" style={{ gridRow: row + 2 }}>{time}</div>)}
        {DAYS.flatMap((day, column) => Array.from({ length: 8 }, (_, row) => <span className={`landing-preview-cell${row === 4 ? ' is-lunch' : ''}`} key={`${day}-${row}`} style={{ gridColumn: column + 2, gridRow: row + 2 }} />))}
        {CLASSES.map(block => <div key={block.title} className={`landing-preview-class tone-${block.tone}`} style={{ gridColumn: block.day + 1, gridRow: `${block.row + 1} / span ${block.length}`, '--block-length': block.length } as CSSProperties}><strong>{block.title}</strong><small>{block.detail}</small></div>)}
      </div>
    </div>
  </div>;
}
