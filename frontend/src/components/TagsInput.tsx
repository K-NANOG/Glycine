'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Tag } from './Tag';
import { useTags } from '../contexts/TagContext';
import { TagType } from './Tag';

interface TagsInputProps {
  onTagsChange?: (tagNames: string[]) => void;
  placeholder?: string;
  className?: string;
  maxTags?: number;
  initialTags?: string[];
}

export const TagsInput: React.FC<TagsInputProps> = ({
  onTagsChange,
  placeholder = 'Add research tags...',
  className = '',
  maxTags = 20,
  initialTags = []
}) => {
  const { addTag, getTagByName } = useTags();
  const [inputValue, setInputValue] = useState('');
  const [selectedTags, setSelectedTags] = useState<TagType[]>([]);
  const [suggestions, setSuggestions] = useState<TagType[]>([]);
  const [isActive, setIsActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const processingRef = useRef(false);

  // Initialize selected tags from prop once on mount
  useEffect(() => {
    if (initialTags && initialTags.length > 0 && selectedTags.length === 0) {
      const initialTagObjects: TagType[] = [];
      
      // Process all tags in a batch
      initialTags.forEach(tagName => {
        if (!tagName.trim()) return;
        
        let tag = getTagByName(tagName);
        if (!tag) {
          // Add tag if it doesn't exist
          tag = addTag(tagName);
        }
        if (tag) {
          initialTagObjects.push(tag);
        }
      });
      
      setSelectedTags(initialTagObjects);
    }
  }, [initialTags, addTag, getTagByName]);

  // Notify parent when tags change
  useEffect(() => {
    if (onTagsChange && !processingRef.current) {
      const tagNames = selectedTags.map(tag => tag.name);
      onTagsChange(tagNames);
    }
  }, [selectedTags, onTagsChange]);

  // Filter suggestions based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setSuggestions([]);
      setDropdownVisible(false);
      return;
    }
    
    // Delay suggestion updates slightly for better performance
    const timer = setTimeout(() => {
      // Get all available tags from context
      const allTags = Array.from(document.querySelectorAll('[data-tag-id]'))
        .map(el => ({
          id: el.getAttribute('data-tag-id') || '',
          name: el.textContent?.replace('×', '').trim() || '',
          color: el.getAttribute('data-tag-color') || ''
        }))
        .filter(tag => 
          tag.id && 
          tag.name.toLowerCase().includes(inputValue.toLowerCase()) &&
          !selectedTags.some(selected => selected.id === tag.id)
        ) as TagType[];
        
      setSuggestions(allTags);
      setDropdownVisible(allTags.length > 0);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [inputValue, selectedTags]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      
      // If there's a matching suggestion, use that
      const matchingSuggestion = suggestions.find(
        s => s.name.toLowerCase() === inputValue.toLowerCase()
      );
      
      if (matchingSuggestion) {
        addTagToSelection(matchingSuggestion);
      } else {
        // Create a new tag
        const newTag = addTag(inputValue.trim());
        if (newTag) {
          addTagToSelection(newTag);
        }
      }
      
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      // Remove the last tag when backspace is pressed and input is empty
      const lastTag = selectedTags[selectedTags.length - 1];
      removeTagFromSelection(lastTag.id);
    }
  };

  const addTagToSelection = (tag: TagType) => {
    if (selectedTags.length >= maxTags) return;
    if (selectedTags.some(t => t.id === tag.id)) return;
    
    processingRef.current = true;
    setSelectedTags(prev => [...prev, tag]);
    setInputValue('');
    setDropdownVisible(false);
    
    // Allow state to settle before triggering parent updates
    setTimeout(() => {
      processingRef.current = false;
    }, 50);
  };

  const removeTagFromSelection = (tagId: string) => {
    processingRef.current = true;
    setSelectedTags(prev => prev.filter(tag => tag.id !== tagId));
    
    // Allow state to settle before triggering parent updates
    setTimeout(() => {
      processingRef.current = false;
    }, 50);
  };

  const handleInputFocus = () => {
    setIsActive(true);
    // Show dropdown if we have input value
    if (inputValue.trim() && suggestions.length > 0) {
      setDropdownVisible(true);
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Check if we're clicking inside the dropdown
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    
    setIsActive(false);
    // Give time for tag click to register before closing dropdown
    setTimeout(() => {
      setDropdownVisible(false);
    }, 200);
  };

  return (
    <div className={`relative ${className}`}>
      <div 
        className={`flex flex-wrap items-center gap-2 p-2 rounded-md border ${
          isActive 
            ? 'border-white/20 bg-white/[0.05]' 
            : 'border-white/10 bg-white/[0.02]'
        } backdrop-blur-lg transition-all duration-300 min-h-[42px]`}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map(tag => (
          <Tag 
            key={tag.id} 
            tag={tag} 
            onRemove={() => removeTagFromSelection(tag.id)}
            config={{ 
              editable: false, 
              removable: true, 
              size: 'small',
              variant: 'glassmorphic'
            }}
          />
        ))}
        
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          className={`flex-grow min-w-[120px] bg-transparent border-none outline-none focus:ring-0 text-white placeholder-white/40 text-sm font-normal ${
            selectedTags.length > 0 ? 'ml-1' : ''
          }`}
          disabled={selectedTags.length >= maxTags}
        />
      </div>
      
      {dropdownVisible && suggestions.length > 0 && (
        <div 
          ref={dropdownRef}
          className="absolute z-10 mt-1 w-full rounded-md border border-white/10 bg-black/80 backdrop-blur-xl shadow-lg max-h-60 overflow-auto"
        >
          <ul className="py-1">
            {suggestions.map(tag => (
              <li 
                key={tag.id}
                className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors duration-150 text-sm text-white font-normal flex items-center gap-2"
                onMouseDown={() => addTagToSelection(tag)}
              >
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {selectedTags.length >= maxTags && (
        <p className="mt-1 text-xs text-white/50 font-normal">
          Maximum of {maxTags} tags reached
        </p>
      )}
    </div>
  );
}; 