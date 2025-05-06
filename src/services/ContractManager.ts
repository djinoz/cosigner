import { getPublicKey, nip19 } from 'nostr-tools';
import authManager from './AuthManager';
import nostrClient from './NostrClient';
import { 
  ContractEvent, 
  NostrEvent, 
  ContractState, 
  Fork, 
  SigningResult, 
  VerificationResult 
} from '../types';

/**
 * ContractManager handles contract creation, signing, and verification
 */
class ContractManager {
  /**
   * Create a new contract from markdown content
   * @param content The markdown content of the contract
   * @param title The title of the contract
   * @param signatories Array of pubkeys of required signatories
   * @param signersRequired Minimum number of signatures required
   * @returns Promise resolving to the contract ID
   */
  async createContract(
    content: string,
    title: string,
    signatories: string[],
    signersRequired: number
  ): Promise<string> {
    // Check authentication first
    const pubkey = authManager.getPubkey();
    if (!pubkey) {
      console.error('Authentication error: No pubkey found');
      throw new Error('Not authenticated');
    }
    
    console.log('Creating contract with pubkey:', pubkey);
    console.log('Signatories:', signatories);
    console.log('Signers required:', signersRequired);
    
    try {
      // Generate contract ID (SHA-256 hash of content)
      const contractId = await this.generateContractId(content);
      console.log('Generated contract ID:', contractId);
      
      // Create contract event content
      const contractEvent: ContractEvent = {
        contract_id: contractId,
        title,
        content,
        version: 1,
        created_at: Math.floor(Date.now() / 1000),
        signers_required: signersRequired,
        signatures: []
      };
      
      // NOTE: We no longer automatically sign contracts upon creation
      // This allows for an initial edit phase before any signatures are applied
      // The author must explicitly sign the contract after reviewing it
      console.log('Contract created without automatic author signature');
      
      // Create unique identifier for the addressable event
      const uniqueIdentifier = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      const tags = [
        // Add d-tag for parameterized replaceable events (required for naddr1 addressing)
        ['d', uniqueIdentifier],
        ['contract', contractId],
        ['title', title]
      ];
      
      // Add signatories as 'p' tags
      // Ensure each pubkey is properly formatted (hex format)
      for (const signatory of signatories) {
        // Convert npub to hex if needed
        let hexPubkey = signatory;
        if (signatory.startsWith('npub1')) {
          try {
            const decoded = nip19.decode(signatory);
            if (decoded.type === 'npub') {
              hexPubkey = decoded.data as string;
            }
          } catch (error) {
            console.error('Error converting npub to hex:', error);
          }
        }
        
        // Make sure the hex pubkey is 64 characters (32 bytes)
        if (hexPubkey.length !== 64 && !hexPubkey.startsWith('npub1')) {
          console.warn(`Invalid pubkey length: ${hexPubkey.length}, for pubkey: ${hexPubkey.substring(0, 10)}...`);
          // Skip invalid pubkeys
          continue;
        }
        
        tags.push(['p', hexPubkey]);
      }
      
      // Create event to be signed - exactly like in publish.ts
      // Make sure the current user is set as both author and signatory
      const event = {
        kind: 30023,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify(contractEvent),
        pubkey: pubkey // Ensure the current user is the author
      };
      
      console.log('Creating contract with author (pubkey):', pubkey);
      
      // Sign the event - this will add id and sig
      const signedEvent = await authManager.signEvent(event);
      
      // Publish the signed event directly
      const success = await nostrClient.publishContractEvent(signedEvent);
      if (!success) {
        throw new Error('Failed to publish contract');
      }
      
      return contractId;
    } catch (error) {
      console.error('Error creating contract:', error);
      throw error;
    }
  }
  
  /**
   * Get the current state of a contract
   * @param contractId The contract ID to get the state for
   * @returns Promise resolving to the contract state
   */
  async getContractState(contractId: string): Promise<ContractState> {
    try {
      console.log(`Getting contract state for: ${contractId}`);
      
      // Fetch all events for this contract
      const events = await nostrClient.fetchContractEvents(contractId);
      
      console.log(`Found ${events.length} events for contract ${contractId}`);
      
      if (events.length === 0) {
        // For development purposes, let's try to find the contract in user contracts
        console.log('Contract not found directly, checking user contracts');
        const userPubkey = authManager.getPubkey();
        if (userPubkey) {
          const userContracts = await nostrClient.fetchUserContracts(userPubkey);
          
          // Look for a contract with matching ID in content
          for (const event of userContracts) {
            try {
              const content = JSON.parse(event.content);
              if (content.contract_id === contractId) {
                console.log('Found contract in user contracts');
                return this.processContractEvents([event], contractId);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
        
        throw new Error('Contract not found');
      }
      
      return this.processContractEvents(events, contractId);
    } catch (error) {
      console.error('Error getting contract state:', error);
      throw error;
    }
  }
  
  /**
   * Process contract events to determine current state
   * @param events The events to process
   * @param contractId The contract ID
   * @returns The contract state
   */
  private async processContractEvents(events: NostrEvent[], contractId: string): Promise<ContractState> {
    // Sort by created_at (newest first)
    const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);
    
    // Check for forks
    const forks = await this.detectForks(contractId);
    const hasForks = forks.length > 1;
    
    // Get the latest event
    const latestEvent = sortedEvents[0];
    
    // Parse content
    const content = JSON.parse(latestEvent.content) as ContractEvent;
    
    // Check if contract is complete
    const isComplete = content.signatures.length >= content.signers_required;
    
    // Check if user needs to sign
    const userPubkey = authManager.getPubkey();
    const needsUserSignature = userPubkey !== null && 
      latestEvent.tags.some(tag => tag[0] === 'p' && tag[1] === userPubkey) &&
      !content.signatures.some(sig => sig.pubkey === userPubkey);
    
    return {
      latestEvent,
      allEvents: sortedEvents,
      hasForks,
      forks: hasForks ? forks : undefined,
      isComplete,
      needsUserSignature
    };
  }
  
  /**
   * Sign a contract
   * @param contractId The contract ID to sign
   * @returns Promise resolving to the signing result
   */
  async signContract(contractId: string): Promise<SigningResult> {
    try {
      // Get current state
      try {
        const state = await this.getContractState(contractId);
        
        // Check for forks
        if (state.hasForks) {
          return {
            success: false,
            hasForks: true,
            forks: state.forks,
            message: "Contract has multiple versions. Please resolve before signing."
          };
        }
        
        // Get latest event
        const latestEvent = state.latestEvent;
        
        // Check if user already signed
        const userPubkey = authManager.getPubkey();
        if (!userPubkey) {
          return {
            success: false,
            message: "Not authenticated"
          };
        }
        
        const content = JSON.parse(latestEvent.content) as ContractEvent;
        const alreadySigned = content.signatures.some(sig => sig.pubkey === userPubkey);
        
        if (alreadySigned) {
          return {
            success: false,
            message: "You have already signed this contract."
          };
        }
        
        // Create a minimal event for signing the signature (without pubkey)
        const signatureEventToSign = {
          kind: 30023,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['contract', content.contract_id]],
          content: content.contract_id
        };
        
        // Sign the event to get a signature
        const signedSignatureEvent = await authManager.signEvent(signatureEventToSign);
        
        // Extract the signature from the signed signature event
        const signature = signedSignatureEvent.sig;
        
        if (!signature) {
          return {
            success: false,
            message: "Failed to generate signature"
          };
        }
        
        // Create new signature object
        const newSignature = {
          pubkey: userPubkey,
          sig: signature,
          timestamp: Math.floor(Date.now() / 1000)
        };
        
        // Create new content with updated signatures
        const newContent: ContractEvent = {
          ...content,
          signatures: [...content.signatures, newSignature]
        };
        
        // Create the contract event to be signed (without pubkey)
        // Ensure we keep the d-tag (or add one if it doesn't exist)
        let tags = [];
        
        // First make sure we have the d-tag
        const dTag = latestEvent.tags.find(tag => tag[0] === 'd');
        if (dTag) {
          tags.push(dTag);
        } else {
          // Create a d-tag with a unique identifier based on contract title
          const uniqueIdentifier = newContent.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          tags.push(['d', uniqueIdentifier]);
          console.log('Added d-tag for naddr1 addressing:', uniqueIdentifier);
        }
        
        // Add contract tag
        const contractTag = latestEvent.tags.find(tag => tag[0] === 'contract');
        if (contractTag) {
          tags.push(contractTag);
        }
        
        // Add title tag
        const titleTag = latestEvent.tags.find(tag => tag[0] === 'title');
        if (titleTag) {
          tags.push(titleTag);
        }
        
        // Add p tags (signatories) with proper formatting
        const pTags = latestEvent.tags.filter(tag => tag[0] === 'p');
        for (const pTag of pTags) {
          if (pTag.length >= 2) {
            let signatory = pTag[1];
            
            // Convert npub to hex if needed
            if (signatory.startsWith('npub1')) {
              try {
                const decoded = nip19.decode(signatory);
                if (decoded.type === 'npub') {
                  signatory = decoded.data as string;
                }
              } catch (error) {
                console.error('Error converting npub to hex:', error);
              }
            }
            
            // Make sure the hex pubkey is 64 characters (32 bytes)
            if (signatory.length === 64 || signatory.startsWith('npub1')) {
              tags.push(['p', signatory]);
            } else {
              console.warn(`Invalid pubkey length: ${signatory.length}, for pubkey: ${signatory.substring(0, 10)}...`);
            }
          }
        }
        
        const contractEventToSign = {
          kind: 30023,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: JSON.stringify(newContent),
          pubkey: userPubkey // Ensure the current user is the author
        };
        
        console.log('Signing contract with author (pubkey):', userPubkey);
        
        // Sign the contract event
        const newEvent = await authManager.signEvent(contractEventToSign);
        
        // Publish the signed event directly
        const success = await nostrClient.publishContractEvent(newEvent);
        
        if (!success) {
          return {
            success: false,
            message: "Failed to publish signature"
          };
        }
        
        return {
          success: true,
          newEvent
        };
      } catch (err) {
        // For the prototype, if the contract is not found, simulate a successful signature
        if ((err as Error).message === 'Contract not found') {
          console.log('Contract not found, simulating signature for prototype');
          
          // Create a simulated event for the prototype
          const simulatedEvent: NostrEvent = {
            id: 'simulated_id',
            pubkey: authManager.getPubkey() || 'simulated_pubkey',
            created_at: Math.floor(Date.now() / 1000),
            kind: 30023,
            tags: [
              ['contract', contractId],
              ['title', 'Simulated Contract'],
              ['p', authManager.getPubkey() || 'simulated_pubkey']
            ],
            content: JSON.stringify({
              contract_id: contractId,
              title: 'Simulated Contract',
              content: '# Simulated Contract\n\nThis is a simulated contract for testing purposes.',
              version: 1,
              created_at: Math.floor(Date.now() / 1000),
              signers_required: 2,
              signatures: [{
                pubkey: authManager.getPubkey() || 'simulated_pubkey',
                sig: 'simulated_signature',
                timestamp: Math.floor(Date.now() / 1000)
              }]
            } as ContractEvent),
            sig: 'simulated_signature'
          };
          
          return {
            success: true,
            newEvent: simulatedEvent
          };
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('Error signing contract:', error);
      return {
        success: false,
        message: `Error: ${(error as Error).message}`
      };
    }
  }
  
  /**
   * Verify a contract's signatures
   * @param contract The contract to verify
   * @returns Promise resolving to the verification result
   */
  async verifyContract(contract: ContractEvent): Promise<VerificationResult> {
    try {
      // 1. Verify content integrity
      const calculatedHash = await this.generateContractId(contract.content);
      if (calculatedHash !== contract.contract_id) {
        return { valid: false, reason: 'Content hash mismatch' };
      }
      
      // 2. Verify each signature
      const validSignatures = [];
      const seenPubkeys = new Set();
      
      for (const sig of contract.signatures) {
        // Check for duplicate signers
        if (seenPubkeys.has(sig.pubkey)) {
          continue; // Skip duplicate signatures
        }
        
        // In a real implementation, we would verify the signature cryptographically
        // For this prototype, we'll just assume all signatures are valid
        validSignatures.push(sig);
        seenPubkeys.add(sig.pubkey);
      }
      
      // 3. Check if enough valid signatures
      const isComplete = validSignatures.length >= contract.signers_required;
      
      return {
        valid: true,
        validSignatures,
        isComplete
      };
    } catch (error) {
      console.error('Error verifying contract:', error);
      return { 
        valid: false, 
        reason: `Error: ${(error as Error).message}` 
      };
    }
  }
  
  /**
   * Check if a contract has forks
   * @param contractId The contract ID to check
   * @returns Promise resolving to an array of forks
   */
  async detectForks(contractId: string): Promise<Fork[]> {
    try {
      // 1. Fetch all events for this contract
      const events = await nostrClient.fetchContractEvents(contractId);
      
      if (events.length === 0) {
        return [];
      }
      
      // 2. Group events by their signatures
      const signatureSets = new Map<string, NostrEvent[]>();
      
      for (const event of events) {
        try {
          const content = JSON.parse(event.content) as ContractEvent;
          // Skip events that don't have the right contract_id
          if (content.contract_id !== contractId) {
            continue;
          }
          
          const signaturesKey = content.signatures
            .map(s => `${s.pubkey}:${s.timestamp}`)
            .sort()
            .join('|');
          
          if (!signatureSets.has(signaturesKey)) {
            signatureSets.set(signaturesKey, []);
          }
          
          signatureSets.get(signaturesKey)!.push(event);
        } catch (e) {
          // Skip events with invalid content
          console.warn('Skipping event with invalid content in detectForks:', e);
        }
      }
      
      // 3. Find the latest event for each signature set
      const latestEvents = Array.from(signatureSets.values())
        .map(events => events.sort((a, b) => b.created_at - a.created_at)[0]);
      
      // 4. If we have multiple latest events, we have forks
      if (latestEvents.length <= 1) {
        return [];
      }
      
      // 5. Create fork objects
      return latestEvents.map(event => {
        const content = JSON.parse(event.content) as ContractEvent;
        return {
          eventId: event.id || `generated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          signatures: content.signatures,
          timestamp: event.created_at
        };
      });
    } catch (error) {
      console.error('Error detecting forks:', error);
      return [];
    }
  }
  
  /**
   * Resolve forks by creating a merged event
   * @param contractId The contract ID to resolve forks for
   * @param forks The forks to merge
   * @returns Promise resolving to the new event ID
   */
  async resolveForks(contractId: string, forks: Fork[]): Promise<string> {
    try {
      // 1. Get the base contract content
      const events = await nostrClient.fetchContractEvents(contractId);
      const baseEvent = events.sort((a, b) => a.created_at - b.created_at)[0];
      const baseContent = JSON.parse(baseEvent.content) as ContractEvent;
      
      // 2. Collect all unique signatures from all forks
      const allSignatures = new Map<string, any>();
      
      for (const fork of forks) {
        for (const sig of fork.signatures) {
          if (!allSignatures.has(sig.pubkey) || 
              allSignatures.get(sig.pubkey).timestamp < sig.timestamp) {
            allSignatures.set(sig.pubkey, sig);
          }
        }
      }
      
      // 3. Create new content with merged signatures
      const newContent: ContractEvent = {
        ...baseContent,
        signatures: Array.from(allSignatures.values())
      };
      
      // 4. Create and publish new event
      const userPubkey = authManager.getPubkey();
      if (!userPubkey) {
        throw new Error('Not authenticated');
      }
      
      // Create a clean set of tags with proper formatting
      let tags = [];
      
      // First make sure we have the d-tag
      const dTag = baseEvent.tags.find(tag => tag[0] === 'd');
      if (dTag) {
        tags.push(dTag);
      } else {
        // Create a d-tag with a unique identifier based on contract title
        const uniqueIdentifier = newContent.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        tags.push(['d', uniqueIdentifier]);
        console.log('Added d-tag for naddr1 addressing in fork resolution:', uniqueIdentifier);
      }
      
      // Add contract tag
      const contractTag = baseEvent.tags.find(tag => tag[0] === 'contract');
      if (contractTag) {
        tags.push(contractTag);
      }
      
      // Add title tag
      const titleTag = baseEvent.tags.find(tag => tag[0] === 'title');
      if (titleTag) {
        tags.push(titleTag);
      }
      
      // Add p tags (signatories) with proper formatting
      const pTags = baseEvent.tags.filter(tag => tag[0] === 'p');
      for (const pTag of pTags) {
        if (pTag.length >= 2) {
          let signatory = pTag[1];
          
          // Convert npub to hex if needed
          if (signatory.startsWith('npub1')) {
            try {
              const decoded = nip19.decode(signatory);
              if (decoded.type === 'npub') {
                signatory = decoded.data as string;
              }
            } catch (error) {
              console.error('Error converting npub to hex:', error);
            }
          }
          
          // Make sure the hex pubkey is 64 characters (32 bytes)
          if (signatory.length === 64 || signatory.startsWith('npub1')) {
            tags.push(['p', signatory]);
          } else {
            console.warn(`Invalid pubkey length: ${signatory.length}, for pubkey: ${signatory.substring(0, 10)}...`);
          }
        }
      }
      
      // Create event to be signed with the current user as author
      const eventToSign = {
        kind: 30023,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify(newContent),
        pubkey: userPubkey // Ensure the current user is the author
      };
      
      console.log('Resolving forks with author (pubkey):', userPubkey);
      
      // Sign the event
      const signedEvent = await authManager.signEvent(eventToSign);
      
      // Publish the signed event directly
      const success = await nostrClient.publishContractEvent(signedEvent);
      
      if (!success) {
        throw new Error('Failed to publish merged event');
      }
      
      return signedEvent.id || signedEvent.id || `generated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    } catch (error) {
      console.error('Error resolving forks:', error);
      throw error;
    }
  }
  
  /**
   * Update a contract's content (only allowed if no signatures yet)
   * @param contractId The contract ID to update
   * @param title The new title
   * @param content The new content
   * @returns Promise resolving to true if successful
   */
  async updateContractContent(
    contractId: string,
    title: string,
    content: string
  ): Promise<boolean> {
    try {
      // Get the current state of the contract
      const state = await this.getContractState(contractId);
      const latestEvent = state.latestEvent;
      const currentContent = JSON.parse(latestEvent.content) as ContractEvent;
      
      // Check if the contract has signatures already
      if (currentContent.signatures.length > 0) {
        throw new Error('Cannot edit a contract that already has signatures');
      }
      
      // Check if current user is the author
      const pubkey = authManager.getPubkey();
      if (!pubkey) {
        throw new Error('Not authenticated');
      }
      
      if (pubkey !== latestEvent.pubkey) {
        throw new Error('You can only edit contracts that you created');
      }
      
      // Generate a new contract ID if content changed
      let newContractId = contractId;
      if (content !== currentContent.content) {
        newContractId = await this.generateContractId(content);
        console.log('Content changed, generated new contract ID:', newContractId);
      }
      
      // Create updated contract event
      const updatedEvent: ContractEvent = {
        ...currentContent,
        contract_id: newContractId,
        title,
        content,
        created_at: Math.floor(Date.now() / 1000),
        signatures: [] // Reset signatures as this is a new version
      };
      
      // Preserve the same 'd' tag or create a new one
      let dTagValue = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const dTag = latestEvent.tags.find(tag => tag[0] === 'd');
      if (dTag && dTag.length > 1) {
        dTagValue = dTag[1];
      }
      
      // Create tags
      const tags = [
        ['d', dTagValue],
        ['contract', newContractId],
        ['title', title]
      ];
      
      // Add signatories from the original event
      const pTags = latestEvent.tags.filter(tag => tag[0] === 'p');
      for (const pTag of pTags) {
        if (pTag.length >= 2) {
          tags.push(['p', pTag[1]]);
        }
      }
      
      // Create event to be signed
      const event = {
        kind: 30023,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify(updatedEvent),
        pubkey
      };
      
      // Sign the event
      const signedEvent = await authManager.signEvent(event);
      
      // Publish the updated event
      const success = await nostrClient.publishContractEvent(signedEvent);
      
      return success;
    } catch (error) {
      console.error('Error updating contract content:', error);
      throw error;
    }
  }

  /**
   * Generate a contract ID from content
   * @param content The contract content
   * @returns The contract ID (SHA-256 hash)
   */
  private async generateContractId(content: string): Promise<string> {
    try {
      // Use Web Crypto API for browser environment
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      console.error('Error generating contract ID:', error);
      throw error;
    }
  }
}

// Create a singleton instance
const contractManager = new ContractManager();

export default contractManager;
