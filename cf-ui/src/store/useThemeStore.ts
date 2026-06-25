// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {create, StateCreator} from 'zustand';
import {createJSONStorage, persist, PersistOptions} from 'zustand/middleware';

type Theme = 'light' | 'dark';

type ThemeStore = {
  theme: Theme;
  setTheme: (newTheme: Theme) => void;
  cleanThemeStore: () => void;
};

type PersistStore = (config: StateCreator<ThemeStore>, options: PersistOptions<ThemeStore>) => StateCreator<ThemeStore>;

export const useThemeStore = create<ThemeStore>(
  (persist as PersistStore)(
    (set): ThemeStore => ({
      theme: 'light',
      setTheme: (newTheme: Theme) => set(() => ({theme: newTheme})),
      cleanThemeStore: () => set(() => ({theme: 'light'}))
    }),
    {
      name: 'ioc-cfn-mgmt-plane-ui-theme-store',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage)))
    }
  )
);
