import puppeteer, { Page, Browser, ElementHandle } from 'puppeteer';
import { Paper } from '../models/Paper';
import { Repository } from 'typeorm';
import { delay } from '../utils/delay';
import { ObjectId } from 'mongodb';

export interface CrawlerConfig {
    sources: {
        name: string;
        url: string;
        selectors: {
            title: string;
            abstract: string;
            authors: string;
            doi: string;
            date?: string;
            categories?: string;
            keywords?: string;
            nextPage?: string;
            articleContainer: string;
            url: string;
        };
        patterns?: {
            title?: string | null;
            doi?: string;
            date?: string;
        };
        rateLimit?: number;
        maxPages: number;
        extraHeaders?: Record<string, string>;
    }[];
    filters?: {
        dateRange?: {
            start: Date;
            end: Date;
        };
        keywords?: string[];
        categories?: string[];
    };
    retryOptions?: {
        maxRetries: number;
        delayMs: number;
    };
    maxPapers: number;
    selectedSources?: string[];
}

interface ExtractedData {
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
    publicationDate?: Date;
    keywords?: string[];
    categories?: string[];
    url: string;
}

type SourceConfig = CrawlerConfig['sources'][0];

export class PaperCrawler {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private readonly defaultRetryOptions = {
        maxRetries: 3,
        delayMs: 1000,
    };
    private totalPapersFound = 0;
    private isClosing = false;
    private currentSource = '';
    private currentPage = 0;
    private targetPapers = 0;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 3;
    private readonly reconnectDelay = 5000;
    private papersProcessed: Set<string> = new Set();
    
    constructor(
        private readonly paperRepository: Repository<Paper>,
        private readonly config: CrawlerConfig
    ) {
        this.targetPapers = config.maxPapers;
    }

    async initialize(): Promise<void> {
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

    private async handleDisconnection(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached. Stopping crawler.');
            this.isClosing = true;
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

        try {
            await delay(this.reconnectDelay);
            await this.initialize();
        } catch (error) {
            console.error('Failed to reconnect:', error);
            await this.handleDisconnection();
        }
    }

    private async ensureBrowser(): Promise<Browser> {
        if (!this.browser || !this.browser.isConnected()) {
            await this.initialize();
        }
        return this.browser!;
    }

    private async setupPage(browser: Browser, source: SourceConfig): Promise<Page> {
        const page = await browser.newPage();
        
        // Set extra headers if provided
        if (source.extraHeaders) {
            await page.setExtraHTTPHeaders(source.extraHeaders);
        }

        // Set reasonable viewport and timeout
        await page.setViewport({ width: 1920, height: 1080 });
        page.setDefaultTimeout(60000); // Increased timeout

        // Set PubMed-specific cookie
        if (source.name === 'PubMed' || source.url.includes('pubmed.ncbi.nlm.nih.gov')) {
            await page.setCookie({
                name: 'ncbi_sid',
                value: Date.now().toString(),
                domain: '.ncbi.nlm.nih.gov'
            });
        }

        // Enable request interception
        await page.setRequestInterception(true);

        // Handle requests
        page.on('request', async (request) => {
            const resourceType = request.resourceType();
            const url = request.url();

            // Allow only essential resources
            if (
                resourceType === 'document' ||
                resourceType === 'xhr' ||
                resourceType === 'fetch' ||
                resourceType === 'script' ||
                (resourceType === 'stylesheet' && (
                    url.includes('pubmed.ncbi.nlm.nih.gov') || 
                    url.includes('ncbi.nlm.nih.gov')
                )) ||
                (resourceType === 'image' && (
                    url.includes('pubmed.ncbi.nlm.nih.gov') || 
                    url.includes('ncbi.nlm.nih.gov')
                ))
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
        page.on('error', error => {
            console.error('Page error:', error);
        });

        // Handle console messages
        page.on('console', msg => {
            const msgType = msg.type();
            if (msgType === 'error') {
                console.log(`Page error:`, msg.text());
            } else if (['warning', 'log', 'info'].includes(msgType)) {
                console.log(`Page ${msgType}:`, msg.text());
            }
        });

        return page;
    }

    private async crawlSource(page: Page, source: SourceConfig): Promise<ExtractedData[]> {
        console.log(`Navigating to ${source.url}`);
        
        try {
            // Navigate to the page with increased timeout
            await page.goto(source.url, { 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 120000
            });

            // Add a longer delay to ensure dynamic content is loaded
            await delay(10000);

            // Wait for the article container with increased timeout
            try {
                await this.waitForSelector(page, source.selectors.articleContainer, 60000, true);
            } catch (error) {
                console.log(`No articles found for ${source.name} at ${source.url}`);
                const content = await page.content();
                console.log('Page content:', content.substring(0, 1000) + '...');
                return [];
            }

            // Take a screenshot for debugging
            await page.screenshot({ path: `debug-${source.name}-${Date.now()}.png` });

            // Check if we have any results
            const hasResults = await page.evaluate((selector) => {
                const articles = document.querySelectorAll(selector);
                return articles.length > 0;
            }, source.selectors.articleContainer);

            if (!hasResults) {
                console.log(`No articles found for ${source.name} at ${source.url}`);
                return [];
            }

            const papers = await this.extractPapers(page, source);
            console.log(`Found ${papers.length} papers on current page`);
            
            return papers;
        } catch (error) {
            console.error(`Error crawling ${source.name}:`, error);
            throw error;
        }
    }

    private async extractPapers(page: Page, source: SourceConfig): Promise<ExtractedData[]> {
        try {
            return await page.evaluate((selectors, patterns) => {
                const papers: ExtractedData[] = [];
                const articles = document.querySelectorAll(selectors.articleContainer);
                console.log(`Found ${articles.length} article elements`);
                
                // Helper function to extract text content
                function extractText(article: Element, selector: string): string {
                    const el = article.querySelector(selector);
                    return el?.textContent?.trim() || '';
                }
                
                // Helper function to extract URL
                function extractUrl(article: Element, selector: string): string {
                    const el = article.querySelector(selector) as HTMLAnchorElement;
                    if (!el || !el.href) return '';
                    return el.href;
                }
                
                // Helper function to apply pattern
                function applyPattern(text: string, pattern?: string | null): string {
                    if (!text || !pattern) return text;
                    try {
                        const regex = new RegExp(pattern);
                        const match = text.match(regex);
                        return match && match[1] ? match[1] : text;
                    } catch (e) {
                        console.error('Pattern matching error:', e);
                        return text;
                    }
                }
                
                Array.from(articles).forEach((article, index) => {
                    try {
                        // Extract basic data
                        const title = extractText(article, selectors.title);
                        const abstract = extractText(article, selectors.abstract);
                        const authorText = extractText(article, selectors.authors);
                        const authors = authorText.split(',').map(a => a.trim()).filter(Boolean);
                        
                        const doiText = extractText(article, selectors.doi);
                        const doi = applyPattern(doiText, patterns?.doi);
                        
                        let url = extractUrl(article, selectors.url);
                        // Ensure URL is absolute
                        if (!url && doi) {
                            url = `https://pubmed.ncbi.nlm.nih.gov/${doi}/`;
                        }
                        
                        // Extract date if available
                        let publicationDate: Date | undefined;
                        if (selectors.date) {
                            const dateText = extractText(article, selectors.date);
                            if (dateText) {
                                const yearMatch = dateText.match(patterns?.date || '\\b(\\d{4})\\b');
                                if (yearMatch && yearMatch[1]) {
                                    publicationDate = new Date(yearMatch[1]);
                                }
                            }
                        }
                        
                        // Extract keywords and categories if available
                        const keywords = selectors.keywords ? 
                            extractText(article, selectors.keywords).split(',').map(k => k.trim()).filter(Boolean) : 
                            [];
                            
                        const categories = selectors.categories ?
                            extractText(article, selectors.categories).split(',').map(c => c.trim()).filter(Boolean) :
                            [];
                        
                        // Validate required fields
                        if (title && (doi || url)) {
                            papers.push({
                                title,
                                abstract: abstract || 'Abstract not available',
                                authors,
                                doi: doi || `unknown-${Date.now()}-${index}`,
                                publicationDate,
                                keywords,
                                categories,
                                url: url || `https://pubmed.ncbi.nlm.nih.gov/`
                            });
                        }
                    } catch (error) {
                        console.error(`Error extracting paper data:`, error);
                    }
                });
                
                return papers;
            }, source.selectors, source.patterns);
        } catch (error) {
            console.error('Error in extractPapers:', error);
            return [];
        }
    }

    private async getNextPageUrl(page: Page, source: SourceConfig, currentPage: number): Promise<string | null> {
        if (currentPage >= source.maxPages) {
            return null;
        }

        // If nextPage selector is not defined, we can't find the next page
        if (!source.selectors.nextPage) {
            return null;
        }

        try {
            // Check if we have a next page button
            const hasNextPage = await page.evaluate((selector) => {
                const nextButton = document.querySelector(selector) as HTMLAnchorElement;
                return nextButton && nextButton.href ? true : false;
            }, source.selectors.nextPage).catch(() => false);
            
            if (!hasNextPage) {
                return null;
            }
            
            // Get the next page URL
            const nextPageUrl = await page.evaluate((selector) => {
                const nextButton = document.querySelector(selector) as HTMLAnchorElement;
                return nextButton ? nextButton.href : null;
            }, source.selectors.nextPage);
            
            return nextPageUrl;
        } catch (error) {
            console.error('Error getting next page URL:', error);
            return null;
        }
    }

    async crawl(): Promise<void> {
        try {
            this.isClosing = false;
            this.totalPapersFound = 0;
            await this.initialize();

            // Filter sources based on selection if provided
            const sourcesToCrawl = this.config.selectedSources 
                ? this.config.sources.filter(s => this.config.selectedSources?.includes(s.name))
                : this.config.sources;

            // Sort sources to ensure PubMed comes first if selected
            sourcesToCrawl.sort((a, b) => {
                if (a.name === 'PubMed') return -1;
                if (b.name === 'PubMed') return 1;
                return 0;
            });

            for (const source of sourcesToCrawl) {
                if (this.isClosing) break;

                try {
                    this.currentSource = source.name;
                    console.log(`Starting to crawl ${source.name}`);
                    const browser = await this.ensureBrowser();
                    const page = await this.setupPage(browser, source);

                    this.currentPage = 1;
                    let currentUrl = source.url;
                    let emptyPagesCount = 0;
                    const MAX_EMPTY_PAGES = 3;
                    
                    while (currentUrl && this.currentPage <= source.maxPages && this.totalPapersFound < this.targetPapers && !this.isClosing) {
                        console.log(`Crawling ${source.name} - Page ${this.currentPage}/${source.maxPages} - Found ${this.totalPapersFound}/${this.targetPapers} papers`);
                        
                        try {
                            const papers = await this.retryOperation(
                                async () => {
                                    const browser = await this.ensureBrowser();
                                    if (!page.isClosed()) {
                                        return this.crawlSource(page, { ...source, url: currentUrl });
                                    } else {
                                        const newPage = await this.setupPage(browser, source);
                                        return this.crawlSource(newPage, { ...source, url: currentUrl });
                                    }
                                },
                                this.config.retryOptions ?? this.defaultRetryOptions
                            );

                            if (papers.length === 0) {
                                emptyPagesCount++;
                                console.log(`Empty page encountered (${emptyPagesCount}/${MAX_EMPTY_PAGES})`);
                                if (emptyPagesCount >= MAX_EMPTY_PAGES) {
                                    console.log(`Too many empty pages for ${source.name}, moving to next source`);
                                    break;
                                }
                            } else {
                                emptyPagesCount = 0;
                                let newPapersFound = 0;

                                for (const paperData of papers) {
                                    if (this.shouldProcessPaper(paperData)) {
                                        try {
                                            // If the abstract is too short/missing and we have a URL, try to fetch it
                                            if ((!paperData.abstract || paperData.abstract === 'Abstract not available' || paperData.abstract.length < 50) && paperData.url) {
                                                paperData.abstract = await this.fetchAbstract(paperData.url, source);
                                            }
                                            
                                            const paper = new Paper(paperData);
                                            paper._id = new ObjectId();
                                            await this.savePaper(paper);
                                            this.papersProcessed.add(paper.doi);
                                            
                                            newPapersFound++;
                                            
                                            if (this.totalPapersFound >= this.targetPapers) {
                                                console.log(`Reached target papers (${this.targetPapers})`);
                                                break;
                                            }
                                        } catch (error) {
                                            console.error(`Error processing paper ${paperData.title}:`, error);
                                            continue;
                                        }
                                    }
                                }

                                console.log(`Found ${newPapersFound} papers on this page`);
                            }

                            if (this.totalPapersFound < this.targetPapers) {
                                const nextUrl = await this.getNextPageUrl(page, source, this.currentPage);
                                if (!nextUrl) {
                                    console.log(`No more pages available for ${source.name}`);
                                    break;
                                }
                                currentUrl = nextUrl;
                                this.currentPage++;
                                await this.applyRateLimit(source);
                            } else {
                                break;
                            }
                        } catch (error) {
                            console.error(`Error processing page ${this.currentPage} for ${source.name}:`, error);
                            if (!this.isClosing) {
                                await this.initialize();
                                await delay(this.config.retryOptions?.delayMs ?? 5000);
                            }
                        }
                    }

                    try {
                        if (!page.isClosed()) {
                            await page.close();
                        }
                    } catch (error) {
                        console.error('Error closing page:', error);
                    }
                } catch (error) {
                    console.error(`Error crawling ${source.name}:`, error);
                    if (!this.isClosing) {
                        continue;
                    }
                }
            }
        } catch (error) {
            console.error('Crawler error:', error);
            if (!this.isClosing) {
                await this.initialize();
            }
        } finally {
            if (!this.isClosing) {
                await this.close();
            }
        }
    }

    private async savePaper(paper: Paper): Promise<void> {
        try {
            console.log(`Attempting to save paper: ${paper.title}`);
            await this.paperRepository.save(paper);
            this.totalPapersFound++;
            console.log(`Saved paper: ${paper.title}`);
        } catch (error) {
            console.error(`Error saving paper ${paper.title}:`, error);
            // Continue even if there's an error saving one paper
        }
    }

    private shouldProcessPaper(paper: ExtractedData): boolean {
        // Skip already processed papers
        if (this.papersProcessed.has(paper.doi)) {
            return false;
        }

        // Apply filters if configured
        if (this.config.filters) {
            // Date range filter
            if (this.config.filters.dateRange && paper.publicationDate) {
                const date = new Date(paper.publicationDate);
                if (date < this.config.filters.dateRange.start || date > this.config.filters.dateRange.end) {
                    return false;
                }
            }

            // Keywords filter
            if (this.config.filters.keywords?.length) {
                const lowerContent = (paper.title + ' ' + paper.abstract).toLowerCase();
                if (!this.config.filters.keywords.some(keyword => 
                    lowerContent.includes(keyword.toLowerCase())
                )) {
                    return false;
                }
            }

            // Categories filter
            if (this.config.filters.categories?.length && paper.categories?.length) {
                if (!this.config.filters.categories.some(category =>
                    paper.categories!.some(c => c.toLowerCase().includes(category.toLowerCase()))
                )) {
                    return false;
                }
            }
        }

        return true;
    }

    private async retryOperation<T>(
        operation: () => Promise<T>,
        options: { maxRetries: number; delayMs: number }
    ): Promise<T> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                console.warn(`Attempt ${attempt} failed:`, error);
                
                if (attempt < options.maxRetries) {
                    await delay(options.delayMs * attempt);
                }
            }
        }
        
        throw lastError;
    }

    async close(): Promise<void> {
        this.isClosing = true;
        try {
            if (this.page && !this.page.isClosed()) {
                await this.page.close();
            }
            if (this.browser) {
                await this.browser.close();
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error closing browser:', error.message);
            }
        } finally {
            this.page = null;
            this.browser = null;
        }
    }

    public getStatus() {
        return {
            isRunning: !this.isClosing,
            currentSource: this.currentSource,
            currentPage: this.currentPage,
            papersFound: this.totalPapersFound,
            targetPapers: this.targetPapers
        };
    }

    private async waitForSelector(page: Page, selector: string, timeout = 30000, visible = true): Promise<void> {
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
            try {
                await page.waitForSelector(selector, { timeout, visible });
                return;
            } catch (error) {
                retries++;
                console.log(`Selector "${selector}" not found, retry ${retries}/${maxRetries}`);
                if (retries >= maxRetries) throw error;
                await delay(2000);
            }
        }
    }

    private async applyRateLimit(source: SourceConfig): Promise<void> {
        const rateLimit = source.rateLimit || 2; // Default to 2 requests per minute
        const baseDelay = Math.floor(60000 / rateLimit);
        const jitter = Math.floor(Math.random() * 3000); // Random delay between 0-3s
        await delay(baseDelay + jitter);
    }

    private async fetchAbstract(url: string, source: SourceConfig): Promise<string> {
        try {
            console.log(`Fetching abstract from ${url}`);
            const browser = await this.ensureBrowser();
            const page = await this.setupPage(browser, source);
            
            await page.goto(url, { 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 60000
            });
            
            await delay(5000); // Wait for content to load
            
            // Try to locate the abstract
            try {
                await this.waitForSelector(page, source.selectors.abstract, 30000, true);
            } catch (error) {
                console.log(`Abstract selector not found at ${url}`);
            }
            
            const abstract = await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                return element?.textContent?.trim() || 'Abstract not available';
            }, source.selectors.abstract);
            
            await page.close();
            return abstract;
        } catch (error) {
            console.error('Error fetching abstract:', error);
            return 'Failed to fetch abstract';
        }
    }
} 