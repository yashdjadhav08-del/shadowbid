/**
 * ShadowBid contract service.
 *
 * Wraps the compiled Compact contract (managed/shadowbid) with midnight-js:
 * deploy, join by address, circuit calls through the connected wallet, and
 * public ledger reads through the indexer.
 *
 * Privacy notes
 *  - Bid amounts and salts are supplied as private circuit inputs; they are
 *    never written to the ledger. Only their hiding commitment is.
 *  - The bidder's per-app secret key lives in the wallet-scoped local store;
 *    it is unrelated to wallet keys and never transmitted.
 *  - Each user keeps a local record of (amount, salt, index) for bids they
 *    sealed so they can later prove/claim them after close.
 */
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type {
  ContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import {
  Contract,
  ledger,
  pureCircuits,
  AuctionStatus,
  type Ledger,
} from '../../managed/shadowbid/contract/index.js';
import { CONFIG, NETWORK_ID, PRIVATE_STATE_ID } from '../config.js';
import { buildProviders } from './providers.js';
import type { ConnectedAPI } from './wallet.js';

export { AuctionStatus };

export type ShadowBidPrivateState = { readonly secretKey: Uint8Array };
export type ShadowBidLedger = Ledger;

export type AuctionView = {
  id: bigint;
  sellerPKHex: string;
  itemName: string;
  itemDescription: string;
  status: AuctionStatus;
  bidCount: bigint;
  hasWinner: boolean;
  winningBidIndex: bigint;
  winningAmount: bigint | null;
  winnerPKHex: string | null;
};

/** The witnesses implementation — reads the caller's app-level secret key. */
let currentSecretKey: Uint8Array = new Uint8Array(32);
export function setCallerSecretKey(sk: Uint8Array): void {
  currentSecretKey = sk;
}

const witnesses = {
  callerSecretKey: ({ privateState }: { privateState: ShadowBidPrivateState }): [ShadowBidPrivateState, Uint8Array] => [
    privateState,
    currentSecretKey.length ? currentSecretKey : privateState.secretKey,
  ],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
// The generated Contract's generics fight TypeScript's inference through the
// effect-style builders; pin them down explicitly.
const compiledContract: any = (
  CompiledContract.withCompiledFileAssets as (self: any, path: string) => any
)(
  (CompiledContract.withWitnesses as (self: any, witnesses: unknown) => any)(
    (CompiledContract.make as (tag: string, ctor: unknown) => any)(
      'shadowbid',
      Contract,
    ),
    witnesses,
  ),
  CONFIG.zkArtifactsBaseUrl,
);

/** Shape of the circuit-call interface we use on a deployed/found contract. */
type CallResult = { public: { txId: string; blockHeight?: bigint }; result?: unknown };
type ShadowBidCallTx = {
  createAuction(itemName: string, itemDescription: string): Promise<CallResult>;
  closeAuction(auctionId: bigint): Promise<CallResult>;
  submitBid(auctionId: bigint, salt: Uint8Array, bidAmount: bigint): Promise<CallResult>;
  claimWin(
    auctionId: bigint,
    bidIndex: bigint,
    bidderPK: Uint8Array,
    salt: Uint8Array,
    bidAmount: bigint,
  ): Promise<CallResult>;
};

export type FoundShadowBid = {
  callTx: ShadowBidCallTx;
};
type Providers = MidnightProviders<any, string, ShadowBidPrivateState>;

// ---------------------------------------------------------------------------
// Local records of sealed bids (needed to claim later; never leaves device)
// ---------------------------------------------------------------------------

export type SealedBidRecord = {
  contractAddress: string;
  auctionId: string;
  index: number;
  amount: string;
  saltHex: string;
  bidderPKHex: string;
  claimed: boolean;
};

const BIDS_KEY = 'shadowbid.myBids';

export function loadMyBids(): SealedBidRecord[] {
  try {
    return JSON.parse(localStorage.getItem(BIDS_KEY) ?? '[]') as SealedBidRecord[];
  } catch {
    return [];
  }
}

export function saveSealedBid(record: SealedBidRecord): void {
  const all = loadMyBids().filter(
    (b) => !(b.contractAddress === record.contractAddress && b.auctionId === record.auctionId && b.index === record.index),
  );
  all.push(record);
  localStorage.setItem(BIDS_KEY, JSON.stringify(all));
}

export function markBidClaimed(contractAddress: string, auctionId: string, index: number): void {
  const all = loadMyBids().map((b) =>
    b.contractAddress === contractAddress && b.auctionId === auctionId && b.index === index
      ? { ...b, claimed: true }
      : b,
  );
  localStorage.setItem(BIDS_KEY, JSON.stringify(all));
}

// ---------------------------------------------------------------------------
// App secret key management (per wallet account, local only)
// ---------------------------------------------------------------------------

const SECRET_KEY = 'shadowbid.appSecretKey';

export function ensureAppSecretKey(accountId: string): Uint8Array {
  const storageKey = `${SECRET_KEY}.${accountId}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(existing.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  const sk = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(storageKey, Array.from(sk, (b) => b.toString(16).padStart(2, '0')).join(''));
  return sk;
}

// ---------------------------------------------------------------------------
// Contract handle
// ---------------------------------------------------------------------------

const ADDRESS_KEY = 'shadowbid.contractAddress';

function addressKey(): string {
  return `${ADDRESS_KEY}.${NETWORK_ID}`;
}

export function storedContractAddress(): string | null {
  try {
    return localStorage.getItem(addressKey()) ?? localStorage.getItem(ADDRESS_KEY);
  } catch {
    return null;
  }
}

export function storeContractAddress(address: string): void {
  try {
    localStorage.setItem(addressKey(), address);
  } catch {}
}

export function clearStoredContractAddress(): void {
  try {
    localStorage.removeItem(addressKey());
    localStorage.removeItem(ADDRESS_KEY);
  } catch {}
}

export class ShadowBidClient {
  constructor(
    public readonly providers: Providers,
    private readonly found: FoundShadowBid,
    public readonly contractAddress: ContractAddress,
  ) {}

  static async connect(api: ConnectedAPI, accountId: string): Promise<ShadowBidClient> {
    const providers = await buildProviders(api);
    const sk = ensureAppSecretKey(accountId);
    setCallerSecretKey(sk);

    let address = storedContractAddress();
    let found: FoundShadowBid;

    if (address) {
      found = (await findDeployedContract(providers as never, {
        compiledContract: compiledContract,
        contractAddress: address,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: { secretKey: sk },
      } as never)) as unknown as FoundShadowBid;
    } else {
      const deployed = (await deployContract(providers as never, {
        compiledContract: compiledContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: { secretKey: sk },
      } as never)) as unknown as FoundShadowBid & {
        deployTxData: { public: { contractAddress: string } };
      };
      address = deployed.deployTxData.public.contractAddress;
      storeContractAddress(address);
      found = deployed;
    }

    return new ShadowBidClient(providers, found, address!);
  }

  /** Read the full public ledger state via the indexer and decode it. */
  async fetchLedger(): Promise<Ledger> {
    const state = await this.providers.publicDataProvider.queryContractState(this.contractAddress);
    if (!state) throw new Error('Contract state not found on-chain yet.');
    return ledger(state.data);
  }

  // -- Seller ---------------------------------------------------------------

async createAuction(itemName: string, itemDescription: string): Promise<bigint> {
    // Fire-and-forget: wallet already confirmed submit; don't block on indexer finalization.
    // Kick off the call but don't await its finalization — return provisional id immediately.
    // The Auctions page poll will pick up the new auction once the indexer catches up.
    this.found.callTx.createAuction(itemName, itemDescription)
      .then((r) => {
        console.info('[ShadowBid] createAuction finalized:', r.result);
      })
      .catch((e) => {
        console.error('[ShadowBid] createAuction background error:', e);
      });
    // Return provisional id immediately so UI proceeds instantly after wallet confirm.
    return -1n;
  }

  closeAuction(auctionId: bigint): Promise<unknown> {
    return this.found.callTx.closeAuction(auctionId);
  }

  // -- Bidder ---------------------------------------------------------------

  async submitSealedBid(
    auctionId: bigint,
    index: number,
    amount: bigint,
    accountId: string,
  ): Promise<{ commitmentHex: string }> {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const myPK = pureCircuits.derivePublicKey(ensureAppSecretKey(accountId));
    await this.found.callTx.submitBid(auctionId, salt, amount);
    const commitment = pureCircuits.computeBidCommitment(auctionId, BigInt(index), myPK, salt, amount);
    saveSealedBid({
      contractAddress: this.contractAddress,
      auctionId: auctionId.toString(),
      index,
      amount: amount.toString(),
      saltHex: Array.from(salt, (b) => b.toString(16).padStart(2, '0')).join(''),
      bidderPKHex: Array.from(myPK, (b) => b.toString(16).padStart(2, '0')).join(''),
      claimed: false,
    });
    return { commitmentHex: Array.from(commitment, (b) => b.toString(16).padStart(2, '0')).join('') };
  }

  claimWin(auctionId: bigint, index: number, amount: bigint, saltHex: string, bidderPKHex: string): Promise<unknown> {
    const salt = new Uint8Array(32);
    for (let i = 0; i < 32; i++) salt[i] = parseInt(saltHex.slice(i * 2, i * 2 + 2), 16);
    const pk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) pk[i] = parseInt(bidderPKHex.slice(i * 2, i * 2 + 2), 16);
    return this.found.callTx.claimWin(auctionId, BigInt(index), pk, salt, amount);
  }

  // -- Pure helpers ---------------------------------------------------------

  derivePublicKey(sk: Uint8Array = currentSecretKey): Uint8Array {
    return pureCircuits.derivePublicKey(sk);
  }

  computeCommitment(auctionId: bigint, index: number, pk: Uint8Array, saltHex: string, amount: bigint): string {
    const salt = new Uint8Array(32);
    for (let i = 0; i < 32; i++) salt[i] = parseInt(saltHex.slice(i * 2, i * 2 + 2), 16);
    const c = pureCircuits.computeBidCommitment(auctionId, BigInt(index), pk, salt, amount);
    return Array.from(c, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

// ---------------------------------------------------------------------------
// Decoding helpers shared with the UI
// ---------------------------------------------------------------------------

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function decodeAuctions(l: Ledger): AuctionView[] {
  const out: AuctionView[] = [];
  for (const [id, a] of l.auctions as unknown as Iterable<[bigint, Ledger['auctions'] extends { lookup(k: never): infer V } ? V : never]>) {
    const auction = a as {
      sellerPK: Uint8Array;
      status: AuctionStatus;
      bidCount: bigint;
      hasWinner: boolean;
      winningBidIndex: bigint;
      winningAmount: bigint;
      winnerPK: Uint8Array;
    };
    out.push({
      id,
      sellerPKHex: toHex(auction.sellerPK),
      itemName: l.itemNames.member(id) ? l.itemNames.lookup(id) : '(unnamed)',
      itemDescription: l.itemDescriptions.member(id) ? l.itemDescriptions.lookup(id) : '',
      status: auction.status,
      bidCount: auction.bidCount,
      hasWinner: auction.hasWinner,
      winningBidIndex: auction.winningBidIndex,
      winningAmount: auction.hasWinner ? auction.winningAmount : null,
      winnerPKHex: auction.hasWinner ? toHex(auction.winnerPK) : null,
    });
  }
  return out.sort((a, b) => Number(b.id) - Number(a.id));
}
