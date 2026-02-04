import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LogConsole } from './components/LogConsole';
import Dashboard from './pages/Dashboard';
import { RankingsPage } from './pages/RankingsPage';
import { DistrictRanking } from './api';

const MainApp: React.FC = () => {
    // Global State
    const [logs, setLogs] = useState<string[]>([]);
    // const [isLoading, setIsLoading] = useState<boolean>(true); // Removed global loading blocker
    const [rankings, setRankings] = useState<DistrictRanking[]>([]);
    const [rankingsLoading, setRankingsLoading] = useState<boolean>(true);

    const hasInitializedRef = useRef(false);

    // Initial Data Fetch with Text Stream
    useEffect(() => {
        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;

        const connectToStream = async () => {
             const eventSource = new EventSource('http://localhost:8000/api/districts/rankings');

             eventSource.onopen = () => {
                 console.log("Connection opened");
                 setLogs(prev => [...prev, "> Establish secure connection with core servers...", "> Connection established."]);
             }

             eventSource.onmessage = (event) => {
                 try {
                     const data = JSON.parse(event.data);

                     if (data.type === 'log') {
                         setLogs(prev => [...prev, `> ${data.message}`]);
                     } else if (data.type === 'result') {
                         console.log("Received Result", data.data);
                         setRankings(data.data.rankings);

                         setLogs(prev => [...prev, "> Data acquisition complete.", "> Updating Dashboard metrics..."]);

                         // Delay removing the logs to let the user see the completion message
                         setTimeout(() => {
                             setRankingsLoading(false);
                             eventSource.close();
                         }, 1500);

                     } else if (data.type === 'complete') {
                         // Some streams may emit a completion event even if result was already sent.
                         // Ensure we stop any processing animations regardless.
                         setLogs(prev => [...prev, "> Data stream complete."]);
                         setRankingsLoading(false);
                         eventSource.close();

                     } else if (data.type === 'error') {
                         setLogs(prev => [...prev, `> ERROR: ${data.message}`]);
                         eventSource.close();
                         setRankingsLoading(false); // Stop loading on error
                     }
                 } catch (e) {
                     console.error("Error parsing event", e);
                 }
             };

             eventSource.onerror = (err) => {
                 console.error("EventSource failed:", err);
                 eventSource.close();
                 setRankingsLoading(false);
             };
        };

        connectToStream();
    }, []);

    // Removed the full screen loading condition
    /*if (isLoading) {
        return <LogConsole logs={logs} />;
    }*/

    return (
        <Router>
            <Routes>
                <Route path="/" element={<Dashboard rankings={rankings} rankingsLoading={rankingsLoading} logs={logs} />} />
                <Route path="/rankings" element={<RankingsPage rankings={rankings} loading={rankingsLoading} />} />
            </Routes>
        </Router>
    );
};

export default MainApp;
