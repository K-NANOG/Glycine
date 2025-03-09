# Glycine

A dynamically reconfigurable web crawler for scientific papers, powered by advanced pattern matching and machine learning.

## Core Features

- **Dynamic Pattern Recognition**: Automatically identifies and adapts to different scientific paper formats and structures
- **Configurable Crawling Rules**: Define custom patterns, selectors, and extraction rules for different sources
- **Intelligent Data Extraction**: Uses machine learning to improve accuracy in metadata extraction
- **Multi-Source Support**: Crawl from multiple scientific databases (arXiv, PubMed, etc.)
- **Pattern Learning**: Improves extraction accuracy over time through pattern recognition
- **Real-time Monitoring**: Track crawling progress and success rates
- **Modern Interface**: Sleek dark-themed UI for monitoring and configuration

## Technology Stack

- **Backend**: Node.js + TypeScript + Express
- **Frontend**: Next.js + TailwindCSS
- **Database**: MongoDB
- **Pattern Matching**: Puppeteer + Custom ML models
- **API**: RESTful with TypeORM

## Project Structure

```
glycine/
├── src/                    # Backend source code
│   ├── config/            # Configuration and database setup
│   ├── controllers/       # API and crawler controllers
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   └── services/         # Crawler and pattern matching services
├── frontend/              # Next.js frontend
└── start-dev.ps1         # Development startup script
```

## Crawler Configuration

The crawler can be configured through JSON patterns:

```json
{
    "sources": [
        {
            "name": "arXiv",
            "url": "https://arxiv.org/list/q-bio/recent",
            "selectors": {
                "title": "h2.title",
                "abstract": ".abstract",
                "authors": ".authors",
                "doi": ".doi"
            },
            "patterns": {
                "title": "\\[([^\\]]+)\\]",
                "doi": "\\b(10\\.\\d{4,}/[-._;()/:A-Z0-9]+)\\b",
                "date": "\\d{4}\\.\\d{2}"
            }
        }
    ],
    "filters": {
        "dateRange": {
            "start": "2023-01-01",
            "end": "2024-12-31"
        },
        "keywords": ["machine learning", "biology"],
        "categories": ["q-bio", "cs.AI"]
    }
}
```

## API Documentation

### Base URL
```
http://localhost:3002/api
```

### Key Endpoints

#### Configure Crawler
```
POST /api/crawler/config
```
Update crawler configuration dynamically.

#### Start Crawler
```
POST /api/crawl/start
```
Start the crawling process with current configuration.

#### Get Papers
```
GET /api/papers
```
Get crawled papers with pagination and filtering.

#### Search Papers
```
GET /api/papers/search
```
Search papers with advanced filters.

#### Get Statistics
```
GET /api/stats
```
Get crawling and paper statistics.

## Development

### Prerequisites

- Node.js (v14 or later)
- MongoDB (v4.4 or later)
- npm or yarn
- PowerShell (for Windows users)

### Installation

1. Clone and install dependencies:
```bash
git clone https://github.com/yourusername/glycine.git
cd glycine
npm install
cd frontend && npm install
```

2. Configure environment:
```env
PORT=3002
MONGODB_URL=mongodb://localhost:27017/glycine
NODE_ENV=development
```

### Starting Development Environment

```powershell
.\start-dev.ps1
```

This script will:
1. Start MongoDB
2. Launch the backend (port 3002)
3. Start the frontend (port 3001)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details
