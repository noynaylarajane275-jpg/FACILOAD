import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Nav, type LandingPanel } from '../../components/landing/Nav';
import { Hero } from '../../components/landing/Hero';
import { StatStrip } from '../../components/landing/StatStrip';
import { LandingDialog } from '../../components/landing/LandingDialog';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import './landing.css';

/** Public landing: reference hero with information dialogs and explicit login. */
export function Landing({ openLoginOnMount = false }: { openLoginOnMount?: boolean }): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const openLoginModal = useUiStore((s) => s.openLoginModal);
  const [panel, setPanel] = useState<LandingPanel | null>(null);

  useEffect(() => {
    if (openLoginOnMount) {
      openLoginModal();
    }
  }, [openLoginOnMount, openLoginModal]);

  if (isAuthenticated) {
    // Mirror the login landing: faculty sessions resume on their own
    // workload, management on the department dashboard.
    return <Navigate to={role === 'FACULTY' ? '/workload' : '/dashboard'} replace />;
  }

  return (
    <div className="landing-page">
      <div className="landing-scenery" aria-hidden="true"><div className="landing-campus" /><div className="landing-scenery-shade" /></div>
      <svg className="landing-ribbons" viewBox="0 0 1440 850" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="landing-ribbon" x1="0" x2="1" y1="1" y2="0"><stop stopColor="#b7204a" stopOpacity=".55" /><stop offset="1" stopColor="#f684a2" stopOpacity=".6" /></linearGradient></defs><path d="M0 420C220 808 702 890 1440 626V850H0Z" fill="url(#landing-ribbon)" /><path d="M0 580C320 890 720 964 1440 730V850H0Z" fill="#3c0011" fillOpacity=".8" /><path d="M605 0H1440V74C1200 10 1055 183 804 300C697 352 637 268 720 174C817 76 996 84 1092 0Z" fill="url(#landing-ribbon)" /></svg>
      <Nav onOpenPanel={setPanel} />
      <main className="landing-main">
        <Hero onOpenPanel={setPanel} />
        <StatStrip onOpenPanel={setPanel} />
      </main>
      <LandingDialog panel={panel} onClose={() => setPanel(null)} />
    </div>
  );
}
