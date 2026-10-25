// Batched reads of per-anchor contract storage (`DataKey::<Variant>(id)`),
// one RPC call per 100 anchors instead of one simulation each.
import { Address, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

/** The native value of `variant(anchorId)` for every anchor that has one. */
export async function readPerAnchor(
  server: rpc.Server,
  contractId: string,
  variant: string,
  anchorIds: string[],
  durability: 'persistent' | 'temporary' = 'persistent',
): Promise<Map<string, unknown>> {
  const contract = new Address(contractId).toScAddress();
  const out = new Map<string, unknown>();
  for (let i = 0; i < anchorIds.length; i += 100) {
    const keys = anchorIds.slice(i, i + 100).map((id) =>
      xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract,
          key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), xdr.ScVal.scvSymbol(id)]),
          durability: xdr.ContractDataDurability[durability],
        }),
      ),
    );
    const { entries } = await server.getLedgerEntries(...keys);
    for (const e of entries) {
      if (e.val.type !== 'contractData') continue;
      const data = e.val.contractData;
      out.set(String(scValToNative(data.key)[1]), scValToNative(data.val));
    }
  }
  return out;
}
