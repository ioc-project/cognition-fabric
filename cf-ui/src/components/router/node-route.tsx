import {Suspense} from 'react';
import {ErrorBoundary} from 'react-error-boundary';
import {ErrorPage} from './error-page';
import {LoaderRelative} from '../ui/loading';

export interface NodeRouteProps {
  children: React.ReactNode;
  disableErrorBoundary?: boolean;
}

export const NodeRoute = ({children, disableErrorBoundary}: NodeRouteProps) => {
  const getWrappedChildren = () => <Suspense fallback={<LoaderRelative />}>{children}</Suspense>;
  return disableErrorBoundary ? (
    getWrappedChildren()
  ) : (
    <ErrorBoundary fallbackRender={(props) => <ErrorPage {...props} />}>{getWrappedChildren()}</ErrorBoundary>
  );
};
