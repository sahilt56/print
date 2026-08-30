'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';

export default function OptionsPage({ params }: { params: Promise<{ cafeId: string }> }) {
  const router = useRouter();
  const { file, items, colorMode, setColorMode, copies, setCopies, selectedPages } = usePrintJob();
  const { cafeId } = React.use(params);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState({ bw: 2, color: 10 });

  // Safe pricing fetch with fallback check
  useEffect(() => {
    if (!cafeId) return;
    fetch(`/api/cafe/${cafeId}`)
      .then(res => {
        if (!res.ok) throw new Error('Cafe route not found, using defaults');
        return res.json();
      })
      .then(data => {
        if (data && data.pricing) setPrices(data.pricing);
      })
      .catch((err) => {
        console.warn('Pricing fetch fallback:', err.message);
        // Default prices (₹2 B&W, ₹10 Color) remain active
      });
  }, [cafeId]);

  useEffect(() => {
    if (!file) {
      router.replace(`/${cafeId}`);
    }
  }, [file, router, cafeId]);

  if (!file) return null;

  const pageCount = 1; 

  const handleCopiesChange = (delta: number) => {
    setCopies(Math.max(1, Math.min(100, copies + delta)));
  };

  const totalAmount = pageCount * copies * prices[colorMode as keyof typeof prices];

  const uploadAndCreateJob = async () => {
    // 1. Upload all items in layout to /api/upload
    const uploadedItems = await Promise.all(
      items.map(async (item) => {
        const formData = new FormData();
        formData.append('file', item.file);
        
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || 'File upload failed');
        }
        
        const { fileUrl } = await uploadRes.json();

        return {
          id: item.id,
          fileUrl, // Absolute path (/uploads/...) returned from server
          xPercent: (item.pos.x / 380) * 100, // Normalized A4 Base
          yPercent: (item.pos.y / 537.4) * 100,
          widthPercent: (item.size.width / 380) * 100,
          heightPercent: (item.size.height / 537.4) * 100,
        };
      })
    );

    // 2. Submit Job with layout array to /api/jobs
    const jobRes = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cafeId,
        fileName: items[0]?.file.name || 'document.png',
        fileType: items[0]?.file.type || 'image/png',
        pageCount,
        selectedPages,
        colorMode,
        paperSize: 'A4',
        copies,
        paymentMethod: 'cash',
        layout: uploadedItems, // Send complete layout array
      }),
    });

    if (!jobRes.ok) {
      const jobErrData = await jobRes.json().catch(() => ({}));
      throw new Error(jobErrData.error || 'Job submission failed');
    }
    
    return await jobRes.json();
  };

  const handleCashSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const resData = await uploadAndCreateJob();
      const jobId = resData.jobId || resData.id;
      
      if (!jobId) {
        throw new Error('Invalid Job ID received from server');
      }

      router.push(`/${cafeId}/status/${jobId}`);
    } catch (err) {
      console.error('Submit Error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className={styles.header}>
        <h1 className={styles.title}>Print Options</h1>
      </div>

      <Card className={styles.optionsCard}>
        <div className={styles.optionGroup}>
          <h3 className={styles.optionTitle}>Color</h3>
          <div className={styles.buttonGroup}>
            <Button variant={colorMode === 'bw' ? 'primary' : 'secondary'} onClick={() => setColorMode('bw')} fullWidth>
              ⚫ B&amp;W
            </Button>
            <Button variant={colorMode === 'color' ? 'primary' : 'secondary'} onClick={() => setColorMode('color')} fullWidth>
              🌈 Color
            </Button>
          </div>
        </div>
        <div className={styles.optionGroup}>
          <h3 className={styles.optionTitle}>Copies</h3>
          <div className={styles.copiesControl}>
            <Button variant="secondary" onClick={() => handleCopiesChange(-1)}>&minus;</Button>
            <span className={styles.copiesNumber}>{copies}</span>
            <Button variant="secondary" onClick={() => handleCopiesChange(1)}>+</Button>
          </div>
        </div>
      </Card>

      <Card className={styles.summaryCard}>
        <div className={styles.summaryRow}>
          <span>Pages</span><span>{pageCount}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Copies</span><span>{copies}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.totalRow}`}>
          <span>Total</span><span>₹{totalAmount}</span>
        </div>
      </Card>
      
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.footer}>
        <Button variant="secondary" size="large" fullWidth onClick={handleCashSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Print Request'}
        </Button>
        <p style={{ textAlign: 'center', marginTop: '0.75rem' }}>Please pay cash at the counter before printing.</p>
      </div>
    </Layout>
  );
}