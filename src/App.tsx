import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Container, Navbar, Nav, Button, Badge } from 'react-bootstrap';
import AuthScreen from './components/auth/AuthScreen';
import ContractList from './components/contracts/ContractList';
import ContractUpload from './components/contracts/ContractUpload';
import ContractDetail from './components/contracts/ContractDetail';
import ContractEdit from './components/contracts/ContractEdit';
import authManager from './services/AuthManager';
import nostrClient from './services/NostrClient';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canSign, setCanSign] = useState(false);

  useEffect(() => {
    // Initialize Nostr client
    nostrClient.connect();

    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const isAuthenticated = authManager.loadAuthState();
        
        if (isAuthenticated) {
          // Verify that the authentication is still valid
          const pubkey = authManager.getPubkey();
          if (pubkey) {
            console.log('Authenticated with pubkey:', pubkey);
            setAuthenticated(true);
            // Check if user can sign
            setCanSign(authManager.canSign());
          } else {
            console.log('Authentication state invalid, logging out');
            authManager.logout();
            setAuthenticated(false);
            setCanSign(false);
          }
        } else {
          setAuthenticated(false);
        }
      } catch (error) {
        console.error('Authentication error:', error);
        setAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    return () => {
      // Clean up Nostr client
      nostrClient.disconnect();
    };
  }, []);

  const handleAuthenticated = () => {
    setAuthenticated(true);
    setCanSign(authManager.canSign());
  };

  const handleLogout = () => {
    authManager.logout();
    setAuthenticated(false);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <div className="app">
        {authenticated && (
          <Navbar bg="dark" variant="dark" expand="lg">
            <Container>
              <Navbar.Brand href="/">Cosigner</Navbar.Brand>
              <Navbar.Toggle aria-controls="basic-navbar-nav" />
              <Navbar.Collapse id="basic-navbar-nav">
                <Nav className="me-auto">
                  <Nav.Link href="/contracts">Contracts</Nav.Link>
                  <Nav.Link href="/upload">Upload Contract</Nav.Link>
                </Nav>
                <Nav>
                  <div className="d-flex align-items-center me-3">
                    {canSign ? (
                      <Badge bg="success" className="me-2">Fully Authenticated</Badge>
                    ) : (
                      <Badge bg="warning" className="me-2">View Only</Badge>
                    )}
                  </div>
                  <Button variant="outline-light" onClick={handleLogout}>
                    Logout
                  </Button>
                </Nav>
              </Navbar.Collapse>
            </Container>
          </Navbar>
        )}

        <div className="content">
          <Routes>
            {!authenticated ? (
              <>
                <Route 
                  path="/" 
                  element={<AuthScreen onAuthenticated={handleAuthenticated} />} 
                />
                <Route 
                  path="*" 
                  element={<Navigate to="/" replace />} 
                />
              </>
            ) : (
              <>
                <Route 
                  path="/" 
                  element={<Navigate to="/contracts" replace />} 
                />
                <Route 
                  path="/contracts" 
                  element={<ContractList onUploadClick={() => window.location.href = '/upload'} />} 
                />
                <Route 
                  path="/upload" 
                  element={<ContractUpload />} 
                />
                <Route 
                  path="/contract/:contractId" 
                  element={<ContractDetail />} 
                />
                <Route 
                  path="/contract/:contractId/sign" 
                  element={<ContractDetail />} 
                />
                <Route 
                  path="/edit/:contractId" 
                  element={<ContractEdit />} 
                />
                <Route 
                  path="*" 
                  element={<Navigate to="/contracts" replace />} 
                />
              </>
            )}
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;
