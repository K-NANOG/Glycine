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

        const { maxPapers = 50, sources = ['PubMed', 'arXiv'] } = req.body;

        const config = {
            sources: sources.map((name: string) => ({
                name,
                url: name === 'arXiv' 
                    ? 'https://arxiv.org/search/advanced?advanced=&terms-0-operator=AND&terms-0-term=synthetic+biology+machine+learning+bioinformatics&terms-0-field=all&classification-physics_archives=all&classification-include_cross_list=include&date-filter_by=all_dates&date-year=&date-from_date=&date-to_date=&date-date_type=submitted_date&abstracts=show&size=50&order=-announced_date_first' 
                    : 'https://pubmed.ncbi.nlm.nih.gov/?term=(synthetic+biology+OR+machine+learning+OR+bioinformatics)&sort=date&size=100',
                selectors: {
                    title: name === 'arXiv' 
                        ? '.title' 
                        : 'a.docsum-title',
                    abstract: name === 'arXiv' 
                        ? '.abstract-full' 
                        : 'div.full-view-snippet',
                    authors: name === 'arXiv' 
                        ? '.authors' 
                        : 'span.docsum-authors',
                    doi: name === 'arXiv' 
                        ? '.list-title' 
                        : 'span.docsum-pmid',
                    date: name === 'arXiv' 
                        ? '.submitted-date' 
                        : 'span.docsum-journal-citation',
                    categories: name === 'arXiv' 
                        ? '.primary-subject' 
                        : 'div.docsum-subjects',
                    keywords: name === 'arXiv' 
                        ? '.subjects' 
                        : 'div.keywords',
                    nextPage: name === 'arXiv'
                        ? '.pagination-next'
                        : 'a.next-page',
                    articleContainer: name === 'arXiv'
                        ? '.arxiv-result'
                        : 'article.full-docsum',
                    url: name === 'arXiv'
                        ? 'a.list-title'
                        : 'a.docsum-title'
                },
                patterns: {
                    title: null,
                    doi: name === 'arXiv'
                        ? 'arXiv:([\\d\\.v]+)'
                        : 'PMID:\\s*(\\d+)',
                    date: name === 'arXiv'
                        ? 'Submitted\\s+([^\\s]+)'
                        : '(\\d{4})\\s+[A-Za-z]+'
                },
                rateLimit: name === 'arXiv' ? 1 : 2,
                maxPages: 10,
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
            })),
            filters: {
                keywords: ['synthetic biology', 'machine learning', 'bioinformatics', 'computational biology'],
                categories: ['q-bio', 'cs.AI', 'Research Article', 'Journal Article']
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

        await activeCrawler.close();
        activeCrawler = null;
        crawlerStatus.isRunning = false;

        res.json({ message: 'Crawler stopped', status: crawlerStatus });
    } catch (error) {
        console.error('Error stopping crawler:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to stop crawler';
        crawlerStatus.lastError = errorMessage;
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