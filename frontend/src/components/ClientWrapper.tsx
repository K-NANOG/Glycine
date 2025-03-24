'use client';

import React from 'react';
import { TagProvider } from '../contexts/TagContext';

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <TagProvider>
      {children}
    </TagProvider>
  );
} 