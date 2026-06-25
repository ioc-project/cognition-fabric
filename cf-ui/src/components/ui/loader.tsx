// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import React from 'react';
import {Loader2} from 'lucide-react';
import {cn} from '@/lib/utils';

export interface LoaderProps extends React.SVGProps<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg';
}

export const Loader: React.FC<LoaderProps> = ({size = 'md', className, ...props}) => {
  const sizeClass = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  }[size];

  return <Loader2 className={cn('animate-spin text-[hsl(var(--sidebar-text-active))]', sizeClass, className)} {...props} />;
};
