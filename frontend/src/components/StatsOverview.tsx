import React from 'react';

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

interface StatsOverviewProps {
    stats: Stats;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {/* Total Papers Card */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-6 border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300 group relative overflow-hidden">
                <h3 className="text-lg font-medium text-white/70 mb-4 group-hover:text-white/90 transition-colors duration-300">Overview</h3>
                <div className="text-4xl font-bold text-white/90 mb-2 group-hover:text-white transition-all duration-300">
                    {stats.totalPapers}
                </div>
                <p className="text-white/60 group-hover:text-white/80 transition-colors duration-300">Total Papers</p>
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </div>

            {/* Average Metrics Card */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-6 border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300 group relative overflow-hidden">
                <h3 className="text-lg font-medium text-white/70 mb-4 group-hover:text-white/90 transition-colors duration-300">Average Metrics</h3>
                <div className="space-y-4">
                    <div className="relative">
                        <p className="text-white/60 mb-1 group-hover:text-white/80 transition-colors duration-300">Citations</p>
                        <div className="text-2xl font-bold text-white/90 group-hover:text-white transition-all duration-300">
                            {stats.averageMetrics.citationCount.toFixed(1)}
                        </div>
                    </div>
                    <div className="relative">
                        <p className="text-white/60 mb-1 group-hover:text-white/80 transition-colors duration-300">Impact Factor</p>
                        <div className="text-2xl font-bold text-white/90 group-hover:text-white transition-all duration-300">
                            {stats.averageMetrics.impactFactor.toFixed(1)}
                        </div>
                    </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </div>

            {/* Top Categories Card */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-6 border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300 group relative overflow-hidden">
                <h3 className="text-lg font-medium text-white/70 mb-4 group-hover:text-white/90 transition-colors duration-300">Top Categories</h3>
                <div className="space-y-3">
                    {Object.entries(stats.categoryCounts)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([category, count], index) => (
                            <div 
                                key={category} 
                                className="flex justify-between items-center opacity-0 animate-fade-in"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <span className="text-white/60 group-hover:text-white/80 transition-colors duration-300">{category}</span>
                                <span className="text-white/90 font-medium group-hover:text-white transition-all duration-300">
                                    {count}
                                </span>
                            </div>
                        ))}
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </div>

            {/* Top Journals Card */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-6 border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300 group relative overflow-hidden">
                <h3 className="text-lg font-medium text-white/70 mb-4 group-hover:text-white/90 transition-colors duration-300">Top Journals</h3>
                <div className="space-y-3">
                    {Object.entries(stats.topJournals)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([journal, count], index) => (
                            <div 
                                key={journal} 
                                className="flex justify-between items-center opacity-0 animate-fade-in"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <span className="text-white/60 group-hover:text-white/80 transition-colors duration-300">{journal}</span>
                                <span className="text-white/90 font-medium group-hover:text-white transition-all duration-300">
                                    {count}
                                </span>
                            </div>
                        ))}
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </div>
        </div>
    );
}; 