import { SimplePool, Relay, Event, Filter, getEventHash, nip19 } from 'nostr-tools';
import { NostrEvent } from '../types';
import authManager from './AuthManager';

/**
 * NostrClient handles communication with Nostr relays
 */
class NostrClient {
  private pool: SimplePool;
  private relays: string[] = ['wss://relay.primal.net']; // Hardcoded relay as specified in the README
  private subscriptions: Map<string, () => void> = new Map();

  constructor() {
    this.pool = new SimplePool();
  }

  /**
   * Initialize connection to relays
   */
  async connect(): Promise<void> {
    // SimplePool connects on-demand, so we don't need to do anything here
    console.log('NostrClient ready to connect to relays:', this.relays);
  }

  /**
   * Publish a contract event to the relay using the exact approach from publish.ts
   * @param event The event to publish
   * @returns Promise resolving to true if successful
   */
  async publishContractEvent(event: NostrEvent): Promise<boolean> {
    try {
      // If the event is not signed, sign it first
      let finalEvent = event;
      if (!event.sig) {
        // Create a clean event object with only the required fields
        const eventData = {
          kind: event.kind,
          created_at: event.created_at,
          tags: event.tags || [],
          content: event.content
        };
        
        console.log('Event data before signing:', JSON.stringify(eventData, null, 2));
        
        // Sign the event
        finalEvent = await authManager.signEvent(eventData);
        
        console.log('Event after signing:', {
          kind: finalEvent.kind,
          created_at: finalEvent.created_at,
          pubkey: finalEvent.pubkey,
          id: finalEvent.id,
          sig: finalEvent.sig ? `${finalEvent.sig.substring(0, 10)}...` : null,
          sig_length: finalEvent.sig ? finalEvent.sig.length : 0,
          tags: finalEvent.tags,
          content_length: finalEvent.content ? finalEvent.content.length : 0
        });
      }
      
      // Track successful publishes
      let successCount = 0;
      let errorMessages: string[] = [];
      
      // Import nostr-tools
      const nostrTools = await import('nostr-tools');
      
      // For each relay
      for (const relayUrl of this.relays) {
        try {
          // Connect to relay
          const relay = await nostrTools.Relay.connect(relayUrl);
          
          try {
            // Log the event details before publishing
            // Check for d-tag for naddr generation
            const dTag = finalEvent.tags.find(tag => tag[0] === 'd');
            let naddrCode = null;
            
            // Generate naddr if we have a d-tag
            if (dTag && dTag.length > 1) {
              try {
                const naddrPointer = {
                  identifier: dTag[1],
                  pubkey: finalEvent.pubkey,
                  kind: finalEvent.kind,
                  relays: this.relays
                };
                
                naddrCode = nip19.naddrEncode(naddrPointer);
                console.log('Generated naddr for event:', naddrCode);
              } catch (error) {
                console.error('Error generating naddr:', error);
              }
            } else {
              console.warn('No d-tag found for event, naddr cannot be generated');
            }
            
            console.log(`Publishing to ${relayUrl}, event details:`, {
              kind: finalEvent.kind,
              created_at: finalEvent.created_at,
              pubkey: finalEvent.pubkey,
              id: finalEvent.id,
              sig: finalEvent.sig ? `${finalEvent.sig.substring(0, 10)}...` : null,
              sig_length: finalEvent.sig ? finalEvent.sig.length : 0,
              tags: finalEvent.tags,
              content_length: finalEvent.content ? finalEvent.content.length : 0,
              naddr: naddrCode
            });
            
            // Check if sig is a valid hex string
            if (finalEvent.sig) {
              const isValidHex = /^[0-9a-f]+$/i.test(finalEvent.sig);
              console.log('Signature is valid hex:', isValidHex);
              console.log('Signature length:', finalEvent.sig.length);
              if (!isValidHex) {
                console.error('Invalid hex in signature:', finalEvent.sig);
              }
              if (finalEvent.sig.length % 2 !== 0) {
                console.error('Signature has odd length:', finalEvent.sig.length);
              }
            }
            
            // Publish the event
            // @ts-ignore - Ignore TypeScript error about id possibly being undefined
            await relay.publish(finalEvent);
            console.log(`Successfully published to ${relayUrl}`);
            successCount++;
          } catch (publishError: any) {
            console.error(`Failed to publish to ${relayUrl}:`, publishError);
            errorMessages.push(`${relayUrl}: ${publishError.message}`);
          } finally {
            // Close the relay connection
            relay.close();
          }
        } catch (relayError: any) {
          console.error(`Failed to connect to ${relayUrl}:`, relayError);
          errorMessages.push(`${relayUrl}: ${relayError.message}`);
        }
      }
      
      // Return result
      if (successCount > 0) {
        return true;
      } else {
        console.error('Failed to publish to any relays:', errorMessages);
        return false;
      }
    } catch (error) {
      console.error('Error in publishContractEvent:', error);
      return false;
    }
  }

  /**
   * Fetch all events for a specific contract
   * @param contractId The contract ID to fetch events for
   * @returns Promise resolving to an array of events
   */
  async fetchContractEvents(contractId: string): Promise<NostrEvent[]> {
    console.log(`Fetching events for contract: ${contractId}`);
    
    // First, try to get the contract from user contracts
    const pubkey = authManager.getPubkey();
    if (pubkey) {
      console.log(`Trying to get contract ${contractId} from user contracts for ${pubkey}`);
      
      try {
        // First, try to get the user's contracts (this is more targeted)
        const userContracts = await this.fetchUserContracts(pubkey);
        
        // Check if any of them match our contract ID
        const matchingContracts = userContracts.filter(event => {
          try {
            const content = JSON.parse(event.content);
            return content.contract_id === contractId;
          } catch (e) {
            return false;
          }
        });
        
        if (matchingContracts.length > 0) {
          console.log(`Found ${matchingContracts.length} matching contracts in user contracts`);
          return matchingContracts;
        }
      } catch (error) {
        console.error('Error fetching user contracts:', error);
      }
    }
    
    // If we couldn't find it in user contracts, try more specific filters
    // Use a filter that looks only for contract tag and not all kind 30023 events
    const contractTagFilter: Filter = {
      kinds: [30023],
      '#contract': [contractId]
    };
    
    console.log('Using contract tag filter:', JSON.stringify(contractTagFilter, null, 2));

    try {
      console.log('Using subscription method with longer timeout');
      const events = await new Promise<Event[]>((resolve) => {
        const collectedEvents: Event[] = [];
        const sub = this.pool.subscribeMany(
          this.relays,
          [contractTagFilter],
          {
            onevent: (event) => {
              console.log('Received event:', event.id);
              collectedEvents.push(event);
            },
            onclose: () => {
              console.log(`Subscription closed, found ${collectedEvents.length} events`);
              resolve(collectedEvents);
            }
          }
        );
        
        // Close subscription after 10 seconds to give more time for events to arrive
        setTimeout(() => {
          console.log('Closing subscription after timeout');
          sub.close();
        }, 10000);
      });
      
      if (events.length === 0) {
        console.log('No events found for this contract ID');
        return [];
      }
      
      // Filter out events with invalid JSON content to prevent UI errors
      const validEvents = (events as NostrEvent[]).filter(event => {
        try {
          // Try to parse the content as JSON
          JSON.parse(event.content);
          return true;
        } catch (error) {
          console.warn(`Filtering out event with invalid JSON content: ${event.id}`);
          console.warn('Content preview:', event.content.substring(0, 100) + '...');
          return false;
        }
      });
      
      console.log(`Returning ${validEvents.length} valid events for contract ${contractId}`);
      return validEvents;
    } catch (error) {
      console.error('Error fetching contract events:', error);
      return [];
    }
  }

  /**
   * Fetch contracts relevant to a user (as author or signatory)
   * @param pubkey The public key of the user
   * @returns Promise resolving to an array of events
   */
  async fetchUserContracts(pubkey: string): Promise<NostrEvent[]> {
    console.log(`Fetching contracts for user: ${pubkey}`);
    console.log(`User pubkey: ${pubkey}`);
    
    // Fetch contracts where the user is a signatory (tagged with their pubkey)
    const signatoryFilter: Filter = {
      kinds: [30023],
      '#p': [pubkey]
    };
    console.log('Signatory filter:', JSON.stringify(signatoryFilter, null, 2));

    // Fetch contracts authored by the user
    const authorFilter: Filter = {
      kinds: [30023],
      authors: [pubkey]
    };
    console.log('Author filter:', JSON.stringify(authorFilter, null, 2));
    
    // Use a targeted filter for contracts
    // Only look for kind:30023 events with both contract tag and our pubkey
    const contractTagFilter: Filter = {
      kinds: [30023],
      '#contract': [],  // Match any event with a contract tag, regardless of value
      authors: [pubkey] // Only match events authored by this pubkey
    };
    console.log('Contract tag filter:', JSON.stringify(contractTagFilter, null, 2));

    try {
      console.log('Using subscription method with longer timeout');
      console.log('Connecting to relays:', this.relays);
      const events = await new Promise<Event[]>((resolve) => {
        const collectedEvents: Event[] = [];
        const sub = this.pool.subscribeMany(
          this.relays,
          [authorFilter, signatoryFilter],
          {
            onevent: (event) => {
              console.log('Received user contract event:', event.id);
              console.log('Event kind:', event.kind);
              console.log('Event pubkey:', event.pubkey);
              console.log('Event tags:', JSON.stringify(event.tags, null, 2));
              
              // Check specifically for contract tag
              const contractTag = event.tags.find(tag => tag[0] === 'contract');
              if (contractTag && contractTag.length > 1) {
                console.log('Found contract tag with value:', contractTag[1]);
              } else {
                console.log('No contract tag found in this event');
              }
              
              // Check for p tags (signatories)
              const pTags = event.tags.filter(tag => tag[0] === 'p');
              if (pTags.length > 0) {
                console.log('Found p tags (signatories):', pTags.map(tag => tag[1]));
              }
              
              console.log('Event content preview:', event.content.substring(0, 100) + '...');
              collectedEvents.push(event);
            },
            onclose: () => {
              console.log(`Subscription closed, found ${collectedEvents.length} user contract events`);
              resolve(collectedEvents);
            }
          }
        );
        
        // Close subscription after 10 seconds to give more time for events to arrive
        setTimeout(() => {
          console.log('Closing user contracts subscription after timeout');
          sub.close();
        }, 10000);
      });
      
      // Group events by contract_id to get the latest version of each contract
      const contractMap = new Map<string, NostrEvent>();
      
      for (const event of events as NostrEvent[]) {
        console.log('Processing event:', event.id);
        
        // First try to get contract ID from tags
        let contractId: string | undefined;
        
        // Look for contract tag
        const contractTag = event.tags.find(tag => tag[0] === 'contract');
        if (contractTag && contractTag.length > 1) {
          contractId = contractTag[1];
          console.log('Found contract ID in tags:', contractId);
        }
        
        // If not found in tags, try to parse from content
        if (!contractId) {
          try {
            console.log('Attempting to parse content as JSON');
            const content = JSON.parse(event.content);
            if (content.contract_id) {
              contractId = content.contract_id;
              console.log('Found contract ID in content:', contractId);
            }
          } catch (error) {
            console.log('Content is not valid JSON, using event ID as contract ID');
            // Ensure event.id is a string
            if (event.id) {
              contractId = event.id;
            }
          }
        }
        
        // If we still don't have a contract ID, use the event ID
        if (!contractId) {
          console.log('No contract ID found, using event ID');
          // Ensure event.id is a string
          if (event.id) {
            contractId = event.id;
          } else {
            // Fallback to a generated ID if event.id is undefined
            contractId = `generated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            console.log('Generated fallback ID:', contractId);
          }
        }
        
        // At this point, contractId should never be undefined since we've set a fallback
        // Explicitly type as string to satisfy TypeScript
        const finalContractId: string = contractId || event.id || `generated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        console.log(`Using contract ID: ${finalContractId} for event: ${event.id}`);
        
        if (!contractMap.has(finalContractId) || 
            contractMap.get(finalContractId)!.created_at < event.created_at) {
          console.log(`Adding/updating contract ${finalContractId} in map`);
          contractMap.set(finalContractId, event);
        }
      }
      
      // Get all contracts from the map
      let userContracts = Array.from(contractMap.values());
      
      // Filter out events with invalid JSON content to prevent UI errors
      // and filter out events that don't have contract-related data
      userContracts = userContracts.filter(event => {
        try {
          // Try to parse the content as JSON
          const content = JSON.parse(event.content);
          
          // Check if this is actually a contract event
          if (!content.contract_id || !content.title || !content.signatures) {
            console.warn(`Filtering out non-contract event: ${event.id}`);
            return false;
          }
          
          // Make sure it's our kind of contract event
          const hasContractTag = event.tags.some(tag => tag[0] === 'contract');
          if (!hasContractTag) {
            console.warn(`Filtering out event without contract tag: ${event.id}`);
            return false;
          }
          
          return true;
        } catch (error) {
          console.warn(`Filtering out event with invalid JSON content: ${event.id}`);
          console.warn('Content preview:', event.content.substring(0, 100) + '...');
          return false;
        }
      });
      
      console.log(`Returning ${userContracts.length} contracts for user ${pubkey}`);
      console.log('Contract IDs:', userContracts.map(event => {
        const contractTag = event.tags.find(tag => tag[0] === 'contract');
        return contractTag && contractTag.length > 1 ? 
          contractTag[1] : 
          (event.id || `generated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      }));
      return userContracts;
    } catch (error) {
      console.error('Error fetching user contracts:', error);
      return [];
    }
  }

  /**
   * Subscribe to updates for a specific contract
   * @param contractId The contract ID to subscribe to
   * @param callback The callback to call when an update is received
   * @returns A function to unsubscribe
   */
  subscribeToContractUpdates(contractId: string, callback: () => void): () => void {
    console.log(`Subscribing to updates for contract: ${contractId}`);
    
    const filter: Filter = {
      kinds: [30023],
      '#contract': [contractId],
      since: Math.floor(Date.now() / 1000) // Only get events from now on
    };
    
    const sub = this.pool.subscribeMany(
      this.relays,
      [filter],
      {
        onevent: (event) => {
          console.log('Received contract update event:', event.id);
          callback();
        }
      }
    );
    
    const unsubscribe = () => {
      sub.close();
    };
    
    this.subscriptions.set(contractId, unsubscribe);
    return unsubscribe;
  }

  /**
   * Unsubscribe from contract updates
   * @param contractId The contract ID to unsubscribe from
   */
  unsubscribeFromContractUpdates(contractId: string): void {
    const unsubscribe = this.subscriptions.get(contractId);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(contractId);
    }
  }

  /**
   * Close all connections and subscriptions
   */
  disconnect(): void {
    // Close all subscriptions
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
    
    // Close the pool
    this.pool.close(this.relays);
  }
}

// Create a singleton instance
const nostrClient = new NostrClient();

export default nostrClient;
