'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, Trash2, X } from 'lucide-react';
import styles from './NotificationCenter.module.css';

interface StoredNotification {
  id: string;
  jobNumber: string;
  totalAmount: number;
  createdAt: string;
  read: boolean;
}

const STORAGE_KEY = 'qr-print-admin-notifications';

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setNotifications(JSON.parse(stored));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ jobNumber?: string; totalAmount?: number }>).detail;
      const nextNotification: StoredNotification = {
        id: `${Date.now()}-${detail?.jobNumber || 'job'}`,
        jobNumber: detail?.jobNumber || 'New print order',
        totalAmount: Number(detail?.totalAmount || 0),
        createdAt: new Date().toISOString(),
        read: false,
      };

      setNotifications((current) => {
        const next = [nextNotification, ...current].slice(0, 50);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    };

    window.addEventListener('qr-print-notification', handleNotification);
    return () => window.removeEventListener('qr-print-notification', handleNotification);
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const markAllRead = () => {
    setNotifications((current) => {
      const next = current.map((notification) => ({ ...notification, read: true }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearNotifications = () => {
    setNotifications([]);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.bellButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Open notifications"
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className={styles.count}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.panelHeader}>
            <strong>Notifications</strong>
            <div className={styles.panelActions}>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} aria-label="Mark all notifications as read" title="Mark all as read">
                  <Check size={16} />
                </button>
              )}
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close notifications" title="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className={styles.empty}>No notifications yet.</p>
          ) : (
            <div className={styles.list}>
              {notifications.map((notification) => (
                <div key={notification.id} className={`${styles.item} ${!notification.read ? styles.unread : ''}`}>
                  <div>
                    <strong>{notification.jobNumber}</strong>
                    <p>New print order · ₹{notification.totalAmount}</p>
                    <time dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString('en-IN')}</time>
                  </div>
                </div>
              ))}
            </div>
          )}

          {notifications.length > 0 && (
            <button type="button" className={styles.clearButton} onClick={clearNotifications}>
              <Trash2 size={15} /> Clear notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
}
