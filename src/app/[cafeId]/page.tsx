'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Camera } from 'lucide-react';

interface CafeDetails {
  name?: string;
  logoUrl?: string | null;
}

// Image compression helper function to prevent mobile low memory crashes
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob conversion failed'));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          0.7 
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type.startsWith('image/')) {
        try {
          const compressedFile = await compressImage(selectedFile);
          setFile(compressedFile);
        } catch (err) {
          console.error("Compression failed, using original", err);
          setFile(selectedFile);
        }
      } else {
        setFile(selectedFile);
      }
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
            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={cafeData.logoUrl} 
                alt="Cafe Logo" 
                className={styles.logoImage}
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <UploadCloud size={18} /> Upload Document
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Camera size={18} /> Take Photo
            </Button>
          </div>
        </div>

        <div className={styles.footer}>
          <p>Supported: JPG, PNG (Max 10MB)</p>
        </div>
      </div>
    </div>
  );
}