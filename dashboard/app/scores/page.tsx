import type { Metadata } from 'next';
import { Dashboard } from '@/components/Dashboard';
import { getDashboardData } from '@/lib/soroban';

export const metadata: Metadata = { title: 'Live scores: Mona' };

// Rendered per request: with ISR the first visitor after a quiet stretch got
// a page hours old. The full read takes about 2 s.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { anchors, dataSource, liveError, unreadable } = await getDashboardData();
  return (
    <Dashboard
      anchors={anchors}
      dataSource={dataSource}
      liveError={liveError}
      unreadable={unreadable}
    />
  );
}
