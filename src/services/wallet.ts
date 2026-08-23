/**
 * 1AM / Midnight wallet connector service.
 *
 * Uses the DApp Connector API (CAIP-372, @midnight-ntwrk/dapp-connector-api v4):
 * wallets inject an Initial API under `window.midnight`; 1AM historically
 * injects under the friendly key `1am`. We discover wallets by enumeration and
 * prefer 1AM, falling back to any other conformant connector (e.g. Lace).
 *
 * This module never touches seed phrases or private keys — all signing and
 * (with 1AM) proving happens inside the wallet extension.
 */
import '@midnight-ntwrk/dapp-connector-api';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export type { ConnectedAPI };

export type WalletInfo = {
  /** Friendly key under which the wallet injected itself, e.g. '1am'. */
  key: string;
  name: string;
  apiVersion: string;
  rdns?: string;
  icon?: string;
};

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

/** Enumerate installed Midnight wallets. */
export function listWallets(): WalletInfo[] {
  const injected = window.midnight;
  if (!injected) return [];
  return Object.entries(injected)
    .filter(([, w]) => !!w && typeof w.connect === 'function' && !!w.name && !!w.apiVersion)
    .map(([key, w]) => ({
      key,
      name: w.name ?? key,
      apiVersion: w.apiVersion ?? 'unknown',
      rdns: (w as { rdns?: string }).rdns,
      icon: (w as { icon?: string }).icon,
    }));
}

/** Prefer the 1AM wallet; otherwise return the first available wallet. */
export function findPreferredWallet(): WalletInfo | undefined {
  const wallets = listWallets();
  if (wallets.length === 0) return undefined;
  return (
    wallets.find((w) => w.key === '1am' || /(^|\.)1am\b/i.test(w.rdns ?? '') || /\b1am\b/i.test(w.name)) ??
    wallets[0]
  );
}

/**
 * Connect to a discovered wallet.
 *
 * NOTE: `connect()` must be called synchronously within a user gesture handler
 * to avoid popup blockers — callers should invoke this directly from onClick.
 */
export async function connectWallet(wallet: WalletInfo, networkId: string): Promise<ConnectedAPI> {
  const initial = window.midnight?.[wallet.key];
  if (!initial) throw new Error(`Wallet "${wallet.name}" is no longer available. Refresh the page.`);
  console.info('[ShadowBid] connecting to wallet', wallet.key, 'networkId=', networkId, 'apiVersion=', initial.apiVersion);
  const api = await initial.connect(networkId);
  // 1AM can transiently report 'disconnected' right after `connect()` resolves
  // even though the session is usable. Don't hard-fail on that — validate the
  // session by actually using it (getUnshieldedAddress) so a real breakage
  // surfaces an actionable error instead of a false "not connected".
  const status = await api.getConnectionStatus().catch((e) => ({ status: 'error', error: String(e) }));
  console.info('[ShadowBid] connection status after connect:', JSON.stringify(status));
  if (status && (status as { status?: string }).status === 'connected') {
    console.info('[ShadowBid] wallet connected to network:', (status as { networkId?: string }).networkId);
    return api;
  }
  // 1AM often reports disconnected if it's not on Preprod / not synced / not funded.
  // Surface a clear, actionable error instead of silently proceeding to a hanging balance call.
  const hint =
    (status as { status?: string }).status === 'disconnected'
      ? ' 1AM still reports “disconnected”. Open 1AM → ensure it is on Preprod, has tDUST from the faucet, and is fully synced, then approve the connection again. If you approved, try disconnecting in 1AM and reconnecting.'
      : '';
  throw new Error(`Wallet did not report “connected” after approval (got ${JSON.stringify(status)}).${hint}`);
}

export async function getUnshieldedAddress(api: ConnectedAPI): Promise<string> {
  const { unshieldedAddress } = await api.getUnshieldedAddress();
  return unshieldedAddress;
}

export async function getShieldedIdentity(api: ConnectedAPI): Promise<{
  coinPublicKey: string;
  encryptionPublicKey: string;
}> {
  const addresses = await api.getShieldedAddresses();
  return {
    coinPublicKey: addresses.shieldedCoinPublicKey,
    encryptionPublicKey: addresses.shieldedEncryptionPublicKey,
  };
}

/** True when the wallet can prove transactions itself (1AM can; Lace cannot). */
export function hasProvingProvider(api: ConnectedAPI): boolean {
  return typeof (api as { getProvingProvider?: unknown }).getProvingProvider === 'function';
}

/** Human-friendly message for common wallet errors. */
export function describeWalletError(err: unknown): string {
  // Unwrap nested causes (Effect/ZK errors wrap their real cause deeply).
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (msg && !parts.includes(msg)) parts.push(msg);
    cur = (cur as { cause?: unknown })?.cause;
  }
  const raw = parts.join(' — ');
  if (/reject/i.test(raw)) return 'You rejected the request in your wallet.';
  if (/popup|gesture|user activation/i.test(raw))
    return 'The wallet could not open its approval window. Try clicking the button again.';
  if (/network|fetch|Failed to fetch/i.test(raw))
    return 'Could not reach the network. Check that your wallet is online and synced.';
  return raw || 'Unknown wallet error.';
}
