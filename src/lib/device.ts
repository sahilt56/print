export function isMobileOrTabletDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const isMobileOrTabletUserAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return isMobileOrTabletUserAgent || isIPadOS;
}
