import { handleQueueAction, listQueue, type QueueOptions } from '@/lib/admin-queue';

export const dynamic = 'force-dynamic';
// Sending waits for the network's result.
export const maxDuration = 60;

// The queue sits behind the same intake as the applications, under its own
// nginx location: ADMIN_QUEUE_URL, or ONBOARDING_INTAKE_URL's sibling.
const options = (): QueueOptions => ({
  url: process.env.ADMIN_QUEUE_URL ?? (process.env.ONBOARDING_INTAKE_URL ?? '').replace(/\/api\/onboarding\/?$/, '/api/admin-queue'),
  token: process.env.ONBOARDING_INTAKE_TOKEN ?? '',
});

export function GET() {
  return listQueue(options());
}

export function POST(request: Request) {
  return handleQueueAction(request, options());
}
