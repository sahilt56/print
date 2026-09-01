'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Camera, X, RefreshCw } from 'lucide-react';

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
  const [error, setError] = useState<string>('');

  // In-App Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isFacingUser, setIsFacingUser] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
      } catch (err) {
        console.warn('Could not load cafe details:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    if (cafeId) fetchCafeDetails();
    return () => { isMounted = false; };
  }, [cafeId]);

  /* ---------------------------------------------------------------------- */
  /* IN-APP CAMERA CONTROLS (NO NATIVE CAM APP CRASH)                       */
  /* ---------------------------------------------------------------------- */

  const startCamera = async (frontCamera = false) => {
    setError('');
    setIsCameraOpen(true);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: frontCamera ? 'user' : 'environment',
          width: { ideal: 1024 },
          height: { ideal: 768 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('❌ Camera permission denied or not supported.');
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 800;
    canvas.height = video.videoHeight || 600;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const capturedFile = new File([blob], `photo-${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          stopCamera();
          setFile(capturedFile);
          router.push(`/${cafeId}/preview`);
        }
      },
      'image/jpeg',
      0.6
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    router.push(`/${cafeId}/preview`);
    e.target.value = '';
  };

  return (
    <div className={styles.heroContainer}>
      <div className={styles.contentWrapper}>
        <div className={styles.header}>
          <h1 className={styles.title}>{cafeData?.name || 'QR PRINT'}</h1>
          <p className={styles.subtitle}>Upload &bull; Crop &bull; Print</p>
        </div>

        {error && <div style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem' }}>{error}</div>}

        <div className={styles.actions}>
          <div className={styles.uploadContainer}>
            <input
              ref={docInputRef}
              type="file"
              className="visually-hidden"
              accept=".pdf,.png,.jpg,.jpeg,image/*"
              onChange={handleFileChange}
            />
            <Button variant="primary" size="large" fullWidth onClick={() => docInputRef.current?.click()}>
              <UploadCloud size={18} /> Upload Document
            </Button>
          </div>

          <div className={styles.uploadContainer}>
            <Button variant="secondary" size="large" fullWidth onClick={() => startCamera(false)}>
              <Camera size={18} /> Take Photo
            </Button>
          </div>
        </div>
      </div>

      {/* IN-APP CAMERA MODAL OVERLAY */}
      {isCameraOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: 20 }}>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={stopCamera} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '50%', width: 40, height: 40 }}><X size={20} /></button>
            <button onClick={() => { setIsFacingUser(!isFacingUser); startCamera(!isFacingUser); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '50%', width: 40, height: 40 }}><RefreshCw size={20} /></button>
          </div>

          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: '70vh', objectFit: 'cover', borderRadius: 12 }} />

          <button onClick={capturePhoto} style={{ width: 70, height: 70, borderRadius: '50%', backgroundColor: '#fff', border: '4px solid #ccc', cursor: 'pointer', marginBottom: 20 }} />
        </div>
      )}
    </div>
  );
}