'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Loader2 } from 'lucide-react';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');

  // 🛡️ Strict 0ms Lock Guard (Double click crash block)
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
    // 🛡️ Drop duplicate clicks at 0ms
    if (isProcessingRef.current) {
      e.target.value = '';
      return;
    }

    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // 🛑 12 MB Size Limit Check
    if (selectedFile.size > 12 * 1024 * 1024) {
      setError('❌ File size must be less than 12 MB. Please choose a smaller file.');
      e.target.value = '';
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setError('');

    const rawFile = selectedFile;
    e.target.value = '';

    const isPdf = rawFile.type === 'application/pdf';
    const isImage = rawFile.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/i.test(rawFile.name);

    if (!isImage && !isPdf) {
      setError('❌ Invalid file format! Please choose PDF, JPG, or PNG.');
      isProcessingRef.current = false;
      setIsProcessing(false);
      return;
    }

    try {
      // 🚀 ZERO FRONTEND COMPRESSION (Direct Handoff to Context)
      setFile(rawFile);
      router.push(`/${cafeId}/preview`);
    } catch (err) {
      console.error('File routing error:', err);
      setError('Failed to process file. Please try again.');
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
          {/* Single Upload Document Button */}
          <div className={styles.uploadContainer}>
            <input
              ref={docInputRef}
              type="file"
              className="visually-hidden"
              accept=".pdf,image/*"
              capture="environment" // 👈 Mobile ke liye direct camera/gallery trigger karega
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
          <p>Supported: PDF, JPG, PNG (Max 12MB)</p>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#b3b4b3', marginTop: '9px' }}>
             Aapke documents yahan bilkul safe hain aur 24 ghante mein sab kuch auto-wipe ho jata hai, hum koi permanent data ya files apne paas store nahi karte.
          </p>
      </div>
    </div>
  );
}