import React from 'react';

interface Paper {
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
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

interface PaperCardProps {
    paper: Paper;
}

export const PaperCard: React.FC<PaperCardProps> = ({ paper }) => {
    return (
        <div className="group backdrop-blur-xl bg-white/[0.03] rounded-xl p-6 border border-white/[0.08] hover:border-white/[0.16] transition-all duration-300 hover:shadow-2xl hover:shadow-white/5">
            <div className="relative overflow-hidden">
                <h2 className="text-xl font-medium text-white/90 mb-3 line-clamp-2 group-hover:text-white transition-all duration-300">
                    {paper.title}
                </h2>
                <div className="flex flex-wrap gap-2 mb-4">
                    {paper.metadata?.journal && (
                        <span className="backdrop-blur-md bg-white/[0.03] text-white/70 px-3 py-1 rounded-full text-sm border border-white/[0.08] group-hover:border-white/[0.16] transition-all duration-300">
                            {paper.metadata.journal}
                        </span>
                    )}
                    {paper.metrics?.impactFactor && (
                        <span className="backdrop-blur-md bg-white/[0.03] text-white/70 px-3 py-1 rounded-full text-sm border border-white/[0.08] group-hover:border-white/[0.16] transition-all duration-300">
                            IF: {paper.metrics.impactFactor.toFixed(1)}
                        </span>
                    )}
                    {paper.metrics?.citationCount && (
                        <span className="backdrop-blur-md bg-white/[0.03] text-white/70 px-3 py-1 rounded-full text-sm border border-white/[0.08] group-hover:border-white/[0.16] transition-all duration-300">
                            Citations: {paper.metrics.citationCount}
                        </span>
                    )}
                </div>
                <p className="text-white/60 mb-6 line-clamp-3 group-hover:text-white/80 transition-colors duration-300">
                    {paper.abstract}
                </p>
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </div>
            <div className="border-t border-white/[0.08] pt-4 mt-auto">
                <p className="text-sm text-white/50 mb-3 group-hover:text-white/70 transition-colors duration-300">
                    {paper.authors.join(', ')}
                </p>
                <div className="flex justify-between items-center">
                    <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/70 hover:text-white text-sm transition-colors duration-300 hover:underline decoration-white/30"
                    >
                        {paper.doi}
                    </a>
                    {paper.metadata?.publisher && (
                        <span className="text-sm text-white/50 group-hover:text-white/70 transition-colors duration-300">
                            {paper.metadata.publisher}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}; 