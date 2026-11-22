import { GlowCard } from './GlowCard';

export function Roles(): JSX.Element {
  return <div className="landing-workflow">
    <div className="landing-role-note"><span>2 roles</span><strong>Chair, Faculty</strong><p>One shared planner, with the right controls for each account.</p></div>
    <div className="landing-dialog-cards is-three">
      {[
        { number: '01', title: 'Set up the term', body: 'The Chair manages faculty, subjects, sections, and rooms, then assigns teaching workloads.' },
        { number: '02', title: 'Build the week', body: 'Plot classes in Schedule. Faculty add other functions to their weekly planner and submit their draft.' },
        { number: '03', title: 'Review and finalize', body: 'The Chair checks the timetable and hours, approves the planner, and exports the class or room program.' },
      ].map(step => <GlowCard key={step.number}><span className="landing-step-number">{step.number}</span><h3>{step.title}</h3><p>{step.body}</p></GlowCard>)}
    </div>
  </div>;
}
