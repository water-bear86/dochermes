import { contextBridge, ipcRenderer } from 'electron';

import type { AskHermesInput, CoachBridgeApi, HermesConnectionReport, HermesConnectionSettings, WindowSourceOption } from '../shared/types';

const api: CoachBridgeApi & {
  onOpenWindowPicker: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
} = {
  listWindowSources: () => ipcRenderer.invoke('window-sources:list') as Promise<WindowSourceOption[]>,
  captureWindowSource: (sourceId: string) => ipcRenderer.invoke('window-sources:capture', sourceId) as Promise<string>,
  askHermes: (input: AskHermesInput) => ipcRenderer.invoke('hermes:ask', input) as Promise<string>,
  testHermesConnection: (connection: HermesConnectionSettings) =>
    ipcRenderer.invoke('hermes:test-connection', connection) as Promise<HermesConnectionReport>,
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke('coach:set-always-on-top', enabled) as Promise<void>,
  appInfo: () =>
    ipcRenderer.invoke('app:info') as Promise<{
      name: string;
      platform: string;
    }>,
  onOpenWindowPicker: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('coach:open-window-picker', listener);
    return () => ipcRenderer.removeListener('coach:open-window-picker', listener);
  },
  onOpenSettings: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('coach:open-settings', listener);
    return () => ipcRenderer.removeListener('coach:open-settings', listener);
  }
};

contextBridge.exposeInMainWorld('hermesCoach', api);
