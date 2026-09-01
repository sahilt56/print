'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Camera } from 'lucide-react';

interface CafeDetails {
  name?: string;
  logoUrl?: string | null;
}

// 🛡️ Safe Super-Light Compress Function (RAM Crash protection)
// 🛡️ Safe Memory Compression (createObjectURL + Object Blob)
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    try {
      // FileReader ki jagah direct Object URL memory usage 70% kam kar deta hai
      const blobUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = blobUrl;

      img.onload = () => {
        URL.revokeObjectURL(blobUrl);

        // Low RAM crash se bachne ke liye safe 800px max limit
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;

        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File(
              [blob],
              file.name || `photo-${Date.now()}.jpg`,
              {
                type: 'image/jpeg',
                lastModified: Date.now(),
              }
            );
            resolve(compressedFile);
          },
          'image/jpeg',
          0.5 // 50% Quality to prevent RAM spike
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(file);
      };
    } catch {
      resolve(file);
    }
  });
}

export default function CafeLandingPage({ params }: { params: Promise<{ cafeId: string }> }) {
  const router = useRouter();
  const { setFile } = usePrintJob();

  const { cafeId } = React.use(params);
  const [cafeData, setCafeData] = useState<CafeDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const docInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError('');

    // Format check (Mobile cameras default image types allow karega)
    const isImage = selectedFile.type.startsWith('image/') || selectedFile.type === '';
    const isPdf = selectedFile.type === 'application/pdf';

    if (!isImage && !isPdf) {
      setError('❌ Invalid file format! Please choose PDF, JPG, or PNG.');
      e.target.value = '';
      return;
    }

    let finalFile = selectedFile;

    if (isImage) {
      try {
        const compressedFile = await compressImage(finalFile);
        finalFile = compressedFile;
      } catch (err) {
        console.warn('Compression bypassed:', err);
      }
    }

    // Context set karke redirection
    setFile(finalFile);
    router.push(`/${cafeId}/preview`);
    e.target.value = '';
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
          {/* Upload Document */}
          <div className={styles.uploadContainer}>
            <input
              ref={docInputRef}
              type="file"
              className="visually-hidden"
              accept=".pdf,.png,.jpg,.jpeg,image/*"
              onChange={handleFileChange}
            />
            <Button
              variant="primary"
              size="large"
              fullWidth
              onClick={() => {
                setError('');
                docInputRef.current?.click();
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <UploadCloud size={18} /> Upload Document
            </Button>
          </div>

          {/* Direct Camera Capture */}
          <div className={styles.uploadContainer}>
            <input
              ref={cameraInputRef}
              type="file"
              className="visually-hidden"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
            />
            <Button
              variant="secondary"
              size="large"
              fullWidth
              onClick={() => {
                setError('');
                cameraInputRef.current?.click();
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Camera size={18} /> Take Photo
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