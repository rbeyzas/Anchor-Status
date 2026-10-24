// The admin calls /panel can queue, and how a typed form value becomes the
// argument the contract client takes.
import { xlmToStroops } from './format';

export type Kind = 'u64' | 'u32' | 'address' | 'bytes32' | 'symbol' | 'string' | 'xlm' | 'sourceType';
interface Arg {
  /** "config.threshold" builds { config: { threshold } }. */
  name: string;
  label: string;
  kind: Kind;
}
export interface MethodSpec {
  method: string;
  label: string;
  args: Arg[];
}

// The admin calls the panel can queue. Both contracts share governance.
const GOVERNANCE: MethodSpec[] = [
  { method: 'propose_upgrade', label: 'Propose an upgrade', args: [{ name: 'wasm_hash', label: 'Wasm hash (64 hex)', kind: 'bytes32' }] },
  { method: 'execute_upgrade', label: 'Execute the proposed upgrade', args: [] },
  { method: 'cancel_upgrade', label: 'Cancel the proposed upgrade', args: [] },
  { method: 'set_upgrade_delay', label: 'Set the time lock', args: [{ name: 'seconds', label: 'Seconds', kind: 'u64' }] },
  { method: 'propose_admin', label: 'Propose a new admin', args: [{ name: 'new_admin', label: 'New admin (G…)', kind: 'address' }] },
  { method: 'accept_admin', label: 'Accept the admin role (as the proposed admin)', args: [] },
];
export const METHODS: Record<'registry' | 'oracle', MethodSpec[]> = {
  registry: [
    ...GOVERNANCE,
    {
      method: 'deactivate_anchor',
      label: 'Deactivate an anchor',
      args: [
        { name: 'anchor_id', label: 'Anchor id', kind: 'symbol' },
        { name: 'reason', label: 'Reason, shown on the dashboard', kind: 'string' },
      ],
    },
    { method: 'reactivate_anchor', label: 'Reactivate an anchor', args: [{ name: 'anchor_id', label: 'Anchor id', kind: 'symbol' }] },
  ],
  oracle: [
    ...GOVERNANCE,
    {
      method: 'set_quorum_config',
      label: 'Set the quorum',
      args: [
        { name: 'config.threshold', label: 'Threshold', kind: 'u32' },
        { name: 'config.max_spread', label: 'Max spread', kind: 'u32' },
        { name: 'config.round_seconds', label: 'Round seconds', kind: 'u64' },
      ],
    },
    {
      method: 'authorize_reporter',
      label: 'Authorize a reporter',
      args: [
        { name: 'reporter', label: 'Reporter (G…)', kind: 'address' },
        { name: 'source_type', label: 'RealMainnet, RealTestnet or SimulatedMock', kind: 'sourceType' },
      ],
    },
    { method: 'revoke_reporter', label: 'Revoke a reporter', args: [{ name: 'reporter', label: 'Reporter (G…)', kind: 'address' }] },
    {
      method: 'set_dispute_config',
      label: 'Set the dispute rules',
      args: [
        { name: 'config.min_stake', label: 'Minimum stake (XLM)', kind: 'xlm' },
        { name: 'config.cooldown_seconds', label: 'Cooldown seconds', kind: 'u64' },
      ],
    },
  ],
};

/** A typed value as the contract client takes it; throws on bad input. */
export function convert(kind: Kind, text: string): unknown {
  const t = text.trim();
  const fail = (what: string) => {
    throw new Error(`"${t}" is not ${what}`);
  };
  switch (kind) {
    case 'u64':
      return /^\d+$/.test(t) ? BigInt(t) : fail('a whole number');
    case 'u32':
      return /^\d+$/.test(t) && Number(t) <= 0xffffffff ? Number(t) : fail('a whole number');
    case 'address':
      return /^[GC][A-Z2-7]{55}$/.test(t) ? t : fail('an address');
    case 'bytes32':
      return /^[0-9a-fA-F]{64}$/.test(t) ? Uint8Array.from(t.match(/../g)!, (b) => parseInt(b, 16)) : fail('64 hex characters');
    case 'symbol':
      return /^[A-Za-z0-9_]{1,32}$/.test(t) ? t : fail('an anchor id');
    case 'string':
      return t;
    case 'xlm':
      return xlmToStroops(t) ?? fail('an XLM amount');
    case 'sourceType':
      return ['RealMainnet', 'RealTestnet', 'SimulatedMock'].includes(t) ? { tag: t, values: undefined } : fail('a source type');
  }
}

export function buildArgs(spec: MethodSpec, values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of spec.args) {
    const [head, field] = a.name.split('.');
    const v = convert(a.kind, values[a.name] ?? '');
    if (field) out[head] = { ...((out[head] as object) ?? {}), [field]: v };
    else out[head] = v;
  }
  return out;
}

