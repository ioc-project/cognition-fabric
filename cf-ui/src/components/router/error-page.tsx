import {Button} from '@magnetic/button';
import {Container} from '@magnetic/container';
import {FallbackProps} from 'react-error-boundary';
import {useRouteError, isRouteErrorResponse} from 'react-router-dom';
import {Empty} from '@magnetic/icons';

interface ErrorPageProps extends FallbackProps {
  className?: string;
  showRefreshButton?: boolean;
  info?: boolean;
}

export const ErrorPage = ({error, className, showRefreshButton = true, info = true, resetErrorBoundary}: ErrorPageProps) => {
  const errorRouter = useRouteError();
  let errorMessage: string;

  if (isRouteErrorResponse(errorRouter)) {
    errorMessage = error.error?.message || error.statusText;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    console.error(error);
    errorMessage = 'Unknown error';
  }

  return (
    <Container className={`text-center py-20 ${className} mt-4 mx-2`}>
      <div>
        <div className="p-3 inline-flex items-center align-center rounded-full">
          {info ? <Empty.Info className="w-14 h-14 text-background" /> : <Empty.Negative className="w-14 h-14 text-background" />}
        </div>
      </div>
      <h1 className="text-[40px]">Oops!</h1>
      <p className="text-muted-foreground italic">An unexpected error has occurred. Sorry about that!</p>
      <div className="flex flex-col gap-2 text-center text-xs text-muted-foreground mt-4">
        <p>
          <b>Data of error:</b>
        </p>
        {errorMessage && error.name ? (
          <p>
            <b>{error.name}</b>: {errorMessage}
          </p>
        ) : (
          <p>{errorMessage}</p>
        )}
        <p>Please try refreshing the page, or contact support if the problem persists.</p>
      </div>
      {showRefreshButton && (
        <Button className="mt-6" onClick={() => resetErrorBoundary()}>
          Refresh
        </Button>
      )}
    </Container>
  );
};
