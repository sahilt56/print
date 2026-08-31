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

  useEffect(() => {
    if (!isSubmitting) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSubmitting]);

  if (!file) return null;

  const pageCount = 1; 

  const handleCopiesChange = (delta: number) => {
    setCopies(Math.max(1, Math.min(100, copies + delta)));
  };

  const totalAmount = pageCount * copies * prices[colorMode as keyof typeof prices];

  const uploadAndCreateJob = async () => {
    const formData = new FormData();

    formData.append('cafeId', cafeId);
    formData.append('fileName', items[0]?.file.name || 'document.png');
    formData.append('fileType', items[0]?.file.type || 'image/png');
    formData.append('pageCount', String(pageCount));
    formData.append('selectedPages', selectedPages);
    formData.append('colorMode', colorMode);
    formData.append('paperSize', 'A4');
    formData.append('copies', String(copies));
    formData.append('paymentMethod', 'cash');
    formData.append(
      'layout',
      JSON.stringify(
        items.map((item) => ({
          id: item.id,
          xPercent: (item.pos.x / 380) * 100,
          yPercent: (item.pos.y / 537.4) * 100,
          widthPercent: (item.size.width / 380) * 100,
          heightPercent: (item.size.height / 537.4) * 100,
        }))
      )
    );

    items.forEach((item) => {
      formData.append('files', item.file);
    });

    const jobRes = await fetch('/api/jobs', {
      method: 'POST',
      body: formData,
    });

    if (!jobRes.ok) {
      const jobErrData = await jobRes.json().catch(() => ({}));
      throw new Error(jobErrData.error || 'Job submission failed');
    }

    return await jobRes.json();
  };

  const handleCashSubmit = async () => {
    if (isSubmitting) return;

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