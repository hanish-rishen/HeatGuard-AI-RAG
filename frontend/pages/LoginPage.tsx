import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Zap, Lock } from 'lucide-react';
import { HeatGuardAPI } from '../api';
import { ServerWakeUp } from '../src/components/ServerWakeUp';

// Get API base URL for server wake-up check
const getApiBaseUrl = (): string => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl) {
        return envUrl;
    }
    if (typeof window !== 'undefined') {
        const { protocol, hostname } = window.location;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            return `${protocol}//${hostname}/api`;
        }
    }
    return 'http://localhost:8000/api';
};

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showWakeUp, setShowWakeUp] = useState(false);
    const [wakeUpError, setWakeUpError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await HeatGuardAPI.login(username.trim(), password);
            // Show server wake-up screen instead of immediately navigating
            setShowWakeUp(true);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Login failed. Check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleServerReady = () => {
        // Server is awake and ready, navigate to dashboard
        navigate('/');
    };

    const handleServerError = (error: string) => {
        setWakeUpError(error);
        // Still navigate after error - user can retry from dashboard if needed
        setTimeout(() => {
            navigate('/');
        }, 3000);
    };

    // Show server wake-up screen after successful login
    if (showWakeUp) {
        return (
            <ServerWakeUp
                apiBaseUrl={getApiBaseUrl()}
                onReady={handleServerReady}
                onError={handleServerError}
            />
        );
    }

    return (
        <div className="min-h-screen bg-[#0b1220] flex items-center justify-center px-6 py-12 relative overflow-hidden">
            <div className="absolute inset-0 opacity-80">
                <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-primary/15 blur-3xl animate-pulse" />
                <div className="absolute bottom-[-180px] right-[-120px] w-[520px] h-[520px] rounded-full bg-orange-400/15 blur-3xl animate-pulse [animation-delay:1.4s]" />
                <div className="absolute top-24 right-32 w-64 h-64 rounded-full bg-emerald-400/10 blur-2xl animate-pulse [animation-delay:0.7s]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(224,93,56,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(90,124,166,0.2),_transparent_60%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(120deg,_transparent_25%,_rgba(224,93,56,0.08)_45%,_transparent_65%)] animate-[pulse_6s_ease-in-out_infinite]" />
                <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#ffffff26_1px,_transparent_1px)] [background-size:18px_18px]" />
            </div>

            <div className="w-full max-w-5xl bg-card text-card-foreground border border-border/60 rounded-3xl shadow-3d overflow-hidden grid md:grid-cols-[1.1fr_0.9fr] relative">
                <div className="p-10 bg-gradient-to-br from-[#121a29] via-[#121a29] to-[#1b2234] border-b md:border-b-0 md:border-r border-border/40">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="relative w-12 h-12 flex items-center justify-center bg-gradient-to-br from-primary to-orange-400 rounded-xl shadow-lg border-2 border-white/20">
                            <Shield className="text-primary-foreground absolute w-6 h-6" />
                            <Zap className="text-white absolute w-3 h-3 -top-1 -right-1 fill-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">HeatGuard AI</h1>
                            <p className="text-xs text-gray-400 font-bold tracking-wider">SECURE ACCESS</p>
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold text-white leading-tight">
                        Protecting districts with live risk intelligence.
                    </h2>
                    <p className="text-sm text-muted-foreground/80 mt-4 max-w-md">
                        Sign in to unlock predictive dashboards, risk maps, and operational protocols tailored to your district.
                    </p>
                    <div className="mt-10 grid gap-4 text-sm text-muted-foreground/80">
                        <div className="flex items-start gap-3">
                            <span className="w-2 h-2 rounded-full bg-primary mt-2" />
                            <span>Live district rankings and alerts with AI-supported guidance.</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="w-2 h-2 rounded-full bg-orange-400 mt-2" />
                            <span>Secure access tokens protect your operational workflows.</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 mt-2" />
                            <span>Exportable reports for leadership and emergency response.</span>
                        </div>
                    </div>
                </div>

                <div className="p-10">
                    <h2 className="text-lg font-semibold text-foreground">Sign in to Dashboard</h2>
                    <p className="text-sm text-muted-foreground/80 mt-1">
                        Use your admin credentials to access analytics and controls.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-3d-sm transition-opacity flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
                        >
                            {loading ? <span className="animate-spin">⌛</span> : <Lock size={16} />}
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
