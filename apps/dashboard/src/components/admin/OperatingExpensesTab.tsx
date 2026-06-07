import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdminTabProps, Field, SimpleDataTable, StatusMessage, formatUsd, parseDollarsToCents } from './common';

const CATEGORIES = ['rent', 'utilities', 'other'] as const;

export function OperatingExpensesTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [listVariant, setListVariant] = useState<'ok' | 'err'>('ok');
  const [listLoading, setListLoading] = useState(false);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('other');
  const [amountDollars, setAmountDollars] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [notes, setNotes] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [createVariant, setCreateVariant] = useState<'ok' | 'err'>('ok');
  const [createLoading, setCreateLoading] = useState(false);

  const loadRows = useCallback(async () => {
    const k = requireKey();
    if (k) {
      setListVariant('err');
      setListMsg(k);
      setRows([]);
      return;
    }
    setListLoading(true);
    setListMsg(null);
    const { ok, status, data } = await adminFetch<{ rows?: Record<string, unknown>[]; error?: string }>(
      apiBase,
      adminKey,
      '/api/admin/billing/operating-expenses?limit=100',
    );
    setListLoading(false);
    if (!ok) {
      setListVariant('err');
      setListMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      setRows([]);
      return;
    }
    setListVariant('ok');
    const next = Array.isArray(data.rows) ? data.rows : [];
    setRows(next);
    setListMsg(`Loaded ${next.length} expense row(s).`);
  }, [apiBase, adminKey, requireKey]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const k = requireKey();
    if (k) {
      setCreateVariant('err');
      setCreateMsg(k);
      return;
    }
    const cents = parseDollarsToCents(amountDollars);
    if (!cents || !expenseDate.trim()) {
      setCreateVariant('err');
      setCreateMsg('Positive amount and expense_date are required.');
      return;
    }
    setCreateLoading(true);
    setCreateMsg(null);
    const body: Record<string, unknown> = {
      category,
      amount_cents: cents,
      expense_date: expenseDate.trim(),
    };
    if (vendorName.trim()) body.vendor_name = vendorName.trim();
    if (notes.trim()) body.notes = notes.trim();
    if (createdBy.trim()) body.created_by = createdBy.trim();

    const { ok, status, data } = await adminFetch<{ id?: string; error?: string }>(
      apiBase,
      adminKey,
      '/api/admin/billing/operating-expenses',
      { method: 'POST', json: body },
    );
    setCreateLoading(false);
    if (!ok) {
      setCreateVariant('err');
      setCreateMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setCreateVariant('ok');
    setCreateMsg(`Expense recorded (${formatUsd(cents)}). id: ${data.id ?? '—'}`);
    setAmountDollars('');
    setVendorName('');
    setNotes('');
    void loadRows();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Record operating expense</CardTitle>
          <CardDescription>POST /api/admin/billing/operating-expenses — feeds finance monthly summary.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-4">
            <Field id="exp-cat" label="Category">
              <select
                id="exp-cat"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="exp-amt" label="Amount (USD)">
              <Input id="exp-amt" value={amountDollars} onChange={(e) => setAmountDollars(e.target.value)} placeholder="1200.00" />
            </Field>
            <Field id="exp-date" label="Expense date">
              <Input id="exp-date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </Field>
            <Field id="exp-vendor" label="Vendor (optional)">
              <Input id="exp-vendor" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            </Field>
            <Field id="exp-notes" label="Notes (optional)">
              <Textarea id="exp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
            <Field id="exp-by" label="Created by (optional)">
              <Input id="exp-by" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
            </Field>
            <Button type="submit" disabled={createLoading}>
              {createLoading ? 'Saving…' : 'Record expense'}
            </Button>
          </form>
          <StatusMessage message={createMsg} variant={createVariant} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Recent expenses</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadRows()} disabled={listLoading}>
            {listLoading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
        <StatusMessage message={listMsg} variant={listVariant} />
        <SimpleDataTable rows={rows} />
      </div>
    </div>
  );
}
