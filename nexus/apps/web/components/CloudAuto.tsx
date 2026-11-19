'use client';
import { useEffect } from 'react';
import { LOCAL } from '@/lib/local';
import { startAutoSync } from '@/lib/cloud';
export default function CloudAuto() { useEffect(() => { if (LOCAL) startAutoSync(); }, []); return null; }
