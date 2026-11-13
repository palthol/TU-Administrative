import { buildReceiptCardModel, type ReceiptCardInput } from '@/lib/receiptCard';

export function ReceiptCard({ receipt }: { receipt: ReceiptCardInput }) {
  const card = buildReceiptCardModel(receipt);

  return (
    <article id="receipt-card" className="receipt-card" tabIndex={-1} aria-label="Receipt">
      <header className="receipt-card-header">
        <p className="receipt-card-brand">{card.gymName}</p>
        <h2 className="receipt-card-title">{card.title}</h2>
        <p className="receipt-card-amount">{card.amount}</p>
      </header>
      <dl className="receipt-card-rows">
        {card.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {card.receiptRef ? <p className="receipt-card-ref">{card.receiptRef}</p> : null}
    </article>
  );
}
