import { useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';

interface Paper {
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
    publicationDate?: Date | string;
    categories?: string[];
    keywords?: string[];
    url: string;
    metrics?: {
        citationCount?: number;
        impactFactor?: number;
        altmetricScore?: number;
    };
    metadata?: {
        doi?: string;
    };
}

interface PaperCardProps {
    paper: Paper;
}

const MAX_VISIBLE_AUTHORS = 3;

export function PaperCard({ paper }: PaperCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [showAllAuthors, setShowAllAuthors] = useState(false);

    const formatDate = (date: Date | string | undefined): string => {
        if (!date) return '';
        
        try {
            let dateObj: Date;
            if (typeof date === 'string') {
                // Try parsing ISO string first
                dateObj = parseISO(date);
                if (!isValid(dateObj)) {
                    // If not valid, try creating a new Date object
                    dateObj = new Date(date);
                }
            } else {
                dateObj = date;
            }

            if (!isValid(dateObj)) {
                return '';
            }

            return format(dateObj, 'MMM d, yyyy');
        } catch (error) {
            console.error('Error formatting date:', error);
            return '';
        }
    };

    const getISODate = (date: Date | string | undefined): string => {
        if (!date) return '';
        
        try {
            let dateObj: Date;
            if (typeof date === 'string') {
                dateObj = parseISO(date);
                if (!isValid(dateObj)) {
                    dateObj = new Date(date);
                }
            } else {
                dateObj = date;
            }

            if (!isValid(dateObj)) {
                return '';
            }

            return dateObj.toISOString();
        } catch (error) {
            console.error('Error getting ISO date:', error);
            return '';
        }
    };

    const displayedAuthors = showAllAuthors ? paper.authors : paper.authors.slice(0, MAX_VISIBLE_AUTHORS);
    const hasMoreAuthors = paper.authors.length > MAX_VISIBLE_AUTHORS;

    const renderAuthors = () => (
        <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-white/40">Authors:</span>
            <div className="flex flex-wrap gap-2 items-center">
                {displayedAuthors.map((author, index) => (
                    <a 
                        key={index}
                        href={`https://scholar.google.com/scholar?q=author:"${encodeURIComponent(author)}"`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white/60 bg-white/[0.05] px-2 py-1 rounded hover:bg-white/[0.08] hover:text-blue-400 transition-all"
                    >
                        {author}
                    </a>
                ))}
                {!showAllAuthors && hasMoreAuthors && (
                    <button
                        onClick={() => setShowAllAuthors(true)}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.08]"
                    >
                        +{paper.authors.length - MAX_VISIBLE_AUTHORS} more...
                    </button>
                )}
                {showAllAuthors && hasMoreAuthors && (
                    <button
                        onClick={() => setShowAllAuthors(false)}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.08]"
                    >
                        Show less
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="bg-white/[0.02] backdrop-blur-xl rounded-lg border border-white/[0.05] h-full transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08]">
            <div className="p-6 flex flex-col h-full">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <h2 className="text-lg font-light text-white leading-tight">
                        <a 
                            href={paper.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:text-white/90 transition-colors duration-300"
                        >
                            {paper.title}
                        </a>
                    </h2>
                    <a 
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/20 hover:text-white/60 transition-colors duration-300"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                </div>

                <p className="text-sm text-white/40 mb-4 line-clamp-3 font-light">
                    {paper.abstract}
                </p>

                <div className="mt-auto space-y-3 text-sm">
                    <div className="flex flex-wrap gap-1">
                        {paper.authors.map((author, index) => (
                            <span 
                                key={index} 
                                className="text-white/60 font-light"
                            >
                                {author}{index < paper.authors.length - 1 ? ',' : ''}
                            </span>
                        ))}
                    </div>

                    {paper.categories && paper.categories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {paper.categories.map((category, index) => (
                                <span 
                                    key={index}
                                    className="px-2 py-1 rounded-md bg-white/5 text-white/40 text-xs font-light"
                                >
                                    {category}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-4 text-white/30 font-light">
                        {paper.doi && (
                            <span>DOI: {paper.doi}</span>
                        )}
                        {paper.publicationDate && getISODate(paper.publicationDate) && (
                            <time dateTime={getISODate(paper.publicationDate)}>
                                {formatDate(paper.publicationDate)}
                            </time>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 