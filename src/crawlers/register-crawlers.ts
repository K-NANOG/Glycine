import { CrawlerFactory } from './factory/crawler-factory';
import { BioRxivMedRxivCrawler } from './implementations/biorxiv-medrxiv-crawler';
import { RSSFeedCrawler } from './implementations/rss-feed-crawler';
import { ICrawlerStrategy } from './base/crawler-strategy.interface';
import { IBrowserAdapter } from './browser/browser-adapter.interface';
import { Repository } from 'typeorm';
import { Paper } from '../models/Paper';

/**
 * Register all crawler implementations with the CrawlerFactory
 */
export function registerCrawlers() {
  const factory = CrawlerFactory.getInstance();
  
  // Create a wrapper class that satisfies the factory's expected constructor signature
  class BioRxivMedRxivCrawlerWrapper extends BioRxivMedRxivCrawler {
    constructor(
      browserAdapter: IBrowserAdapter,
      paperRepository: Repository<Paper>
    ) {
      super(browserAdapter, paperRepository);
    }
  }
  
  // Create a wrapper for the RSS Feed crawler
  class RSSFeedCrawlerWrapper extends RSSFeedCrawler {
    constructor(
      browserAdapter: IBrowserAdapter,
      public readonly paperRepository: Repository<Paper>
    ) {
      super(browserAdapter, paperRepository);
    }
  }
  
  // Register the BioRxiv/MedRxiv crawler
  factory.registerCrawler('BioRxiv/MedRxiv', BioRxivMedRxivCrawlerWrapper);
  
  // Register the RSS Feed crawler
  factory.registerCrawler('RSS Feeds', RSSFeedCrawlerWrapper);
  
  // Register additional crawlers here
  
  console.log('Registered crawlers:', factory.getAvailableCrawlers());
}

/**
 * Get default crawler configurations for each registered crawler
 */
export function getCrawlerConfigs() {
  return {
    'BioRxiv/MedRxiv': {
      sourceConfig: {
        url: 'https://www.biorxiv.org/search/',
        selectors: {
          articleContainer: '.highwire-article-list-item',
          title: '.highwire-cite-title a',
          abstract: '.highwire-cite-snippet',
          authors: '.highwire-citation-authors',
          doi: '.highwire-cite-metadata-doi',
          date: '.highwire-cite-metadata-journal',
          categories: '.highwire-citation-categories',
          keywords: '.highwire-keywords-wrapper',
          nextPage: '.pager-next a',
          url: '.highwire-cite-title a'
        },
        patterns: {
          title: null,
          doi: 'doi:\\/\\/([\\w\\.\\-\\/]+)',
          date: '\\(([\\w\\s]+)\\)'
        },
        rateLimit: 1,
        maxPages: 5,
        extraHeaders: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      }
    },
    'RSS Feeds': {
      sourceConfig: {
        feeds: [
          {
            url: 'https://www.nature.com/nature.rss',
            name: 'Nature'
          },
          {
            url: 'https://www.science.org/rss/news_current.xml',
            name: 'Science'
          },
          {
            url: 'https://www.pnas.org/action/showFeed?type=etoc&feed=rss&jc=pnas',
            name: 'PNAS'
          }
        ],
        rateLimit: 2,
        maxFeeds: 10
      }
    }
  };
} 