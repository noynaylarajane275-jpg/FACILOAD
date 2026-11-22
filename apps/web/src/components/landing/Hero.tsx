import { useUiStore } from '../../store/ui.store';
import { ArrowRightLongIcon } from './icons';
import { SchedulePreview } from './SchedulePreview';
import type { LandingPanel } from './Nav';

export function Hero({ onOpenPanel }: { onOpenPanel: (panel: LandingPanel) => void }): JSX.Element {
  const openLoginModal = useUiStore(state => state.openLoginModal);
  return <section className="landing-hero" aria-labelledby="landing-title">
    <div className="landing-hero-copy">
      <p className="landing-audience"><span aria-hidden="true" />Built for Industrial Technology</p>
      <h1 id="landing-title">Faculty workload<br /><span>under control.<svg viewBox="0 0 560 24" preserveAspectRatio="none" aria-hidden="true"><path d="M9 20C152 2 386-4 550 15C384 5 167 12 9 20Z" /></svg></span></h1>
      <p className="landing-hero-description">FACILOAD is the scheduling command center for Industrial Technology departments. Drop classes onto a weekly board, catch every conflict, and let each professor’s load total itself.</p>
      <div className="landing-hero-actions">
        <button type="button" className="landing-primary-button" onClick={openLoginModal}>Log in <ArrowRightLongIcon /></button>
        <button type="button" className="landing-watch-button" aria-haspopup="dialog" onClick={() => onOpenPanel('command')}><span className="landing-play" aria-hidden="true">▶</span>See what it does</button>
      </div>
    </div>
    <div className="landing-product" role="img" aria-label="Illustrative FACILOAD weekly schedule on a laptop, with a no conflicts status">
      <div className="landing-product-halo" />
      <div className="landing-laptop">
        <div className="landing-laptop-screen"><span className="landing-laptop-camera" /><SchedulePreview compact /></div>
        <div className="landing-laptop-base"><span /></div>
      </div>
      <div className="landing-product-status"><span className="landing-status-check">✓</span><span><strong>No Conflicts</strong><small>A clearer week ahead.</small></span><svg className="landing-status-rays" viewBox="0 0 40 40" aria-hidden="true"><path d="m6 24 9-8M22 15l3-12M29 25l10-2" /></svg></div>
      <div className="landing-product-shadow" />
    </div>
  </section>;
}
