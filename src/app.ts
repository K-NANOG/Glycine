import "reflect-metadata";
import express from "express";
import cors from "cors";
import { AppDataSource, initializeDatabase } from "./config/database";
import paperRoutes, { initializeRoutes } from "./routes/paperRoutes";
import crawlerRoutes from "./routes/crawlerRoutes";

const app = express();
const port = process.env.PORT || 3002;

// Configure CORS
app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Middleware
app.use(express.json());

// Test route
app.get("/test", (_req, res) => {
    res.json({ status: "ok", message: "Server is running" });
});

// Initialize database and start server
const startServer = async () => {
    try {
        // Initialize database connection
        console.log("Initializing database connection...");
        await initializeDatabase();
        console.log("Database connection initialized");

        // Initialize routes
        console.log("Initializing routes...");
        await initializeRoutes();
        console.log("Routes initialized");

        // Register routes
        app.use("/api", paperRoutes);
        app.use("/api/crawler", crawlerRoutes);

        // Error handling middleware
        app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            console.error('Error:', err);
            res.status(500).json({
                error: 'Internal Server Error',
                message: err.message
            });
        });

        // Start server
        const server = app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
            console.log(`Test endpoint: http://localhost:${port}/test`);
            console.log(`API endpoint: http://localhost:${port}/api`);
            console.log(`Crawler endpoint: http://localhost:${port}/api/crawler`);
        });

        // Handle server errors
        server.on('error', (error: NodeJS.ErrnoException) => {
            console.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                console.error(`Port ${port} is already in use`);
            }
            process.exit(1);
        });

    } catch (error) {
        console.error("Failed to start server:", error);
        if (error instanceof Error) {
            console.error("Error details:", error.message);
            console.error("Stack trace:", error.stack);
        }
        process.exit(1);
    }
};

// Handle process termination
process.on('SIGINT', async () => {
    try {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
            console.log('Database connection closed.');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start server
startServer(); 