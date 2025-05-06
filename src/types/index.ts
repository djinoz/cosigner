// Nostr and Contract Types

export interface Signature {
  pubkey: string;           // Nostr public key (npub or hex)
  sig: string;              // Hex signature
  timestamp: number;        // Unix timestamp of signing
}

export interface ContractEvent {
  contract_id: string;      // SHA-256 hash of content
  title: string;            // Title of the contract
  content: string;          // Markdown content of the contract
  version: number;          // Version number (typically 1)
  created_at: number;       // Unix timestamp of creation
  signers_required: number; // Minimum number of signatures required
  signatures: Signature[];  // Array of signatures
}

export interface NostrEvent {
  kind: number;             // 30023 for our contract events
  created_at: number;       // Unix timestamp
  tags: string[][];         // Array of tags
  content: string;          // JSON stringified ContractEvent
  pubkey: string;           // Publisher's public key
  id?: string;              // Event ID (computed)
  sig?: string;             // Event signature (computed)
}

export interface ContractState {
  latestEvent: NostrEvent;
  allEvents: NostrEvent[];
  hasForks: boolean;
  forks?: Fork[];
  isComplete: boolean;
  needsUserSignature: boolean;
}

export interface Fork {
  eventId: string;
  signatures: Signature[];
  timestamp: number;
}

export interface SigningResult {
  success: boolean;
  hasForks?: boolean;
  forks?: Fork[];
  message?: string;
  newEvent?: NostrEvent;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  validSignatures?: Signature[];
  isComplete?: boolean;
}

export interface UserPreferences {
  filterStatus: "needs_signature" | "signed" | "finalized" | "all";
  sortOrder: "newest" | "oldest";
}

export interface AuthState {
  pubkey: string;
  method: "nip07" | "nsec";
  // nsec is never stored, only kept in memory during session
}
