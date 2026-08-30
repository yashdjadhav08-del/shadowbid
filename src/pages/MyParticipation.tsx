import { useMemo, useState } from 'react';
import { Page } from '../components/Header.js';
import { ErrorAlert, TxStatus } from '../components/TxStatus.js';
import { useAuctions } from '../hooks/useAuctions.js';
import { useWallet } from '../hooks/useWallet.js';
import { describeWalletError } from '../services/wallet.js';
import { loadMyBids, ensureAppSecretKey, type SealedBidRecord } from '../services/shadowbid.js';
import { pureCircuits } from '../../managed/shadowbid/contract/index.js';
import { AuctionStatus } from '../../managed/shadowbid/contract/index.js';

export function MyParticipation() {
  const { status, client, tx, setTx, address, connect, ensureClient } = useWallet();
  const { auctions } = useAuctions();
  const [error, setError] = useState<string | null>(null);

  const myPK = useMemo(
    () => (address ? pureCircuits.derivePublicKey(ensureAppSecretKey(address)) : null),
    [address],
  );
  const bids = useMemo(() => {
    const all = loadMyBids();
    // Show local bids even before contract is linked — filter by network's stored address if available
    const contract = client?.contractAddress;
    if (!contract) return all;
    return all.filter((b) => b.contractAddress === contract);
  }, [client?.contractAddress]);

  if ((status !== 'ready' && status !== 'wallet-connected' && status !== 'linking-contract') || !myPK) {
    return (
      <Page>
        <div className="card connect-nudge">
          <h3>🔒 Connect to see your sealed bids</h3>
          <p style={{ color: 'var(--text-dim)' }}>
            Your sealed-bid records (amount + salt) live only in this browser. Connect the same
            wallet you bid with to claim a win after close.
          </p>
          <button className="btn btn-primary" onClick={() => void connect()}>Connect Wallet</button>
        </div>
      </Page>
    );
  }

  const claim = async (record: SealedBidRecord) => {
    setError(null);
    try {
      setTx({ phase: 'building', label: 'Proving your sealed bid in zero knowledge…' });
      const c = client ?? (await ensureClient());
      await c.claimWin(
        BigInt(record.auctionId),
        record.index,
        BigInt(record.amount),
        record.saltHex,
        record.bidderPKHex,
      );
      setTx({ phase: 'done', label: '✓ Claim processed on-chain.' });
      window.dispatchEvent(new CustomEvent('shadowbid:claimed'));
      setTimeout(() => setTx({ phase: 'idle' }), 2000);
    } catch (err) {
      setTx({ phase: 'idle' });
      setError(describeWalletError(err));
    }
  };

  const auctionStatus = (idStr: string) => auctions.find((a) => a.id.toString() === idStr);

  const claimable = (r: SealedBidRecord) => {
    const a = auctionStatus(r.auctionId);
    return !!a && a.status === AuctionStatus.CLOSED && !a.hasWinner && !r.claimed;
  };

  return (
    <Page>
      <h2 className="page-title">My Participation</h2>
      <p className="page-subtitle">
        Bids you sealed in this browser. Amounts and salts are stored locally — they are your
        private witnesses for proving a win after close.
      </p>

      {bids.length === 0 ? (
        <div className="empty-state card">
          <div className="big">🤫</div>
          <h3>No sealed bids yet</h3>
          <p>Open an auction and place a private bid — it will appear here.</p>
          <a className="btn btn-primary" href="#/auctions">Browse Auctions</a>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="nice">
            <thead>
              <tr>
                <th>Auction</th>
                <th>My sealed amount</th>
                <th>Bid index</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bids.map((r) => {
                const a = auctionStatus(r.auctionId);
                const statusLabel =
                  !a ? 'unknown yet' : a.status === AuctionStatus.OPEN ? 'auction open' : r.claimed ? 'claimed' : a.hasWinner ? 'settled' : 'claimable!';
                // Seller check: localStorage (set at creation) is the most reliable source
                const isBidSeller = (() => {
                  if (!a) return false;
                  const fullAddr = window.__shadowbidFullAddress ?? address ?? '';
                  if (!fullAddr) return false;
                  try {
                    const creatorsRaw = localStorage.getItem('shadowbid.auctionCreators') ?? '{}';
                    const creators = JSON.parse(creatorsRaw) as Record<string, string>;
                    const shortAddr = address ?? '';
                    if (
                      creators[a.itemName] === fullAddr || creators[a.itemName] === shortAddr ||
                      creators[r.auctionId] === fullAddr || creators[r.auctionId] === shortAddr
                    ) return true;
                  } catch {}
                  // Fallback: ZK key comparison with full address
                  if (!myPK || !a.sellerPKHex || a.sellerPKHex === '00'.repeat(32)) return false;
                  try {
                    const myPKHex = Array.from(pureCircuits.derivePublicKey(ensureAppSecretKey(fullAddr))).map(b => b.toString(16).padStart(2,'0')).join('');
                    return myPKHex.toLowerCase() === a.sellerPKHex.toLowerCase();
                  } catch { return false; }
                })();
                return (
                  <tr key={`${r.auctionId}-${r.index}`}>
                    <td>
                      <a href={`#/auction/${r.auctionId}`} className="mono">#{r.auctionId}</a>{' '}
                      {a ? <span style={{ color: 'var(--text-dim)' }}>{a.itemName}</span> : null}
                    </td>
                    <td><span className="mono">{BigInt(r.amount).toString()}</span> <span className="privacy-chip" style={{ marginLeft: 6 }}>🔒 only you know this</span></td>
                    <td className="mono">{r.index}</td>
                    <td>{statusLabel}</td>
                    <td>
                      {claimable(r) && isBidSeller && (
                        <button className="btn btn-success btn-sm" onClick={() => void claim(r)}>
                          Claim win
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-gap" />
      <TxStatus tx={tx} />
      {error && <ErrorAlert message={error} />}
    </Page>
  );
}
