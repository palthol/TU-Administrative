import { useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminTabProps, StatusMessage } from './common';

export function NotificationsTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [msg, setMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState<'reminders' | 'digest' | null>(null);

  async function postRoute(path: string, kind: 'reminders' | 'digest') {
    const k = requireKey();
    if (k) {
      setVariant('err');
      setMsg(k);
      return;
    }
    setLoading(kind);
    setMsg(null);
    const { ok, status, data } = await adminFetch<{
      posted?: boolean;
      rowCount?: number;
      summary?: Record<string, unknown>;
      error?: string;
    }>(apiBase, adminKey, path, { method: 'POST', json: {} });
    setLoading(null);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setVariant('ok');
    if (kind === 'digest' && data.summary) {
      setMsg(`Daily digest posted. Summary: ${JSON.stringify(data.summary, null, 2)}`);
    } else {
      setMsg(`Payment reminders posted. rowCount: ${data.rowCount ?? 0}`);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Discord notifications</CardTitle>
        <CardDescription>
          Operator-triggered posts to DISCORD_WEBHOOK_URL on the API service. Requires webhook configured server-side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={loading !== null}
            onClick={() => void postRoute('/api/admin/notifications/discord/payment-reminders', 'reminders')}
          >
            {loading === 'reminders' ? 'Posting…' : 'Post payment reminders'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading !== null}
            onClick={() => void postRoute('/api/admin/notifications/discord/daily-digest', 'digest')}
          >
            {loading === 'digest' ? 'Posting…' : 'Post daily digest'}
          </Button>
        </div>
        <StatusMessage message={msg} variant={variant} />
      </CardContent>
    </Card>
  );
}
