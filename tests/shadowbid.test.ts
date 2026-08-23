/**
 * ShadowBid contract test suite.
 *
 * Runs the compiled Compact contract logic off-chain through
 * @midnight-ntwrk/compact-runtime — the same logic the ZK circuits enforce
 * on-chain (see docs.midnight.network "Using Compact contracts from JavaScript").
 *
 * Covers:
 *   TEST 1 — circuit logic (pure helpers + impure circuit behaviour)
 *   TEST 2 — state transitions (create -> bid -> close -> settle)
 *   TEST 3 — privacy (sealed amounts never appear in public ledger state)
 * plus adversarial cases (forged claims, unauthorized close, invalid states).
 */
import { describe, it, expect } from 'vitest';
import * as RT from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  AuctionStatus,
  ledger,
  pureCircuits,
} from '../managed/shadowbid/contract/index.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type PrivateState = { readonly secretKey: Uint8Array };

type User = {
  name: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  privateState: PrivateState;
  coinPublicKey: string;
};

const ADDR = RT.sampleContractAddress();

const key = (n: number): Uint8Array => {
  const a = new Uint8Array(32);
  a[31] = n;
  return a;
};

const saltOf = (n: number): Uint8Array => {
  const a = new Uint8Array(32);
  a[0] = 0xab;
  a[31] = n;
  return a;
};

const mkUser = (name: string, n: number): User => {
  const secretKey = key(n);
  return {
    name,
    secretKey,
    publicKey: pureCircuits.derivePublicKey(secretKey),
    privateState: { secretKey },
    coinPublicKey: n.toString(16).padStart(64, '0'),
  };
};

const witnesses = {
  callerSecretKey: ({ privateState }: RT.WitnessContext<any, PrivateState>): [PrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};

/** One shared contract instance — all mutable state travels in the circuit context. */
const contract = new Contract(witnesses);

/** Fresh contract genesis state. */
const genesis = () => {
  const seller = mkUser('seller', 1);
  const ctor = contract.initialState(RT.createConstructorContext(seller.privateState, seller.coinPublicKey));
  return { seller, state: ctor.currentContractState as unknown as any };
};

/** Build a circuit context for `user` against the given ledger state. */
const asUser = (user: User, state: any) =>
  RT.createCircuitContext(ADDR, user.coinPublicKey, state, user.privateState);

/** Create an auction as seller; returns { id, state }. */
const createAuction = (state: any, seller: User, itemName = 'MacBook Pro') => {
  const ctx = asUser(seller, state);
  const call = contract.impureCircuits.createAuction(ctx, itemName, 'Sealed-bid laptop auction');
  return { id: call.result, state: call.context.currentQueryContext.state as unknown as any };
};

const sealBid = (state: any, bidder: User, auctionId: bigint, index: number, amount: bigint) => {
  const salt = saltOf(index + 1);
  const ctx = asUser(bidder, state);
  const call = contract.impureCircuits.submitBid(ctx, auctionId, salt, amount);
  return { salt, commitment: pureCircuits.computeBidCommitment(auctionId, BigInt(index), bidder.publicKey, salt, amount), state: call.context.currentQueryContext.state as unknown as any };
};

const closeAuction = (state: any, seller: User, auctionId: bigint) => {
  const call = contract.impureCircuits.closeAuction(asUser(seller, state), auctionId);
  return call.context.currentQueryContext.state as unknown as any;
};

const claimWin = (
  state: any,
  claimant: User,
  auctionId: bigint,
  index: bigint,
  bidderPK: Uint8Array,
  salt: Uint8Array,
  amount: bigint,
) => {
  const call = contract.impureCircuits.claimWin(asUser(claimant, state), auctionId, index, bidderPK, salt, amount);
  return call.context.currentQueryContext.state as unknown as any;
};

// ---------------------------------------------------------------------------
// TEST 1 — circuit logic
// ---------------------------------------------------------------------------

describe('TEST 1: circuit logic', () => {
  it('genesis state starts empty with auctionCount = 0', () => {
    const { seller, state } = genesis();
    const l = ledger(asUser(seller, state).currentQueryContext.state);
    expect(l.auctionCount).toBe(0n);
    expect(l.auctions.isEmpty()).toBe(true);
    expect(l.bidCommitments.isEmpty()).toBe(true);
  });

  it('derivePublicKey is deterministic and key-specific', () => {
    const alice = mkUser('alice', 7);
    const bob = mkUser('bob', 8);
    expect(alice.publicKey).toEqual(pureCircuits.derivePublicKey(alice.secretKey));
    expect(alice.publicKey).not.toEqual(bob.publicKey);
    expect(alice.publicKey.length).toBe(32);
  });

  it('bid commitment binds to every input (amount, salt, bidder, ids)', () => {
    const alice = mkUser('alice', 7);
    const base = pureCircuits.computeBidCommitment(0n, 0n, alice.publicKey, saltOf(1), 500n);
    expect(base).toEqual(pureCircuits.computeBidCommitment(0n, 0n, alice.publicKey, saltOf(1), 500n));
    expect(base).not.toEqual(pureCircuits.computeBidCommitment(0n, 0n, alice.publicKey, saltOf(1), 501n));
    expect(base).not.toEqual(pureCircuits.computeBidCommitment(0n, 0n, alice.publicKey, saltOf(2), 500n));
    expect(base).not.toEqual(pureCircuits.computeBidCommitment(0n, 1n, alice.publicKey, saltOf(1), 500n));
    expect(base).not.toEqual(pureCircuits.computeBidCommitment(1n, 0n, alice.publicKey, saltOf(1), 500n));
    expect(base).not.toEqual(pureCircuits.computeBidCommitment(0n, 0n, mkUser('mallory', 9).publicKey, saltOf(1), 500n));
  });

  it('impure circuit call yields proof data and gas cost (proof pipeline wired)', () => {
    const { seller, state } = genesis();
    const ctx = asUser(seller, state);
    const call = contract.impureCircuits.createAuction(ctx, 'Item', 'Description');
    expect(call.result).toBe(0n);
    expect(call.proofData.publicTranscript.length).toBeGreaterThan(0);
    expect(call.gasCost).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TEST 2 — state transitions: create -> submit -> close -> settle
// ---------------------------------------------------------------------------

describe('TEST 2: state transitions', () => {
  it('full lifecycle settles the highest sealed bid as verified winner', () => {
    let { state } = genesis();
    const seller = mkUser('seller', 1);
    const alice = mkUser('alice', 2); // bids 500
    const bob = mkUser('bob', 3); // bids 750
    const carol = mkUser('carol', 4); // bids 600

    const created = createAuction(state, seller);
    const auctionId = created.id;
    state = created.state;

    const bidA = sealBid(state, alice, auctionId, 0, 500n);
    const bidB = sealBid(bidA.state, bob, auctionId, 1, 750n);
    const bidC = sealBid(bidB.state, carol, auctionId, 2, 600n);
    state = bidC.state;

    let l = ledger(state);
    const openAuction = l.auctions.lookup(auctionId);
    expect(openAuction.status).toBe(AuctionStatus.OPEN);
    expect(openAuction.bidCount).toBe(3n);
    expect(l.bidCommitments.size()).toBe(3n);

    state = closeAuction(state, seller, auctionId);
    expect(ledger(state).auctions.lookup(auctionId).status).toBe(AuctionStatus.CLOSED);

    // Claims arrive out of order; settlement still converges on the max.
    state = claimWin(state, alice, auctionId, 0n, alice.publicKey, bidA.salt, 500n);
    state = claimWin(state, carol, auctionId, 2n, carol.publicKey, bidC.salt, 600n);
    state = claimWin(state, bob, auctionId, 1n, bob.publicKey, bidB.salt, 750n);

    const final = ledger(state).auctions.lookup(auctionId);
    expect(final.hasWinner).toBe(true);
    expect(final.winningAmount).toBe(750n);
    expect(final.winningBidIndex).toBe(1n);
    expect(final.winnerPK).toEqual(bob.publicKey);
  });

  it('rejects closing twice', () => {
    let { state, seller } = genesis();
    const created = createAuction(state, seller);
    state = created.state;
    state = closeAuction(state, seller, created.id);
    expect(() => closeAuction(state, seller, created.id)).toThrow('Auction already closed');
  });

  it('rejects bids after the auction closes', () => {
    let { state, seller } = genesis();
    const created = createAuction(state, seller);
    state = created.state;
    state = closeAuction(state, seller, created.id);
    const bidder = mkUser('late-bidder', 5);
    expect(() => sealBid(state, bidder, created.id, 0, 100n)).toThrow('Auction is not open');
  });
});

// ---------------------------------------------------------------------------
// TEST 3 — privacy: sealed bid amounts never leak into public state
// ---------------------------------------------------------------------------

describe('TEST 3: privacy', () => {
  /** Collect every scalar reachable in the decoded public ledger. */
  const collectPublicScalars = (node: unknown, acc: { numbers: Set<bigint>; bytes: Uint8Array[] }) => {
    if (node === null || node === undefined) return acc;
    if (typeof node === 'bigint') {
      acc.numbers.add(node);
    } else if (node instanceof Uint8Array) {
      acc.bytes.push(node);
    } else if (Array.isArray(node)) {
      node.forEach((child) => collectPublicScalars(child, acc));
    } else if (typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach((child) => collectPublicScalars(child, acc));
    }
    return acc;
  };

  const leBytes = (v: bigint): Uint8Array => {
    let x = v;
    const out = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      out[i] = Number(x & 0xffn);
      x >>= 8n;
    }
    return out;
  };

  const beBytes = (v: bigint): Uint8Array => new Uint8Array(leBytes(v)).reverse();

  it('sealed bid amounts are absent from all public ledger state', () => {
    let { state } = genesis();
    const seller = mkUser('seller', 1);
    const amounts = [500n, 750n, 600n];
    const bidders = [mkUser('alice', 2), mkUser('bob', 3), mkUser('carol', 4)];

    const created = createAuction(state, seller);
    const auctionId = created.id;
    state = created.state;

    for (let i = 0; i < amounts.length; i++) {
      state = sealBid(state, bidders[i], auctionId, i, amounts[i]).state;
    }

    const acc = collectPublicScalars({ ledger: ledger(state) }, {
      numbers: new Set<bigint>(),
      bytes: [],
    });

    // No public numeric field may equal a sealed amount...
    for (const amount of amounts) {
      expect(acc.numbers.has(amount)).toBe(false);
      // ...and no public byte array may embed its LE/BE encoding.
      for (const bytes of acc.bytes) {
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        expect(hex).not.toContain(Array.from(leBytes(amount), (b) => b.toString(16).padStart(2, '0')).join(''));
        expect(hex).not.toContain(Array.from(beBytes(amount), (b) => b.toString(16).padStart(2, '0')).join(''));
      }
    }

    // Exactly one hiding commitment per sealed bid, none reversible without the salt.
    expect(ledger(state).bidCommitments.size()).toBe(BigInt(amounts.length));
  });

  it('losing claims disclose nothing; only the verified winning amount becomes public', () => {
    let { state } = genesis();
    const seller = mkUser('seller', 1);
    const alice = mkUser('alice', 2); // 500 — loses
    const bob = mkUser('bob', 3); // 750 — wins

    const created = createAuction(state, seller);
    const auctionId = created.id;
    state = created.state;
    const bidA = sealBid(state, alice, auctionId, 0, 500n);
    const bidB = sealBid(bidA.state, bob, auctionId, 1, 750n);
    state = bidB.state;
    state = closeAuction(state, seller, auctionId);

    // Alice claims first and leads temporarily; her amount is superseded...
    state = claimWin(state, alice, auctionId, 0n, alice.publicKey, bidA.salt, 500n);
    expect(ledger(state).auctions.lookup(auctionId).winningAmount).toBe(500n);

    // ...and once Bob's higher claim verifies, Alice's losing amount must NOT
    // survive anywhere in the public ledger.
    state = claimWin(state, bob, auctionId, 1n, bob.publicKey, bidB.salt, 750n);
    const acc = collectPublicScalars({ ledger: ledger(state) }, {
      numbers: new Set<bigint>(),
      bytes: [],
    });
    expect(acc.numbers.has(500n)).toBe(false);
    expect(ledger(state).auctions.lookup(auctionId).winningAmount).toBe(750n);
  });

  it('a forged claim cannot win: wrong amount or salt fails the commitment check', () => {
    let { state } = genesis();
    const seller = mkUser('seller', 1);
    const alice = mkUser('alice', 2);
    const attacker = mkUser('attacker', 9);

    const created = createAuction(state, seller);
    const auctionId = created.id;
    state = created.state;
    const bid = sealBid(state, alice, auctionId, 0, 500n);
    state = bid.state;
    state = closeAuction(state, seller, auctionId);

    // Wrong amount.
    expect(() => claimWin(state, attacker, auctionId, 0n, alice.publicKey, bid.salt, 999n)).toThrow(
      'Commitment does not match any sealed bid',
    );
    // Wrong salt.
    expect(() => claimWin(state, attacker, auctionId, 0n, alice.publicKey, saltOf(42), 500n)).toThrow(
      'Commitment does not match any sealed bid',
    );
    // Claiming a bid that was never submitted at all.
    expect(() => claimWin(state, attacker, auctionId, 7n, attacker.publicKey, saltOf(7), 1000000n)).toThrow(
      'Commitment does not match any sealed bid',
    );
  });

  it('rejects settlement attempts before close and bids on nonexistent auctions', () => {
    let { state, seller } = genesis();
    const created = createAuction(state, seller);
    state = created.state;
    const alice = mkUser('alice', 2);
    const bid = sealBid(state, alice, created.id, 0, 500n);
    state = bid.state;

    expect(() => claimWin(state, alice, created.id, 0n, alice.publicKey, bid.salt, 500n)).toThrow(
      'Auction is not closed yet',
    );

    const ghostId = 42n;
    expect(() => sealBid(state, alice, ghostId, 0, 500n)).toThrow('Auction does not exist');
  });

  it('rejects zero-amount bids and non-seller close attempts', () => {
    let { state, seller } = genesis();
    const created = createAuction(state, seller);
    state = created.state;
    const attacker = mkUser('attacker', 9);
    const alice = mkUser('alice', 2);

    expect(() => sealBid(state, alice, created.id, 0, 0n)).toThrow('Bid amount must be positive');
    expect(() => closeAuction(state, attacker, created.id)).toThrow('Only the seller can close this auction');
    expect(ledger(state).auctions.lookup(created.id).status).toBe(AuctionStatus.OPEN);
  });

  it('supports multiple concurrent auctions', () => {
    let { state, seller } = genesis();
    const first = createAuction(state, seller, 'MacBook Pro');
    const second = createAuction(first.state, seller, 'iPhone');
    state = second.state;
    expect(first.id).toBe(0n);
    expect(second.id).toBe(1n);
    expect(ledger(state).itemNames.lookup(first.id)).toBe('MacBook Pro');
    expect(ledger(state).itemNames.lookup(second.id)).toBe('iPhone');

    const alice = mkUser('alice', 2);
    state = sealBid(state, alice, second.id, 0, 300n).state;
    const a2 = ledger(state).auctions.lookup(second.id);
    expect(a2.bidCount).toBe(1n);
    expect(ledger(state).auctions.lookup(first.id).bidCount).toBe(0n);
  });
});
