import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import { Repository } from 'typeorm';
import { Paper } from '../../models/Paper';
import { delay } from '../../utils/delay';
import { ObjectId } from 'mongodb';

export interface PubMedCrawlerConfig {
    maxPapers: number;
    searchTerm?: string;
    maxRetries: number;
    retryDelay: number;
    rateLimit: number;
    maxPages: number;
    selectors: {
        articleContainer: string;
        title: string;
        abstract: string;
        authors: string;
        doi: string;
        url: string;
        publicationDate: string;
        keywords?: string;
        categories?: string;
        nextPage: string;
    };
    patterns?: {
        doi?: string;
        date?: string;
        title?: string;
    };
    filters?: {
        minYear?: number;
        excludeKeywords?: string[];
        includeKeywords?: string[];
    };
}

interface ExtractedPaper {
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
    publicationDate?: Date;
    keywords?: string[];
    categories?: string[];
    url: string;
}

export class PubMedCrawler {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private isClosing = false;
    private totalPapersFound = 0;
    private currentPage = 1;
    private papersProcessed: Set<string> = new Set();
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 3;
    
    private readonly defaultConfig: PubMedCrawlerConfig = {
        maxPapers: 100,
        maxRetries: 3,
        retryDelay: 5000,
        rateLimit: 3,
        maxPages: 10,
        selectors: {
            articleContainer: '.docsum-content',
            title: '.docsum-title',
            abstract: '.full-view-abstract',
            authors: '.docsum-authors',
            doi: '.docsum-pmid',
            url: '.docsum-title',
            publicationDate: '.docsum-journal-citation',
            nextPage: '.next-page'
        }
    };

    private config: PubMedCrawlerConfig;

    constructor(
        private readonly paperRepository: Repository<Paper>,
        config: Partial<PubMedCrawlerConfig> = {}
    ) {
        this.config = { ...this.defaultConfig, ...config };
    }

    /**
     * Initialize the browser
     */
    private async initialize(): Promise<void> {
        try {
            if (this.browser) {
                try {
                    await this.browser.close();
                } catch (error) {
                    console.log("Error closing existing browser:", error);
                }
            }

            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            });

            // Handle browser disconnection
            this.browser.on('disconnected', async () => {
                if (!this.isClosing) {
                    console.log('Browser disconnected. Attempting to reconnect...');
                    await this.handleDisconnection();
                }
            });

            this.reconnectAttempts = 0;
            console.log("Puppeteer browser initialized");
        } catch (error) {
            console.error("Failed to initialize Puppeteer:", error);
            throw error;
        }
    }

    /**
     * Handle browser disconnection with reconnection attempts
     */
    private async handleDisconnection(): Promise<void> {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error('Max reconnection attempts reached. Stopping crawler.');
            this.isClosing = true;
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);

        try {
            await delay(this.config.retryDelay);
            await this.initialize();
        } catch (error) {
            console.error('Failed to reconnect:', error);
            await this.handleDisconnection();
        }
    }

    /**
     * Ensure browser is connected
     */
    private async ensureBrowser(): Promise<Browser> {
        if (!this.browser || !this.browser.isConnected()) {
            await this.initialize();
        }
        return this.browser!;
    }

    /**
     * Set up a new page with optimal settings
     */
    private async setupPage(browser: Browser): Promise<Page> {
        this.page = await browser.newPage();
        
        // Set extra headers for a more realistic browser
        await this.page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0'
        });

        // Set viewport and timeout
        await this.page.setViewport({ width: 1920, height: 1080 });
        this.page.setDefaultTimeout(60000);

        // Set PubMed-specific cookie
        await this.page.setCookie({
            name: 'ncbi_sid',
            value: Date.now().toString(),
            domain: '.ncbi.nlm.nih.gov'
        });

        // Enable request interception
        await this.page.setRequestInterception(true);

        // Handle requests - block unnecessary resources
        this.page.on('request', async (request) => {
            const resourceType = request.resourceType();
            const url = request.url();

            // Allow only essential resources
            if (
                resourceType === 'document' ||
                resourceType === 'xhr' ||
                resourceType === 'fetch' ||
                resourceType === 'script' ||
                (resourceType === 'stylesheet' && url.includes('pubmed.ncbi.nlm.nih.gov'))
            ) {
                try {
                    await request.continue();
                } catch (error) {
                    console.log('Request continuation failed:', error);
                }
            } else {
                try {
                    await request.abort();
                } catch (error) {
                    console.log('Request abortion failed:', error);
                }
            }
        });

        // Handle page errors
        this.page.on('error', error => {
            console.error('Page error:', error);
        });

        // Handle console messages
        this.page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warning') {
                console.log(`Page ${msg.type()}:`, msg.text());
            }
        });

        return this.page;
    }

    /**
     * Build the initial PubMed search URL
     */
    private buildInitialUrl(): string {
        const baseUrl = 'https://pubmed.ncbi.nlm.nih.gov/';
        const searchTerm = this.config.searchTerm || 
            '(glycine+OR+neurotransmitter+OR+amino+acid)';
        return `${baseUrl}?term=${encodeURIComponent(searchTerm)}&size=100`;
    }

    /**
     * Main crawl method to start the crawling process
     */
    async crawl(): Promise<void> {
        this.isClosing = false;
        this.totalPapersFound = 0;
        this.currentPage = 1;
        
        try {
            await this.initialize();
            const browser = await this.ensureBrowser();
            const page = await this.setupPage(browser);
            
            let currentUrl = this.buildInitialUrl();
            let retryCount = 0;
            
            while (
                currentUrl && 
                !this.isClosing && 
                this.currentPage <= this.config.maxPages && 
                this.totalPapersFound < this.config.maxPapers
            ) {
                console.log(`Crawling PubMed - Page ${this.currentPage}/${this.config.maxPages} - Found ${this.totalPapersFound}/${this.config.maxPapers} papers`);
                
                try {
                    // Navigate to the current URL
                    await this.navigateToPage(page, currentUrl);
                    
                    // Take a screenshot for debugging
                    await page.screenshot({ path: `debug-PubMed-${Date.now()}.png` });
                    
                    // Extract papers
                    const papers = await this.extractPapers(page);
                    console.log(`Found ${papers.length} papers on current page`);
                    
                    let newPapersFound = 0;
                    
                    // Process each paper
                    for (const paper of papers) {
                        if (this.shouldProcessPaper(paper)) {
                            await this.processPaper(paper);
                            newPapersFound++;
                            
                            if (this.totalPapersFound >= this.config.maxPapers) {
                                console.log(`Reached target papers (${this.config.maxPapers})`);
                                break;
                            }
                        }
                    }
                    
                    console.log(`Processed ${newPapersFound} new papers from page ${this.currentPage}`);
                    
                    // Reset retry count after successful page processing
                    retryCount = 0;
                    
                    // Get the next page URL
                    if (this.totalPapersFound < this.config.maxPapers) {
                        const nextUrl = await this.getNextPageUrl(page);
                        if (!nextUrl) {
                            console.log(`No more pages available for PubMed`);
                            break;
                        }
                        currentUrl = nextUrl;
                        this.currentPage++;
                        
                        // Apply rate limiting between pages
                        await this.applyRateLimit();
                    }
                } catch (error) {
                    console.error(`Error processing page ${this.currentPage}:`, error);
                    retryCount++;
                    
                    if (retryCount > this.config.maxRetries) {
                        console.error('Max retries exceeded, stopping crawler');
                        break;
                    }
                    
                    console.log(`Retrying page ${this.currentPage} (attempt ${retryCount}/${this.config.maxRetries})`);
                    await delay(this.config.retryDelay);
                }
            }
        } catch (error) {
            console.error('Crawler error:', error);
        } finally {
            await this.close();
        }
    }
    
    /**
     * Navigate to a specific page with proper waiting and error handling
     */
    private async navigateToPage(page: Page, url: string): Promise<void> {
        console.log(`Navigating to ${url}`);
        
        try {
            // Navigate with increased timeout
            await page.goto(url, { 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 120000 // 2 minutes
            });
            
            // Wait longer for dynamic content to load
            await delay(10000);
            
            // Wait for articles to be present
            await this.waitForSelector(page, this.config.selectors.articleContainer);
            
            console.log('Page loaded successfully');
        } catch (error) {
            console.error('Navigation failed:', error);
            
            // Take screenshot of failure
            await page.screenshot({ path: `error-PubMed-${Date.now()}.png` });
            
            // Get page content for debugging
            const content = await page.content();
            console.log('Page content (first 500 chars):', content.substring(0, 500));
            
            throw error;
        }
    }
    
    /**
     * Extract papers from the current page
     */
    private async extractPapers(page: Page): Promise<ExtractedPaper[]> {
        try {
            // Wait for the article container with increased timeout
            await this.waitForSelector(page, this.config.selectors.articleContainer);
            
            // Check if we have any results
            const hasResults = await page.evaluate((selector) => {
                const articles = document.querySelectorAll(selector);
                return articles.length > 0;
            }, this.config.selectors.articleContainer);
            
            if (!hasResults) {
                console.log(`No articles found at current page`);
                return [];
            }
            
            // Extract papers using page.evaluate
            return page.evaluate((selectors, patterns) => {
                const papers: ExtractedPaper[] = [];
                const articles = document.querySelectorAll(selectors.articleContainer);
                console.log(`Found ${articles.length} article elements`);
                
                // Helper function to extract text content
                const extractText = (element: Element, selector: string): string => {
                    const el = element.querySelector(selector);
                    return el?.textContent?.trim() || '';
                };
                
                // Helper function to extract URL
                const extractUrl = (element: Element, selector: string): string => {
                    const el = element.querySelector(selector) as HTMLAnchorElement;
                    if (!el || !el.href) return '';
                    return el.href;
                };
                
                // Helper function to apply pattern
                const applyPattern = (text: string, pattern?: string): string => {
                    if (!text || !pattern) return text;
                    try {
                        const regex = new RegExp(pattern);
                        const match = text.match(regex);
                        return match && match[1] ? match[1] : text;
                    } catch (e) {
                        console.error('Pattern matching error:', e);
                        return text;
                    }
                };
                
                articles.forEach((article: Element, index: number) => {
                    try {
                        // Extract basic data
                        const title = extractText(article, selectors.title);
                        const authorText = extractText(article, selectors.authors);
                        const authors = authorText.split(',').map(a => a.trim()).filter(Boolean);
                        const doiText = extractText(article, selectors.doi);
                        const doi = applyPattern(doiText, patterns?.doi || 'PMID:\\s*(\\d+)');
                        
                        let url = extractUrl(article, selectors.url);
                        if (!url && doi) {
                            url = `https://pubmed.ncbi.nlm.nih.gov/${doi}/`;
                        }
                        
                        // Extract date if available
                        let publicationDate: Date | undefined;
                        const dateText = extractText(article, selectors.publicationDate);
                        if (dateText) {
                            const yearMatch = dateText.match(patterns?.date || '\\b(\\d{4})\\b');
                            if (yearMatch && yearMatch[1]) {
                                publicationDate = new Date(yearMatch[1]);
                            }
                        }
                        
                        // Extract keywords and categories if available
                        const keywords = selectors.keywords ? 
                            extractText(article, selectors.keywords).split(',').map(k => k.trim()).filter(Boolean) :
                            [];
                            
                        const categories = selectors.categories ?
                            extractText(article, selectors.categories).split(',').map(c => c.trim()).filter(Boolean) :
                            [];
                        
                        // For PubMed, we need to extract abstract in a different way
                        // We'll fetch it separately when processing individual papers
                        const abstract = 'Abstract will be fetched separately';
                        
                        // Validate required fields
                        if (title && doi && url) {
                            papers.push({
                                title,
                                abstract,
                                authors,
                                doi,
                                publicationDate,
                                keywords,
                                categories,
                                url
                            });
                        }
                    } catch (error) {
                        console.error(`Error extracting paper ${index}:`, error);
                    }
                });
                
                return papers;
            }, this.config.selectors, this.config.patterns || {});
        } catch (error) {
            console.error('Error extracting papers:', error);
            return [];
        }
    }

    /**
     * Determine if a paper should be processed based on filters
     */
    private shouldProcessPaper(paper: ExtractedPaper): boolean {
        // Skip already processed papers
        if (this.papersProcessed.has(paper.doi)) {
            return false;
        }
        
        // Apply filters if configured
        if (this.config.filters) {
            // Check publication year
            if (this.config.filters.minYear && paper.publicationDate) {
                const year = paper.publicationDate.getFullYear();
                if (year < this.config.filters.minYear) {
                    return false;
                }
            }
            
            // Check excluded keywords
            if (this.config.filters.excludeKeywords?.length) {
                const lowerContent = (paper.title + ' ' + paper.abstract).toLowerCase();
                if (this.config.filters.excludeKeywords.some(kw => 
                    lowerContent.includes(kw.toLowerCase())
                )) {
                    return false;
                }
            }
            
            // Check included keywords
            if (this.config.filters.includeKeywords?.length) {
                const lowerContent = (paper.title + ' ' + paper.abstract).toLowerCase();
                if (!this.config.filters.includeKeywords.some(kw => 
                    lowerContent.includes(kw.toLowerCase())
                )) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    /**
     * Process a single paper, fetching its abstract and saving it
     */
    private async processPaper(paper: ExtractedPaper): Promise<void> {
        try {
            // For PubMed, we need to fetch the abstract separately
            if (paper.abstract === 'Abstract will be fetched separately') {
                paper.abstract = await this.fetchAbstract(paper.url);
            }
            
            // Create a new Paper entity
            const paperEntity = new Paper({
                title: paper.title,
                abstract: paper.abstract || 'Abstract not available',
                authors: paper.authors,
                doi: paper.doi,
                url: paper.url,
                publicationDate: paper.publicationDate,
                keywords: paper.keywords,
                categories: paper.categories,
                isProcessed: false,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            // Generate ObjectId
            paperEntity._id = new ObjectId();
            
            // Save to repository
            await this.paperRepository.save(paperEntity);
            this.papersProcessed.add(paper.doi);
            this.totalPapersFound++;
            
            console.log(`Successfully saved paper: ${paper.title} (DOI: ${paper.doi})`);
        } catch (error) {
            console.error(`Error processing paper ${paper.title}:`, error);
            throw error;
        }
    }
    
    /**
     * Fetch the abstract for a specific paper
     */
    private async fetchAbstract(url: string): Promise<string> {
        try {
            const browser = await this.ensureBrowser();
            const page = await browser.newPage();
            
            // Set viewport and timeout
            await page.setViewport({ width: 1280, height: 800 });
            page.setDefaultTimeout(30000);
            
            // Navigate to paper URL
            await page.goto(url, { 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 60000
            });
            
            // Wait for abstract to be present
            await page.waitForSelector(this.config.selectors.abstract, { 
                timeout: 30000 
            }).catch(() => null);
            
            // Extract abstract
            const abstract = await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                return element?.textContent?.trim() || 'Abstract not available';
            }, this.config.selectors.abstract);
            
            await page.close();
            return abstract;
        } catch (error) {
            console.error('Error fetching abstract:', error);
            return 'Failed to fetch abstract';
        }
    }
    
    /**
     * Get the URL for the next page
     */
    private async getNextPageUrl(page: Page): Promise<string | null> {
        try {
            // Check if we have a next page button
            const hasNextPage = await page.evaluate((selector) => {
                const nextButton = document.querySelector(selector) as HTMLAnchorElement;
                return nextButton && nextButton.href ? true : false;
            }, this.config.selectors.nextPage);
            
            if (!hasNextPage) {
                return null;
            }
            
            // Get the next page URL
            const nextPageUrl = await page.evaluate((selector) => {
                const nextButton = document.querySelector(selector) as HTMLAnchorElement;
                return nextButton ? nextButton.href : null;
            }, this.config.selectors.nextPage);
            
            return nextPageUrl;
        } catch (error) {
            console.error('Error getting next page URL:', error);
            return null;
        }
    }
    
    /**
     * Apply rate limiting between requests
     */
    private async applyRateLimit(): Promise<void> {
        // Calculate delay based on rate limit with some randomness
        const baseDelay = Math.floor(60000 / this.config.rateLimit);
        const jitter = Math.floor(Math.random() * 3000); // Random delay between 0-3s
        await delay(baseDelay + jitter);
    }
    
    /**
     * Wait for selector with retry
     */
    private async waitForSelector(page: Page, selector: string): Promise<void> {
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
            try {
                await page.waitForSelector(selector, { 
                    timeout: 30000,
                    visible: true 
                });
                return;
            } catch (error) {
                retries++;
                console.log(`Selector "${selector}" not found, retry ${retries}/${maxRetries}`);
                if (retries >= maxRetries) throw error;
                await delay(2000);
            }
        }
    }
    
    /**
     * Close the browser and cleanup
     */
    async close(): Promise<void> {
        this.isClosing = true;
        try {
            if (this.page && !this.page.isClosed()) {
                await this.page.close();
            }
            if (this.browser) {
                await this.browser.close();
            }
        } catch (error) {
            console.error('Error closing browser:', error);
        } finally {
            this.page = null;
            this.browser = null;
        }
    }
    
    /**
     * Get the current status of the crawler
     */
    getStatus() {
        return {
            isRunning: !this.isClosing,
            currentSource: 'PubMed',
            currentPage: this.currentPage,
            papersFound: this.totalPapersFound,
            targetPapers: this.config.maxPapers
        };
    }
} 