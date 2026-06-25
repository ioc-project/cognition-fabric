// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import React, {ReactNode, useMemo} from 'react';
import {ChevronRight} from 'lucide-react';
import {cn} from '@/lib/utils';

export const BasePage: React.FC<React.PropsWithChildren<BasePageProps>> = ({
  tabs,
  activeTabKey,
  onTabChange,
  title,
  description,
  children,
  callToAction,
  breadcrumbs,
  useBreadcrumbs,
  customDescription,
  customInfo,
  titleClassName,
  descriptionClassName
}) => {
  const pathname = usePathname();

  const isSelected = useMemo(
    () => (tab: TabItem) => {
      if (onTabChange) {
        return !!activeTabKey && tab.key ? activeTabKey === tab.key : false;
      }
      return pathname?.startsWith(tab.link) || false;
    },
    [pathname, activeTabKey, onTabChange]
  );

  return (
    <div className="flex flex-col flex-1 gap-6">
      {useBreadcrumbs && breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="breadcrumb-nav" aria-label="Breadcrumb">
          <ol className="inline-flex items-center">
            {breadcrumbs.map((breadcrumb, index) =>
              breadcrumb.active ? (
                <li key={index} className="inline-flex items-center">
                  <span className="breadcrumb-active">{breadcrumb.text}</span>
                </li>
              ) : (
                <React.Fragment key={index}>
                  <li className="inline-flex items-center">
                    <Link href={breadcrumb.link} className="breadcrumb-link">
                      {breadcrumb.text}
                    </Link>
                  </li>
                  {index < breadcrumbs.length - 1 && (
                    <li className="inline-flex items-center" aria-hidden="true">
                      <ChevronRight className="breadcrumb-separator" />
                    </li>
                  )}
                </React.Fragment>
              )
            )}
          </ol>
        </nav>
      )}

      <div className="w-full flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col justify-center items-start gap-2">
            {title && <h1 className={titleClassName ? cn(titleClassName) : 'page-title'}>{title}</h1>}
            {description && <p className={descriptionClassName ? cn(descriptionClassName) : 'page-description'}>{description}</p>}
            {customDescription && <>{customDescription}</>}
          </div>
          {callToAction && <div>{callToAction}</div>}
        </div>
        {customInfo && <>{customInfo}</>}
        {tabs && tabs.length > 0 && (
          <nav className="subnav">
            {tabs.map((tab, index) => (
              <Link
                key={index}
                href={tab.link}
                className={cn('subnav__item', isSelected(tab) ? 'subnav__item--active' : '', tab.disable && 'opacity-50 pointer-events-none')}
                onClick={(e) => {
                  if (onTabChange && tab.key) {
                    e.preventDefault();
                    onTabChange(tab.key);
                  }
                }}
                aria-disabled={tab.disable}
              >
                {tab.title}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="flex flex-col flex-1 min-h-0 gap-6 mt-6">{children}</div>
    </div>
  );
};

interface TabItem {
  link: string;
  disable?: boolean;
  key?: string;
  title: string;
}

interface BreadcrumbItem {
  link: string;
  text: ReactNode;
  active?: boolean;
}

interface BasePageProps {
  tabs?: TabItem[];
  activeTabKey?: string;
  onTabChange?: (key: string) => void;
  useBreadcrumbs?: boolean;
  breadcrumbs?: BreadcrumbItem[];
  title?: string;
  description?: string;
  customDescription?: ReactNode;
  callToAction?: ReactNode;
  customInfo?: ReactNode;
  kind?: 'primary' | 'secondary';
  titleClassName?: string;
  descriptionClassName?: string;
}
