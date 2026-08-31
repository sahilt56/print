'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface CanvasItemState {
  id: string;
  file: File;
  url: string;
  isImage: boolean;
  isPdf: boolean;
  pos: { x: number; y: number }; // px relative to A4
  size: { width: number; height: number }; // px width & height
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
  const setFile = (newFile: File | null) => {
    console.log("🔍 DEBUG - setFile called with:", newFile);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFileState(newFile);
    if (newFile) {
      const url = URL.createObjectURL(newFile);
      setFilePreviewUrl(url);
      setItems([]); // reset items if main root file resets
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
        totalPages, setTotalPages
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