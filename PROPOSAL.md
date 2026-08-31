# Product Proposal

## What is the product, and who uses it?

**ShadowBid** is a decentralized, privacy-preserving sealed-bid auction platform built on the Midnight Network. It enables fair, confidential price discovery by allowing participants to submit cryptographically sealed bids that remain completely hidden during and after the auction process.

### Target Users
- **Sellers & Creators**: Merchants, digital artists, real-world asset (RWA) sellers, and liquidators who require optimal, manipulation-resistant price discovery without dealing with front-running, sniping, or artificial bid inflation.
- **Bidders & Buyers**: High-value collectors, institutional buyers, and everyday consumers who want to place bids reflecting their true valuation without exposing their budget, identity, or bidding strategy to competitors or sellers.

---

## Why Midnight specifically?

### The Limitations of Transparent Blockchains
On transparent blockchains (e.g., Ethereum, Solana), all state and transaction inputs are visible on a public ledger. Traditional attempts at sealed-bid auctions on transparent chains suffer from fundamental flaws:
1. **Commit-Reveal Griefing**: In standard commit-reveal schemes, losing bidders can choose not to reveal their bids, delaying or aborting auction finalization.
2. **MEV & Front-running**: Public mempools and visible state invite transaction front-running and tactical bid sniping.
3. **Privacy Leakage**: After the reveal phase, all participants' private bidding strategies and valuations are permanently exposed on-chain.

### How Midnight Solves This
Midnight's hybrid privacy model and Compact smart contracts provide native Zero-Knowledge (ZK) execution with private state:
- **Client-Side ZK Proofs & Witnesses**: Bid amounts and secret salts are passed as private circuit witnesses. They are proven locally in the user's browser via the Midnight toolchain and never sent to the network.
- **Hiding Commitments on Ledger**: The public ledger only records a collision-resistant cryptographic commitment:
  $$\text{Commitment} = H(\text{"shadowbid:bid:v1"} \parallel \text{auctionId} \parallel \text{bidIndex} \parallel \text{bidderPK} \parallel \text{salt} \parallel \text{bidAmount})$$
- **Selective ZK Settlement (`claimWin`)**: After auction closure, bidders submit ZK proofs verifying that their sealed commitment beats the current best bid. Only the verified winning bid is finalized—**losing bids remain sealed forever**.

---

## Data Model

| Data Point | Type | Disclosed To | Description |
|------------|------|--------------|-------------|
| `itemName` / `itemDescription` | Public ledger | Everyone | Title and item details visible in the public auction feed. |
| `auctionCount` / `auctionId` | Public ledger | Everyone | Global auction counter and unique auction identifiers. |
| `status` (`OPEN` / `CLOSED`) | Public ledger | Everyone | Current operational phase of the auction. |
| `bidCount` | Public ledger | Everyone | Total number of sealed bids submitted (verifiable activity). |
| `bidCommitments` | Public ledger | Everyone | Hiding hash representing sealed bids; conceals bid amount and salt. |
| `sellerPK` | Public ledger | Everyone | Pseudonymous key derived from seller's secret witness. |
| `winnerPK` / `winningAmount` | Public ledger | Everyone | Finalized winner and settlement price; only disclosed post-close upon winning claim. |
| `bidAmount` (Losing bids) | Private witness | No one | Never revealed; stays confidential permanently. |
| `bidAmount` (Winning bid) | Private witness | Everyone (post-claim) | Proven via ZK preimage check and disclosed strictly upon winning settlement. |
| `salt` | Private witness | No one | Blinding factor stored in the bidder's local wallet state. |
| `callerSecretKey` | Private witness | No one | User's private signing key; never leaves the 1AM wallet environment. |

---

## Mainnet Feasibility

ShadowBid is fully realistic and ready for Mainnet deployment by Level 6:
1. **Toolchain Compatibility**: Built using Compact `v0.5.2` / `v0.31.1` and `@midnight-ntwrk/compact-runtime 0.16.0`, aligned with Midnight Preprod and Mainnet roadmaps.
2. **Lightweight Circuit Overhead**: The circuits (`computeBidCommitment`, `submitBid`, `claimWin`) utilize standard `persistentHash` primitives with constant-time proof generation, ensuring fast browser-based proving times (<2 seconds).
3. **Non-Custodial Architecture**: Leverages standard Midnight contract binding and 1AM Wallet integration, requiring no centralized custody, third-party relays, or trusted setups.
4. **Scalable State Layout**: Utilizes Midnight's native ledger `Map` primitives, minimizing on-chain state footprint and transaction fees.
