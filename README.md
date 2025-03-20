# Glycine

A dynamically reconfigurable web crawler for scientific papers, powered by advanced pattern matching and machine learning.

## Features

- Multi-source paper crawling (PubMed, arXiv)
- Real-time crawling status and controls
- Elegant, modern UI with dark mode
- Advanced paper filtering and categorization
- Automatic metadata extraction
- MongoDB integration for data persistence

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, Puppeteer
- **Frontend**: Next.js, React, TailwindCSS
- **Database**: MongoDB
- **Libraries**: date-fns, TypeORM

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
   ```

4. Create MongoDB data directory:
   ```bash
   mkdir -p C:\data\db
   ```

## Development

1. Start all services (MongoDB, backend, frontend):
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
   - API Documentation: http://localhost:3002/api

## Usage

1. Select paper sources (PubMed, arXiv)
2. Set the number of papers to crawl
3. Click "Start Crawler" to begin collection
4. Monitor progress in real-time
5. View collected papers in the main interface

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 