import type { AuctionView } from '../services/shadowbid.js';
import { AuctionStatus } from '../services/shadowbid.js';

export function StatusBadge({ auction }: { auction: AuctionView }) {
  if (auction.status === AuctionStatus.OPEN) return <span className="badge badge-open">● Open</span>;
  if (auction.hasWinner) return <span className="badge badge-settled">★ Settled</span>;
  return <span className="badge badge-closed">■ Closed</span>;
}

export function AuctionCard({ auction, onOpen }: { auction: AuctionView; onOpen: () => void }) {
  const shortPK = (pk: string) => `${pk.slice(0, 10)}…${pk.slice(-6)}`;
  return (
    <div className="card auction-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="row">
        <span className="privacy-chip">🔒 sealed bids</span>
        <StatusBadge auction={auction} />
      </div>
      <div>
        <h3 className="auction-item-name">{auction.itemName}</h3>
        <p className="auction-desc">{auction.itemDescription || 'No description provided.'}</p>
      </div>
      <div className="stat-inline">
        <span>Auction <b className="mono">#{auction.id.toString()}</b></span>
        <span>Sealed bids <b>{auction.bidCount.toString()}</b></span>
        {auction.winningAmount !== null && (
          <span>
            Winning bid <b className="win-amount">{auction.winningAmount.toString()}</b>
          </span>
        )}
      </div>
      <div className="stat-inline">
        <span title="Pseudonymous seller commitment derived in-circuit">
          Seller <b className="mono">{shortPK(auction.sellerPKHex)}</b>
        </span>
        {auction.winnerPKHex && (
          <span title="Verified winner commitment">
            Winner <b className="mono">{shortPK(auction.winnerPKHex)}</b>
          </span>
        )}
      </div>
    </div>
  );
}
