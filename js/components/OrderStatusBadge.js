import React from 'react';

// Lightweight badge to indicate Unsettled/Partial/Settled with optional Paid/Due amounts
export default function OrderStatusBadge({ order, showAmounts = true, currency = '₹' }) {
  if (!order) return null;

  const getState = () => {
    try {
      if (typeof order.getSettlementState === 'function') {
        return order.getSettlementState();
      }
      if (order.settled || order.paid) return 'SETTLED';
      if ((order.settledAmount || 0) > 0) return 'PARTIAL';
      return 'UNSETTLED';
    } catch (_) {
      return (order.settled || order.paid)
        ? 'SETTLED'
        : ((order.settledAmount || 0) > 0 ? 'PARTIAL' : 'UNSETTLED');
    }
  };

  const state = getState();

  const cls =
    state === 'SETTLED'
      ? 'bg-green-100 text-green-700'
      : state === 'PARTIAL'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-orange-100 text-orange-800';

  const totals = (() => {
    try {
      //  SINGLE SOURCE OF TRUTH
      if (typeof order.getTotalsForBill === 'function') {
        return order.getTotalsForBill();
      }

      const finalAmount =
        Number(order.total || order.finalAmount || order.grandTotal || 0) || 0;

      const paid = Number(order.settledAmount || 0) || 0;
      const due = Math.max(0, finalAmount - paid);

      return { paid, due };
    } catch (_) {
      return {
        paid: Number(order.settledAmount || 0) || 0,
        due: 0
      };
    }
  })();

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
        {state}
      </span>

      {showAmounts && (
        <span className="text-xs text-gray-600">
          {totals.paid > 0
            ? `Paid: ${currency}${totals.paid.toFixed(2)} • `
            : ''}
          Due: {currency}{Math.max(0, totals.due || 0).toFixed(2)}
        </span>
      )}
    </div>
  );
}
