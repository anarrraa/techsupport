import { useState, useEffect } from 'react';
import { FileText, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api } from '@/utils/api-client';

export function ExportActions({ month, disabled = false }: { month: string; disabled?: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [month]);
  async function download(format: 'pdf' | 'excel') {
    setBusy(true); setError(false);
    try { await (format === 'pdf' ? api.downloadPDF(month) : api.downloadExcel(month)); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2" aria-busy={busy}>
      <Button className="min-h-11" variant="outline" disabled={disabled || busy} onClick={() => void download('pdf')}><FileText className="size-4" aria-hidden />PDF</Button>
      <Button className="min-h-11" variant="outline" disabled={disabled || busy} onClick={() => void download('excel')}><Table2 className="size-4" aria-hidden />Excel</Button>
    </div>
    {error && <p role="alert" className="max-w-sm text-sm text-foreground">{t('reports.exportError')}</p>}
  </div>;
}
