import type { AuthRole } from '../store/auth.store';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  allowedRoles: AuthRole[];
  group?: string;
}

export const ALL_ROLES: AuthRole[] = ['CHAIR', 'FACULTY'];
export const MANAGEMENT_ROLES: AuthRole[] = ['CHAIR'];

/**
 * Single source of truth for authenticated sidebar navigation
 * (ui-ux.md §2.2/§3, requirements.md §3).
 * Role visibility mirrors the RequireAuth allowedRoles in App.tsx.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', group: 'overview', allowedRoles: ALL_ROLES },
  { label: 'Schedule', group: 'planning', path: '/schedule', icon: 'schedule', allowedRoles: ALL_ROLES },
  { label: 'Workload Assignment', group: 'planning', path: '/workload-assignment', icon: 'assignment', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Teaching Load', group: 'planning', path: '/teaching-load', icon: 'workload', allowedRoles: ALL_ROLES },
  { label: 'Weekly Function Planner', group: 'planning', path: '/weekly-planner', icon: 'schedule', allowedRoles: ALL_ROLES },
  { label: 'Faculty', group: 'records', path: '/faculty', icon: 'faculty', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Subjects', group: 'records', path: '/subjects', icon: 'subjects', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Sections', group: 'records', path: '/sections', icon: 'view-section', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Rooms', group: 'records', path: '/rooms', icon: 'rooms', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Form Settings', group: 'settings', path: '/form-settings', icon: 'account', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Account Settings', group: 'settings', path: '/account', icon: 'account', allowedRoles: ALL_ROLES },
];

export function navItemsForRole(role: AuthRole | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.allowedRoles.includes(role));
}

export function navLabelForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) => item.path === pathname);
  if (match) return match.label;
  if (pathname === '/reports') return 'Reports';
  if (pathname === '/workload') return 'My Workload';
  if (pathname === '/not-authorized') return 'Not Authorized';
  return 'Dashboard';
}

