import { AppDataSource } from '../config/database';
import { Paper } from '../models/Paper';

const isValidDOI = (doi: string): boolean => {
    // Check for standard DOI format
    return /^10\.\d{4,9}\/[-._;()\/:A-Z0-9]+$/i.test(doi);
};

const isPMID = (id: string): boolean => {
    return /^PMID:\d+$/.test(id);
};

async function updatePapersIdentifiers() {
    try {
        await AppDataSource.initialize();
        console.log('Database connection initialized');

        const paperRepository = AppDataSource.getRepository(Paper);
        const papers = await paperRepository.find();

        console.log(`Found ${papers.length} papers to check`);
        let updatedCount = 0;

        for (const paper of papers) {
            let needsUpdate = false;
            const currentDOI = paper.doi;

            // Initialize metadata if it doesn't exist
            if (!paper.metadata) {
                paper.metadata = {};
            }

            // If current DOI is a valid DOI format, move it to metadata
            if (isValidDOI(currentDOI)) {
                paper.metadata.doi = currentDOI;
                paper.doi = 'n/a';
                needsUpdate = true;
            }
            // If it's not a PMID format but should be, format it correctly
            else if (!isPMID(currentDOI) && /^\d+$/.test(currentDOI)) {
                paper.doi = `PMID:${currentDOI}`;
                needsUpdate = true;
            }

            if (needsUpdate) {
                await paperRepository.save(paper);
                updatedCount++;
                console.log(`Updated paper: ${paper.title}`);
            }
        }

        console.log(`Updated ${updatedCount} papers`);
    } catch (error) {
        console.error('Error updating papers:', error);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}

updatePapersIdentifiers(); 