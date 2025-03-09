import "reflect-metadata";
import express from "express";
import cors from "cors";
import { initializeDatabase } from "./config/database";
import paperRoutes from "./routes/paperRoutes";

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
app.get("/test", (req, res) => {
    res.json({ message: "Backend is working!" });
});

// Initialize database and start server
const startServer = async () => {
    try {
        // Initialize database first
        const dataSource = await initializeDatabase();
        console.log("Database initialized");

        // Log registered entities
        const registeredEntities = dataSource.entityMetadatas;
        console.log("Registered entities:", registeredEntities.map(e => ({
            name: e.name,
            tableName: e.tableName,
            columns: e.columns.map(c => c.propertyName)
        })));

        // Register routes after database is initialized
        app.use("/api", paperRoutes);
        console.log("Routes registered");

        // Start server
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
            console.log(`Test endpoint: http://localhost:${port}/test`);
            console.log(`API endpoint: http://localhost:${port}/api`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

// Start server
startServer(); 