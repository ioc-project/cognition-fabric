import {create, StateCreator} from 'zustand';
import {createJSONStorage, persist, PersistOptions} from 'zustand/middleware';

type LocalStore = {
  template?: string;
  setTemplate: (template?: string) => void;
  cleanLocalStore: () => void;
};

type PersistStore = (config: StateCreator<LocalStore>, options: PersistOptions<LocalStore>) => StateCreator<LocalStore>;

export const useLocalStore = create<LocalStore>(
  (persist as PersistStore)(
    (set): LocalStore => ({
      template: undefined,
      setTemplate: (template?: string) => set(() => ({template})),
      cleanLocalStore: () => set(() => ({template: undefined}))
    }),
    {
      name: 'ci-tkf-csp-ui-svc-local-store',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
