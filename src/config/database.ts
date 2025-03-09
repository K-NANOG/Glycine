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
    logging: true,
    logger: 'advanced-console',
    entities: [Paper],
    useUnifiedTopology: true,
    connectTimeoutMS: 10000,
    retryWrites: true,
    w: 'majority',
    authSource: 'admin',
    directConnection: true
};

export const AppDataSource = new DataSource(config);

let initialized = false;

export const initializeDatabase = async () => {
    if (!initialized) {
        try {
            console.log("Initializing database connection...");
            
            // Initialize the connection
            if (!AppDataSource.isInitialized) {
                await AppDataSource.initialize();
                console.log("Database connection established");
            }

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