import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import { IBrowserAdapter, BrowserSetupOptions, NavigationOptions, WaitOptions } from './browser-adapter.interface';
import { ExtractedData } from '../../types/paper.types';
import { Selectors } from '../../types/crawler.types';
import { delay } from '../../utils/delay';

export class PuppeteerAdapter implements IBrowserAdapter {
    browser: Browser | null = null;
    page: Page | null = null;

    async initialize(): Promise<void> {
        try {
            const options: PuppeteerLaunchOptions = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            };
            this.browser = await puppeteer.launch(options);
        } catch (error) {
            console.error('Failed to initialize browser:', error);
            throw error;
        }
    }

    async setup(options?: BrowserSetupOptions): Promise<void> {
        if (!this.browser) {
            throw new Error('Browser not initialized');
        }

        this.page = await this.browser.newPage();

        if (options?.extraHeaders) {
            await this.page.setExtraHTTPHeaders(options.extraHeaders);
        }

        if (options?.viewport) {
            await this.page.setViewport(options.viewport);
        }

        if (options?.timeout) {
            this.page.setDefaultTimeout(options.timeout);
        }

        await this.page.setRequestInterception(true);

        this.page.on('request', async (request) => {
            const resourceType = request.resourceType();
            const url = request.url();

            // Allow essential resources and PubMed-specific resources
            if (
                resourceType === 'document' ||
                resourceType === 'xhr' ||
                resourceType === 'fetch' ||
                resourceType === 'script' ||
                (resourceType === 'stylesheet' && url.includes('pubmed.ncbi.nlm.nih.gov')) ||
                (resourceType === 'image' && url.includes('pubmed.ncbi.nlm.nih.gov'))
            ) {
                try {
                    await request.continue();
                } catch (error) {
                    console.error('Request continuation failed:', error);
                }
            } else {
                try {
                    await request.abort();
                } catch (error) {
                    console.error('Request abortion failed:', error);
                }
            }
        });

        this.page.on('error', error => {
            console.error('Page error:', error);
        });

        this.page.on('console', msg => {
            console.log('Page console:', msg.text());
        });

        // Set PubMed-specific cookie
        await this.page.setCookie({
            name: 'ncbi_sid',
            value: Date.now().toString(),
            domain: '.ncbi.nlm.nih.gov'
        });
    }

    async navigate(url: string, options?: NavigationOptions): Promise<void> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        await this.page.goto(url, {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: options?.timeout || 120000
        });

        // Add delay to ensure dynamic content is loaded
        await delay(10000);
    }

    async extract(selectors: Selectors): Promise<ExtractedData[]> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        // Wait for articles to be present
        await this.page.waitForSelector(selectors.articleContainer, {
            timeout: 30000,
            visible: true
        });

        // Add delay to ensure dynamic content is loaded
        await delay(5000);

        return this.page.evaluate((config) => {
            const papers: ExtractedData[] = [];
            const articles = document.querySelectorAll(config.articleContainer);
            console.log(`Found ${articles.length} article elements`);

            articles.forEach((article: Element, index: number) => {
                console.log(`Processing article ${index + 1}/${articles.length}`);
                try {
                    const extractText = (selector: string): string => {
                        try {
                            const element = article.querySelector(selector);
                            if (!element) {
                                console.log(`No element found for selector: ${selector}`);
                                return '';
                            }
                            const text = element.textContent?.trim() || '';
                            console.log(`Extracted text for selector ${selector}:`, text);
                            return text;
                        } catch (error) {
                            console.error(`Error extracting text for selector ${selector}:`, error);
                            return '';
                        }
                    };

                    const extractUrl = (selector: string): string => {
                        try {
                            const element = article.querySelector(selector) as HTMLAnchorElement;
                            if (!element) {
                                console.log(`No element found for URL selector: ${selector}`);
                                return '';
                            }
                            const url = element.href || '';
                            console.log(`Extracted URL for selector ${selector}:`, url);
                            return url;
                        } catch (error) {
                            console.error(`Error extracting URL for selector ${selector}:`, error);
                            return '';
                        }
                    };

                    const title = extractText(config.title);
                    const abstract = extractText(config.abstract);
                    const rawAuthors = extractText(config.authors);
                    const authors = rawAuthors.split(',').map(a => a.trim()).filter(Boolean);
                    const doiText = extractText(config.doi);
                    const doi = doiText.match(/PMID:\s*(\d+)/)?.[1] || doiText;
                    const url = extractUrl(config.url);

                    let publicationDate: Date | undefined;
                    if (config.date) {
                        const dateText = extractText(config.date);
                        const yearMatch = dateText.match(/(\d{4})/);
                        if (yearMatch) {
                            publicationDate = new Date(yearMatch[1]);
                        }
                    }

                    const keywords = config.keywords 
                        ? extractText(config.keywords).split(',').map(k => k.trim()).filter(Boolean)
                        : [];

                    const categories = config.categories
                        ? extractText(config.categories).split(',').map(c => c.trim()).filter(Boolean)
                        : [];

                    // Log extracted data for debugging
                    console.log('Extracted paper data:', {
                        title,
                        abstractLength: abstract?.length,
                        authorsCount: authors.length,
                        doi,
                        publicationDate,
                        url,
                        keywordsCount: keywords.length,
                        categoriesCount: categories.length
                    });

                    // Validate required fields
                    if (!title || !doi) {
                        console.log('Paper missing required fields:', {
                            hasTitle: !!title,
                            hasDoi: !!doi
                        });
                        return;
                    }

                    // Create paper data
                    const paperData = {
                        title,
                        abstract: abstract || 'Abstract not available',
                        authors,
                        doi,
                        url: url || `https://pubmed.ncbi.nlm.nih.gov/${doi}/`,
                        publicationDate,
                        keywords,
                        categories
                    };

                    papers.push(paperData);
                    console.log(`Successfully extracted paper: ${title}`);
                } catch (error) {
                    console.error('Error extracting paper data:', error);
                }
            });

            console.log(`Extracted ${papers.length} valid papers`);
            return papers;
        }, selectors);
    }

    async waitForSelector(selector: string, options?: WaitOptions): Promise<void> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        await this.page.waitForSelector(selector, {
            timeout: options?.timeout || 60000,
            visible: options?.visible
        });
    }

    async evaluateSelector(selector: string): Promise<boolean> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        return this.page.evaluate((sel) => {
            const elements = document.querySelectorAll(sel);
            return elements.length > 0;
        }, selector);
    }

    async getNextPageUrl(selector: string): Promise<string | null> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        return this.page.evaluate((sel) => {
            const element = document.querySelector(sel) as HTMLAnchorElement;
            return element?.href || null;
        }, selector);
    }

    async cleanup(): Promise<void> {
        if (this.page && !this.page.isClosed()) {
            await this.page.close();
        }
        if (this.browser) {
            await this.browser.close();
        }
        this.page = null;
        this.browser = null;
    }
} 