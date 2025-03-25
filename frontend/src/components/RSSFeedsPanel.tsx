'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Plus, X, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RSSFeed {
  url: string;
  name: string;
  status: 'active' | 'error' | 'inactive';
  lastFetched?: Date | string;
  errorMessage?: string;
}

interface RSSFeedsPanelProps {
  onFeedsChange?: (feeds: RSSFeed[]) => void;
  title?: string;
  collapsible?: boolean;
  className?: string;
}

export function RSSFeedsPanel({
  onFeedsChange,
  title = 'RSS Feeds',
  collapsible = true,
  className = ''
}: RSSFeedsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [feeds, setFeeds] = useState<RSSFeed[]>([]);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedName, setNewFeedName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Fetch existing feeds when component mounts
    fetchFeeds();
  }, []);

  // API call to get feeds
  const fetchFeeds = async () => {
    try {
      const response = await fetch('http://localhost:3002/api/crawler/feeds');
      const data = await response.json();
      
      if (data.feeds) {
        // Parse dates if they exist
        const processedFeeds = data.feeds.map((feed: any) => ({
          ...feed,
          lastFetched: feed.lastFetched ? new Date(feed.lastFetched) : undefined
        }));
        
        setFeeds(processedFeeds);
        if (onFeedsChange) {
          onFeedsChange(processedFeeds);
        }
      }
    } catch (error) {
      console.error('Error fetching feeds:', error);
      setError('Failed to load RSS feeds. Please try again later.');
    }
  };

  // Handle adding a new feed
  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newFeedUrl || !newFeedName) {
      setError('URL and name are required');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:3002/api/crawler/feeds/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newFeedUrl, name: newFeedName })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setNewFeedUrl('');
        setNewFeedName('');
        fetchFeeds(); // Refresh the feeds list
      } else {
        setError(data.error || 'Failed to add feed');
      }
    } catch (error) {
      console.error('Error adding feed:', error);
      setError('Failed to add feed. Please check the URL and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle removing a feed
  const handleRemoveFeed = async (url: string) => {
    try {
      const response = await fetch('http://localhost:3002/api/crawler/feeds/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      if (response.ok) {
        fetchFeeds(); // Refresh the feeds list
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to remove feed');
      }
    } catch (error) {
      console.error('Error removing feed:', error);
      setError('Failed to remove feed. Please try again later.');
    }
  };

  // Get status indicator color and icon
  const getStatusIndicator = (feed: RSSFeed) => {
    if (feed.status === 'error') {
      return {
        icon: <AlertCircle size={16} className="text-red-400" />,
        color: 'bg-red-500/20 border-red-500/30',
        text: 'Error'
      };
    } else if (feed.status === 'active' && feed.lastFetched) {
      return {
        icon: <CheckCircle size={16} className="text-green-400" />,
        color: 'bg-green-500/20 border-green-500/30',
        text: 'Active'
      };
    } else {
      return {
        icon: <Clock size={16} className="text-yellow-400" />,
        color: 'bg-yellow-500/20 border-yellow-500/30',
        text: 'Pending'
      };
    }
  };

  // Format the last fetched time
  const formatLastFetched = (date: Date | string | undefined) => {
    if (!date) return 'Never';
    
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return formatDistanceToNow(dateObj, { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <div className={`bg-white/[0.03] backdrop-blur-xl rounded-lg border border-white/[0.08] shadow-lg ${className}`}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-md text-white/60 font-normal">{title}</h3>
          
          {collapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)} 
              className="text-white/60 hover:text-white transition-colors duration-200 focus:outline-none"
              aria-label={isCollapsed ? 'Expand RSS feeds section' : 'Collapse RSS feeds section'}
            >
              {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          )}
        </div>
        
        {!isCollapsed && (
          <>
            {/* RSS feed input form */}
            <form onSubmit={handleAddFeed} className="mb-4">
              <div className="flex gap-2 flex-col sm:flex-row">
                <div className="flex-1">
                  <input 
                    type="text"
                    placeholder="Feed URL (e.g., https://example.com/feed.xml)"
                    className="w-full bg-white/[0.06] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20"
                    value={newFeedUrl}
                    onChange={(e) => setNewFeedUrl(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="w-full sm:w-1/3">
                  <input 
                    type="text"
                    placeholder="Feed Name"
                    className="w-full bg-white/[0.06] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20"
                    value={newFeedName}
                    onChange={(e) => setNewFeedName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center justify-center gap-1 bg-white/[0.08] hover:bg-white/[0.12] text-white/70 hover:text-white px-4 py-2 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={16} />
                  <span>Add</span>
                </button>
              </div>
              {error && (
                <p className="text-xs text-red-400 mt-2">{error}</p>
              )}
            </form>
            
            {/* Feed list */}
            <div className="space-y-3">
              <p className="text-xs text-white/50 mb-3 font-normal">
                {feeds.length > 0 
                  ? 'These RSS feeds will be crawled to find papers:' 
                  : 'Add RSS feeds above to include in your crawler'
                }
              </p>
              
              {feeds.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {feeds.map((feed) => {
                    const status = getStatusIndicator(feed);
                    
                    return (
                      <div 
                        key={feed.url}
                        className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-md p-3 text-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-white/80">{feed.name}</div>
                            <div className="text-xs text-white/50 mt-1 break-all">{feed.url}</div>
                            
                            <div className="flex items-center mt-2 gap-3">
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${status.color}`}>
                                {status.icon}
                                <span>{status.text}</span>
                              </div>
                              
                              {feed.lastFetched && (
                                <div className="text-xs text-white/40">
                                  Last fetched {formatLastFetched(feed.lastFetched)}
                                </div>
                              )}
                            </div>
                            
                            {feed.status === 'error' && feed.errorMessage && (
                              <div className="mt-2 text-xs text-red-400">
                                Error: {feed.errorMessage}
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => handleRemoveFeed(feed.url)}
                            className="text-white/30 hover:text-white/70 transition-colors"
                            aria-label={`Remove ${feed.name} feed`}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-white/10 rounded-md text-white/30">
                  No RSS feeds added yet
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
} 