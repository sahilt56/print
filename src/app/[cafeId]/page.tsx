'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Camera } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface CafeDetails {
  name?: string;
  logoUrl?: string | null;
}

// 🛡️ Safe Super-Light Compress Function (RAM Crash protection)
// 🛡️ Safe Memory Compression (createObjectURL + Object Blob)
async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 1,                  // Reduces massive files immediately
    maxWidthOrHeight: 1024,        // Safe boundary for printing forms/text
    useWebWorker: true,            // 🛡️ Moves execution off the main UI thread to prevent crashes
    initialQuality: 0.6,           // Balanced compression
    alwaysKeepResolution: false    // Forces downsizing of huge mobile sensors
  };

  try {
    return await imageCompression(file, options);
  } catch (error) {
    console.warn("Worker compression failed, falling back to raw file:", error);
    return file;
  }
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
  e.target.value = '';

  const isPdf = selectedFile.type === 'application/pdf';
  const isImage = selectedFile.type.startsWith('image/');

  if (!isImage && !isPdf) {
    setError('❌ Invalid file format! Please choose PDF, JPG, or PNG.');
    return;
  }

  let finalFile = selectedFile;

  if (isImage) {
    try {
      // Background worker handles the scale down securely
      finalFile = await compressImage(selectedFile);
    } catch (err) {
      console.warn('Compression bypassed:', err);
    }
  }

  setFile(finalFile);
  
  // Clean up input value immediately to release reference pointer from DOM memory
  e.target.value = ''; 
  
  router.push(`/${cafeId}/preview`);
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
              accept=".jpg,.jpeg,.png" 
              
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