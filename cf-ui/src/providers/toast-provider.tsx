import {DEFAULT_TOAST_TIME_OUT} from '@/constants/toast';
import {Toast, useToast, ToastComponentProps} from '@magnetic/notification';
import React, {createContext, useContext} from 'react';

type ToastProviderState = {
  addToast: (toast: ToastComponentProps) => void;
};

const ToastProviderContext = createContext<ToastProviderState | undefined>(undefined);

export const ToastProvider = ({children}: React.PropsWithChildren) => {
  const {addToast: addToastLib, removeToast, toastList} = useToast([]);

  const addToast = (toast: ToastComponentProps) => {
    addToastLib({...toast, timeout: toast.timeout || DEFAULT_TOAST_TIME_OUT});
  };

  return (
    <ToastProviderContext.Provider value={{addToast}}>
      <Toast toastList={toastList} onRemove={removeToast} />
      {children}
    </ToastProviderContext.Provider>
  );
};

export const useToastContext = () => {
  const context = useContext(ToastProviderContext);
  if (context === undefined) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
};
