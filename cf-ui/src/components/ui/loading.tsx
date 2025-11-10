import {cn} from '@/utils/utils';
import {Skeleton} from '@magnetic/skeleton';
import {Loader} from './loader';

export interface LoadingProps {
  style?: React.CSSProperties;
  classNameLoader?: string;
  useOverlay?: boolean;
}

export const Loading = ({style, classNameLoader, useOverlay = false}: LoadingProps) => {
  return (
    <div
      className={cn(
        'flex flex-col justify-center items-center h-full w-full absolute top-[50%] left-[50%] z-[1000] -translate-x-[50%] -translate-y-[50%] w-fit h-fit',
        useOverlay ? 'overlay' : ''
      )}
      style={{
        ...style,
        backgroundColor: 'var(--base-bg-weak-default)'
      }}
    >
      <Loader className={cn('h-64', classNameLoader)} />
    </div>
  );
};

export const LoaderRelative = ({className, useSkeleton = false}: {className?: string; useSkeleton?: boolean}) => {
  if (useSkeleton) {
    return <Skeleton lines={5} isLoading={true} />;
  }
  return (
    <div className={cn('flex justify-center items-center w-full', className)}>
      <Loader className={'w-16 h-16'} size="sm" />
    </div>
  );
};
