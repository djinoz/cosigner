import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import authManager from '../../services/AuthManager';
import contractManager from '../../services/ContractManager';
import nostrClient from '../../services/NostrClient';
import MarkdownPreview from '../common/MarkdownPreview';
import { ContractEvent, ContractState } from '../../types';

const ContractEdit: React.FC = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [originalEvent, setOriginalEvent] = useState<any>(null);
  
  useEffect(() => {
    if (!contractId) {
      setError('Contract ID is required');
      setLoading(false);
      return;
    }
    
    loadContract();
  }, [contractId]);
  
  const loadContract = async () => {
    if (!contractId) return;
    
    try {
      const state = await contractManager.getContractState(contractId);
      const content = JSON.parse(state.latestEvent.content) as ContractEvent;
      
      // Check if contract is editable (has no signatures)
      if (content.signatures.length > 0) {
        setError('This contract cannot be edited because it already has signatures.');
        setLoading(false);
        return;
      }
      
      // Check if current user is the author
      const currentPubkey = authManager.getPubkey();
      if (currentPubkey !== state.latestEvent.pubkey) {
        setError('You can only edit contracts that you created.');
        setLoading(false);
        return;
      }
      
      setTitle(content.title);
      setContent(content.content);
      setOriginalEvent(state.latestEvent);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSave = async () => {
    if (!contractId || !originalEvent) return;
    
    setSaving(true);
    setSaveError(null);
    
    try {
      // Update the contract with the edited content
      const success = await contractManager.updateContractContent(
        contractId,
        title,
        content
      );
      
      if (success) {
        // Navigate back to the contract view
        navigate(`/contract/${contractId}`);
      } else {
        setSaveError('Failed to update contract');
      }
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  
  const togglePreview = () => setShowPreview(!showPreview);
  
  if (loading) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          {error}
        </Alert>
        <Button variant="secondary" onClick={() => navigate(`/contract/${contractId}`)}>
          Back to Contract
        </Button>
      </Container>
    );
  }
  
  return (
    <Container className="mt-4">
      <Row className="mb-4 align-items-center">
        <Col>
          <h2>Edit Contract</h2>
        </Col>
        <Col xs="auto">
          <Button 
            variant="outline-secondary" 
            className="me-2" 
            onClick={togglePreview}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => navigate(`/contract/${contractId}`)}
          >
            Cancel
          </Button>
        </Col>
      </Row>
      
      {saveError && (
        <Alert variant="danger" className="mb-4">
          {saveError}
        </Alert>
      )}
      
      <Form>
        <Form.Group className="mb-3">
          <Form.Label>Contract Title</Form.Label>
          <Form.Control 
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={showPreview}
          />
        </Form.Group>
        
        {showPreview ? (
          <Card className="mb-4">
            <Card.Header>
              <h4>Preview</h4>
            </Card.Header>
            <Card.Body>
              <div className="markdown-content">
                <MarkdownPreview content={content} />
              </div>
            </Card.Body>
          </Card>
        ) : (
          <Form.Group className="mb-3">
            <Form.Label>Contract Content (Markdown)</Form.Label>
            <Form.Control 
              as="textarea" 
              rows={15}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <Form.Text className="text-muted">
              You can use Markdown formatting in your contract.
            </Form.Text>
          </Form.Group>
        )}
        
        <div className="d-flex justify-content-end">
          <Button 
            variant="primary" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-2"
                />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </Form>
    </Container>
  );
};

export default ContractEdit;