# Cosigner - Nostr Co-Signed Contracts

A web application for creating and managing co-signed contracts using the Nostr protocol.

## Overview

Cosigner is a prototype implementation of a co-signed contracts system built on Nostr, specifically using `kind: 30023` events. It allows users to:

- Upload markdown documents as contracts
- Specify required signatories using Nostr public keys
- Sign contracts using their Nostr keys
- Track the status of contracts
- Resolve signature conflicts

## Features

- **Authentication**: Sign in with NIP-07 browser extensions or directly with nsec keys
- **Contract Management**: Upload, view, and sign contracts
- **Markdown Support**: Contracts are written in markdown format
- **Signature Verification**: Cryptographic verification of signatures
- **Conflict Resolution**: Handling of signature conflicts due to Nostr's immutable nature

## Technical Details

- Built with React and TypeScript
- Uses `nostr-tools` for Nostr protocol integration
- Implements the sequential signing approach (1a) as described in the specification
- Connects to relay.primal.net for Nostr event publishing and subscription

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/djinoz/cosigner.git
   cd cosigner
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

### Authentication

- Use a NIP-07 compatible browser extension (like Alby or nos2x)
- Or sign in with your nsec key (not recommended for production use)
- For testing, you can generate a new key pair

### Creating a Contract

1. Click "Upload Contract" in the navigation bar
2. Upload a markdown file or paste markdown content
3. Enter a title for the contract
4. Add the Nostr public keys (npub) of all required signatories
5. Specify the minimum number of signatures required
6. Click "Publish Contract"

### Signing a Contract

1. Navigate to the Contracts list
2. Find a contract that needs your signature
3. Click "View" to see the contract details
4. Review the contract content
5. Click "Sign Contract" to add your signature

### Resolving Conflicts

If multiple signatories sign simultaneously, conflicts may occur. In this case:

1. The contract will show a warning about multiple versions
2. Click "Resolve Conflicts" to merge the signatures
3. Once resolved, the contract can be signed by remaining signatories

## Implementation Notes

- This is a prototype implementation and not intended for production use
- All cryptographic operations are performed client-side
- Private keys (nsec) are never stored or transmitted, only kept in memory during the session
- The application includes a simulation mode that allows it to function without requiring an actual Nostr relay connection
- For real-world usage, the application would connect to a Nostr relay (configured to use relay.primal.net)

## Prototype Features

- **Simulation Mode**: The application can operate in a simulation mode where it generates sample contracts and simulates signing operations, allowing you to test the full workflow without a real Nostr relay
- **Fallback Mechanisms**: If a contract is not found in the relay, the application will generate a simulated contract for demonstration purposes
- **Authentication Flexibility**: Supports both NIP-07 browser extensions and direct nsec key input, with fallback mechanisms to ensure signing always works
- **Error Handling**: Comprehensive error handling throughout the application to provide a smooth user experience

## License

MIT
