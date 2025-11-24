import type {Metadata} from 'next';
import {Inter} from 'next/font/google';
import '../src/styles/index.css';
import {Providers} from '@/providers/providers';
import {Toaster} from '@/components/ui/sonner';

const inter = Inter({subsets: ['latin']});

export const metadata: Metadata = {
  title: {
    default: 'CSP UI Service',
    template: '%s | CSP UI Service'
  },
  description: 'CSP UI Service',
  keywords: ['cp', 'service']
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
