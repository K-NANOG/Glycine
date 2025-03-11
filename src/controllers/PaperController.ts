import { Request, Response } from 'express';
import { Paper } from '../models/Paper';
import { PaperCrawler, CrawlerConfig } from '../services/PaperCrawler';
import { mockPapers } from '../data/mockPapers';
import { AppDataSource } from '../config/database';
import { ObjectId } from 'mongodb';

export class PaperController {
    private static crawler: PaperCrawler;
    private static initialized = false;
    private static paperRepository = AppDataSource.getMongoRepository(Paper);

    static async initializeCrawler() {
        if (this.initialized) return;

        try {
            console.log("Starting crawler initialization...");

            // Ensure database is initialized
            if (!AppDataSource.isInitialized) {
                console.log("Initializing database connection...");
                await AppDataSource.initialize();
                console.log("Database connection initialized");
            }

            // Verify entity registration
            const registeredEntities = AppDataSource.entityMetadatas;
            console.log("Registered entities:", registeredEntities.map(e => ({
                name: e.name,
                tableName: e.tableName,
                columns: e.columns.map(c => c.propertyName)
            })));

            // Insert mock data
            console.log("Inserting mock data...");
            try {
                for (const mockPaper of mockPapers) {
                    const paper = new Paper(mockPaper);
                    console.log("Checking for existing paper:", paper.doi);
                    const existingPaper = await this.paperRepository.findOne({ 
                        where: { doi: paper.doi } 
                    });
                    
                    if (!existingPaper) {
                        console.log("Saving new paper:", paper.title);
                        const result = await this.paperRepository.save(paper);
                        console.log(`Inserted mock paper: ${paper.title} (${result._id})`);
                    } else {
                        console.log(`Paper already exists: ${paper.title}`);
                    }
                }
                console.log("Mock data insertion completed");
            } catch (error) {
                console.error('Error inserting mock data:', error);
                if (error instanceof Error) {
                    console.error('Error details:', error.message);
                    console.error('Stack trace:', error.stack);
                }
                throw error;
            }

            const config: CrawlerConfig = {
                sources: [
                    {
                        name: 'arXiv',
                        url: 'https://arxiv.org/list/q-bio/recent',
                        selectors: {
                            title: 'h2.title',
                            abstract: '.abstract',
                            authors: '.authors',
                            doi: '.doi'
                        }
                    }
                ]
            };
            
            this.crawler = new PaperCrawler(this.paperRepository, config);
            await this.crawler.initialize();
            this.initialized = true;
            console.log("Crawler initialized successfully");
        } catch (error) {
            console.error("Error initializing crawler:", error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
            }
            throw error;
        }
    }

    static async startCrawling(_req: Request, res: Response) {
        try {
            if (!this.initialized) {
                console.log("Initializing crawler before starting...");
                await this.initializeCrawler();
            }
            console.log("Starting crawler...");
            await this.crawler.crawl();
            res.json({ message: 'Crawling started successfully' });
        } catch (error) {
            console.error("Error starting crawler:", error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
                res.status(500).json({ 
                    error: 'Failed to start crawling',
                    details: error.message,
                    stack: error.stack
                });
            } else {
                res.status(500).json({ error: 'Failed to start crawling' });
            }
        }
    }

    static async getPapers(_req: Request, res: Response) {
        try {
            if (!this.initialized) {
                console.log("Initializing crawler before fetching papers...");
                await this.initializeCrawler();
            }
            console.log("Fetching papers...");
            const papers = await this.paperRepository.find({
                order: { publicationDate: -1 },
                take: 50
            });
            console.log(`Found ${papers.length} papers`);
            res.json(papers);
        } catch (error) {
            console.error('Error fetching papers:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
                res.status(500).json({ 
                    error: 'Failed to fetch papers',
                    details: error.message,
                    stack: error.stack
                });
            } else {
                res.status(500).json({ error: 'Failed to fetch papers' });
            }
        }
    }

    static async getPaperById(req: Request, res: Response) {
        try {
            if (!this.initialized) {
                await this.initializeCrawler();
            }
            const paper = await this.paperRepository.findOne({
                where: { _id: new ObjectId(req.params.id) }
            });
            
            if (!paper) {
                return res.status(404).json({ error: 'Paper not found' });
            }
            
            return res.json(paper);
        } catch (error) {
            console.error('Error fetching paper:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
            }
            return res.status(500).json({ error: 'Failed to fetch paper' });
        }
    }

    static async searchPapers(req: Request, res: Response) {
        try {
            if (!this.initialized) {
                await this.initializeCrawler();
            }
            const { query, category, startDate, endDate } = req.query;
            
            const filter: any = {};
            
            if (query) {
                filter.$or = [
                    { title: { $regex: query as string, $options: 'i' } },
                    { abstract: { $regex: query as string, $options: 'i' } }
                ];
            }
            
            if (category) {
                filter.categories = category;
            }
            
            if (startDate && endDate) {
                filter.publicationDate = {
                    $gte: new Date(startDate as string),
                    $lte: new Date(endDate as string)
                };
            }
            
            const papers = await this.paperRepository.find({
                where: filter,
                order: { publicationDate: -1 },
                take: 50
            });
                
            res.json(papers);
        } catch (error) {
            console.error('Error searching papers:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
            }
            res.status(500).json({ error: 'Failed to search papers' });
        }
    }

    static async getStats(_req: Request, res: Response) {
        try {
            if (!this.initialized) {
                await this.initializeCrawler();
            }
            const papers = await this.paperRepository.find();
            
            const stats = {
                totalPapers: papers.length,
                categoryCounts: {} as Record<string, number>,
                averageMetrics: {
                    citationCount: 0,
                    impactFactor: 0,
                    altmetricScore: 0
                },
                topJournals: {} as Record<string, number>,
                papersByMonth: {} as Record<string, number>
            };

            papers.forEach(paper => {
                // Count categories
                paper.categories?.forEach(category => {
                    stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;
                });

                // Calculate average metrics
                if (paper.metrics) {
                    stats.averageMetrics.citationCount += paper.metrics.citationCount || 0;
                    stats.averageMetrics.impactFactor += paper.metrics.impactFactor || 0;
                    stats.averageMetrics.altmetricScore += paper.metrics.altmetricScore || 0;
                }

                // Count journals
                if (paper.metadata?.journal) {
                    stats.topJournals[paper.metadata.journal] = (stats.topJournals[paper.metadata.journal] || 0) + 1;
                }

                // Group by month
                const month = paper.publicationDate?.toISOString().slice(0, 7);
                if (month) {
                    stats.papersByMonth[month] = (stats.papersByMonth[month] || 0) + 1;
                }
            });

            // Calculate averages
            if (papers.length > 0) {
                stats.averageMetrics.citationCount /= papers.length;
                stats.averageMetrics.impactFactor /= papers.length;
                stats.averageMetrics.altmetricScore /= papers.length;
            }

            res.json(stats);
        } catch (error) {
            console.error('Error fetching stats:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
            }
            res.status(500).json({ error: 'Failed to fetch statistics' });
        }
    }

    static async startCustomCrawling(req: Request, res: Response) {
        try {
            if (!this.initialized) {
                console.log("Initializing crawler before starting custom crawling...");
                await this.initializeCrawler();
            }

            const { sources, paperCount } = req.body;
            
            if (!sources || !Array.isArray(sources) || sources.length === 0) {
                return res.status(400).json({ error: 'At least one source must be specified' });
            }
            
            if (!paperCount || typeof paperCount !== 'number' || paperCount <= 0) {
                return res.status(400).json({ error: 'Paper count must be a positive number' });
            }
            
            // Cap the number of papers to avoid overloading
            const normalizedPaperCount = Math.min(paperCount, 100);
            
            console.log(`Starting custom crawler for sources: ${sources.join(', ')} with ${normalizedPaperCount} papers...`);
            
            // Create a copy of the crawler with custom config for each source
            const customConfig: CrawlerConfig = {
                sources: [],
                maxPapers: normalizedPaperCount
            };
            
            // Add each requested source to the config
            if (sources.includes('arXiv')) {
                customConfig.sources.push({
                    name: 'arXiv',
                    url: 'https://arxiv.org/list/q-bio/recent',
                    selectors: {
                        title: 'h2.title',
                        abstract: '.abstract',
                        authors: '.authors',
                        doi: '.doi'
                    }
                });
            }
            
            if (sources.includes('PubMed')) {
                customConfig.sources.push({
                    name: 'PubMed',
                    url: 'https://pubmed.ncbi.nlm.nih.gov/?term=biology',
                    selectors: {
                        title: '.heading-title',
                        abstract: '.abstract-content',
                        authors: '.authors-list',
                        doi: '.doi'
                    }
                });
            }
            
            const customCrawler = new PaperCrawler(this.paperRepository, customConfig);
            await customCrawler.initialize();
            
            // Start crawling in the background
            customCrawler.crawl().then(() => {
                console.log(`Custom crawling completed for sources: ${sources.join(', ')}`);
            }).catch(error => {
                console.error('Error during custom crawling:', error);
            });
            
            res.json({ 
                message: 'Custom crawling started successfully',
                details: {
                    sources: sources,
                    paperCount: normalizedPaperCount
                }
            });
        } catch (error) {
            console.error("Error starting custom crawler:", error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
                res.status(500).json({ 
                    error: 'Failed to start custom crawling',
                    details: error.message,
                    stack: error.stack
                });
            } else {
                res.status(500).json({ error: 'Failed to start custom crawling' });
            }
        }
    }

    static async stopCrawling(_req: Request, res: Response) {
        try {
            if (!this.initialized) {
                return res.status(400).json({ error: 'Crawler is not initialized' });
            }

            if (this.crawler) {
                await this.crawler.close();
                this.crawler = null;
                console.log('Crawler stopped successfully');
                res.json({ message: 'Crawler stopped successfully' });
            } else {
                res.status(400).json({ error: 'No active crawler to stop' });
            }
        } catch (error) {
            console.error('Error stopping crawler:', error);
            res.status(500).json({ error: 'Failed to stop crawler' });
        }
    }

    static getCrawlerStatus() {
        if (!this.crawler) {
            return {
                isRunning: false,
                papersFound: 0,
                currentSource: '',
                currentPage: 0,
                targetPapers: 0
            };
        }
        return this.crawler.getStatus();
    }

    static async dropDatabase(_req: Request, res: Response) {
        try {
            if (!this.initialized) {
                return res.status(400).json({ error: 'Database is not initialized' });
            }

            // Drop all papers from the collection
            await this.paperRepository.clear();
            
            console.log('Database dropped successfully');
            res.json({ message: 'Database dropped successfully' });
        } catch (error) {
            console.error('Error dropping database:', error);
            res.status(500).json({ error: 'Failed to drop database' });
        }
    }
} 