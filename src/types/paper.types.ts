export interface ExtractedData {
    title: string;
    abstract: string;
    authors: string[];
    doi: string;
    publicationDate?: Date;
    keywords?: string[];
    categories?: string[];
    url: string;
} 