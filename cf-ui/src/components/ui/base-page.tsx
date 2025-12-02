'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import React, {ReactNode, useMemo} from 'react';
import {cn} from '@/lib/utils';

export const BasePage: React.FC<React.PropsWithChildren<BasePageProps>> = ({
  tabs,
  title,
  description,
  children,
  callToAction,
  breadcrumbs,
  useBreadcrumbs,
  customDescription,
  customInfo,
  titleClassName,
  descriptionClassName,
  kind = 'primary'
}) => {
  const pathname = usePathname();

  const isSelected = useMemo(
    () => (path: string) => {
      return pathname?.startsWith(path) || false;
    },
    [pathname]
  );

  return (
    <div className="flex flex-col gap-3">
      {useBreadcrumbs && breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex" aria-label="Breadcrumb">
          <ol className="inline-flex items-center space-x-1 md:space-x-3">
            {breadcrumbs.map((breadcrumb, index) =>
              breadcrumb.active ? (
                <li key={index} className="inline-flex items-center">
                  <span className="text-sm font-semibold text-foreground">{breadcrumb.text}</span>
                </li>
              ) : (
                <li key={index} className="inline-flex items-center">
                  <Link href={breadcrumb.link} className="text-sm hover:underline text-muted-foreground">
                    {breadcrumb.text}
                  </Link>
                  {index < breadcrumbs.length - 1 && <span className="mx-2 text-muted-foreground">/</span>}
                </li>
              )
            )}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-2 justify-between flex-wrap">
        <div className="flex flex-row gap-2 justify-between flex-wrap items-center mb-8">
          <div className="pb-2 space-y-1">
            {title && <h1 className={titleClassName ? cn(titleClassName) : 'page-title'}>{title}</h1>}
            {description && <p className={descriptionClassName ? cn(descriptionClassName) : 'page-description'}>{description}</p>}
            {customDescription && <>{customDescription}</>}
          </div>
          {callToAction && <div>{callToAction}</div>}
        </div>
        {customInfo && <>{customInfo}</>}
        {tabs && tabs.length > 0 && (
          <div className="border-b border-border">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab, index) => (
                <Link
                  key={index}
                  href={tab.link}
                  className={cn(
                    'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm min-w-20 flex justify-center',
                    isSelected(tab.link)
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                    tab.disable && 'opacity-50 pointer-events-none'
                  )}
                  aria-disabled={tab.disable}
                >
                  {tab.title}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
};

interface TabItem {
  link: string;
  disable?: boolean;
  title: string;
}

interface BreadcrumbItem {
  link: string;
  text: ReactNode;
  active?: boolean;
}

interface BasePageProps {
  tabs?: TabItem[];
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
