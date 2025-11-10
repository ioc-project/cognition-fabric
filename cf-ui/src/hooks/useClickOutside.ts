import {RefObject, useEffect} from 'react';

export const useClickOutside = (ref: RefObject<HTMLElement | undefined>, callback: () => void, addEventListener = true) => {
  const handleClick = (event: MouseEvent) => {
    if (ref.current && !ref.current.contains(event.target as HTMLElement)) {
      callback();
    }
  };

  useEffect(() => {
    if (addEventListener) {
      setTimeout(() => {
        document.addEventListener('click', handleClick);
      }, 1500);
    }
    return () => {
      document.removeEventListener('click', handleClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addEventListener]);
};
