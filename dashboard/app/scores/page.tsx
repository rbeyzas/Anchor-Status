import { Dashboard } from '@/components/Dashboard';
import { getDashboardData } from '@/lib/soroban';

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
