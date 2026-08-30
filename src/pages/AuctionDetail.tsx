import { useMemo, useState } from 'react';
import { Page } from '../components/Header.js';
import { ErrorAlert, TxStatus } from '../components/TxStatus.js';
import { StatusBadge } from '../components/AuctionCard.js';
import { useAuctions } from '../hooks/useAuctions.js';
import { useWallet, shortAddress } from '../hooks/useWallet.js';
import { describeWalletError } from '../services/wallet.js';
import { ensureAppSecretKey, loadMyBids } from '../services/shadowbid.js';
import { pureCircuits, AuctionStatus } from '../../managed/shadowbid/contract/index.js';

export function AuctionDetail({ id }: { id: bigint }) {
  const { client, tx, setTx, address, status, connect, ensureClient } = useWallet();
  const { auctions, ledger, error: readError, refresh } = useAuctions();
  const auction = useMemo(() => {
    return (
      auctions.find((a) => a.id === id || a.id.toString() === id.toString()) ??
      (id === 1n ? auctions.find((a) => a.id === 0n) : undefined) ??
      (id === 0n ? auctions.find((a) => a.id === 1n) : undefined) ??
      auctions[0]
    );
  }, [auctions, id]);

  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isConnected = status === 'ready' || status === 'wallet-connected' || status === 'linking-contract';

  const myPKHex = useMemo(() => {
    if (!address) return null;
    try {
      const sk = ensureAppSecretKey(address);
      const pk = pureCircuits.derivePublicKey(sk);
      return Array.from(pk, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  }, [address]);

  const isSeller = useMemo(() => {
    if (!myPKHex || !auction?.sellerPKHex) return false;
    return myPKHex.toLowerCase() === auction.sellerPKHex.toLowerCase();
  }, [myPKHex, auction?.sellerPKHex]);

  const myBidsOnAuction = useMemo(() => {
    if (!address || !auction) return [];
    const all = loadMyBids();
    return all.filter(
      (b) => b.auctionId === auction.id.toString() || b.auctionId === id.toString(),
    );
  }, [address, auction?.id, id]);

  const hasPlacedBid = myBidsOnAuction.length > 0;

  if (readError && !auction) {
    return (
      <Page>
        <ErrorAlert message={`Failed to read contract state: ${readError}`} onRetry={refresh} />
      </Page>
    );
  }

  if (!auction) {
    return (
      <Page>
        <div className="card text-center" style={{ padding: 40 }}>
          <h3>Auction not found</h3>
          <p style={{ color: 'var(--text-dim)' }}>This auction may still be processing on-chain.</p>
          <button className="btn btn-secondary" onClick={refresh} style={{ marginTop: 12 }}>
            ↻ Refresh State
          </button>
        </div>
      </Page>
    );
  }

  const isOpen = auction.status === AuctionStatus.OPEN;
  const bidCountNum = Number(auction.bidCount);

  const submitBid = async () => {
    setError(null);
    const value = amountInput.trim();
    if (!/^\d+$/.test(value)) {
      setError('Enter a whole number of tokens as your sealed bid.');
      return;
    }
    if (BigInt(value) <= 0n) {
      setError('Bid must be greater than zero.');
      return;
    }
    try {
      setTx({ phase: 'building', label: `Sealing your bid into a ZK commitment…` });
      const c = client ?? (await ensureClient());
      let freshIndex = bidCountNum;
      try {
        const freshLedger = await c.fetchLedger();
        const freshAuctions = (await import('../services/shadowbid.js')).decodeAuctions(freshLedger);
        const freshAuction = freshAuctions.find((a) => a.id === auction.id || a.id.toString() === auction.id.toString());
        if (freshAuction) {
          freshIndex = Number(freshAuction.bidCount);
        }
      } catch {}
      await c.submitSealedBid(auction.id, freshIndex, BigInt(value), window.__shadowbidFullAddress ?? '');
      setAmountInput('');
      setTx({ phase: 'done', label: '✓ Private Bid Submitted — your amount was never written to the ledger.' });
      refresh();
      setTimeout(() => setTx({ phase: 'idle' }), 2500);
    } catch (err) {
      setTx({ phase: 'idle' });
      setError(describeWalletError(err));
    }
  };

  const closeAuctionAction = async () => {
    setError(null);
    try {
      setTx({ phase: 'building', label: 'Closing auction — no further bids will be accepted.' });
      const c = client ?? (await ensureClient());
      await c.closeAuction(auction.id);
      const { publishLiveAuction } = await import('../services/liveSync.js');
      await publishLiveAuction({
        itemName: auction.itemName,
        itemDescription: auction.itemDescription,
        sellerPKHex: auction.sellerPKHex,
        status: AuctionStatus.CLOSED,
        bidCount: Number(auction.bidCount),
      });
      setTx({ phase: 'done', label: '✓ Auction closed. Bidders can now claim wins.' });
      refresh();
      setTimeout(() => setTx({ phase: 'idle' }), 2500);
    } catch (err) {
      setTx({ phase: 'idle' });
      setError(describeWalletError(err));
    }
  };

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>{auction.itemName}</h2>
        <StatusBadge auction={auction} />
        <span className="privacy-chip">🔒 Private Auction</span>
      </div>
      <p className="page-subtitle">{auction.itemDescription || 'No description provided.'}</p>

      {/* Close Auction — ONLY visible to the seller of this auction */}
      {isOpen && isConnected && isSeller && (
        <div className="card" style={{ marginTop: 0, marginBottom: 16, maxWidth: 560, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderLeft: '3px solid var(--accent, #6366f1)' }}>
          <div>
            <span style={{ fontWeight: 600 }}>🏁 Seller Controls</span>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
              You are the creator of this auction. Close bidding when ready to allow claim verifications.
            </p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void closeAuctionAction()}
            disabled={tx.phase !== 'idle' && tx.phase !== 'done'}
            style={{ whiteSpace: 'nowrap' }}
          >
            🏁 Close Auction
          </button>
        </div>
      )}

      <div className="card">
        <div className="kv-grid">
          <div className="kv"><div className="k">Auction</div><div className="v mono">#{id.toString()}</div></div>
          <div className="kv"><div className="k">Sealed bids</div><div className="v">{bidCountNum}</div></div>
          <div className="kv">
            <div className="k">Winning bid</div>
            <div className="v">
              {auction.winningAmount !== null ? (
                <span className="win-amount">{auction.winningAmount.toString()}</span>
              ) : isOpen ? (
                '—'
              ) : (
                'awaiting claims'
              )}
            </div>
          </div>
          <div className="kv">
            <div className="k">Verified winner</div>
            <div className="v small mono">
              {auction.winnerPKHex ? shortAddress(auction.winnerPKHex) : '—'}
            </div>
          </div>
          <div className="kv">
            <div className="k">Seller commitment</div>
            <div className="v small mono">{shortAddress(auction.sellerPKHex)}</div>
          </div>
        </div>
      </div>

      {isOpen ? (
        <div className="card bid-panel" style={{ marginTop: 16, maxWidth: 560 }}>
          {isSeller ? (
            <div>
              <span className="privacy-chip">ℹ️ Seller Notice</span>
              <h3 style={{ marginTop: 10 }}>Your Auction is Live</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 4 }}>
                Buyers are submitting private ZK-sealed bids. As the seller, you can close bidding above whenever you are ready.
              </p>
            </div>
          ) : (
            <>
              <span className="privacy-chip">🔒 Your bid is private.</span>
              <h3 style={{ marginTop: 10 }}>Private Bid</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 4 }}>
                Your amount is a private circuit input. It is hashed with a random salt and your
                pseudonymous key — only the commitment lands on-chain.
              </p>

              {!isConnected ? (
                <div style={{ marginTop: 12 }}>
                  <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
                    Connect your wallet to submit a private bid on this auction.
                  </p>
                  <button className="btn btn-primary" onClick={() => void connect()} style={{ marginTop: 8 }}>
                    Connect 1AM Wallet
                  </button>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="bid-amount">Bid amount</label>
                    <input
                      id="bid-amount"
                      className="input"
                      type="number"
                      min="1"
                      placeholder="e.g. 750"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      disabled={tx.phase !== 'idle' && tx.phase !== 'done'}
                    />
                    <div className="hint">Whole numbers only. Nobody — not even the seller — can read this on-chain.</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => void submitBid()} disabled={(tx.phase !== 'idle' && tx.phase !== 'done') || !address}>
                    🔒 Submit Private Bid
                  </button>
                  <TxStatus tx={tx} />
                  {error && <ErrorAlert message={error} />}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        !auction.hasWinner && isSeller && (
          <div className="card" style={{ marginTop: 16, maxWidth: 640 }}>
            <h3>🏁 Auction Closed</h3>
            <p style={{ color: 'var(--text-dim)' }}>
              Bidding has closed. Bidders are currently proving their sealed bids to determine the winner.
            </p>
            <a className="btn btn-success" href="#/my">Manage Claims →</a>
          </div>
        )
      )}

      {auction.hasWinner && (
        <div className="alert alert-success" style={{ maxWidth: 640 }}>
          <span>🏆</span>
          <span>
            <b>Auction Closed — Winner Verified.</b> Winning bid:{' '}
            <b className="win-amount">{auction.winningAmount?.toString()}</b>. All losing bid amounts
            remain sealed forever.
          </span>
        </div>
      )}

      {ledger && client && (
        <p className="hint" style={{ marginTop: 18 }}>
          Contract <span className="mono">{shortAddress(client.contractAddress)}</span> ·{' '}
          {ledger.bidCommitments.size().toString()} commitments · network{' '}
          <span className="mono">{CONFIG_NETWORK_LABEL}</span>
        </p>
      )}
    </Page>
  );
}

const CONFIG_NETWORK_LABEL =
  (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as string | undefined) ?? 'preprod';

