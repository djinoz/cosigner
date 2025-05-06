import React, { useState } from 'react';
import { Modal, Form, Button, Alert, Spinner } from 'react-bootstrap';
import authManager from '../../services/AuthManager';

interface NsecReEntryModalProps {
  show: boolean;
  onHide: () => void;
  onSuccess: () => void;
  purpose: 'publish' | 'sign';
}

const NsecReEntryModal: React.FC<NsecReEntryModalProps> = ({ 
  show, 
  onHide, 
  onSuccess,
  purpose
}) => {
  const [nsecKey, setNsecKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!nsecKey.trim()) {
        throw new Error('Please enter your nsec key');
      }

      authManager.reAuthenticateWithNsec(nsecKey);
      setNsecKey(''); // Clear the input for security
      onSuccess();
      onHide();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getModalTitle = () => {
    return purpose === 'publish' 
      ? 'Enter Your Private Key to Publish' 
      : 'Enter Your Private Key to Sign';
  };

  const getModalDescription = () => {
    return purpose === 'publish'
      ? 'Publishing a contract requires your private key for signing. Please re-enter your nsec key.'
      : 'Signing this contract requires your private key. Please re-enter your nsec key.';
  };

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{getModalTitle()}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{getModalDescription()}</p>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Your nsec key</Form.Label>
            <Form.Control
              type="password"
              placeholder="nsec1..."
              value={nsecKey}
              onChange={(e) => setNsecKey(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <Form.Text className="text-muted">
              Your key is never stored or transmitted.
            </Form.Text>
          </Form.Group>
          <div className="d-flex justify-content-end">
            <Button
              variant="secondary"
              onClick={onHide}
              className="me-2"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={loading}
            >
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
                  Verifying...
                </>
              ) : (
                'Submit'
              )}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
};

export default NsecReEntryModal;
