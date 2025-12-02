import {create, StateCreator} from 'zustand';
import {createJSONStorage, persist, PersistOptions} from 'zustand/middleware';

type LocalStore = {
  template?: string;
  setTemplate: (template?: string) => void;
  selectedWorkspaceId?: string;
  selectedWorkspaceName?: string;
  setSelectedWorkspace: (id?: string, name?: string) => void;
  cleanLocalStore: () => void;
};

type PersistStore = (config: StateCreator<LocalStore>, options: PersistOptions<LocalStore>) => StateCreator<LocalStore>;

export const useLocalStore = create<LocalStore>(
  (persist as PersistStore)(
    (set): LocalStore => ({
      template: undefined,
      setTemplate: (template?: string) => set(() => ({template})),
      selectedWorkspaceId: undefined,
      selectedWorkspaceName: undefined,
      setSelectedWorkspace: (id?: string, name?: string) => set(() => ({selectedWorkspaceId: id, selectedWorkspaceName: name})),
      cleanLocalStore: () => set(() => ({template: undefined, selectedWorkspaceId: undefined, selectedWorkspaceName: undefined}))
    }),
    {
      name: 'ci-tkf-csp-ui-svc-local-store',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage)))
    }
  )
);
