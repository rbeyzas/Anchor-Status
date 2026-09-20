import { Dashboard } from '@/components/Dashboard';
import { getDashboardData } from '@/lib/soroban';

// minutes, so reading on every request only risked tripping public RPC rate
export const revalidate = 60;

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
