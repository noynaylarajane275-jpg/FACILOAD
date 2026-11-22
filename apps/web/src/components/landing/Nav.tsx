import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUiStore } from '../../store/ui.store';
import { ArrowRightIcon, BarsIcon, LayerGroupIcon, XMarkIcon } from './icons';

export type LandingPanel = 'features' | 'command' | 'workflow' | 'impact';
export const LANDING_PANELS: { id: LandingPanel; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'command', label: 'Command Center' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'impact', label: 'Impact' },
];

export function Nav({ onOpenPanel }: { onOpenPanel: (panel: LandingPanel) => void }): JSX.Element {
  const openLoginModal = useUiStore(state => state.openLoginModal);
  const [mobileOpen, setMobileOpen] = useState(false);
  function openPanel(panel: LandingPanel): void { setMobileOpen(false); onOpenPanel(panel); }
  return <header className="landing-header">
    <nav aria-label="Landing" className="landing-nav">
      <Link to="/" className="landing-brand" aria-label="FACILOAD home"><span className="landing-brand-mark"><LayerGroupIcon /></span><span>FACILOAD</span></Link>
      <div className="landing-nav-links">{LANDING_PANELS.map(item => <button type="button" key={item.id} aria-haspopup="dialog" onClick={() => openPanel(item.id)}>{item.label}</button>)}</div>
      <div className="landing-nav-actions">
        <button type="button" className="landing-nav-login" onClick={openLoginModal}>Log in</button>
        <span className="landing-nav-divider" aria-hidden="true" />
        <button type="button" className="landing-nav-start" onClick={openLoginModal}>Get Started <ArrowRightIcon /></button>
        <button type="button" className="landing-mobile-toggle" onClick={() => setMobileOpen(value => !value)} aria-label="Toggle navigation menu" aria-expanded={mobileOpen} aria-controls="landing-mobile-menu">{mobileOpen ? <XMarkIcon /> : <BarsIcon />}</button>
      </div>
    </nav>
    {mobileOpen && <nav id="landing-mobile-menu" className="landing-mobile-menu" aria-label="Landing menu">{LANDING_PANELS.map(item => <button type="button" key={item.id} aria-haspopup="dialog" onClick={() => openPanel(item.id)}>{item.label}<ArrowRightIcon /></button>)}</nav>}
  </header>;
}
