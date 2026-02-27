import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { HeatGuardAPI } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const [token, setToken] = useState(() => HeatGuardAPI.getStoredToken());
    const [checking, setChecking] = useState(true);
    const [showReauth, setShowReauth] = useState(false);
    const [verifyError, setVerifyError] = useState(false);

    useEffect(() => {
        const handleAuth = () => setToken(HeatGuardAPI.getStoredToken());
        window.addEventListener('heatguard-auth', handleAuth);
        return () => {
            window.removeEventListener('heatguard-auth', handleAuth);
        };
    }, []);

    useEffect(() => {
        let alive = true;
        const run = async () => {
            if (!token) {
                if (alive) setChecking(false);
                return;
            }
            const ok = await HeatGuardAPI.verifyAuth();
            if (!alive) return;
            if (!ok) {
                if (!HeatGuardAPI.getStoredToken()) {
                    HeatGuardAPI.logout();
                    setShowReauth(true);
                } else {
                    setVerifyError(true);
                }
            }
            setChecking(false);
        };
        run();
        return () => {
            alive = false;
        };
    }, [token]);

    if (!token) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    if (checking) {
        return null;
    }

    if (verifyError) {
        return (
            <ConfirmModal
                open={true}
                title="Cannot verify session"
                message="We could not reach the server to validate your session. Please refresh or log in again."
                confirmText="Go to login"
                cancelText="Refresh"
                variant="warning"
                onConfirm={() => {
                    HeatGuardAPI.logout();
                    window.location.href = '/login';
                }}
                onCancel={() => {
                    window.location.reload();
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
