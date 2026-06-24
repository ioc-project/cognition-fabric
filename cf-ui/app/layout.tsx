// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import type {Metadata} from 'next';
import {Inter} from 'next/font/google';
import '../src/styles/index.css';
import '../src/styles/day-picker.css';
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
    <html lang="en" suppressHydrationWarning className="">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('ioc-cfn-mgmt-plane-ui-theme-store');
                  if (stored) {
                    var theme = JSON.parse(stored).state.theme;
                    if (theme === 'dark') {
                      document.documentElement.classList.add('dark');
                    }
                  }
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
