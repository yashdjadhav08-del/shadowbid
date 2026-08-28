export type LiveAuctionPayload = {
  id?: string | bigint;
  itemName: string;
  itemDescription: string;
  sellerPKHex: string;
  status?: number;
  bidCount?: number;
};

const broadcastChan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('shadowbid_live') : null;

/** Notify UI components of live auction / contract updates */
export function emitLiveUpdate(): void {
  window.dispatchEvent(new CustomEvent('shadowbid:liveUpdate'));
}

let eventSource: EventSource | null = null;
let liveAuctionsCache: LiveAuctionPayload[] = [];

export function getLiveAuctions(): LiveAuctionPayload[] {
  return liveAuctionsCache;
}

export function initLiveSync(): void {
  if (eventSource) return;

  // Listen to BroadcastChannel for instant cross-tab sync
  if (broadcastChan) {
    broadcastChan.onmessage = (event) => {
      if (event.data?.type === 'auction_update') {
        if (Array.isArray(event.data.auctions)) {
          liveAuctionsCache = event.data.auctions;
        }
        emitLiveUpdate();
      }
    };
  }

  // Connect to SSE Live Server
  const sseUrl = '/api/live-stream';
  try {
    eventSource = new EventSource(sseUrl);

    eventSource.addEventListener('init', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.auctions) && data.auctions.length > 0) {
          liveAuctionsCache = data.auctions;
        }
        if (data.contractAddress) {
          localStorage.setItem('shadowbid.contractAddress.preprod', data.contractAddress);
          localStorage.setItem('shadowbid.contractAddress', data.contractAddress);
        }
        emitLiveUpdate();
      } catch {}
    });

    eventSource.addEventListener('auction_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.auctions)) {
          liveAuctionsCache = data.auctions;
        }
        emitLiveUpdate();
      } catch {}
    });

    eventSource.addEventListener('contract_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.contractAddress) {
          localStorage.setItem('shadowbid.contractAddress.preprod', data.contractAddress);
          localStorage.setItem('shadowbid.contractAddress', data.contractAddress);
          emitLiveUpdate();
        }
      } catch {}
    });

    eventSource.onerror = () => {
      // Reconnect automatically
    };
  } catch (e) {
    console.warn('[ShadowBid] SSE LiveSync setup warning:', e);
  }
}

export async function publishLiveAuction(auction: LiveAuctionPayload): Promise<void> {
  // Update local cache
  const idx = liveAuctionsCache.findIndex((a) => a.itemName === auction.itemName);
  if (idx >= 0) {
    liveAuctionsCache[idx] = { ...liveAuctionsCache[idx], ...auction };
  } else {
    liveAuctionsCache.unshift(auction);
  }
  emitLiveUpdate();

  // Broadcast to other tabs
  if (broadcastChan) {
    broadcastChan.postMessage({ type: 'auction_update', auctions: liveAuctionsCache });
  }

  // Post to Live Updates Server
  try {
    await fetch('/api/auctions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auction),
    });
  } catch (e) {
    console.warn('[ShadowBid] publishLiveAuction server sync warning:', e);
  }
}

export async function publishLiveContract(contractAddress: string): Promise<void> {
  localStorage.setItem('shadowbid.contractAddress.preprod', contractAddress);
  localStorage.setItem('shadowbid.contractAddress', contractAddress);

  try {
    await fetch('/api/contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractAddress }),
    });
  } catch (e) {
    console.warn('[ShadowBid] publishLiveContract server sync warning:', e);
  }
}
