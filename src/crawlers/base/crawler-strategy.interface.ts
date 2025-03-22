import { Paper } from '../../models/Paper';
import { IBrowserAdapter } from '../browser/browser-adapter.interface';
import { Repository } from 'typeorm';

export interface ICrawlerStrategy {
    readonly name: string;
    readonly browserAdapter: IBrowserAdapter;
    readonly paperRepository: Repository<Paper>;

    initialize(): Promise<void>;
    crawl(config: CrawlerConfig): Promise<void>;
    cleanup(): Promise<void>;
}

export interface CrawlerConfig {
    maxPapers: number;
    filters?: {
        dateRange?: {
            start: Date;
            end: Date;
        };
        keywords?: string[];
        categories?: string[];
    };
    sourceConfig: SourceConfig;
}

export interface SourceConfig {
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
}

export interface CrawlerStatus {
    isRunning: boolean;
    currentSource: string;
    papersFound: number;
    lastError: string;
    currentPage: number;
    totalPages: number;
} 