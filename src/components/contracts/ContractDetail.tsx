import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Badge, Alert, Spinner, Table } from 'react-bootstrap';
import authManager from '../../services/AuthManager';
import contractManager from '../../services/ContractManager';
import nostrClient from '../../services/NostrClient';
import markdownUtils from '../../utils/MarkdownUtils';
import MarkdownPreview from '../common/MarkdownPreview';
import NsecReEntryModal from '../auth/NsecReEntryModal';
import { ContractEvent, ContractState, NostrEvent } from '../../types';

const ContractDetail: React.FC = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const [contractState, setContractState] = useState<ContractState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [showNsecModal, setShowNsecModal] = useState(false);

  useEffect(() => {
    if (!contractId) {
      setError('Contract ID is required');
      setLoading(false);
      return;
    }

    fetchContract();

    // Subscribe to contract updates
    const unsubscribe = nostrClient.subscribeToContractUpdates(
      contractId,
      () => {
        fetchContract();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [contractId]);

  const fetchContract = async () => {
    if (!contractId) return;

    try {
      // For the prototype, we'll simulate a contract if it's not found
      // This allows testing the UI without needing to connect to a real relay
      try {
        const state = await contractManager.getContractState(contractId);
        setContractState(state);
        setError(null);
      } catch (err) {
        if ((err as Error).message === 'Contract not found') {
          console.log('Contract not found, creating simulated contract for prototype');
          
          // Create a simulated contract state for the prototype
          const simulatedEvent: NostrEvent = {
            id: 'simulated_id',
            pubkey: authManager.getPubkey() || 'simulated_pubkey',
            created_at: Math.floor(Date.now() / 1000),
            kind: 30023,
            tags: [
              ['contract', contractId || 'simulated_contract_id'],
              ['title', 'Simulated Contract'],
              ['p', authManager.getPubkey() || 'simulated_pubkey']
            ],
            content: JSON.stringify({
              contract_id: contractId || 'simulated_contract_id',
              title: 'Simulated Contract',
              content: '# Simulated Contract\n\nThis is a simulated contract for testing purposes.',
              version: 1,
              created_at: Math.floor(Date.now() / 1000),
              signers_required: 2,
              signatures: []
            } as ContractEvent),
            sig: 'simulated_signature'
          };
          
          setContractState({
            latestEvent: simulatedEvent,
            allEvents: [simulatedEvent],
            hasForks: false,
            isComplete: false,
            needsUserSignature: true
          });
          setError(null);
        } else {
          setError((err as Error).message);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignContract = async () => {
    if (!contractId) return;

    // Check if user can sign (has nsec key or NIP-07)
    if (!authManager.canSign()) {
      // Show nsec re-entry modal
      setShowNsecModal(true);
      return;
    }

    setSigningInProgress(true);
    setSignError(null);

    try {
      const result = await contractManager.signContract(contractId);
      
      if (!result.success) {
        setSignError(result.message || 'Failed to sign contract');
        return;
      }
      
      // Refresh contract state
      fetchContract();
    } catch (err) {
      setSignError((err as Error).message);
    } finally {
      setSigningInProgress(false);
    }
  };

  const handleNsecSuccess = () => {
    // Re-attempt signing after successful nsec re-entry
    handleSignContract();
  };

  const handleResolveForks = async () => {
    if (!contractId || !contractState?.forks) return;

    // Check if user can sign (has nsec key or NIP-07)
    if (!authManager.canSign()) {
      // Show nsec re-entry modal
      setShowNsecModal(true);
      return;
    }

    setSigningInProgress(true);
    setSignError(null);

    try {
      await contractManager.resolveForks(contractId, contractState.forks);
      
      // Refresh contract state
      fetchContract();
    } catch (err) {
      setSignError((err as Error).message);
    } finally {
      setSigningInProgress(false);
    }
  };

  if (loading) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (error || !contractState) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          {error || 'Failed to load contract'}
        </Alert>
        <Button variant="secondary" onClick={() => navigate('/contracts')}>
          Back to Contracts
        </Button>
      </Container>
    );
  }

  const content = JSON.parse(contractState.latestEvent.content) as ContractEvent;
  const title = content.title;
  const markdownContent = content.content;
  const signatures = content.signatures;
  const signersRequired = content.signers_required;
  const isComplete = contractState.isComplete;
  const needsUserSignature = contractState.needsUserSignature;
  const hasForks = contractState.hasForks;

  return (
    <Container className="mt-4">
      <NsecReEntryModal
        show={showNsecModal}
        onHide={() => setShowNsecModal(false)}
        onSuccess={handleNsecSuccess}
        purpose="sign"
      />
      <Row className="mb-4 align-items-center">
        <Col>
          <h2>{title}</h2>
          <p className="text-muted">
            Created: {new Date(content.created_at * 1000).toLocaleString()}
          </p>
        </Col>
        <Col xs="auto">
          <div className="d-flex align-items-center">
            {isComplete ? (
              <Badge bg="success" className="me-2">Finalized</Badge>
            ) : (
              <Badge bg="warning" className="me-2">Pending</Badge>
            )}
            <Button variant="secondary" onClick={() => navigate('/contracts')}>
              Back to Contracts
            </Button>
          </div>
        </Col>
      </Row>

      {hasForks && (
        <Alert variant="warning" className="mb-4">
          <Alert.Heading>Contract has multiple versions</Alert.Heading>
          <p>
            This contract has multiple versions due to simultaneous signatures.
            You need to resolve these conflicts before proceeding.
          </p>
          <Button 
            variant="warning" 
            onClick={handleResolveForks}
            disabled={signingInProgress}
          >
            {signingInProgress ? 'Resolving...' : 'Resolve Conflicts'}
          </Button>
        </Alert>
      )}

      {signError && (
        <Alert variant="danger" className="mb-4">
          {signError}
        </Alert>
      )}

      <Row>
        <Col md={8}>
          <Card className="mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h4 className="mb-0">Contract Content</h4>
              {signatures.length === 0 && authManager.getPubkey() === contractState.latestEvent.pubkey && (
                <Button 
                  variant="outline-primary" 
                  size="sm"
                  onClick={() => navigate(`/edit/${contractId}`)}
                >
                  Edit
                </Button>
              )}
            </Card.Header>
            <Card.Body>
              <div className="markdown-content">
                <MarkdownPreview content={markdownContent} />
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>
              <h4>Signatures</h4>
            </Card.Header>
            <Card.Body>
              <p>
                <strong>Required signatures:</strong> {signatures.length} / {signersRequired}
              </p>
              
              {signatures.length > 0 ? (
                <Table striped bordered hover size="sm">
                  <thead>
                    <tr>
                      <th>Signer</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signatures.map((sig, index) => (
                      <tr key={index}>
                        <td>
                          <span title={sig.pubkey}>
                            {sig.pubkey.substring(0, 8)}...
                          </span>
                        </td>
                        <td>
                          {new Date(sig.timestamp * 1000).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="text-muted">No signatures yet</p>
              )}

              {needsUserSignature && !hasForks && (
                <Button
                  variant="success"
                  className="w-100 mt-3"
                  onClick={handleSignContract}
                  disabled={signingInProgress}
                >
                  {signingInProgress ? (
                    <>
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                        className="me-2"
                      />
                      Signing...
                    </>
                  ) : (
                    'Sign Contract'
                  )}
                </Button>
              )}
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <h4>Contract Details</h4>
            </Card.Header>
            <Card.Body>
              <p>
                <strong>Contract ID:</strong><br />
                <small className="text-muted">{content.contract_id}</small>
              </p>
              <p>
                <strong>Version:</strong> {content.version}
              </p>
              <p>
                <strong>Required Signers:</strong> {signersRequired}
              </p>
              <p>
                <strong>Status:</strong>{' '}
                {isComplete ? 'Finalized' : 'Pending Signatures'}
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ContractDetail;
