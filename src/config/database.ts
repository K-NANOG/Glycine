import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Paper } from '../models/Paper';
import { MongoConnectionOptions } from 'typeorm/driver/mongodb/MongoConnectionOptions';
import { delay } from '../utils/delay';

const config: MongoConnectionOptions = {
    type: 'mongodb',
    host: '127.0.0.1',
    port: 27017,
    database: 'glycine',
    synchronize: true,
    logging: ['error', 'warn'],
    logger: 'advanced-console',
    entities: [Paper],
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,
    retryWrites: true,
    w: 'majority',
    directConnection: true
};

export const AppDataSource = new DataSource(config);

let initialized = false;

export const initializeDatabase = async () => {
    if (!initialized) {
        try {
            console.log("Initializing database connection...");
            
            // Try to connect with retries
            let retries = 5;
            while (retries > 0) {
                try {
                    // Initialize the connection without synchronizing
                    if (!AppDataSource.isInitialized) {
                        await AppDataSource.initialize();
                    }
                    console.log("Database connection established");
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    console.log(`Failed to connect, retrying... (${retries} attempts left)`);
                    await delay(2000); // Wait 2 seconds before retrying
                }
            }

            // Drop the database completely
            try {
                await AppDataSource.dropDatabase();
                console.log("Dropped existing database");
            } catch (error) {
                console.log("No existing database to drop or error dropping database:", error);
            }

            // Create new database and sync schema
            await AppDataSource.synchronize(true);
            console.log("Database schema synchronized");

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
                
                try {
                    // Test database write
                    const testPaper = new Paper({
                        title: "Test Paper",
                        abstract: "Test Abstract",
                        authors: ["Test Author"],
                        doi: "test-doi-" + Date.now(),
                        publicationDate: new Date(),
                        url: "http://test.com",
                        keywords: ["test"],
                        categories: ["test"]
                    });

                    const result = await AppDataSource.getMongoRepository(Paper).save(testPaper);
                    console.log("Test document written successfully:", result._id);
                    
                    // Clean up test document
                    await AppDataSource.getMongoRepository(Paper).delete({ doi: testPaper.doi });
                    console.log("Test document cleaned up");
                } catch (error) {
                    console.error("Error during database test:", error);
                    throw error;
                }
            } else {
                throw new Error("MongoDB connection failed");
            }

            initialized = true;
            return AppDataSource;
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