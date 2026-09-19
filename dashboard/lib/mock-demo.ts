import demo from '../data/mock-demo.json';
import type { AnchorViewModel } from './types';

/** Fixed score cards, health, latest checks and history for the simulated
 * mock anchors, so their detail view shows what a mainnet anchor's does.
 * Generated with the frozen transactions by services/mock-anchors/fixtures/
 * build.py. Never applied to a real anchor, and never written on-chain. */
const DEMO = demo as unknown as Record<string, Partial<AnchorViewModel>>;

export function mergeMockDemoInto(anchors: AnchorViewModel[]): AnchorViewModel[] {
  return anchors.map((a) => {
    const d = a.sourceType === 'SimulatedMock' ? DEMO[a.anchorId] : undefined;
    return d ? { ...a, ...d } : a;
  });
}
