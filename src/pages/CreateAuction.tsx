import { useState } from 'react';
import { Page } from '../components/Header.js';
import { ErrorAlert, TxStatus } from '../components/TxStatus.js';
import { useWallet } from '../hooks/useWallet.js';
import { describeWalletError } from '../services/wallet.js';
import { CONFIG } from '../config.js';

export function CreateAuction({ navigate }: { navigate: (to: string) => void }) {
  const { status, client, tx, setTx, connect, ensureClient, address } = useWallet();
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (status !== 'ready' && status !== 'wallet-connected' && status !== 'linking-contract') {
    return (
      <Page>
        <div className="card connect-nudge">
          <h3>Connect to create an auction</h3>
          <p style={{ color: 'var(--text-dim)' }}>
            Creating an auction is a Midnight transaction proven by a zero-knowledge circuit and
            submitted through your wallet.
          </p>
          <p className="hint">If no contract has been deployed yet, your first auction deploys it.</p>
          <button className="btn btn-primary" onClick={() => void connect()} style={{ marginTop: 12 }}>
            Connect 1AM Wallet
          </button>
        </div>
      </Page>
    );
  }

  const submit = async () => {
    setError(null);
    if (!itemName.trim()) {
      setError('Please enter an item name.');
      return;
    }
    try {
      setTx({ phase: 'building', label: `Preparing ZK circuit for "${itemName.trim()}"…` });
      const c = client ?? (await ensureClient());
      await c.createAuction(itemName.trim(), itemDescription.trim() || '—');

      // Record ownership so the seller can be identified on the auction detail page
      if (address) {
        try {
          const creatorsRaw = localStorage.getItem('shadowbid.auctionCreators') ?? '{}';
          const creators = JSON.parse(creatorsRaw) as Record<string, string>;
          creators[itemName.trim()] = address;
          localStorage.setItem('shadowbid.auctionCreators', JSON.stringify(creators));
        } catch {}
      }

      setTx({ phase: 'done', label: '✓ Auction created and submitted to network!' });
      setTimeout(() => {
        setTx({ phase: 'idle' });
        navigate('/auctions');
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/timed out/i.test(msg)) {
        setTx({ phase: 'done', label: 'Submitted — waiting for indexer. Redirecting to dashboard…' });
        console.warn('[ShadowBid] createAuction timed out, but tx confirmed on-chain:', msg);
        setTimeout(() => {
          setTx({ phase: 'idle' });
          navigate('/auctions');
        }, 1500);
        return;
      }
      setTx({ phase: 'idle' });
      setError(describeWalletError(err));
    }
  };

  return (
    <Page>
      <h2 className="page-title">Create Auction</h2>
      <p className="page-subtitle">
        Item name and description are public auction metadata. Bids will be sealed — you will only
        learn amounts through verified winner claims after close.
      </p>

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="field">
          <label htmlFor="item-name">Item name</label>
          <input id="item-name" className="input" placeholder="e.g. MacBook Pro 14 M4"
            value={itemName} onChange={(e) => setItemName(e.target.value)} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="item-desc">Description</label>
          <textarea id="item-desc" className="input" rows={3}
            placeholder="Condition, specs, anything bidders should know…"
            value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} maxLength={300} />
        </div>

        <button className="btn btn-primary" onClick={() => void submit()} disabled={tx.phase !== 'idle' && tx.phase !== 'done'}>
          Create Auction
        </button>

        <TxStatus tx={tx} />
        {error && <ErrorAlert message={error} />}

        <div className="section-gap" />
        <span className="privacy-chip">
          Network: {(CONFIG.networkId as string) === 'undeployed' ? 'local devnet' : CONFIG.networkId}
        </span>
      </div>
    </Page>
  );
}