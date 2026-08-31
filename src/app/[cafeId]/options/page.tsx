'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { ArrowLeft } from 'lucide-react';

export default function OptionsPage({ params }: { params: Promise<{ cafeId: string }> }) {
  const router = useRouter();
  const { file, items, colorMode, setColorMode, copies, setCopies, selectedPages, setSelectedPages, totalPages } = usePrintJob();
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
      });
  }, [cafeId]);

  // Session guard: Agar file null ho toh home page par bhej dein
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

  if (!file) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', gap: '1rem' }}>
        <h3 style={{ color: '#e53e3e' }}>Session Expired or File Missing</h3>
        <p style={{ color: '#666' }}>Kripya wapas jakar dubara file select karein.</p>
        <button 
          onClick={() => router.replace(`/${cafeId}`)}
          style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Go Back Home
        </button>
      </div>
    );
  }

  // Helper function to calculate total pages safely (Fixed Brackets & Logic)
  const calculatePageCount = (rangeStr: string) => {
    if (!rangeStr || rangeStr.trim() === '') {
      return 1;
    }
    if (rangeStr.toLowerCase() === 'all') {
      return totalPages; // Asli PDF ke total pages
    }
    
    let count = 0;
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          count += (end - start + 1);
        }
      } else {
        const pageNum = Number(trimmed);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
          count += 1;
        }
      }
    }
    return count > 0 ? count : 1;
  };

  const pageCount = calculatePageCount(selectedPages);

  const handleCopiesChange = (delta: number) => {
    setCopies(Math.max(1, Math.min(100, copies + delta)));
  };

  const totalAmount = Number(pageCount) * Number(copies) * Number(prices[colorMode as keyof typeof prices] || 2);

  const uploadAndCreateJob = async () => {
    const formData = new FormData();

    formData.append('cafeId', cafeId);
    formData.append('fileName', items[0]?.file.name || 'document.png');
    formData.append('fileType', items[0]?.file.type || 'image/png');
    formData.append('pageCount', String(pageCount));
    formData.append('selectedPages', selectedPages || 'all');
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
      console.error("Server Job Error Details:", jobErrData);
      throw new Error(jobErrData.error || jobErrData.message || 'Job submission failed');
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
        {/* Page Range Selection Option with Quick Presets */}
        <div className={styles.optionGroup}>
          <h3 className={styles.optionTitle}>Pages to Print</h3>
          <input 
            type="text" 
            value={selectedPages} 
            onChange={(e) => setSelectedPages(e.target.value)}
            placeholder="e.g. 1-3, 2,4" 
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
              outline: 'none',
              marginBottom: '0.5rem'
            }}
          />
          
          {/* Quick Preset Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSelectedPages('all')}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: selectedPages === 'all' ? 'var(--primary)' : 'var(--background)',
                color: selectedPages === 'all' ? '#fff' : 'var(--foreground)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              All Pages
            </button>

            <button
              type="button"
              onClick={() => setSelectedPages('1')}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: selectedPages === '1' ? 'var(--primary)' : 'var(--background)',
                color: selectedPages === '1' ? '#fff' : 'var(--foreground)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              1st Page Only
            </button>

            <button
              type="button"
              onClick={() => setSelectedPages('')}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--muted)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Clear
            </button>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
            Tip: Specific pages ke liye comma lagayein (jaise: <b>2, 4</b> ya <b>1-3</b>).
          </p>
        </div>

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
          <span>Selected Pages</span><span>{pageCount}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Copies</span><span>{copies}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.totalRow}`}>
          <span>Total</span><span>₹{totalAmount}</span>
        </div>
      </Card>
      
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.footer} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* 👈 Yeh raha naya Back button */}
        <Button 
          variant="secondary" 
          size="large" 
          fullWidth 
          onClick={() => router.push(`/${cafeId}/preview`)} 
          disabled={isSubmitting}
          style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}
        >
          <ArrowLeft size={16} /> Back to Preview
        </Button>
        <Button variant="primary" size="large" fullWidth onClick={handleCashSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Print Request'}
        </Button>
        

        <p style={{ textAlign: 'center', marginTop: '0.25rem' }}>Please pay cash at the counter before printing.</p>
      </div>
    </Layout>
  );
}