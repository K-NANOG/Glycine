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
                            url: 'a.docsum-title'
                        },
                        patterns: {
                            title: null,
                            doi: 'PMID:\\s*(\\d+)',
                            date: '(\\d{4})\\s+[A-Za-z]+'
                        },
                        rateLimit: 2,
                        maxPages: 10,
                        postProcess: (paper: any) => {
                            if (paper.doi && /^\d+$/.test(paper.doi)) {
                                if (!paper.metadata) {
                                    paper.metadata = {};
                                }
                                
                                paper.metadata.pmid = paper.doi;
                                paper.metadata.journal = 'PubMed';
                                
                                paper.doi = `pubmed-${paper.metadata.pmid}`;
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

        // Reset crawler status
        crawlerStatus = {
            isRunning: true,
            currentSource: sources[0],
            papersFound: 0,
            lastError: '',
            currentPage: 1,
            totalPages: config.sources[0].maxPages
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
        
        try {
            // Ensure the crawler is closed properly
            await activeCrawler.close();
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
        crawlerStatus.isRunning = false;

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

export default router; 