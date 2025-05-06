# Multisig / Co-Signed Documents/Contracts on Nostr

## Overview

This document summarizes a conversation about implementing multisig or co-signed contracts using the Nostr protocol, with a specific focus on `kind: 30023` events. The aim is to explore how multiple parties can cooperatively sign a single note in a decentralized, verifiable way.

---

## Background

- To my knowledge, due to immutability there is no native support for co-signing in Nostr currently.
- Nostr events are single-signer and immutable.
- Co-signing ideas include:
  - Delegation (`NIP-26`)
  - Separate events referencing a shared hash

## Use Cases:

There are well-suited IRL scenarios: contracts, petitions, open letters (including [THAT AI one](https://futureoflife.org/open-letter/pause-giant-ai-experiments/).), vouching the veracity of a piece of content (deepfake countermeasure), X-style community notes, collaborative docs.

## Alternatives:

NIP-59 (Wiki) outlines an event kind:818 for merging a forked article into its source.
NIP-23 (Long for Content) `kind: 30024` already defines "drafts" which are very similar but for a different use-case.

## Detailed Use Case: Contracts

### Why co-signed contracts?
- Multiple parties want to jointly agree and sign a single agreement.
- Could be used for freelance contracts, DAO governance, escrow, etc.


## Proposal: Using `kind: 30023` for Co-Signed Contracts

Kind: `30023` is used for structured, long-form content, so its a good fit (at least for a prototype)
The primary Nostr Note Properties are: Immutable, Signed by one key, most debates have rejected the "Editable" concept.
Therefore each new signature (just like each new document revision in a draft) is a new Nostr note. 

So, multisig-style co-signing is **possible** on Nostr through coordinated use of `kind: 30023` and "smart client" behavior. However, due to note immutability, forking must be enforced by the "smart client" or via tooling. We discuss  the issues below in Forking Implications.

### Event Content (JSON)
```json
{
  "contract_id": "<sha256 hash of canonical contract content>",
  "title": "Service Agreement v1.0",
  "content": "Full plaintext or markdown of the agreement...",
  "version": 1,
  "created_at": 1710000000,
  "signers_required": 2,
  "signatures": [
    {
      "pubkey": "<npub or hex pubkey>",
      "sig": "<hex signature>",
      "timestamp": 1710000010
    },
    {
      "pubkey": "<npub or hex pubkey>",
      "sig": "<hex signature>",
      "timestamp": 1710000055
    }
  ]
}
```

### Tags
```json
[
  ["contract", "<contract_id>"],
  ["p", "<pubkey>"],
  ["title", "Service Agreement v1.0"]
]
```

---

## Demo: Co-Signed Contract Example

### Canonical Contract Content
```json
{
  "title": "Freelance Design Agreement",
  "content": "This agreement is made between Alice (Client) and Bob (Designer) for the creation of brand materials. Deliverables are due by May 15, 2025.",
  "version": 1,
  "created_at": 1745193600,
  "signers_required": 2
}
```

### Contract ID (SHA-256)
`7a6d5c41ff4a232e4eb4a9f8f3e47a90a46c9b10e49128ed9ef78b15ec2c43e1`

### Full Event JSON
```json
{
  "contract_id": "7a6d5c41ff4a232e4eb4a9f8f3e47a90a46c9b10e49128ed9ef78b15ec2c43e1",
  "title": "Freelance Design Agreement",
  "content": "This agreement is made between Alice (Client) and Bob (Designer)...",
  "version": 1,
  "created_at": 1745193600,
  "signers_required": 2,
  "signatures": [
    {
      "pubkey": "npub1alicepubkey...",
      "sig": "3045022100aabbccddeeff112233...",
      "timestamp": 1745193655
    },
    {
      "pubkey": "npub1bobpubkey...",
      "sig": "3045022100ffeeddccbbaa998877...",
      "timestamp": 1745193700
    }
  ]
}
```



### Forking Implications:

In a scenario where there are >2 signers, then multiple forks possible if signers act simultaneously. In IRL it is commonly acceptable for paper contracts to be signed independently due to reasons of distance or time. Usually there is no robust check the document has not been modified (or even the correct draft) by the parties. Solutions like Docusign reduced the problem by holding a centralized copy. In distributed systems like Nostr:

1. The document creator can relax the requirements for (a) One master final copy to be signed by all parties, or (b) Multiple forks are acceptable of one or more signatures.
2. A distributed Mutex such as two phase locking or timestamp-based requests. 
3. In Nostr because we don't have centralized data, the clients must detect clashes & potentially merge forks by `contract_id`.
4. In the case of (1a) then a sequence must be enforced by clients and potentially a visible red/green indicator that the document is available to be signed by the "next" user (less chance of clash but longer time to get all signatures) or "remaining users" (higher chance of clash)

### Mitigation Approaches:
- **Off-chain coordination** (DMs, chats)
- **Merge logic in clients**
- **Dedicated coordination relays**


## Prototype Requirements

### Backend

Will use normal Nostr relays, the client will default to specific relays to increase the chance of an accurate "state" of the contract and as a possible privacy solution (we are not attempting to solve privacy of contract content of participants in this prototype). As indicated earlier Nostr `kind: 30023` may be used. (`kind: 30024`) won't be used as its assumed that each note is potentially "final" per (1b) above.

**Signature Conflict Mechanism**
Each signature will create a new `kind: 30024` revision, therefore we should have timestamped revisions so that (1a) above can be completed. Because there is no "editing" of the document we don't need any merge anything, in (1a) scenarios just reject a signature from an outdated revision (or also Client-Side Verification see below).

### UI

Web interface written in Typescript, there are two primary interfaces: AuthorUI and SignatoryUI.
### Stack
- `nostr-tools` in JS
- Typescript / React GUI
- WebCrypto



#### AuthorUI

**Contracts List ( Monitoring)** 
The author and signatory have a similar screen.

A list of contracts sorted in reverse date order, a filter to show show a "status" of: ["Needs me to sign" | "I have signed" | "Finalized"]. Each row has columns of: title of contract, "author", "status", "Sign" button, "Review" button. Possibly a version may be useful (or this could have a mouseover saying who/npubs has signed and at what time, this summarises the current and former successful revisions found from the relay).

A button that commences Contract Initiation.

The selection of contracts to be loaded into the UI will be:
- those created by this npub as the "author"
- those requiring this npub as a signatory (how this can be effectively fetched is unknown to this document writer, the design will have to address this using the native capabilities of nostr. Perhaps another nostr note as an index NIP-51, NIP-33 Named Replaceable Events)

**Contract Initiation**
A screen or modal dialog that allows an "author" to upload a "contract". The user will:
a) enter the signatory npubs. They can mark who is mandatory or optional. The  "signatures": [...] could be used and be initially only containing npubs with the other fields to be added when that signatory npub sign the document.
b) enter the minimum number of signatories (signers_required) to make "final" of the contract.
c) the author may be a default signatory but could be removed by author.
d) Select the Signature Conflict Mechanism. Declaring this process is a (1a - single doc, multiple signers) or (1b - multiple doc, 1+ signatures each) scenario
e) Once the author has completed the setup they can click "Commence Signing Process", this will publish the `kind: 30023` to the relay.

Invitation is outside the scope of the prototype.


#### Client-Side Verification

It is important to the author that the correct signatures are on the document, we need to assume that accidental or malicious signing may occur with a different nsec to the invited npubs. We probably also want to avoid a given npub signing multiple times. So a rejection/warning is required in each case. 

**Steps:**
1. Parse event and extract `content`, `contract_id`, and `signatures`.
2. SHA-256 hash the `content` and compare to `contract_id`.
3. Verify each signature against the hash using pubkey.
4. Check if valid signatures ≥ `signers_required`.



#### SignatoryUI

**Contracts List ( Monitoring)** 

Initially we should use the AuthorUI for simplicity of prototype. Perhaps some columns in the list will be different and if we use color to represent status, then it may be different for each role. e.g Yellow for a signatory "Needs me to sign" status. But an Author would likely see RED for no signatories so far and YELLOW for some signatories and GREEN for signing process complete.  Regardless, a signatory can also become an Author of a new document at any time, so we don't want to limit the UI too much. Perhaps "View as Author", "View as Signatory" are switchable modes.

**Signing Dialog** 

When the user clicks the "Sign" button, a popup dialog shows the title of the documents and the current completed signatories. The user can click "Sign Contract", if there is no "Signature Conflict" and passes "Client-Side Verification" the new `kind: 30024` revision is sent to the relay(s). 

If a rejection occurs, the user is explained why and exited to the Contracts List to get the latest version. Therefore it is important to 


### Lists General

The filter and sort order should be maintained locally for the user based on last selection and be applied when any re-rendering occurs.
After any other screen or popup dialog is completed, the list screen should be re-rendered with the latest information from local and where appropriate fetched from relays, this is because the signature state may have changed.
