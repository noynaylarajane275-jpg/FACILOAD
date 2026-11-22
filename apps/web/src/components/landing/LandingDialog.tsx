import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Features } from './Features';
import { Roles } from './Roles';
import { GlowCard } from './GlowCard';
import { SchedulePreview } from './SchedulePreview';
import { CalendarDaysIcon, ChartPieIcon, ShieldIcon } from './icons';
import { LANDING_PANELS, type LandingPanel } from './Nav';

const descriptions: Record<LandingPanel, string> = {
  features: 'The tools behind a well-planned teaching week.',
  command: 'Your schedule and faculty workload, in one place.',
  workflow: 'From term setup to an approved program.',
  impact: 'Less time untangling schedules. More time for teaching.',
};

function CommandCenter(): JSX.Element {
  const [tab, setTab] = useState<'schedule' | 'load'>('schedule');
  return <div className="landing-command-demo">
    <div className="landing-demo-toolbar"><div role="tablist" aria-label="Command Center preview" onKeyDown={event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'schedule' : event.key === 'End' ? 'load' : tab === 'schedule' ? 'load' : 'schedule';
      setTab(next); document.getElementById(`landing-${next}-tab`)?.focus();
    }}> <button type="button" role="tab" id="landing-schedule-tab" tabIndex={tab === 'schedule' ? 0 : -1} aria-selected={tab === 'schedule'} aria-controls="landing-demo-panel" onClick={() => setTab('schedule')}>Weekly schedule</button><button type="button" role="tab" id="landing-load-tab" tabIndex={tab === 'load' ? 0 : -1} aria-selected={tab === 'load'} aria-controls="landing-demo-panel" onClick={() => setTab('load')}>Teaching load</button></div><span>Illustrative preview</span></div>
    <div role="tabpanel" id="landing-demo-panel" aria-labelledby={tab === 'schedule' ? 'landing-schedule-tab' : 'landing-load-tab'}>
      {tab === 'schedule' ? <SchedulePreview /> : <div className="landing-load-demo"><div className="landing-load-person"><span>MS</span><div><h3>Maria Santos</h3><p>Faculty · First semester</p></div><b>Approved planner</b></div><div className="landing-dialog-cards is-three">{[{ label: 'Teaching hours', value: '18h' }, { label: 'Other functions', value: '10h' }, { label: 'Designations', value: '8h' }].map(item => <GlowCard key={item.label}><p>{item.label}</p><strong className="landing-demo-number">{item.value}</strong></GlowCard>)}</div><div className="landing-load-progress"><div><strong>Weekly target</strong><span>36 / 40 hours</span></div><div role="progressbar" aria-label="Example weekly target" aria-valuemin={0} aria-valuemax={40} aria-valuenow={36}><span /></div></div></div>}
    </div>
    <p className="landing-demo-caption">An example of the workspace. Sign in to view your department’s actual schedules.</p>
  </div>;
}

function Impact(): JSX.Element {
  return <div className="landing-dialog-cards is-three">{[
    { icon: CalendarDaysIcon, title: 'Plan once', body: 'Shared sections and assignments keep room schedules, faculty programs, and teaching loads connected.', detail: 'Connected records' },
    { icon: ShieldIcon, title: 'Review with context', body: 'Check the submitted timetable and plotted hours together before making an approval decision.', detail: 'Clear approvals' },
    { icon: ChartPieIcon, title: 'Take the program with you', body: 'Export the formatted faculty, section, or classroom program to Excel, ready for review and printing.', detail: 'Formatted exports' },
  ].map(({ icon: Icon, title, body, detail }) => <GlowCard key={title}><span className="landing-card-icon"><Icon /></span><h3>{title}</h3><p>{body}</p><span className="landing-card-detail">{detail}</span></GlowCard>)}</div>;
}

export function LandingDialog({ panel, onClose }: { panel: LandingPanel | null; onClose: () => void }): JSX.Element {
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.landing-info-dialog button')?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = [...document.querySelectorAll<HTMLElement>('.landing-info-dialog button:not(:disabled), .landing-info-dialog a[href], .landing-info-dialog [tabindex="0"]')].filter(node => node.tabIndex >= 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [panel]);
  const title = LANDING_PANELS.find(item => item.id === panel)?.label ?? '';
  return <Modal open={panel !== null} title={title} onClose={onClose} panelClassName="landing-info-dialog">
    {panel && <><p className="landing-dialog-intro">{descriptions[panel]}</p>{panel === 'features' ? <Features /> : panel === 'workflow' ? <Roles /> : panel === 'command' ? <CommandCenter /> : <Impact />}</>}
  </Modal>;
}
