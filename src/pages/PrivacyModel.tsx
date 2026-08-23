import { Page } from '../components/Header.js';

export function PrivacyModel() {
  return (
    <Page>
      <h2 className="page-title">Privacy Model</h2>
      <p className="page-subtitle">
        ShadowBid's privacy is enforced by Midnight's zero-knowledge architecture — Compact circuits,
        private witnesses and hiding commitments. The frontend is not the privacy boundary.
      </p>

      <div className="privacy-cols">
        <div className="card privacy-col">
          <h4>🌐 PUBLIC <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(ledger)</span></h4>
          <ul>
            <li>Auction id, item name &amp; description</li>
            <li>Auction status (open / closed / settled)</li>
            <li><b>Count</b> of sealed bids per auction</li>
            <li>Bid commitments (hiding hashes)</li>
            <li>Pseudonymous seller / winner commitments</li>
            <li>The final winning amount (intentional disclosure)</li>
          </ul>
        </div>

        <div className="card privacy-col">
          <h4>🔒 PRIVATE <span style={{ color: 'var(--text-faint)' }}>(witnesses only)</span></h4>
          <ul>
            <li>Individual bid amounts</li>
            <li>Bid salts</li>
            <li>Per-user pseudonym secret keys</li>
            <li>Losing bids' values — never, ever disclosed</li>
          </ul>
        </div>

        <div className="card privacy-col">
          <h4>🧠 PROVED WITHOUT REVEALING</h4>
          <ul>
            <li>A claimed bid matches a commitment sealed during the bidding phase</li>
            <li>The claimant knows the exact preimage (amount + salt + key)</li>
            <li>A claim strictly beats the current best before the winner is updated</li>
            <li>Seller-only close: H(secret) equals the stored seller commitment</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>What an on-chain observer learns</h3>
        <p style={{ color: 'var(--text-dim)' }}>
          An observer sees when auctions are created and closed, how many sealed bids exist, the
          commitments themselves, and — after settlement — the winning amount and winner commitment.
          They can also observe that a claim attempt succeeded or failed to beat the current best
          (an unavoidable consequence of public settlement), which bounds a losing amount by the
          winning amount without revealing it.
        </p>
        <h3 style={{ marginTop: 18 }}>What they cannot learn</h3>
        <p style={{ color: 'var(--text-dim)' }}>
          Any losing bid's value. Commitments are domain-separated persistent hashes over
          <code> (auctionId, bidIndex, bidderKey, salt, amount)</code>; without the salt the hash is
          irreversible, and each circuit proof verifies claims without disclosing their inputs.
        </p>
      </div>

      <div className="card">
        <h3>Circuits</h3>
        <div className="table-wrap">
          <table className="nice">
            <thead>
              <tr><th>Circuit</th><th>Who</th><th>What it proves / enforces</th></tr>
            </thead>
            <tbody>
              <tr><td className="mono">createAuction</td><td>Seller</td><td>Registers auction + seller commitment; item metadata disclosed.</td></tr>
              <tr><td className="mono">submitBid</td><td>Bidder</td><td>Amount stays private; stores H(amount ‖ salt ‖ key ‧ context); increments public count.</td></tr>
              <tr><td className="mono">closeAuction</td><td>Seller</td><td>ZK check that caller's derived key equals stored seller commitment; seals bidding.</td></tr>
              <tr><td className="mono">claimWin</td><td>Any bidder</td><td>ZK check of commitment preimage against ledger; updates verified winner only if the (private) amount beats the public best.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  );
}
