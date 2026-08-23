/**
 * Assembles the MidnightProviders object that midnight-js requires, backed by:
 *  - the connected connector wallet (1AM preferred) for proving/balancing/submission,
 *  - an indexer public data provider,
 *  - an encrypted local private state store (level/IndexedDB),
 *  - HTTP-fetched ZK artifacts from this app's static assets.
 *
 * When the wallet cannot prove itself (e.g. Lace), proving falls back to a
 * local proof server (http://127.0.0.1:6300).
 */
import {
  indexerPublicDataProvider,
} from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { ZKConfigProvider } from '@midnight-ntwrk/midnight-js-types';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import type { FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import { CostModel, UnprovenTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { CircuitId } from '../config.js';
import { CONFIG, PRIVATE_STATE_ID } from '../config.js';
import type { ShadowBidPrivateState } from './shadowbid.js';
import { fetchKeyMaterialProvider } from './keyMaterial.js';
import { getShieldedIdentity, hasProvingProvider, type ConnectedAPI } from './wallet.js';

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const unhex = (s: string): Uint8Array => {
  const clean = s.startsWith('0x') ? s.slice(2) : s;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * Derive a stable, non-reversible encryption password for the local private
 * state store from the account identity. This is NOT a secret from the chain —
 * it only encrypts the on-device LevelDB/IndexedDB store.
 */
const storePassword = (accountId: string): string => {
  let h1 = 0xdeadbeef ^ accountId.length;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < accountId.length; i++) {
    const ch = accountId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const digest =
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0');
  return `ShadowBid#${digest}-LocalStore!`;
};

export async function buildProviders(
  api: ConnectedAPI,
): Promise<MidnightProviders<CircuitId, typeof PRIVATE_STATE_ID, ShadowBidPrivateState>> {
  const { coinPublicKey, encryptionPublicKey } = await getShieldedIdentity(api);

  // Prefer endpoints reported by the wallet; fall back to app config.
  let indexerUri = CONFIG.indexerUri;
  let indexerWsUri = CONFIG.indexerWsUri;
  try {
    const cfg = await api.getConfiguration();
    if (cfg?.indexerUri) indexerUri = cfg.indexerUri;
    if (cfg?.indexerWsUri) indexerWsUri = cfg.indexerWsUri;
  } catch {
    /* keep defaults */
  }

  // Robust fetch: try native fetch, fall back to XMLHttpRequest. Some browser
  // environments (wallet webviews, strict CSP) reject `fetch` but allow XHR for
  // same-origin static assets.
  const robustFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    try {
      return await fetch(url, init);
    } catch (e) {
      console.warn('[ShadowBid] native fetch failed, falling back to XHR:', e);
      return await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        (init?.headers as Record<string, string> | undefined) &&
          Object.entries(init!.headers as Record<string, string>).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.responseType = 'arraybuffer';
        xhr.onload = () =>
          resolve(new Response(xhr.response, { status: xhr.status, statusText: xhr.statusText, headers: new Headers() }));
        xhr.onerror = () => reject(new Error(`XHR request to ${url} failed`));
        xhr.send();
      });
    }
  };

  // Native browser fetch avoids cross-fetch's bundled shims, which can fail
  // inside optimized dev bundles.
  const rawZkConfigProvider = new FetchZkConfigProvider<CircuitId>(CONFIG.zkArtifactsBaseUrl, robustFetch as unknown as typeof fetch);

  // Surface the real underlying fetch failure (which the SDK swallows into a
  // generic ZKConfigurationReadError) so debugging is possible.
  const safeStringify = (v: unknown): string => {
    try {
      const seen = new WeakSet();
      return JSON.stringify(v, (_k, val) => {
        if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack, cause: val.cause };
        if (typeof val === 'object' && val !== null) { if (seen.has(val)) return '[circular]'; seen.add(val); }
        return val;
      }, 2);
    } catch { return String(v); }
  };
  const zkConfigProvider = {
    getVerifierKey: async (circuitId: CircuitId) => {
      try {
        return await rawZkConfigProvider.getVerifierKey(circuitId);
      } catch (e) {
        const detail =
          e instanceof Error
            ? `message=${e.message}\nstack=${e.stack ?? '(none)'}\ncause=${safeStringify((e as { cause?: unknown }).cause)}`
            : `non-error: ${safeStringify(e)}`;
        console.error('[ShadowBid] verifier key fetch FAILED for', circuitId, '\n', detail);
        throw new Error(`[ShadowBid] verifier key fetch failed for '${circuitId}': ${detail}`);
      }
    },
    getVerifierKeys: (circuitIds: CircuitId[]) => rawZkConfigProvider.getVerifierKeys(circuitIds),
    getProverKey: (circuitId: CircuitId) => rawZkConfigProvider.getProverKey(circuitId),
    getZKIR: (circuitId: CircuitId) => rawZkConfigProvider.getZKIR(circuitId),
    get: ((resource: string) => rawZkConfigProvider.get(resource as CircuitId)) as unknown as ZKConfigProvider<CircuitId>['get'],
    asKeyMaterialProvider: () => rawZkConfigProvider.asKeyMaterialProvider(),
  } as unknown as ZKConfigProvider<CircuitId>;

  // Proving: delegate to the wallet when supported (1AM), else local proof server.
  // The 1AM `ProvingProvider` implements the low-level Ledger interface
  // (`prove`/`check` on serialized preimages); midnight-js drives it via
  // `unprovenTx.prove(provider, costModel)` — NOT a `proveTx` method.
  const proofProvider = hasProvingProvider(api)
    ? await (async () => {
        const keyMaterial = fetchKeyMaterialProvider(CONFIG.zkArtifactsBaseUrl);
        const walletProver = await (api as unknown as {
          getProvingProvider(km: unknown): Promise<unknown>;
        }).getProvingProvider(keyMaterial);
        return {
          proveTx: (unprovenTx: UnprovenTransaction) =>
            unprovenTx.prove(walletProver as never, CostModel.initialCostModel()) as unknown as Promise<UnboundTransaction>,
        };
      })()
    : httpClientProofProvider(CONFIG.proofServerUri, zkConfigProvider as never);

  // Wallet/submission bridge: midnight-js works with typed ledger Transaction
  // objects; the DApp Connector API exchanges serialized transactions.
  const walletAndMidnightBridge = {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
    balanceTx: async (tx: UnboundTransaction, ttl: Date = ttlOneHour()): Promise<FinalizedTransaction> => {
      void ttl;
      const inputHex = hex(tx.serialize());
      console.info('[ShadowBid] balanceUnsealedTransaction: input bytes=', inputHex.length / 2);
      const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`balanceUnsealedTransaction timed out after ${ms / 1000}s. The 1AM wallet is likely waiting for you to APPROVE the transaction inside the extension, or it has no test funds / is not synced on preprod.`)), ms)),
        ]);
      try {
        const result = await withTimeout(api.balanceUnsealedTransaction(inputHex, { payFees: true }), 60_000);
        const balancedHex = typeof result === 'string' ? result : result.tx;
        console.info('[ShadowBid] balanceUnsealedTransaction: done, output bytes=', balancedHex.length / 2);
        return Transaction.deserialize(
          'signature',
          'proof',
          'binding',
          unhex(balancedHex),
        ) as unknown as FinalizedTransaction;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/BALANCE_FAILED|Internal Server Error|sponsor/i.test(msg)) {
          const help =
            ' 1AM’s dust-sponsorship / proof server returned 500. Click “Pay with My Dust” in the 1AM popup (not Reject). Ensure 1AM is on Preprod, has tDUST from the faucet, and is synced. If it still fails, wait ~1h for 1AM’s server to recover or retry.';
          console.error('[ShadowBid] balanceUnsealedTransaction FAILED (sponsorship):', e);
          throw new Error(msg + help);
        }
        console.error('[ShadowBid] balanceUnsealedTransaction FAILED:', e);
        throw e;
      }
    },
    submitTx: async (tx: FinalizedTransaction): Promise<string> => {
      const raw: unknown = (tx as { serialize(): unknown }).serialize();
      const serialized = typeof raw === 'string' ? raw : hex(raw as Uint8Array);
      console.info('[ShadowBid] submitTransaction: bytes=', serialized.length / 2);
      try {
        await api.submitTransaction(serialized);
        const hash = hex((tx as unknown as { transactionHash(): Uint8Array }).transactionHash());
        console.info('[ShadowBid] submitTransaction: submitted, hash=', hash);
        return hash;
      } catch (e) {
        console.error('[ShadowBid] submitTransaction FAILED:', e);
        throw e;
      }
    },
  };

  return {
    privateStateProvider: levelPrivateStateProvider<typeof PRIVATE_STATE_ID, ShadowBidPrivateState>({
      privateStateStoreName: 'shadowbid-private-state',
      signingKeyStoreName: 'shadowbid-signing-keys',
      privateStoragePasswordProvider: () => storePassword(coinPublicKey),
      accountId: coinPublicKey,
    }),
    publicDataProvider: indexerPublicDataProvider(indexerUri, indexerWsUri, window.WebSocket),
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightBridge,
    midnightProvider: walletAndMidnightBridge,
  };
}
