import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import PlatformBoundary from './platform-boundary';

export const metadata: Metadata = {
  title: 'سوق بنغازي للسيارات',
  description: 'منصة بنغازية لبيع وشراء السيارات والمزادات الإلكترونية',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body><PlatformBoundary>{children}</PlatformBoundary></body>
    </html>
  );
}
