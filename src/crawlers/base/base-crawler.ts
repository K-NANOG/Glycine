import { IBrowserAdapter } from '../browser/browser-adapter.interface';
import { Repository } from 'typeorm';
import { Paper } from '../../models/Paper';
import { ObjectId } from 'mongodb';

export interface CrawlerStatus {
    isRunning: boolean;
    currentSource: string;
    papersFound: number;
    lastError: string;
    currentPage: number;
    totalPages: number;
}

export abstract class BaseCrawler {
    protected status: CrawlerStatus = {
        isRunning: false,
        currentSource: '',
        papersFound: 0,
        lastError: '',
        currentPage: 1,
        totalPages: 0
    };

    protected isClosing = false;
    protected totalPapersFound = 0;

    constructor(
        protected readonly name: string,
        protected readonly browserAdapter: IBrowserAdapter,
        protected readonly paperRepository: Repository<Paper>
    ) {}

    async initialize(): Promise<void> {
        await this.browserAdapter.initialize();
        this.status.isRunning = false;
        this.status.papersFound = 0;
        this.status.currentPage = 1;
        this.isClosing = false;
        this.totalPapersFound = 0;
    }

    abstract crawl(): Promise<void>;

    async cleanup(): Promise<void> {
        this.isClosing = true;
        await this.browserAdapter.cleanup();
        this.status.isRunning = false;
    }

    protected async savePaper(paperData: any): Promise<void> {
        try {
            const paper = new Paper({
                ...paperData,
                isProcessed: false,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            paper._id = new ObjectId();

            await this.paperRepository.save(paper);
            this.status.papersFound++;
            this.totalPapersFound++;
            console.log(`Saved paper: ${paper.title}`);
        } catch (error) {
            console.error(`Error saving paper: ${error}`);
            throw error;
        }
    }

    protected matchesFilters(paper: Paper, filters?: any): boolean {
        if (!filters) return true;

        if (filters.dateRange && paper.publicationDate) {
            const date = new Date(paper.publicationDate);
            if (date < filters.dateRange.start || date > filters.dateRange.end) {
                return false;
            }
        }

        if (filters.keywords?.length > 0) {
            const paperKeywords = paper.keywords || [];
            if (!filters.keywords.some((keyword: string) => 
                paperKeywords.some(pk => pk.toLowerCase().includes(keyword.toLowerCase()))
            )) {
                return false;
            }
        }

        if (filters.categories?.length > 0) {
            const paperCategories = paper.categories || [];
            if (!filters.categories.some((category: string) =>
                paperCategories.some(pc => pc.toLowerCase().includes(category.toLowerCase()))
            )) {
                return false;
            }
        }

        return true;
    }

    getStatus(): CrawlerStatus {
        return { ...this.status };
    }
} 