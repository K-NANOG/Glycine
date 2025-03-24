/**
 * Utility functions for generating and managing tag colors
 */

/**
 * Generates a random HSL color with controlled lightness for better visibility
 * @returns HSL color string
 */
export function generateRandomColor(): string {
  // Use HSL to have better control over the brightness
  // Generate random hue (0-360)
  const hue = Math.floor(Math.random() * 360);
  
  // Keep saturation high for vibrant colors (60-90%)
  const saturation = Math.floor(Math.random() * 30) + 60;
  
  // Keep lightness in a range that works well on both dark and light backgrounds (45-65%)
  const lightness = Math.floor(Math.random() * 20) + 45;
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Generates a more translucent version of a color for glassmorphic styles
 * @param color The base HSL color
 * @returns HSLA color string with alpha
 */
export function getTranslucentColor(color: string): string {
  // Extract HSL components from the string
  const matches = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!matches) return color.replace('hsl', 'hsla').replace(')', ', 0.3)');
  
  const [_, hue, saturation, lightness] = matches;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`;
}

/**
 * Get a darker or lighter version of the color for borders or hover states
 * @param color The base HSL color
 * @param amount Amount to lighten/darken (-100 to 100)
 * @returns Modified HSL color
 */
export function adjustColor(color: string, amount: number): string {
  const matches = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!matches) return color;
  
  const [_, hue, saturation, lightness] = matches;
  const newLightness = Math.max(0, Math.min(100, parseInt(lightness) + amount));
  
  return `hsl(${hue}, ${saturation}%, ${newLightness}%)`;
}

/**
 * Saves a tag color mapping to local storage
 * @param tagName The tag text
 * @param color The HSL color string
 */
export function saveTagColor(tagName: string, color: string): void {
  // Get existing tag colors or initialize empty object
  const tagColors = getTagColors();
  
  // Add or update color for this tag
  tagColors[tagName] = color;
  
  // Save back to local storage
  localStorage.setItem('tagColors', JSON.stringify(tagColors));
}

/**
 * Gets all saved tag colors from local storage
 * @returns Object mapping tag names to colors
 */
export function getTagColors(): Record<string, string> {
  const storedColors = localStorage.getItem('tagColors');
  return storedColors ? JSON.parse(storedColors) : {};
}

/**
 * Gets a color for a tag, creating and saving it if it doesn't exist
 * @param tagName The tag text
 * @returns HSL color string
 */
export function getTagColor(tagName: string): string {
  const tagColors = getTagColors();
  
  // If color exists for this tag, return it
  if (tagColors[tagName]) {
    return tagColors[tagName];
  }
  
  // Otherwise generate a new color, save it, and return it
  const newColor = generateRandomColor();
  saveTagColor(tagName, newColor);
  return newColor;
} 