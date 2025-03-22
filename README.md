# Glycine

A dynamically reconfigurable web crawler specialized for scientific paper collection, with a focus on PubMed and other academic sources.

## Overview

Glycine is an advanced web crawling system designed to collect scientific papers from various academic sources like PubMed and arXiv. It features a modular, extensible architecture with a factory pattern for creating different crawler implementations, a robust error handling system, and a clean separation of concerns following design best practices.

## Architecture

The system is built on several core architectural components:

### Core Components

- **Routes Layer**: API endpoints for controlling the crawling process
- **Controllers**: Business logic coordination
- **Services**: Core implementation of crawling functionality
- **Models**: Data structures and TypeORM entities
- **Repositories**: Database interaction via TypeORM
- **Factory Pattern**: Extensible crawler implementation system
- **Browser Abstraction**: Interface over browser automation with Puppeteer

### Crawler Design

The crawler system follows a layered design:

1. **Factory Pattern**: Creates appropriate crawler instances based on source
2. **Strategy Pattern**: Each crawler implements a common interface
3. **Base Crawler**: Shared functionality for all crawler implementations
4. **Concrete Crawlers**: Source-specific implementations (PubMed, arXiv)
5. **Browser Adapter**: Abstraction over Puppeteer for browser automation

### Error Handling & Resilience

The system incorporates multiple layers of error handling:

- **Retry Logic**: Multiple retry mechanisms at different levels
- **Browser Reconnection**: Automatic handling of browser disconnections
- **Rate Limiting**: Prevents overloading target sites
- **Failsafes**: Prevents infinite loops with maximum attempts and page limits

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, Puppeteer
- **Frontend**: Next.js, React, TailwindCSS
- **Database**: MongoDB (via TypeORM)
- **Automation**: Puppeteer for browser automation
- **Type Safety**: TypeScript for static type checking

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- Git

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/Glycine.git
   cd Glycine
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. Create MongoDB data directory:
   ```bash
   mkdir -p C:\data\db
   ```

5. Set up environment variables by creating a `.env` file with the following:
   ```
   PORT=3002
   MONGODB_URI=mongodb://localhost:27017/glycine
   ```

## Development

1. Start all services (MongoDB, backend, frontend) using the provided script:
   ```bash
   ./start-dev.ps1
   ```

   Or start services individually:

   ```bash
   # Start MongoDB
   mongod --dbpath C:\data\db

   # Start backend (in a new terminal)
   npm run dev

   # Start frontend (in a new terminal)
   cd frontend
   npm run dev
   ```

2. Access the application:
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3002

## Usage

### Web Interface

1. Navigate to http://localhost:3001
2. Configure crawling parameters:
   - Select paper sources (PubMed, arXiv)
   - Set the number of papers to crawl
   - Configure any additional filters
3. Click "Start Crawler" to begin collection
4. Monitor progress in real-time on the dashboard
5. View collected papers in the main interface
6. Use the "Stop" button to halt crawling at any time
7. Use "Reset Database" to clear all collected papers

### API Endpoints

The backend exposes several REST endpoints:

- `POST /api/crawler/start`: Start the crawler with configuration
- `POST /api/crawler/stop`: Stop the running crawler
- `GET /api/crawler/status`: Get current crawler status
- `POST /api/crawler/reset`: Reset the paper database
- `GET /api/papers`: Get all collected papers
- `GET /api/papers/:id`: Get a specific paper by ID

## Extending the System

### Adding a New Crawler Source

1. Create a new crawler implementation in `src/crawlers/implementations/`
2. Implement the crawler strategy interface
3. Register the new crawler in the crawler factory
4. Add the source configuration to the frontend options

### Customizing Paper Processing

1. Modify the `Paper` model in `src/models/Paper.ts`
2. Update any corresponding frontend components to display new fields
3. Adjust the paper extraction logic in the crawler implementation

## Configuration

### Crawler Configuration

The main crawler configuration structure:

```typescript
interface CrawlerConfig {
    sources: {
        name: string;        // Source name (e.g., "PubMed")
        url: string;         // Base URL for crawling
        selectors: {         // CSS selectors for data extraction
            title: string;
            abstract: string;
            authors: string;
            doi: string;
            date?: string;
            categories?: string;
            keywords?: string;
            nextPage?: string;
            articleContainer: string;
            url: string;
        };
        patterns?: {         // Regex patterns for data extraction
            title?: string | null;
            doi?: string;
            date?: string;
        };
        rateLimit?: number;  // Requests per minute
        maxPages: number;    // Maximum pages to crawl
        extraHeaders?: Record<string, string>; // Custom HTTP headers
    }[];
    filters?: {              // Content filtering options
        dateRange?: {
            start: Date;
            end: Date;
        };
        keywords?: string[];
        categories?: string[];
    };
    retryOptions?: {         // Error handling configuration
        maxRetries: number;
        delayMs: number;
    };
    maxPapers: number;       // Maximum papers to collect
    selectedSources?: string[]; // Sources to crawl
}
```

## Troubleshooting

### Common Issues

1. **Browser Launch Fails**:
   - Ensure you have appropriate dependencies for Puppeteer
   - Check for conflicting browser instances
   - Verify you have sufficient system resources

2. **No Papers Found**:
   - Verify your selectors match the current site structure
   - Check for rate limiting or blocking by the target site
   - Ensure your search terms return results

3. **TypeORM Connection Issues**:
   - Verify MongoDB is running
   - Check your connection string
   - Ensure proper network connectivity

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 