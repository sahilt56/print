import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
  size?: 'normal' | 'large';
  icon?: React.ReactNode;
}

export function Button({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  size = 'normal',
  icon,
  className,
  ...props 
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    fullWidth ? styles.fullWidth : '',
    className || ''
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </button>
  );
}
