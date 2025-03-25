'use client';

import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { TagType } from '../components/Tag';
import { generateRandomColor, getTagColor } from '../utils/tag-colors';

interface TagContextType {
  tags: TagType[];
  addTag: (name: string) => TagType;
  addTags: (names: string[]) => TagType[];
  removeTag: (id: string) => void;
  updateTag: (tag: TagType) => void;
  getTagByName: (name: string) => TagType | undefined;
  getTagsByIds: (ids: string[]) => TagType[];
  selectTags: (tagIds: string[]) => void;
  selectedTagIds: string[];
  getSelectedTags: () => TagType[];
  getKeywords: () => string[];
}

// Create the context with a default undefined value
const TagContext = createContext<TagContextType | undefined>(undefined);

// Default tags that will be created if no saved tags are found
const DEFAULT_TAGS = [
  { id: uuidv4(), name: 'synthetic biology', color: generateRandomColor() },
  { id: uuidv4(), name: 'machine learning', color: generateRandomColor() },
  { id: uuidv4(), name: 'bioinformatics', color: generateRandomColor() }
];

// Keys used for storing tags in localStorage
const STORAGE_KEY = 'glycine-research-tags';
const SELECTED_TAGS_KEY = 'glycine-selected-tags';

// Props for the provider component
interface TagProviderProps {
  children: ReactNode;
}

// Function to store tags to localStorage
const saveTags = (tags: TagType[]) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
    } catch (error) {
      console.error('Error saving tags to localStorage:', error);
    }
  }
};

// Function to store selected tags for search
const saveSelectedTags = (tagIds: string[]) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SELECTED_TAGS_KEY, JSON.stringify(tagIds));
    } catch (error) {
      console.error('Error saving selected tags to localStorage:', error);
    }
  }
};

// Function to load selected tags from localStorage
const loadSelectedTags = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const savedSelection = localStorage.getItem(SELECTED_TAGS_KEY);
    if (savedSelection) {
      const parsedSelection = JSON.parse(savedSelection);
      if (Array.isArray(parsedSelection)) {
        return parsedSelection;
      }
    }
  } catch (error) {
    console.error('Error loading selected tags from localStorage:', error);
  }
  
  return [];
};

// Function to load tags from localStorage
const loadTags = (): TagType[] => {
  if (typeof window === 'undefined') {
    return DEFAULT_TAGS;
  }

  try {
    const savedTags = localStorage.getItem(STORAGE_KEY);
    if (savedTags) {
      const parsedTags = JSON.parse(savedTags);
      if (Array.isArray(parsedTags) && parsedTags.length > 0) {
        // Ensure each tag has a valid color
        const tagsWithColors = parsedTags.map((tag: TagType) => {
          if (!tag.color || tag.color === 'undefined') {
            tag.color = getTagColor(tag.id);
          }
          return tag;
        });
        
        return tagsWithColors;
      }
    }
  } catch (error) {
    console.error('Error loading tags from localStorage:', error);
  }
  
  // Fall back to default tags if none were loaded
  return DEFAULT_TAGS;
};

export const TagProvider: React.FC<TagProviderProps> = ({ children }) => {
  const [tags, setTags] = useState<TagType[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Load tags from localStorage on component mount
  useEffect(() => {
    const loadedTags = loadTags();
    setTags(loadedTags);
    
    // Load selected tags
    const selected = loadSelectedTags();
    setSelectedTagIds(selected.length > 0 ? selected : loadedTags.map(tag => tag.id));
  }, []);

  // Save tags to localStorage whenever they change
  useEffect(() => {
    if (tags.length > 0) {
      saveTags(tags);
    }
  }, [tags]);

  // Save selected tags when they change
  useEffect(() => {
    saveSelectedTags(selectedTagIds);
  }, [selectedTagIds]);

  // Add a new tag with a random color
  const addTag = useCallback((name: string): TagType => {
    const trimmedName = name.trim();
    // Don't add duplicates
    const existingTag = tags.find(tag => tag.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingTag) {
      return existingTag;
    }
    
    const newTag: TagType = {
      id: uuidv4(),
      name: trimmedName,
      color: generateRandomColor()
    };
    
    setTags(prevTags => [...prevTags, newTag]);
    return newTag;
  }, [tags]);

  // Add multiple tags at once
  const addTags = useCallback((names: string[]): TagType[] => {
    const createdTags: TagType[] = [];
    
    setTags(prevTags => {
      const existingNames = new Set(prevTags.map(tag => tag.name.toLowerCase()));
      const newTags = names
        .map(name => name.trim())
        .filter(name => name && !existingNames.has(name.toLowerCase()))
        .map(name => {
          const newTag = {
            id: uuidv4(),
            name,
            color: generateRandomColor()
          };
          createdTags.push(newTag);
          return newTag;
        });
      
      return [...prevTags, ...newTags];
    });
    
    return createdTags;
  }, []);

  // Remove a tag by ID
  const removeTag = useCallback((id: string) => {
    console.log(`TagContext: Removing tag with ID ${id}`);
    
    // Update tags list first
    setTags(prevTags => {
      const updatedTags = prevTags.filter(tag => tag.id !== id);
      console.log(`TagContext: Tags after removal:`, updatedTags);
      return updatedTags;
    });
    
    // Also remove from selected tags if present
    setSelectedTagIds(prev => {
      const updatedSelectedTags = prev.filter(tagId => tagId !== id);
      console.log(`TagContext: Selected tags after removal:`, updatedSelectedTags);
      return updatedSelectedTags;
    });
  }, []);

  // Update an existing tag
  const updateTag = useCallback((updatedTag: TagType) => {
    setTags(prevTags => 
      prevTags.map(tag => 
        tag.id === updatedTag.id ? updatedTag : tag
      )
    );
  }, []);

  // Find a tag by name (case-insensitive)
  const getTagByName = useCallback((name: string): TagType | undefined => {
    return tags.find(tag => 
      tag.name.toLowerCase() === name.toLowerCase()
    );
  }, [tags]);

  // Get tags by their IDs
  const getTagsByIds = useCallback((ids: string[]): TagType[] => {
    return tags.filter(tag => ids.includes(tag.id));
  }, [tags]);

  // Select tags for search (replace current selection)
  const selectTags = useCallback((tagIds: string[]) => {
    setSelectedTagIds(tagIds);
  }, []);

  // Get currently selected tags
  const getSelectedTags = useCallback((): TagType[] => {
    return getTagsByIds(selectedTagIds);
  }, [getTagsByIds, selectedTagIds]);

  // Get keywords from selected tags (or all tags if none selected)
  const getKeywords = useCallback((): string[] => {
    const selectedTags = getSelectedTags();
    if (selectedTags.length > 0) {
      return selectedTags.map(tag => tag.name);
    }
    return tags.map(tag => tag.name);
  }, [getSelectedTags, tags]);

  // Context value with memoized callbacks
  const value: TagContextType = {
    tags,
    addTag,
    addTags,
    removeTag,
    updateTag,
    getTagByName,
    getTagsByIds,
    selectTags,
    selectedTagIds,
    getSelectedTags,
    getKeywords
  };

  return (
    <TagContext.Provider value={value}>
      {children}
    </TagContext.Provider>
  );
};

// Custom hook to use the tag context
export const useTags = (): TagContextType => {
  const context = useContext(TagContext);
  if (context === undefined) {
    throw new Error('useTags must be used within a TagProvider');
  }
  return context;
}; 