/**
 * Passbook Calculator - Master source for all sales calculations
 * This ensures Analytics shows exactly the same numbers as Passbook
 */

import { ChargesCalculator } from './ChargesCalculator.js';

export class PassbookCalculator {
    /**
     * Fetch all required data for passbook calculations
     * @param {Object} sdk - SDK instance
     * @returns {Promise<Object>} - Object containing orders, transactions, and customers
     */
    static async fetchPassbookData(sdk) {
        try {
            // Fetch orders
            const ordersSnapshot = await sdk.db.collection("Orders").get();
            const orders = ordersSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    date: data.date?.toDate ? data.date.toDate() : new Date(data.date)
                };
            });

            // Fetch customers
            const customersSnapshot = await sdk.db.collection("Customers").get();
            const customers = customersSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data
                };
            });

            // Create transactions from orders
            const transactions = this.createTransactionsFromOrders(orders, customers);

            return {
                orders,
                transactions,
                customers
            };
        } catch (error) {
            console.error('Error fetching passbook data:', error);
            throw error;
        }
    }

    /**
     * Create transactions from orders exactly like Passbook does
     * @param {Array} orders - Array of order objects
     * @param {Array} customers - Array of customer objects (optional)
     * @returns {Array} - Array of transaction objects
     */
static createTransactionsFromOrders(orders, customers = []) {
    console.log('[PassbookCalculator] Creating transactions from', orders.length, 'orders');

    return orders.flatMap(order => {
        if (!order || !order.items) return [];

        // ================== DATE ==================
        const orderDate = order.date?.toDate
            ? order.date.toDate()
            : new Date(order.date || Date.now());

        // ================== STATUS CHECK ==================
        const isCompleted = order.currentStatus?.label === 'COMPLETED';
        const isPaid = order.paid === true;
        const isSettled = order.settled === true;
        const hasPayMode = order.payMode && order.payMode !== 'UNSETTLED';
        const noStatusInfo = !order.currentStatus;

        if (!(isCompleted || isPaid || isSettled || hasPayMode || noStatusInfo)) {
            return [];
        }

        // ================== SUBTOTAL ==================
        const subtotal = order.items.reduce((sum, item) => {
            if (!item) return sum;

            const price = Number(
                item.total ||
                item.lineTotal ||
                item.amountTotal ||
                item.finalTotal ||
                item.subtotal ||
                item.price ||
                item.finalPrice ||
                item.unitPrice ||
                item.rate ||
                item.amount ||
                item.basePrice ||
                item.grossPrice ||
                0
            );

            const qty = Number(
                item.qnt ||
                item.quantity ||
                item.qty ||
                item.count ||
                item.quantityOrdered ||
                1
            );

            return sum + price * qty;
        }, 0);

// ================== DISCOUNT ==================
const discount = Number(order.discount) || 0;

// ================== TAX & TOTALS (SINGLE SOURCE OF TRUTH) ==================

// Subtotal = sum of item prices
const subtotalAmount = subtotal;

// Taxable amount = subtotal - discount
const taxableAmount = Math.max(0, subtotalAmount - discount);

// GST rates
const CGST_RATE = 2.5;
const SGST_RATE = 2.5;

// GST calculation
const cgstAmount = +(taxableAmount * CGST_RATE / 100).toFixed(2);
const sgstAmount = +(taxableAmount * SGST_RATE / 100).toFixed(2);

// Total tax
const totalTaxAmount = cgstAmount + sgstAmount;

// Final totals
const totalWithTax = +(taxableAmount + totalTaxAmount).toFixed(2);
const finalTotal = totalWithTax;

// Tax breakdown (UI)
const taxBreakdown = [
    {
        name: 'CGST',
        type: 'percentage',
        value: CGST_RATE,
        amount: cgstAmount,
        isInclusive: false
    },
    {
        name: 'SGST',
        type: 'percentage',
        value: SGST_RATE,
        amount: sgstAmount,
        isInclusive: false
    }
];

const transactions = [];

// ================== ORDER SOURCE ==================
const getOrderSource = () => {
    if (order.source === 'zomato' || order.priceVariant === 'Zomato') return 'Zomato';
    if (order.source === 'swiggy' || order.priceVariant === 'Swiggy') return 'Swiggy';
    if (order.isOnline || order.priceVariant === 'Online') return 'Online';
    if (order.tableId?.startsWith('Table')) return `Dine-in (${order.tableId})`;
    if (order.priceVariant === 'Takeaway') return 'Takeaway';
    return 'In-store';
};

const orderSource = getOrderSource();

// ================== SPLIT BILL ==================
if (order.splitBill?.enabled) {
    const partials = order.partialPayments || [];

    const totalPaid = partials.reduce(
        (s, p) => s + Number(p.amount || 0),
        0
    );

    const latestPaymentDate = partials.reduce((d, p) => {
        const pd = p.date?.toDate ? p.date.toDate() : new Date(p.date || 0);
        return pd > d ? pd : d;
    }, orderDate);

    const paymentMethod =
        [...new Set(partials.map(p =>
            p.paymentMode === 'DIGITAL' ? 'upi' :
            p.paymentMode === 'CASH' ? 'cash' :
            (p.paymentMode || 'cash').toLowerCase()
        ))].length === 1
            ? partials[0]?.paymentMode?.toLowerCase() || 'cash'
            : 'mixed';

    transactions.push({
        id: order.id,
        orderId: order.id,
        type: 'Sale',

        subtotal: subtotalAmount,
        taxableAmount: taxableAmount,
        taxAmount: totalTaxAmount,
        totalWithTax: totalWithTax,

        amount: totalPaid,
        orderTotal: finalTotal,

        date: latestPaymentDate,
        source: orderSource,
        paymentMethod,

        customer: order.customerName || order.customer?.name || 'Walk-in Customer',
        customerId: order.custId || order.customer?.id || null,

        items: order.items,
        order,

        discount,
        taxBreakdown,

        splitBill: true,
        isSplitParent: true
    });

    return transactions;
}

// ================== PAYMENT METHOD ==================
let paymentMethod = 'cash';
if (order.paymentMode) {
    paymentMethod =
        order.paymentMode === 'DIGITAL' ? 'upi' :
        order.paymentMode === 'CASH' ? 'cash' :
        order.paymentMode.toLowerCase();
}

// ================== CREDIT ORDER ==================
if (order.paymentMode === 'CREDIT' || order.isCredit) {
    transactions.push({
        id: `${order.id}-credit-sale`,
        orderId: order.id,
        type: 'Sale',

        subtotal: subtotalAmount,
        taxableAmount: taxableAmount,
        taxAmount: totalTaxAmount,
        totalWithTax: totalWithTax,

        amount: finalTotal,
        orderTotal: finalTotal,

        date: orderDate,
        source: orderSource,
        paymentMethod: 'credit',

        customer: order.customerName || order.customer?.name || 'Walk-in Customer',
        customerId: order.custId || order.customer?.id || null,

        items: order.items,
        order,

        discount,
        taxBreakdown,

        credit: true,
        paid: false
    });

    return transactions;
}

// ================== REGULAR PAID ORDER ==================
transactions.push({
    id: order.id,
    orderId: order.id,
    type: 'Sale',

    subtotal: subtotalAmount,
    taxableAmount: taxableAmount,
    taxAmount: totalTaxAmount,
    totalWithTax: totalWithTax,

    amount: finalTotal,
    orderTotal: finalTotal,

    date: orderDate,
    source: orderSource,
    paymentMethod,

    customer: order.customerName || order.customer?.name || 'Walk-in Customer',
    customerId: order.custId || order.customer?.id || null,

    items: order.items,
    order,

    discount,
    taxBreakdown,

    paid: true
});

return transactions;

    });
}



    /**
     * Filter transactions based on criteria
     * @param {Array} transactions - Array of transactions
     * @param {Object} filters - Filter criteria
     * @returns {Array} - Filtered transactions
     */
    static filterTransactions(transactions, filters) {
        const {
            selectedCustomer,
            dateFilter,
            customDateRange,
            searchQuery,
            customers,
            activeFilters
        } = filters;

        let filtered = [...transactions];

        // Apply customer filter
        if (selectedCustomer) {
            filtered = filtered.filter(t => t.customerId === selectedCustomer);
        }

        // Apply search query filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t => {
                // Check transaction ID
                if (t.id && t.id.toLowerCase().includes(query)) return true;

                // Check order ID
                if (t.orderId && t.orderId.toLowerCase().includes(query)) return true;

                // Check customer name
                if (t.customerName && t.customerName.toLowerCase().includes(query)) return true;

                // Check customer phone (if available)
                if (t.customerPhone && t.customerPhone.includes(query)) return true;

                // Check item names
                if (t.items && Array.isArray(t.items)) {
                    return t.items.some(item =>
                        item.title && item.title.toLowerCase().includes(query)
                    );
                }

                return false;
            });
        }

        // Apply date filter
        if (dateFilter === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            filtered = filtered.filter(t => {
                const transactionDate = new Date(t.date);
                return transactionDate >= today && transactionDate < tomorrow;
            });
        } else if (dateFilter === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            const today = new Date(yesterday);
            today.setDate(today.getDate() + 1);

            filtered = filtered.filter(t => {
                const transactionDate = new Date(t.date);
                return transactionDate >= yesterday && transactionDate < today;
            });
        } else if (dateFilter === 'last7') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            sevenDaysAgo.setHours(0, 0, 0, 0);

            filtered = filtered.filter(t => {
                const transactionDate = new Date(t.date);
                return transactionDate >= sevenDaysAgo;
            });
        } else if (dateFilter === 'last30') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setHours(0, 0, 0, 0);

            filtered = filtered.filter(t => {
                const transactionDate = new Date(t.date);
                return transactionDate >= thirtyDaysAgo;
            });
        } else if (dateFilter === 'custom' && customDateRange) {
            const { start, end } = customDateRange;
            const startDate = new Date(start);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);

            filtered = filtered.filter(t => {
                const transactionDate = new Date(t.date);
                return transactionDate >= startDate && transactionDate <= endDate;
            });
        }

        // Apply active filters (payment methods)
        if (activeFilters && activeFilters.length > 0) {
            // Map filter names to payment methods
            const paymentMethodMap = {
                'Cash': 'cash',
                'UPI/Card': 'upi',
                'Credit': 'credit',
                'Sales': 'Sale' // Transaction type filter
            };

            // If "Sales" is in filters, only include sale transactions
            if (activeFilters.includes('Sales')) {
                filtered = filtered.filter(t => t.type === 'Sale');
            }

            // Filter by payment methods
            const paymentMethods = activeFilters
                .filter(filter => paymentMethodMap[filter])
                .map(filter => paymentMethodMap[filter]);

            if (paymentMethods.length > 0) {
                filtered = filtered.filter(t => paymentMethods.includes(t.paymentMethod));
            }
        }

        // Sort transactions by date in descending order (newest first)
        filtered.sort((a, b) => {
            // Handle potential date parsing issues
            let dateA, dateB;
            try {
                dateA = new Date(a.date);
                dateB = new Date(b.date);
            } catch (e) {
                console.warn('[PassbookCalculator] Error parsing dates for sorting:', a.date, b.date, e);
                // Fallback to string comparison if date parsing fails
                return new Date(b.date) - new Date(a.date);
            }
            
            // Handle invalid dates
            if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
            if (isNaN(dateA.getTime())) return 1; // Put invalid dates at the end
            if (isNaN(dateB.getTime())) return -1; // Put invalid dates at the end
            
            return dateB - dateA;
        });

        return filtered;
    }

    /**
     * Get date range for filters
     * @param {string} filter - Filter type
     * @param {Object} customRange - Custom date range
     * @returns {Object} - Start and end dates
     */
    static getDateRange(filter, customRange) {
        const now = new Date();
        let start, end;

        switch (filter) {
            case 'today':
                start = new Date(now);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                start = new Date(now);
                start.setDate(now.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last7':
                start = new Date(now);
                start.setDate(now.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last30':
                start = new Date(now);
                start.setDate(now.getDate() - 30);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
                break;
            case 'custom':
                if (customRange && customRange.start && customRange.end) {
                    start = new Date(customRange.start);
                    start.setHours(0, 0, 0, 0);
                    end = new Date(customRange.end);
                    end.setHours(23, 59, 59, 999);
                } else {
                    start = new Date(now);
                    start.setDate(now.getDate() - 30);
                    start.setHours(0, 0, 0, 0);
                    end = new Date(now);
                    end.setHours(23, 59, 59, 999);
                }
                break;
            default:
                start = new Date(now);
                start.setDate(now.getDate() - 30);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
        }

        return { start, end };
    }

    /**
     * Calculate summary statistics from transactions
     * @param {Array} transactions - Array of transactions
     * @returns {Object} - Summary statistics
     */
    static calculateSummary(transactions) {
        let cash = 0;
        let upi = 0;
        let credit = 0;
        let creditPayments = 0;
        let wallet = 0;

        transactions.forEach(transaction => {
            const amount = Math.abs(Number(transaction.amount) || 0);

            switch (transaction.paymentMethod) {
                case 'cash':
                    cash += amount;
                    break;
                case 'upi':
                    upi += amount;
                    break;
                case 'credit':
                    if (transaction.type === 'Sale') {
                        credit += amount;
                    } else if (transaction.type === 'Payment Received') {
                        creditPayments += amount;
                    }
                    break;
                case 'wallet':
                    wallet += amount;
                    break;
            }
        });

        return {
            cash: Math.round(cash),
            upi: Math.round(upi),
            credit: Math.round(credit),
            creditPayments: Math.round(creditPayments),
            wallet: Math.round(wallet),
            total: Math.round(cash + upi + credit + creditPayments + wallet)
        };
    }
}