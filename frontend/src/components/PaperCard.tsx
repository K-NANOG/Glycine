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

const MAX_VISIBLE_AUTHORS = 3;

export function PaperCard({ paper }: PaperCardProps) {
    const [expandedAbstract, setExpandedAbstract] = useState(false);
    const [showAllAuthors, setShowAllAuthors] = useState(false);
    
    // Clean and process title - handle HTML tags and entities
    const cleanTitle = (text: string): string => {
        if (!text) return '';
        
        const element = document.createElement('div');
        element.innerHTML = text
            .replace(/<sup>(.*?)<\/sup>/g, '^$1')
            .replace(/<sub>(.*?)<\/sub>/g, '_$1')
            .replace(/<i>(.*?)<\/i>/g, '$1');
            
        const decoded = element.textContent || element.innerText || '';
        
        return decoded
            .replace(/<\/?[^>]+(>|$)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };
    
    // Clean abstract by removing HTML and formatting
    const cleanAbstract = (abstract: string): string => {
        if (!abstract) return '';
        
        // First clean HTML tags
        let cleaned = cleanTitle(abstract);
        
        // Remove Abstract prefix
        const cleanRegex = /^Abstract\s*[:;-]?\s*/i;
        if (cleanRegex.test(cleaned)) {
            cleaned = cleaned.replace(cleanRegex, '');
        }
        
        // Remove reference to DOI or publication info
        cleaned = cleaned.replace(/\s*doi:[\d\.]+\/[\w\d\-\.]+\s*$/i, '');
        cleaned = cleaned.replace(/published online:.*$/i, '');
        
        return cleaned;
    };

    // Format DOI to extract just the number part and create a URL
    const formatDOI = (doi: string): { displayDOI: string, doiUrl: string } => {
        // Skip formatting for RSS items
        if (!doi || doi.startsWith('rss-')) {
            return { displayDOI: '', doiUrl: '' };
        }
        
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
            doiUrl: doi.startsWith('10.') ? `https://doi.org/${doi}` : ''
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

    // Prepare data
    const cleanedTitle = cleanTitle(paper.title);
    const cleanedAbstract = cleanAbstract(paper.abstract);
    const cleanedAuthors = paper.authors.map(author => cleanTitle(author));
    
    const displayedAuthors = showAllAuthors ? cleanedAuthors : cleanedAuthors.slice(0, MAX_VISIBLE_AUTHORS);
    const hasMoreAuthors = cleanedAuthors.length > MAX_VISIBLE_AUTHORS;

    // Check if the paper is from an RSS feed
    const isRssFeed = paper.keywords?.includes('RSS Feed') || paper.doi?.startsWith('rss-') || false;
    
    // Get the feed source from categories or keywords
    let feedSource = 'RSS Feed';
    if (paper.metadata?.journal && paper.metadata.journal !== 'RSS Feed') {
        feedSource = paper.metadata.journal;
    } else if (paper.categories?.length) {
        // The feed name should be in the categories
        for (const category of paper.categories) {
            if (category !== 'RSS Feed') {
                feedSource = category;
                break;
            }
        }
    } else if (paper.keywords?.length) {
        // Or it might be in the keywords as "Source: FeedName"
        const sourceKeyword = paper.keywords.find(k => k.startsWith('Source:'));
        if (sourceKeyword) {
            feedSource = sourceKeyword.substring(8).trim();
        }
    }

    // Process DOI for display and linking
    const { displayDOI, doiUrl } = !isRssFeed && paper.doi ? formatDOI(paper.doi) : { displayDOI: '', doiUrl: '' };

    // Get PMID if available
    const pmidInfo = getPMID(paper);

    // Get alternate DOI from metadata if main DOI is actually a PMID
    const metadataDOI = !isRssFeed && paper.metadata?.doi ? formatDOI(paper.metadata.doi) : null;
    
    return (
        <div className="bg-white/[0.02] backdrop-blur-xl rounded-lg border border-white/[0.05] h-[460px] shadow-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] flex flex-col overflow-hidden">
            {/* Card Content Container */}
            <div className="flex flex-col h-full">
                {/* Header Section: Title */}
                <div className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg font-light text-white leading-tight">
                            <a 
                                href={paper.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="hover:text-white/90 transition-colors duration-300"
                            >
                                {cleanedTitle}
                            </a>
                        </h2>
                        <a 
                            href={paper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/20 hover:text-white/60 transition-colors duration-300 flex-shrink-0 mt-1"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    </div>
                </div>
                
                {/* Middle Section: Abstract */}
                <div className="px-5 flex-grow flex flex-col">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="font-semibold text-sm text-white/70">Abstract</p>
                    </div>
                    
                    {cleanedAbstract ? (
                        <div className="relative flex-grow">
                            <div className={`text-sm text-white/50 leading-relaxed ${
                                expandedAbstract ? "overflow-y-auto max-h-[210px] pr-1" : "line-clamp-5"
                            }`}>
                                {cleanedAbstract}
                            </div>
                            
                            {cleanedAbstract.length > 200 && !expandedAbstract && (
                                <div className="absolute bottom-0 right-0 text-white/50">...</div>
                            )}
                            
                            {cleanedAbstract.length > 200 && (
                                <div className="mt-2 mb-3">
                                    <button
                                        onClick={() => setExpandedAbstract(!expandedAbstract)}
                                        className="text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all py-1.5 px-3 rounded-md font-medium shadow-sm"
                                    >
                                        {expandedAbstract ? "Show less" : "Show more"}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-white/30 italic">No abstract available</p>
                    )}
                </div>
                
                {/* Footer Section: Authors and Metadata */}
                <div className="mt-auto px-5 pt-3 pb-5 border-t border-white/10">
                    {/* Authors */}
                    <div className="mb-3">
                        <div className="flex flex-wrap gap-x-1 gap-y-1.5">
                            {displayedAuthors.map((author, index) => (
                                <span key={index} className="inline-flex items-center">
                                    <a 
                                        href={`https://scholar.google.com/scholar?q=author:"${encodeURIComponent(author)}"`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-white/60 hover:text-white transition-colors"
                                    >
                                        {author}
                                    </a>
                                    {index < displayedAuthors.length - 1 && <span className="text-white/40 mr-1">,</span>}
                                </span>
                            ))}
                            {hasMoreAuthors && (
                                <button
                                    onClick={() => setShowAllAuthors(!showAllAuthors)}
                                    className="text-sm text-white/40 hover:text-white/70 transition-colors font-medium"
                                >
                                    {showAllAuthors ? " (show fewer)" : " + " + (cleanedAuthors.length - MAX_VISIBLE_AUTHORS) + " more"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Categories */}
                    {paper.categories && paper.categories.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {paper.categories.slice(0, 3).map((category, index) => (
                                <span 
                                    key={index}
                                    className="px-2 py-1 rounded-md bg-white/5 text-white/40 text-xs"
                                >
                                    {category}
                                </span>
                            ))}
                            {paper.categories.length > 3 && (
                                <span className="text-white/30 text-xs flex items-center">
                                    +{paper.categories.length - 3} more
                                </span>
                            )}
                        </div>
                    )}

                    {/* Metadata: DOI, PMID, Date, Source */}
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-white/40 text-xs">
                        {/* DOI */}
                        {!isRssFeed && ((displayDOI && !displayDOI.match(/^\d+$/)) || metadataDOI) && (
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
                        )}
                        
                        {/* PMID */}
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
                        
                        {/* Publication Date */}
                        {paper.publicationDate && getISODate(paper.publicationDate) && (
                            <time dateTime={getISODate(paper.publicationDate)} className="whitespace-nowrap">
                                {formatDate(paper.publicationDate)}
                            </time>
                        )}
                        
                        {/* RSS Feed Source */}
                        {isRssFeed && (
                            <span className="flex items-center gap-1 text-white/40 ml-auto">
                                <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    viewBox="0 0 24 24" 
                                    width="14" 
                                    height="14" 
                                    fill="currentColor" 
                                    className="text-orange-400"
                                >
                                    <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
                                </svg>
                                <span>{feedSource}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 