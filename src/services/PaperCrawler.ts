import puppeteer, { Page } from 'puppeteer';
import { Paper } from '../models/Paper';
import { Repository } from 'typeorm';

export interface CrawlerConfig {
    sources: {
        name: string;
        url: string;
        selectors: {
            title: string;
            abstract: string;
            authors: string;
            doi: string;
        };
    }[];
    filters?: {
        dateRange?: {
            start: Date;
            end: Date;
        };
        keywords?: string[];
        categories?: string[];
    };
}

export class PaperCrawler {
    private browser: puppeteer.Browser | null = null;
    
    constructor(
        private readonly paperRepository: Repository<Paper>,
        private readonly config: CrawlerConfig
    ) {}

    async initialize(): Promise<void> {
        try {
            this.browser = await puppeteer.launch({
                headless: "new", // Use new headless mode
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log("Puppeteer browser initialized");
        } catch (error) {
            console.error("Failed to initialize Puppeteer:", error);
            throw error;
        }
    }

    async crawl(): Promise<void> {
        if (!this.browser) {
            await this.initialize();
        }

        for (const source of this.config.sources) {
            try {
                const page = await this.browser!.newPage();
                await page.goto(source.url, { 
                    waitUntil: 'networkidle0',
                    timeout: 30000
                });

                const papers = await this.extractPapers(page, source);
                
                for (const paperData of papers) {
                    const paper = new Paper(paperData);
                    const existingPaper = await this.paperRepository.findOne({ 
                        where: { doi: paper.doi } 
                    });
                    
                    if (!existingPaper) {
                        await this.paperRepository.save(paper);
                        console.log(`Crawled and saved paper: ${paper.title}`);
                    }
                }

                await page.close();
            } catch (error) {
                console.error(`Error crawling ${source.name}:`, error);
            }
        }
    }

    private async extractPapers(page: Page, source: CrawlerConfig['sources'][0]): Promise<Partial<Paper>[]> {
        return page.evaluate((selectors: CrawlerConfig['sources'][0]['selectors']) => {
            const papers: Partial<Paper>[] = [];
            const articles = document.querySelectorAll('article');
            
            articles.forEach((article) => {
                const title = article.querySelector(selectors.title)?.textContent?.trim();
                const abstract = article.querySelector(selectors.abstract)?.textContent?.trim();
                const authors = article.querySelector(selectors.authors)?.textContent?.trim().split(',');
                const doi = article.querySelector(selectors.doi)?.textContent?.trim();

                if (title && abstract && authors && doi) {
                    papers.push({
                        title,
                        abstract,
                        authors,
                        doi,
                        url: window.location.href,
                        publicationDate: new Date(),
                        keywords: [],
                        categories: [],
                        isProcessed: false
                    });
                }
            });

            return papers;
        }, source.selectors);
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
} 