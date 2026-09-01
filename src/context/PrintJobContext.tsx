'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface CanvasItemState {
  id: string;
  file: File;
  url: string;
  isImage: boolean;
  isPdf: boolean;
  pos: { x: number; y: number };
  size: { width: number; height: number };
}

interface PrintJobState {
  file: File | null;
  filePreviewUrl: string | null;
  items: CanvasItemState[];
  activeItemId: string | null;
  colorMode: 'bw' | 'color';
  copies: number;
  selectedPages: string;
  setFile: (file: File | null) => void;
  setItems: React.Dispatch<React.SetStateAction<CanvasItemState[]>>;
  setActiveItemId: (id: string | null) => void;
  updateActiveItemFile: (newFile: File) => void;
  setColorMode: (mode: 'bw' | 'color') => void;
  setCopies: (copies: number) => void;
  setSelectedPages: (pages: string) => void;
  totalPages: number;
  setTotalPages: (pages: number) => void;
  clearAllMemory: () => void; // 🛡️ New function to hard-reset memory leak hooks
}

const PrintJobContext = createContext<PrintJobState | undefined>(undefined);

export function PrintJobProvider({ children }: { children: ReactNode }) {
  const [file, setFileState] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [items, setItems] = useState<CanvasItemState[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<'bw' | 'color'>('bw');
  const [copies, setCopies] = useState<number>(1);
  const [selectedPages, setSelectedPages] = useState<string>('all');
  const [totalPages, setTotalPages] = useState<number>(1);

  // 🛡️ Safe Garbage collection utility
  const clearAllMemory = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    items.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    setFilePreviewUrl(null);
    setFileState(null);
    setItems([]);
    setActiveItemId(null);
  };

  const setFile = (newFile: File | null) => {
    console.log("🔍 DEBUG - setFile called with:", newFile?.name);
    
    // 1. Instantly revoke the old file to release RAM
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }

    setFileState(newFile);

    if (newFile) {
      // 2. Generate a fresh URL container
      const url = URL.createObjectURL(newFile);
      setFilePreviewUrl(url);
      
      // Clean stale array tracking elements immediately
      if (items.length > 0) {
        items.forEach(item => { if (item.url) URL.revokeObjectURL(item.url); });
      }
      setItems([]); 
      setActiveItemId(null);
    } else {
      setFilePreviewUrl(null);
      setItems([]);
      setActiveItemId(null);
    }
  };

  const updateActiveItemFile = (newFile: File) => {
    const newUrl = URL.createObjectURL(newFile);
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === activeItemId) {
          if (item.url) URL.revokeObjectURL(item.url);
          return {
            ...item,
            file: newFile,
            url: newUrl,
            isImage: newFile.type.startsWith('image/'),
            isPdf: newFile.type === 'application/pdf',
          };
        }
        return item;
      })
    );
  };

  return (
    <PrintJobContext.Provider
      value={{
        file,
        filePreviewUrl,
        items,
        activeItemId,
        setFile,
        setItems,
        setActiveItemId,
        updateActiveItemFile,
        colorMode,
        setColorMode,
        copies,
        setCopies,
        selectedPages,
        setSelectedPages,
        totalPages,
        setTotalPages,
        clearAllMemory
      }}
    >
      {children}
    </PrintJobContext.Provider>
  );
}

export function usePrintJob() {
  const context = useContext(PrintJobContext);
  if (context === undefined) {
    throw new Error('usePrintJob must be used within a PrintJobProvider');
  }
  return context;
}
