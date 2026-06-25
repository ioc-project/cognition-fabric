// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Button} from '@/components/ui/button';
import {AlertTriangle} from 'lucide-react';
import Link from 'next/link';
import React from 'react';

const NotFound: React.FC = () => {
  const primaryHref = '/workspaces';

  return (
    <div className="border rounded-lg p-6">
      <div className="flex flex-col gap-2 items-center justify-center">
        <div>
          <div className="p-3 inline-flex items-center align-center rounded-full">
            <AlertTriangle className="w-10 h-10" />
          </div>
        </div>
        <h1 className="font-bold">404: Page not found</h1>
        <p>Sorry, we can&apos;t find the page you&apos;re looking for. It might have been removed or renamed, or maybe it never existed.</p>
        <Link href={primaryHref} className="mt-3">
          <Button asChild>
            <span>Go to Workspaces</span>
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
