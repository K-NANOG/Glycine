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
        pmid?: string;
        journal?: string;
        publisher?: string;
    };
}

interface PaperCardProps {
    paper: Paper;
}

const MAX_VISIBLE_AUTHORS = 7;

export function PaperCard({ paper }: PaperCardProps) {
    const [expandedAbstract, setExpandedAbstract] = useState(false);
    const [showAllAuthors, setShowAllAuthors] = useState(false);

    // Format DOI to extract just the number part and create a URL
    const formatDOI = (doi: string): { displayDOI: string, doiUrl: string } => {
        // Check various DOI formats and extract the numerical part
        const doiRegex = /(?:doi:|https?:\/\/doi\.org\/|10\.\d{4,}\/)[^\s]+/i;
        const match = doi.match(doiRegex);
        
        if (match) {
            let doiNumber = match[0];
            
            // Clean up the DOI
            if (doiNumber.toLowerCase().startsWith('doi:')) {
                doiNumber = doiNumber.substring(4).trim();
            }
            
            if (doiNumber.toLowerCase().startsWith('https://doi.org/')) {
                doiNumber = doiNumber.substring(16).trim();
            }
            
            // For bioRxiv DOIs, they often start with 10.1101/
            const doiUrl = doiNumber.startsWith('10.') 
                ? `https://doi.org/${doiNumber}`
                : `https://doi.org/10.1101/${doiNumber}`;
                
            return { 
                displayDOI: doiNumber, 
                doiUrl 
            };
        }
        
        // If no match found, return the original DOI
        return { 
            displayDOI: doi,
            doiUrl: `https://doi.org/${doi}`
        };
    };

    // Get PMID if available
    const getPMID = (paper: Paper): { pmid: string, pmidUrl: string } | null => {
        // Check in metadata first
        if (paper.metadata?.pmid) {
            return {
                pmid: paper.metadata.pmid,
                pmidUrl: `https://pubmed.ncbi.nlm.nih.gov/${paper.metadata.pmid}/`
            };
        }
        
        // For PubMed papers, the DOI field might actually contain a PMID
        if (paper.doi && paper.doi.match(/^\d+$/)) {
            return {
                pmid: paper.doi,
                pmidUrl: `https://pubmed.ncbi.nlm.nih.gov/${paper.doi}/`
            };
        }
        
        return null;
    };

    // Clean abstract by removing "Abstract" prefix for bioRxiv papers
    const cleanAbstract = (abstract: string): string => {
        // Handle all variations with a single regex
        // Matches "Abstract", followed by optional colon, dash or space, then captures the rest
        const cleanRegex = /^Abstract\s*[:;-]?\s*/i;
        if (cleanRegex.test(abstract)) {
            return abstract.replace(cleanRegex, '');
        }
        
        return abstract;
    };

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

    // Process DOI for display and linking
    const { displayDOI, doiUrl } = paper.doi ? formatDOI(paper.doi) : { displayDOI: '', doiUrl: '' };

    // Get PMID if available
    const pmidInfo = getPMID(paper);

    // Get alternate DOI from metadata if main DOI is actually a PMID
    const metadataDOI = paper.metadata?.doi ? formatDOI(paper.metadata.doi) : null;

    // Clean abstract text
    const processedAbstract = paper.abstract ? cleanAbstract(paper.abstract) : '';

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

                <div className="mb-4">
                    <p className={`text-sm text-white/40 font-light ${expandedAbstract ? '' : 'line-clamp-3'}`}>
                        {processedAbstract}
                    </p>
                    {processedAbstract.length > 180 && (
                        <button 
                            onClick={() => setExpandedAbstract(!expandedAbstract)}
                            className="text-xs text-white/50 hover:text-white mt-2 transition-colors"
                        >
                            {expandedAbstract ? 'Show less' : 'Show more'}
                        </button>
                    )}
                </div>

                <div className="mt-auto space-y-3 text-sm">
                    <div className="flex flex-wrap items-center">
                        <div className="flex flex-wrap gap-2 items-center">
                            {displayedAuthors.map((author, index) => (
                                <a 
                                    key={index}
                                    href={`https://scholar.google.com/scholar?q=author:"${encodeURIComponent(author)}"`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white/60 font-light hover:text-white transition-colors"
                                >
                                    {author}{index < displayedAuthors.length - 1 ? ',' : ''}
                                </a>
                            ))}
                            {hasMoreAuthors && (
                                <button
                                    onClick={() => setShowAllAuthors(!showAllAuthors)}
                                    className="text-white/40 hover:text-white transition-colors ml-1 cursor-pointer"
                                    title={`Show ${showAllAuthors ? 'fewer' : 'all'} authors`}
                                >
                                    {showAllAuthors ? ' (show less)' : '...'}
                                </button>
                            )}
                        </div>
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

                    <div className="flex items-center flex-wrap gap-4 text-white/30 font-light">
                        {/* Show DOI if available (either from paper.doi or metadata) */}
                        {(displayDOI && !displayDOI.match(/^\d+$/)) || metadataDOI ? (
                            <span>
                                DOI: <a 
                                    href={metadataDOI ? metadataDOI.doiUrl : doiUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white/60 hover:text-white transition-colors"
                                >
                                    {metadataDOI ? metadataDOI.displayDOI : displayDOI}
                                </a>
                            </span>
                        ) : null}
                        
                        {/* Show PMID if available */}
                        {pmidInfo && (
                            <span>
                                PMID: <a 
                                    href={pmidInfo.pmidUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white/60 hover:text-white transition-colors"
                                >
                                    {pmidInfo.pmid}
                                </a>
                            </span>
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