import { CalendarDaysIcon, ChartPieIcon, ShieldIcon } from './icons';
import type { LandingPanel } from './Nav';

export function StatStrip({ onOpenPanel }: { onOpenPanel: (panel: LandingPanel) => void }): JSX.Element {
  return <section className="landing-benefits" aria-label="FACILOAD benefits">
    {[
      { title: 'Efficient Scheduling', body: 'Organize class schedules easily.', icon: CalendarDaysIcon, panel: 'features' as const },
      { title: 'Conflict Prevention', body: 'Avoid double bookings.', icon: ShieldIcon, panel: 'command' as const },
      { title: 'Smarter Management', body: 'Keep faculty workload in view.', icon: ChartPieIcon, panel: 'impact' as const },
    ].map(({ title, body, icon: Icon, panel }) => <button type="button" key={title} onClick={() => onOpenPanel(panel)} aria-haspopup="dialog"><Icon /><span><strong>{title}</strong><small>{body}</small></span></button>)}
  </section>;
}
