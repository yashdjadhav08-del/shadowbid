import { Page } from '../components/Header.js';
import { AuctionCard } from '../components/AuctionCard.js';
import { ErrorAlert } from '../components/TxStatus.js';
import { useAuctions } from '../hooks/useAuctions.js';
import { useWallet } from '../hooks/useWallet.js';

export function Dashboard({ navigate }: { navigate: (to: string) => void }) {
  const { status, connect, error: walletError } = useWallet();
  const { auctions, loading, error, refresh } = useAuctions();

  // Wallet-only gate — auctions are public, no contract deploy needed to *view* them.
  if (status !== 'ready' && status !== 'wallet-connected' && status !== 'linking-contract') {
    return (
      <Page>
        <div className="card connect-nudge">
          <h3>🔒 Connect to view auctions</h3>
          <p style={{ color: 'var(--text-dim)' }}>
            Auction metadata is public on Midnight's ledger. Connect your 1AM wallet to read live
            contract state through the indexer.
          </p>
          {(walletError || (status === 'error' && walletError)) && <ErrorAlert message={walletError!} onRetry={() => void connect()} />}
          {status === 'no-wallet' ? (
            <div className="alert alert-info">
              No Midnight wallet detected. Install the <b>1AM</b> wallet extension, then reload.
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => void connect()}>
              Connect 1AM Wallet
            </button>
          )}
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="page-title">Active Auctions</h2>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Public metadata only — individual bid amounts are sealed in ZK commitments and are not
            readable by anyone, including this UI.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="section-gap" />

      {error && <ErrorAlert message={`Failed to read contract state: ${error}`} onRetry={refresh} />}

      {loading && auctions.length === 0 ? (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      ) : !error && auctions.length === 0 ? (
        <div className="empty-state card">
          <div className="big">🕳️</div>
          <h3>No auctions yet</h3>
          <p>Be the first seller — create a sealed-bid auction.</p>
          <a className="btn btn-primary" href="#/create">Create Auction</a>
        </div>
      ) : (
        <div className="grid grid-cards">
          {auctions.map((a) => (
            <AuctionCard key={a.id.toString()} auction={a} onOpen={() => navigate(`/auction/${a.id}`)} />
          ))}
        </div>
      )}
    </Page>
  );
}
