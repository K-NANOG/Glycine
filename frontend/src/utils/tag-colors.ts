'use client';

/**
 * Utility functions for generating and managing tag colors
 */

import { hslToHex } from './color-utils';

// Vibrant color palette with focus on purples, pinks, blues, and indigos
const VIBRANT_COLORS = [
  // Purples and Violets
  '#9900ff', // Vivid Purple
  '#8a2be2', // Violet Blue
  '#7b68ee', // Medium Slate Blue
  '#a020f0', // Purple
  '#9370db', // Medium Purple
  '#b57edc', // Lavender
  
  // Pinks and Magentas
  '#ff00ff', // Magenta
  '#ff1493', // Deep Pink
  '#ff69b4', // Hot Pink
  '#db7093', // Pale Violet Red
  '#e83e8c', // Rich Pink
  '#ff0066', // Neon Pink
  
  // Blues
  '#0000ff', // Blue
  '#00bfff', // Deep Sky Blue
  '#1e90ff', // Dodger Blue
  '#4169e1', // Royal Blue
  '#0074d9', // Vibrant Blue
  '#00a8ff', // Bright Blue
  
  // Indigos and Teals
  '#4b0082', // Indigo
  '#3d0a91', // Electric Indigo
  '#5f4b8b', // Rich Indigo
  '#6610f2', // Bright Indigo
  '#00ffff', // Cyan
  '#20b2aa', // Light Sea Green
];

// Track which colors have been used
let usedColors: string[] = [];

// Local storage key for tag colors
const TAG_COLORS_KEY = 'glycine-tag-colors';

/**
 * Generate a random vibrant color, prioritizing purples, pinks, blues, and indigos
 */
export function generateRandomColor(): string {
  // 85% chance of using predefined vibrant colors
  if (Math.random() < 0.85 && VIBRANT_COLORS.length > 0) {
    // If all colors have been used, reset the used colors
    if (usedColors.length >= VIBRANT_COLORS.length) {
      // Keep the last 3 used colors to prevent immediate reuse
      const lastThreeColors = usedColors.slice(-3);
      usedColors = lastThreeColors;
    }
    
    // Get unused colors
    const availableColors = VIBRANT_COLORS.filter(color => !usedColors.includes(color));
    
    // If no unused colors, just pick a random one from the full list
    if (availableColors.length === 0) {
      const randomIndex = Math.floor(Math.random() * VIBRANT_COLORS.length);
      const selectedColor = VIBRANT_COLORS[randomIndex];
      
      // Still track it as used
      usedColors.push(selectedColor);
      return selectedColor;
    }
    
    // Use a random unused color
    const randomIndex = Math.floor(Math.random() * availableColors.length);
    const selectedColor = availableColors[randomIndex];
    
    // Mark it as used
    usedColors.push(selectedColor);
    return selectedColor;
  }
  
  // For variety, sometimes generate a completely random color in the preferred hue ranges
  
  // Define hue ranges for vibrant colors (in degrees)
  // Focusing on purples, pinks, blues, and indigos
  const hueRanges = [
    { min: 240, max: 260 }, // Blues
    { min: 260, max: 280 }, // Purples
    { min: 280, max: 300 }, // Purples to Magentas
    { min: 300, max: 330 }, // Magentas to Pinks
    { min: 330, max: 350 }, // Pinks to Reds
    { min: 180, max: 210 }, // Cyans for variety
  ];
  
  // Choose a random hue range
  const randomRangeIndex = Math.floor(Math.random() * hueRanges.length);
  const { min, max } = hueRanges[randomRangeIndex];
  
  // Generate a random hue within the selected range
  const hue = min + Math.random() * (max - min);
  
  // More saturated for vibrant colors (85-100%)
  const saturation = 85 + Math.random() * 15;
  
  // Brightness adjusted for good visibility (45-65%)
  const lightness = 45 + Math.random() * 20;
  
  // Convert HSL to Hex
  return hslToHex(hue, saturation, lightness);
}

/**
 * Save a tag's color to local storage
 */
export function saveTagColor(tagId: string, color: string): void {
  try {
    // Get existing colors
    const existingColors = getTagColors();
    
    // Update the color for this tag
    existingColors[tagId] = color;
    
    // Save back to local storage
    localStorage.setItem(TAG_COLORS_KEY, JSON.stringify(existingColors));
  } catch (error) {
    console.error('Failed to save tag color:', error);
  }
}

/**
 * Get all tag colors from local storage
 */
export function getTagColors(): Record<string, string> {
  try {
    const colors = localStorage.getItem(TAG_COLORS_KEY);
    return colors ? JSON.parse(colors) : {};
  } catch (error) {
    console.error('Failed to get tag colors:', error);
    return {};
  }
}

/**
 * Get a specific tag's color, or generate a new one if not found
 */
export function getTagColor(tagId: string): string {
  const colors = getTagColors();
  
  if (colors[tagId]) {
    return colors[tagId];
  }
  
  // Generate a new color
  const newColor = generateRandomColor();
  saveTagColor(tagId, newColor);
  
  return newColor;
}

/**
 * Creates a translucent version of a color with specified alpha
 * @deprecated Use getTranslucentColor from color-utils.ts instead
 */
export function getTranslucentColor(color: string, alpha: number = 0.1): string {
  // Remove the # if it exists
  const hex = color.startsWith('#') ? color.substring(1) : color;
  
  // Handle 3-digit hex
  const adjustedHex = hex.length === 3 
    ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] 
    : hex;
  
  // Convert to RGB
  const r = parseInt(adjustedHex.substring(0, 2), 16);
  const g = parseInt(adjustedHex.substring(2, 4), 16);
  const b = parseInt(adjustedHex.substring(4, 6), 16);
  
  // Return rgba
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Adjusts a color by the given amount
 * @deprecated Use adjustColor from color-utils.ts instead
 */
export function adjustColor(color: string, amount: number): string {
  // Remove the # if it exists
  const hex = color.startsWith('#') ? color.substring(1) : color;
  
  // Convert to RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  
  // Adjust color
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  
  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
} 