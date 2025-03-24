/**
 * Tag-related type definitions
 */

/**
 * Represents a research tag with its color
 */
export interface Tag {
  id: string;
  name: string;
  color: string;
}

/**
 * Configuration for tag display
 */
export interface TagConfig {
  editable: boolean;
  removable: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'solid' | 'outlined' | 'glassmorphic';
}

/**
 * Props for the TagManagement component
 */
export interface TagManagementProps {
  tags: Tag[];
  onAddTag: (tag: Tag) => void;
  onRemoveTag: (tagId: string) => void;
  onUpdateTag: (tag: Tag) => void;
  config?: TagConfig;
}

/**
 * Props for the Tag component
 */
export interface TagProps {
  tag: Tag;
  onRemove?: (id: string) => void;
  onClick?: (tag: Tag) => void;
  config?: TagConfig;
}

/**
 * Context for managing tags across components
 */
export interface TagContextType {
  tags: Tag[];
  addTag: (name: string) => void;
  removeTag: (id: string) => void;
  updateTag: (tag: Tag) => void;
  getTagByName: (name: string) => Tag | undefined;
} 