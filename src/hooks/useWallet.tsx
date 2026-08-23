import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  connectWallet,
  describeWalletError,
  findPreferredWallet,
  getUnshieldedAddress,
  listWallets,
  type ConnectedAPI,
  type WalletInfo,
} from '../services/wallet.js';
import {
  ShadowBidClient,
  storedContractAddress,
} from '../services/shadowbid.js';
import { CONFIG } from '../config.js';

export type WalletStatus =
  | 'checking'
  | 'no-wallet'
  | 'disconnected'
  | 'connecting-wallet'
  | 'wallet-connected'
  | 'linking-contract'
  | 'ready'
  | 'error';

export type TxPhase =
  | 'idle'
  | 'building'
  | 'proving'
  | 'balancing'
  | 'awaiting-authorization'
  | 'submitting'
  | 'finalizing'
  | 'done';

export type TxProgress = {
  phase: TxPhase;
  label?: string;
  error?: string;
};

type WalletContextValue = {
  status: WalletStatus;
  wallets: WalletInfo[];
  wallet: WalletInfo | null;
  address: string | null;
  contractAddress: string | null;
  client: ShadowBidClient | null;
  error: string | null;
  tx: TxProgress;
  setTx: (t: TxProgress) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  retry: () => void;
  ensureClient: () => Promise<ShadowBidClient>;
};

const Ctx = createContext<WalletContextValue | undefined>(undefined);

const SHORT = (s: string) => (s.length <= 14 ? s : `${s.slice(0, 8)}…${s.slice(-4)}`);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('checking');
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [client, setClient] = useState<ShadowBidClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxProgress>({ phase: 'idle' });
  const apiRef = useRef<ConnectedAPI | null>(null);

  const detect = useCallback(() => {
    const found = listWallets();
    setWallets(found);
    return found;
  }, []);

  useEffect(() => {
    // Wallet extensions inject after page load; poll briefly.
    let tries = 0;
    const tick = () => {
      const found = detect();
      if (found.length > 0 || tries > 20) {
        setStatus((s) => (s === 'checking' ? (found.length ? 'disconnected' : 'no-wallet') : s));
      } else {
        tries += 1;
        setTimeout(tick, 250);
      }
    };
    tick();
  }, [detect]);

  const linkContract = useCallback(async (api: ConnectedAPI, addr: string) => {
    setStatus('linking-contract');
    setError(null);
    try {
      const c = await ShadowBidClient.connect(api, addr);
      // Don't block UI on indexer — the Preview/Preprod indexer can lag after deploy.
      setClient(c);
      setStatus('ready');
      c.fetchLedger().catch((e) => console.warn('[ShadowBid] fetchLedger lag (non-blocking):', e));
    } catch (err) {
      setError(describeWalletError(err));
      setStatus('error');
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const found = detect();
    if (found.length === 0) {
      setStatus('no-wallet');
      return;
    }
    const preferred = findPreferredWallet()!;
    setWallet(preferred);
    setStatus('connecting-wallet');
    try {
      // Must be inside the click gesture to avoid popup blocking.
      // For now just establish the wallet session — contract deploy / indexer
      // checks are deferred until the user actually creates/uses an auction.
      const api = await connectWallet(preferred, CONFIG.networkId === 'undeployed' ? 'preprod' : CONFIG.networkId);
      apiRef.current = api;
      const addr = await getUnshieldedAddress(api);
      setAddress(SHORT(addr));
      window.__shadowbidFullAddress = addr;
      setStatus('ready');
    } catch (err) {
      setError(describeWalletError(err));
      setStatus('error');
    }
  }, [detect]);

  const disconnect = useCallback(() => {
    apiRef.current = null;
    setClient(null);
    setAddress(null);
    setError(null);
    setStatus(detect().length ? 'disconnected' : 'no-wallet');
  }, [detect]);

  const ensureClient = useCallback(async (): Promise<ShadowBidClient> => {
    if (client) return client;
    if (!apiRef.current || !window.__shadowbidFullAddress) throw new Error('Wallet not connected. Please connect first.');
    // Call ShadowBidClient.connect() exactly once — it handles both deploy and find.
    // Do NOT loop-retry: each call is a heavy blockchain operation that could deploy
    // or query the indexer. The old loop caused 20x delays and duplicate deploys.
    try {
      const c = await ShadowBidClient.connect(apiRef.current, window.__shadowbidFullAddress);
      setClient(c);
      setStatus('ready');
      return c;
    } catch (err) {
      setError(describeWalletError(err));
      setStatus('error');
      throw err;
    }
  }, [client]);

  const retry = useCallback(() => {
    if (apiRef.current && address) {
      void linkContract(apiRef.current, window.__shadowbidFullAddress ?? '');
    } else {
      setStatus(wallets.length ? 'disconnected' : 'no-wallet');
      setError(null);
    }
  }, [address, linkContract, wallets.length]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      wallets,
      wallet,
      address,
      contractAddress: storedContractAddress(),
      client,
      error,
      tx,
      setTx,
      connect,
      disconnect,
      retry,
      ensureClient,
    }),
    [status, wallets, wallet, address, client, error, tx, connect, disconnect, retry, ensureClient],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

declare global {
  interface Window {
    __shadowbidFullAddress?: string;
  }
}

export function useWallet(): WalletContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet must be used within <WalletProvider>');
  return v;
}

export const shortAddress = SHORT;
