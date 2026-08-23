import { useCallback, useEffect, useState } from 'react';
import { decodeAuctions, type AuctionView, storedContractAddress } from '../services/shadowbid.js';
import type { ShadowBidLedger } from '../services/shadowbid.js';
import { CONFIG } from '../config.js';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { useWallet } from './useWallet.js';

export type AuctionsState = {
  auctions: AuctionView[];
  ledger: ShadowBidLedger | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/** Polls the indexer for the contract's public state and decodes auction views. */
export function useAuctions(pollMs = 8000): AuctionsState {
  const { client } = useWallet();
  const [auctions, setAuctions] = useState<AuctionView[]>([]);
  const [ledger, setLedger] = useState<ShadowBidLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const address = storedContractAddress();
    const hasClient = !!client;
    const hasAddress = !!address;
    if (!hasClient && !hasAddress) {
      setAuctions([]);
      setLedger(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const fetcher: Promise<ShadowBidLedger> = hasClient
      ? client!.fetchLedger()
      : (async () => {
          const provider = indexerPublicDataProvider(CONFIG.indexerUri, CONFIG.indexerWsUri, WebSocket as never);
          const state = await provider.queryContractState(address!);
          if (!state) throw new Error('Contract not yet deployed on this network — create the first auction to deploy it.');
          const { ledger } = await import('../../managed/shadowbid/contract/index.js');
          return ledger(state.data);
        })();
    fetcher
      .then((l) => {
        if (cancelled) return;
        setLedger(l);
        setAuctions(decodeAuctions(l));
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [client, tick]);

  useEffect(() => {
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { auctions, ledger, loading, error, refresh };
}
