// Runs the onboarding intake (see intake.ts). Reads only its own settings
// from the environment and loads no .env: the process facing the internet
// holds none of the collector's keys. Listens on loopback; nginx is the only
// way in. Refuses to start without a shared token.
//
//   ONBOARDING_INTAKE_TOKEN=... npm run intake
import http from 'node:http';
import { onboardingPaths, resolveOnboardingDir } from './candidates.js';
import { createIntakeHandler } from './intake.js';

const token = process.env.ONBOARDING_INTAKE_TOKEN ?? '';
if (token.length < 32) {
  console.error('[intake] ONBOARDING_INTAKE_TOKEN must be set to at least 32 characters; not starting');
  process.exit(1);
}

const port = Number(process.env.ONBOARDING_INTAKE_PORT ?? '8787');
const host = process.env.ONBOARDING_INTAKE_HOST ?? '127.0.0.1';
const dir = resolveOnboardingDir();

const handler = createIntakeHandler({
  paths: onboardingPaths(dir),
  token,
  cooldownHours: Number(process.env.ONBOARDING_REJECT_COOLDOWN_HOURS ?? '24'),
  maxPending: Number(process.env.ONBOARDING_MAX_PENDING ?? '50'),
  perClient: { max: Number(process.env.ONBOARDING_PER_CLIENT_PER_HOUR ?? '10'), windowMs: 60 * 60 * 1000 },
});

const server = http.createServer((req, res) => void handler(req, res));
server.requestTimeout = 10_000;
server.headersTimeout = 5_000;
server.listen(port, host, () => console.log(`[intake] listening on ${host}:${port}, writing to ${dir}`));
