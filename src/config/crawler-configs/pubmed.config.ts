import { SourceConfig } from '../../crawlers/base/crawler-strategy.interface';

export const pubmedConfig = {
    maxPapers: 100,
    maxRetries: 3,
    retryDelay: 5000,
    rateLimit: 3,
    searchTerm: '(synthetic+biology+OR+machine+learning+OR+bioinformatics)',
    selectors: {
        articleContainer: '.docsum-content',
        title: '.docsum-title',
        abstract: '.abstract-content',
        authors: '.docsum-authors',
        doi: '.docsum-pmid',
        url: '.docsum-title',
        publicationDate: '.docsum-journal-citation',
        keywords: '.keywords',
        categories: '.publication-type',
        nextPage: '.next-page-link',
        resultsCount: '.results-amount-container'
    },
    filters: {
        minYear: 2000,
        excludeKeywords: ['retracted', 'retraction', 'withdrawn'],
        includeKeywords: ['synthetic biology', 'machine learning', 'bioinformatics', 'computational biology']
    }
}; 