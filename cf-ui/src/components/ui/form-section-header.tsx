// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {cn} from '@/lib/utils';

interface FormSectionHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export function FormSectionHeader({title, description, className}: FormSectionHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <h2 className="text-lg font-medium leading-7 tracking-[-0.44px] text-neutral-strong dark:text-foreground">{title}</h2>
      {description && <p className="page-description">{description}</p>}
    </div>
  );
}
