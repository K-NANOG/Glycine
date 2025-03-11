import puppeteer, { Page, Browser } from 'puppeteer';
import { Paper } from '../models/Paper';
import { Repository } from 'typeorm';
import { delay } from '../utils/delay';
import { Spinner } from '../utils/spinner';
import { EventEmitter } from 'events';

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
    pmid?: string;
    journal?: string;
    citations?: number;
}

export interface CrawlerStatus {
    isRunning: boolean;
    currentSource: string;
    papersFound: number;
    lastError: string;
    currentPage: number;
    totalPages: number;
}

export interface AdaptiveConfig {
    learningRate: number;
    adaptationThreshold: number;
    maxEvolutionSteps: number;
}

export interface CrawlerMetrics {
    successRate: number;
    blockRate: number;
    relevanceScore: number;
    processingTime: number;
}

export class PaperCrawler extends EventEmitter {
    private browser: Browser | null = null;
    private readonly defaultRetryOptions = {
        maxRetries: 3,
        delayMs: 1000,
    };
    private totalPapersFound = 0;
    private isClosing = false;
    private currentSource = '';
    private currentPage = 0;
    private targetPapers = 0;
    private spinner: Spinner;
    private lastError = '';
    private isRunning = false;
    private metrics: CrawlerMetrics = {
        successRate: 1.0,
        blockRate: 0.0,
        relevanceScore: 1.0,
        processingTime: 0
    };
    
    constructor(
        private readonly paperRepository: Repository<Paper>,
        private readonly config: CrawlerConfig
    ) {
        super();
        this.targetPapers = config.maxPapers;
        this.spinner = new Spinner();
    }

    getStatus(): CrawlerStatus {
        const currentSource = this.config.sources.find(s => s.name === this.currentSource);
        return {
            isRunning: this.isRunning,
            currentSource: this.currentSource,
            papersFound: this.totalPapersFound,
            lastError: this.lastError,
            currentPage: this.currentPage,
            totalPages: currentSource?.maxPages || 0
        };
    }

    private log(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
        this.emit('log', { message, type, timestamp: new Date().toISOString() });
        if (type === 'error') {
            console.error(message);
        } else {
            console.log(message);
        }
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

            const launchOptions = {
                headless: "new" as const,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--window-size=1920,1080'
                ],
                ignoreHTTPSErrors: true,
                timeout: 60000
            };

            this.browser = await puppeteer.launch(launchOptions);

            // Handle browser disconnection
            this.browser.on('disconnected', async () => {
                if (!this.isClosing) {
                    console.log('Browser disconnected. Attempting to reconnect...');
                    try {
                        await delay(1000); // Wait a bit before reconnecting
                        this.browser = await puppeteer.launch(launchOptions);
                        console.log('Browser reconnected successfully');
                    } catch (error) {
                        console.error('Failed to reconnect browser:', error);
                        // Try one more time after a longer delay
                        try {
                            await delay(5000);
                            this.browser = await puppeteer.launch(launchOptions);
                            console.log('Browser reconnected successfully on second attempt');
                        } catch (retryError) {
                            console.error('Failed to reconnect browser on retry:', retryError);
                            throw retryError;
                        }
                    }
                }
            });

            console.log("Puppeteer browser initialized");
        } catch (error) {
            console.error("Failed to initialize Puppeteer:", error);
            throw error;
        }
    }

    private async ensureBrowser(): Promise<Browser> {
        let retries = 3;
        while (retries > 0) {
            try {
                if (!this.browser || !this.browser.isConnected()) {
                    console.log('Browser not connected, reinitializing...');
            await this.initialize();
                }
                return this.browser!;
            } catch (error) {
                retries--;
                if (retries === 0) {
                    console.error('Failed to ensure browser after all retries:', error);
                    throw error;
                }
                console.log(`Failed to ensure browser, retrying... (${retries} attempts left)`);
                await delay(2000);
            }
        }
        throw new Error('Failed to ensure browser after all retries');
    }

    private async setupPage(browser: Browser, source: CrawlerConfig['sources'][0]): Promise<Page> {
        const page = await browser.newPage();
        
        // Set extra headers if provided
        if (source.extraHeaders) {
            await page.setExtraHTTPHeaders(source.extraHeaders);
        }

        // Set reasonable viewport and timeout
        await page.setViewport({ width: 1920, height: 1080 });
        page.setDefaultTimeout(60000); // Increased timeout
        page.setDefaultNavigationTimeout(60000); // Add navigation timeout

        // Set realistic user agent and platform
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Enable JavaScript and cookies
        await page.setJavaScriptEnabled(true);

        // Add common browser features
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });

        // Enable request interception
        await page.setRequestInterception(true);

        // Handle requests
        page.on('request', async (request) => {
            const resourceType = request.resourceType();
            const url = request.url();

            // Allow essential resources and common assets
            if (
                resourceType === 'document' ||
                resourceType === 'xhr' ||
                resourceType === 'fetch' ||
                resourceType === 'script' ||
                resourceType === 'stylesheet' ||
                (resourceType === 'image' && (url.includes('pubmed.ncbi.nlm.nih.gov') || url.includes('arxiv.org'))) ||
                resourceType === 'font'
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

        page.on('pageerror', error => {
            console.error('Page error:', error);
        });

        // Add random mouse movements and scrolling for PubMed
        if (source.name === 'PubMed') {
            page.on('load', async () => {
                try {
                    // Random mouse movements
                    await page.mouse.move(Math.random() * 1000, Math.random() * 1000);
                    await page.waitForTimeout(Math.random() * 1000 + 500);

                    // Smooth scrolling
                    await page.evaluate(() => {
                        const scroll = () => {
                            window.scrollBy(0, Math.random() * 100);
                            if (window.scrollY < document.body.scrollHeight - window.innerHeight) {
                                setTimeout(scroll, Math.random() * 500 + 100);
                            }
                        };
                        scroll();
                    });

                    await page.waitForTimeout(Math.random() * 2000 + 1000);
                } catch (error) {
                    console.log('Error during random movements:', error);
                }
            });
        }

        return page;
    }

    private async crawlSource(page: Page, source: CrawlerConfig['sources'][0]): Promise<ExtractedData[]> {
        this.spinner.start(`Fetching papers from ${source.name}...`);
        this.log(`Navigating to ${source.url}`);
        
        try {
            // Set cookies if needed
            if (source.name === 'PubMed') {
                await page.setCookie({
                    name: 'ncbi_sid',
                    value: Date.now().toString(),
                    domain: '.ncbi.nlm.nih.gov'
                });
            }

            // Navigate to the page
            await page.goto(source.url, { 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 60000
            });

            // Wait for the article container with increased timeout
            try {
                await page.waitForSelector(source.selectors.articleContainer, { 
                    timeout: 60000,
                    visible: true 
                });
            } catch (error) {
                console.log(`No articles found for ${source.name} at ${source.url}`);
                return [];
            }

            // Add a longer delay to ensure dynamic content is loaded
            await delay(5000);

            // Check if we have any results
            const hasResults = await page.evaluate((selector) => {
                const articles = document.querySelectorAll(selector);
                return articles.length > 0;
            }, source.selectors.articleContainer);

            if (!hasResults) {
                console.log(`No articles found for ${source.name} at ${source.url}`);
                return [];
            }

            // Take a screenshot for debugging if needed
            await page.screenshot({ path: `debug-${source.name}-${Date.now()}.png` });

            const papers = await this.extractPapers(page, source);
            this.spinner.stop();
            this.log(`Found ${papers.length} papers on current page`, papers.length > 0 ? 'success' : 'info');
            
            if (papers.length === 0) {
                this.log(`No valid papers extracted from ${source.name} at ${source.url}`, 'error');
                const content = await page.content();
                this.log('Page content: ' + content.substring(0, 1000) + '...', 'error');
            }
            
            await this.updateMetrics(papers);
            return papers;
        } catch (error) {
            this.spinner.stop();
            this.log(`Error crawling ${source.name}: ${error}`, 'error');
            throw error;
        }
    }

    private async extractPapers(page: Page, source: CrawlerConfig['sources'][0]): Promise<ExtractedData[]> {
        return page.evaluate((config) => {
            const papers: ExtractedData[] = [];
            const articles = document.querySelectorAll(config.selectors.articleContainer);
            
            articles.forEach((article) => {
                try {
                    const titleElement = article.querySelector(config.selectors.title) as HTMLAnchorElement;
                    const title = titleElement?.textContent?.trim();
                    const url = titleElement?.href;
                    const abstract = article.querySelector(config.selectors.abstract)?.textContent?.trim();
                    const authorText = article.querySelector(config.selectors.authors)?.textContent?.trim();
                    const authors = authorText?.split(',').map(a => a.trim()) || [];
                    
                    // Extract DOI with pattern matching
                    const doiElement = article.querySelector(config.selectors.doi)?.textContent;
                    const doiMatch = doiElement?.match(new RegExp(config.patterns?.doi || ''));
                    const doi = doiMatch?.[1] || '';

                    // Extract PMID
                    const pmidElement = article.querySelector(config.selectors.pmid)?.textContent;
                    const pmidMatch = pmidElement?.match(new RegExp(config.patterns?.pmid || ''));
                    const pmid = pmidMatch?.[1] || '';

                    // Extract journal name
                    const journal = article.querySelector(config.selectors.journal)?.textContent?.trim();

                    // Extract and parse date
                    const dateText = article.querySelector(config.selectors.date)?.textContent?.trim();
                    let publicationDate: Date | undefined;
                    if (dateText) {
                        const dateMatch = dateText.match(new RegExp(config.patterns?.date || ''));
                        if (dateMatch) {
                            publicationDate = new Date(dateMatch[0]);
                        }
                    }

                    // Extract keywords and categories
                    const keywords = Array.from(article.querySelectorAll(config.selectors.keywords))
                        .map(k => k.textContent?.trim())
                        .filter((k): k is string => !!k);

                    const categories = Array.from(article.querySelectorAll(config.selectors.categories))
                        .map(c => c.textContent?.trim())
                        .filter((c): c is string => !!c);

                    if (title && url) {
                        papers.push({
                            title,
                            abstract: abstract || '',
                            authors,
                            doi,
                            pmid,
                            url,
                            publicationDate,
                            journal,
                            keywords,
                            categories
                        });
                    }
                } catch (error) {
                    console.error('Error extracting paper data:', error);
                }
            });
            
            return papers;
        }, source);
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
            this.isRunning = true;
            this.isClosing = false;
            this.totalPapersFound = 0;
            this.lastError = '';
            await this.ensureBrowser();

            const sourcesToCrawl = this.config.selectedSources 
                ? this.config.sources.filter(s => this.config.selectedSources?.includes(s.name))
                : this.config.sources;

            sourcesToCrawl.sort((a, b) => {
                if (a.name === 'PubMed') return -1;
                if (b.name === 'PubMed') return 1;
                return 0;
            });

            for (const source of sourcesToCrawl) {
                try {
                    this.currentSource = source.name;
                    this.log(`Starting to crawl ${source.name}`, 'info');
                    const browser = await this.ensureBrowser();
                    const page = await this.setupPage(browser, source);

                    this.currentPage = 1;
                    let currentUrl = source.url;
                    let emptyPagesCount = 0;
                    const MAX_EMPTY_PAGES = 3;
                    
                    while (currentUrl && this.currentPage <= source.maxPages && this.totalPapersFound < this.targetPapers) {
                        this.spinner.update(`Crawling ${source.name} - Page ${this.currentPage}/${source.maxPages} - Found ${this.totalPapersFound}/${this.targetPapers} papers`);
                        
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
                                    console.log(`No more pages to crawl for ${source.name}`);
                                    break;
                                }
                                currentUrl = nextUrl;
                                this.currentPage++;
                            }
                        } catch (error) {
                            console.error(`Error crawling ${source.name}: ${error}`);
                            await delay(2000); // Wait between retries
                        }
                    }
                } catch (error) {
                    console.error(`Error crawling ${source.name}: ${error}`);
                    await delay(2000); // Wait between sources
                }
            }
        } catch (error) {
            this.lastError = error instanceof Error ? error.message : 'Unknown error during crawl';
            console.error('Error during crawl:', error);
        } finally {
            this.isRunning = false;
        }
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

    private async savePaper(paper: Paper): Promise<void> {
        try {
            console.log(`Attempting to save paper: ${paper.title}`);
            await this.paperRepository.save(paper);
            console.log(`Saved paper: ${paper.title}`);
            this.emit('log', { 
                message: `Saved paper: ${paper.title}`, 
                type: 'success',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error(`Error saving paper ${paper.title}:`, error);
            this.emit('log', { 
                message: `Error saving paper ${paper.title}: ${error}`, 
                type: 'error',
                timestamp: new Date().toISOString()
            });
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

    private async evolveStrategy(metrics: CrawlerMetrics): Promise<void> {
        // Adjust delays based on block rate
        if (metrics.blockRate > 0.1) {
            this.defaultRetryOptions.delayMs *= 1.5;
        }

        // Adjust max retries based on success rate
        if (metrics.successRate < 0.8) {
            this.defaultRetryOptions.maxRetries = Math.min(
                this.defaultRetryOptions.maxRetries + 1,
                5
            );
        }

        // Emit evolution event
        this.emit('evolution', {
            metrics,
            changes: {
                delay: this.defaultRetryOptions.delayMs,
                maxRetries: this.defaultRetryOptions.maxRetries
            }
        });
    }

    private async updateMetrics(result: ExtractedData[]): Promise<void> {
        const startTime = Date.now();
        
        // Update success and block rates
        const wasBlocked = result.length === 0;
        this.metrics.blockRate = 0.7 * this.metrics.blockRate + 0.3 * (wasBlocked ? 1 : 0);
        this.metrics.successRate = 0.7 * this.metrics.successRate + 0.3 * (wasBlocked ? 0 : 1);
        
        // Update processing time
        this.metrics.processingTime = Date.now() - startTime;
        
        // Calculate relevance score (placeholder for NLP implementation)
        this.metrics.relevanceScore = result.length > 0 ? 1.0 : 0.5;
        
        await this.evolveStrategy(this.metrics);
    }

    private async setupPubMedSource(): CrawlerConfig['sources'][0] {
        return {
            name: 'PubMed',
            url: 'https://pubmed.ncbi.nlm.nih.gov/?term=(synthetic+biology+OR+machine+learning+OR+bioinformatics)&sort=date&size=100',
            selectors: {
                articleContainer: '.docsum-content',
                title: '.docsum-title',
                abstract: '.abstract-content',
                authors: '.docsum-authors',
                doi: '.identifier.doi',
                date: '.docsum-journal-citation .date',
                journal: '.docsum-journal-citation .journal-title',
                pmid: '.docsum-pmid',
                nextPage: '.next-page',
                url: '.docsum-title',
                categories: '.keywords',
                keywords: '.keywords'
            },
            patterns: {
                doi: 'DOI:\\s*([\\w\\./-]+)',
                pmid: 'PMID:\\s*(\\d+)',
                date: '(\\d{4})\\s*(\\w{3})\\s*(\\d{1,2})'
            },
            maxPages: 10,
            rateLimit: 2000,
            extraHeaders: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };
    }
} 