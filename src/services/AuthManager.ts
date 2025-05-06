import { getPublicKey, nip19, generateSecretKey, getEventHash } from 'nostr-tools';
import { AuthState } from '../types';

/**
 * AuthManager handles authentication with Nostr using either NIP-07 browser extensions
 * or manual nsec key input. It manages the authentication state during the session.
 */
class AuthManager {
  private pubkey: string | null = null;
  private nsec: Uint8Array | null = null;
  private nip07: any | null = null;

  /**
   * Check if a NIP-07 extension is available in the browser
   */
  async checkForNip07(): Promise<boolean> {
    return typeof window !== 'undefined' && window.nostr !== undefined;
  }

  /**
   * Connect using a NIP-07 browser extension
   * @returns The public key of the connected user
   */
  async connectWithNip07(): Promise<string> {
    if (!await this.checkForNip07()) {
      throw new Error('NIP-07 extension not available');
    }

    try {
      this.nip07 = window.nostr;
      const pubkey = await this.nip07.getPublicKey();
      this.pubkey = pubkey;
      this.nsec = null;
      this.saveAuthState();
      return pubkey;
    } catch (error) {
      console.error('Error connecting with NIP-07:', error);
      throw new Error('Failed to connect with NIP-07 extension');
    }
  }

  /**
   * Connect using a provided nsec key
   * @param nsec The nsec private key
   * @returns The public key derived from the nsec
   */
  connectWithNsec(nsec: string): string {
    try {
      console.log('Connecting with nsec key');
      
      // EXACTLY like in publish.ts
      if (!nsec.startsWith('nsec1')) {
        console.error('Invalid NSEC format - must start with nsec1');
        throw new Error('Invalid NSEC provided. NSEC keys should start with "nsec1". Please check your private key.');
      }
      
      // NSEC keys should be around 63 characters long (may vary slightly)
      if (nsec.length < 50 || nsec.length > 70) {
        console.error('Invalid NSEC length:', nsec.length);
        throw new Error('Invalid NSEC provided. The key length appears incorrect. Please check your private key.');
      }
      
      console.log('Decoding nsec format key');
      const decoded = nip19.decode(nsec);
      console.log('Decoded nsec type:', decoded.type);
      
      if (decoded.type !== 'nsec') {
        console.error('Invalid nsec type:', decoded.type);
        throw new Error('Invalid NSEC provided. Please check your private key.');
      }
      
      // The decoded nsec as Uint8Array - EXACTLY like in publish.ts
      const secretKey = decoded.data as Uint8Array;
      console.log('Secret key is Uint8Array:', secretKey instanceof Uint8Array);
      console.log('Secret key length:', secretKey.length);
      
      // Derive public key - EXACTLY like in publish.ts
      const pubkey = getPublicKey(secretKey);
      console.log('Derived pubkey:', pubkey);
      
      // Store the keys
      this.pubkey = pubkey;
      this.nsec = secretKey; // Store in memory only, never persist
      this.nip07 = null;
      
      // Save auth state
      this.saveAuthState();
      
      return pubkey;
    } catch (error) {
      console.error('Error connecting with nsec:', error);
      throw new Error(`Invalid nsec key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate a new random keypair
   * @returns The public key of the generated keypair
   */
  generateKeypair(): string {
    const privateKey = generateSecretKey(); // Returns Uint8Array
    const pubkey = getPublicKey(privateKey);
    this.pubkey = pubkey;
    this.nsec = privateKey;
    this.nip07 = null;
    this.saveAuthState();
    return pubkey;
  }

  /**
   * Sign an event using the authenticated key - simplified to match publish.ts exactly
   * @param eventData The event data to sign (without pubkey, id, or sig)
   * @returns The signed event
   */
  async signEvent(eventData: any): Promise<any> {
    if (!this.isAuthenticated()) {
      console.error('Attempted to sign while not authenticated');
      throw new Error('Not authenticated');
    }

    try {
      console.log('Signing event with pubkey:', this.pubkey);
      
      // IMPORTANT: For contract signing, we ALWAYS prefer nsec over NIP-07
      // This ensures we're using the exact same signing method as publish.ts
      if (this.nsec) {
        console.log('Using nsec key to sign');
        try {
          // Import nostr-tools - EXACTLY like in publish.ts
          console.log('Importing nostr-tools');
          const nostrTools = await import('nostr-tools');
          
          // EXACTLY like in publish.ts:
          // Create a clean event object
          const event = { ...eventData };
          
          console.log('Event to sign:', JSON.stringify(event, null, 2));
          console.log('nsec type:', typeof this.nsec);
          console.log('nsec instanceof Uint8Array:', this.nsec instanceof Uint8Array);
          console.log('nsec length:', this.nsec ? this.nsec.length : 'null');
          
          // Get the pubkey from the nsec to verify it's correct
          const derivedPubkey = nostrTools.getPublicKey(this.nsec);
          console.log('Derived pubkey:', derivedPubkey);
          console.log('Stored pubkey:', this.pubkey);
          console.log('Pubkeys match:', derivedPubkey === this.pubkey);
          
          // Check if an explicit pubkey is set in the event
          if (!event.pubkey) {
            console.log('No pubkey in event, using derived pubkey');
            event.pubkey = derivedPubkey;
          } else {
            console.log('Using explicit pubkey from event:', event.pubkey);
            if (event.pubkey !== derivedPubkey) {
              console.warn('Warning: Explicit pubkey in event does not match derived pubkey');
            }
          }
          
          // Sign the event with finalizeEvent - EXACTLY like in publish.ts
          console.log('Calling finalizeEvent...');
          const signedEvent = nostrTools.finalizeEvent(event, this.nsec);
          
          console.log('Signed event:', {
            kind: signedEvent.kind,
            created_at: signedEvent.created_at,
            pubkey: signedEvent.pubkey,
            id: signedEvent.id,
            sig: signedEvent.sig ? signedEvent.sig.substring(0, 10) + '...' : null,
            sig_length: signedEvent.sig ? signedEvent.sig.length : 0
          });
          
          // Check if sig is a valid hex string
          if (signedEvent.sig) {
            const isValidHex = /^[0-9a-f]+$/i.test(signedEvent.sig);
            console.log('Signature is valid hex:', isValidHex);
            console.log('Signature length:', signedEvent.sig.length);
            if (!isValidHex) {
              console.error('Invalid hex in signature:', signedEvent.sig);
            }
            if (signedEvent.sig.length % 2 !== 0) {
              console.error('Signature has odd length:', signedEvent.sig.length);
            }
          }
          
          console.log('Event signed successfully');
          return signedEvent;
        } catch (error) {
          console.error('Error signing with nsec:', error);
          throw new Error(`Failed to sign event with nsec key: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        console.error('No signing method available');
        if (this.getAuthMethod() === 'nsec') {
          throw new Error('Your nsec key is not available. Please re-enter your nsec key to sign events.');
        } else {
          throw new Error('No signing method available. Please log in with a valid nsec key or NIP-07 extension.');
        }
      }
    } catch (error) {
      console.error('Error signing event:', error);
      throw new Error(`Failed to sign event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the current public key
   * @returns The public key or null if not authenticated
   */
  getPubkey(): string | null {
    return this.pubkey;
  }

  /**
   * Check if the user is authenticated
   * @returns True if authenticated, false otherwise
   */
  isAuthenticated(): boolean {
    return this.pubkey !== null;
  }

  /**
   * Check if the user can sign events (has nsec key or NIP-07)
   * @returns True if signing is possible, false otherwise
   */
  canSign(): boolean {
    return (this.nsec !== null) || (this.nip07 !== null);
  }

  /**
   * Get the authentication method
   * @returns The authentication method or null if not authenticated
   */
  getAuthMethod(): 'nip07' | 'nsec' | null {
    if (!this.isAuthenticated()) return null;
    return this.nip07 ? 'nip07' : 'nsec';
  }

  /**
   * Re-authenticate with an nsec key without full logout
   * @param nsec The nsec private key
   * @returns The public key derived from the nsec
   */
  reAuthenticateWithNsec(nsec: string): string {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Please log in first.');
    }

    try {
      console.log('Re-authenticating with nsec key');
      
      // EXACTLY like in publish.ts
      if (!nsec.startsWith('nsec1')) {
        console.error('Invalid NSEC format - must start with nsec1');
        throw new Error('Invalid NSEC provided. NSEC keys should start with "nsec1". Please check your private key.');
      }
      
      // NSEC keys should be around 63 characters long (may vary slightly)
      if (nsec.length < 50 || nsec.length > 70) {
        console.error('Invalid NSEC length:', nsec.length);
        throw new Error('Invalid NSEC provided. The key length appears incorrect. Please check your private key.');
      }
      
      console.log('Decoding nsec format key');
      const decoded = nip19.decode(nsec);
      console.log('Decoded nsec type:', decoded.type);
      
      if (decoded.type !== 'nsec') {
        console.error('Invalid nsec type:', decoded.type);
        throw new Error('Invalid NSEC provided. Please check your private key.');
      }
      
      // The decoded nsec as Uint8Array - EXACTLY like in publish.ts
      const secretKey = decoded.data as Uint8Array;
      console.log('Secret key is Uint8Array:', secretKey instanceof Uint8Array);
      console.log('Secret key length:', secretKey.length);
      
      // Derive public key - EXACTLY like in publish.ts
      const derivedPubkey = getPublicKey(secretKey);
      console.log('Derived pubkey:', derivedPubkey);
      console.log('Current pubkey:', this.pubkey);
      console.log('Keys match:', derivedPubkey === this.pubkey);
      
      // Verify that the pubkey matches the current authenticated pubkey
      if (derivedPubkey !== this.pubkey) {
        throw new Error('The provided nsec key does not match your authenticated public key.');
      }
      
      // Store the nsec key in memory
      this.nsec = secretKey;
      console.log('Successfully re-authenticated with nsec key');
      return this.pubkey;
    } catch (error) {
      console.error('Error re-authenticating with nsec:', error);
      throw new Error(`Invalid nsec key or key does not match your public key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save the authentication state to session storage
   * Note: We never save the nsec, only the pubkey and auth method
   */
  private saveAuthState(): void {
    if (!this.pubkey) return;
    
    const authState: AuthState = {
      pubkey: this.pubkey,
      method: this.nip07 ? 'nip07' : 'nsec'
    };
    
    sessionStorage.setItem('authState', JSON.stringify(authState));
  }

  /**
   * Load the authentication state from session storage
   * @returns True if state was loaded, false otherwise
   */
  loadAuthState(): boolean {
    const authStateJson = sessionStorage.getItem('authState');
    if (!authStateJson) return false;
    
    try {
      const authState: AuthState = JSON.parse(authStateJson);
      this.pubkey = authState.pubkey;
      
      // If using NIP-07, reconnect
      if (authState.method === 'nip07') {
        this.checkForNip07().then(available => {
          if (available) {
            this.nip07 = window.nostr;
          } else {
            // NIP-07 was used before but is no longer available
            this.logout();
          }
        });
      } else {
        // For nsec method, we need to check if we already have the nsec key in memory
        if (this.nsec) {
          console.log('Using existing nsec key from memory');
          return true;
        } else {
          // We don't have the nsec key, but we'll keep the user logged in
          // They'll need to re-enter their nsec key if they want to sign or publish
          console.log('Warning: nsec key not available in memory');
          console.log('User will need to re-authenticate to sign or publish');
          return true;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error loading auth state:', error);
      return false;
    }
  }

  /**
   * Logout and clear the authentication state
   */
  logout(): void {
    this.pubkey = null;
    this.nsec = null;
    this.nip07 = null;
    sessionStorage.removeItem('authState');
  }
}

// Create a singleton instance
const authManager = new AuthManager();

export default authManager;

// Add type definition for window.nostr (NIP-07)
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: any): Promise<string>;
    };
    nobleSecp256k1: any;
  }
}
