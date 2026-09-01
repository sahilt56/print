'use client';

import { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';

export default function EnableSoundBtn() {
  const [enabled, setEnabled] = useState(false);

  const enableAudioAndNotifications = () => {
    // Dummy silent sound trigger to unlock browser audio context
    const audio = new Audio('/notification.mp3');
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      setEnabled(true);
    }).catch(() => {});

    // Request Browser Desktop Notification Permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  if (enabled) return null;

  return (
    <button 
      onClick={enableAudioAndNotifications}
      style={{
        padding: '0.5rem 1rem',
        background: '#e0e7ff',
        color: '#3730a3',
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
      <Volume2 size={16} /> Enable Sound Alerts
    </button>
  );
}