import { ICrawlerStrategy, CrawlerConfig, CrawlerStatus } from '../base/crawler-strategy.interface';
import { IBrowserAdapter } from '../browser/browser-adapter.interface';
import { Paper } from '../../models/Paper';
import { Repository } from 'typeorm';
import { delay } from '../../utils/delay';
import { ObjectId } from 'mongodb';

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

    constructor(
        public readonly browserAdapter: IBrowserAdapter,
        public readonly paperRepository: Repository<Paper>
    ) {}

    async initialize(): Promise<void> {
        try {
            await this.browserAdapter.initialize();
            await this.browserAdapter.setup({
                extraHeaders: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache'
                }
            });
            this.status.isRunning = true;
        } catch (error) {
            this.status.isRunning = false;
            this.status.lastError = error instanceof Error ? error.message : 'Failed to initialize browser';
            throw error;
        }
    }

    async crawl(config: CrawlerConfig): Promise<void> {
        if (this.isClosing) return;
        
        try {
            this.status.isRunning = true;
            this.status.currentPage = 1;
            this.status.totalPages = config.sourceConfig.maxPages;
            
            // Build the search URL based on config keywords or default to a general search
            const searchTerms = config.filters?.keywords 
                ? config.filters.keywords.join('+OR+') 
                : 'synthetic+biology+OR+machine+learning+OR+bioinformatics';
                
            // bioRxiv/medRxiv uses the following format: https://www.biorxiv.org/search/[term]
            // Default URL if none provided
            const baseUrl = config.sourceConfig.url || 'https://www.biorxiv.org/search/';
            const searchUrl = `${baseUrl}${encodeURIComponent(searchTerms)}`;
            
            await this.browserAdapter.navigate(searchUrl);
            
            // Process search results page by page
            while (
                !this.isClosing && 
                this.status.currentPage <= config.sourceConfig.maxPages && 
                this.status.papersFound < config.maxPapers
            ) {
                // Extract papers from current page
                await this.processPapers(config);
                
                // Check if we need to move to the next page
                const nextPageUrl = await this.browserAdapter.getNextPageUrl(config.sourceConfig.selectors.nextPage || '.pager-next a');
                
                if (!nextPageUrl) {
                    console.log('No more pages available');
                    break;
                }
                
                // Rate limiting
                await this.applyRateLimit(config.sourceConfig.rateLimit);
                
                // Navigate to next page
                await this.browserAdapter.navigate(nextPageUrl);
                this.status.currentPage++;
                
                console.log(`Navigated to page ${this.status.currentPage}`);
            }
            
        } catch (error) {
            this.status.lastError = error instanceof Error ? error.message : 'Error during crawling';
            console.error('Crawling error:', this.status.lastError);
        } finally {
            this.status.isRunning = false;
        }
    }

    private async processPapers(config: CrawlerConfig): Promise<void> {
        try {
            // Extract paper data based on selectors
            const extractedPapers = await this.browserAdapter.extract(config.sourceConfig.selectors);
            
            // Process each paper
            for (const paperData of extractedPapers) {
                if (this.isClosing || this.status.papersFound >= config.maxPapers) break;
                
                // Check if we've already processed this paper (using DOI or URL as identifier)
                const paperId = paperData.doi || paperData.url;
                if (this.papersProcessed.has(paperId)) continue;
                
                // Apply filters
                if (!this.matchesFilters(paperData, config.filters)) continue;
                
                // Build paper entity
                const paper = new Paper({
                    title: paperData.title,
                    abstract: paperData.abstract,
                    authors: paperData.authors,
                    doi: paperData.doi,
                    url: paperData.url,
                    publicationDate: paperData.publicationDate,
                    keywords: paperData.keywords,
                    categories: paperData.categories
                });
                
                // Save to database
                await this.paperRepository.save(paper);
                
                // Mark as processed
                this.papersProcessed.add(paperId);
                this.status.papersFound++;
                
                console.log(`Saved paper: ${paper.title} (${this.status.papersFound}/${config.maxPapers})`);
            }
        } catch (error) {
            console.error('Error processing papers:', error);
        }
    }

    private matchesFilters(paperData: any, filters?: CrawlerConfig['filters']): boolean {
        if (!filters) return true;
        
        // Date range filtering
        if (filters.dateRange && paperData.date) {
            const paperDate = new Date(paperData.date);
            if (
                paperDate < filters.dateRange.start ||
                paperDate > filters.dateRange.end
            ) {
                return false;
            }
        }
        
        // Keywords filtering
        if (filters.keywords && filters.keywords.length > 0) {
            // Look for keywords in title, abstract, and paper keywords
            const paperText = [
                paperData.title,
                paperData.abstract,
                ...(paperData.keywords || [])
            ].join(' ').toLowerCase();
            
            // Check if any keyword is present
            const hasKeyword = filters.keywords.some(keyword => 
                paperText.includes(keyword.toLowerCase())
            );
            
            if (!hasKeyword) return false;
        }
        
        // Categories filtering
        if (filters.categories && filters.categories.length > 0 && paperData.categories) {
            const paperCategories = Array.isArray(paperData.categories) 
                ? paperData.categories 
                : [paperData.categories];
                
            const matchesCategory = paperCategories.some((category: string) =>
                filters.categories!.some(filterCategory => 
                    category.toLowerCase().includes(filterCategory.toLowerCase())
                )
            );
            
            if (!matchesCategory) return false;
        }
        
        return true;
    }

    private async applyRateLimit(rateLimit?: number): Promise<void> {
        const delayMs = rateLimit ? 1000 / rateLimit : 1000;
        await delay(delayMs);
    }

    async cleanup(): Promise<void> {
        this.isClosing = true;
        await this.browserAdapter.cleanup();
        this.status.isRunning = false;
    }
} 