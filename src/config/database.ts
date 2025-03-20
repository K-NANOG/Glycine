import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Paper } from '../models/Paper';
import { MongoConnectionOptions } from 'typeorm/driver/mongodb/MongoConnectionOptions';

const config: MongoConnectionOptions = {
    type: 'mongodb',
    host: '127.0.0.1',
    port: 27017,
    database: 'glycine',
    synchronize: true,
    dropSchema: true,
    logging: ['error', 'warn'],
    logger: 'advanced-console',
    entities: [Paper],
    connectTimeoutMS: 30000,
    retryWrites: true,
    w: 'majority'
};

export const AppDataSource = new DataSource(config);

let initialized = false;

export const initializeDatabase = async () => {
    if (!initialized) {
        try {
            console.log("Initializing database connection...");
            
            // Close existing connection if it exists
            if (AppDataSource.isInitialized) {
                await AppDataSource.destroy();
                console.log("Closed existing database connection");
            }

            // Initialize the connection
            await AppDataSource.initialize();
            console.log("Database connection established");

            // Log registered entities
            const registeredEntities = AppDataSource.entityMetadatas;
            console.log("Registered entities:", registeredEntities.map(e => ({
                name: e.name,
                tableName: e.tableName,
                columns: e.columns.map(c => c.propertyName)
            })));

            // Verify MongoDB connection
            const mongoConnection = AppDataSource.manager.connection;
            if (mongoConnection.isConnected) {
                console.log("MongoDB connection verified");
                initialized = true;
                return AppDataSource;
            } else {
                throw new Error("MongoDB connection failed");
            }
        } catch (error) {
            console.error("Database initialization error:", error);
            if (error instanceof Error) {
                console.error("Error details:", error.message);
                console.error("Stack trace:", error.stack);
            }
            throw error;
        }
    }
    return AppDataSource;
};

// Initialize database connection
initializeDatabase()
    .then(() => {
        console.log("Database initialized successfully");
    })
    .catch(error => {
        console.error("Failed to initialize database:", error);
        process.exit(1);
    }); 