// Registrations the chain keeps but the page does not list. The registry
// has no way to remove or correct an entry, so a wrong one is hidden here,
// in the open, with its reason. Nothing is hidden for scoring badly.
export const DELISTED: Record<string, string> = {
  tr_mock_anchor_fly_dev:
    'A testnet sandbox (its stellar.toml declares the testnet network), admitted as a mainnet anchor on 19 Sep 2026 ' +
    'before the mainnet application checked the network. It was removed from mainnet measurement the same evening; ' +
    'the on-chain registration cannot be undone.',
};

export const isDelisted = (anchorId: string) => Object.prototype.hasOwnProperty.call(DELISTED, anchorId);
