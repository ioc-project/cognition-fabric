// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState, useCallback} from 'react';

interface ConfirmDialogState<TData = Record<string, unknown>> {
  open: boolean;
  data: TData | null;
}

interface UseConfirmDialogReturn<TData = Record<string, unknown>> {
  isOpen: boolean;
  data: TData | null;
  isLoading: boolean;
  open: (data: TData) => void;
  close: () => void;
  confirm: (action: (data: TData) => Promise<void>) => Promise<void>;
}

export function useConfirmDialog<TData = Record<string, unknown>>(): UseConfirmDialogReturn<TData> {
  const [state, setState] = useState<ConfirmDialogState<TData>>({
    open: false,
    data: null
  });
  const [isLoading, setIsLoading] = useState(false);

  const open = useCallback((data: TData) => {
    setState({open: true, data});
  }, []);

  const close = useCallback(() => {
    setState({open: false, data: null});
  }, []);

  const confirm = useCallback(
    async (action: (data: TData) => Promise<void>) => {
      if (!state.data) {
        return;
      }

      setIsLoading(true);
      try {
        await action(state.data);
        close();
      } finally {
        setIsLoading(false);
      }
    },
    [state.data, close]
  );

  return {
    isOpen: state.open,
    data: state.data,
    isLoading,
    open,
    close,
    confirm
  };
}
