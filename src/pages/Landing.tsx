import { Page } from '../components/Header.js';
import { useWallet } from '../hooks/useWallet.js';

export function Landing() {
  const { status, connect } = useWallet();
  const connected = status === 'ready' || status === 'wallet-connected';

  return (
    <Page>
      <div className="hero">
        <span className="hero-badge">◈ Midnight Level 3 · Zero-Knowledge Sealed-Bid Auction</span>
        <h1>
          Bidders stay in the dark.<br />
          The winner doesn't have to be <span className="grad">trusted</span>.
        </h1>
        <p className="lead">
          ShadowBid runs sealed-bid auctions on Midnight. Bid amounts are private circuit inputs
          proven with zero-knowledge proofs — the public ledger only ever sees hiding commitments,
          never amounts.
        </p>
        <div className="hero-actions">
          {connected ? (
            <>
              <a className="btn btn-primary" href="#/auctions">Browse Auctions →</a>
              <a className="btn btn-secondary" href="#/create">Create an Auction</a>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => void connect()} disabled={status === 'checking'}>
                🔒 Connect 1AM Wallet
              </button>
              <a className="btn btn-secondary" href="#/privacy">How the privacy works</a>
            </>
          )}
        </div>

        <div className="flow-diagram" aria-label="Auction flow">
          <span className="flow-step">Seller creates auction</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step">Bidders submit 🔒 private bids</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step">ZK proof per bid</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step">Close auction</span>
          <span className="flow-arrow">→</span>
          <span className="flow-step">🏆 Verified winner</span>
        </div>

        <div className="feature-row">
          <div className="card feature">
            <span className="icon">🕶️</span>
            <h4>Sealed by circuits, not CSS</h4>
            <p>Amounts enter Compact circuits as private witnesses and are hashed into commitments. There is nothing to leak on-chain.</p>
          </div>
          <div className="card feature">
            <span className="icon">🧾</span>
            <h4>Binding commitments</h4>
            <p>Every bid is committed as a domain-separated persistent hash of amount + salt + bidder key. Nobody can invent a winning bid after close.</p>
          </div>
          <div className="card feature">
            <span className="icon">🏆</span>
            <h4>Verified winner</h4>
            <p>The winner is derived on-chain from real sealed bids through ZK-verified claims. No hardcoded outcomes, no trusted seller.</p>
          </div>
          <div className="card feature">
            <span className="icon">👛</span>
            <h4>1AM wallet native</h4>
            <p>Connect, authorize, prove and submit — all through your Midnight wallet via the DApp Connector API.</p>
          </div>
        </div>
      </div>
    </Page>
  );
}
