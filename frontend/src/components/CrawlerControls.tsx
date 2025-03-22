import { useState, useEffect } from 'react';

interface CrawlerStatus {
    isRunning: boolean;
    currentSource: string;
    currentPage: number;
    papersFound: number;
    targetPapers: number;
}

interface CrawlerControlsProps {
    onStatusChange: (status: { isRunning: boolean }) => void;
}

const BACKEND_URL = 'http://localhost:3002';

export function CrawlerControls({ onStatusChange }: CrawlerControlsProps) {
    const [status, setStatus] = useState<CrawlerStatus | null>(null);
    const [maxPapers, setMaxPapers] = useState(50);
    const [selectedSources, setSelectedSources] = useState<string[]>(['PubMed']);
    const [error, setError] = useState<string | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const sources = [
        { id: 'PubMed', name: 'PubMed' }
    ];

    useEffect(() => {
        const pollStatus = async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/api/crawler/status`);
                if (!response.ok) throw new Error('Failed to fetch status');
                const data = await response.json();
                setStatus(data);
                onStatusChange({ isRunning: data.isRunning });
            } catch (error) {
                console.error('Error polling status:', error);
            }
        };

        const interval = setInterval(pollStatus, 2000);
        return () => clearInterval(interval);
    }, [onStatusChange]);

    const startCrawler = async () => {
        try {
            setError(null);
            setIsLoading(true);
            const response = await fetch(`${BACKEND_URL}/api/crawler/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxPapers, sources: selectedSources })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start crawler');
            }

            const data = await response.json();
            setStatus(data.status);
            onStatusChange({ isRunning: true });
        } catch (error) {
            console.error('Error starting crawler:', error);
            setError(error instanceof Error ? error.message : 'Failed to start crawler');
        } finally {
            setIsLoading(false);
        }
    };

    const stopCrawler = async () => {
        try {
            setError(null);
            const response = await fetch(`${BACKEND_URL}/api/crawler/stop`, {
                method: 'POST'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to stop crawler');
            }

            const data = await response.json();
            setStatus(data.status);
            onStatusChange({ isRunning: false });
        } catch (error) {
            console.error('Error stopping crawler:', error);
            setError(error instanceof Error ? error.message : 'Failed to stop crawler');
        }
    };

    const resetDatabase = async () => {
        try {
            setError(null);
            setIsResetting(true);

            const response = await fetch(`${BACKEND_URL}/api/crawler/reset`, {
                method: 'POST'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset database');
            }

            const data = await response.json();
            console.log('Database reset:', data);
            window.location.reload(); // Refresh the page to show empty state
        } catch (error) {
            console.error('Error resetting database:', error);
            setError(error instanceof Error ? error.message : 'Failed to reset database');
        } finally {
            setIsResetting(false);
        }
    };

    const handleSourceToggle = (sourceId: string) => {
        setSelectedSources(prev => {
            if (prev.includes(sourceId)) {
                if (prev.length === 1) return prev;
                return prev.filter(id => id !== sourceId);
            }
            return [...prev, sourceId];
        });
    };

    return (
        <div className="bg-white/[0.02] backdrop-blur-xl rounded-lg border border-white/[0.05]">
            <div className="p-8 space-y-8">
                {/* Sources Selection */}
                <div className="space-y-4">
                    <label className="block text-sm text-white/40 font-light">
                        Sources
                    </label>
                    <div className="flex gap-3">
                        {sources.map(source => (
                            <button
                                key={source.id}
                                onClick={() => handleSourceToggle(source.id)}
                                className={`px-4 py-2 rounded-md text-sm transition-all duration-300 ${
                                    selectedSources.includes(source.id)
                                        ? 'bg-white/10 text-white border-white/20'
                                        : 'bg-transparent text-white/40 border-white/5 hover:text-white/60'
                                } border font-light`}
                            >
                                {source.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Papers Count Input */}
                <div className="space-y-4">
                    <label className="block text-sm text-white/40 font-light">
                        Number of Papers
                    </label>
                    <input
                        type="number"
                        value={maxPapers}
                        onChange={(e) => setMaxPapers(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-md text-white 
                                 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/20 
                                 transition-all duration-300 font-light"
                        min="1"
                        max="1000"
                    />
                </div>

                {/* Status Display */}
                {status && status.isRunning && (
                    <div className="space-y-2">
                        <div className="text-sm text-white/60">
                            Currently crawling: {status.currentSource}
                        </div>
                        <div className="text-sm text-white/60">
                            Page {status.currentPage} | Found {status.papersFound} of {status.targetPapers} papers
                        </div>
                        <div className="relative pt-1">
                            <div className="overflow-hidden h-2 text-xs flex rounded bg-white/[0.03]">
                                <div
                                    style={{ width: `${(status.papersFound / status.targetPapers) * 100}%` }}
                                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500/50"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="text-red-400 text-sm bg-red-500/5 border border-red-500/10 
                                  rounded-md p-4 font-light">
                        {error}
                    </div>
                )}

                {/* Control Buttons */}
                <div className="flex justify-between gap-4">
                    <button
                        onClick={resetDatabase}
                        disabled={status?.isRunning || isResetting}
                        className={`px-6 py-2 rounded-md font-medium transition-all duration-200 border ${
                            status?.isRunning || isResetting
                                ? 'bg-white/5 text-white/20 border-white/10 cursor-not-allowed'
                                : 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                        }`}
                    >
                        {isResetting ? 'Resetting...' : 'Reset Database'}
                    </button>
                    
                    {status?.isRunning ? (
                        <button
                            onClick={stopCrawler}
                            className="px-6 py-2 bg-red-500/20 text-red-400 rounded-md font-medium hover:bg-red-500/30 transition-all duration-200 border border-red-500/30"
                        >
                            Stop Crawler
                        </button>
                    ) : (
                        <button
                            onClick={startCrawler}
                            disabled={isResetting || isLoading}
                            className={`w-full py-3 rounded-md font-light text-sm transition-all duration-300
                                      ${isResetting || isLoading 
                                        ? 'bg-white/5 text-white/40 cursor-not-allowed' 
                                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20'
                                      }`}
                        >
                            {isLoading ? 'Starting...' : 'Start Crawler'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
} 