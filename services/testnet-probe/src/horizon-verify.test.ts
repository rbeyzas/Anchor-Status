import { describe, expect, it } from 'vitest';
import { checkOperations } from './horizon-verify.js';

const US = 'GB56V3SMKRXXE7KR6EZBBY4KSBJ76OPUIIRMYMXJO47UZ4Y75CMWL7UD';
const ANCHOR = 'GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6';
const USDC = { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' };
const pay = (extra = {}) => ({ type: 'payment', from: ANCHOR, to: US, amount: '2.0396090', asset_code: USDC.code, asset_issuer: USDC.issuer, transaction_successful: true, ...extra });

describe('checkOperations', () => {
  it('finds a classic payment to us, from the anchor, of the reported amount', () => {
    expect(checkOperations([pay()], { asset: USDC, to: US, from: [ANCHOR], amount: '2.039609' })).toMatchObject({ ok: true, amount: '2.0396090' });
  });

  it('finds a Stellar Asset Contract transfer (testanchor.stellar.org pays this way)', () => {
    const sac = {
      type: 'invoke_host_function',
      transaction_successful: true,
      asset_balance_changes: [{ type: 'transfer', from: 'GABCKCYPAGDDQMSCTMSBO7C2L34NU3XXCW7LR4VVSWCCXMAJY3B4YCZP', to: US, amount: '9.0000000', asset_code: 'SRT', asset_issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B' }],
    };
    expect(checkOperations([sac], { asset: { code: 'SRT', issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B' }, to: US, amount: '9' })).toMatchObject({ ok: true });
  });

  it('refuses a wrong recipient, asset or amount, and a failed transaction', () => {
    expect(checkOperations([pay({ to: ANCHOR })], { asset: USDC, to: US }).ok).toBe(false);
    expect(checkOperations([pay({ asset_code: 'EURC' })], { asset: USDC, to: US }).ok).toBe(false);
    // An unlisted sender is reported, not failed: ACCOUNTS is optional.
    expect(checkOperations([pay({ from: 'GSOMEONEELSE00' })], { asset: USDC, to: US, from: [ANCHOR] })).toMatchObject({ ok: true });
    expect(checkOperations([pay({ from: 'GSOMEONEELSE00' })], { asset: USDC, to: US, from: [ANCHOR] }).detail).toContain('not in its stellar.toml ACCOUNTS');
    expect(checkOperations([pay()], { asset: USDC, to: US, amount: '5' }).detail).toContain('not the 5 reported');
    expect(checkOperations([pay({ transaction_successful: false })], { asset: USDC, to: US }).detail).toContain('failed');
  });
});
