import { buildReceiptCardModel, type ReceiptCardInput, type ReceiptCardRow, type ReceiptPrintCopies } from '@/lib/receiptCard';

const PRINT_PAIRS: Array<[string, string]> = [
  ['Person', 'Plan'],
  ['Payment', 'Received by'],
  ['Date', 'Note'],
];

function fieldValue(rows: ReceiptCardRow[], label: string): string {
  return rows.find((row) => row.label === label)?.value ?? '';
}

function ReceiptRule() {
  return (
    <div className="receipt-rule" aria-hidden="true">
      <span className="receipt-x receipt-x-l" />
      <span className="receipt-x receipt-x-r" />
    </div>
  );
}

function PrintSheet({
  copy,
  kicker,
  amount,
  dateLine,
  rows,
  receiptRef,
}: {
  copy: 'member' | 'gym';
  kicker: string;
  amount: string;
  dateLine: string;
  rows: ReceiptCardRow[];
  receiptRef: string;
}) {
  return (
    <section className={`receipt-half receipt-half-${copy} receipt-sheet`}>
      <ReceiptRule />
      <p className="receipt-kicker">{kicker}</p>
      <div className="receipt-sheet-body">
        <header>
          <h1 className="receipt-amount">{amount}</h1>
          <p className="receipt-when">{dateLine}</p>
        </header>
        <dl className="receipt-sheet-grid">
          {PRINT_PAIRS.map(([left, right]) => (
            <div className="receipt-sheet-row" key={`${left}-${right}`}>
              <div className="receipt-sheet-cell">
                <dt>{left}</dt>
                <dd>{fieldValue(rows, left)}</dd>
              </div>
              <div className="receipt-sheet-cell">
                <dt>{right}</dt>
                <dd>{fieldValue(rows, right)}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
      <footer className="receipt-foot">
        <ReceiptRule />
        {receiptRef ? <span className="receipt-ref">{receiptRef}</span> : null}
      </footer>
    </section>
  );
}

export function ReceiptCard({
  receipt,
  printCopies = 'two',
}: {
  receipt: ReceiptCardInput;
  printCopies?: ReceiptPrintCopies;
}) {
  const card = buildReceiptCardModel(receipt);

  return (
    <>
      <div className="receipt-stage">
        <article id="receipt-card" className="receipt-screen" tabIndex={-1} aria-label="Receipt">
          <ReceiptRule />
          <p className="receipt-kicker">{card.kicker}</p>
          <header className="receipt-hero">
            <h1 className="receipt-amount">{card.amount}</h1>
            <p className="receipt-when">{card.dateLine}</p>
          </header>
          <ReceiptRule />
          <dl className="receipt-screen-fields">
            {card.rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <footer className="receipt-foot">
            <ReceiptRule />
            {card.receiptRef ? <span className="receipt-ref">{card.receiptRef}</span> : null}
          </footer>
        </article>
      </div>

      <div className="receipt-print" data-receipt-print={printCopies} aria-hidden="true">
        <div className="receipt-page">
          <PrintSheet
            copy="member"
            kicker={card.memberKicker}
            amount={card.amount}
            dateLine={card.dateLine}
            rows={card.rows}
            receiptRef={card.receiptRef}
          />
          <div className="receipt-fold">
            <span>fold</span>
          </div>
          <PrintSheet
            copy="gym"
            kicker={card.gymKicker}
            amount={card.amount}
            dateLine={card.dateLine}
            rows={card.rows}
            receiptRef={card.receiptRef}
          />
        </div>
      </div>
    </>
  );
}
