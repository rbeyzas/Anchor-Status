'use client';

import { contract } from '@stellar/stellar-sdk';

// The wallet side of /panel: Stellar Wallets Kit picks the wallet and signs;
// the SDK's contract client builds and simulates the call and sends it.
// Nothing here holds a key.

export const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const MAINNET = NETWORK_PASSPHRASE.startsWith('Public Global');

type Kit = typeof import('@creit-tech/stellar-wallets-kit').StellarWalletsKit;
let kitPromise: Promise<Kit> | null = null;

/** Loaded on first use: the kit touches `window`. */
function kit(): Promise<Kit> {
  kitPromise ??= (async () => {
    // The browser-extension and web wallets, one by one: defaultModules()
    // also pulls in MetaMask's module, which imports a package by another
    // name and breaks the build.
    const [{ StellarWalletsKit, Networks }, { FreighterModule }, { xBullModule }, { AlbedoModule }, { LobstrModule }, { HanaModule }, { RabetModule }] =
      await Promise.all([
        import('@creit-tech/stellar-wallets-kit'),
        import('@creit-tech/stellar-wallets-kit/modules/freighter'),
        import('@creit-tech/stellar-wallets-kit/modules/xbull'),
        import('@creit-tech/stellar-wallets-kit/modules/albedo'),
        import('@creit-tech/stellar-wallets-kit/modules/lobstr'),
        import('@creit-tech/stellar-wallets-kit/modules/hana'),
        import('@creit-tech/stellar-wallets-kit/modules/rabet'),
      ]);
    StellarWalletsKit.init({
      modules: [new FreighterModule(), new xBullModule(), new AlbedoModule(), new LobstrModule(), new HanaModule(), new RabetModule()],
      network: MAINNET ? Networks.PUBLIC : Networks.TESTNET,
    });
    return StellarWalletsKit;
  })();
  return kitPromise;
}

/** Opens the wallet picker; resolves to the chosen account. */
export async function connectWallet(): Promise<string> {
  const { address } = await (await kit()).authModal();
  return address;
}

/** The account connected before the page was reloaded, if any. The kit
 * keeps it in localStorage until disconnectWallet(); the kit itself is only
 * loaded when there is one. */
export async function restoreWallet(): Promise<string | null> {
  try {
    if (!localStorage.getItem('@StellarWalletsKit/activeAddress')) return null;
    return (await (await kit()).getAddress()).address || null;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  if (kitPromise) await (await kit()).disconnect();
}

/** Calls `method` on `contractId` as `address`: simulated, signed in the
 * wallet, sent, and awaited. Resolves to the transaction hash. */
export async function invoke(address: string, contractId: string, method: string, args: Record<string, unknown>): Promise<string> {
  const k = await kit();
  const client = await contract.Client.from({
    contractId,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: address,
    signTransaction: (xdr: string) => k.signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address }),
  });
  const fn = (client as unknown as Record<string, (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>>)[method];
  if (typeof fn !== 'function') throw new Error(`${method} is not a function of ${contractId}`);
  const tx = await fn(args);
  const sent = await tx.signAndSend();
  return sent.sendTransactionResponse?.hash ?? '';
}

/** A read-only call, simulated without a source account (the wallet's may
 * not exist yet on this network): nothing is signed or sent. */
export async function read(contractId: string, method: string, args: Record<string, unknown>): Promise<unknown> {
  const client = await contract.Client.from({ contractId, networkPassphrase: NETWORK_PASSPHRASE, rpcUrl: RPC_URL });
  const fn = (client as unknown as Record<string, (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>>)[method];
  if (typeof fn !== 'function') throw new Error(`${method} is not a function of ${contractId}`);
  return (await fn(args)).result;
}

/** A queued admin call stays valid this long; its sequence number may be
 * used up sooner, and then it is proposed again. */
const QUEUE_VALID_SECONDS = 7 * 24 * 3600;

/** The unsigned, simulated transaction for `method` on `contractId`, from
 * `source` (the contract's admin): what a multisig's signers sign in turn. */
export async function buildAdminCall(source: string, contractId: string, method: string, args: Record<string, unknown>): Promise<string> {
  const client = await contract.Client.from({ contractId, networkPassphrase: NETWORK_PASSPHRASE, rpcUrl: RPC_URL, publicKey: source });
  const fn = (client as unknown as Record<string, (a: Record<string, unknown>, o: { timeoutInSeconds: number }) => Promise<contract.AssembledTransaction<unknown>>>)[method];
  if (typeof fn !== 'function') throw new Error(`${method} is not a function of ${contractId}`);
  const tx = await fn(args, { timeoutInSeconds: QUEUE_VALID_SECONDS });
  return tx.toXDR();
}

/** Adds the connected wallet's signature to an envelope. */
export async function signEnvelope(envelope: string, address: string): Promise<string> {
  const { signedTxXdr } = await (await kit()).signTransaction(envelope, { networkPassphrase: NETWORK_PASSPHRASE, address });
  return signedTxXdr;
}

/** A SEP-53 signed message, base64. */
export async function signText(message: string, address: string): Promise<string> {
  const { signedMessage } = await (await kit()).signMessage(message, { networkPassphrase: NETWORK_PASSPHRASE, address });
  return signedMessage;
}

/** The SHA-256 of `text`, or `text` itself if it already is one. */
export async function evidenceHash(text: string): Promise<string> {
  const trimmed = text.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(trimmed));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/${MAINNET ? 'public' : 'testnet'}/tx/${hash}`;
export const explorerAccount = (address: string) => `https://stellar.expert/explorer/${MAINNET ? 'public' : 'testnet'}/account/${address}`;
