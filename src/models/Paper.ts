import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('papers')
export class Paper {
    @ObjectIdColumn()
    _id!: ObjectId;

    @Column()
    @Index("IDX_PAPER_TITLE")
    title!: string;

    @Column()
    abstract!: string;

    @Column('simple-array')
    authors!: string[];

    @Column()
    @Index("IDX_PAPER_DOI", { unique: true, sparse: true })
    doi!: string;

    @Column('simple-array', { nullable: true })
    keywords?: string[];

    @Column({ type: 'timestamp', nullable: true })
    publicationDate?: Date;

    @Column()
    url!: string;

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
        doi?: string;
    };

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column({ default: false })
    isProcessed!: boolean;

    @Column('simple-array', { nullable: true })
    references?: string[];

    constructor(partial?: Partial<Paper>) {
        if (partial) {
            // Handle _id separately
            if (partial._id) {
                this._id = partial._id;
            }
            
            // Required fields with defaults
            this.title = partial.title || '';
            this.abstract = partial.abstract || '';
            this.authors = partial.authors || [];
            this.doi = partial.doi || '';
            this.url = partial.url || '';
            
            // Optional fields
            this.keywords = partial.keywords || [];
            this.categories = partial.categories || [];
            this.references = partial.references || [];
            this.publicationDate = partial.publicationDate;
            this.pdfUrl = partial.pdfUrl;
            this.metrics = partial.metrics;
            this.fullText = partial.fullText;
            this.metadata = partial.metadata;
            
            // Status fields
            this.isProcessed = partial.isProcessed ?? false;
            this.createdAt = partial.createdAt || new Date();
            this.updatedAt = partial.updatedAt || new Date();
        }
    }

    toJSON() {
        return {
            ...this,
            _id: this._id?.toString()
        };
    }
} 