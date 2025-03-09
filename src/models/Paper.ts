import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ObjectId } from 'typeorm';

@Entity('papers')
export class Paper {
    @ObjectIdColumn()
    _id!: ObjectId;

    @Column()
    @Index()
    title!: string;

    @Column()
    abstract!: string;

    @Column('simple-array')
    authors!: string[];

    @Column()
    @Index({ unique: true })
    doi!: string;

    @Column('simple-array')
    keywords!: string[];

    @Column()
    publicationDate!: Date;

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

    @Column('simple-array')
    categories!: string[];

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
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column()
    isProcessed!: boolean;

    @Column('simple-array', { nullable: true })
    references?: string[];

    constructor(partial?: Partial<Paper>) {
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