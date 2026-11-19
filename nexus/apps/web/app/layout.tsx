import './globals.css';
import type { Metadata, Viewport } from 'next';
import RegisterSW from '@/components/RegisterSW';
import CloudAuto from '@/components/CloudAuto';
export const metadata: Metadata = { title: 'NEXUS NAMIBIA', description: 'Empowering Enterprise. Connecting Capital. Building Namibia.', manifest: '/manifest.webmanifest', icons: { icon: '/brand/emblem-32.png', apple: '/brand/emblem-180.png' } };
export const viewport: Viewport = { themeColor: '#07111F', width: 'device-width', initialScale: 1 };
export default function Root({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}<RegisterSW /><CloudAuto /></body></html>; }
