import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/finance/shared';
import { formatUsdFromCents } from '@/lib/shareFormats';
import {
  dollarsInputFromCents,
  loadPlanPrefill,
  type Plan,
} from '@/lib/planPrefill';
import type { Connection } from '@/lib/finance';

export function PlanPrefill({
  connection,
  participantId,
  accountId,
  enabled,
  onPlanChosen,
}: {
  connection: Connection;
  participantId: string | null;
  accountId: string | null;
  enabled: boolean;
  onPlanChosen: (plan: Plan | null, prefillAmount: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [available, setAvailable] = useState(false);
  const onPlanChosenRef = useRef(onPlanChosen);
  onPlanChosenRef.current = onPlanChosen;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setPlans([]);
      setSelectedId('');
      setAvailable(false);
      onPlanChosenRef.current(null, null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setAvailable(false);
    void (async () => {
      const result = await loadPlanPrefill(
        connection,
        { participantId, accountId },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setLoading(false);
      if (result.kind !== 'ok') {
        setPlans([]);
        setSelectedId('');
        setAvailable(false);
        onPlanChosenRef.current(null, null);
        return;
      }
      const nextPlans = result.value.plans;
      const current = result.value.current;
      if (!current && nextPlans.length === 0) {
        setPlans([]);
        setSelectedId('');
        setAvailable(false);
        onPlanChosenRef.current(null, null);
        return;
      }
      setPlans(nextPlans);
      setAvailable(true);
      if (current) {
        setSelectedId(current.id);
        onPlanChosenRef.current(current, current.price_cents > 0 ? dollarsInputFromCents(current.price_cents) : null);
      } else {
        setSelectedId('');
        onPlanChosenRef.current(null, null);
      }
    })();

    return () => controller.abort();
  }, [enabled, participantId, accountId, connection.apiBase, connection.adminKey]);

  if (!enabled) return null;
  if (loading) {
    return <p className="muted text-sm">Looking up plan…</p>;
  }
  if (!available || plans.length === 0) return null;

  function choose(planId: string) {
    setSelectedId(planId);
    const plan = plans.find((row) => row.id === planId) ?? null;
    onPlanChosen(plan, plan && plan.price_cents > 0 ? dollarsInputFromCents(plan.price_cents) : null);
  }

  return (
    <Field id="cash-plan" label="Plan">
      <select
        id="cash-plan"
        className="finance-select"
        value={selectedId}
        onChange={(e) => choose(e.target.value)}
      >
        <option value="">No plan — enter amount</option>
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
            {plan.price_cents > 0 ? ` · ${formatUsdFromCents(plan.price_cents)}` : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}
