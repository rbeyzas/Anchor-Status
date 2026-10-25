import { handleDisputeAction, listDisputes } from '@/lib/disputes';
import type { QueueOptions } from '@/lib/admin-queue';

export const dynamic = 'force-dynamic';

// Beside the admin queue, behind the same intake and nginx location.
const options = (): QueueOptions => ({
  url: process.env.ADMIN_QUEUE_URL ?? (process.env.ONBOARDING_INTAKE_URL ?? '').replace(/\/api\/onboarding\/?$/, '/api/admin-queue'),
  token: process.env.ONBOARDING_INTAKE_TOKEN ?? '',
});

export function GET() {
  return listDisputes(options());
}

export function POST(request: Request) {
  return handleDisputeAction(request, options());
}
