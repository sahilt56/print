'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Loader2, Camera, Images, X } from 'lucide-react';

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
  const [isUploadPickerOpen, setIsUploadPickerOpen] = useState(false);
  const [isWebcamOpen, setIsWebcamOpen] = useState(false);

  // 🛡️ Strict 0ms Lock Guard (Double click crash block)
  const isProcessingRef = useRef<boolean>(false);

  const docInputRef = useRef<HTMLInputElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const closeWebcam = () => {
    webcamStreamRef.current?.getTracks().forEach((track) => track.stop());
    webcamStreamRef.current = null;
    setIsWebcamOpen(false);
  };

  useEffect(() => closeWebcam, []);

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

  const processSelectedFile = async (selectedFile: File) => {
    // 🛡️ Drop duplicate clicks at 0ms
    if (isProcessingRef.current) {
      return;
    }

    // 🛑 12 MB Size Limit Check
    if (selectedFile.size > 12 * 1024 * 1024) {
      setError('❌ File size must be less than 12 MB. Please choose a smaller file.');
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setError('');

    const rawFile = selectedFile;
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    e.target.value = '';
    if (selectedFile) await processSelectedFile(selectedFile);
  };

  const openWebcam = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Webcam is not supported in this browser. Please use the media picker.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      webcamStreamRef.current = stream;
      setIsWebcamOpen(true);
      requestAnimationFrame(() => {
        if (webcamVideoRef.current) webcamVideoRef.current.srcObject = stream;
      });
    } catch (webcamError) {
      console.error('Webcam permission error:', webcamError);
      setError('Camera permission nahi mili. Browser settings me camera allow karke dobara try karein.');
    }
  };

  const captureWebcamImage = async () => {
    const video = webcamVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) return;
    closeWebcam();
    await processSelectedFile(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
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
                setIsUploadPickerOpen(true);
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

        {isUploadPickerOpen && (
          <div role="dialog" aria-modal="true" aria-labelledby="upload-source-title" style={modalBackdropStyle} onClick={() => setIsUploadPickerOpen(false)}>
            <div style={sourceDialogStyle} onClick={(event) => event.stopPropagation()}>
              <div style={dialogHeaderStyle}>
                <h2 id="upload-source-title" style={{ margin: 0, fontSize: '1rem' }}>Upload document from</h2>
                <button type="button" aria-label="Close upload picker" onClick={() => setIsUploadPickerOpen(false)} style={closeButtonStyle}><X size={19} /></button>
              </div>
              <div style={sourceGridStyle}>
                <button type="button" onClick={() => { setIsUploadPickerOpen(false); openWebcam(); }} style={sourceButtonStyle}><Camera size={22} />Camera</button>
                <button type="button" onClick={() => { setIsUploadPickerOpen(false); docInputRef.current?.click(); }} style={sourceButtonStyle}><Images size={22} />Media picker</button>
              </div>
            </div>
          </div>
        )}

        {isWebcamOpen && (
          <div role="dialog" aria-modal="true" aria-labelledby="upload-webcam-title" style={webcamBackdropStyle}>
            <div style={webcamDialogStyle}>
              <div style={{ ...dialogHeaderStyle, color: '#fff' }}>
                <h2 id="upload-webcam-title" style={{ margin: 0, fontSize: '1rem' }}>Camera</h2>
                <button type="button" aria-label="Close camera" onClick={closeWebcam} style={{ ...closeButtonStyle, color: '#fff' }}><X size={21} /></button>
              </div>
              <video ref={webcamVideoRef} autoPlay muted playsInline style={videoStyle} />
              <Button variant="primary" size="large" fullWidth onClick={captureWebcamImage} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><Camera size={18} />Capture photo</Button>
            </div>
          </div>
        )}
    </div>
  );
}

  const modalBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem', background: 'rgba(15, 23, 42, 0.45)' };
  const sourceDialogStyle: React.CSSProperties = { width: 'min(100%, 380px)', padding: '1rem', borderRadius: 14, background: 'var(--background, #fff)', boxShadow: '0 20px 40px rgba(15, 23, 42, 0.22)' };
  const dialogHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' };
  const closeButtonStyle: React.CSSProperties = { border: 0, background: 'transparent', cursor: 'pointer', padding: 4 };
  const sourceGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' };
  const sourceButtonStyle: React.CSSProperties = { minHeight: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid var(--border, #cbd5e1)', borderRadius: 10, background: 'var(--background, #fff)', color: 'var(--foreground, #0f172a)', fontSize: 14, cursor: 'pointer' };
  const webcamBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: '#0f172a' };
  const webcamDialogStyle: React.CSSProperties = { width: 'min(100%, 520px)', display: 'grid', gap: '0.8rem' };
  const videoStyle: React.CSSProperties = { width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 12, background: '#000' };