import './globals.css';
import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = { title: 'NEXUS NAMIBIA', description: 'Empowering Enterprise. Connecting Capital. Building Namibia.', icons: { icon: '/brand/emblem-32.png', apple: '/brand/emblem-180.png' } };
export const viewport: Viewport = { themeColor: '#07111F', width: 'device-width', initialScale: 1 };
export default function Root({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
