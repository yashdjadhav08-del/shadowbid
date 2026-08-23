import type { TxProgress } from '../hooks/useWallet.js';

const STEPS: { phase: TxProgress['phase']; label: string }[] = [
  { phase: 'building', label: 'Building transaction' },
  { phase: 'proving', label: 'Generating privacy proof…' },
  { phase: 'balancing', label: 'Balancing transaction (fees)' },
  { phase: 'awaiting-authorization', label: 'Waiting for wallet authorization' },
  { phase: 'submitting', label: 'Submitting to Midnight' },
  { phase: 'finalizing', label: 'Finalizing on-chain' },
];

/**
 * Shows the zero-knowledge / transaction pipeline while a circuit call is in
 * flight, with clear done/error states.
 */
export function TxStatus({ tx }: { tx: TxProgress }) {
  if (tx.phase === 'idle') return null;

  if (tx.phase === 'done') {
    return (
      <div className="alert alert-success" role="status">
        <span>✓</span>
        <span>{tx.label ?? 'Transaction confirmed.'}</span>
      </div>
    );
  }

  const activeIdx = STEPS.findIndex((s) => s.phase === tx.phase);

  return (
    <div className="tx-progress" role="status" aria-live="polite">
      {STEPS.map((step, i) => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
        return (
          <div key={step.phase} className={`tx-step ${state}`}>
            {state === 'active' && <span className="spinner" />}
            <span>{step.label}{state === 'active' ? ' — please wait…' : ''}</span>
          </div>
        );
      })}
      {tx.label && activeIdx >= 0 && <div className="hint">{tx.label}</div>}
    </div>
  );
}

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>⚠</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
