/**
 * DashboardHeader — greeting + live department stat pills + the
 * Faculty / Subjects / Rooms counts. Business-dashboard composition: gradient
 * count tiles over a plain white workspace. All values come from the summary
 * payload — nothing hardcoded.
 */

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatPill({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm t-num">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="font-mono font-semibold text-slate-900">{value}</span>
    </span>
  );
}

const TILE_GRADIENTS = [
  'from-brand-400 to-[#7f0d24]',
  'from-[#8c1128] to-[#3a0713]',
  'from-[#c81e42] to-[#8c1128]',
];

function CountCard({ label, value, index }: { label: string; value: number; index: number }): JSX.Element {
  return (
    <div
      className={`dashboard-count-tile rounded-2xl bg-gradient-to-br ${TILE_GRADIENTS[index % TILE_GRADIENTS.length]} p-5 text-white shadow-[0_16px_36px_-22px_rgba(127,15,38,0.75)]`}
    >
      <p className="text-sm font-medium text-white/80">{label}</p>
      <p className="mt-2 t-stat-number">{value}</p>
    </div>
  );
}

export function DashboardHeader({
  greetingName,
  termLabel,
  scheduledPercent,
  roomsInUsePercent,
  nearOrOverCount,
  facultyCount,
  subjectCount,
  roomCount,
  now = new Date(),
}: {
  greetingName: string;
  termLabel: string | null;
  scheduledPercent: number;
  roomsInUsePercent: number;
  nearOrOverCount: number;
  facultyCount: number;
  subjectCount: number;
  roomCount: number;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}): JSX.Element {
  return (
    <div className="dashboard-overview space-y-5">
      <div>
        <h1
          id="dashboard-title"
          className="t-page-title text-slate-900"
        >
          Dashboard
        </h1>
        <p
          className={`mt-1 text-sm ${'text-slate-600 t-caption'}`}
        >
          {termLabel || 'Department schedule overview'}
        </p>
        <h2
          className="t-greeting"
        >
          {greetingForHour(now.getHours())}, {greetingName}
        </h2>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Department stat pills">
        <StatPill label="Term scheduled" value={`${scheduledPercent}%`} />
        <StatPill label="Rooms in use" value={`${roomsInUsePercent}%`} />
        <StatPill label="Near/over load" value={String(nearOrOverCount)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <CountCard label="Faculty" value={facultyCount} index={0} />
        <CountCard label="Subjects" value={subjectCount} index={1} />
        <CountCard label="Rooms" value={roomCount} index={2} />
      </div>
    </div>
  );
}
