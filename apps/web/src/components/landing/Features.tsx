import { CalendarDaysIcon, ChartPieIcon, GridIcon, ShieldIcon } from './icons';
import { GlowCard } from './GlowCard';

export function Features(): JSX.Element {
  return <div className="landing-dialog-cards">
    {[
      { icon: CalendarDaysIcon, title: 'A week you can work with', body: 'Plot lectures and laboratory sessions on a Monday–Saturday timetable. Move a class and keep its duration aligned to the grid.', detail: 'Schedule plotting' },
      { icon: ShieldIcon, title: 'Catch the overlap', body: 'See room and faculty conflicts before a placement is saved. Keep the reason visible when the Chair authorizes an override.', detail: 'Conflict checks' },
      { icon: ChartPieIcon, title: 'Know the whole workload', body: 'See teaching hours, preparations, overload, other functions, and designations together in Teaching Load.', detail: 'Faculty workload' },
      { icon: GridIcon, title: 'From draft to approval', body: 'Faculty update their weekly function planner. The Chair reviews the submission, approves it, and keeps the final program in sync.', detail: 'Weekly function planner' },
    ].map(({ icon: Icon, title, body, detail }) => <GlowCard key={title}><span className="landing-card-icon"><Icon /></span><h3>{title}</h3><p>{body}</p><span className="landing-card-detail">{detail}</span></GlowCard>)}
  </div>;
}
