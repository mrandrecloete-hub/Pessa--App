'use client';
import { useEffect } from 'react';
import { LOCAL } from '@/lib/local';
export default function RegisterSW() {
  useEffect(() => { if (LOCAL && 'serviceWorker' in navigator && !/NexusAndroid/.test(navigator.userAgent)) navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  return null;
}
