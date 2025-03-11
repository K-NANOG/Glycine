import { useState, useEffect, useCallback, useRef } from 'react';
import { ConsoleOutput } from './ConsoleOutput';

export interface CrawlOptions {
    maxPapers: number;
    sources: string[];
}

interface CrawlerControlsProps {
    onStartCrawling?: (options: CrawlOptions) => Promise<void>;
    onStopCrawling?: () => Promise<void>;
    onDropDatabase?: () => Promise<void>;
    isLoading?: boolean;
    isCrawling?: boolean;
}

interface CrawlerStatus {
    isRunning: boolean;
    currentSource: string;
    papersFound: number;
    lastError: string;
    currentPage: number;
    totalPages: number;
}

interface LogMessage {
    message: string;
    type: 'info' | 'error' | 'success';
    timestamp: string;
}

const BACKEND_URL = 'http://localhost:3002';

export function CrawlerControls({ 
    onStartCrawling,
    onStopCrawling,
    onDropDatabase,
    isLoading = false,
    isCrawling = false
}: CrawlerControlsProps) {
    const [status, setStatus] = useState<CrawlerStatus | null>(null);
    const [maxPapers, setMaxPapers] = useState(50);
    const [selectedSources, setSelectedSources] = useState<string[]>(['PubMed', 'arXiv']);
    const [error, setError] = useState<string | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [messages, setMessages] = useState<LogMessage[]>([]);
    const wsRef = useRef<WebSocket | null>(null);

    const sources = [
        { id: 'PubMed', name: 'PubMed' },
        { id: 'arXiv', name: 'arXiv' }
    ];

    const connectWebSocket = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        const wsUrl = `ws://localhost:3002`;
        const socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'log') {
                setMessages(prev => [...prev, data.data]);
            } else if (data.type === 'status') {
                setStatus(data.data);
            }
        };

        socket.onclose = () => {
            if (wsRef.current === socket) {
                wsRef.current = null;
                setTimeout(connectWebSocket, 1000);
            }
        };

        wsRef.current = socket;
    }, []);

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connectWebSocket]);

    const handleSourceToggle = (sourceId: string) => {
        setSelectedSources(prev => {
            if (prev.includes(sourceId)) {
                if (prev.length === 1) return prev;
                return prev.filter(id => id !== sourceId);
            }
            return [...prev, sourceId];
        });
    };

    const startCrawler = async () => {
        try {
            setError(null);
            if (onStartCrawling) {
                await onStartCrawling({
                    maxPapers,
                    sources: selectedSources
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start crawler');
        }
    };

    const stopCrawler = async () => {
        try {
            setError(null);
            if (onStopCrawling) {
                await onStopCrawling();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to stop crawler');
        }
    };

    const resetDatabase = async () => {
        try {
            setError(null);
            setIsResetting(true);
            if (onDropDatabase) {
                await onDropDatabase();
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error('Error resetting database:', error);
            setError(error instanceof Error ? error.message : 'Failed to reset database');
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="backdrop-blur-xl bg-black/40 rounded-xl p-6 border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300">
                <h2 className="text-xl font-medium text-white/90 mb-6">Crawler Controls</h2>
                
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">
                            Maximum Papers
                        </label>
                        <input
                            type="number"
                            value={maxPapers}
                            onChange={(e) => setMaxPapers(parseInt(e.target.value))}
                            className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-4 py-2.5 text-white/90 focus:outline-none focus:border-white/[0.16] focus:ring-1 focus:ring-white/[0.16] transition-all duration-200"
                            min="1"
                            max="1000"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">
                            Sources
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {sources.map((source) => (
                                <label key={source.id} className="relative">
                                    <input
                                        type="checkbox"
                                        checked={selectedSources.includes(source.id)}
                                        onChange={() => handleSourceToggle(source.id)}
                                        className="sr-only peer"
                                    />
                                    <div className="cursor-pointer backdrop-blur-xl bg-black/40 border border-white/[0.08] px-4 py-2 rounded-lg text-white/70 peer-checked:text-white peer-checked:border-white/[0.16] peer-checked:bg-white/[0.08] hover:border-white/[0.16] transition-all duration-200">
                                        {source.name}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="backdrop-blur-xl bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-4 pt-2">
                        <button
                            onClick={startCrawler}
                            disabled={status?.isRunning || isResetting}
                            className={`flex-1 backdrop-blur-xl px-4 py-2.5 rounded-lg text-white/90 border transition-all duration-200 ${
                                status?.isRunning || isResetting
                                    ? 'bg-black/40 border-white/[0.08] text-white/40 cursor-not-allowed'
                                    : 'bg-white/[0.08] border-white/[0.16] hover:bg-white/[0.12] hover:border-white/[0.24] active:bg-white/[0.16]'
                            }`}
                        >
                            Start Crawler
                        </button>
                        <button
                            onClick={stopCrawler}
                            disabled={!status?.isRunning || isResetting}
                            className={`flex-1 backdrop-blur-xl px-4 py-2.5 rounded-lg text-white/90 border transition-all duration-200 ${
                                !status?.isRunning || isResetting
                                    ? 'bg-black/40 border-white/[0.08] text-white/40 cursor-not-allowed'
                                    : 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30 hover:border-red-500/40 active:bg-red-500/40'
                            }`}
                        >
                            Stop Crawler
                        </button>
                    </div>
                </div>
            </div>

            <ConsoleOutput messages={messages} isCrawling={status?.isRunning || isCrawling} />
        </div>
    );
} 