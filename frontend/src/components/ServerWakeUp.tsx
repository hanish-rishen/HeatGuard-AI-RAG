import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Clock, CheckCircle, AlertCircle, Activity } from 'lucide-react';

interface ServerWakeUpProps {
  apiBaseUrl: string;
  onReady: () => void;
  onError: (error: string) => void;
}

// Helper to get base URL without /api suffix for healthcheck
const getHealthCheckUrl = (apiBaseUrl: string): string => {
  return apiBaseUrl.replace(/\/api\/?$/, '');
};

// Status messages for each phase
const statusMessages = {
  connecting: 'Connecting to server...',
  waking: 'Waking up server from sleep...',
  computing: 'Computing district rankings...',
  loading: 'Loading AI models & data...',
  finalizing: 'Finalizing results...',
  ready: 'Ready! Redirecting...',
};

export const ServerWakeUp: React.FC<ServerWakeUpProps> = ({
  apiBaseUrl,
  onReady,
  onError,
}) => {
  const [status, setStatus] = useState<'connecting' | 'waking' | 'computing' | 'loading' | 'finalizing' | 'ready'>('connecting');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [districtsLoaded, setDistrictsLoaded] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const MAX_TIME = 120; // 2 minutes max for progress bar (matches backend timeout)

  // Main polling effect
  useEffect(() => {
    let isMounted = true;
    let pollTimer: NodeJS.Timeout;
    let elapsedTimer: NodeJS.Timeout;

    const checkServer = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${getHealthCheckUrl(apiBaseUrl)}/kaithheathcheck`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();

        if (!isMounted) return;

        // Update districts count
        if (data.districts_loaded > 0) {
          setDistrictsLoaded(data.districts_loaded);
        }

        // Check if fully ready
        const isFullyReady = data.ready === true && data.data_available === true;

        if (isFullyReady) {
          setStatus('ready');
          setProgress(100);
          setIsComplete(true);
          return;
        }

        // Update status based on server state
        if (data.ready === true && !data.data_available) {
          setStatus('loading');
        } else if (data.ready === true && data.data_available === false) {
          setStatus('computing');
        } else {
          setStatus('waking');
        }

        // Continue polling
        pollTimer = setTimeout(checkServer, 500);
      } catch (err) {
        if (!isMounted) return;
        // On error, stay in current status and retry
        pollTimer = setTimeout(checkServer, 1000);
      }
    };

    // Start polling
    checkServer();

    // Elapsed time counter
    elapsedTimer = setInterval(() => {
      if (!isMounted) return;
      setElapsedTime((prev) => {
        const next = prev + 1;
        // Update progress based on elapsed time (max 60 seconds = 100%)
        setProgress(Math.min(95, (next / MAX_TIME) * 100));
        return next;
      });
    }, 1000);

    return () => {
      isMounted = false;
      clearTimeout(pollTimer);
      clearInterval(elapsedTimer);
    };
  }, [apiBaseUrl]);

  // Handle completion
  useEffect(() => {
    if (isComplete) {
      // Small delay to show "Ready" state
      const redirectTimer = setTimeout(() => {
        onReady();
      }, 800);
      return () => clearTimeout(redirectTimer);
    }
  }, [isComplete, onReady]);

  // Timeout after 2 minutes
  useEffect(() => {
    if (elapsedTime >= 120 && !isComplete) {
      setError('Server is taking longer than expected. Please try again.');
    }
  }, [elapsedTime, isComplete]);

  const handleRetry = () => {
    window.location.reload();
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'connecting':
      case 'waking':
        return <Activity className="w-5 h-5 text-[#e05d38] animate-pulse" />;
      default:
        return <Zap className="w-5 h-5 text-[#e05d38] animate-pulse" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1220] flex items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-80">
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-[#e05d38]/15 blur-3xl animate-pulse" />
        <div className="absolute bottom-[-180px] right-[-120px] w-[520px] h-[520px] rounded-full bg-orange-400/15 blur-3xl animate-pulse [animation-delay:1.4s]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(224,93,56,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(90,124,166,0.2),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,_transparent_25%,_rgba(224,93,56,0.08)_45%,_transparent_65%)] animate-[pulse_6s_ease-in-out_infinite]" />
      </div>

      <div className="max-w-md w-full mx-4 p-8 bg-gradient-to-br from-[#121a29] via-[#121a29] to-[#1b2234] border border-[#e05d38]/20 rounded-3xl shadow-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-[#e05d38]/30 animate-ping" />
            <div className="absolute inset-0 rounded-full border-2 border-[#e05d38]/20 animate-pulse" />
            <div className="relative inline-flex items-center justify-center w-16 h-16 bg-[#e05d38]/20 rounded-full border border-[#e05d38]/40">
              {status === 'ready' ? (
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              ) : (
                <Zap className="w-8 h-8 text-[#e05d38] animate-pulse" />
              )}
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {status === 'ready' ? 'Ready!' : 'HeatGuard AI'}
          </h2>
          <p className="text-gray-400 text-sm">
            {status === 'ready' 
              ? 'All systems operational' 
              : 'Initializing live risk intelligence...'}
          </p>
        </div>

        {/* Main Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(elapsedTime)} / 2 min
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-3 bg-gray-700/50 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                status === 'ready' 
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' 
                  : 'bg-gradient-to-r from-[#e05d38] via-orange-400 to-[#e05d38]'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {getStatusIcon()}
          <span className={`text-sm font-medium ${
            status === 'ready' ? 'text-emerald-400' : 'text-[#e05d38]'
          }`}>
            {statusMessages[status]}
          </span>
        </div>

        {/* Districts Count */}
        {districtsLoaded > 0 && status !== 'ready' && (
          <p className="text-xs text-gray-500 text-center mb-6">
            {districtsLoaded} districts analyzed
          </p>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-4">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold text-sm">Connection Failed</span>
            </div>
            <p className="text-red-300/80 text-sm mb-4">{error}</p>
            <button
              onClick={handleRetry}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-[#e05d38] to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white rounded-xl font-medium transition-all"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Info */}
        <div className="p-4 bg-[#1b2234]/80 border border-gray-700/30 rounded-xl">
          <p className="text-xs text-gray-500 text-center">
            Server sleeps after inactivity to save resources.
            Typical startup time is 15-30 seconds.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServerWakeUp;
