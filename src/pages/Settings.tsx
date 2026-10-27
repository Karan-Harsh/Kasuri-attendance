import { CheckCircle2, Download, FolderOpen, HardDrive, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Button, Card, cx, ErrorBox, Field, PageHeader } from '../components/ui.tsx';
import { isDesktop } from '../db.ts';
import { backupToFolder, chooseFolder, confirmAction, dataFileLocation, notify, saveTextFile } from '../desktop.ts';
import { dateLabel, today, useSettings } from '../format.ts';

export default function SettingsPage() {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { backup_dir: _ignored, ...rest } = form; // the backup folder is saved by the Backup section
      await api.saveSettings(rest);
      refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <form onSubmit={submit} className="space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Restaurant</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Restaurant name" hint="Shown on salary slips">
              <input className="w-full" value={form.restaurant_name} onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })} />
            </Field>
            <Field label="Currency symbol">
              <input className="w-full" value={form.currency_symbol} onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })} maxLength={4} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Salary rules</h2>
          <div>
            <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Salary is fixed per calendar month. Someone who works the full month gets their full salary, whether the month has 28, 30 or 31 days.
            </div>
            <div className="text-sm font-medium text-stone-700">How much is cut for one extra leave?</div>
            <div className="mb-2 text-xs text-stone-500">Also used to pay part of the month to someone who joined mid-month.</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['calendar', 'Salary ÷ days in that month', 'e.g. ₹10,000 salary: one leave cuts ₹333 in a 30-day month, ₹323 in a 31-day month'],
                ['fixed30', 'Salary ÷ 30, always', 'e.g. ₹10,000 salary: one leave always cuts ₹333, in every month'],
              ] as const).map(([value, title, hint]) => (
                <label key={value} className={cx('cursor-pointer rounded-lg border p-3', form.per_day_basis === value ? 'border-brand-500 bg-brand-50' : 'border-stone-200')}>
                  <input type="radio" className="sr-only" checked={form.per_day_basis === value} onChange={() => setForm({ ...form, per_day_basis: value })} />
                  <div className="font-medium">{title}</div>
                  <div className="text-sm text-stone-500">{hint}</div>
                </label>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-stone-50 p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-600" checked={form.pay_unused_leaves} onChange={(e) => setForm({ ...form, pay_unused_leaves: e.target.checked })} />
            <span>
              <span className="font-medium">Pay extra for leaves not taken</span>
              <span className="block text-sm text-stone-500">If someone is allowed 4 leaves but takes only 1, they get 3 days’ salary extra.</span>
            </span>
          </label>
          <div className="rounded-lg border border-stone-200 p-3 text-sm text-stone-600">
            <b>How salary is calculated:</b> Monthly salary − (extra leaves × one day’s salary) + overtime + bonus − advances − other deductions.
            Absent = 1 leave, half day = ½ leave. Paid leave and week offs are never cut. Staff who joined mid-month are paid only from their joining date.
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit">Save settings</Button>
          {saved && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={18} /> Saved</span>}
        </div>
      </form>

      <BackupCard onError={setError} />
    </>
  );
}

function BackupCard({ onError }: { onError: (msg: string) => void }) {
  const { settings, refresh } = useSettings();
  const [location, setLocation] = useState('');
  const [lastBackup, setLastBackup] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dataFileLocation().then(setLocation);
    api.lastBackupDate().then(setLastBackup);
  }, []);

  async function pickFolder() {
    const dir = await chooseFolder();
    if (!dir) return;
    await api.saveSettings({ backup_dir: dir });
    refresh();
    await backupNow(dir);
  }

  async function turnOff() {
    await api.saveSettings({ backup_dir: '' });
    refresh();
  }

  async function backupNow(dir = settings.backup_dir) {
    setBusy(true);
    try {
      if (dir) {
        const path = await backupToFolder(dir);
        setLastBackup(today());
        await notify(`Backup saved:\n${path}`);
      } else {
        await saveTextFile(`kasuri-backup-${today()}.json`, JSON.stringify(await api.backup()), { name: 'Kasuri backup', ext: 'json' });
      }
    } catch (err) {
      onError(`Backup failed: ${(err as Error).message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File) {
    if (!(await confirmAction('Restoring will REPLACE all current data with the data in this backup. Continue?', 'Restore backup', 'Restore'))) return;
    try {
      await api.restore(JSON.parse(await file.text()));
      await notify('Backup restored.');
      window.location.reload();
    } catch (err) {
      onError(`Restore failed: ${(err as Error).message}`);
    }
  }

  return (
    <Card className="mt-6 space-y-4 p-5">
      <h2 className="font-semibold">Backup</h2>
      <div className="flex items-start gap-3 rounded-lg bg-stone-50 p-3 text-sm">
        <HardDrive size={18} className="mt-0.5 shrink-0 text-stone-500" />
        <div className="min-w-0">
          <div className="font-medium">Your data is stored on this computer</div>
          <div className="break-all text-stone-500">{location}</div>
        </div>
      </div>

      {isDesktop && (
        <div className="rounded-lg border border-stone-200 p-3">
          <div className="font-medium">Automatic daily backup</div>
          {settings.backup_dir ? (
            <>
              <p className="mt-1 text-sm text-stone-600">
                A copy is saved once a day to <span className="font-medium break-all">{settings.backup_dir}</span>. The last 60 days are kept.
              </p>
              <p className="mt-1 text-sm text-stone-500">Last backup: {lastBackup ? dateLabel(lastBackup) : 'not yet'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={pickFolder}>
                  <FolderOpen size={16} /> Change folder
                </Button>
                <Button size="sm" variant="ghost" onClick={turnOff}>
                  Turn off
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-stone-600">
                Choose a folder and a backup will be saved there every day. Tip: pick a Google Drive, OneDrive or pen drive folder, so the data survives
                even if this computer breaks.
              </p>
              <Button size="sm" className="mt-3" onClick={pickFolder}>
                <FolderOpen size={16} /> Choose backup folder
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => backupNow()} disabled={busy}>
          <Download size={18} /> Back up now
        </Button>
        <label>
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) restore(f);
            }}
          />
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-medium text-stone-700 shadow-sm hover:bg-stone-50">
            <Upload size={18} /> Restore from backup
          </span>
        </label>
      </div>
    </Card>
  );
}
