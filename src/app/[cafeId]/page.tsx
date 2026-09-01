
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { UploadCloud, Camera } from 'lucide-react';

interface CafeDetails {
  name?: string;
  logoUrl?: string | null;
}

/**
 * Memory-efficient image compression.
 *
 * Important:
 * We DO NOT use FileReader.readAsDataURL().
 * Large camera photos can consume a lot of RAM when converted
 * into a base64 Data URL.
 */
async function compressImage(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = new Image();

    img.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error('Unable to load image for compression.'));
      img.src = objectUrl;
    });

    const MAX_WIDTH = 1600;
    const MAX_HEIGHT = 1600;

    let width = img.naturalWidth;
    let height = img.naturalHeight;

    if (!width || !height) {
      throw new Error('Invalid image dimensions.');
    }

    // Keep aspect ratio while reducing resolution.
    const scale = Math.min(
      1,
      MAX_WIDTH / width,
      MAX_HEIGHT / height
    );

    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: false,
    });

    if (!ctx) {
      throw new Error('Unable to create canvas context.');
    }

    // Better image quality while resizing.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, 0, 0, width, height);

    // Release image resources as soon as possible.
    img.src = '';

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Image compression failed.'));
            return;
          }

          resolve(result);
        },
        'image/jpeg',
        0.75
      );
    });

    // Release canvas memory.
    canvas.width = 1;
    canvas.height = 1;

    return new File(
      [blob],
      `${file.name.replace(/\.[^/.]+$/, '')}.jpg`,
      {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function CafeLandingPage({
  params,
}: {
  params: Promise<{ cafeId: string }>;
}) {
  const router = useRouter();
  const { setFile } = usePrintJob();

  const { cafeId } = React.use(params);

  const [cafeData, setCafeData] = useState<CafeDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchCafeDetails() {
      try {
        const response = await fetch(`/api/cafe/${cafeId}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to load cafe details.');
        }

        const data = await response.json();

        if (isMounted) {
          setCafeData(data);
        }
      } catch (err) {
        console.warn('Could not load cafe details:', err);

        if (isMounted) {
          setCafeData(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (cafeId) {
      fetchCafeDetails();
    }

    return () => {
      isMounted = false;
    };
  }, [cafeId]);

  /**
   * Common file processing function.
   */
  const processFile = async (selectedFile: File) => {
    if (!selectedFile) return;

    setError('');
    setIsProcessing(true);

    try {
      // --------------------------------------------------
      // 1. Validate file type
      // --------------------------------------------------

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
      ];

      const isValidType =
        allowedTypes.includes(selectedFile.type) ||
        selectedFile.name.toLowerCase().endsWith('.jpg') ||
        selectedFile.name.toLowerCase().endsWith('.jpeg') ||
        selectedFile.name.toLowerCase().endsWith('.png') ||
        selectedFile.name.toLowerCase().endsWith('.pdf');

      if (!isValidType) {
        setError(
          '❌ Invalid file format! Please choose only PDF, JPG, or PNG files. (Galat file format hai! Kripya sirf PDF, JPG ya PNG file select karein.)'
        );

        return;
      }

      // --------------------------------------------------
      // 2. Validate original file size
      // --------------------------------------------------

      const MAX_SIZE = 10 * 1024 * 1024;

      if (selectedFile.size > MAX_SIZE) {
        setError(
          '⚠️ File is too large! Please select a file under 10MB. (File ka size 10MB se bada hai! Kripya 10MB se kam size ki file chunein.)'
        );

        return;
      }

      let finalFile = selectedFile;

      // --------------------------------------------------
      // 3. Compress images
      // --------------------------------------------------

      if (selectedFile.type.startsWith('image/')) {
        try {
          finalFile = await compressImage(selectedFile);
        } catch (compressionError) {
          console.warn(
            'Image compression failed:',
            compressionError
          );

          setError(
            '⚠️ Unable to process this photo. Please try taking another photo with lower resolution.'
          );

          return;
        }
      }

      // --------------------------------------------------
      // 4. Final safety check
      // --------------------------------------------------

      if (finalFile.size > MAX_SIZE) {
        setError(
          '⚠️ Processed image is still too large. Please take another photo or select a smaller image.'
        );

        return;
      }

      // --------------------------------------------------
      // 5. Save file
      // --------------------------------------------------

      setFile(finalFile);

      // --------------------------------------------------
      // 6. Navigate to preview
      // --------------------------------------------------

      router.push(`/${cafeId}/preview`);
    } catch (err) {
      console.error('File processing error:', err);

      setError(
        '❌ Something went wrong while processing the file. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    await processFile(selectedFile);

    // Allow selecting the same file again.
    e.target.value = '';
  };

  const handleUploadClick = () => {
    setError('');
    uploadInputRef.current?.click();
  };

  const handleCameraClick = () => {
    setError('');
    cameraInputRef.current?.click();
  };

  return (
    <div className={styles.heroContainer}>
      {/* Background */}
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
        {/* Header */}
        <div className={styles.header}>
          {cafeData?.logoUrl && (
            <div
              style={{
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cafeData.logoUrl}
                alt="Cafe Logo"
                className={styles.logoImage}
              />
            </div>
          )}

          {isLoading ? (
            <h1 className={styles.titleLoader}>
              Loading...
            </h1>
          ) : (
            <h1 className={styles.title}>
              {cafeData?.name || 'QR PRINT'}
            </h1>
          )}

          <p className={styles.subtitle}>
            Upload &bull; Crop &bull; Print
          </p>
        </div>

        {/* Error */}
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
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {/* Upload Document */}
          <div className={styles.uploadContainer}>
            <input
              ref={uploadInputRef}
              type="file"
              id="upload-doc"
              className="visually-hidden"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={handleFileChange}
              disabled={isProcessing}
            />

            <Button
              variant="primary"
              size="large"
              fullWidth
              onClick={handleUploadClick}
              disabled={isProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <UploadCloud size={18} />

              {isProcessing
                ? 'Processing...'
                : 'Upload Document'}
            </Button>
          </div>

          {/* Camera */}
          <div className={styles.uploadContainer}>
            <input
              ref={cameraInputRef}
              type="file"
              id="take-photo"
              className="visually-hidden"
              accept="image/jpeg,image/png"
              capture="environment"
              onChange={handleFileChange}
              disabled={isProcessing}
            />

            <Button
              variant="secondary"
              size="large"
              fullWidth
              onClick={handleCameraClick}
              disabled={isProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Camera size={18} />

              {isProcessing
                ? 'Processing...'
                : 'Take Photo'}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p>
            Supported: PDF, JPG, PNG (Max 10MB)
          </p>
        </div>
      </div>
    </div>
  );
}

