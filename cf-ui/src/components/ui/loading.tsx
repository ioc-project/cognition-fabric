// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Loader} from './loader';
import {cn} from '@/lib/utils';

export interface LoadingProps {
  style?: React.CSSProperties;
  classNameLoader?: string;
  useOverlay?: boolean;
}

export const Loading = () => {
  return (
    <div className="flex items-center justify-center h-screen">
      <Loader size="lg" />
    </div>
  );
};

export const LoaderRelative = ({className}: {className?: string}) => {
  return (
    <div className={cn('flex justify-center items-center w-full', className)}>
      <Loader size="lg" className="w-16 h-16" />
    </div>
  );
};
