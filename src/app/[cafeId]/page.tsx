'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';

interface CafeDetails {
  name?: string;
  logoUrl?: string | null;
}

export default function CafeLandingPage({ params }: { params: Promise<{ cafeId: string }> }) {
  const router = useRouter();
  const { setFile } = usePrintJob();
  
  const { cafeId } = React.use(params);
  const [cafeData, setCafeData] = useState<CafeDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      router.push(`/${cafeId}/preview`);
    }
  };
  
  return (
    <div className={styles.heroContainer}>
      {/* Background Hero Banner */}
      {cafeData?.logoUrl && (
        <div className={styles.bgImageWrapper}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={cafeData.logoUrl} 
            alt="Hero Background" 
            className={styles.bgImage} 
          />
          <div className={styles.overlay} />
        </div>
      )}

      {/* Main Content Centered */}
      <div className={styles.contentWrapper}>
        <div className={styles.header}>
          {/* Displays Logo on top of Card if uploaded */}
          {cafeData?.logoUrl && (
            <div style={{ marginBottom: '12px', textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={cafeData.logoUrl} 
                alt="Cafe Logo" 
                style={{ maxHeight: '70px', maxWidth: '180px', objectFit: 'contain', borderRadius: '8px' }} 
              />
            </div>
          )}

          {isLoading ? (
            <h1 className={styles.titleLoader}>Loading...</h1>
          ) : (
            <h1 className={styles.title}>{cafeData?.name || 'QR PRINT'}</h1>
          )}
          <p className={styles.subtitle}>Upload &bull; Crop &bull; Print</p>
        </div>

        <div className={styles.actions}>
          <div className={styles.uploadContainer}>
            <input 
              type="file" 
              id="upload-doc" 
              className="visually-hidden" 
              accept=".pdf,.png,.jpg,.jpeg" 
              onChange={handleFileChange}
            />
            <Button 
              variant="primary" 
              size="large" 
              fullWidth 
              onClick={() => document.getElementById('upload-doc')?.click()}
            >
               Upload Document
            </Button>
          </div>
          
          <div className={styles.uploadContainer}>
            <input 
              type="file" 
              id="take-photo" 
              className="visually-hidden" 
              accept="image/*" 
              capture="environment" 
              onChange={handleFileChange}
            />
            <Button 
              variant="secondary" 
              size="large" 
              fullWidth
              onClick={() => document.getElementById('take-photo')?.click()}
            >
              Take Photo
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