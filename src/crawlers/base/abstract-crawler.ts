import { ICrawlerStrategy, CrawlerConfig, CrawlerStatus } from './crawler-strategy.interface';
import { IBrowserAdapter } from '../browser/browser-adapter.interface';
import { Paper } from '../../models/Paper';
import { Repository } from 'typeorm';
import { delay } from '../../utils/delay';

export abstract class AbstractCrawler implements ICrawlerStrategy {
    protected status: CrawlerStatus = {
        isRunning: false,
        currentSource: '',
        papersFound: 0,
        lastError: '',
        currentPage: 1,
        totalPages: 0
    };

    constructor(
        public readonly name: string,
        public readonly browserAdapter: IBrowserAdapter,
        public readonly paperRepository: Repository<Paper>
    ) {}

    async initialize(): Promise<void> {
        await this.browserAdapter.initialize();
        this.status.isRunning = false;
        this.status.papersFound = 0;
        this.status.currentPage = 1;
    }

    abstract crawl(config: CrawlerConfig): Promise<void>;

    async cleanup(): Promise<void> {
        await this.browserAdapter.cleanup();
        this.status.isRunning = false;
    }

    protected async savePaper(paper: Paper): Promise<void> {
        try {
            await this.paperRepository.save(paper);
            this.status.papersFound++;
        } catch (error) {
            console.error(`Error saving paper: ${error}`);
            throw error;
        }
    }

    protected matchesFilters(paper: Paper, filters?: CrawlerConfig['filters']): boolean {
        if (!filters) return true;

        if (filters.dateRange && paper.publicationDate) {
            const date = new Date(paper.publicationDate);
            if (date < filters.dateRange.start || date > filters.dateRange.end) {
                return false;
            }
        }

        if (filters.keywords && filters.keywords.length > 0) {
            const paperKeywords = paper.keywords || [];
            if (!filters.keywords.some(keyword => 
                paperKeywords.some(pk => pk.toLowerCase().includes(keyword.toLowerCase()))
            )) {
                return false;
            }
        }

        if (filters.categories && filters.categories.length > 0) {
            const paperCategories = paper.categories || [];
            if (!filters.categories.some(category =>
                paperCategories.some(pc => pc.toLowerCase().includes(category.toLowerCase()))
            )) {
                return false;
            }
        }

        return true;
    }

    protected async handleRateLimit(rateLimit?: number): Promise<void> {
        if (rateLimit) {
            await delay(60000 / rateLimit);
        }
    }

    getStatus(): CrawlerStatus {
        return { ...this.status };
    }
} 