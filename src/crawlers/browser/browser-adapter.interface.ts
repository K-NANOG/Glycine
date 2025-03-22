import { Page, Browser } from 'puppeteer';
import { ExtractedData } from '../../types/paper.types';
import { Selectors } from '../../types/crawler.types';

export interface IBrowserAdapter {
    browser: Browser | null;
    page: Page | null;

    initialize(): Promise<void>;
    setup(options?: BrowserSetupOptions): Promise<void>;
    navigate(url: string, options?: NavigationOptions): Promise<void>;
    extract(selectors: Selectors): Promise<ExtractedData>;
    waitForSelector(selector: string, options?: WaitOptions): Promise<void>;
    evaluateSelector(selector: string): Promise<boolean>;
    getNextPageUrl(selector: string): Promise<string | null>;
    cleanup(): Promise<void>;
}

export interface BrowserSetupOptions {
    viewport?: {
        width: number;
        height: number;
    };
    timeout?: number;
    extraHeaders?: Record<string, string>;
}

export interface NavigationOptions {
    waitUntil?: string | string[];
    timeout?: number;
}

export interface WaitOptions {
    timeout?: number;
    visible?: boolean;
} 