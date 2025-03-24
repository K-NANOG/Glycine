import { ICrawlerStrategy, CrawlerConfig, CrawlerStatus } from '../base/crawler-strategy.interface';
import { IBrowserAdapter } from '../browser/browser-adapter.interface';
import { Paper } from '../../models/Paper';
import { Repository } from 'typeorm';
import { delay } from '../../utils/delay';
import { ObjectId } from 'mongodb';
import path from 'path';
import fs from 'fs';

// Define a type for the extracted paper data
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
}

export class BioRxivMedRxivCrawler implements ICrawlerStrategy {
    protected status: CrawlerStatus = {
        isRunning: false,
        currentSource: 'bioRxiv/medRxiv',
        papersFound: 0,
        lastError: '',
        currentPage: 1,
        totalPages: 0
    };

    protected isClosing = false;
    protected papersProcessed: Set<string> = new Set();
    
    public readonly name: string = 'BioRxiv/MedRxiv';
    
    private maxRetries = 3;
    private retryDelay = 3000;

    constructor(
        public readonly browserAdapter: IBrowserAdapter,
        public readonly paperRepository: Repository<Paper>
    ) {}

    async initialize(): Promise<void> {
        try {
            await this.browserAdapter.initialize();
            await this.browserAdapter.setup({
                extraHeaders: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'max-age=0',
                    'Upgrade-Insecure-Requests': '1'
                },
                viewport: {
                    width: 1920,
                    height: 1080
                },
                timeout: 60000
            });
            
            this.status.isRunning = true;
            console.log('BioRxiv/MedRxiv crawler initialized successfully');
        } catch (error: unknown) {
            this.status.isRunning = false;
            this.status.lastError = error instanceof Error ? error.message : 'Failed to initialize browser';
            console.error('BioRxiv/MedRxiv crawler initialization failed:', this.status.lastError);
            throw error;
        }
    }

    async crawl(config: CrawlerConfig): Promise<void> {
        if (this.isClosing) {
            console.log('Crawler is closing, aborting crawl request');
            return;
        }
        
        try {
            this.status.isRunning = true;
            this.status.currentPage = 1;
            this.status.totalPages = config.sourceConfig.maxPages;
            
            // Build the search URL based on config keywords
            const searchTerms = config.filters?.keywords 
                ? config.filters.keywords.join(' OR ') 
                : 'synthetic biology OR machine learning OR bioinformatics';
            
            console.log('BioRxiv/MedRxiv crawler using search terms:', searchTerms);
                
            // Set up the correct URL format for BioRxiv
            const baseUrl = 'https://www.biorxiv.org/search/';
            const searchUrl = `${baseUrl}${encodeURIComponent(searchTerms)}`;
            
            console.log(`Navigating to BioRxiv/MedRxiv search URL: ${searchUrl}`);
            
            try {
                // @ts-ignore - we need to access the underlying page object
                const page = this.browserAdapter.page;
                
                if (!page) {
                    throw new Error('Browser page is not initialized');
                }
                
                // Navigate to the search URL with retry mechanism
                let navigationSuccess = false;
                for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                    try {
                        await page.goto(searchUrl, {
                            waitUntil: 'networkidle2',
                            timeout: 60000
                        });
                        navigationSuccess = true;
                        console.log('Successfully navigated to search page');
                        break;
                    } catch (error: unknown) {
                        if (attempt < this.maxRetries) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            console.warn(`Navigation attempt ${attempt} failed: ${errorMessage}. Retrying...`);
                            await delay(this.retryDelay);
                        } else {
                            throw error;
                        }
                    }
                }
                
                // Wait extra time for dynamic content to load
                await delay(5000);
                
                // Check if we got results
                const hasResults = await page.evaluate(() => {
                    const results = document.querySelectorAll('div.highwire-list-wrapper article, .search-result, .article-item, div.item-list .search-result');
                    console.log(`Found ${results.length} potential article elements on page`);
                    return results.length > 0;
                });
                
                if (!hasResults) {
                    console.log('No article elements found on page, checking for alternate elements');
                    
                    // Try to find any elements that might contain paper information
                    const pageContent = await page.evaluate(() => {
                        return {
                            title: document.title,
                            bodyText: document.body.innerText.substring(0, 1000),
                            links: Array.from(document.querySelectorAll('a[href*="content"]')).length,
                            articleElements: document.querySelectorAll('article').length,
                            divElements: document.querySelectorAll('div.highwire-article-list-items, div.search-result, div.item-list').length
                        };
                    });
                    
                    console.log('Page information:', pageContent);
                }
                
            } catch (navError: unknown) {
                console.error('Error navigating to search page:', navError);
                throw navError;
            }
            
            // Process search results page by page
            while (
                !this.isClosing && 
                this.status.currentPage <= config.sourceConfig.maxPages && 
                this.status.papersFound < config.maxPapers
            ) {
                console.log(`Processing page ${this.status.currentPage}/${config.sourceConfig.maxPages}`);
                
                // Extract papers using direct page evaluation
                const papersOnPage = await this.extractPapersDirectly();
                
                if (papersOnPage.length > 0) {
                    console.log(`Found ${papersOnPage.length} papers on current page`);
                    await this.processPapersData(papersOnPage, config);
                } else {
                    console.log('No papers found on current page, may have reached the end of results');
                }
                
                if (this.isClosing) {
                    console.log('Crawler is closing, stopping page processing');
                    break;
                }
                
                // Check if we need to move to the next page
                // @ts-ignore - we need to access the underlying page object
                const page = this.browserAdapter.page;
                
                if (!page) {
                    throw new Error('Browser page is not initialized');
                }
                
                // Find the next page link
                const hasNextPage = await page.evaluate(() => {
                    // Look for different types of next page links
                    const nextLinks = [
                        ...Array.from(document.querySelectorAll('li.pager-next a')),
                        ...Array.from(document.querySelectorAll('a.page-link')).filter(el => el.textContent?.includes('Next')),
                        ...Array.from(document.querySelectorAll('a[rel="next"]')),
                        ...Array.from(document.querySelectorAll('a.next-page'))
                    ];
                    
                    if (nextLinks.length > 0) {
                        const nextLink = nextLinks[0];
                        console.log('Found next page link:', nextLink.textContent, nextLink.getAttribute('href'));
                        return nextLink.getAttribute('href');
                    }
                    
                    return null;
                });
                
                if (!hasNextPage) {
                    console.log('No more pages available, ending crawl');
                    break;
                }
                
                // Rate limiting
                const rateLimit = config.sourceConfig.rateLimit || 1;
                const delayMs = 3000 + (1000 / rateLimit);
                console.log(`Rate limiting: waiting ${delayMs}ms before next page`);
                await delay(delayMs);
                
                // Navigate to next page
                try {
                    const nextPageUrl = hasNextPage.startsWith('http') 
                        ? hasNextPage 
                        : `https://www.biorxiv.org${hasNextPage}`;
                        
                    console.log(`Navigating to next page: ${nextPageUrl}`);
                    
                    await page.goto(nextPageUrl, {
                        waitUntil: 'networkidle2',
                        timeout: 60000
                    });
                    
                    this.status.currentPage++;
                    
                    // Wait extra time for dynamic content to load
                    await delay(3000);
                    
                    console.log(`Successfully navigated to page ${this.status.currentPage}`);
                } catch (navError: unknown) {
                    console.error('Error navigating to next page:', navError);
                    // Try to recover by refreshing the page
                    try {
                        await page.reload({ waitUntil: 'networkidle2' });
                        await delay(5000);
                    } catch (refreshError: unknown) {
                        console.error('Failed to recover after navigation error:', refreshError);
                        break;
                    }
                }
            }
            
            console.log(`BioRxiv/MedRxiv crawl completed: Found ${this.status.papersFound} papers`);
            
        } catch (error: unknown) {
            this.status.lastError = error instanceof Error ? error.message : 'Error during crawling';
            console.error('BioRxiv/MedRxiv crawling error:', this.status.lastError);
        } finally {
            this.status.isRunning = false;
        }
    }

    private async extractPapersDirectly(): Promise<ExtractedPaperData[]> {
        try {
            // @ts-ignore - we need to access the underlying page object
            const page = this.browserAdapter.page;
            
            if (!page) {
                throw new Error('Browser page is not initialized');
            }
            
            // Configure request interception to handle resource loading failures
            await page.setRequestInterception(true);
            
            // Set up request handling to ignore unnecessary resources
            page.on('request', (request) => {
                const resourceType = request.resourceType();
                // Don't load images, fonts, stylesheets, media or unnecessary scripts to reduce errors
                if (resourceType === 'image' || resourceType === 'font' || 
                    resourceType === 'stylesheet' || resourceType === 'media' ||
                    (resourceType === 'script' && !request.url().includes('biorxiv'))) {
                    request.abort();
                } else {
                    request.continue();
                }
            });
            
            // Handle page errors without crashing
            page.on('error', (err) => {
                console.warn('Page error occurred:', err.message);
                // Don't throw, just log the error
            });
            
            // Take a screenshot for debugging if needed
            try {
                const screenshotPath = `biorxiv-debug-${Date.now()}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`Saved page screenshot for debugging: ${screenshotPath}`);
            } catch (screenshotErr) {
                console.warn('Failed to take debug screenshot:', screenshotErr);
            }
            
            // Extract paper data using page.evaluate with timeout
            const papers = await Promise.race([
                page.evaluate(() => {
                    // This function runs in the browser context
                    const papers: any[] = [];
                    
                    // Try multiple selectors to find articles
                    const articleSelectors = [
                        // Additional selectors for the new BioRxiv site design
                        '.recent-articles .article-item',
                        '.search-results .result-item',
                        // Original selectors
                        'div.highwire-list-wrapper article',
                        '.search-result', 
                        '.article-item',
                        '.highwire-citation',
                        '.item-list .search-result',
                        '.search-listing-wrapper .article',
                        '.search-listing-wrapper .search-result'
                    ];
                    
                    const articleElements = document.querySelectorAll(articleSelectors.join(', '));
                    console.log(`Found ${articleElements.length} article elements`);
                    
                    if (articleElements.length === 0) {
                        // As a fallback, look for any sections that might contain papers
                        console.log('No article elements found, trying general content sections');
                        
                        // Generic section elements that might contain paper data
                        const contentSections = document.querySelectorAll('.content-section, .search-section, .results-section, .article-section, main section');
                        
                        if (contentSections.length > 0) {
                            console.log(`Found ${contentSections.length} content sections, searching for paper data`);
                            
                            // Look for paper links within the sections
                            contentSections.forEach(section => {
                                // Find all links that might point to paper pages
                                const links = section.querySelectorAll('a[href*="/content/"]');
                                
                                links.forEach(link => {
                                    const url = link.getAttribute('href');
                                    const title = link.textContent?.trim();
                                    
                                    // Only process if we have both URL and title
                                    if (url && title) {
                                        // Try to find parent containers that might have more data
                                        let container = link.closest('div, article, section, li');
                                        if (!container) container = link.parentElement;
                                        
                                        if (container) {
                                            // Try to extract other paper metadata from the container
                                            let authors = '';
                                            let abstract = '';
                                            let doi = '';
                                            let date = '';
                                            
                                            // Extract DOI from URL if possible
                                            if (url.includes('/10.1101/')) {
                                                const doiMatch = url.match(/\/10\.1101\/([^\/]+)/);
                                                if (doiMatch) {
                                                    doi = `10.1101/${doiMatch[1]}`;
                                                }
                                            }
                                            
                                            // Add to papers with available information
                                            papers.push({
                                                title,
                                                url: url.startsWith('http') ? url : `https://www.biorxiv.org${url}`,
                                                authors,
                                                abstract,
                                                doi,
                                                publicationDate: date
                                            });
                                        }
                                    }
                                });
                            });
                        }
                        
                        // If we still don't have papers, try to find them directly from the main content
                        if (papers.length === 0) {
                            console.log('No papers found in sections, looking for individual paper links in main content');
                            
                            // Find all links in the page that look like paper links
                            const paperLinks = Array.from(document.querySelectorAll(
                                'a[href*="/content/10.1101/"], a[href*="doi.org/10.1101/"]'
                            ));
                            
                            paperLinks.forEach(link => {
                                const url = link.getAttribute('href');
                                const title = link.textContent?.trim();
                                
                                if (url && title && title.length > 20) {  // Likely a paper title if longer
                                    // Extract DOI from URL
                                    let doi = '';
                                    const doiMatch = url.match(/\/(10\.1101\/[^\/]+)/);
                                    if (doiMatch) {
                                        doi = doiMatch[1];
                                    }
                                    
                                    papers.push({
                                        title,
                                        url: url.startsWith('http') ? url : `https://www.biorxiv.org${url}`,
                                        doi
                                    });
                                }
                            });
                        }
                    }
                    
                    // Normal extraction for found article elements
                    articleElements.forEach(article => {
                        try {
                            // Title selectors
                            const titleSelectors = [
                                '.highwire-cite-title a', 'h2 a', '.title a', 
                                '.article-title a', 'h1 a', 'h3 a', '.paper-title a',
                                '.highwire-cite-title', 'h2', '.title', 
                                '.article-title', 'h1', 'h3', '.paper-title'
                            ];
                            
                            // Try each title selector
                            let titleElement = null;
                            for (const selector of titleSelectors) {
                                titleElement = article.querySelector(selector);
                                if (titleElement) break;
                            }
                            
                            const title = titleElement?.textContent?.trim();
                            const url = titleElement?.tagName === 'A' ? 
                                titleElement.getAttribute('href') : null;
                            
                            // Authors
                            const authorsSelectors = [
                                '.highwire-citation-authors', '.authors', '.meta-authors',
                                '.contributor-list', '.author-list', '.paper-authors'
                            ];
                            
                            let authorsElement = null;
                            for (const selector of authorsSelectors) {
                                authorsElement = article.querySelector(selector);
                                if (authorsElement) break;
                            }
                            const authors = authorsElement?.textContent?.trim();
                            
                            // Abstract
                            const abstractSelectors = [
                                '.highwire-cite-snippet', '.abstract', '.meta-abstract',
                                '.paper-abstract', '.summary', '.excerpt'
                            ];
                            
                            let abstractElement = null;
                            for (const selector of abstractSelectors) {
                                abstractElement = article.querySelector(selector);
                                if (abstractElement) break;
                            }
                            const abstract = abstractElement?.textContent?.trim();
                            
                            // DOI
                            const doiSelectors = [
                                '.highwire-cite-metadata-doi', '.doi', '[data-doi]',
                                '.paper-doi', '.meta-doi'
                            ];
                            
                            let doiElement = null;
                            for (const selector of doiSelectors) {
                                doiElement = article.querySelector(selector);
                                if (doiElement) break;
                            }
                            
                            let doi = doiElement?.textContent?.trim() || '';
                            if (!doi && article.hasAttribute('data-doi')) {
                                doi = article.getAttribute('data-doi') || '';
                            }
                            if (doi.startsWith('doi:')) {
                                doi = doi.substring(4).trim();
                            }
                            
                            // Try to extract DOI from URL if it's not found
                            if (!doi && url && url.includes('/10.1101/')) {
                                const doiMatch = url.match(/\/10\.1101\/([^\/]+)/);
                                if (doiMatch) {
                                    doi = `10.1101/${doiMatch[1]}`;
                                }
                            }
                            
                            // Date
                            const dateSelectors = [
                                '.highwire-cite-metadata-journal', '.published-date', '.publication-date', 
                                'time', '.date', '.paper-date', '.meta-date'
                            ];
                            
                            let dateElement = null;
                            for (const selector of dateSelectors) {
                                dateElement = article.querySelector(selector);
                                if (dateElement) break;
                            }
                            
                            let date = dateElement?.textContent?.trim() || '';
                            if (dateElement?.hasAttribute('datetime')) {
                                date = dateElement.getAttribute('datetime') || '';
                            }
                            
                            // Extract any date pattern in the text
                            if (!date) {
                                const articleText = article.textContent || '';
                                const dateMatch = articleText.match(/\b\d{4}\b/);
                                if (dateMatch) {
                                    date = dateMatch[0];
                                }
                            }
                            
                            // Categories
                            const categoriesSelectors = [
                                '.highwire-citation-categories', '.categories', '.subject-area',
                                '.paper-categories', '.meta-categories', '.topics'
                            ];
                            
                            let categoriesElement = null;
                            for (const selector of categoriesSelectors) {
                                categoriesElement = article.querySelector(selector);
                                if (categoriesElement) break;
                            }
                            const categories = categoriesElement?.textContent?.trim();
                            
                            // Only add paper if we have at least a title
                            if (title) {
                                papers.push({
                                    title,
                                    abstract,
                                    authors,
                                    doi,
                                    url: url ? (url.startsWith('http') ? url : `https://www.biorxiv.org${url}`) : '',
                                    publicationDate: date,
                                    categories
                                });
                            }
                        } catch (err: unknown) {
                            console.error('Error extracting paper data:', err);
                        }
                    });
                    
                    return papers;
                }),
                new Promise<any[]>((_, reject) => 
                    setTimeout(() => reject(new Error('Paper extraction timed out')), 30000)
                )
            ]);
            
            // Remove request interception after extraction
            try {
                await page.setRequestInterception(false);
            } catch (err) {
                console.warn('Error removing request interception:', err);
            }
            
            console.log(`Extracted ${papers.length} papers from page`);
            
            if (papers.length === 0) {
                // If we couldn't extract papers normally, try fetching individual papers from the search page
                console.log('No papers found with standard extraction, trying direct page content analysis');
                
                // Get all search result links
                const searchLinks = await page.$$eval('a[href*="/content/10.1101/"]', (links) => {
                    return links.map(link => ({
                        url: link.getAttribute('href'),
                        text: link.textContent?.trim() || ''
                    }));
                });
                
                console.log(`Found ${searchLinks.length} potential paper links from search page`);
                
                const paperLinks = searchLinks.filter(link => 
                    link.url && 
                    link.text && 
                    link.text.length > 20 && // Likely a paper title if longer than 20 chars
                    !link.text.includes('Submit') && 
                    !link.text.includes('Login')
                );
                
                if (paperLinks.length > 0) {
                    console.log(`Found ${paperLinks.length} valid paper links to process`);
                    
                    // Process at most 10 links to avoid too many requests
                    const linksToProcess = paperLinks.slice(0, 10);
                    
                    for (const link of linksToProcess) {
                        if (this.isClosing) break;
                        
                        try {
                            const paperUrl = link.url?.startsWith('http') 
                                ? link.url 
                                : `https://www.biorxiv.org${link.url}`;
                                
                            // Extract DOI from URL
                            let doi = '';
                            const doiMatch = paperUrl.match(/\/(10\.1101\/[^\/]+)/);
                            if (doiMatch) {
                                doi = doiMatch[1];
                            }
                                
                            console.log(`Fetching abstract from ${paperUrl}`);
                            
                            // Navigate to the paper page
                            await page.goto(paperUrl, { 
                                waitUntil: 'domcontentloaded',
                                timeout: 30000 
                            });
                            
                            // Wait for some content to load
                            await page.waitForSelector('.article-header, .paper-header, .content-header, .article-title', { 
                                timeout: 10000 
                            }).catch(() => console.log('Timeout waiting for article header'));
                            
                            // Extract paper data
                            const paperData = await page.evaluate(() => {
                                // Extract title
                                const titleElement = document.querySelector('.article-title, h1.title, .content-title, .paper-title');
                                const title = titleElement?.textContent?.trim();
                                
                                // Extract abstract
                                const abstractElement = document.querySelector('.abstract-content, .article-abstract, .paper-abstract, .abstract');
                                let abstract = abstractElement?.textContent?.trim() || '';
                                
                                // Clean abstract by removing "Abstract" prefix
                                if (abstract.startsWith('Abstract')) {
                                    abstract = abstract.replace(/^Abstract:?\s*/i, '');
                                }
                                
                                // Extract authors
                                const authorElements = document.querySelectorAll('.contrib-author, .author-name, .paper-author');
                                const authors = Array.from(authorElements).map(el => el.textContent?.trim()).filter(Boolean);
                                
                                // Extract date
                                const dateElement = document.querySelector('.pub-date, .publication-date, .paper-date');
                                const date = dateElement?.textContent?.trim();
                                
                                return {
                                    title,
                                    abstract,
                                    authors,
                                    date
                                };
                            });
                            
                            if (paperData.title) {
                                papers.push({
                                    title: paperData.title,
                                    abstract: paperData.abstract || '',
                                    authors: paperData.authors || [],
                                    doi,
                                    url: paperUrl,
                                    publicationDate: paperData.date || '',
                                    categories: ['Preprint']
                                });
                                
                                console.log(`Successfully extracted paper: ${paperData.title}`);
                            }
                            
                            // Add a small delay between requests
                            await delay(2000);
                            
                        } catch (paperError) {
                            console.error(`Error fetching paper details for ${link.url}:`, paperError);
                            // Continue with next link despite errors
                        }
                    }
                }
            }
            
            return papers;
        } catch (error: unknown) {
            console.error('Error extracting papers directly:', error);
            return [];
        }
    }

    private async processPapersData(papers: ExtractedPaperData[], config: CrawlerConfig): Promise<number> {
        let papersProcessed = 0;
        
        for (const paperData of papers) {
            if (this.isClosing || this.status.papersFound >= config.maxPapers) {
                console.log('Stopping paper processing due to closing flag or reached max papers');
                break;
            }
            
            // Check if we've already processed this paper (using DOI or URL as identifier)
            const paperId = paperData.doi || paperData.url;
            if (!paperId) {
                console.log('Skipping paper without DOI or URL identifier');
                continue;
            }
            
            if (this.papersProcessed.has(paperId)) {
                console.log(`Skipping already processed paper: ${paperData.title}`);
                continue;
            }
            
            // Apply filters
            if (!this.matchesFilters(paperData, config.filters)) {
                console.log(`Paper doesn't match filters: ${paperData.title}`);
                continue;
            }
            
            // Enhanced debugging of paper data
            console.log('Paper data extracted:', {
                title: paperData.title,
                doi: paperData.doi,
                authors: Array.isArray(paperData.authors) ? 
                    `${paperData.authors.length} authors` : 
                    typeof paperData.authors,
                hasAbstract: !!paperData.abstract,
                abstractLength: paperData.abstract ? paperData.abstract.length : 0,
                url: paperData.url,
                date: paperData.publicationDate
            });
            
            // Fix paper format and missing fields
            const formattedAuthors = Array.isArray(paperData.authors) ? 
                paperData.authors : 
                typeof paperData.authors === 'string' ? 
                    paperData.authors.split(',').map((a: string) => a.trim()) : 
                    [];
            
            const formattedKeywords = Array.isArray(paperData.keywords) ? 
                paperData.keywords : 
                typeof paperData.keywords === 'string' ? 
                    paperData.keywords.split(',').map((k: string) => k.trim()) : 
                    [];
            
            const formattedCategories = Array.isArray(paperData.categories) ? 
                paperData.categories : 
                typeof paperData.categories === 'string' ? 
                    paperData.categories.split(',').map((c: string) => c.trim()) : 
                    ['Preprint'];
            
            // Build paper entity
            const paper = new Paper({
                title: paperData.title || 'Unknown Title',
                abstract: paperData.abstract || '',
                authors: formattedAuthors,
                doi: paperData.doi || `biorxiv-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
                url: paperData.url,
                publicationDate: paperData.publicationDate instanceof Date ? 
                    paperData.publicationDate : 
                    new Date(),
                keywords: formattedKeywords,
                categories: formattedCategories,
                metadata: {
                    journal: 'bioRxiv/medRxiv',
                    publisher: 'Cold Spring Harbor Laboratory',
                    doi: paperData.doi
                }
            });
            
            try {
                // Save to database
                console.log(`Attempting to save paper: ${paper.title}`);
                await this.paperRepository.save(paper);
                
                // Mark as processed
                this.papersProcessed.add(paperId);
                this.status.papersFound++;
                papersProcessed++;
                
                console.log(`Saved paper: ${paper.title} (${this.status.papersFound}/${config.maxPapers})`);
            } catch (saveError: unknown) {
                console.error(`Error saving paper "${paper.title}":`, saveError);
            }
        }
        
        return papersProcessed;
    }

    private async processPapers(config: CrawlerConfig): Promise<number> {
        let papersFoundOnPage = 0;
        
        try {
            console.log('Extracting papers from current page');
            
            // Try to extract papers with retries
            let extractedPapers: ExtractedPaperData[] = [];
            let retryCount = 0;
            
            // Use our direct extraction method instead
            extractedPapers = await this.extractPapersDirectly();
            
            if (extractedPapers.length === 0) {
                console.log('No papers found with direct extraction, falling back to adapter extraction');
                
                while (retryCount < this.maxRetries && extractedPapers.length === 0) {
                    try {
                        // Extract paper data based on selectors
                        extractedPapers = await this.browserAdapter.extract(config.sourceConfig.selectors);
                        
                        if (extractedPapers.length === 0 && retryCount < this.maxRetries - 1) {
                            console.log(`No papers found, retrying extraction (${retryCount + 1}/${this.maxRetries})`);
                            await delay(this.retryDelay);
                            retryCount++;
                        } else {
                            break;
                        }
                    } catch (extractError: unknown) {
                        console.error('Error extracting papers:', extractError);
                        if (retryCount < this.maxRetries - 1) {
                            console.log(`Will retry extraction (${retryCount + 1}/${this.maxRetries})`);
                            await delay(this.retryDelay);
                            retryCount++;
                        } else {
                            throw extractError;
                        }
                    }
                }
            }
            
            console.log(`Found ${extractedPapers.length} papers on current page`);
            
            // Process the extracted papers
            papersFoundOnPage = await this.processPapersData(extractedPapers, config);
            
            return papersFoundOnPage;
        } catch (error: unknown) {
            console.error('Error processing papers on page:', error);
            return papersFoundOnPage;
        }
    }

    private matchesFilters(paperData: ExtractedPaperData, filters?: CrawlerConfig['filters']): boolean {
        if (!filters) return true;
        
        // Date range filtering
        if (filters.dateRange && paperData.publicationDate) {
            let paperDate: Date;
            
            if (paperData.publicationDate instanceof Date) {
                paperDate = paperData.publicationDate;
            } else if (typeof paperData.publicationDate === 'string') {
                paperDate = new Date(paperData.publicationDate);
            } else if (paperData.date) {
                paperDate = new Date(paperData.date);
            } else {
                // Skip date filtering if date is missing
                console.log('Paper date missing, skipping date filter');
                return true;
            }
            
            if (
                !isNaN(paperDate.getTime()) &&
                (paperDate < filters.dateRange.start ||
                paperDate > filters.dateRange.end)
            ) {
                console.log('Paper excluded based on date filter');
                return false;
            }
        }
        
        // Keywords filtering
        if (filters.keywords && filters.keywords.length > 0) {
            // Collect all text to search in
            const paperText = [
                paperData.title || '',
                paperData.abstract || '',
                ...(Array.isArray(paperData.keywords) ? paperData.keywords : []),
                typeof paperData.keywords === 'string' ? paperData.keywords : ''
            ].filter(Boolean).join(' ').toLowerCase();
            
            // Check if any keyword is present
            const hasKeyword = filters.keywords.some(keyword => 
                paperText.includes(keyword.toLowerCase())
            );
            
            if (!hasKeyword) {
                console.log('Paper excluded based on keyword filter');
                return false;
            }
        }
        
        // Categories filtering
        if (filters.categories && filters.categories.length > 0) {
            let paperCategories: string[] = [];
            
            if (Array.isArray(paperData.categories)) {
                paperCategories = paperData.categories;
            } else if (typeof paperData.categories === 'string') {
                paperCategories = [paperData.categories];
            } else {
                // Skip category filtering if categories are missing
                console.log('Paper categories missing, skipping category filter');
                return true;
            }
                
            const matchesCategory = paperCategories.some((category: string) =>
                filters.categories!.some(filterCategory => 
                    category.toLowerCase().includes(filterCategory.toLowerCase())
                )
            );
            
            if (!matchesCategory) {
                console.log('Paper excluded based on category filter');
                return false;
            }
        }
        
        return true;
    }

    private async applyRateLimit(rateLimit?: number): Promise<void> {
        const delayMs = rateLimit ? 1000 / rateLimit : 1000;
        await delay(delayMs);
    }

    async cleanup(): Promise<void> {
        console.log('Cleaning up BioRxiv/MedRxiv crawler');
        this.isClosing = true;
        
        try {
            await this.browserAdapter.cleanup();
            console.log('BioRxiv/MedRxiv browser adapter cleaned up successfully');
        } catch (error: unknown) {
            console.error('Error cleaning up BioRxiv/MedRxiv browser adapter:', error);
        }
        
        this.status.isRunning = false;
    }
} 