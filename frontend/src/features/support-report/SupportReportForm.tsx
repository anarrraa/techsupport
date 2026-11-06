import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/shared/i18n';
import { api } from '@/shared/utils/api-client';
import { fetchSupportConfigs, fetchSupportPeriod, supportErrorText } from '@/shared/utils/report-requests';

export function SupportReportForm() {
  const { t } = useI18n();
  const { data: configs, error: configError } = useQuery({ queryKey: ['support-configs'], queryFn: () => fetchSupportConfigs() });
  const [file, setFile] = useState<File | null>(null);
  const latest = useRef<File | null>(null);
  const [configId, setConfigId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<'period' | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = configs?.find(c => c.id === configId) ?? configs?.[0];
  const reason = (e: unknown) => supportErrorText(e, { invalid: t('support.invalid'), tooLarge: t('support.tooLarge'), generic: t('state.error') });

  async function pick(next: File | null) {
    latest.current = next;
    setFile(next); setFrom(''); setTo(''); setError(null);
    if (!next) return;
    setBusy('period');
    try {
      const period = await fetchSupportPeriod(next);
      if (latest.current === next) { setFrom(period.from); setTo(period.to); }
    } catch (e) {
      if (latest.current === next) setError(reason(e));
    } finally {
      if (latest.current === next) setBusy(null);
    }
  }
  async function download(group: number) {
    if (!file || !config) return;
    setBusy(group); setError(null);
    try { await api.downloadSupportReport(file, { config: config.id, from, to, group }); }
    catch (e) { setError(reason(e)); }
    finally { setBusy(null); }
  }

  const label = 'space-y-1 text-sm font-medium';
  const ready = file && config && from && to && from <= to && busy === null;
  return <section className="space-y-4 rounded-lg border bg-card p-4 md:p-5" aria-busy={busy !== null}>
    <div><h2 className="font-semibold">{t('support.title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('support.description')}</p></div>
    {configError ? <p role="alert" className="text-sm">{t('state.error')}</p>
      : configs?.length === 0 ? <p className="text-sm text-muted-foreground">{t('support.noConfigs')}</p>
      : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}><span>{t('support.file')}</span><Input className="h-11" type="file" accept=".xlsx,.csv" disabled={busy !== null && busy !== 'period'} onChange={e => void pick(e.target.files?.[0] ?? null)} /></label>
        <label className={label}><span>{t('support.config')}</span>
          <select className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm" disabled={!configs || busy !== null} value={config?.id ?? ''} onChange={e => setConfigId(e.target.value)}>
            {!configs && <option value="">{t('state.loading')}</option>}
            {configs?.map(c => <option key={c.id} value={c.id}>{c.client}</option>)}
          </select></label>
        <label className={label}><span>{t('support.from')}</span><Input className="h-11" type="month" required disabled={busy !== null} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className={label}><span>{t('support.to')}</span><Input className="h-11" type="month" required min={from} disabled={busy !== null} value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>}
    {config && <div className="space-y-2"><p className="text-sm text-muted-foreground">{t('support.groups')}</p>
      <div className="flex flex-wrap gap-2">{config.groups.map((name, i) =>
        <Button key={i} className="min-h-11" variant="outline" disabled={!ready} aria-busy={busy === i} onClick={() => void download(i)}><FileText className="size-4" aria-hidden />{name}</Button>)}</div>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
