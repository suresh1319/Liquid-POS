import React, { useMemo, useState } from 'react';

export default function PartialPaymentSheet({ order, onCollected, onClose, currency = '₹' }) {
  const totals = useMemo(() => {
    try { return order.getTotalsForBill(); } catch (_) {
      const total = Number(order.total || order.finalAmount || order.grandTotal || 0) || 0;
      const paid = Number(order.settledAmount || 0) || 0;
      const due = Math.max(0, total - paid);
      return { finalAmount: total, paid, due };
    }
  }, [order]);

  const [amount, setAmount] = useState(Math.min(totals.due || 0, totals.finalAmount || 0));
  const [method, setMethod] = useState('CASH');
  const due = totals.due || 0;

  const quick = [
    { label: 'Exact Due', val: due },
    { label: '50%', val: Math.round((due / 2) * 100) / 100 },
    { label: `${currency}100`, val: 100 },
    { label: `${currency}500`, val: 500 },
  ];

  return (
    <div className="p-3">
      <div className="mb-2 text-sm text-gray-700">Due: {currency}{(due).toFixed(2)}</div>
      <div className="flex gap-2 mb-2 flex-wrap">
        {quick.map(q => (
          <button key={q.label} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
                  onClick={() => setAmount(Math.max(0, Math.min(due, q.val)))}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-3 items-center">
        <input className="border rounded px-2 py-1 w-28" type="number" min={1} max={due} step="0.01"
               value={amount}
               onChange={e => setAmount(Math.max(0, Math.min(due, parseFloat(e.target.value) || 0)))} />
        <select className="border rounded px-2 py-1" value={method}
                onChange={e => setMethod(e.target.value)}>
          <option value="CASH">Cash</option>
          <option value="DIGITAL">Digital</option>
          <option value="CARD">Card</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button className="px-3 py-1 bg-black text-white rounded"
                onClick={() => onCollected && onCollected({ amount, method })}
                disabled={amount <= 0}>Collect</button>
        <button className="px-3 py-1 rounded border" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
