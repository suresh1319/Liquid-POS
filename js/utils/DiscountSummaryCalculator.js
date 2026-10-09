import { PassbookCalculator } from './PassbookCalculator.js';

export const getDiscountSummary = async ({
    sdk,
    dateFilter,
    customDateRange,
    customers
}) => {
    const passbookData = await PassbookCalculator.fetchPassbookData(sdk);

    const transactions = PassbookCalculator.filterTransactions(
        passbookData.transactions,
        {
            dateFilter,
            customDateRange,
            activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'],
            customers
        }
    );

    const dates = transactions.map(t => new Date(t.date));
    const minDate = dates.length ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length ? new Date(Math.max(...dates)) : null;

    const ordersWithDiscounts = passbookData.orders.filter(order => {
        const discount = Number(order.discount) || 0;
        if (discount <= 0) return false;

        const orderDate = new Date(order.date || order.createdAt || Date.now());
        if (minDate && orderDate < minDate) return false;
        if (maxDate && orderDate > maxDate) return false;

        const isCompleted = order.currentStatus?.label === 'COMPLETED';
        const isPaid = order.paid === true;
        const noStatus = !order.currentStatus;

        return isCompleted || isPaid || noStatus;
    });

    const totalDiscount = ordersWithDiscounts.reduce(
        (sum, o) => sum + (Number(o.discount) || 0),
        0
    );

    return {
        totalDiscount,
        orderCount: ordersWithDiscounts.length
    };
};
