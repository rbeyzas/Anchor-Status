import { handleApplication } from '@/lib/onboarding-proxy';

export const dynamic = 'force-dynamic';

// The testnet queue, next to mainnet's on the same intake: …/api/onboarding/testnet.
const base = (process.env.ONBOARDING_INTAKE_URL ?? '').replace(/\/+$/, '');

export function POST(request: Request) {
  return handleApplication(request, {
    intakeUrl: process.env.ONBOARDING_TESTNET_INTAKE_URL ?? (base ? `${base}/testnet` : ''),
    token: process.env.ONBOARDING_INTAKE_TOKEN ?? '',
  });
}
