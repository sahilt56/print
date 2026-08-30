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
  const { file, colorMode, setColorMode, copies, setCopies, selectedPages } = usePrintJob();
  const { cafeId } = React.use(params);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [prices, setPrices] = useState({ bw: 2, color: 10 });

  useEffect(() => {
    fetch(`/api/cafe/${cafeId}`)
      .then(res => res.json())
      .then(data => {
        if (data.pricing) setPrices(data.pricing);
      })
      .catch(console.error);
  }, [cafeId]);

  useEffect(() => {
    if (!file) {
      router.replace(`/${cafeId}`);
    }
  }, [file, router, cafeId]);

  if (!file) return null;

  const pageCount = file.type.startsWith('image/') ? 1 : 1; 

  const handleCopiesChange = (delta: number) => {
    setCopies(Math.max(1, Math.min(100, copies + delta)));
  };

  const totalAmount = pageCount * copies * prices[colorMode as keyof typeof prices];

  const uploadAndCreateJob = async () => {
    // 1. Upload File
    const formData = new FormData();
    formData.append('file', file);
    
    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadRes.ok) throw new Error('File upload failed');
    const { fileUrl, fileName } = await uploadRes.json();

    // 2. Submit Job
    const jobRes = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cafeId,
        fileUrl,
        fileName,
        fileType: file.type,
        pageCount,
        selectedPages,
        colorMode,
        paperSize: 'A4',
        copies,
        paymentMethod: 'cash',
      }),
    });

    if (!jobRes.ok) throw new Error('Job submission failed');
    return await jobRes.json();
  };

  const handleCashSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const { jobId } = await uploadAndCreateJob();
      router.push(`/${cafeId}/status/${jobId}`);
    } catch (err) {
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
              ⚫ B&W
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
