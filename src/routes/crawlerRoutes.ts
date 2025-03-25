import { Router, Request, Response } from 'express';
import { PaperCrawler } from '../services/PaperCrawler';
import { Paper } from '../models/Paper';
import { AppDataSource } from '../config/database';

const router = Router();
let activeCrawler: PaperCrawler | null = null;
let crawlerStatus = {
    isRunning: false,
    currentSource: '',
    papersFound: 0,
    lastError: '',
    currentPage: 0,
    totalPages: 0
};

// Add RSS feed storage
let rssFeeds = [
    { url: 'https://www.nature.com/nature.rss', name: 'Nature', status: 'active' },
    { url: 'https://www.science.org/rss/news_current.xml', name: 'Science', status: 'active' },
    { url: 'https://www.pnas.org/action/showFeed?type=etoc&feed=rss&jc=pnas', name: 'PNAS', status: 'active' },
    // Add more scientific and research feeds
    { url: 'https://journals.plos.org/ploscompbiol/feed/atom', name: 'PLOS Computational Biology', status: 'active' },
    { url: 'https://www.cell.com/cell/rss', name: 'Cell', status: 'active' },
    { url: 'https://www.sciencedirect.com/science/article/pii/rss', name: 'ScienceDirect', status: 'active' },
    { url: 'https://journals.plos.org/plosbiology/feed/atom', name: 'PLOS Biology', status: 'active' },
    { url: 'https://www.biorxiv.org/alertsrss', name: 'bioRxiv', status: 'active' },
    { url: 'https://www.genome.gov/Feed/rss/news-features', name: 'Genome.gov', status: 'active' },
    { url: 'https://www.aaai.org/AITopics/rss/current', name: 'AAAI AI Topics', status: 'active' },
    { url: 'https://www.frontiersin.org/journals/bioengineering-and-biotechnology/rss', name: 'Frontiers in Bioengineering', status: 'active' },
    { url: 'https://jmlr.org/jmlr.xml', name: 'Journal of Machine Learning Research', status: 'active' },
    { url: 'https://www.ncbi.nlm.nih.gov/pmc/utils/rss/pmc_pnas_recent.xml', name: 'PNAS on PMC', status: 'active' }
];

// Add reset database route
const resetHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        if (crawlerStatus.isRunning) {
            res.status(400).json({ error: 'Cannot reset database while crawler is running' });
            return;
        }

        // Ensure database connection is initialized
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }

        // Drop all papers
        const paperRepository = AppDataSource.getRepository(Paper);
        await paperRepository.clear();

        res.json({ message: 'Database reset successfully' });
    } catch (error) {
        console.error('Error resetting database:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to reset database';
        res.status(500).json({ error: errorMessage });
    }
};

// Add RSS feed routes
const addFeedHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { url, name } = req.body;
        
        if (!url || !name) {
            res.status(400).json({ error: 'URL and name are required' });
            return;
        }
        
        // Check if feed already exists
        const existingFeed = rssFeeds.find(feed => feed.url === url);
        if (existingFeed) {
            res.status(400).json({ error: 'Feed already exists' });
            return;
        }
        
        // Add new feed
        rssFeeds.push({ url, name, status: 'active' });
        
        res.json({ message: 'Feed added successfully', feeds: rssFeeds });
    } catch (error) {
        console.error('Error adding feed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to add feed';
        res.status(500).json({ error: errorMessage });
    }
};

const removeFeedHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { url } = req.body;
        
        if (!url) {
            res.status(400).json({ error: 'URL is required' });
            return;
        }
        
        // Find feed index
        const feedIndex = rssFeeds.findIndex(feed => feed.url === url);
        if (feedIndex === -1) {
            res.status(404).json({ error: 'Feed not found' });
            return;
        }
        
        // Remove feed
        rssFeeds.splice(feedIndex, 1);
        
        res.json({ message: 'Feed removed successfully', feeds: rssFeeds });
    } catch (error) {
        console.error('Error removing feed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to remove feed';
        res.status(500).json({ error: errorMessage });
    }
};

const getFeedsHandler = (_req: Request, res: Response): void => {
    try {
        // Update feed health from active crawler if available
        if (activeCrawler) {
            // Check if the crawler is an RSS Feed crawler
            const crawler = activeCrawler as any;
            if (crawler.name === 'RSS Feeds' && typeof crawler.getFeedHealth === 'function') {
                const feedHealth = crawler.getFeedHealth();
                if (feedHealth && feedHealth instanceof Map) {
                    rssFeeds = rssFeeds.map(feed => {
                        const health = feedHealth.get(feed.url);
                        if (health) {
                            return {
                                ...feed,
                                lastFetched: health.lastFetched,
                                status: health.status,
                                errorMessage: health.errorMessage
                            };
                        }
                        return feed;
                    });
                }
            }
        }
        
        res.json({ feeds: rssFeeds });
    } catch (error) {
        console.error('Error getting feeds:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to get feeds';
        res.status(500).json({ error: errorMessage });
    }
};

// Modify the startHandler function to support RSS feeds
const startHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        if (crawlerStatus.isRunning) {
            res.status(400).json({ error: 'Crawler is already running' });
            return;
        }

        // Ensure database connection is initialized
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }

        const { maxPapers = 50, sources = ['PubMed'], keywords = [] } = req.body;

        // Use the provided keywords or fallback to default search terms
        const searchTerms = keywords.length > 0 
            ? keywords.join(' OR ')
            : 'synthetic biology OR machine learning OR bioinformatics';
        
        console.log('Search terms for crawler:', searchTerms);
        console.log('Keywords received:', keywords);

        const config = {
            sources: sources.map((name: string) => {
                if (name === 'BioRxiv/MedRxiv') {
                    return {
                        name,
                        url: `https://www.biorxiv.org/search/${encodeURIComponent(searchTerms)}`,
                        selectors: {
                            articleContainer: '.highwire-list-wrapper article, .search-result, .article-item, .highwire-citation, .search-listing-wrapper .article, .search-listing-wrapper .search-result, .item-list .search-result',
                            title: '.highwire-cite-title a, h2 a, .title a, .article-title a, h1 a, h3 a, .paper-title a, .highwire-cite-title, h2, .title, .article-title, h1, h3, .paper-title',
                            abstract: '.highwire-cite-snippet, .abstract, .meta-abstract, .paper-abstract, .summary, .excerpt',
                            authors: '.highwire-citation-authors, .authors, .meta-authors, .contributor-list, .author-list, .paper-authors',
                            doi: '.highwire-cite-metadata-doi, .doi, [data-doi], .paper-doi, .meta-doi',
                            date: '.highwire-cite-metadata-journal, .published-date, .publication-date, time, .date, .paper-date, .meta-date',
                            categories: '.highwire-citation-categories, .categories, .subject-area, .paper-categories, .meta-categories, .topics',
                            keywords: '.highwire-keywords-wrapper, .keywords, .kwd-group',
                            nextPage: 'li.pager-next a, a.page-link, a.next-page, a[rel="next"]',
                            url: '.highwire-cite-title a, h2 a, .title a, .article-title a, h1 a, h3 a, .paper-title a'
                        },
                        patterns: {
                            title: null,
                            doi: 'doi:\\/\\/([\\w\\.\\-\\/]+)',
                            date: '\\(([\\w\\s]+)\\)'
                        },
                        rateLimit: 1,
                        maxPages: 5
                    };
                } else if (name === 'RSS Feeds') {
                    return {
                        name,
                        url: 'rss-feed://',
                        selectors: {
                            title: '',
                            abstract: '',
                            authors: '',
                            doi: '',
                            articleContainer: '',
                            url: ''
                        },
                        feeds: rssFeeds,
                        rateLimit: 2,
                        maxPages: 1,
                        maxFeeds: 10,
                        isRssFeed: true
                    };
                } else {
                    // PubMed config
                    return {
                        name,
                        url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(searchTerms)}&sort=date&size=100`,
                        selectors: {
                            title: 'a.docsum-title',
                            abstract: 'div.full-view-snippet, div.full-view-abstract',
                            authors: 'span.docsum-authors',
                            doi: 'span.docsum-pmid',
                            date: 'span.docsum-journal-citation',
                            categories: 'div.docsum-subjects',
                            keywords: 'div.keywords',
                            nextPage: 'a.next-page',
                            articleContainer: 'article.full-docsum',
                            url: 'a.docsum-title',
                            detailPage: {
                                doi: '.identifiers .doi, .identifier.doi, a[href*="doi.org"]',
                                abstract: '.abstract-content p, .abstract, #abstract, .abstract-section p'
                            }
                        },
                        patterns: {
                            title: null,
                            doi: 'PMID:\\s*(\\d+)',
                            date: '(\\d{4})\\s+[A-Za-z]+',
                            actualDoi: '(10\\.\\d{4,}[\\/\\.]\\S+)'
                        },
                        rateLimit: 2,
                        maxPages: 10,
                        postProcess: async (paper: any, page: any) => {
                            if (paper.doi && /^\d+$/.test(paper.doi)) {
                                if (!paper.metadata) {
                                    paper.metadata = {};
                                }
                                
                                paper.metadata.pmid = paper.doi;
                                paper.metadata.journal = 'PubMed';
                                
                                try {
                                    if (paper.url && page) {
                                        console.log(`Fetching details for PMID:${paper.metadata.pmid} from ${paper.url}`);
                                        
                                        await page.goto(paper.url, {
                                            waitUntil: 'domcontentloaded',
                                            timeout: 30000
                                        });
                                        
                                        await page.waitForSelector('main', { timeout: 10000 })
                                            .catch(() => console.log('Timeout waiting for main content'));

                                        // Get the full abstract from the paper detail page
                                        const fullAbstract = await page.evaluate((abstractSelector: string) => {
                                            // Try to find the abstract using various selectors
                                            const selectors = abstractSelector.split(', ');
                                            let abstractText = '';
                                            
                                            for (const selector of selectors) {
                                                const elements = document.querySelectorAll(selector);
                                                if (elements.length > 0) {
                                                    // If multiple paragraph elements, join them
                                                    elements.forEach(el => {
                                                        abstractText += el.textContent?.trim() + "\n\n";
                                                    });
                                                    break;
                                                }
                                            }
                                            
                                            // Fallback to finding text labeled as "Abstract"
                                            if (!abstractText) {
                                                const headings = document.querySelectorAll('h2, h3, h4, strong');
                                                for (const heading of Array.from(headings)) {
                                                    if (heading.textContent?.trim().toLowerCase() === 'abstract') {
                                                        let nextNode = heading.nextElementSibling;
                                                        while (nextNode && 
                                                              nextNode.tagName !== 'H2' && 
                                                              nextNode.tagName !== 'H3' && 
                                                              nextNode.tagName !== 'H4') {
                                                            abstractText += nextNode.textContent?.trim() + "\n\n";
                                                            nextNode = nextNode.nextElementSibling;
                                                        }
                                                        break;
                                                    }
                                                }
                                            }
                                            
                                            return abstractText.trim() || null;
                                        }, paper.selectors?.detailPage?.abstract || '.abstract-content p, .abstract, #abstract, .abstract-section p');
                                        
                                        if (fullAbstract) {
                                            console.log(`Found full abstract for PMID:${paper.metadata.pmid}`);
                                            // Replace the snippet with the full abstract
                                            paper.abstract = fullAbstract;
                                        }

                                        const actualDoi = await page.evaluate((doiSelector: string, doiPattern: string) => {
                                            const doiElements = document.querySelectorAll(doiSelector);
                                            
                                            for (const element of Array.from(doiElements)) {
                                                const text = element.textContent || '';
                                                const textMatch = text.match(new RegExp(doiPattern, 'i'));
                                                if (textMatch && textMatch[1]) {
                                                    return textMatch[1].trim();
                                                }
                                                
                                                if (element.tagName === 'A') {
                                                    const href = (element as HTMLAnchorElement).href || '';
                                                    if (href.includes('doi.org/')) {
                                                        const hrefMatch = href.match(/doi\.org\/([^\/\s&?#]+\/[^\/\s&?#]+)/i);
                                                        if (hrefMatch && hrefMatch[1]) {
                                                            return hrefMatch[1].trim();
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            const pageText = document.body.textContent || '';
                                            const fullPageMatch = pageText.match(/DOI:?\s*(10\.\d{4,}[\/\.][^\s]+)/i);
                                            if (fullPageMatch && fullPageMatch[1]) {
                                                return fullPageMatch[1].trim();
                                            }
                                            
                                            return null;
                                        }, paper.selectors?.detailPage?.doi || '.identifiers .doi, .identifier.doi, a[href*="doi.org"]', 
                                           paper.patterns?.actualDoi || '(10\\.\\d{4,}[\\/\\.]\\S+)');
                                        
                                        if (actualDoi) {
                                            console.log(`Found DOI for PMID:${paper.metadata.pmid}: ${actualDoi}`);
                                            paper.metadata.doi = actualDoi;
                                            paper.doi = `pubmed-${paper.metadata.pmid}`;
                                        } else {
                                            console.log(`No DOI found for PMID:${paper.metadata.pmid}`);
                                            paper.doi = `pubmed-${paper.metadata.pmid}`;
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Error fetching details for PMID:${paper.metadata.pmid}:`, error);
                                    paper.doi = `pubmed-${paper.metadata.pmid}`;
                                }
                            }
                            
                            return paper;
                        },
                        extraHeaders: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Connection': 'keep-alive',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'Upgrade-Insecure-Requests': '1',
                            'Sec-Fetch-Dest': 'document',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-Site': 'none',
                            'Sec-Fetch-User': '?1'
                        }
                    };
                }
            }),
            filters: {
                keywords: keywords.length > 0 ? keywords : ['synthetic biology', 'machine learning', 'bioinformatics', 'computational biology'],
                categories: ['Research Article', 'Journal Article']
            },
            retryOptions: {
                maxRetries: 3,
                delayMs: 10000
            },
            maxPapers: maxPapers * 2,
            selectedSources: sources
        };

        const paperRepository = AppDataSource.getRepository(Paper);
        activeCrawler = new PaperCrawler(paperRepository, config);

        // If RSS Feeds is selected, pass the feeds to the crawler
        if (sources.includes('RSS Feeds') && activeCrawler) {
            // Use type assertion to access setFeeds method
            const crawler = activeCrawler as any;
            if (crawler.setFeeds && typeof crawler.setFeeds === 'function') {
                crawler.setFeeds(rssFeeds);
            }
        }

        // Reset crawler status
        crawlerStatus = {
            isRunning: true,
            currentSource: sources[0],
            papersFound: 0,
            lastError: '',
            currentPage: 1,
            totalPages: config.sources[0].maxPages || 1
        };

        // Start crawling in the background
        activeCrawler.crawl()
            .then(() => {
                crawlerStatus.isRunning = false;
                console.log('Crawling completed successfully');
            })
            .catch(error => {
                console.error('Crawler error:', error);
                crawlerStatus.lastError = error.message;
                crawlerStatus.isRunning = false;
            });

        res.json({ message: 'Crawler started', status: crawlerStatus });
    } catch (error) {
        console.error('Error starting crawler:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to start crawler';
        crawlerStatus.lastError = errorMessage;
        res.status(500).json({ error: errorMessage });
    }
};

const stopHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        if (!activeCrawler) {
            res.status(400).json({ error: 'No active crawler' });
            return;
        }

        console.log('Attempting to stop crawler...');
        
        crawlerStatus.isRunning = false; // Set to false immediately to prevent new operations
        
        try {
            // Ensure the crawler is closed properly with a timeout
            const closePromise = activeCrawler.close();
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, 10000));
            
            await Promise.race([closePromise, timeoutPromise]);
            console.log('Crawler closed successfully');
        } catch (closeError) {
            console.error('Error during crawler.close():', closeError);
            // Try to force closure even if normal closure fails
            try {
                // @ts-ignore - accessing private property as a fallback
                if (activeCrawler.browser) {
                    // @ts-ignore
                    await activeCrawler.browser.close();
                    console.log('Forced browser closure');
                }
            } catch (forceCloseError) {
                console.error('Failed to force close browser:', forceCloseError);
            }
        }
        
        // Reset crawler status regardless of close success/failure
        activeCrawler = null;

        res.json({ message: 'Crawler stopped', status: crawlerStatus });
    } catch (error) {
        console.error('Error stopping crawler:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to stop crawler';
        crawlerStatus.lastError = errorMessage;
        
        // Reset crawler status even if an error occurred
        activeCrawler = null;
        crawlerStatus.isRunning = false;
        
        res.status(500).json({ error: errorMessage });
    }
};

const statusHandler = (_req: Request, res: Response): void => {
    res.json(crawlerStatus);
};

router.post('/reset', resetHandler);
router.post('/start', startHandler);
router.post('/stop', stopHandler);
router.get('/status', statusHandler);
router.post('/feeds/add', addFeedHandler);
router.post('/feeds/remove', removeFeedHandler);
router.get('/feeds', getFeedsHandler);

export default router; 