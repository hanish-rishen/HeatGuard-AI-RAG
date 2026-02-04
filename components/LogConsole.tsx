import React, { useRef } from 'react';
import { Terminal, Loader2 } from 'lucide-react';

interface LogConsoleProps {
  logs: string[];
  embedded?: boolean;
  loading?: boolean;
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs, embedded = false, loading = false }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  const containerClasses = embedded
    ? "w-full h-full min-h-[300px] bg-black border border-green-900/50 rounded-xl overflow-hidden flex flex-col font-mono text-sm"
    : "w-full max-w-4xl bg-black border border-green-900 rounded-lg shadow-2xl overflow-hidden flex flex-col h-[600px]";

  const wrapperClasses = embedded
    ? "col-span-1 md:col-span-2"
    : "h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4";

  return (
    <div className={wrapperClasses}>
      <div className={containerClasses}>
        {/* Header */}
        <div className="bg-slate-900 px-4 py-2 border-b border-green-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-500">
            <Terminal size={18} />
            <span className="font-mono text-xs md:text-sm font-bold">HeatGuard AI System Initialization</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="animate-pulse h-2 w-2 rounded-full bg-green-500"></span>
            <span className="text-[10px] md:text-xs font-mono text-green-500/70">LIVE STREAM</span>
          </div>
        </div>

        {/* Logs Area */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs md:text-sm space-y-1 scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-transparent">
          {logs.length === 0 && (
            <div className="text-green-500/50 italic">Initializing connection to predictive engine...</div>
          )}

          {logs.map((log, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="text-green-700 min-w-[20px] select-none">{'>'}</span>
              <span className="text-green-400 break-words font-light tracking-wide">{log}</span>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-green-500 mt-4 animate-pulse">
              <Loader2 size={16} className="animate-spin" />
              <span>Processing...</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="bg-slate-900/50 px-4 py-1 border-t border-green-900/50 text-[10px] text-green-700 font-mono text-right">
          SYSTEM_STATUS: ACTIVE | MISTRAL_AI: CONNECTED
        </div>
      </div>
    </div>
  );
};
