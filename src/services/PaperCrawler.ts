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
        this.page = await browser.newPage();
        
        // Set extra headers if provided
        if (source.extraHeaders) {
            await this.page.setExtraHTTPHeaders(source.extraHeaders);
        }

        // Set reasonable viewport and timeout
        await this.page.setViewport({ width: 1920, height: 1080 });
        this.page.setDefaultTimeout(60000); // Increased timeout

        // Enable request interception
        await this.page.setRequestInterception(true);

        // Handle requests
        this.page.on('request', async (request) => {
            const resourceType = request.resourceType();
            const url = request.url();

            // Allow only essential resources
            if (
                resourceType === 'document' ||
                resourceType === 'xhr' ||
                resourceType === 'fetch' ||
                resourceType === 'script' ||
                (resourceType === 'stylesheet' && (url.includes('arxiv.org') || url.includes('pubmed.ncbi.nlm.nih.gov')))
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
            console.log('Page console:', msg.text());
        });

        return this.page;
    }

    private async crawlSource(page: Page, source: CrawlerConfig['sources'][0]): Promise<ExtractedData[]> {
        console.log(`Navigating to ${source.url}`);
        
        try {
            // Set cookies if needed
            if (source.name === 'PubMed') {
                await page.setCookie({
                    name: 'ncbi_sid',
                    value: Date.now().toString(),
                    domain: '.ncbi.nlm.nih.gov'
                });
            }

            // Navigate to the page with increased timeout
            await page.goto(source.url, { 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 120000
            });

            // Add a longer delay to ensure dynamic content is loaded
            await delay(10000);

            // Wait for the article container with increased timeout
            try {
                await page.waitForSelector(source.selectors.articleContainer, { 
                    timeout: 60000,
                    visible: true 
                });
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

            // Special handling for arXiv
            if (source.name === 'arXiv') {
                // Wait for specific arXiv elements
                await Promise.all([
                    page.waitForSelector('.title', { timeout: 30000 }).catch(() => console.log('Title selector not found')),
                    page.waitForSelector('.abstract', { timeout: 30000 }).catch(() => console.log('Abstract selector not found')),
                    page.waitForSelector('.authors', { timeout: 30000 }).catch(() => console.log('Authors selector not found'))
                ]);
            }

            const papers = await this.extractPapers(page, source);
            console.log(`Found ${papers.length} papers on current page`);
            
            if (papers.length === 0) {
                console.log(`No valid papers extracted from ${source.name} at ${source.url}`);
                const content = await page.content();
                console.log('Page content:', content.substring(0, 1000) + '...');
            }
            
            return papers;
        } catch (error) {
            console.error(`Error crawling ${source.name}:`, error);
            throw error;
        }
    }

    private async extractPapers(page: Page, source: SourceConfig): Promise<ExtractedData[]> {
        return page.evaluate((config) => {
            const { selectors, patterns } = config;
            const papers: ExtractedData[] = [];
            
            const extractText = (element: Element | null, selector: string): string | null => {
                if (!element || !selector) return null;
                const found = element.querySelector(selector);
                return found?.textContent?.trim() || null;
            };

            const extractUrl = (element: Element | null, selector: string): string | null => {
                if (!element || !selector) return null;
                const found = element.querySelector(selector);
                if (!found) return null;
                const href = found.getAttribute('href');
                if (!href) return null;
                return href.startsWith('http') ? href : new URL(href, window.location.origin).toString();
            };

            const applyPattern = (text: string | null, pattern: string | undefined): string | null => {
                if (!text || !pattern) return text;
                const match = text.match(new RegExp(pattern));
                return match ? match[1] : text;
            };

            // Special handling for arXiv
            if (window.location.href.includes('arxiv.org')) {
                const articles = document.querySelectorAll('li.arxiv-result');
                articles.forEach((article: Element) => {
                    try {
                        const title = article.querySelector('.title')?.textContent?.trim();
                        const abstract = article.querySelector('.abstract-full')?.textContent?.trim();
                        const authorText = article.querySelector('.authors')?.textContent?.trim();
                        const authors = authorText?.split(',').map((a: string) => a.trim()) || [];
                        const doiElement = article.querySelector('.list-title')?.textContent?.trim();
                        const doi = doiElement?.match(/arXiv:(.*)/)?.[1] || '';
                        const url = extractUrl(article, selectors.url);
                        
                        if (title && abstract && authors.length > 0 && doi && url) {
                            papers.push({
                                title,
                                abstract,
                                authors,
                                doi: `arXiv:${doi}`,
                                url,
                                publicationDate: new Date(),
                                categories: [],
                                keywords: []
                            });
                        }
                    } catch (error) {
                        console.error('Error extracting arXiv paper data:', error);
                    }
                });
                return papers;
            }

            // Default extraction logic for other sources
            const articles = document.querySelectorAll(selectors.articleContainer);
            console.log(`Found ${articles.length} article elements`);

            articles.forEach((article: Element) => {
                try {
                    const rawTitle = extractText(article, selectors.title);
                    const title = patterns?.title ? applyPattern(rawTitle, patterns.title) : rawTitle;
                    
                    const abstract = extractText(article, selectors.abstract);
                    const rawAuthors = extractText(article, selectors.authors);
                    const authors = rawAuthors?.split(',').map(a => a.trim()) || [];
                    
                    const rawDoi = extractText(article, selectors.doi);
                    const doi = applyPattern(rawDoi, patterns?.doi);

                    const rawDate = extractText(article, selectors.date || '');
                    const dateStr = applyPattern(rawDate, patterns?.date);
                    const publicationDate = dateStr ? new Date(dateStr) : undefined;

                    const keywords = selectors.keywords ? 
                        extractText(article, selectors.keywords)?.split(',').map(k => k.trim()) :
                        undefined;

                    const categories = selectors.categories ?
                        extractText(article, selectors.categories)?.split(',').map(c => c.trim()) :
                        undefined;

                    const url = extractUrl(article, selectors.url);

                    if (title && abstract && authors.length > 0 && doi && url) {
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
                    console.error('Error extracting paper data:', error);
                }
            });

            return papers;
        }, { selectors: source.selectors, patterns: source.patterns });
    }

    private async getNextPageUrl(page: Page, source: CrawlerConfig['sources'][0], currentPage: number): Promise<string | null> {
        if (currentPage >= source.maxPages) {
            return null;
        }

        // For arXiv search, we can construct the next page URL directly
        if (source.name === 'arXiv') {
            const url = new URL(source.url);
            const start = currentPage * 50;
            url.searchParams.set('start', start.toString());
            return url.toString();
        }

        // For other sources, try to find the next page link
        if (!source.selectors.nextPage) {
            return null;
        }

        const hasNextPage = await page.evaluate((selector: string) => {
            const nextPageElement = document.querySelector(selector);
            return nextPageElement !== null;
        }, source.selectors.nextPage).catch(() => false);

        if (!hasNextPage) {
            return null;
        }

        const nextPageUrl = await page.evaluate((selector: string) => {
            const nextPageElement = document.querySelector(selector) as HTMLAnchorElement | null;
            return nextPageElement?.href || null;
        }, source.selectors.nextPage);

        return nextPageUrl;
    }

    async crawl(): Promise<void> {
        try {
            this.isClosing = false;
            this.totalPapersFound = 0;
            await this.ensureBrowser();

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
                                    if (this.matchesFilters(paperData)) {
                                        const paper = new Paper(paperData);
                                        await this.savePaper(paper);
                                        newPapersFound++;
                                        this.totalPapersFound++;

                                        if (this.totalPapersFound >= this.targetPapers) {
                                            console.log(`Reached target papers (${this.targetPapers})`);
                                            break;
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
                                await delay(source.rateLimit ? (60000 / source.rateLimit) : 1000);
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
            console.log(`Saved paper: ${paper.title}`);
        } catch (error) {
            console.error(`Error saving paper ${paper.title}:`, error);
            // Continue even if there's an error saving one paper
        }
    }

    private matchesFilters(paper: ExtractedData): boolean {
        const filters = this.config.filters;
        if (!filters) return true;

        // Date range filter
        if (filters.dateRange && paper.publicationDate) {
            const date = new Date(paper.publicationDate);
            if (date < filters.dateRange.start || date > filters.dateRange.end) {
                return false;
            }
        }

        // Keywords filter
        if (filters.keywords?.length && paper.keywords?.length) {
            if (!filters.keywords.some(keyword => 
                paper.keywords!.some(k => k.toLowerCase().includes(keyword.toLowerCase()))
            )) {
                return false;
            }
        }

        // Categories filter
        if (filters.categories?.length && paper.categories?.length) {
            if (!filters.categories.some(category =>
                paper.categories!.some(c => c.toLowerCase() === category.toLowerCase())
            )) {
                return false;
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

    // Add method to get current status
    public getStatus() {
        return {
            isRunning: !this.isClosing,
            currentSource: this.currentSource,
            currentPage: this.currentPage,
            papersFound: this.totalPapersFound,
            targetPapers: this.targetPapers
        };
    }

    private async navigateToPage(url: string): Promise<void> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }
        try {
            await this.page.goto(url, {
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 30000
            });
            
            // Wait for key elements to be present
            await this.page.waitForFunction(() => {
                const content = document.body.textContent;
                return content && content.length > 1000;
            }, { timeout: 20000 });
            
            // Add random delay to avoid rate limiting
            await delay(Math.floor(Math.random() * 2000 + 1000));
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(`Navigation failed: ${error.message}`);
            }
            throw error;
        }
    }

    private async getAuthors(article: ElementHandle<Element>, config: SourceConfig): Promise<string[]> {
        const authorText = await this.getTextContent(article, config.selectors.authors);
        return authorText?.split(',').map(a => a.trim()) || [];
    }

    private async getDOI(article: ElementHandle<Element>, config: SourceConfig): Promise<string> {
        const doiText = await this.getTextContent(article, config.selectors.doi);
        if (!doiText) return '';
        const match = doiText.match(new RegExp(config.patterns?.doi || ''));
        return match ? match[1] : doiText;
    }

    private async getURL(article: ElementHandle<Element>, config: SourceConfig): Promise<string> {
        const el = await article.$(config.selectors.url);
        if (!el) return '';
        const href = await el.evaluate(node => node.getAttribute('href'));
        if (!href) return '';
        return href.startsWith('http') ? href : new URL(href, 'https://arxiv.org').toString();
    }

    private async getDate(article: ElementHandle<Element>, config: SourceConfig): Promise<Date | undefined> {
        const dateText = await this.getTextContent(article, config.selectors.date || '');
        if (!dateText) return undefined;
        const match = dateText.match(new RegExp(config.patterns?.date || ''));
        return match ? new Date(match[1]) : undefined;
    }

    private async getCategories(article: ElementHandle<Element>, config: SourceConfig): Promise<string[]> {
        const categoryText = await this.getTextContent(article, config.selectors.categories || '');
        return categoryText?.split(',').map(c => c.trim()) || [];
    }

    private async extractPaperData(article: ElementHandle<Element>, config: SourceConfig): Promise<Paper | null> {
        try {
            const title = await this.getTextContent(article, config.selectors.title);
            if (!title) return null;

            const abstract = await this.getTextContent(article, config.selectors.abstract);
            const authors = await this.getAuthors(article, config);
            const doi = await this.getDOI(article, config);
            const url = await this.getURL(article, config);
            const date = await this.getDate(article, config);
            const categories = await this.getCategories(article, config);

            const paper = new Paper({
                title: title.trim(),
                abstract: abstract?.trim() || '',
                authors,
                doi,
                url,
                publicationDate: date || new Date(),
                categories,
                isProcessed: false,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            paper._id = new ObjectId();
            return paper;
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(`Error extracting paper data: ${error.message}`);
            }
            return null;
        }
    }

    private async getTextContent(element: ElementHandle<Element>, selector: string): Promise<string | null> {
        try {
            const el = await element.$(selector);
            if (!el) return null;
            return await el.evaluate(node => node.textContent?.trim() || '');
        } catch {
            return null;
        }
    }
} 