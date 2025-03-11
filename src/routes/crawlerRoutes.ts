import { Router } from 'express';
import { PaperCrawler } from '../services/PaperCrawler';
import { Paper } from '../models/Paper';
import { AppDataSource } from '../config/database';
import WebSocket from 'ws';
import { Server } from 'http';

const router = Router();
let activeCrawler: PaperCrawler | null = null;
let wss: WebSocket.Server | null = null;

export function initializeWebSocket(server: Server) {
    wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws) => {
        console.log('New WebSocket client connected');
        
        ws.on('error', console.error);
        
        // Send initial status if crawler is active
        if (activeCrawler) {
            ws.send(JSON.stringify({
                type: 'status',
                data: activeCrawler.getStatus()
            }));
        }
    });
}

function broadcastMessage(message: any) {
    if (wss) {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

let crawlerStatus = {
    isRunning: false,
    currentSource: '',
    papersFound: 0,
    lastError: '',
    currentPage: 0,
    totalPages: 0
};

router.post('/start', async (req, res) => {
    try {
        if (crawlerStatus.isRunning) {
            return res.status(400).json({ error: 'Crawler is already running' });
        }

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
                        ? 'p.title' 
                        : 'a.docsum-title',
                    abstract: name === 'arXiv' 
                        ? 'span.abstract-full' 
                        : 'div.full-view-snippet',
                    authors: name === 'arXiv' 
                        ? 'div.authors' 
                        : 'span.docsum-authors',
                    pmid: name === 'arXiv'
                        ? null
                        : 'span.docsum-pmid',
                    doi: name === 'arXiv'
                        ? 'span.arxiv-id'
                        : 'span.doi',
                    date: name === 'arXiv' 
                        ? 'div.submission-history' 
                        : 'span.docsum-journal-citation',
                    categories: name === 'arXiv' 
                        ? 'div.subjects' 
                        : 'div.docsum-subjects',
                    keywords: name === 'arXiv' 
                        ? 'div.subjects' 
                        : 'div.keywords',
                    nextPage: name === 'arXiv'
                        ? 'a.pagination-next'
                        : 'a.next-page',
                    articleContainer: name === 'arXiv'
                        ? 'li.arxiv-result'
                        : 'article.full-docsum',
                    url: name === 'arXiv'
                        ? 'p.title a'
                        : 'a.docsum-title'
                },
                patterns: {
                    title: null,
                    pmid: name === 'arXiv'
                        ? null
                        : 'PMID:\\s*(\\d+)',
                    doi: name === 'arXiv'
                        ? 'arXiv:([\\d\\.v]+)'
                        : 'doi:\\s*([\\d\\.\\/-]+[\\w-]+)',
                    date: name === 'arXiv'
                        ? 'Submitted\\s+([^\\s]+)'
                        : '(\\d{4})\\s+[A-Za-z]+'
                },
                extraHeaders: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'max-age=0',
                    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                },
                rateLimit: name === 'arXiv' ? 1 : 1,
                maxPages: 20,
                maxPapers: maxPapers * 2
            })),
            filters: {
                keywords: ['synthetic biology', 'machine learning', 'bioinformatics', 'computational biology'],
                categories: ['q-bio', 'cs.AI', 'Research Article', 'Journal Article']
            },
            retryOptions: {
                maxRetries: 3,
                delayMs: 5000
            },
            maxPapers: maxPapers * 2
        };

        const paperRepository = AppDataSource.getRepository(Paper);
        activeCrawler = new PaperCrawler(paperRepository, config);

        // Set up event listeners for the crawler
        activeCrawler.on('log', (logData) => {
            broadcastMessage({
                type: 'log',
                data: logData
            });
        });

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
                broadcastMessage({
                    type: 'status',
                    data: { ...crawlerStatus, message: 'Crawling completed successfully' }
                });
            })
            .catch(error => {
                console.error('Crawler error:', error);
                crawlerStatus.lastError = error.message;
                crawlerStatus.isRunning = false;
                broadcastMessage({
                    type: 'status',
                    data: { ...crawlerStatus, message: 'Crawler error: ' + error.message }
                });
            });

        return res.json({ message: 'Crawler started', status: crawlerStatus });
    } catch (error) {
        console.error('Error starting crawler:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to start crawler';
        crawlerStatus.lastError = errorMessage;
        return res.status(500).json({ error: errorMessage });
    }
});

router.post('/stop', async (_req, res) => {
    try {
        if (!activeCrawler) {
            return res.status(400).json({ error: 'No active crawler' });
        }

        await activeCrawler.close();
        activeCrawler = null;
        crawlerStatus.isRunning = false;

        return res.json({ message: 'Crawler stopped', status: crawlerStatus });
    } catch (error) {
        console.error('Error stopping crawler:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to stop crawler';
        crawlerStatus.lastError = errorMessage;
        return res.status(500).json({ error: errorMessage });
    }
});

router.get('/status', (_req, res) => {
    return res.json(crawlerStatus);
});

export default router; 