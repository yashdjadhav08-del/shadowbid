import { Page } from '../components/Header.js';
import { AuctionCard } from '../components/AuctionCard.js';
import { ErrorAlert } from '../components/TxStatus.js';
import { useAuctions } from '../hooks/useAuctions.js';
import { useWallet } from '../hooks/useWallet.js';

export function Dashboard({ navigate }: { navigate: (to: string) => void }) {
  const { status, connect, error: walletError } = useWallet();
  const { auctions, loading, error, refresh } = useAuctions();

  const isConnected = status === 'ready' || status === 'wallet-connected' || status === 'linking-contract';

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

      {/* Non-blocking connect banner — auctions are still visible below */}
      {!isConnected && (
        <div className="card" style={{ marginTop: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span style={{ fontWeight: 600 }}>🔒 Connect to bid or create auctions</span>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
              Viewing is open to everyone. A wallet is needed to submit bids or create new auctions.
            </p>
          </div>
          {(walletError || (status === 'error' && walletError)) && <ErrorAlert message={walletError!} onRetry={() => void connect()} />}
          {status === 'no-wallet' ? (
            <div className="alert alert-info" style={{ margin: 0 }}>
              No Midnight wallet detected. Install the <b>1AM</b> wallet extension, then reload.
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => void connect()}>
              Connect 1AM Wallet
            </button>
          )}
        </div>
      )}

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

