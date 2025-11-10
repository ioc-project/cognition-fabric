import {Themes} from '@magnetic/theme';
import {create, StateCreator} from 'zustand';
import {createJSONStorage, persist, PersistOptions} from 'zustand/middleware';

type ThemeStore = {
  theme: keyof Themes;
  setTheme: (newTheme: keyof Themes) => void;
  cleanThemeStore: () => void;
};

type PersistStore = (config: StateCreator<ThemeStore>, options: PersistOptions<ThemeStore>) => StateCreator<ThemeStore>;

export const useThemeStore = create<ThemeStore>(
  (persist as PersistStore)(
    (set): ThemeStore => ({
      theme: 'light',
      setTheme: (newTheme: keyof Themes) => set(() => ({theme: newTheme})),
      cleanThemeStore: () => set(() => ({theme: 'light'}))
    }),
    {
      name: 'ci-tkf-csp-ui-svc-theme-store',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
