import { Menu, nativeImage, Tray } from 'electron';

interface TrayControls {
  showCoach: () => void;
  hideCoach: () => void;
  capturePrompt: () => void;
  openSettings: () => void;
  setArmedMode: (enabled: boolean) => void;
  isArmed: boolean;
  isVisible: boolean;
  quit: () => void;
}

export function createCoachTray(controls: TrayControls): Tray {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip('Hermes Coach');
  refreshCoachTrayMenu(tray, controls);
  tray.on('click', controls.showCoach);

  return tray;
}

export function refreshCoachTrayMenu(tray: Tray, controls: TrayControls): void {
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayTemplate(controls)));
}

function createTrayIcon() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">',
    '<path fill="black" d="M9 1.5 15 4v4.3c0 3.8-2.4 6.8-6 8.2-3.6-1.4-6-4.4-6-8.2V4l6-2.5Z"/>',
    '<path fill="white" d="M5.2 5.1h1.9v3h3.8v-3h1.9v7.8h-1.9V9.8H7.1v3.1H5.2V5.1Z"/>',
    '</svg>'
  ].join('');
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  icon.setTemplateImage(true);
  return icon;
}

function buildTrayTemplate(controls: TrayControls): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: controls.isVisible ? 'Hide Coach' : 'Show Coach',
      click: controls.isVisible ? controls.hideCoach : controls.showCoach
    },
    {
      type: 'separator'
    },
    {
      label: 'Select Trading Window',
      click: controls.capturePrompt
    },
    {
      label: 'Settings',
      click: controls.openSettings
    },
    {
      type: 'separator'
    },
    {
      label: controls.isArmed ? 'Pause coach monitoring' : 'Arm coach monitoring',
      click: () => controls.setArmedMode(!controls.isArmed)
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit Hermes Coach',
      click: controls.quit
    }
  ];
}
