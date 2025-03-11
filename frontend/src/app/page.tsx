'use client';

import { useEffect, useState } from 'react';
import PaperCard from '../components/PaperCard';
import { StatsOverview } from '../components/StatsOverview';
import { CrawlerControls, CrawlOptions } from '../components/CrawlerControls';

interface Paper {
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
    url: string;
    metrics?: {
        citationCount?: number;
        impactFactor?: number;
        altmetricScore?: number;
    };
    metadata?: {
        journal?: string;
        volume?: string;
        issue?: string;
        publisher?: string;
    };
}

interface Stats {
    totalPapers: number;
    categoryCounts: Record<string, number>;
    averageMetrics: {
        citationCount: number;
        impactFactor: number;
        altmetricScore: number;
    };
    topJournals: Record<string, number>;
    papersByMonth: Record<string, number>;
}

const BACKEND_URL = 'http://localhost:3002';
const API_BASE_URL = `${BACKEND_URL}/api`;

// Add a retry mechanism for fetch
async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown error occurred');
            if (i === retries - 1) break;
            console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

export default function Home() {
    const [papers, setPapers] = useState<Paper[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [crawling, setCrawling] = useState<boolean>(false);
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // First test if the backend is accessible
                try {
                    const testResponse = await fetchWithRetry(`${BACKEND_URL}/test`);
                    if (!testResponse) {
                        throw new Error('No response from backend test endpoint');
                    }
                    const testData = await testResponse.json();
                    console.log('Backend test response:', testData);
                } catch (error) {
                    console.error('Backend test error:', error);
                    throw new Error(`Backend server is not responding (${BACKEND_URL}). Please ensure the backend server is running.`);
                }

                // Fetch papers and stats with retry mechanism
                const papersResponse = await fetchWithRetry(`${API_BASE_URL}/papers`);
                const statsResponse = await fetchWithRetry(`${API_BASE_URL}/stats`);

                const papersData = await papersResponse.json() as Paper[];
                const statsData = await statsResponse.json() as Stats;

                console.log('Fetched papers:', papersData);
                console.log('Fetched stats:', statsData);

                if (!Array.isArray(papersData)) {
                    throw new Error('Invalid papers data received');
                }

                setPapers(papersData);
                setStats(statsData);
            } catch (err) {
                console.error('Error details:', err);
                let errorMessage = 'Failed to load data. ';
                if (err instanceof Error) {
                    errorMessage += err.message;
                } else {
                    errorMessage += 'Please check if the backend server is running.';
                }
                setError(errorMessage);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Add a handler for starting the crawler
    const handleStartCrawling = async (options: CrawlOptions) => {
        setCrawling(true);
        try {
            const response = await fetch(`${API_BASE_URL}/crawl/custom`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    paperCount: options.maxPapers,
                    sources: options.sources
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Crawling started:', data);
            setLogs(prev => [...prev, `[${new Date().toISOString()}] Crawling started with options: ${JSON.stringify(options)}`]);
            
            // Poll for new papers every 10 seconds
            const pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`${API_BASE_URL}/crawl/status`);
                    if (!statusResponse.ok) {
                        throw new Error(`HTTP error! status: ${statusResponse.status}`);
                    }
                    
                    const statusData = await statusResponse.json();
                    if (!statusData.isRunning) {
                        clearInterval(pollInterval);
                        setCrawling(false);
                        await fetchPapers(); // Final fetch
                        return;
                    }
                    
                    // Only fetch papers if we have new ones
                    if (statusData.papersFound > papers.length) {
                        await fetchPapers();
                    }
                } catch (error) {
                    console.error('Error polling status:', error);
                }
            }, 10000);

            // Safety timeout after 10 minutes
            setTimeout(() => {
                clearInterval(pollInterval);
                setCrawling(false);
            }, 600000);
            
            return data;
        } catch (err) {
            console.error('Error starting crawler:', err);
            setCrawling(false);
            throw err;
        }
    };

    const handleStopCrawling = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/crawl/stop`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Crawling stopped:', data);
            setLogs(prev => [...prev, `[${new Date().toISOString()}] Crawling stopped`]);
            setCrawling(false);
            
            // Fetch final state
            await fetchPapers();
            
            return data;
        } catch (err) {
            console.error('Error stopping crawler:', err);
            throw err;
        }
    };

    const handleDropDatabase = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/database/drop`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Database dropped:', data);
            setLogs(prev => [...prev, `[${new Date().toISOString()}] Database dropped`]);
            
            // Clear papers and stats
            setPapers([]);
            setStats(null);
            
            return data;
        } catch (err) {
            console.error('Error dropping database:', err);
            throw err;
        }
    };

    // Function to fetch papers
    const fetchPapers = async () => {
        try {
            const papersResponse = await fetchWithRetry(`${API_BASE_URL}/papers`);
            const papersData = await papersResponse.json() as Paper[];
            
            if (!Array.isArray(papersData)) {
                throw new Error('Invalid papers data received');
            }
            
            setPapers(papersData);
            setLogs(prev => [...prev, `[${new Date().toISOString()}] Fetched ${papersData.length} papers`]);
            
            // Also update stats
            const statsResponse = await fetchWithRetry(`${API_BASE_URL}/stats`);
            const statsData = await statsResponse.json() as Stats;
            setStats(statsData);
            
            console.log('Fetched papers:', papersData);
        } catch (err) {
            console.error('Error fetching papers:', err);
            setLogs(prev => [...prev, `[${new Date().toISOString()}] Error fetching papers: ${err instanceof Error ? err.message : 'Unknown error'}`]);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white py-8">
                <div className="fixed inset-0 bg-gradient-to-br from-white/[0.03] to-white/[0.05] pointer-events-none" />
                <div className="container mx-auto px-4 relative">
                    <div className="flex items-center justify-center min-h-screen">
                        <div className="relative">
                            <div className="animate-pulse-slow bg-white/5 rounded-full h-32 w-32 absolute blur-xl" />
                            <div className="animate-spin-slow rounded-full h-12 w-12 border-2 border-white/20 border-t-white/80" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white py-8">
                <div className="fixed inset-0 bg-gradient-to-br from-white/[0.03] to-white/[0.05] pointer-events-none" />
                <div className="container mx-auto px-4 relative">
                    <div className="flex flex-col items-center justify-center min-h-screen">
                        <div className="backdrop-blur-xl bg-white/[0.03] rounded-lg p-8 border border-white/[0.08]">
                            <p className="text-white/70 mb-4">{error}</p>
                            <button 
                                onClick={() => window.location.reload()}
                                className="bg-white/5 hover:bg-white/10 text-white/80 font-medium py-2 px-4 rounded-md transition-all duration-300 border border-white/10 hover:border-white/20"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white py-8">
            <div className="fixed inset-0 bg-gradient-to-br from-white/[0.03] to-white/[0.05] pointer-events-none" />
            <div className="container mx-auto px-4 relative">
                <header className="mb-8 text-center">
                    <div className="inline-block">
                        <h1 className="text-6xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 animate-gradient">
                            Glycine
                        </h1>
                        <div className="h-px w-full bg-gradient-to-r from-white/30 via-white/50 to-white/30 transform scale-x-0 animate-scale-x" />
                    </div>
                    <p className="text-white/60 text-lg max-w-2xl mx-auto mt-6 leading-relaxed">
                        A dynamically reconfigurable web crawler for scientific papers, 
                        powered by advanced pattern matching and machine learning
                    </p>
                </header>

                <CrawlerControls 
                    onStartCrawling={handleStartCrawling}
                    onStopCrawling={handleStopCrawling}
                    onDropDatabase={handleDropDatabase}
                    isLoading={loading}
                    isCrawling={crawling}
                />

                {stats && <StatsOverview stats={stats} />}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                    {papers.length === 0 && !loading && (
                        <div className="col-span-full text-center p-8 backdrop-blur-xl bg-white/[0.03] rounded-xl border border-white/[0.08]">
                            <p className="text-white/60">No papers found. Start crawling to fetch papers!</p>
                        </div>
                    )}
                    {papers.map((paper, index) => (
                        <div key={paper.doi || index} className="opacity-0 animate-fade-in" style={{ animationDelay: `${index * 150}ms` }}>
                            <PaperCard paper={paper} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
