'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface CafeDetails {
  name?: string;
  logoUrl?: string | null;
}
// some change
// 🛡️ Ultra Low-RAM Resizer (Crash-Proof for Mobile Phones)
async function compressImageLowMemory(file: File): Promise<File> {
  try {
    // 1. createImageBitmap direct hardware-level par resize karta hai (Zero RAM Spike)
    if ('createImageBitmap' in window) {
      const maxDim = 1200; // Print documents ke liye 1200px kaafi hai
      const imgBitmap = await createImageBitmap(file);

      let { width, height } = imgBitmap;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      // Hardware scaled bitmap create karein
      const scaledBitmap = await createImageBitmap(file, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'medium',
      });
      imgBitmap.close(); // Heavy raw photo ko memory se turant delete karein

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (ctx) {
        ctx.drawImage(scaledBitmap, 0, 0);
        scaledBitmap.close(); // Scaled bitmap memory free karein

        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.75)
        );

        // Canvas memory free karein
        canvas.width = 0;
        canvas.height = 0;

        if (blob) {
          return new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
        }
      }
    }
  } catch (err) {
    console.warn('Native low-memory scaling failed, falling back:', err);
  }

  // Fallback if browser doesn't support createImageBitmap
  try {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1200,
      useWebWorker: false, // Worker low-RAM devices par double memory consume karta hai
      initialQuality: 0.7,
    };
    return await imageCompression(file, options);
  } catch (error) {
    console.warn('Compression failed, using raw file:', error);
    return file;
  }
}

export default function CafeLandingPage({ params }: { params: Promise<{ cafeId: string }> }) {
  const router = useRouter();
  const { setFile } = usePrintJob();

  const { cafeId } = React.use(params);
  const [cafeData, setCafeData] = useState<CafeDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');

  // 🛡️ Double-Click / Rapid Shutter Lock Ref (Synchronous 0ms Protection)
  const isProcessingRef = useRef<boolean>(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchCafeDetails() {
      try {
        const response = await fetch(`/api/cafe/${cafeId}`);
        if (response.ok) {
          const data = await response.json();
          if (isMounted) setCafeData(data);
        }
      } catch (error) {
        console.warn('Could not load cafe details:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (cafeId) {
      fetchCafeDetails();
    }
    return () => {
      isMounted = false;
    };
  }, [cafeId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // 🛡️ Lock Guard: Rapid double clicks ko instantly drop karega
    if (isProcessingRef.current) {
      e.target.value = '';
      return;
    }

    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Set locks synchronously
    isProcessingRef.current = true;
    setIsProcessing(true);
    setError('');

    const rawFile = selectedFile;
    e.target.value = ''; // Reset input target

    const isPdf = rawFile.type === 'application/pdf';
    const isImage = rawFile.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/i.test(rawFile.name);

    if (!isImage && !isPdf) {
      setError('❌ Invalid file format! Please choose PDF, JPG, or PNG.');
      isProcessingRef.current = false;
      setIsProcessing(false);
      return;
    }

    try {
      // Purani stale states clear karein
      setFile(null);

      let finalFile = rawFile;

      if (isImage) {
        finalFile = await compressImageLowMemory(rawFile);
      }

      setFile(finalFile);
      router.push(`/${cafeId}/preview`);
    } catch (err) {
      console.error('File processing error:', err);
      setError('Failed to process file. Please try again.');
      // Unlock on failure
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  return (
    <div className={styles.heroContainer}>
      {cafeData?.logoUrl && (
        <div className={styles.bgImageWrapper}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cafeData.logoUrl} alt="Hero Background" className={styles.bgImage} />
          <div className={styles.overlay} />
        </div>
      )}

      <div className={styles.contentWrapper}>
        <div className={styles.header}>
          {cafeData?.logoUrl && (
            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cafeData.logoUrl} alt="Cafe Logo" className={styles.logoImage} />
            </div>
          )}

          {isLoading ? (
            <h1 className={styles.titleLoader}>Loading...</h1>
          ) : (
            <h1 className={styles.title}>{cafeData?.name || 'QR PRINT'}</h1>
          )}
          <p className={styles.subtitle}>Upload &bull; Crop &bull; Print</p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              textAlign: 'center',
              marginBottom: '1rem',
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        <div className={styles.actions}>
          {/* Upload Document (Mobile OS automatically asks for Camera or Files) */}
          <div className={styles.uploadContainer}>
            <input
              ref={docInputRef}
              type="file"
              className="visually-hidden"
              accept=".pdf,image/*"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            <Button
              variant="primary"
              size="large"
              fullWidth
              disabled={isProcessing}
              onClick={() => {
                if (isProcessingRef.current) return;
                setError('');
                docInputRef.current?.click();
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
              {isProcessing ? 'Processing...' : 'Upload Document'}
            </Button>
          </div>
        </div>

        <div className={styles.footer}>
          <p>Supported: PDF, JPG, PNG (Max 10MB)</p>
        </div>
      </div>
    </div>
  );
}