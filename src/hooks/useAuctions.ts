import { useCallback, useEffect, useState } from 'react';
import { decodeAuctions, type AuctionView, storedContractAddress, loadPendingAuctions, AuctionStatus } from '../services/shadowbid.js';
import type { ShadowBidLedger } from '../services/shadowbid.js';
import { CONFIG } from '../config.js';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { useWallet } from './useWallet.js';
import { initLiveSync, getLiveAuctions, fetchSharedContractAddress } from '../services/liveSync.js';

export type AuctionsState = {
  auctions: AuctionView[];
  ledger: ShadowBidLedger | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

function getCombinedPendingAuctions() {
  const local = loadPendingAuctions();
  const live = getLiveAuctions();
  const map = new Map<string, { itemName: string; itemDescription?: string; sellerPKHex?: string; status?: number; bidCount?: number }>();
  for (const p of [...local, ...live]) {
    if (p.itemName) {
      const existing = map.get(p.itemName);
      const pStatus = (p as { status?: number }).status;
      const pBidCount = (p as { bidCount?: number }).bidCount;
      map.set(p.itemName, {
        itemName: p.itemName,
        itemDescription: p.itemDescription ?? existing?.itemDescription,
        sellerPKHex: (p as { sellerPKHex?: string }).sellerPKHex ?? existing?.sellerPKHex ?? '00'.repeat(32),
        status: pStatus !== undefined ? pStatus : existing?.status,
        bidCount: pBidCount !== undefined ? pBidCount : existing?.bidCount,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Query the indexer for on-chain auction state using a known contract address.
 * This is the read-only path that does NOT require a wallet connection.
 */
async function fetchLedgerByAddress(address: string): Promise<ShadowBidLedger> {
  const provider = indexerPublicDataProvider(CONFIG.indexerUri, CONFIG.indexerWsUri, WebSocket as never);
  const state = await provider.queryContractState(address);
  if (!state) throw new Error('Contract not yet deployed on this network — create the first auction to deploy it.');
  const { ledger } = await import('../../managed/shadowbid/contract/index.js');
  return ledger(state.data);
}

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
    initLiveSync();
    const handleLiveUpdate = () => refresh();
    window.addEventListener('shadowbid:liveUpdate', handleLiveUpdate);
    return () => window.removeEventListener('shadowbid:liveUpdate', handleLiveUpdate);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const doFetch = async () => {
      // Path 1: We have a connected client — use it directly
      if (client) {
        return client.fetchLedger();
      }

      // Path 2: Check localStorage for a contract address
      let address = storedContractAddress();

      // Path 3: No local address — ask the shared server for the contract address
      // This is the key fix: User B discovers User A's contract through the server.
      if (!address) {
        address = await fetchSharedContractAddress();
      }

      // Path 4: We have an address (from localStorage or server) — query the indexer
      if (address) {
        return fetchLedgerByAddress(address);
      }

      // No address anywhere — return null to fall back to pending/live auctions
      return null;
    };

    doFetch()
      .then((l) => {
        if (cancelled) return;
        if (l) {
          setLedger(l);
          setAuctions(decodeAuctions(l));
          setError(null);
        } else {
          // No on-chain data available — show combined pending + live server auctions
          const pending = getCombinedPendingAuctions();
          setAuctions(
            pending.map((p, idx) => ({
              id: BigInt(idx + 1),
              sellerPKHex: p.sellerPKHex ?? '00'.repeat(32),
              itemName: p.itemName,
              itemDescription: p.itemDescription ?? '',
              status: p.status !== undefined ? (p.status as AuctionStatus) : AuctionStatus.OPEN,
              bidCount: BigInt(p.bidCount ?? 0),
              hasWinner: false,
              winningBidIndex: 0n,
              winningAmount: null,
              winnerPKHex: null,
            })),
          );
          setLedger(null);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // On indexer failure, still show pending/live auctions as a fallback
        const pending = getCombinedPendingAuctions();
        if (pending.length > 0) {
          setAuctions(
            pending.map((p, idx) => ({
              id: BigInt(idx + 1),
              sellerPKHex: p.sellerPKHex ?? '00'.repeat(32),
              itemName: p.itemName,
              itemDescription: p.itemDescription ?? '',
              status: p.status !== undefined ? (p.status as AuctionStatus) : AuctionStatus.OPEN,
              bidCount: BigInt(p.bidCount ?? 0),
              hasWinner: false,
              winningBidIndex: 0n,
              winningAmount: null,
              winnerPKHex: null,
            })),
          );
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
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
