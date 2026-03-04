import React, { useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { HeatGuardAPI } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const [token, setToken] = useState(() => HeatGuardAPI.getStoredToken());
    const [checking, setChecking] = useState(true);
    const [showReauth, setShowReauth] = useState(false);
    const [verifyError, setVerifyError] = useState(false);
    
    // NEW: State for backend waking up scenario
    const [isBackendWaking, setIsBackendWaking] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 3000;

    // Listen for auth changes
    useEffect(() => {
        const handleAuth = () => setToken(HeatGuardAPI.getStoredToken());
        window.addEventListener('heatguard-auth', handleAuth);
        return () => {
            window.removeEventListener('heatguard-auth', handleAuth);
        };
    }, []);

    // NEW: Retry mechanism with useCallback so we can call it manually
    const attemptVerification = useCallback(async () => {
        try {
            // Import axios to check for specific error types
            const { default: axios } = await import('axios');
            
            const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/auth/verify`, {
                headers: {
                    'Authorization': `Bearer ${HeatGuardAPI.getStoredToken()}`
                },
                timeout: 4000
            });
            
            // Success - backend is awake and token is valid
            return { success: true, isNetworkError: false, isUnauthorized: false };
        } catch (error: any) {
            if (error.response) {
                // Server responded with an error status
                if (error.response.status === 401) {
                    // Token is invalid/expired
                    return { success: false, isNetworkError: false, isUnauthorized: true };
                }
                // Other server errors (500, 403, etc.) - treat as network/backend issues
                return { success: false, isNetworkError: true, isUnauthorized: false };
            } else if (error.request) {
                // Request was made but no response received - network error
                return { success: false, isNetworkError: true, isUnauthorized: false };
            } else {
                // Something else happened
                return { success: false, isNetworkError: true, isUnauthorized: false };
            }
        }
    }, []);

    // MODIFIED: useEffect with retry mechanism for network errors
    useEffect(() => {
        let alive = true;
        let retryTimeoutId: NodeJS.Timeout | null = null;

        const run = async () => {
            if (!token) {
                if (alive) setChecking(false);
                return;
            }

            const result = await attemptVerification();
            if (!alive) return;

            if (result.success) {
                // Auth verified successfully
                setIsBackendWaking(false);
                setRetryCount(0);
                setChecking(false);
                return;
            }

            // Handle different error types
            if (result.isUnauthorized) {
                // 401 - Session expired, don't retry
                // IMPORTANT: Only logout on actual 401 errors
                HeatGuardAPI.logout();
                setShowReauth(true);
                setChecking(false);
                return;
            }

            // Network error - backend might be waking up
            if (result.isNetworkError) {
                // Check if we should retry
                if (retryCount < MAX_RETRIES) {
                    // Set backend waking state
                    setIsBackendWaking(true);
                    setChecking(false); // Show the waking UI instead of loading spinner
                    
                    // Schedule retry
                    retryTimeoutId = setTimeout(() => {
                        if (alive) {
                            setRetryCount(prev => prev + 1);
                            // This will trigger the useEffect again due to retryCount dependency
                        }
                    }, RETRY_DELAY_MS);
                    return;
                } else {
                    // All retries exhausted - show error
                    setIsBackendWaking(false);
                    setVerifyError(true);
                    setChecking(false);
                    // IMPORTANT: Don't call logout on network errors
                    return;
                }
            }

            setChecking(false);
        };

        run();

        return () => {
            alive = false;
            if (retryTimeoutId) {
                clearTimeout(retryTimeoutId);
            }
        };
    }, [token, retryCount, attemptVerification]);

    // NEW: Manual retry handler
    const handleManualRetry = () => {
        setRetryCount(prev => prev + 1);
    };

    if (!token) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    if (checking && !isBackendWaking) {
        return null;
    }

    // NEW: Backend waking up UI
    if (isBackendWaking) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                padding: '20px',
                textAlign: 'center',
                backgroundColor: '#f8fafc'
            }}>
                <div style={{
                    maxWidth: '400px',
                    padding: '32px',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}>
                    {/* Animated spinner */}
                    <div style={{
                        width: '48px',
                        height: '48px',
                        border: '4px solid #e2e8f0',
                        borderTop: '4px solid #3b82f6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 20px'
                    }} />
                    <style>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                    
                    <h2 style={{
                        fontSize: '20px',
                        fontWeight: '600',
                        color: '#1e293b',
                        marginBottom: '12px'
                    }}>
                        Backend is waking up...
                    </h2>
                    
                    <p style={{
                        fontSize: '14px',
                        color: '#64748b',
                        marginBottom: '20px'
                    }}>
                        Please wait while we connect to the server.
                        <br />
                        This may take a few moments if the backend was idle.
                    </p>
                    
                    <p style={{
                        fontSize: '13px',
                        color: '#94a3b8',
                        marginBottom: '20px'
                    }}>
                        Attempt {retryCount} of {MAX_RETRIES}
                    </p>
                    
                    <button
                        onClick={handleManualRetry}
                        style={{
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#3b82f6',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#dbeafe';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#eff6ff';
                        }}
                    >
                        Retry Now
                    </button>
                </div>
            </div>
        );
    }

    // MODIFIED: Verify error modal with clearer messaging
    if (verifyError) {
        return (
            <ConfirmModal
                open={true}
                title="Connection Failed"
                message="We couldn't connect to the server after multiple attempts. The backend may be unavailable or experiencing issues. Please check your internet connection and try again."
                confirmText="Go to login"
                cancelText="Try again"
                variant="warning"
                onConfirm={() => {
                    // IMPORTANT: Don't call logout on network errors
                    window.location.href = '/login';
                }}
                onCancel={() => {
                    // Reset retry count and try again
                    setRetryCount(0);
                    setVerifyError(false);
                    setChecking(true);
                }}
            />
        );
    }

    if (showReauth) {
        return (
            <ConfirmModal
                open={true}
                title="Session expired"
                message="Your session is no longer valid. Please log in again."
                confirmText="Log in again"
                cancelText="Cancel"
                variant="warning"
                onConfirm={() => {
                    HeatGuardAPI.logout();
                    window.location.href = '/login';
                }}
                onCancel={() => {
                    HeatGuardAPI.logout();
                    window.location.href = '/login';
                }}
            />
        );
    }

    return <>{children}</>;
};
