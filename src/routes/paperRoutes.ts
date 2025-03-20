import { Router, Request, Response } from 'express';
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

        // Create route handlers
        const startCrawlingHandler = async (req: Request, res: Response): Promise<void> => {
            await PaperController.startCrawling(req, res);
        };

        const getPapersHandler = async (req: Request, res: Response): Promise<void> => {
            await PaperController.getPapers(req, res);
        };

        const searchPapersHandler = async (req: Request, res: Response): Promise<void> => {
            await PaperController.searchPapers(req, res);
        };

        const getPaperByIdHandler = async (req: Request, res: Response): Promise<void> => {
            await PaperController.getPaperById(req, res);
        };

        const getStatsHandler = async (req: Request, res: Response): Promise<void> => {
            await PaperController.getStats(req, res);
        };

        const getCategoriesHandler = async (req: Request, res: Response): Promise<void> => {
            await PaperController.getCategories(req, res);
        };

        // Register routes with bound methods
        router.post('/crawl/start', startCrawlingHandler);
        router.get('/papers', getPapersHandler);
        router.get('/papers/search', searchPapersHandler);
        router.get('/papers/:id', getPaperByIdHandler);
        router.get('/stats', getStatsHandler);
        router.get('/categories', getCategoriesHandler);

        console.log("Paper routes registered");
    } catch (error) {
        console.error("Failed to initialize paper routes:", error);
        throw error;
    }
};

export default router;
export { initializeRoutes }; 