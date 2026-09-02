'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pusher from 'pusher-js';

interface PusherListenerProps {
  cafeId: string;
}

export default function PusherListener({ cafeId }: PusherListenerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!cafeId) return;

    // 1. Preload Audio
    const audio = new Audio('/notification.mp3');

    // 2. Initialize Pusher
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe(`cafe-${cafeId}`);

    // 3. Listen for new jobs
    channel.bind('new-print-job', (data: any) => {
      window.dispatchEvent(new CustomEvent('qr-print-notification', { detail: data }));

      // Play sound only when the admin has enabled sound alerts.
      if (window.localStorage.getItem('qr-print-sound-enabled') !== 'false') {
        audio.currentTime = 0;
        audio.play().catch((err) => {
          console.warn('Audio play waiting for first user click:', err.message);
        });
      }

      // 🔔 Desktop Push Notification (Jab tab hidden ya unfocused ho)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 New Print Order!', {
          body: `Job #${data.jobNumber || 'New'} - ₹${data.totalAmount || 0}`,
          icon: '/favicon.ico',
        });
      }

      // Revalidate UI state
      router.refresh();
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`cafe-${cafeId}`);
      pusher.disconnect();
    };
  }, [cafeId, router]);

  return null;
}