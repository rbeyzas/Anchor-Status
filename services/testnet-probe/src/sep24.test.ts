import { describe, expect, it } from 'vitest';
import { isTerminalStatus } from './sep24.js';

describe('isTerminalStatus', () => {
  it('treats completed/error/expired/refunded as terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('error')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
    expect(isTerminalStatus('refunded')).toBe(true);
  });

  it('treats in-progress statuses as non-terminal', () => {
    expect(isTerminalStatus('incomplete')).toBe(false);
    expect(isTerminalStatus('pending_user_transfer_start')).toBe(false);
    expect(isTerminalStatus('pending_anchor')).toBe(false);
  });
});
