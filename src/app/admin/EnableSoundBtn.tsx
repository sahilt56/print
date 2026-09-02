'use client';

import { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export default function EnableSoundBtn() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(window.localStorage.getItem('qr-print-sound-enabled') !== 'false');
  }, []);

  const enableAudioAndNotifications = () => {
    const nextEnabled = !enabled;
    window.localStorage.setItem('qr-print-sound-enabled', String(nextEnabled));
    setEnabled(nextEnabled);

    if (nextEnabled) {
      const audio = new Audio('/notification.mp3');
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  };

  return (
    <button 
      onClick={enableAudioAndNotifications}
      style={{
        padding: '0.5rem 1rem',
        background: enabled ? '#dcfce7' : '#fee2e2',
        color: enabled ? '#166534' : '#991b1b',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
      Sound {enabled ? 'On' : 'Off'}
    </button>
  );
}