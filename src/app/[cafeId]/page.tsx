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
  const [error, setError] = useState<string>(''); // 👈 Custom error state UI ke liye

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

    // Purana error hata dein jab nayi file select ho
    setError('');

    // 1️⃣ Format Validation
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('❌ Invalid file format! Please choose only PDF, JPG, or PNG files. (Galat file format hai! Kripya sirf PDF, JPG ya PNG file select karein.)');      e.target.value = '';
      return;
    }

    // 2️⃣ Size Validation (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
        setError('⚠️ File is too large! Please select a file under 10MB. (File ka size 10MB se bada hai! Kripya 10MB se kam size ki file chunein.)');      e.target.value = '';
      return;
    }

    let finalFile = selectedFile;

    if (finalFile.type.startsWith('image/')) {
      try {
        const compressedFile = await compressImage(finalFile);
        finalFile = compressedFile;
      } catch (err) {
        // Fallback to original
      }
    }

    setFile(finalFile);
    router.push(`/${cafeId}/preview`);
    e.target.value = '';
  };
  
  return (
    <div className={styles.heroContainer}>
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

      <div className={styles.contentWrapper}>
        <div className={styles.header}>
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

        {/* 👇 Naya Custom Error Box UI (Bina Chrome ke pop-up ke) */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontSize: '0.9rem',
            textAlign: 'center',
            marginBottom: '1rem',
            fontWeight: 500
          }}>
            {error}
          </div>
        )}

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
              onClick={() => { setError(''); document.getElementById('upload-doc')?.click(); }}
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
              onClick={() => { setError(''); document.getElementById('take-photo')?.click(); }}
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