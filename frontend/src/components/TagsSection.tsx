'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTags } from '../contexts/TagContext';
import { Tag } from '../components/Tag';
import { TagsInput } from './TagsInput';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TagsSectionProps {
  onTagsChange?: (selectedTagNames: string[]) => void;
  initialTags?: string[];
  title?: string;
  collapsible?: boolean;
  showInput?: boolean;
  maxHeight?: string;
  className?: string;
}

export function TagsSection({
  onTagsChange,
  initialTags,
  title = 'Research Tags',
  collapsible = true,
  showInput = true,
  maxHeight = '200px',
  className = ''
}: TagsSectionProps) {
  const { 
    tags, 
    addTag, 
    removeTag, 
    selectTags, 
    selectedTagIds, 
    getTagByName, 
    getSelectedTags 
  } = useTags();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [localSelectedTagIds, setLocalSelectedTagIds] = useState<string[]>([]);
  const isUpdatingRef = useRef(false);
  const lastClickTimeRef = useRef(0);

  // Initialize selected tags based on initialTags or all tags
  useEffect(() => {
    if (initialTags && initialTags.length > 0) {
      // Find tag IDs that match the provided initial tag names
      const tagIdsToSelect = initialTags
        .map(tagName => {
          const tag = getTagByName(tagName);
          return tag?.id;
        })
        .filter((id): id is string => id !== undefined);
      
      setLocalSelectedTagIds(tagIdsToSelect);
      selectTags(tagIdsToSelect);
    } else if (!initialTags) {
      // If no initial tags provided, start with all tags selected
      setLocalSelectedTagIds(tags.map(tag => tag.id));
      selectTags(tags.map(tag => tag.id));
    }
  }, [initialTags, tags, getTagByName, selectTags]);

  // Sync local state with TagContext state
  useEffect(() => {
    if (!isUpdatingRef.current && JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(localSelectedTagIds.sort())) {
      setLocalSelectedTagIds(selectedTagIds);
    }
  }, [selectedTagIds]);

  // Notify parent of tag changes when selection changes
  useEffect(() => {
    if (onTagsChange) {
      const selectedTags = getSelectedTags();
      const selectedTagNames = selectedTags.map(tag => tag.name);
      console.log('Selected tags for search:', selectedTagNames);
      onTagsChange(selectedTagNames);
    }
  }, [localSelectedTagIds, getSelectedTags, onTagsChange]);

  // Handle tag toggling with better debounce
  const handleTagClick = (tagId: string) => {
    const now = Date.now();
    // Prevent rapid clicks (300ms debounce)
    if (now - lastClickTimeRef.current < 300) {
      return;
    }
    lastClickTimeRef.current = now;
    
    // Update local state first to avoid UI flicker
    isUpdatingRef.current = true;
    setLocalSelectedTagIds(prev => {
      const newSelection = prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId];
        
      // Sync with global context
      selectTags(newSelection);
      
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 50);
      
      return newSelection;
    });
  };

  // Handle tag removal
  const handleTagRemove = (tagId: string) => {
    removeTag(tagId);
    // Also remove from selected tags if present
    setLocalSelectedTagIds(prev => prev.filter(id => id !== tagId));
  };

  // Handle tag addition from input
  const handleTagsInputChange = (tagNames: string[]) => {
    isUpdatingRef.current = true;
    
    // Process the tags in a more controlled way
    const processedTags: { id: string, name: string }[] = [];
    
    // Step 1: Add any new tags that don't exist yet
    tagNames.forEach(name => {
      const existingTag = getTagByName(name);
      if (existingTag) {
        processedTags.push({ id: existingTag.id, name });
      } else {
        // Add tag if it doesn't exist
        addTag(name);
        const newTag = getTagByName(name);
        if (newTag) {
          processedTags.push({ id: newTag.id, name });
        }
      }
    });
    
    // Step 2: Update selection state
    const newTagIds = processedTags.map(tag => tag.id);
    setLocalSelectedTagIds(newTagIds);
    selectTags(newTagIds);
    
    // Step 3: Notify parent of change
    if (onTagsChange) {
      onTagsChange(tagNames);
    }
    
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 50);
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
              aria-label={isCollapsed ? 'Expand tags section' : 'Collapse tags section'}
            >
              {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          )}
        </div>
        
        {!isCollapsed && (
          <>
            {showInput && (
              <div className="mb-4">
                <TagsInput
                  initialTags={getSelectedTags().map(tag => tag.name)}
                  onTagsChange={handleTagsInputChange}
                  placeholder="Add research interests..."
                />
              </div>
            )}
            
            <div className="mt-3">
              <p className="text-xs text-white/50 mb-3 font-normal">
                {tags.length > 0 
                  ? 'These tags will be used as search parameters for crawlers:' 
                  : 'Add tags above to define your research interests for crawlers.'
                }
              </p>
              
              {tags.length > 0 && (
                <div 
                  className="flex flex-wrap gap-2 overflow-y-auto pr-2"
                  style={{ maxHeight }}
                >
                  {tags.map(tag => (
                    <Tag
                      key={tag.id}
                      tag={tag}
                      onClick={() => handleTagClick(tag.id)}
                      onRemove={() => handleTagRemove(tag.id)}
                      config={{
                        editable: false,
                        removable: true,
                        size: 'small',
                        variant: 'glassmorphic'
                      }}
                      data-selected={localSelectedTagIds.includes(tag.id)}
                      className={localSelectedTagIds.includes(tag.id) 
                        ? 'opacity-100' 
                        : 'opacity-70 hover:opacity-90'
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
} 