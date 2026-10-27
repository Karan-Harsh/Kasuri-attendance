// Things that work differently in the desktop app than in a browser: dialogs, saving files and backups.
import { api } from './api.ts';
import { openDialog } from './components/DialogHost.tsx';
import { isDesktop } from './db.ts';
import { today } from './format.ts';

const dialog = () => import('@tauri-apps/plugin-dialog');
const invoke = async <T>(cmd: string, args: Record<string, unknown>) => (await import('@tauri-apps/api/core')).invoke<T>(cmd, args);

export function confirmAction(message: string, title = 'Please confirm', confirmLabel = 'Yes'): Promise<boolean> {
  return openDialog({ kind: 'confirm', title, message, confirmLabel });
}

export async function notify(message: string, title = 'Kasuri') {
  await openDialog({ kind: 'notify', title, message });
}

/** Asks where to save, then writes the file. Returns false if the user cancelled. */
export async function saveTextFile(fileName: string, contents: string, kind: { name: string; ext: string }): Promise<boolean> {
  if (!isDesktop) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  const path = await (await dialog()).save({ defaultPath: fileName, filters: [{ name: kind.name, extensions: [kind.ext] }] });
  if (!path) return false;
  await invoke('save_text_file', { path, contents });
  return true;
}

export async function chooseFolder(): Promise<string | null> {
  const picked = await (await dialog()).open({ directory: true, title: 'Choose a folder for backups' });
  return typeof picked === 'string' ? picked : null;
}

export async function dataFileLocation(): Promise<string> {
  if (!isDesktop) return 'data/kasuri.db (development copy)';
  const { appConfigDir, join } = await import('@tauri-apps/api/path');
  return join(await appConfigDir(), 'kasuri.db');
}

const KEEP_AUTO_BACKUPS = 60;

/** Writes today's backup into the chosen folder, keeping the most recent 60. Returns the file path. */
export async function backupToFolder(dir: string): Promise<string> {
  const contents = JSON.stringify(await api.backup());
  const path = await invoke<string>('write_backup', {
    dir,
    name: `kasuri-auto-backup-${today()}.json`,
    contents,
    keep: KEEP_AUTO_BACKUPS,
  });
  await api.setLastBackupDate(today());
  return path;
}

/** Runs once a day while the app is open, if a backup folder is set. */
export async function autoBackupIfDue(dir: string) {
  if (!isDesktop || !dir) return;
  if ((await api.lastBackupDate()) === today()) return;
  try {
    await backupToFolder(dir);
  } catch (err) {
    console.error('Automatic backup failed', err);
  }
}
