'use client';

import React, {type ReactNode} from 'react';
import {AlertCircle} from 'lucide-react';

import EmptyOrErrorListState, {type EmptyOrErrorListStateProps} from '@/components/ui/empty-or-error-list-state';
import {Loader} from '@/components/ui/loader';
import {cn, parseError} from '@/lib/utils';

type UnreadyState = {
  nothingToFetch: boolean;
  fetching: boolean;
  error: boolean;
  empty: boolean;
};

export interface ConditionalSWRRendererProps {
  itemName: string;
  data: unknown;
  error: unknown;
  url?: string | null;
  children: ReactNode;
  emptyListStateProps?: Partial<EmptyOrErrorListStateProps>;
  errorListStateProps?: Partial<EmptyOrErrorListStateProps>;
  classNameContainer?: string;

  // Custom state overrides
  customIsLoading?: boolean;
  customIsEmpty?: boolean;

  // Custom component overrides
  customEmptyComponent?: ReactNode;
  customLoaderComponent?: ReactNode;
  customErrorComponent?: ReactNode;
  customNothingToFetchComponent?: ReactNode;
}

const ConditionalSWRRenderer: React.FC<ConditionalSWRRendererProps> = ({
  data,
  error,
  itemName,
  children,
  url,
  customLoaderComponent,
  customEmptyComponent,
  customErrorComponent,
  customNothingToFetchComponent,
  emptyListStateProps,
  errorListStateProps,
  classNameContainer,
  customIsLoading: isLoading,
  customIsEmpty: isEmpty = false
}) => {
  const DefaultUnreadyWrapper: React.FC<{children: ReactNode}> = ({children}) => (
    <div className={cn('flex flex-col gap-2 items-center my-12 mx-5', classNameContainer)}>{children}</div>
  );

  const defaultErrorListStateProps: EmptyOrErrorListStateProps = {
    title: <>Could not load {itemName}</>,
    description: <>{parseError(error) || String(error ?? '')}</>,
    icon: <AlertCircle className="w-12 h-12 aspect-square" />
  };

  const defaultEmptyListStateProps: EmptyOrErrorListStateProps = {
    title: <>No {itemName} found.</>
  };

  const empty = !data || (Array.isArray(data) && data.length === 0) || isEmpty;
  const unready: UnreadyState = {
    nothingToFetch: typeof url === 'string' && url.length === 0,
    fetching: isLoading ?? data === undefined,
    error: !!error,
    empty
  };

  const EmptyUI = customEmptyComponent || (
    <DefaultUnreadyWrapper>
      <EmptyOrErrorListState {...{...defaultEmptyListStateProps, ...emptyListStateProps}} />
    </DefaultUnreadyWrapper>
  );

  const ErrorUI = customErrorComponent || (
    <DefaultUnreadyWrapper>
      <EmptyOrErrorListState {...{...defaultErrorListStateProps, ...errorListStateProps}} />
    </DefaultUnreadyWrapper>
  );

  const NothingToFetchUI = customNothingToFetchComponent || (
    <DefaultUnreadyWrapper>
      <EmptyOrErrorListState title="Error loading" description="No resource locator provided." />
    </DefaultUnreadyWrapper>
  );

  const LoaderUI =
    customLoaderComponent !== undefined ? (
      customLoaderComponent
    ) : (
      <DefaultUnreadyWrapper>
        <Loader className="w-32 h-32 py-12" />
      </DefaultUnreadyWrapper>
    );

  const getUnreadyUI = () => {
    if (unready.nothingToFetch) {
      return NothingToFetchUI;
    }
    if (unready.error) {
      return ErrorUI;
    }
    if (unready.fetching) {
      return LoaderUI;
    }
    if (unready.empty) {
      return EmptyUI;
    }
    return null;
  };

  return getUnreadyUI() || <>{children}</>;
};

export default ConditionalSWRRenderer;
