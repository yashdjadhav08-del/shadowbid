/**
 * Fetch-based KeyMaterialProvider for the 1AM wallet's
 * `getProvingProvider(keyMaterialProvider)` per the DApp Connector API.
 *
 * Serves the compiled contract's ZKIR (.bzkir) and prover/verifier keys over
 * HTTP from /managed/shadowbid (synced by scripts/sync-assets.mjs).
 */
import type { KeyMaterialProvider } from '@midnight-ntwrk/dapp-connector-api';

export function fetchKeyMaterialProvider(baseUrl: string): KeyMaterialProvider {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  /** Normalize a bare circuit id or a keyed location down to its circuit id. */
  const circuitIdOf = (loc: string) =>
    loc.split('/').pop()?.replace(/\.(bzkir|zkir|prover|verifier)$/i, '') ?? loc;

  const getBytes = async (url: string): Promise<Uint8Array> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ZK artifact ${url}: ${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  };

  return {
    getZKIR: async (loc) => getBytes(`${base}zkir/${encodeURIComponent(circuitIdOf(loc))}.bzkir`),
    getProverKey: async (loc) => getBytes(`${base}keys/${encodeURIComponent(circuitIdOf(loc))}.prover`),
    getVerifierKey: async (loc) => getBytes(`${base}keys/${encodeURIComponent(circuitIdOf(loc))}.verifier`),
  };
}
