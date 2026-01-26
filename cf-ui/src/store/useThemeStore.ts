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
      name: 'ioc-cfn-mgmt-ui-svc-theme-store',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage)))
    }
  )
);
