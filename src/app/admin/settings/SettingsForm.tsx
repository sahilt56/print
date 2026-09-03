'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';
import { Upload, Save, Image as ImageIcon, IndianRupee } from 'lucide-react';

interface SettingsFormProps {
  initialBw: number;
  initialColor: number;
  initialLogoUrl?: string | null;
  initialBackgroundImageUrl?: string | null;
}

export function SettingsForm({ initialBw, initialColor, initialLogoUrl, initialBackgroundImageUrl }: SettingsFormProps) {
  const [bwPrice, setBwPrice] = useState(initialBw.toString());
  const [colorPrice, setColorPrice] = useState(initialColor.toString());
  const [logoUrl, setLogoUrl] = useState<string>(initialLogoUrl || '');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(initialBackgroundImageUrl || '');
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 300;
          const scaleFactor = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleFactor;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
            setLogoUrl(compressedBase64);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackgroundImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for the background.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Background image must be smaller than 10MB.');
      return;
    }
    setBackgroundImageFile(file);
    setBackgroundImageUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      let body: FormData | string;
      if (backgroundImageFile) {
        const formData = new FormData();
        body = formData;
        formData.append('bw', bwPrice);
        formData.append('color', colorPrice);
        formData.append('logoUrl', logoUrl);
        formData.append('backgroundImage', backgroundImageFile);
      } else {
        body = JSON.stringify({
          bw: Number(bwPrice),
          color: Number(colorPrice),
          logoUrl,
        });
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        ...(backgroundImageFile ? {} : { headers: { 'Content-Type': 'application/json' } }),
        body,
      });

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      setMessage('Settings & Branding updated successfully!');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.inputGroup}>
        <label htmlFor="logoUpload" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ImageIcon size={16} /> Cafe Logo (MongoDB)
        </label>
        {logoUrl && (
          <div className={styles.logoPreviewWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Cafe Logo Preview" className={styles.logoPreview} />
          </div>
        )}
        <input
          id="logoUpload"
          type="file"
          accept="image/png, image/jpeg, image/webp"
          onChange={handleLogoUpload}
          className={styles.input}
        />
        <p className={styles.fieldNote}>Logo MongoDB me save hoga aur customer page par alag logo ke roop me dikhega.</p>
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="backgroundImageUpload" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ImageIcon size={16} /> Background Banner (Cloudinary)
        </label>
        {backgroundImageUrl && (
          <div className={styles.logoPreviewWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backgroundImageUrl} alt="Background preview" className={styles.logoPreview} />
          </div>
        )}
        <input
          id="backgroundImageUpload"
          type="file"
          accept="image/png, image/jpeg, image/webp"
          onChange={handleBackgroundImageUpload}
          className={styles.input}
        />
        <p className={styles.fieldNote}>Banner Cloudinary me save hoga aur customer page ka background banega.</p>
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="bwPrice" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IndianRupee size={16} /> Black &amp; White Price (₹)
        </label>
        <input
          id="bwPrice"
          type="number"
          min="1"
          step="0.5"
          value={bwPrice}
          onChange={(e) => setBwPrice(e.target.value)}
          required
          className={styles.input}
        />
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="colorPrice" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IndianRupee size={16} /> Color Price (₹)
        </label>
        <input
          id="colorPrice"
          type="number"
          min="1"
          step="0.5"
          value={colorPrice}
          onChange={(e) => setColorPrice(e.target.value)}
          required
          className={styles.input}
        />
      </div>

      {message && <p className={styles.success}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.submitContainer}>
        <Button variant="primary" type="submit" disabled={isLoading}>
          <Save size={16} /> {isLoading ? 'Saving...' : 'Save All Settings'}
        </Button>
      </div>
    </form>
  );
}