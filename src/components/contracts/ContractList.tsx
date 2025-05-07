import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Badge, Form, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import authManager from '../../services/AuthManager';
import contractManager from '../../services/ContractManager';
import nostrClient from '../../services/NostrClient';
import markdownUtils from '../../utils/MarkdownUtils';
import { ContractEvent, NostrEvent, UserProfile } from '../../types';

interface ContractListProps {
  onUploadClick: () => void;
}

type FilterStatus = 'needs_signature' | 'signed' | 'finalized' | 'all';

const ContractList: React.FC<ContractListProps> = ({ onUploadClick }) => {
  const [contracts, setContracts] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());

  useEffect(() => {
    // Load user preferences from localStorage
    const loadPreferences = () => {
      const savedFilter = localStorage.getItem('filterStatus');
      const savedSort = localStorage.getItem('sortOrder');
      
      if (savedFilter) {
        setFilterStatus(savedFilter as FilterStatus);
      }
      
      if (savedSort) {
        setSortOrder(savedSort as 'newest' | 'oldest');
      }
    };
    
    loadPreferences();
    fetchContracts();
  }, []);

  // Effect to fetch user profiles when contracts change
  useEffect(() => {
    if (contracts.length > 0) {
      fetchUserProfiles();
    }
  }, [contracts]);

  // Fetch user profiles for all signers in all contracts
  const fetchUserProfiles = async () => {
    const pubkeysToFetch = new Set<string>();
    
    // Collect all pubkeys from contracts
    for (const contract of contracts) {
      // Add contract creator
      pubkeysToFetch.add(contract.pubkey);
      
      // Add signatories from p tags
      for (const tag of contract.tags) {
        if (tag[0] === 'p' && tag[1]) {
          pubkeysToFetch.add(tag[1]);
        }
      }
      
      // Add signers from signatures
      try {
        const content = JSON.parse(contract.content) as ContractEvent;
        for (const signature of content.signatures) {
          if (signature.pubkey) {
            pubkeysToFetch.add(signature.pubkey);
          }
        }
      } catch (error) {
        console.warn('Error parsing contract content:', error);
      }
    }
    
    // Fetch profiles if we have pubkeys
    if (pubkeysToFetch.size > 0) {
      try {
        const profiles = await nostrClient.fetchUserProfiles(Array.from(pubkeysToFetch));
        setUserProfiles(profiles);
      } catch (error) {
        console.error('Error fetching user profiles:', error);
      }
    }
  };

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem('filterStatus', filterStatus);
    localStorage.setItem('sortOrder', sortOrder);
  }, [filterStatus, sortOrder]);

  const fetchContracts = async () => {
    setLoading(true);
    
    try {
      const pubkey = authManager.getPubkey();
      if (!pubkey) {
        throw new Error('Not authenticated');
      }
      
      const userContracts = await nostrClient.fetchUserContracts(pubkey);
      
      // For the prototype, if no contracts are found, create some simulated ones
      if (userContracts.length === 0) {
        console.log('No contracts found, creating simulated contracts for prototype');
        
        // Create simulated contracts
        const simulatedContracts: NostrEvent[] = [
          {
            id: 'simulated_id_1',
            pubkey: pubkey,
            created_at: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
            kind: 30023,
            tags: [
              ['contract', 'simulated_contract_id_1'],
              ['title', 'Freelance Development Agreement'],
              ['p', pubkey]
            ],
            content: JSON.stringify({
              contract_id: 'simulated_contract_id_1',
              title: 'Freelance Development Agreement',
              content: '# Freelance Development Agreement\n\nThis is a simulated contract for testing purposes.',
              version: 1,
              created_at: Math.floor(Date.now() / 1000) - 86400,
              signers_required: 2,
              signatures: [{
                pubkey: pubkey,
                sig: 'simulated_signature',
                timestamp: Math.floor(Date.now() / 1000) - 86400
              }]
            } as ContractEvent),
            sig: 'simulated_signature'
          },
          {
            id: 'simulated_id_2',
            pubkey: 'other_pubkey',
            created_at: Math.floor(Date.now() / 1000) - 172800, // 2 days ago
            kind: 30023,
            tags: [
              ['contract', 'simulated_contract_id_2'],
              ['title', 'Non-Disclosure Agreement'],
              ['p', pubkey],
              ['p', 'other_pubkey']
            ],
            content: JSON.stringify({
              contract_id: 'simulated_contract_id_2',
              title: 'Non-Disclosure Agreement',
              content: '# Non-Disclosure Agreement\n\nThis is a simulated NDA for testing purposes.',
              version: 1,
              created_at: Math.floor(Date.now() / 1000) - 172800,
              signers_required: 2,
              signatures: []
            } as ContractEvent),
            sig: 'simulated_signature'
          }
        ];
        
        setContracts(simulatedContracts);
      } else {
        setContracts(userContracts);
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
      
      // For the prototype, create simulated contracts on error
      console.log('Error fetching contracts, creating simulated contracts for prototype');
      const pubkey = authManager.getPubkey() || 'simulated_pubkey';
      
      // Create simulated contracts
      const simulatedContracts: NostrEvent[] = [
        {
          id: 'simulated_id_1',
          pubkey: pubkey,
          created_at: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
          kind: 30023,
          tags: [
            ['contract', 'simulated_contract_id_1'],
            ['title', 'Freelance Development Agreement'],
            ['p', pubkey]
          ],
          content: JSON.stringify({
            contract_id: 'simulated_contract_id_1',
            title: 'Freelance Development Agreement',
            content: '# Freelance Development Agreement\n\nThis is a simulated contract for testing purposes.',
            version: 1,
            created_at: Math.floor(Date.now() / 1000) - 86400,
            signers_required: 2,
            signatures: [{
              pubkey: pubkey,
              sig: 'simulated_signature',
              timestamp: Math.floor(Date.now() / 1000) - 86400
            }]
          } as ContractEvent),
          sig: 'simulated_signature'
        },
        {
          id: 'simulated_id_2',
          pubkey: 'other_pubkey',
          created_at: Math.floor(Date.now() / 1000) - 172800, // 2 days ago
          kind: 30023,
          tags: [
            ['contract', 'simulated_contract_id_2'],
            ['title', 'Non-Disclosure Agreement'],
            ['p', pubkey],
            ['p', 'other_pubkey']
          ],
          content: JSON.stringify({
            contract_id: 'simulated_contract_id_2',
            title: 'Non-Disclosure Agreement',
            content: '# Non-Disclosure Agreement\n\nThis is a simulated NDA for testing purposes.',
            version: 1,
            created_at: Math.floor(Date.now() / 1000) - 172800,
            signers_required: 2,
            signatures: []
          } as ContractEvent),
          sig: 'simulated_signature'
        }
      ];
      
      setContracts(simulatedContracts);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredContracts = () => {
    if (!contracts.length) return [];
    
    const pubkey = authManager.getPubkey();
    if (!pubkey) return [];
    
    let filtered = [...contracts];
    
    // Apply filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(event => {
        const content = JSON.parse(event.content) as ContractEvent;
        
        switch (filterStatus) {
          case 'needs_signature':
            // Check if user is a signatory but hasn't signed yet
            return event.tags.some(tag => tag[0] === 'p' && tag[1] === pubkey) &&
              !content.signatures.some(sig => sig.pubkey === pubkey);
          
          case 'signed':
            // Check if user has signed
            return content.signatures.some(sig => sig.pubkey === pubkey);
          
          case 'finalized':
            // Check if contract has enough signatures
            return content.signatures.length >= content.signers_required;
          
          default:
            return true;
        }
      });
    }
    
    // Apply sort
    filtered.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.created_at - a.created_at;
      } else {
        return a.created_at - b.created_at;
      }
    });
    
    return filtered;
  };

  const getContractStatus = (event: NostrEvent) => {
    const pubkey = authManager.getPubkey();
    if (!pubkey) return 'unknown';
    
    const content = JSON.parse(event.content) as ContractEvent;
    
    if (content.signatures.length >= content.signers_required) {
      return 'finalized';
    }
    
    if (content.signatures.some(sig => sig.pubkey === pubkey)) {
      return 'signed';
    }
    
    if (event.tags.some(tag => tag[0] === 'p' && tag[1] === pubkey)) {
      return 'needs_signature';
    }
    
    return 'other';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'finalized':
        return <Badge bg="success">Finalized</Badge>;
      
      case 'signed':
        return <Badge bg="info">Signed by you</Badge>;
      
      case 'needs_signature':
        return <Badge bg="warning">Needs your signature</Badge>;
      
      default:
        return <Badge bg="secondary">Pending</Badge>;
    }
  };

  const getContractTitle = (event: NostrEvent) => {
    // First check if there's a title tag
    const titleTag = event.tags.find(tag => tag[0] === 'title');
    if (titleTag && titleTag[1]) {
      return titleTag[1];
    }
    
    // Otherwise parse from content
    const content = JSON.parse(event.content) as ContractEvent;
    return content.title || 'Untitled Contract';
  };

  const getContractPreview = (event: NostrEvent) => {
    const content = JSON.parse(event.content) as ContractEvent;
    return markdownUtils.getPreview(content.content);
  };

  const getContractId = (event: NostrEvent) => {
    const content = JSON.parse(event.content) as ContractEvent;
    return content.contract_id;
  };

  // Helper function to get the display name for a pubkey
  const getDisplayName = (pubkey: string): string => {
    const profile = userProfiles.get(pubkey);
    if (!profile) return pubkey.substring(0, 8) + '...';
    
    // Prefer NIP-05, then username, then displayName
    if (profile.nip05) return profile.nip05;
    if (profile.name) return profile.name;
    if (profile.displayName) return profile.displayName;
    
    // Default to shortened pubkey
    return pubkey.substring(0, 8) + '...';
  };

  // Get signers for a contract
  const getContractSigners = (event: NostrEvent) => {
    try {
      const content = JSON.parse(event.content) as ContractEvent;
      return content.signatures.map(sig => sig.pubkey);
    } catch (error) {
      return [];
    }
  };

  const filteredContracts = getFilteredContracts();

  return (
    <Container className="mt-4">
      <Row className="mb-4 align-items-center">
        <Col>
          <h2>Contracts</h2>
        </Col>
        <Col xs="auto">
          <Button variant="primary" onClick={onUploadClick}>
            Upload Contract
          </Button>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Filter by status</Form.Label>
            <Form.Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            >
              <option value="all">All Contracts</option>
              <option value="needs_signature">Needs My Signature</option>
              <option value="signed">Signed by Me</option>
              <option value="finalized">Finalized</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Sort by</Form.Label>
            <Form.Select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      {loading ? (
        <div className="text-center my-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      ) : filteredContracts.length === 0 ? (
        <Card className="text-center p-5">
          <Card.Body>
            <h4>No contracts found</h4>
            <p className="text-muted">
              {filterStatus !== 'all'
                ? 'Try changing your filter settings'
                : 'Upload a contract to get started'}
            </p>
            <Button variant="primary" onClick={onUploadClick}>
              Upload Contract
            </Button>
          </Card.Body>
        </Card>
      ) : (
        filteredContracts.map((contract) => {
          const status = getContractStatus(contract);
          const contractId = getContractId(contract);
          
          return (
            <Card key={contract.id || contractId} className="mb-3">
              <Card.Body>
                <Row>
                  <Col md={8}>
                    <h5>{getContractTitle(contract)}</h5>
                    <p className="text-muted small">
                      {new Date(contract.created_at * 1000).toLocaleString()}
                    </p>
                    <p>{getContractPreview(contract)}</p>
                    
                    {/* Display signers */}
                    {(() => {
                      const signers = getContractSigners(contract);
                      if (signers.length > 0) {
                        return (
                          <div className="mt-2">
                            <small className="text-muted">
                              Signed by: {signers.map((pubkey, index) => (
                                <OverlayTrigger
                                  key={pubkey}
                                  placement="top"
                                  overlay={
                                    <Tooltip id={`tooltip-${pubkey}`}>
                                      {pubkey}
                                      <div className="mt-1">
                                        <Button 
                                          size="sm" 
                                          variant="light" 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(pubkey);
                                          }}
                                        >
                                          Copy to clipboard
                                        </Button>
                                      </div>
                                    </Tooltip>
                                  }
                                >
                                  <span className="badge bg-light text-dark me-1">
                                    {getDisplayName(pubkey)}
                                  </span>
                                </OverlayTrigger>
                              ))}
                            </small>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </Col>
                  <Col md={4} className="d-flex flex-column align-items-end justify-content-between">
                    <div>{getStatusBadge(status)}</div>
                    <div className="mt-3">
                      <Link to={`/contract/${contractId}`}>
                        <Button variant="outline-primary" size="sm" className="me-2">
                          View
                        </Button>
                      </Link>
                      {status === 'needs_signature' && (
                        <Link to={`/contract/${contractId}/sign`}>
                          <Button variant="success" size="sm">
                            Sign
                          </Button>
                        </Link>
                      )}
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          );
        })
      )}
    </Container>
  );
};

export default ContractList;
