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

export function StatsOverview({ stats }: StatsOverviewProps) {
    const formatNumber = (num: number) => {
        return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    const getTopCategories = () => {
        return Object.entries(stats.categoryCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);
    };

    const getTopJournals = () => {
        return Object.entries(stats.topJournals)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);
    };

    const getRecentMonths = () => {
        return Object.entries(stats.papersByMonth)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 6)
            .reverse();
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Papers */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-lg p-6 border border-white/[0.08]">
                <h3 className="text-sm text-white/60 mb-2">Total Papers</h3>
                <p className="text-3xl font-semibold text-white/90">{formatNumber(stats.totalPapers)}</p>
            </div>

            {/* Average Metrics */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-lg p-6 border border-white/[0.08]">
                <h3 className="text-sm text-white/60 mb-4">Average Metrics</h3>
                <div className="space-y-2">
                    <div>
                        <p className="text-sm text-white/40">Citations</p>
                        <p className="text-lg font-medium text-white/80">{formatNumber(stats.averageMetrics.citationCount)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-white/40">Impact Factor</p>
                        <p className="text-lg font-medium text-white/80">{formatNumber(stats.averageMetrics.impactFactor)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-white/40">Altmetric Score</p>
                        <p className="text-lg font-medium text-white/80">{formatNumber(stats.averageMetrics.altmetricScore)}</p>
                    </div>
                </div>
            </div>

            {/* Top Categories */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-lg p-6 border border-white/[0.08]">
                <h3 className="text-sm text-white/60 mb-4">Top Categories</h3>
                <div className="space-y-2">
                    {getTopCategories().map(([category, count]) => (
                        <div key={category} className="flex justify-between items-center">
                            <span className="text-sm text-white/80">{category}</span>
                            <span className="text-sm text-white/40">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Papers by Month */}
            <div className="backdrop-blur-xl bg-white/[0.03] rounded-lg p-6 border border-white/[0.08]">
                <h3 className="text-sm text-white/60 mb-4">Recent Activity</h3>
                <div className="space-y-2">
                    {getRecentMonths().map(([month, count]) => (
                        <div key={month} className="flex justify-between items-center">
                            <span className="text-sm text-white/80">{new Date(month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</span>
                            <span className="text-sm text-white/40">{count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
} 