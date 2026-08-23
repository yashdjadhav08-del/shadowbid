import type { ReactNode } from 'react';
import { useWallet, shortAddress } from '../hooks/useWallet.js';
import { useHashRoute } from '../hooks/useHashRoute.js';
import { NETWORK_ID, switchNetwork, type NetworkId } from '../config.js';

function WalletButton() {
  const { status, address, connect, disconnect } = useWallet();

  if (status === 'ready' || status === 'wallet-connected') {
    return (
      <div className="wallet-pill">
        <span className="wallet-dot" />
        <span className="mono" title="Connected 1AM wallet">{address ? shortAddress(address) : 'connected'}</span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={disconnect}
          title="Disconnect wallet"
          style={{ padding: '3px 9px', marginLeft: 4 }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  const label =
    status === 'checking'
      ? 'Detecting wallet…'
      : status === 'connecting-wallet' || status === 'linking-contract'
        ? 'Connecting…'
        : 'Connect 1AM Wallet';

  return (
    <button className="btn btn-primary btn-sm" onClick={() => void connect()} disabled={status === 'checking'}>
      🔒 {label}
    </button>
  );
}

export function Header() {
  const { path } = useHashRoute();
  const link = (to: string, label: string) => (
    <a href={`#${to}`} className={path === to || (to !== '/' && path.startsWith(to)) ? 'active' : ''}>
      {label}
    </a>
  );

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="brand" href="#/">
          <span className="brand-mark">◈</span> ShadowBid
        </a>
        <nav className="main-nav">
          {link('/', 'Home')}
          {link('/auctions', 'Auctions')}
          {link('/create', 'Create Auction')}
          {link('/my', 'My Participation')}
          {link('/privacy', 'Privacy Model')}
        </nav>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.9 }}>
            <span>Network</span>
            <select
              value={NETWORK_ID}
              onChange={(e) => switchNetwork(e.target.value as NetworkId)}
              style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              title="Switch Midnight network (reloads)"
            >
              <option value="preprod">Preprod</option>
              <option value="preview">Preview</option>
              <option value="undeployed">Undeployed (local)</option>
            </select>
          </label>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      ShadowBid · sealed bids, verifiable winners · built with{' '}
      <a href="https://midnight.network/" target="_blank" rel="noreferrer">Midnight</a> Compact + ZK proofs ·{' '}
      <a href="#/privacy">privacy model</a>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="container">{children}</div>;
}
