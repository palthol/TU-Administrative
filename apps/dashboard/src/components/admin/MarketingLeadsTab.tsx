import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { AdminTabProps, SimpleDataTable, StatusMessage } from './common';

export function MarketingLeadsTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);

  const loadRows = useCallback(async () => {
    const k = requireKey();
    if (k) {
      setVariant('err');
      setMsg(k);
      setRows([]);
      return;
    }
    setLoading(true);
    setMsg(null);
    const { ok, status, data } = await adminFetch<{ rows?: Record<string, unknown>[]; error?: string }>(
      apiBase,
      adminKey,
      '/api/admin/billing/marketing-leads?limit=100',
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      setRows([]);
      return;
    }
    const next = Array.isArray(data.rows) ? data.rows : [];
    setRows(next);
    setVariant('ok');
    setMsg(`Loaded ${next.length} marketing lead(s).`);
  }, [apiBase, adminKey, requireKey]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Marketing leads</h2>
          <p className="text-sm text-muted-foreground">GET /api/admin/billing/marketing-leads — trial inquiries from the public site.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadRows()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>
      <StatusMessage message={msg} variant={variant} />
      <SimpleDataTable rows={rows} />
    </div>
  );
}
