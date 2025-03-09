import { Router } from 'express';
import { PaperController } from '../controllers/PaperController';
import { AppDataSource } from '../config/database';

const router = Router();

// Initialize routes
const initializeRoutes = async () => {
    try {
        // Wait for database connection
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
            console.log("Database connection initialized");
        }

        // Initialize the crawler
        await PaperController.initializeCrawler();
        console.log("Paper crawler initialized");

        // Register routes with bound methods
        router.post('/crawl/start', (req, res) => PaperController.startCrawling(req, res));
        router.get('/papers', (req, res) => PaperController.getPapers(req, res));
        router.get('/papers/search', (req, res) => PaperController.searchPapers(req, res));
        router.get('/papers/:id', (req, res) => PaperController.getPaperById(req, res));
        router.get('/stats', (req, res) => PaperController.getStats(req, res));

        console.log("Paper routes registered");
    } catch (error) {
        console.error("Failed to initialize paper routes:", error);
        throw error;
    }
};

// Initialize routes but don't block router export
initializeRoutes().catch(console.error);

export default router; 