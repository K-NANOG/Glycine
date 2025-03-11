import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('papers')
export class Paper {
    @ObjectIdColumn()
    _id: ObjectId;

    @Column()
    @Index('paper_title_idx')
    title: string;

    @Column()
    abstract: string;

    @Column('simple-array')
    authors: string[];

    @Column({ nullable: true })
    @Index('paper_pmid_idx', { sparse: true })
    pmid?: string;

    @Column({ nullable: true })
    @Index('paper_doi_idx', { sparse: true })
    doi?: string;

    @Column('simple-array', { nullable: true })
    keywords?: string[];

    @Column({ type: 'timestamp', nullable: true })
    publicationDate?: Date;

    @Column()
    url: string;

    @Column({ nullable: true })
    pdfUrl?: string;

    @Column('json', { nullable: true })
    metrics?: {
        citationCount?: number;
        impactFactor?: number;
        altmetricScore?: number;
    };

    @Column('simple-array', { nullable: true })
    categories?: string[];

    @Column({ nullable: true })
    fullText?: string;

    @Column('json', { nullable: true })
    metadata?: {
        journal?: string;
        volume?: string;
        issue?: string;
        publisher?: string;
    };

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ default: false })
    isProcessed: boolean;

    @Column('simple-array', { nullable: true })
    references?: string[];

    constructor(partial: Partial<Paper>) {
        if (partial) {
            Object.assign(this, {
                ...partial,
                isProcessed: partial.isProcessed ?? false,
                keywords: partial.keywords ?? [],
                categories: partial.categories ?? [],
                references: partial.references ?? [],
                createdAt: partial.createdAt ?? new Date(),
                updatedAt: partial.updatedAt ?? new Date()
            });
        }
    }

    toJSON() {
        return {
            ...this,
            _id: this._id?.toString()
        };
    }
} 