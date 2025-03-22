import { ICrawlerStrategy } from '../base/crawler-strategy.interface';
import { IBrowserAdapter } from '../browser/browser-adapter.interface';
import { Repository } from 'typeorm';
import { Paper } from '../../models/Paper';

export class CrawlerFactory {
    private static instance: CrawlerFactory;
    private crawlers: Map<string, new (
        browserAdapter: IBrowserAdapter,
        paperRepository: Repository<Paper>
    ) => ICrawlerStrategy> = new Map();

    private constructor() {}

    static getInstance(): CrawlerFactory {
        if (!CrawlerFactory.instance) {
            CrawlerFactory.instance = new CrawlerFactory();
        }
        return CrawlerFactory.instance;
    }

    registerCrawler(
        name: string,
        crawlerClass: new (
            browserAdapter: IBrowserAdapter,
            paperRepository: Repository<Paper>
        ) => ICrawlerStrategy
    ): void {
        this.crawlers.set(name, crawlerClass);
    }

    createCrawler(
        name: string,
        browserAdapter: IBrowserAdapter,
        paperRepository: Repository<Paper>
    ): ICrawlerStrategy {
        const CrawlerClass = this.crawlers.get(name);
        if (!CrawlerClass) {
            throw new Error(`Crawler ${name} not registered`);
        }
        return new CrawlerClass(browserAdapter, paperRepository);
    }

    getAvailableCrawlers(): string[] {
        return Array.from(this.crawlers.keys());
    }
} 