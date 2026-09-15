import { Dashboard } from '@/components/Dashboard';
import { getDashboardData } from '@/lib/soroban';

// Always fetch fresh from Soroban RPC (or the mock fallback) on each request
// rather than caching a stale snapshot across the whole demo.
export const revalidate = 0;

export default async function Page() {
  const { anchors, dataSource, liveError } = await getDashboardData();
  return <Dashboard anchors={anchors} dataSource={dataSource} liveError={liveError} />;
}
