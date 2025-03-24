'use client';

import { useEffect, useState } from 'react';
import { CrawlerControls } from '../components/CrawlerControls';
import { PaperCard } from '../components/PaperCard';

interface Paper {
    _id: string;
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
    keywords?: string[];
    publicationDate?: Date;
    url: string;
    categories?: string[];
}

const BACKEND_URL = 'http://localhost:3002';

export default function Home() {
    const [papers, setPapers] = useState<Paper[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [crawlerStatus, setCrawlerStatus] = useState<{ isRunning: boolean }>({ isRunning: false });

    const fetchData = async () => {
        try {
            const papersResponse = await fetch(`${BACKEND_URL}/api/papers`);
            if (!papersResponse.ok) throw new Error('Failed to fetch papers');
            const papersData = await papersResponse.json();
            setPapers(papersData);
        } catch (err) {
            console.error('Error:', err);
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (crawlerStatus.isRunning) {
            interval = setInterval(fetchData, 5000);
        }
        return () => clearInterval(interval);
    }, [crawlerStatus.isRunning]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black text-white/80">
                <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(25,25,25,0.1),transparent_100%)] pointer-events-none" />
                <div className="container mx-auto px-4 py-16 relative">
                    <div className="flex items-center justify-center min-h-[60vh]">
                        <div className="relative">
                            <div className="animate-pulse-slow bg-white/5 rounded-full h-32 w-32 absolute blur-xl" />
                            <div className="animate-spin-slow rounded-full h-12 w-12 border border-white/20 border-t-white/60" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-black text-white/80">
                <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(25,25,25,0.1),transparent_100%)] pointer-events-none" />
                <div className="container mx-auto px-4 py-16 relative">
                    <div className="flex flex-col items-center justify-center min-h-[60vh]">
                        <div className="bg-white/[0.02] backdrop-blur-xl rounded-lg p-8 border border-white/[0.05]">
                            <p className="text-white/60 mb-4">{error}</p>
                            <button 
                                onClick={() => window.location.reload()}
                                className="bg-white/5 hover:bg-white/10 text-white/80 font-light py-2 px-4 rounded-md transition-all duration-300 border border-white/10 hover:border-white/20"
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
        <div className="min-h-screen bg-black text-white/80">
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(25,25,25,0.1),transparent_100%)] pointer-events-none" />
            <div className="container mx-auto px-4 py-16 relative">
                <header className="mb-16 text-center">
                    <h1 className="text-7xl font-thin tracking-tighter mb-6 text-white">
                        Glycine
                    </h1>
                    <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-white/20 to-transparent mb-6" />
                    <p className="text-white/40 text-lg max-w-3xl mx-auto leading-relaxed font-light">
                        A dynamically reconfigurable web crawler for scientific papers, 
                        powered by advanced pattern matching and machine learning
                    </p>
                </header>

                <div className="max-w-4xl mx-auto mb-16">
                    <CrawlerControls onStatusChange={setCrawlerStatus} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
                    {papers.length === 0 ? (
                        <div className="text-center text-white/40 py-12 font-light md:col-span-2 lg:col-span-3">
                            <p className="text-lg">No papers found. Start the crawler to begin collecting papers.</p>
                        </div>
                    ) : (
                        papers.map((paper, index) => (
                            <div 
                                key={paper._id} 
                                className="opacity-0 animate-fade-in" 
                                style={{ 
                                    animationDelay: `${index * 100}ms`,
                                    animationFillMode: 'forwards'
                                }}
                            >
                                <PaperCard paper={paper} />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
