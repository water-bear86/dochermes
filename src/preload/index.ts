import { contextBridge, ipcRenderer } from 'electron';

import type {
  AskHermesInput,
  CoachBridgeApi,
  HermesConnectionReport,
  HermesConnectionSettings,
  MonitoringSignal,
  MonitoringStatus,
  WindowSourceOption
} from '../shared/types';

const api: CoachBridgeApi & {
  onOpenWindowPicker: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
  onArmCoach: (callback: (enabled: boolean) => void) => () => void;
} = {
  listWindowSources: () => ipcRenderer.invoke('window-sources:list') as Promise<WindowSourceOption[]>,
  validateSelectedWindow: (sourceId: string) => ipcRenderer.invoke('window-sources:validate', sourceId) as Promise<boolean>,
  captureWindowSource: (sourceId: string) => ipcRenderer.invoke('window-sources:capture', sourceId) as Promise<string>,
  setWatchClipboard: (enabled: boolean) => ipcRenderer.invoke('coach:set-watch-clipboard', enabled) as Promise<void>,
  setWatchOCR: (enabled: boolean) => ipcRenderer.invoke('coach:set-watch-ocr', enabled) as Promise<void>,
  setMonitorSource: (sourceId?: string) => ipcRenderer.invoke('coach:set-monitor-source', sourceId) as Promise<void>,
  setOcrContextMode: (mode: Parameters<CoachBridgeApi['setOcrContextMode']>[0]) =>
    ipcRenderer.invoke('coach:set-ocr-context-mode', mode) as Promise<void>,
  setOcrRegionProfile: (profile: Parameters<CoachBridgeApi['setOcrRegionProfile']>[0]) =>
    ipcRenderer.invoke('coach:set-ocr-region-profile', profile) as Promise<void>,
  recalibrateOCR: () => ipcRenderer.invoke('coach:recalibrate-ocr') as Promise<void>,
  setVoiceSettings: (settings: Parameters<CoachBridgeApi['setVoiceSettings']>[0]) =>
    ipcRenderer.invoke('coach:set-voice-settings', settings) as Promise<void>,
  askHermes: (input: AskHermesInput) => ipcRenderer.invoke('hermes:ask', input) as Promise<string>,
  testHermesConnection: (connection: HermesConnectionSettings) =>
    ipcRenderer.invoke('hermes:test-connection', connection) as Promise<HermesConnectionReport>,
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke('coach:set-always-on-top', enabled) as Promise<void>,
  setArmedMode: (enabled: boolean) => ipcRenderer.invoke('coach:set-armed-mode', enabled) as Promise<void>,
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
  },
  onArmCoach: (callback: (enabled: boolean) => void) => {
    const listener = (_event: unknown, enabled: boolean): void => callback(enabled);
    ipcRenderer.on('coach:set-armed', listener);
    return () => ipcRenderer.removeListener('coach:set-armed', listener);
  },
  onMonitorSignal: (callback: (signal: MonitoringSignal) => void) => {
    const listener = (_event: unknown, signal: MonitoringSignal): void => callback(signal);
    ipcRenderer.on('coach:monitor-signal', listener);
    return () => ipcRenderer.removeListener('coach:monitor-signal', listener);
  },
  onMonitorStatus: (callback: (status: MonitoringStatus) => void) => {
    const listener = (_event: unknown, status: MonitoringStatus): void => callback(status);
    ipcRenderer.on('coach:monitor-status', listener);
    return () => ipcRenderer.removeListener('coach:monitor-status', listener);
  },
  onVoiceHotkey: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('coach:voice-hotkey', listener);
    return () => ipcRenderer.removeListener('coach:voice-hotkey', listener);
  }
};

contextBridge.exposeInMainWorld('hermesCoach', api);
