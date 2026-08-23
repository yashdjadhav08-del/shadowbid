import { useState } from 'react';
import { Page } from '../components/Header.js';
import { ErrorAlert, TxStatus } from '../components/TxStatus.js';
import { useWallet } from '../hooks/useWallet.js';
import { describeWalletError } from '../services/wallet.js';
import { CONFIG } from '../config.js';

export function CreateAuction({ navigate }: { navigate: (to: string) => void }) {
  const { status, client, tx, setTx, connect, ensureClient } = useWallet();
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (status !== 'ready' && status !== 'wallet-connected' && status !== 'linking-contract') {
    return (
      <Page>
        <div className="card connect-nudge">
          <h3>🔒 Connect to create an auction</h3>
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
      // Advance to 'proving' immediately so the UI moves past 'building' right away.
      // ensureClient() (which may deploy/find the contract) happens during this phase.
      setTx({ phase: 'proving', label: `Creating auction for "${itemName.trim()}" — connecting to contract…` });
      const c = client ?? (await ensureClient());

      // Midnight's callTx watches the indexer for finalization, which can lag on Preview.
      // Don't hang forever — consider it a success once submitted; the indexer poll will pick it up.
      const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s — tx may still confirm in the background. Check the dashboard in 30s.`)), ms)),
        ]);

      // Client is ready — wallet will now show an authorization prompt.
      setTx({ phase: 'awaiting-authorization', label: 'Approve the transaction in your 1AM wallet…' });
      console.info('[ShadowBid] createAuction: calling contract, waiting for wallet + indexer...');

      // Only wrap the actual createAuction call (not ensureClient) in the timeout.
      const id = await withTimeout(c.createAuction(itemName.trim(), itemDescription.trim() || '—'), 45_000, 'Create auction');
      if (id === -1n) {
        setTx({ phase: 'done', label: '✓ Submitted — check Auctions in 30s for confirmation.' });
        setTimeout(() => {
          setTx({ phase: 'idle' });
          navigate('/auctions');
        }, 1200);
      } else {
        setTx({ phase: 'done', label: '✓ Auction created on-chain.' });
        setTimeout(() => {
          setTx({ phase: 'idle' });
          navigate(`/auction/${id}`);
        }, 900);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/timed out/i.test(msg)) {
        setTx({ phase: 'done', label: 'Submitted — waiting for indexer. Check dashboard in 30s.' });
        console.warn('[ShadowBid] createAuction timed out, but tx may still confirm:', msg);
        setTimeout(() => {
          setTx({ phase: 'idle' });
          navigate('/auctions');
        }, 2000);
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
          <input id="item-name" className="input" placeholder="e.g. MacBook Pro 14″ M4"
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
          Network: {CONFIG.networkId === 'undeployed' ? 'local devnet' : CONFIG.networkId}
        </span>
      </div>
    </Page>
  );
}
