import React, { useState, useRef, ChangeEvent } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import authManager from '../../services/AuthManager';
import contractManager from '../../services/ContractManager';
import markdownUtils from '../../utils/MarkdownUtils';
import MarkdownPreview from '../common/MarkdownPreview';
import NsecReEntryModal from '../auth/NsecReEntryModal';

const ContractUpload: React.FC = () => {
  const [markdownContent, setMarkdownContent] = useState('');
  const [title, setTitle] = useState('');
  const [signatories, setSignatories] = useState<string[]>(['']);
  const [signersRequired, setSignersRequired] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [showNsecModal, setShowNsecModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setMarkdownContent(content);
      
      // Try to extract title from markdown
      const extractedTitle = markdownUtils.extractTitle(content);
      if (extractedTitle) {
        setTitle(extractedTitle);
      }
    };
    reader.readAsText(file);
  };

  const handleAddSignatory = () => {
    setSignatories([...signatories, '']);
  };

  const handleRemoveSignatory = (index: number) => {
    const newSignatories = [...signatories];
    newSignatories.splice(index, 1);
    setSignatories(newSignatories);
    
    // Adjust signers required if needed
    if (signersRequired > newSignatories.length) {
      setSignersRequired(newSignatories.length);
    }
  };

  const handleSignatoryChange = (index: number, value: string) => {
    const newSignatories = [...signatories];
    newSignatories[index] = value;
    setSignatories(newSignatories);
  };

  const togglePreview = () => {
    setPreview(!preview);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Check if user can sign (has nsec key or NIP-07)
      if (!authManager.canSign()) {
        // Show nsec re-entry modal
        setShowNsecModal(true);
        setLoading(false);
        return;
      }
      // Validate inputs
      if (!markdownContent.trim()) {
        throw new Error('Contract content is required');
      }

      if (!title.trim()) {
        throw new Error('Title is required');
      }

      // Filter out empty signatories
      const validSignatories = signatories.filter(s => s.trim() !== '');
      
      if (validSignatories.length === 0) {
        throw new Error('At least one signatory is required');
      }

      if (signersRequired < 1 || signersRequired > validSignatories.length) {
        throw new Error(`Signers required must be between 1 and ${validSignatories.length}`);
      }

      // Add current user's pubkey if not already included
      const currentPubkey = authManager.getPubkey();
      if (!currentPubkey) {
        throw new Error('Not authenticated');
      }

      if (!validSignatories.includes(currentPubkey)) {
        validSignatories.push(currentPubkey);
      }

      // Create contract
      const contractId = await contractManager.createContract(
        markdownContent,
        title,
        validSignatories,
        signersRequired
      );

      // Navigate to the contract view
      navigate(`/contract/${contractId}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const handleNsecSuccess = () => {
    // Re-attempt the contract creation after successful nsec re-entry
    handleSubmit({ preventDefault: () => {} } as React.FormEvent);
  };

  return (
    <Container className="mt-4">
      <NsecReEntryModal
        show={showNsecModal}
        onHide={() => setShowNsecModal(false)}
        onSuccess={handleNsecSuccess}
        purpose="publish"
      />
      <Row className="justify-content-center">
        <Col md={10}>
          <Card>
            <Card.Header as="h4">Upload Contract</Card.Header>
            <Card.Body>
              {error && <Alert variant="danger">{error}</Alert>}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Upload Markdown Document</Form.Label>
                  <Form.Control
                    type="file"
                    accept=".md,.markdown,.txt"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                  />
                  <Form.Text className="text-muted">
                    Upload a markdown (.md) file containing your contract
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Contract Title</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter contract title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Contract Content</Form.Label>
                  <div className="d-flex justify-content-end mb-2">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={togglePreview}
                    >
                      {preview ? 'Edit' : 'Preview'}
                    </Button>
                  </div>
                  
                  {preview ? (
                    <Card className="p-3 markdown-preview">
                      <MarkdownPreview content={markdownContent} />
                    </Card>
                  ) : (
                    <Form.Control
                      as="textarea"
                      rows={10}
                      placeholder="Enter or paste contract content in markdown format"
                      value={markdownContent}
                      onChange={(e) => setMarkdownContent(e.target.value)}
                      required
                    />
                  )}
                </Form.Group>

                <h5 className="mt-4">Signatories</h5>
                <p className="text-muted small">
                  Enter the Nostr public keys (npub) of all required signatories
                </p>

                {signatories.map((signatory, index) => (
                  <Form.Group key={index} className="mb-3">
                    <div className="d-flex">
                      <Form.Control
                        type="text"
                        placeholder="npub..."
                        value={signatory}
                        onChange={(e) => handleSignatoryChange(index, e.target.value)}
                      />
                      {signatories.length > 1 && (
                        <Button
                          variant="outline-danger"
                          className="ms-2"
                          onClick={() => handleRemoveSignatory(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </Form.Group>
                ))}

                <Button
                  variant="outline-primary"
                  className="mb-4"
                  onClick={handleAddSignatory}
                >
                  Add Signatory
                </Button>

                <Form.Group className="mb-4">
                  <Form.Label>Minimum Signatures Required</Form.Label>
                  <div className="d-flex align-items-center">
                    <Button
                      variant="outline-secondary"
                      onClick={() => setSignersRequired(Math.max(1, signersRequired - 1))}
                      disabled={signersRequired <= 1}
                    >
                      -
                    </Button>
                    <Form.Control
                      type="number"
                      min={1}
                      max={signatories.length}
                      value={signersRequired}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 1 && value <= signatories.length) {
                          setSignersRequired(value);
                        }
                      }}
                      className="mx-2 text-center"
                      style={{ width: '80px' }}
                    />
                    <Button
                      variant="outline-secondary"
                      onClick={() => setSignersRequired(Math.min(signatories.length, signersRequired + 1))}
                      disabled={signersRequired >= signatories.length}
                    >
                      +
                    </Button>
                  </div>
                  <Form.Text className="text-muted">
                    How many signatures are needed for the contract to be considered finalized
                  </Form.Text>
                </Form.Group>

                <div className="d-flex justify-content-between">
                  <Button variant="secondary" onClick={() => navigate('/contracts')}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        Publishing...
                      </>
                    ) : (
                      'Publish Contract'
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ContractUpload;
