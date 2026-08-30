import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum AuctionStatus { OPEN = 0, CLOSED = 1 }

export type Witnesses<PS> = {
  callerSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  createAuction(context: __compactRuntime.CircuitContext<PS>,
                itemName_0: string,
                itemDescription_0: string): __compactRuntime.CircuitResults<PS, bigint>;
  closeAuction(context: __compactRuntime.CircuitContext<PS>, auctionId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submitBid(context: __compactRuntime.CircuitContext<PS>,
            auctionId_0: bigint,
            salt_0: Uint8Array,
            bidAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  claimWin(context: __compactRuntime.CircuitContext<PS>,
           auctionId_0: bigint,
           bidIndex_0: bigint,
           bidderPK_0: Uint8Array,
           salt_0: Uint8Array,
           bidAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  createAuction(context: __compactRuntime.CircuitContext<PS>,
                itemName_0: string,
                itemDescription_0: string): __compactRuntime.CircuitResults<PS, bigint>;
  closeAuction(context: __compactRuntime.CircuitContext<PS>, auctionId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submitBid(context: __compactRuntime.CircuitContext<PS>,
            auctionId_0: bigint,
            salt_0: Uint8Array,
            bidAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  claimWin(context: __compactRuntime.CircuitContext<PS>,
           auctionId_0: bigint,
           bidIndex_0: bigint,
           bidderPK_0: Uint8Array,
           salt_0: Uint8Array,
           bidAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  derivePublicKey(sk_0: Uint8Array): Uint8Array;
  computeBidCommitment(auctionId_0: bigint,
                       bidIndex_0: bigint,
                       bidderPK_0: Uint8Array,
                       salt_0: Uint8Array,
                       bidAmount_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  derivePublicKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  computeBidCommitment(context: __compactRuntime.CircuitContext<PS>,
                       auctionId_0: bigint,
                       bidIndex_0: bigint,
                       bidderPK_0: Uint8Array,
                       salt_0: Uint8Array,
                       bidAmount_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  createAuction(context: __compactRuntime.CircuitContext<PS>,
                itemName_0: string,
                itemDescription_0: string): __compactRuntime.CircuitResults<PS, bigint>;
  closeAuction(context: __compactRuntime.CircuitContext<PS>, auctionId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submitBid(context: __compactRuntime.CircuitContext<PS>,
            auctionId_0: bigint,
            salt_0: Uint8Array,
            bidAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  claimWin(context: __compactRuntime.CircuitContext<PS>,
           auctionId_0: bigint,
           bidIndex_0: bigint,
           bidderPK_0: Uint8Array,
           salt_0: Uint8Array,
           bidAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly auctionCount: bigint;
  auctions: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { sellerPK: Uint8Array,
                             status: AuctionStatus,
                             bidCount: bigint,
                             hasWinner: boolean,
                             winningBidIndex: bigint,
                             winningAmount: bigint,
                             winnerPK: Uint8Array
                           };
    [Symbol.iterator](): Iterator<[bigint, { sellerPK: Uint8Array,
  status: AuctionStatus,
  bidCount: bigint,
  hasWinner: boolean,
  winningBidIndex: bigint,
  winningAmount: bigint,
  winnerPK: Uint8Array
}]>
  };
  itemNames: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): string;
    [Symbol.iterator](): Iterator<[bigint, string]>
  };
  itemDescriptions: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): string;
    [Symbol.iterator](): Iterator<[bigint, string]>
  };
  bidCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
