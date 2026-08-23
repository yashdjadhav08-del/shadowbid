/**
 * ShadowBid runtime configuration.
 *
 * Endpoints can be overridden with Vite env vars (see .env.example).
 * When a connector wallet (1AM) is connected, the indexer endpoints reported
 * by the wallet take precedence — see services/providers.ts.
 */
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export type NetworkId = 'undeployed' | 'preview' | 'preprod' | 'mainnet';

function storedNetworkId(): NetworkId | undefined {
  try {
    const v = localStorage.getItem('shadowbid.networkId') as NetworkId | null;
    if (v === 'preview' || v === 'preprod' || v === 'undeployed' || v === 'mainnet') return v;
  } catch {}
  return undefined;
}

export const NETWORK_ID: NetworkId =
  storedNetworkId() ?? (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as NetworkId | undefined) ?? 'preprod';

setNetworkId(NETWORK_ID);

export function switchNetwork(id: NetworkId): void {
  localStorage.setItem('shadowbid.networkId', id);
  location.reload();
}

export const CONFIG = {
  networkId: NETWORK_ID,
  indexerUri:
    (import.meta.env.VITE_INDEXER_URI as string | undefined) ??
    (NETWORK_ID === 'preprod'
      ? 'https://indexer.preprod.midnight.network/'
      : NETWORK_ID === 'preview'
        ? 'https://indexer.preview.midnight.network/'
        : NETWORK_ID === 'mainnet'
          ? 'https://indexer.midnight.network/'
          : 'http://127.0.0.1:8088/api/v4/graphql'),
  indexerWsUri:
    (import.meta.env.VITE_INDEXER_WS_URI as string | undefined) ??
    (NETWORK_ID === 'preprod'
      ? 'wss://indexer.preprod.midnight.network/'
      : NETWORK_ID === 'preview'
        ? 'wss://indexer.preview.midnight.network/'
        : NETWORK_ID === 'mainnet'
          ? 'wss://indexer.midnight.network/'
          : 'ws://127.0.0.1:8088/api/v4/graphql/ws'),
  /** Local proof server used when the connected wallet cannot prove itself. */
  proofServerUri: (import.meta.env.VITE_PROOF_SERVER_URI as string | undefined) ?? 'http://127.0.0.1:6300',
  /** Base URL under which compiled ZK artifacts are served (keys/, zkir/). */
  zkArtifactsBaseUrl:
    (import.meta.env.VITE_ZK_ARTIFACTS_BASE_URL as string | undefined) ??
    `${window.location.origin}/managed/shadowbid`,
} as const;

/** Circuit ids of the deployed ShadowBid contract. */
export const CIRCUIT_IDS = ['createAuction', 'submitBid', 'closeAuction', 'claimWin'] as const;
export type CircuitId = (typeof CIRCUIT_IDS)[number];

export const PRIVATE_STATE_ID = 'shadowbidPrivateState';
