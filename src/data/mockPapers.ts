import { Paper } from '../models/Paper';

export const mockPapers: Partial<Paper>[] = [
    {
        title: "Deep Learning Approaches in Aging Biology: Insights from Single-Cell Transcriptomics",
        abstract: "Recent advances in deep learning have revolutionized our understanding of aging biology through the analysis of single-cell RNA sequencing data. This paper presents a comprehensive review of current machine learning approaches and their applications in identifying age-related cellular changes.",
        authors: ["Sarah J. Smith", "Michael R. Johnson", "David Zhang"],
        doi: "10.1038/s41587-023-0001-1",
        keywords: ["deep learning", "aging", "bioinformatics", "single-cell", "transcriptomics"],
        publicationDate: new Date("2023-12-15"),
        url: "https://example.com/paper1",
        pdfUrl: "https://example.com/paper1.pdf",
        metrics: {
            citationCount: 45,
            impactFactor: 15.3,
            altmetricScore: 89.5
        },
        categories: ["aging biology", "machine learning", "bioinformatics"],
        metadata: {
            journal: "Nature Biotechnology",
            volume: "41",
            issue: "12",
            publisher: "Nature Publishing Group"
        }
    },
    {
        title: "Synthetic Biology Approaches to Engineering Novel Protein-Based Therapeutics",
        abstract: "This study explores innovative synthetic biology techniques for designing and producing protein-based therapeutics. We present a novel framework combining computational design and experimental validation to create more effective and targeted biological drugs.",
        authors: ["Elena Rodriguez", "Thomas Chen", "Amanda Williams"],
        doi: "10.1016/j.cell.2023.11.005",
        keywords: ["synthetic biology", "protein engineering", "therapeutics", "drug design"],
        publicationDate: new Date("2023-11-28"),
        url: "https://example.com/paper2",
        pdfUrl: "https://example.com/paper2.pdf",
        metrics: {
            citationCount: 23,
            impactFactor: 38.6,
            altmetricScore: 156.2
        },
        categories: ["synthetic biology", "drug development", "protein engineering"],
        metadata: {
            journal: "Cell",
            volume: "186",
            issue: "24",
            publisher: "Elsevier"
        }
    },
    {
        title: "Machine Learning-Driven Analysis of Aging Biomarkers: A Multi-Omics Approach",
        abstract: "We present a comprehensive machine learning framework for analyzing multiple types of biological data to identify and validate aging biomarkers. Our approach integrates genomics, proteomics, and metabolomics data to provide a more complete understanding of the aging process.",
        authors: ["James Wilson", "Lisa Brown", "Robert Taylor", "Maria Garcia"],
        doi: "10.1126/science.2023.12345",
        keywords: ["aging", "biomarkers", "machine learning", "multi-omics", "systems biology"],
        publicationDate: new Date("2023-10-15"),
        url: "https://example.com/paper3",
        pdfUrl: "https://example.com/paper3.pdf",
        metrics: {
            citationCount: 67,
            impactFactor: 45.8,
            altmetricScore: 245.7
        },
        categories: ["aging biology", "machine learning", "systems biology"],
        metadata: {
            journal: "Science",
            volume: "382",
            issue: "6671",
            publisher: "AAAS"
        }
    }
]; 