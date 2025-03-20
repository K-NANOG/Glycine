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
                            doi: '.doi',
                            articleContainer: 'li.arxiv-result',
                            url: '.list-title a'
                        },
                        patterns: {
                            title: null,
                            doi: 'arXiv:([\\d\\.v]+)',
                            date: 'Submitted\\s+([^\\s]+)'
                        },
                        rateLimit: 2,
                        maxPages: 1
                    }
                ],
                maxPapers: 50
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
                if (paper.publicationDate instanceof Date) {
                    const month = paper.publicationDate.toISOString().slice(0, 7);
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

    static async getCategories(_req: Request, res: Response) {
        try {
            if (!this.initialized) {
                await this.initializeCrawler();
            }
            const papers = await this.paperRepository.find();
            const categories = new Set<string>();
            
            papers.forEach(paper => {
                paper.categories?.forEach(category => categories.add(category));
            });

            res.json(Array.from(categories));
        } catch (error) {
            console.error('Error fetching categories:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Stack trace:', error.stack);
            }
            res.status(500).json({ error: 'Failed to fetch categories' });
        }
    }
} 