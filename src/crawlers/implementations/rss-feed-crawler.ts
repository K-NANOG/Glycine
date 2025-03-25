import { ICrawlerStrategy } from '../base/crawler-strategy.interface';
import { Repository } from 'typeorm';
import { Paper } from '../../models/Paper';
import Parser from 'rss-parser';
import { IBrowserAdapter } from '../browser/browser-adapter.interface';

interface RSSFeed {
    url: string;
    name: string;
    lastFetched?: Date;
    status: 'active' | 'error' | 'inactive';
    errorMessage?: string;
}

export interface RSSItem {
    title: string;
    link: string;
    pubDate?: string;
    creator?: string;
    content?: string;
    contentSnippet?: string;
    guid?: string;
    categories?: string[];
    isoDate?: string;
    authors?: Array<{ name: string }>;
    author?: string;
}

interface ExtractedPaperData {
    title?: string;
    abstract?: string;
    authors?: string[] | string;
    doi?: string;
    url?: string;
    publicationDate?: Date | string;
    keywords?: string[] | string;
    categories?: string[] | string;
    date?: string | Date;
    feedName?: string;
    isRssFeed?: boolean;
    metadata?: Record<string, any>;
}

export class RSSFeedCrawler implements ICrawlerStrategy {
    protected status = {
        isRunning: false,
        currentSource: '',
        currentPage: 0,
        papersFound: 0,
        targetPapers: 0,
        error: null as Error | null
    };

    protected isClosing = false;
    protected papersProcessed: Set<string> = new Set();
    protected feedHealth: Map<string, { lastFetched: Date, status: string, errorMessage?: string }> = new Map();
    
    public readonly name: string = 'RSS Feeds';
    
    private parser: Parser;
    private feeds: RSSFeed[] = [];
    private maxRetries = 3;
    private retryDelay = 3000;

    public readonly browserAdapter: IBrowserAdapter;

    constructor(
        browserAdapter: IBrowserAdapter,
        public readonly paperRepository: Repository<Paper>
    ) {
        this.browserAdapter = browserAdapter;
        
        this.parser = new Parser({
            customFields: {
                item: [
                    ['dc:creator', 'creator'],
                    ['content:encoded', 'content']
                ]
            }
        });
    }

    async initialize(): Promise<void> {
        console.log('Initializing RSS Feed crawler');
        this.status.isRunning = false;
        this.isClosing = false;
        this.papersProcessed.clear();
    }

    setFeeds(feeds: RSSFeed[]): void {
        // Defensively ensure feeds is a valid array
        if (Array.isArray(feeds)) {
            // Only include feed items that have valid URLs and names
            this.feeds = feeds.filter(feed => 
                feed && 
                typeof feed.url === 'string' && 
                feed.url.trim() !== '' &&
                typeof feed.name === 'string' && 
                feed.name.trim() !== ''
            );
            console.log(`Set ${this.feeds.length} valid RSS feeds`);
        } else {
            console.warn('Attempted to set feeds with invalid data:', feeds);
            this.feeds = [];
        }
    }

    getFeedHealth(): Map<string, { lastFetched: Date, status: string, errorMessage?: string }> {
        return this.feedHealth;
    }

    async crawl(config: any): Promise<void> {
        if (this.isClosing) {
            console.log('RSS Feed crawler is closing, cannot start crawling');
            return;
        }

        if (this.status.isRunning) {
            console.log('RSS Feed crawler is already running');
            return;
        }

        console.log('Starting RSS Feed crawling');
        this.status.isRunning = true;
        this.status.papersFound = 0;
        this.status.currentSource = 'RSS Feeds';

        try {
            // Ensure feeds array is properly initialized
            if (!Array.isArray(this.feeds) || this.feeds.length === 0) {
                console.warn('No RSS feeds configured or feeds array is invalid');
                this.status.isRunning = false;
                return;
            }

            // Process each feed
            let totalProcessed = 0;
            for (const feed of this.feeds) {
                if (this.isClosing) {
                    console.log('RSS Feed crawler is closing, stopping crawl');
                    break;
                }

                // Skip invalid feeds
                if (!feed || !feed.url || typeof feed.url !== 'string' || !feed.name) {
                    console.warn('Skipping invalid feed:', feed);
                    continue;
                }

                try {
                    console.log(`Processing feed: ${feed.name} (${feed.url})`);
                    const items = await this.fetchFeed(feed.url);
                    console.log(`Found ${items.length} items in feed ${feed.name}`);
                    
                    const papers = await this.processFeedItems(items, feed.name, config?.filters);
                    totalProcessed += papers;
                    
                    // Update feed health
                    this.feedHealth.set(feed.url, {
                        lastFetched: new Date(),
                        status: 'active'
                    });
                    
                    // Apply rate limiting between feeds
                    if (!this.isClosing) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`Error processing feed ${feed.name}:`, error);
                    // Update feed health with error
                    this.feedHealth.set(feed.url, {
                        lastFetched: new Date(),
                        status: 'error',
                        errorMessage: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            this.status.papersFound = totalProcessed;
            console.log(`RSS Feed crawling completed. Found ${totalProcessed} papers.`);
        } catch (error) {
            console.error('Error during RSS feed crawling:', error);
            this.status.error = error instanceof Error ? error : new Error(String(error));
        } finally {
            this.status.isRunning = false;
        }
    }

    private async fetchFeed(feedUrl: string): Promise<RSSItem[]> {
        try {
            // Validate feed URL
            if (!feedUrl || typeof feedUrl !== 'string') {
                console.error('Invalid feed URL:', feedUrl);
                return [];
            }

            // Ensure the URL is properly formatted
            let processedUrl = feedUrl.trim();
            if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
                processedUrl = `https://${processedUrl}`;
            }

            console.log(`Fetching RSS feed: ${processedUrl}`);
            
            try {
                console.log(`Using parser to fetch feed: ${processedUrl}`);
                const feed = await this.parser.parseURL(processedUrl);
                
                // Ensure items is an array
                if (!feed) {
                    console.warn(`Feed at ${processedUrl} returned null or undefined data`);
                    return [];
                }
                
                if (!Array.isArray(feed.items)) {
                    console.warn(`Feed at ${processedUrl} has no items array`);
                    console.warn('Feed structure:', Object.keys(feed));
                    return [];
                }
                
                console.log(`Successfully parsed feed at ${processedUrl}, found ${feed.items.length} items`);
                console.log(`Feed title: ${feed.title || 'No title'}, description: ${feed.description?.substring(0, 100) || 'No description'}`);
                
                if (feed.items.length > 0) {
                    console.log(`First item title: ${feed.items[0].title || 'No title'}`);
                }
                
                // Cast to RSSItem[] to address TypeScript errors
                return feed.items as unknown as RSSItem[];
            } catch (parseError) {
                console.error(`Error parsing feed ${processedUrl}:`, parseError);
                if (parseError instanceof Error) {
                    console.error(`Error details: ${parseError.message}`);
                    console.error(`Stack trace: ${parseError.stack}`);
                }
                
                // Attempt to diagnose common issues
                try {
                    // Use https module instead of node-fetch to avoid TypeScript errors
                    const https = await import('https');
                    const http = await import('http');
                    
                    console.log(`Attempting direct fetch of feed to diagnose issues: ${processedUrl}`);
                    
                    // Create a promise-based request
                    const request = (url: string): Promise<string> => {
                        return new Promise((resolve, reject) => {
                            const client = url.startsWith('https') ? https : http;
                            const req = client.get(url, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                                }
                            }, (response) => {
                                if (response.statusCode !== 200) {
                                    console.error(`Feed fetch returned status ${response.statusCode}: ${response.statusMessage}`);
                                    reject(new Error(`HTTP error: ${response.statusCode}`));
                                    return;
                                }
                                
                                let data = '';
                                response.on('data', (chunk) => {
                                    data += chunk;
                                });
                                
                                response.on('end', () => {
                                    resolve(data);
                                });
                            });
                            
                            req.on('error', (error) => {
                                reject(error);
                            });
                            
                            req.end();
                        });
                    };
                    
                    try {
                        const text = await request(processedUrl);
                        console.log(`Feed response length: ${text.length} bytes`);
                        console.log(`Feed response begins with: ${text.substring(0, 200)}`);
                    } catch (requestError) {
                        console.error(`Request failed: ${requestError}`);
                    }
                } catch (fetchError) {
                    console.error(`Failed to diagnose feed issues: ${fetchError}`);
                }
                
                return [];
            }
        } catch (error) {
            console.error(`Error fetching feed ${feedUrl}:`, error);
            if (error instanceof Error) {
                console.error(`Error details: ${error.message}`);
                console.error(`Stack trace: ${error.stack}`);
            }
            return []; // Return empty array instead of throwing to make crawler more resilient
        }
    }

    private async processFeedItems(
        items: RSSItem[], 
        feedName: string, 
        filters?: any
    ): Promise<number> {
        let processed = 0;
        
        // Ensure items is a valid array
        if (!Array.isArray(items)) {
            console.warn('Received invalid items array for processing');
            return 0;
        }
        
        console.log(`Processing ${items.length} items from feed: ${feedName}`);
        
        for (const item of items) {
            if (this.isClosing) break;
            
            // Skip invalid items
            if (!item || !item.title || !item.link) {
                console.warn('Skipping invalid RSS item (missing title or link)');
                continue;
            }
            
            try {
                // Convert RSS item to paper data format
                const paperData = this.convertRssItemToPaper(item, feedName);
                
                // Skip items with missing required data
                if (!paperData.title || !paperData.doi) {
                    console.warn('Skipping RSS item with missing required data');
                    continue;
                }
                
                // Apply filters if any
                if (filters && !this.matchesFilters(paperData, filters)) {
                    continue;
                }
                
                // Create paper entity
                const paper = await this.createPaper(paperData);
                if (paper) {
                    processed++;
                    this.papersProcessed.add(paper.doi);
                }
            } catch (error) {
                console.error(`Error processing RSS item: ${item.title || 'Unknown title'}:`, error);
            }
        }
        
        return processed;
    }

    private convertRssItemToPaper(item: RSSItem, feedName: string): ExtractedPaperData {
        try {
            // Validate inputs
            if (!item) {
                throw new Error('Invalid RSS item');
            }
            
            // Ensure we have title and link (required fields)
            const rawTitle = item.title || 'Untitled';
            const link = item.link || '';
            if (!link) {
                throw new Error('RSS item missing required link');
            }
            
            // Clean title of HTML tags
            const title = this.cleanTextContent(rawTitle);
            
            // Extract author information
            let authors: string[] = [];
            if (item.authors && Array.isArray(item.authors) && item.authors.length > 0) {
                authors = item.authors
                    .filter(a => a && typeof a.name === 'string')
                    .map(a => this.cleanTextContent(a.name.trim()))
                    .filter(name => name !== '');
            } else if (item.author && typeof item.author === 'string') {
                authors = [this.cleanTextContent(item.author.trim())];
            } else if (item.creator && typeof item.creator === 'string') {
                authors = [this.cleanTextContent(item.creator.trim())];
            }
            
            // If no authors found, use a placeholder
            if (authors.length === 0) {
                authors = [`${feedName} Publisher`];
            }
            
            // Generate a unique identifier for the RSS item that's not exposed as a DOI
            // Prefer guid if available, otherwise use link
            const guid = (item.guid && typeof item.guid === 'string') ? item.guid : link;
            
            // Create shorter, cleaner identifier for database - generate a hash but keep it short
            const idHash = require('crypto')
                .createHash('md5')
                .update(guid)
                .digest('hex')
                .substring(0, 12);
            
            const doi = `rss-${idHash}`;
            
            // Get and clean content (prefer contentSnippet as it's usually cleaner text)
            let abstract = '';
            if (item.contentSnippet && typeof item.contentSnippet === 'string') {
                abstract = this.cleanAbstractContent(item.contentSnippet, feedName);
            } else if (item.content && typeof item.content === 'string') {
                abstract = this.cleanAbstractContent(item.content, feedName);
            }
            
            // Parse categories if available
            let categories: string[] = [];
            if (item.categories && Array.isArray(item.categories)) {
                categories = item.categories
                    .filter(c => typeof c === 'string')
                    .map(c => this.cleanTextContent(c.trim()))
                    .filter(c => c !== '');
            }
            
            // Extract keywords from categories, titles, and content
            let keywords: string[] = [...categories]; // Start with categories as keywords
            
            // Add common research keywords from title and content
            const potentialKeywords = [
                'biology', 'genomics', 'bioinformatics', 'machine learning', 'artificial intelligence',
                'neural network', 'algorithm', 'computational', 'synthetic', 'data science', 'gene', 
                'protein', 'DNA', 'RNA', 'sequence', 'genetics', 'genetic', 'engineering', 'crispr',
                'sequencing', 'genome', 'metabolic', 'systems biology', 'molecular', 'cell', 'phylogenetic',
                'evolution', 'structural', 'predictive', 'model', 'deep learning', 'classification',
                'regression', 'clustering', 'big data', 'data mining', 'analysis', 'bioengineering'
            ];
            
            // Search title and abstract for potential keywords
            const contentText = (title + ' ' + abstract).toLowerCase();
            
            // Add any matching potential keywords
            potentialKeywords.forEach(keyword => {
                if (contentText.includes(keyword.toLowerCase())) {
                    keywords.push(keyword);
                }
            });
            
            // Remove duplicates
            keywords = [...new Set(keywords)];
            
            // Get publication date
            const publicationDate = (item.isoDate && typeof item.isoDate === 'string') 
                ? item.isoDate 
                : (item.pubDate && typeof item.pubDate === 'string') 
                    ? item.pubDate 
                    : new Date().toISOString();
            
            // Create metadata with additional information
            const metadata = {
                feedName,
                source: feedName,
                isRssFeed: true,
                publishedIn: feedName,
                sourceIdentifier: guid, // Store the original guid/link for reference
                fullSourceId: Buffer.from(guid).toString('base64').replace(/[+/=]/g, '') // Keep the full ID for uniqueness
            };
            
            return {
                title,
                abstract,
                authors,
                doi,
                url: link,
                publicationDate,
                categories,
                keywords,
                feedName,
                isRssFeed: true,
                metadata
            };
        } catch (error) {
            console.error('Error converting RSS item to paper:', error);
            // Return a minimal valid paper to prevent crashes
            return {
                title: this.cleanTextContent(item?.title || 'Untitled RSS Item'),
                abstract: '',
                authors: [`${feedName} Publisher`],
                doi: `rss-${Date.now().toString(36).substring(-4)}-${Math.random().toString(36).substring(2, 7)}`,
                url: item?.link || '',
                publicationDate: new Date(),
                categories: [],
                feedName,
                isRssFeed: true,
                metadata: {
                    feedName,
                    source: feedName,
                    isRssFeed: true
                }
            };
        }
    }

    /**
     * General method to clean text content by removing or interpreting HTML tags
     * Can be used for titles, author names, or any other text content
     */
    private cleanTextContent(content: string): string {
        if (!content) return '';
        
        // First attempt to intelligently handle specific HTML elements
        // These are common in scientific titles
        
        // Handle italics - replace with plain text but preserve the content
        content = content.replace(/<i>(.*?)<\/i>/g, '$1');
        
        // Handle superscript - replace with similar unicode characters when possible
        content = content.replace(/<sup>(.*?)<\/sup>/g, (match, p1) => {
            // Convert numbers in superscript to unicode superscript characters
            if (/^\d+$/.test(p1)) {
                return p1.split('').map((digit: string) => {
                    // Map 0-9 to superscript unicode characters
                    const superscriptMap: Record<string, string> = {
                        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
                    };
                    return superscriptMap[digit] || digit;
                }).join('');
            }
            // For other superscripts, append as regular characters
            return `^(${p1})`;
        });
        
        // Handle subscript - replace with similar unicode characters when possible
        content = content.replace(/<sub>(.*?)<\/sub>/g, (match, p1) => {
            // Convert numbers in subscript to unicode subscript characters
            if (/^\d+$/.test(p1)) {
                return p1.split('').map((digit: string) => {
                    // Map 0-9 to subscript unicode characters
                    const subscriptMap: Record<string, string> = {
                        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
                        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
                    };
                    return subscriptMap[digit] || digit;
                }).join('');
            }
            // For other subscripts, append as regular characters
            return `_(${p1})`;
        });
        
        // Handle bold text
        content = content.replace(/<b>(.*?)<\/b>/g, '$1');
        content = content.replace(/<strong>(.*?)<\/strong>/g, '$1');
        
        // Handle HTML entities
        content = content.replace(/&lt;/g, '<');
        content = content.replace(/&gt;/g, '>');
        content = content.replace(/&quot;/g, '"');
        content = content.replace(/&apos;/g, "'");
        content = content.replace(/&amp;/g, '&');
        
        // Special handling for HTML entity codes for Greek letters and math symbols
        content = content.replace(/&([a-z]+);/g, (match, entity) => {
            const entityMap: Record<string, string> = {
                'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ',
                'epsilon': 'ε', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ',
                'iota': 'ι', 'kappa': 'κ', 'lambda': 'λ', 'mu': 'μ',
                'nu': 'ν', 'xi': 'ξ', 'omicron': 'ο', 'pi': 'π',
                'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
                'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
                'plusmn': '±', 'times': '×', 'divide': '÷',
                'minus': '−', 'deg': '°', 'prime': '′'
            };
            
            return entityMap[entity] || match; // Keep the original if not in map
        });
        
        // Remove any remaining HTML tags
        content = content.replace(/<\/?[^>]+(>|$)/g, ' ');
        
        // Clean up multiple spaces and trim
        content = content.replace(/\s+/g, ' ').trim();
        
        return content;
    }

    /**
     * Clean abstract content by removing HTML tags and specific patterns
     */
    private cleanAbstractContent(content: string, feedName: string): string {
        if (!content) return '';
        
        // First do general text cleaning
        let cleaned = this.cleanTextContent(content);
        
        // Clean up Nature-specific format
        if (feedName.toLowerCase().includes('nature')) {
            // Remove "Nature, Published online: DD Month YYYY; doi:10.1038/..."
            cleaned = cleaned.replace(/Nature, Published online:.*?doi:[\d\.]+\/[^;]+;?/gi, '');
            cleaned = cleaned.replace(/Nature, Published online:.*?doi:[\d\.]+\/[^>]+>/gi, '');
        }
        
        // Remove any trailing DOI information
        cleaned = cleaned.replace(/\s*doi:[\d\.]+\/[\w\d\-\.]+\s*$/i, '');
        
        // For very short abstracts, check if they're just metadata and not useful content
        if (cleaned.length < 50 && (
            cleaned.includes('doi:') || 
            cleaned.includes('Published online') || 
            cleaned.includes('http') ||
            /^\s*\d+\s*$/.test(cleaned) // Just numbers
        )) {
            return ''; // Return empty string for useless metadata-only content
        }
        
        return cleaned;
    }

    private async createPaper(paperData: ExtractedPaperData): Promise<Paper | null> {
        try {
            // Check if already processed by DOI
            if (this.papersProcessed.has(paperData.doi || '')) {
                return null;
            }

            // For RSS items we need to check the full source ID since the doi is shortened
            if (paperData.metadata?.fullSourceId) {
                if (this.papersProcessed.has(paperData.metadata.fullSourceId)) {
                    return null;
                }
            }

            // Check if paper already exists in the database
            const existing = await this.paperRepository.findOne({
                where: { doi: paperData.doi }
            });

            if (existing) {
                this.papersProcessed.add(existing.doi);
                // Also add the full source ID if available
                if (paperData.metadata?.fullSourceId) {
                    this.papersProcessed.add(paperData.metadata.fullSourceId);
                }
                return null;
            }

            // Create new paper entity
            const paper = new Paper();
            paper.title = paperData.title || 'Untitled';
            paper.abstract = paperData.abstract || '';
            paper.authors = Array.isArray(paperData.authors) 
                ? paperData.authors 
                : typeof paperData.authors === 'string'
                    ? [paperData.authors]
                    : [];
            paper.doi = paperData.doi || '';
            paper.url = paperData.url || '';
            
            if (paperData.publicationDate) {
                paper.publicationDate = new Date(paperData.publicationDate);
            }
            
            if (paperData.categories) {
                paper.categories = Array.isArray(paperData.categories)
                    ? paperData.categories
                    : [paperData.categories];
            }
            
            if (paperData.keywords) {
                paper.keywords = Array.isArray(paperData.keywords)
                    ? paperData.keywords
                    : [paperData.keywords];
            }
            
            // Add RSS feed metadata - use only properties that are compatible with Paper.metadata type
            paper.metadata = {
                journal: paperData.feedName || 'RSS Feed',
                publisher: 'RSS',
                doi: `rss:${paperData.doi}` // Store RSS information in a valid metadata field
            };
            
            // Store the RSS feed custom metadata in a separate column or property
            // We could create a custom field for this information or handle it differently in the UI
            // For now, we'll create a keywords entry to identify RSS items
            if (!paper.keywords) {
                paper.keywords = [];
            }
            
            // Add RSS keyword for identifying RSS feed items
            paper.keywords.push('RSS Feed');
            
            // If we have a feed name, add it as a keyword/category for filtering
            if (paperData.feedName) {
                paper.keywords.push(`Source: ${paperData.feedName}`);
                
                if (!paper.categories) {
                    paper.categories = [];
                }
                paper.categories.push(paperData.feedName);
            }
            
            // Save to database
            await this.paperRepository.save(paper);
            this.papersProcessed.add(paper.doi);
            
            // Also add the full source ID to processed set if available
            if (paperData.metadata?.fullSourceId) {
                this.papersProcessed.add(paperData.metadata.fullSourceId);
            }
            
            return paper;
        } catch (error) {
            console.error('Error creating paper from RSS item:', error);
            return null;
        }
    }

    private matchesFilters(paperData: ExtractedPaperData, filters?: any): boolean {
        if (!filters) return true;
        
        // Match by keywords
        if (filters.keywords && filters.keywords.length > 0) {
            // Collect all text to search in (title, abstract, and categories combined)
            const content = [
                paperData.title || '',
                paperData.abstract || '',
                ...(Array.isArray(paperData.categories) ? paperData.categories : []),
                ...(Array.isArray(paperData.keywords) ? paperData.keywords : []),
                typeof paperData.categories === 'string' ? paperData.categories : '',
                typeof paperData.keywords === 'string' ? paperData.keywords : ''
            ].filter(Boolean).join(' ').toLowerCase();
            
            // Log what we're checking
            console.log(`Checking if "${paperData.title}" matches keywords:`, filters.keywords);
            
            // Define related terms for broader matching
            const relatedTerms: Record<string, string[]> = {
                'bioinformatics': ['genomics', 'proteomics', 'computational biology', 'genome', 'sequencing', 'dna', 'rna', 'protein', 'gene', 'genetic', 'sequence', 'alignment', 'phylogenetic'],
                'machine learning': ['neural network', 'deep learning', 'artificial intelligence', 'ai', 'model', 'prediction', 'classification', 'regression', 'algorithm', 'training', 'supervised', 'unsupervised', 'reinforcement', 'data mining'],
                'synthetic biology': ['gene editing', 'crispr', 'genetic engineering', 'genetic circuit', 'metabolic engineering', 'bioengineering', 'biosynthesis', 'recombinant', 'plasmid', 'vector', 'expression system', 'chassis organism'],
                'xenobiology': ['artificial life', 'synthetic cell', 'unnatural', 'xna', 'alternative biochemistry', 'expanded genetic code', 'non-standard amino acid']
            };
            
            // Check if any keyword or related term is present
            const matchingKeywords: string[] = [];
            
            for (const keyword of filters.keywords) {
                if (!keyword) continue;
                
                const keywordLower = keyword.toLowerCase();
                
                // Direct match
                if (content.includes(keywordLower)) {
                    matchingKeywords.push(keyword);
                    continue;
                }
                
                // Check for related terms
                const related = relatedTerms[keywordLower] || [];
                for (const term of related) {
                    if (content.includes(term)) {
                        matchingKeywords.push(`${keyword} (via related term: ${term})`);
                        break;
                    }
                }
                
                // Check for partial matches (for longer terms like "synthetic biology")
                if (keywordLower.includes(' ') && keywordLower.length > 10) {
                    const parts = keywordLower.split(' ');
                    if (parts.some((part: string) => part.length > 4 && content.includes(part))) {
                        matchingKeywords.push(`${keyword} (via partial match)`);
                    }
                }
            }
            
            const matches = matchingKeywords.length > 0;
            
            if (!matches) {
                console.log(`Paper "${paperData.title}" excluded - does not match any keywords`);
                return false;
            } else {
                console.log(`Paper "${paperData.title}" matches keywords: ${matchingKeywords.join(', ')}`);
                return true;
            }
        }
        
        // Match by date range
        if (filters.dateRange && paperData.publicationDate) {
            try {
                const pubDate = new Date(paperData.publicationDate);
                if (
                    (filters.dateRange.start && pubDate < new Date(filters.dateRange.start)) ||
                    (filters.dateRange.end && pubDate > new Date(filters.dateRange.end))
                ) {
                    console.log(`Paper "${paperData.title}" excluded - outside date range`);
                    return false;
                }
            } catch (error) {
                console.warn(`Error parsing date for paper "${paperData.title}":`, error);
                // Continue even if date parsing fails
            }
        }
        
        return true;
    }

    async cleanup(): Promise<void> {
        console.log('Cleaning up RSS Feed crawler');
        this.isClosing = true;
        this.status.isRunning = false;
    }
} 