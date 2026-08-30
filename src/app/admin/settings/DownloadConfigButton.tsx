'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export function DownloadConfigButton() {
  const handleDownload = () => {
    // Simple anchor click to trigger the download
    const link = document.createElement('a');
    link.href = '/api/admin/config';
    link.download = 'config.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={styles.buttonRow}>
      <Button variant="primary" onClick={handleDownload}>
        ⬇️ Download config.json
      </Button>
      <p className={styles.downloadNote}>
        This file contains your personal cafe credentials. Keep it safe.
      </p>
    </div>
  );
}
