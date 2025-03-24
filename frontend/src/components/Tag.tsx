'use client';

import React from 'react';

export interface TagType {
  id: string;
  name: string;
  color: string;
}

interface TagConfig {
  size?: 'small' | 'medium' | 'large';
  removable?: boolean;
  editable?: boolean;
  variant?: 'solid' | 'outline' | 'glassmorphic';
}

export interface TagProps {
  tag: TagType;
  config?: TagConfig;
  onClick?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
}

interface TagExtraProps {
  'data-selected'?: boolean;
}

type CombinedTagProps = TagProps & 
  React.HTMLAttributes<HTMLDivElement> & 
  TagExtraProps;

export function Tag({
  tag,
  config = {
    size: 'medium',
    removable: false,
    editable: false,
    variant: 'glassmorphic'
  },
  onClick,
  onRemove,
  onEdit,
  className = '',
  'data-selected': selected = false,
  ...props
}: CombinedTagProps) {
  const { name, color } = tag;
  
  // Function to get translucent color
  const getTranslucentColor = (hex: string, alpha: number = 0.25) => {
    // Remove the # if it exists
    let hexColor = hex.startsWith('#') ? hex.substring(1) : hex;
    
    // Handle 3-digit hex
    if (hexColor.length === 3) {
      hexColor = hexColor[0] + hexColor[0] + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2];
    }
    
    // Convert to RGB
    const r = parseInt(hexColor.substring(0, 2), 16);
    const g = parseInt(hexColor.substring(2, 4), 16);
    const b = parseInt(hexColor.substring(4, 6), 16);
    
    // Return rgba
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  
  // Function to adjust color
  const adjustColor = (hex: string, amount: number) => {
    // Remove the # if it exists
    let hexColor = hex.startsWith('#') ? hex.substring(1) : hex;
    
    // Handle 3-digit hex
    if (hexColor.length === 3) {
      hexColor = hexColor[0] + hexColor[0] + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2];
    }
    
    // Convert to RGB
    let r = parseInt(hexColor.substring(0, 2), 16);
    let g = parseInt(hexColor.substring(2, 4), 16);
    let b = parseInt(hexColor.substring(4, 6), 16);
    
    // Adjust color
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };
  
  // Compute colors for different states and effects
  const translucentColor = getTranslucentColor(color, 0.25);
  const darkerColor = adjustColor(color, -20);
  const lighterColor = adjustColor(color, 10);
  
  // Size-specific classes
  const sizeClasses = {
    small: 'text-xs py-1 px-2.5 min-h-[24px]',
    medium: 'text-sm py-1.5 px-3 min-h-[32px]',
    large: 'text-base py-2 px-4 min-h-[40px]'
  }[config.size || 'medium'];
  
  // Construct base style classes
  const baseClasses = `
    inline-flex items-center gap-1
    rounded-sm border border-white/10
    font-normal transition-all duration-200
    ${sizeClasses}
  `;
  
  // Calculate styles directly
  let bgColor = color;
  let borderColor = 'rgba(255,255,255,0.1)';
  let textShadow = '';
  
  if (config.variant === 'glassmorphic') {
    bgColor = translucentColor;
    if (selected) {
      borderColor = lighterColor;
      textShadow = '0 1px 2px rgba(0,0,0,0.2)';
    }
  } else if (config.variant === 'outline') {
    bgColor = 'transparent';
    borderColor = color;
  }
  
  // Add interactive styles if onClick is provided
  const interactiveClasses = onClick
    ? 'cursor-pointer hover:shadow-md active:scale-95 transform'
    : '';
  
  // Handle click events
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Stop propagation so the parent doesn't receive the click
    e.stopPropagation();
    
    // Call the onClick handler if provided
    if (onClick) {
      onClick();
    }
  };
  
  // Handle remove button click
  const handleRemoveClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // Prevent parent onClick from firing
    if (onRemove) {
      onRemove();
    }
  };

  return (
    <div
      className={`${baseClasses} ${interactiveClasses} ${className}`}
      onClick={handleClick}
      data-tag-id={tag.id}
      data-tag-color={color}
      data-selected={selected}
      style={{
        backgroundColor: bgColor,
        borderColor: borderColor,
        color: 'white',
        textShadow: textShadow,
        boxShadow: selected ? `0 0 0 1px ${lighterColor}, 0 2px 8px 0 ${translucentColor}` : 'none',
      }}
      {...props}
    >
      <span className="truncate max-w-[120px]">{name}</span>
      
      {config.removable && onRemove && (
        <button
          onClick={handleRemoveClick}
          className={`
            ml-1 flex items-center justify-center
            w-4 h-4 rounded-sm 
            bg-white/10 hover:bg-white/20
            transition-colors duration-200
          `}
          aria-label={`Remove ${name} tag`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
} 