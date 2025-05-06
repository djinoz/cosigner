import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert } from 'react-bootstrap';
import authManager from '../../services/AuthManager';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [nsecKey, setNsecKey] = useState('');
  const [hasNip07, setHasNip07] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if NIP-07 extension is available
    const checkNip07 = async () => {
      const available = await authManager.checkForNip07();
      setHasNip07(available);
    };

    // Check if user is already authenticated
    const checkAuth = () => {
      if (authManager.isAuthenticated()) {
        onAuthenticated();
      }
    };

    checkNip07();
    checkAuth();
  }, [onAuthenticated]);

  const handleNsecSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!nsecKey.trim()) {
        throw new Error('Please enter a valid nsec key');
      }

      authManager.connectWithNsec(nsecKey);
      onAuthenticated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleNip07Connect = async () => {
    setError(null);
    setLoading(true);

    try {
      await authManager.connectWithNip07();
      onAuthenticated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = () => {
    setError(null);
    setLoading(true);

    try {
      const pubkey = authManager.generateKeypair();
      onAuthenticated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={6}>
          <Card>
            <Card.Header as="h4" className="text-center">
              Sign In to Cosigner
            </Card.Header>
            <Card.Body>
              {error && <Alert variant="danger">{error}</Alert>}

              {hasNip07 && (
                <div className="mb-4">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-100"
                    onClick={handleNip07Connect}
                    disabled={loading}
                  >
                    {loading ? 'Connecting...' : 'Connect with Extension (NIP-07)'}
                  </Button>
                  <div className="text-center mt-2">
                    <small className="text-muted">
                      Use your Nostr browser extension (Alby, nos2x, etc.)
                    </small>
                  </div>
                </div>
              )}

              <div className="text-center my-3">
                <span className="divider-text">OR</span>
              </div>

              <Form onSubmit={handleNsecSubmit}>
                <Form.Group>
                  <Form.Label>Enter your nsec key</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="nsec1..."
                    value={nsecKey}
                    onChange={(e) => setNsecKey(e.target.value)}
                    disabled={loading}
                  />
                  <Form.Text className="text-muted">
                    Your key is never stored or transmitted.
                  </Form.Text>
                </Form.Group>

                <Button
                  variant="secondary"
                  type="submit"
                  className="mt-3 w-100"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In with nsec'}
                </Button>
              </Form>

              <div className="text-center my-3">
                <span className="divider-text">OR</span>
              </div>

              <Button
                variant="outline-secondary"
                className="w-100"
                onClick={handleGenerateKey}
                disabled={loading}
              >
                Generate a new key (for testing only)
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AuthScreen;
