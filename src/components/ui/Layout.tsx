import React from 'react';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
