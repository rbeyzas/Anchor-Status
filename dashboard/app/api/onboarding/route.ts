import { handleApplication } from '@/lib/onboarding-proxy';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return handleApplication(request, {
    intakeUrl: process.env.ONBOARDING_INTAKE_URL ?? '',
    token: process.env.ONBOARDING_INTAKE_TOKEN ?? '',
  });
}
