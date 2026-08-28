/**
 * ShadowBid runtime configuration.
 *
 * Endpoints can be overridden with Vite env vars (see .env.example).
 * When a connector wallet (1AM) is connected, the indexer endpoints reported
 * by the wallet take precedence — see services/providers.ts.
 */
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export type NetworkId = 'preprod';

export const NETWORK_ID: NetworkId = 'preprod';

setNetworkId(NETWORK_ID);

export const CONFIG = {
  networkId: NETWORK_ID,
  indexerUri: (import.meta.env.VITE_INDEXER_URI as string | undefined) ?? 'https://indexer.preprod.midnight.network/',
  indexerWsUri:
    (import.meta.env.VITE_INDEXER_WS_URI as string | undefined) ?? 'wss://indexer.preprod.midnight.network/',
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
