# scripts

Root-level setup / deploy / demo scripts.

- `setup-env.sh` — toolchain check, creates and funds a deployer account
  (testnet, requires Friendbot).
- `deploy-contracts.sh` — deploys the `anchor-registry` and
  `performance-oracle` contracts to testnet, writes the resulting
  contract IDs into `.env`.
- `demo.sh` — brings the whole system up end-to-end for a live demo.

These scripts **require network access** to Stellar testnet.

## Collector host: the onboarding intake

Applications from the dashboard's `/apply` page reach the collector through
a small always-on process (`onboarding-intake.service`, running
`services/mainnet-probe/src/intake-server.ts`); the 20-minute round checks
them (`npm run onboard` in `collect.sh`). One-time setup, as root:

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin anchor-intake
install -d -o anchor-intake -g anchor-intake -m 755 /var/lib/anchor-status/onboarding
install -d -m 750 /etc/anchor-status
umask 077; cat > /etc/anchor-status/onboarding-intake.env <<ENV
ONBOARDING_INTAKE_TOKEN=$(openssl rand -hex 32)
ONBOARDING_DIR=/var/lib/anchor-status/onboarding
ENV
chgrp anchor-intake /etc/anchor-status /etc/anchor-status/onboarding-intake.env
chmod 640 /etc/anchor-status/onboarding-intake.env
echo 'ONBOARDING_DIR=/var/lib/anchor-status/onboarding' >> /opt/anchor-status/.env   # for the round
cp /opt/anchor-status/scripts/onboarding-intake.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now onboarding-intake
curl -s http://127.0.0.1:8787/health   # {"ok":true}
```

Testnet applications have their own queue under the same intake:

```bash
install -d -o anchor-intake -g anchor-intake -m 755 /var/lib/anchor-status/onboarding/testnet
echo 'TESTNET_ANCHORS_PATH=/var/lib/anchor-status/testnet-anchors.json' >> /opt/anchor-status/.env
```

nginx: `limit_req_zone $binary_remote_addr zone=onboarding:1m rate=30r/m;` in
the `http` block, and in the server block:

```nginx
location = /api/onboarding {
    limit_req zone=onboarding burst=10 nodelay;
    client_max_body_size 4k;
    proxy_pass http://127.0.0.1:8787/;
}
location = /api/onboarding/testnet {
    limit_req zone=onboarding burst=10 nodelay;
    client_max_body_size 4k;
    proxy_pass http://127.0.0.1:8787/testnet;
}
location = /onboarding.json {
    alias /var/lib/anchor-status/onboarding/onboarding.json;
    add_header Cache-Control "no-cache";
}
location = /onboarding-testnet.json {
    alias /var/lib/anchor-status/onboarding/testnet/onboarding.json;
    add_header Cache-Control "no-cache";
}
```

Then, on the dashboard (Vercel): `ONBOARDING_INTAKE_URL=http://<host>/api/onboarding`
and `ONBOARDING_INTAKE_TOKEN` with the same token. The collector is plain
HTTP, so the token crosses the internet in the clear: it keeps casual
callers out, not a determined one on the path; the intake's limits are what
bound the damage. TLS on the collector would fix it.
