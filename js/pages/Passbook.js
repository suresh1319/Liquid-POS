import { useState, useEffect, useMemo } from 'react';
import { UserSession } from '../utils/UserSession.js';
import { sdk } from '../sdk.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { formatProductTitle, showToast } from '../utils.js';
import { useLanguage } from '../contexts/LanguageContext.js';

// Passbook Component
export default function Passbook() {
    const { t, language } = useLanguage();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [dateFilter, setDateFilter] = useState('last30');
    const [customDateRange, setCustomDateRange] = useState({ start: null, end: null });
    const [activeFilters, setActiveFilters] = useState(['Cash', 'Digital', 'Credit', 'Wallet', 'Sales']);
    const [showTrends, setShowTrends] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const getDateRange = (filter) => {
        return PassbookCalculator.getDateRange(filter, customDateRange);
    };

    const isDateInRange = (date, range) => {
        if (!range.start || !range.end) return true;
        const txDate = new Date(date);
        return txDate >= range.start && txDate <= range.end;
    };
    
    const toggleFilter = (filter, isExclusive = false) => {
        const dependentFilters = ["Cash", "Digital", "Credit"];
        
        setActiveFilters(prev => {
            let newFilters = [...prev];
            
            if (newFilters.includes(filter)) {
                newFilters = newFilters.filter(f => f !== filter);
                
                // If Sales is removed and not exclusive, also remove dependent filters
                if (filter === "Sales" && !isExclusive) {
                    newFilters = newFilters.filter(f => !dependentFilters.includes(f));
                }
            } else {
                newFilters.push(filter);
                
                // If Sales is added and not exclusive, add all dependent filters
                if (filter === "Sales" && !isExclusive) {
                    dependentFilters.forEach(f => {
                        if (!newFilters.includes(f)) newFilters.push(f);
                    });
                }
            }
            
            if (!isExclusive) {
                // If none of the dependent filters are active, remove Sales
                if (dependentFilters.every(f => !newFilters.includes(f))) {
                    newFilters = newFilters.filter(f => f !== "Sales");
                }
                
                // If any dependent filters are active, add Sales
                if (dependentFilters.some(f => newFilters.includes(f)) && !newFilters.includes("Sales")) {
                    newFilters.push("Sales");
                }
            }
            
            // Remove duplicates
            return [...new Set(newFilters)];
        });
    };

    useEffect(() => {
        async function fetchData() {
            try {
                console.log('[Passbook] Starting data fetch...');
                setLoading(true);
                setError(null);
                
                // Try using PassbookCalculator first
                try {
                    const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
                    const { orders, customers: customersList, transactions: transactionsList } = passbookData;

                    console.log('[Passbook] Received data from PassbookCalculator:', {
                        orders: orders.length,
                        customers: customersList.length,
                        transactions: transactionsList.length
                    });

                    // Debug: log first few transactions
                    if (transactionsList.length > 0) {
                        console.log('[Passbook] Sample transactions:', transactionsList.slice(0, 3).map(t => ({
                            id: t.id,
                            amount: t.amount,
                            date: t.date,
                            status: t.currentStatus?.label,
                            paid: t.paid,
                            type: t.type
                        })));
                    }

                    setTransactions(transactionsList);
                    setCustomers(customersList);
                    setLoading(false);
                    return;
                } catch (calculatorError) {
                    console.warn('[Passbook] PassbookCalculator failed, trying direct fetch:', calculatorError);
                }
                
                // Fallback: Direct database fetch
                console.log('[Passbook] Falling back to direct database fetch...');
                
                const ordersSnapshot = await sdk.db.collection("Orders")
                    .orderBy("date", "desc")
                    .get();

                const orders = ordersSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                const customersSnapshot = await sdk.db.collection("Customers")
                    .get();

                const customersList = customersSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Create transactions manually using the same logic
                const transactionsList = PassbookCalculator.createTransactionsFromOrders(orders, customersList);
                
                console.log('[Passbook] Direct fetch completed:', {
                    orders: orders.length,
                    customers: customersList.length,
                    transactions: transactionsList.length
                });

                setTransactions(transactionsList);
                setCustomers(customersList);
                setLoading(false);
            } catch (err) {
                console.error('[Passbook] Error fetching transactions:', err);
                setError(`Failed to load transactions: ${err.message}`);
                setLoading(false);
            }
        }

        fetchData();
        
        // Listen for order completion events to refresh data
        const handleOrderCompleted = (event) => {
            console.log('[Passbook] Order completed event received, refreshing data...', event.detail);
            fetchData();
        };

        // Listen for orderUpdated events (e.g., loyalty redemption) to refresh data
        const handleOrderUpdated = (event) => {
            console.log('[Passbook] Order updated event received, refreshing data...', event.detail);
            fetchData();
        };

        // Listen for customerUpdated events to keep passbook display in sync when a customer changes
        const handleCustomerUpdated = (e) => {
            try {
                const detail = e?.detail || {};
                const cid = detail.customerId || detail.id || null;
                const updatedFields = detail.updatedFields || {};
                if (!cid) return;
                console.log('[Passbook] customerUpdated event received for', cid, updatedFields);

                // Update in-memory customers list
                setCustomers(prev => prev.map(c => c.id === cid ? ({ ...c, ...updatedFields }) : c));

                // Update any transactions that reference this customer (in-place)
                setTransactions(prev => prev.map(t => {
                    if (t.customerId === cid) {
                        return {
                            ...t,
                            customerName: updatedFields.name || t.customerName || t.custName || null,
                            customerPhone: updatedFields.phone || t.customerPhone || t.custPhone || null
                        };
                    }
                    return t;
                }));

                // Optional: if more complex derived fields exist, refetch fully
                // fetchData();
            } catch (err) {
                console.warn('[Passbook] Error handling customerUpdated event', err);
            }
        };

        window.addEventListener('orderCompleted', handleOrderCompleted);
        // Also refresh when partial payments are added to unsettled bills
        const handlePartialPayment = (event) => {
            console.log('[Passbook] orderPartialPayment event received, refreshing data...', event.detail);
            fetchData();
        };
        window.addEventListener('orderPartialPayment', handlePartialPayment);
        
        window.addEventListener('orderUpdated', handleOrderUpdated);
        window.addEventListener('customerUpdated', handleCustomerUpdated);

        return () => {
            window.removeEventListener('orderCompleted', handleOrderCompleted);
            window.removeEventListener('orderPartialPayment', handlePartialPayment);
            window.removeEventListener('orderUpdated', handleOrderUpdated);
            window.removeEventListener('customerUpdated', handleCustomerUpdated);
        };
    }, []);

    const filteredTransactions = useMemo(() => {
        return PassbookCalculator.filterTransactions(transactions, {
            selectedCustomer,
            dateFilter,
            customDateRange,
            searchQuery,
            customers,
            activeFilters
        });
    }, [transactions, selectedCustomer, dateFilter, customDateRange, searchQuery, customers, activeFilters]);

    const summary = useMemo(() => {
        const calculatedSummary = PassbookCalculator.calculateSummary(filteredTransactions);
        
        // Debug log to verify Passbook calculations
        console.log('[Passbook] Master calculation:');
        console.log('[Passbook] Total Sales (total):', calculatedSummary.total);
        console.log('[Passbook] Total Transactions:', filteredTransactions.filter(t => t.type === 'credit').length);
        console.log('[Passbook] Summary:', calculatedSummary);
        
        return calculatedSummary;
    }, [filteredTransactions]);

    // Function to export transactions to CSV
    const exportToCSV = () => {
        setIsExporting(true);
        
        try {
            // Get currently filtered transactions
            const dataToExport = filteredTransactions.map(transaction => {
                const customerFromList = customers.find(c => c.id === transaction.customerId);
                const itemsSummary = transaction.items?.map(item => `${item.qnt}x ${formatProductTitle(item)}`).join(", ") || "";

                return {
                    date: formatDate(transaction.date, 'full'),
                    orderId: transaction.orderId || t('na'),
                    customerName: transaction.customerName || customerFromList?.name || t('unknown'),
                    customerPhone: transaction.customerPhone || customerFromList?.phone || t('na'),
                    amount: Math.abs(transaction.amount).toFixed(2),
                    paymentMethod: transaction.paymentMethod === 'cash' ? t('cash') :
                        transaction.paymentMethod === 'upi' ? 'Digital' :
                            transaction.paymentMethod === 'wallet' ? t('wallet') : t('credit'),
                    transactionType: transaction.type === 'credit' ? t('sale') : t('walletPayment'),
                    items: itemsSummary
                };
            });
            
            // Create CSV header and rows
            const headers = [t('dateAndTime'), t('orderID'), t('customer'), t('phone'), t('amount'), t('paymentMethod'), t('type'), t('items')];
            const csvContent = [
                headers.join(","),
                ...dataToExport.map(row => [
                    `"${row.date}"`,
                    `"${row.orderId}"`,
                    `"${row.customerName}"`,
                    `"${row.customerPhone}"`,
                    row.amount,
                    `"${row.paymentMethod}"`,
                    `"${row.transactionType}"`,
                    `"${row.items}"`
                ].join(","))
            ].join("\n");
            
            // Create a download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
            
            link.setAttribute('href', url);
            link.setAttribute('download', `passbook-transactions-${dateStr}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast(`Exported ${dataToExport.length} transactions successfully`, 'success');
        } catch (err) {
            console.error('Export failed:', err);
            showToast('Failed to export transactions', 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const SummaryCards = () => {
        const dateRangeOptions = [
            { value: 'today', label: t('dateToday') },
            { value: 'yesterday', label: t('dateYesterday') },
            { value: 'last7', label: t('dateLast7Days') },
            { value: 'last30', label: t('dateLast30Days') },
            { value: 'thisMonth', label: t('dateThisMonth') },
            { value: 'custom', label: t('dateCustomRange') }
        ];

        return (
            <div className="bg-white p-5 rounded-lg shadow-sm">
                {/* Reports Header with Date Filter and Export Button */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center">
                        <h3 className="text-lg font-medium text-gray-800">{t('reports')}</h3>
                        <button
                            onClick={exportToCSV}
                            disabled={isExporting || filteredTransactions.length === 0}
                            className="ml-4 px-3 py-1.5 text-sm bg-primary bg-opacity-10 text-primary hover:bg-opacity-20 rounded-lg flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className={`ph ${isExporting ? 'ph-spinner ph-spin' : 'ph-download-simple'} mr-1.5`}></i>
                            {isExporting ? t('exporting') : t('exportCSV')}
                        </button>
                    </div>
                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        {dateRangeOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>

                {/* Custom Date Range Picker */}
                {dateFilter === 'custom' && (
                    <div className="flex items-center gap-4 mb-5">
                        <input
                            type="date"
                            value={customDateRange.start?.toISOString().split('T')[0] || ''}
                            onChange={(e) => setCustomDateRange(prev => ({
                                ...prev,
                                start: e.target.value ? new Date(e.target.value) : null
                            }))}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
                        />
                        <span className="text-gray-500">{t('to')}</span>
                        <input
                            type="date"
                            value={customDateRange.end?.toISOString().split('T')[0] || ''}
                            onChange={(e) => setCustomDateRange(prev => ({
                                ...prev,
                                end: e.target.value ? new Date(e.target.value) : null
                            }))}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
                        />
                    </div>
                )}

                {/* First Row - Main Stats (2 columns) */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Sales Card */}
                    <div
                        className={`card p-4 border-2 rounded-lg ${activeFilters.includes('Sales') ? 'border-primary border-opacity-30' : 'border-transparent'} bg-white transition-all hover:shadow-sm`}
                        onClick={() => toggleFilter('Sales')}
                    >
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-gray-600">{t('sales')}</p>
                            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full flex items-center">
                                <i className="ph ph-trending-up mr-1"></i>
                                100%
                            </span>
                        </div>
                        <h3 className="text-2xl font-semibold text-gray-800 mt-1.5">
                            {UserSession?.getCurrency()}{summary.total.toFixed(0)}
                        </h3>
                    </div>

                    {/* Wallet Balance Card */}
                    <div
                        className={`card p-4 border-2 rounded-lg ${activeFilters.includes('Wallet') ? 'border-primary border-opacity-30' : 'border-transparent'} bg-white transition-all hover:shadow-sm`}
                        onClick={() => toggleFilter('Wallet')}
                    >
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-gray-600">{t('wallet')}</p>
                            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full flex items-center">
                                <i className="ph ph-trending-up mr-1"></i>
                                100%
                            </span>
                        </div>
                        <h3 className="text-2xl font-semibold text-gray-800 mt-1.5">
                            {UserSession?.getCurrency()}{summary.wallet.toFixed(0)}
                        </h3>
                    </div>
                </div>

                {/* Second Row - Payment Methods (3 columns) */}
                <div className="grid grid-cols-3 gap-4">
                    {/* Cash Card */}
                    <div
                        className={`card p-4 border-2 rounded-lg ${activeFilters.includes('Cash') ? 'border-primary border-opacity-30' : 'border-transparent'} bg-white transition-all hover:shadow-sm`}
                        onClick={() => toggleFilter('Cash')}
                    >
                        <p className="text-sm text-gray-600">{t('cash')}</p>
                        <h3 className="text-xl font-semibold text-gray-800 mt-1.5">
                            {UserSession?.getCurrency()}{summary.cash.toFixed(0)}
                        </h3>
                    </div>

                    {/* UPI/Card Card */}
                    <div
                        className={`card p-4 border-2 rounded-lg ${activeFilters.includes('Digital') ? 'border-primary border-opacity-30' : 'border-transparent'} bg-white transition-all hover:shadow-sm`}
                        onClick={() => toggleFilter('Digital')}
                    >
                        <p className="text-sm text-gray-600">Digital</p>
                        <h3 className="text-xl font-semibold text-gray-800 mt-1.5">
                            {UserSession?.getCurrency()}{summary.upi.toFixed(0)}
                        </h3>
                    </div>

                    {/* Credit Card */}
                    <div
                        className={`card p-4 border-2 rounded-lg ${activeFilters.includes('Credit') ? 'border-primary border-opacity-30' : 'border-transparent'} bg-white transition-all hover:shadow-sm`}
                        onClick={() => toggleFilter('Credit')}
                    >
                        <p className="text-sm text-gray-600">{t('credit')}</p>
                        <h3 className="text-xl font-semibold text-gray-800 mt-1.5">
                            {UserSession?.getCurrency()}{summary.creditPayments.toFixed(0)}
                        </h3>
                    </div>
                </div>

                {/* Toggle Button for Trends (Desktop Only) */}
                <div className="mt-5 hidden md:flex justify-end">
                    <button
                        onClick={() => setShowTrends(prev => !prev)}
                        className="text-sm text-primary flex items-center gap-1 hover:underline py-1"
                    >
                        <i className={`ph ph-${showTrends ? 'chart-line-down' : 'chart-line-up'}`}></i>
                        {showTrends ? t('hideTrends') : t('showTrends')}
                    </button>
                </div>
            </div>
        );
    };

    const formatDate = (date, format = 'short') => {
        if (!date) return '';

        const d = new Date(date);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (format === 'short') {
            return d.toLocaleDateString('en-GB');
        } else if (format === 'long') {
            // Check if date is today, yesterday or some other day
            if (d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate()) {
                return `${t('dateToday')}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
            } else if (d.getFullYear() === yesterday.getFullYear() &&
                d.getMonth() === yesterday.getMonth() &&
                d.getDate() === yesterday.getDate()) {
                return `${t('dateYesterday')}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;

            } else {
                return `${d.toLocaleDateString('en-GB')}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
            }
        } else if (format === 'full') {
            return d.toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return d.toLocaleString();
    };

    const TransactionCard = ({ transaction }) => {
        // Prefer customer fields attached to the transaction (new canonical), fallback to customers list
        const customerFromList = customers.find(c => c.id === transaction.customerId);
        const customer = {
            id: transaction.customerId,
            name: transaction.customerName || customerFromList?.name || transaction.custName || 'Unknown',
            phone: transaction.customerPhone || customerFromList?.phone || transaction.custPhone || ''
        };
        const firstItem = transaction.items?.[0];
        const [expanded, setExpanded] = useState(false);

        // Determine the appropriate icon based on the item title
        const getItemIcon = (item) => {
            if (!item) return "ph ph-coffee";

            const title = item.title?.toLowerCase() || "";

            if (title.includes("shake") || title.includes("juice")) return "ph ph-cup";
            if (title.includes("salad")) return "ph ph-salad";
            if (title.includes("dog") || title.includes("sandwich")) return "ph ph-hamburger";
            if (title.includes("fries")) return "ph ph-french-fries";

            // Default icon
            return "ph ph-coffee";
        };

        // Determine payment method icon and text
        const getPaymentMethodInfo = (method) => {
            switch (method) {
                case 'cash': return { icon: "ph ph-money", text: t('cash') };
                case 'upi': return { icon: "ph ph-qr-code", text: 'Digital' };
                case 'wallet': return { icon: "ph ph-wallet", text: t('wallet') };
                case 'mixed': return { icon: "ph ph-credit-card", text: "Mixed" };
                default: return { icon: "ph ph-credit-card", text: t('card') };
            }
        };

        // Get a summary of items (e.g. "2× Pizza, 3× Burger")
        const getItemsSummary = () => {
            if (!transaction.items || transaction.items.length === 0) return "";

            // Group items by title and count quantities
            const itemCounts = {};
            transaction.items.forEach(item => {
                const title = item.title || "Unknown";
                const qnt = Number(item.qnt) || 1;

                if (itemCounts[title]) {
                    itemCounts[title] += qnt;
                } else {
                    itemCounts[title] = qnt;
                }
            });

            // Format as "2× Pizza, 3× Burger"
            return Object.entries(itemCounts)
                .map(([title, count]) => `${count}× ${title}`)
                .slice(0, 2) // Show only first 2 types
                .join(", ") + (Object.keys(itemCounts).length > 2 ? "..." : "");
        };

        const paymentInfo = getPaymentMethodInfo(transaction.paymentMethod);
        const hasImage = firstItem && (firstItem.thumb || firstItem.imageUrl);
        const totalItems = transaction.items?.reduce((sum, item) => sum + (Number(item.qnt) || 1), 0) || 0;
        const isSplit = !!(transaction.splitBill && transaction.splitBill.enabled);
        const formatSplitTitle = (label) => {
            // Return the split label as-is so Passbook shows "Split 1", "Split 2", etc.
            // Previously we hid auto-generated labels; users expect numbered split entries.
            if (!label) return null;
            return label;
        };

        const toggleExpand = () => {
            setExpanded(!expanded);
        };

        return (
            <div className={`border-b border-gray-100 transition-all ${expanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                <div
                    className="p-4 cursor-pointer"
                    onClick={toggleExpand}
                >
                    <div className="flex items-center gap-3">
                        {/* Transaction Icon or First Item Image */}
                        <div className="relative w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                            {hasImage ? (
                                <img
                                    src={firstItem.thumb || firstItem.imageUrl}
                                    alt={firstItem.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.parentNode.innerHTML = `<i class="${getItemIcon(firstItem)} text-amber-700 text-xl"></i>`;
                                    }}
                                />
                            ) : (
                                <i className={`${getItemIcon(firstItem)} text-amber-700 text-xl`}></i>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-lg">
                                <span className="text-white text-xs font-medium">
                                    {totalItems}
                                </span>
                            </div>
                        </div>

                        {/* Transaction Details */}
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-medium text-gray-800 flex items-center gap-2">
                                        {isSplit ? (
                                            <>
                                                {/* For split transactions we intentionally avoid showing the split label again here
                                                    because detailed split information is shown below. Show item title if available. */}
                                                {firstItem?.title ? (
                                                    <span className="text-sm text-gray-600">{firstItem.title}</span>
                                                ) : null}
                                            </>
                                        ) : (
                                            <>
                                                {firstItem?.title || transaction.description}
                                            </>
                                        )}
                                        {transaction.partial && !transaction.settled && !(transaction.fullySettled) && Number(transaction.amount || 0) < (Number(transaction.originalAmount || 0) - 0.01) && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 tracking-wide">PARTIAL</span>
                                        )}
                                        {transaction.fullySettled && !transaction.partial && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 tracking-wide">SETTLED</span>
                                        )}
                                        {isSplit && (
                                            <span className="inline-block px-3 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full ml-1">Split bill</span>
                                        )}
                                        <i className={`ph ph-caret-${expanded ? 'up' : 'down'} ml-1 text-gray-400 text-xs`}></i>
                                    </h4>
                                    <div className="flex items-center text-xs text-gray-500 mt-0.5 flex-wrap gap-x-3">
                                        <span>{formatDate(transaction.date, 'long')}</span>
                                        {/* Show order source */}
                                        {transaction.orderSource && (
                                            <span className="flex items-center">
                                                <i className={`ph ${transaction.orderSource === 'Zomato' ? 'ph-pizza text-red-500' : 
                                                                transaction.orderSource === 'Swiggy' ? 'ph-bicycle text-orange-500' : 
                                                                transaction.orderSource.includes('Dine-in') ? 'ph-chair text-blue-500' :
                                                                transaction.orderSource === 'Takeaway' ? 'ph-shopping-bag text-green-500' :
                                                                transaction.orderSource === 'Online' ? 'ph-globe text-purple-500' :
                                                                'ph-storefront text-gray-400'} mr-1`}></i>
                                                {transaction.orderSource === 'In-store' ? t('inStore') : transaction.orderSource}
                                            </span>
                                        )}
                                        {customer && (
                                            <span className="flex items-center">
                                                <i className="ph ph-user text-gray-400 mr-1"></i>
                                                {customer.name}
                                            </span>
                                        )}
                                        {/* Show split bill info */}
                                        {transaction.splitBill && (
                                            <div className="text-xs text-gray-500 whitespace-nowrap">
                                                {t('splitBillText', { count: transaction.splitBill.numberOfPeople })}
                                                {transaction.splitBill.type === 'equal' && (
                                                    <span className="ml-1">
                                                        ({UserSession?.getCurrency() || '₹'}{transaction.splitBill.amountPerPerson.toFixed(2)} {t('splitBillEach')})
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {!expanded && transaction.items && transaction.items.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">
                                            {getItemsSummary()}
                                        </p>
                                    )}
                                </div>
                         <div className="text-right">
    {transaction.discount > 0 && !transaction.loyaltyPointsUsed && !transaction.loyaltyDiscountAmount ? (
        <>
            {/* Final Amount (Grand Total) */}
            <p className="text-lg font-medium text-gray-800">
                {UserSession?.getCurrency()}
                {Number(transaction.amount || 0).toFixed(2)}
            </p>

            {/* Subtotal (before discount) */}
            <p className="text-xs text-gray-400 line-through">
                {UserSession?.getCurrency()}
                {Number(transaction.subtotal || 0).toFixed(2)}
            </p>

            {/* Discount */}
            <p className="text-xs text-green-500">
                -{UserSession?.getCurrency()}
                {Number(transaction.discount || 0).toFixed(2)}
            </p>

            {/* Tax */}
            {transaction.taxAmount > 0 && (
                <p className="text-xs text-blue-600">
                    {t('taxCharges')}: {UserSession?.getCurrency()}
                    {Number(transaction.taxAmount || 0).toFixed(2)}
                </p>
            )}

            {/* Payment Method */}
            <p className="text-xs text-gray-500 flex items-center justify-end mt-0.5">
                <i className={`${paymentInfo.icon} mr-1`}></i>
                {paymentInfo.text}
            </p>
        </>
    ) : (
        <>
            {/* Final Amount */}
            <p className="text-lg font-medium text-gray-800">
                {UserSession?.getCurrency()}
                {Number(transaction.amount || 0).toFixed(2)}
            </p>

            {/* Tax */}
            {transaction.taxAmount > 0 && (
                <p className="text-xs text-blue-600">
                    {t('taxCharges')}: {UserSession?.getCurrency()}
                    {Number(transaction.taxAmount || 0).toFixed(2)}
                </p>
            )}

            {/* Payment Method */}
            <p className="text-xs text-gray-500 flex items-center justify-end mt-0.5">
                <i className={`${paymentInfo.icon} mr-1`}></i>
                {paymentInfo.text}
            </p>
        </>
    )}
</div>

                            </div>
                        </div>
                    </div>
                </div>

                {/* Expanded Details */}
                {expanded && (
                    <div className="p-4 pt-0 bg-gray-50 border-t border-gray-100">
                        <div className="grid gap-4">
                            {/* Order Items Table */}
                            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                                <h5 className="text-sm font-medium mb-3 flex items-center text-gray-700">
                                    <i className="ph ph-shopping-cart mr-2 text-primary"></i>
                                    {t('orderItems')}
                                </h5>
                                {transaction.items && transaction.items.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="text-left py-2 font-medium text-xs text-gray-500">{t('item')}</th>
                                                    <th className="text-center py-2 font-medium text-xs text-gray-500">{t('quantity')}</th>
                                                    <th className="text-right py-2 font-medium text-xs text-gray-500">{t('price')}</th>
                                                    <th className="text-right py-2 font-medium text-xs text-gray-500">{t('total')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {transaction.items.map((item, index) => (
                                                    <tr key={index} className="border-b border-gray-50">
                                                        <td className="py-2.5 flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-md bg-amber-50 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                                                {item.thumb || item.imageUrl ? (
                                                                    <img
                                                                        src={item.thumb || item.imageUrl}
                                                                        alt={item.title}
                                                                        className="w-full h-full object-cover"
                                                                        onError={(e) => {
                                                                            e.target.onerror = null;
                                                                            e.target.parentNode.innerHTML = `<i class="${getItemIcon(item)} text-amber-700 text-xs"></i>`;
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <i className={`${getItemIcon(item)} text-amber-700 text-xs`}></i>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="font-medium text-gray-700">{formatProductTitle(item)}</span>
                                                                {/* Show variant if available */}
                                                                {item.variantName && (
                                                                    <div className="text-xs text-gray-500">
                                                                        {t('variant')}: {item.variantName}
                                                                    </div>
                                                                )}
                                                                {/* Show add-ons if available */}
                                                                {item.addons && item.addons.length > 0 && (
                                                                    <div className="text-xs text-blue-600">
                                                                        {t('addOns')}: {item.addons.map(addon => addon.name).join(", ")}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 text-center text-gray-600">{item.qnt}</td>
                                                        <td className="py-2.5 text-right text-gray-600">{UserSession?.getCurrency()}{Number(item.price).toFixed(2)}</td>
                                                        <td className="py-2.5 text-right font-medium text-gray-700">
                                                            {UserSession?.getCurrency()}{(Number(item.price) * Number(item.qnt)).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                {transaction.discount > 0 && !transaction.loyaltyPointsUsed && !transaction.loyaltyDiscountAmount && (
   <tr className="border-t border-gray-100">
    <td colSpan="3" className="py-2 text-right font-medium text-gray-600">
        SubTotal :
    </td>
    <td className="py-2 text-right font-medium text-gray-600">
        {UserSession?.getCurrency()}{Number(transaction.subtotal || 0).toFixed(2)}

    </td>
</tr>
                                   )}

                                                {transaction.discount > 0 && (
                                                    <tr>
                                                        <td colSpan="3" className="py-2 text-right font-medium text-green-600">{t('discount')}</td>
                                                        <td className="py-2 text-right font-medium text-green-600">
                                                            -{UserSession?.getCurrency()}{transaction.discount.toFixed(2)}
                                                        </td>
                                                    </tr>
                                                )}
                                                
                                                {/* Tax Breakdown - hide detailed tax lines for collapsed split transactions (we keep totals) */}
                                                {transaction.taxBreakdown && transaction.taxBreakdown.length > 0 && (
                                                    <>
                                                        <tr className="border-t border-gray-100">
                                                            <td colSpan="4" className="py-2 text-left font-medium text-gray-600 text-xs">
                                                                {t('taxChargesBreakdown')}
                                                            </td>
                                                        </tr>
                                                        {transaction.taxBreakdown.map((tax, index) => (
                                                            <tr key={index}>
                                                                <td colSpan="3" className="py-1 text-right text-gray-600 text-sm">
                                                                    {tax.name} ({tax.type === 'percentage' ? `${tax.value}%` : `${UserSession?.getCurrency()}${tax.value}`})
                                                                </td>
                                                                <td className="py-1 text-right text-gray-600 text-sm">
                                                                    {UserSession?.getCurrency()}{tax.amount.toFixed(2)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        <tr>
                                                            <td colSpan="3" className="py-2 text-right font-medium text-blue-600">{t('totalTax')}</td>
                                                            <td className="py-2 text-right font-medium text-blue-600">
                                                                {UserSession?.getCurrency()}{(transaction.taxAmount || 0).toFixed(2)}
                                                            </td>
                                                        </tr>
                                                        {/* Total with tax (canonical pre-loyalty final amount) */}
                                                        <tr>
                                                            <td colSpan="3" className="py-2 text-right font-medium text-gray-600">Total (with tax)</td>
                                                            <td className="py-2 text-right font-medium text-gray-800">
    {UserSession?.getCurrency()}{transaction.totalWithTax.toFixed(2)}
</td>

                                                        </tr>
                                                        {/* Loyalty rows (moved below total-with-tax) */}
                                                        {transaction.loyaltyPointsUsed && transaction.loyaltyPointsUsed > 0 && (
                                                            <>
                                                                <tr>
                                                                    <td colSpan="3" className="py-2 text-right font-medium text-gray-600">Loyalty Points Used</td>
                                                                    <td className="py-2 text-right font-medium text-gray-800">{Number(transaction.loyaltyPointsUsed || 0)} pts</td>
                                                                </tr>
                                                                <tr>
                                                                    <td colSpan="3" className="py-2 text-right font-medium text-green-600">Redeemed Points</td>
                                                                    <td className="py-2 text-right font-medium text-green-600">
                                                                        -{UserSession?.getCurrency()}{(Number(transaction.loyaltyDiscountAmount || 0)).toFixed(2)}
                                                                    </td>
                                                                </tr>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                                
                                                <tr className="border-t border-gray-200">
                                                    <td colSpan="3" className="py-3 text-right font-medium text-gray-600">{t('grandTotal')}</td>
                                                    <td className="py-3 text-right font-semibold text-gray-800">
                                                        {UserSession?.getCurrency()}{Math.abs(transaction.amount).toFixed(2)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 text-center py-2">{t('noItemsToDisplay')}</p>
                                )}
                            </div>

                            {/* Transaction Details Card */}
                            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                                <h5 className="text-sm font-medium mb-3 flex items-center text-gray-700">
                                    <i className="ph ph-info mr-2 text-blue-600"></i>
                                    {t('transactionDetails')}
                                </h5>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                                    {/* Left Column */}
                                    <div>
                                        <div className="mb-3">
                                            <div className="text-xs text-gray-500">{t('orderID')}</div>
                                            <div className="font-medium text-gray-700">{transaction.orderId || t('na')}</div>
                                        </div>
                                        <div className="mb-3">
                                            <div className="text-xs text-gray-500">{t('dateTime')}</div>
                                            <div className="font-medium text-gray-700">{formatDate(transaction.date, 'full')}</div>
                                        </div>
                                        <div className="mb-3">
                                            <div className="text-xs text-gray-500">{t('type')}</div>
                                            <div className="font-medium text-gray-700">{transaction.type === 'credit' ? t('sale') : t('walletPayment')}</div>
                                        </div>
                                    </div>
                                    {/* Right Column */}
                                    <div>
                                        <div className="mb-3">
                                            <div className="text-xs text-gray-500">{t('paymentMethod')}</div>
                                            <div className="font-medium text-gray-700 flex items-center">
                                                <i className={`${paymentInfo.icon} mr-2 text-gray-600`}></i>
                                                {paymentInfo.text}
                                            </div>
                                        </div>
                                        {/* Order Source */}
                                        {transaction.orderSource && (
                                            <div className="mb-3">
                                                <div className="text-xs text-gray-500">{t('orderSource')}</div>
                                                <div className="font-medium text-gray-700 flex items-center">
                                                    <i className={`ph mr-2 ${transaction.orderSource === 'Zomato' ? 'ph-pizza text-red-500' : 
                                                                            transaction.orderSource === 'Swiggy' ? 'ph-bicycle text-orange-500' : 
                                                                            transaction.orderSource.includes('Dine-in') ? 'ph-chair text-blue-500' :
                                                                            transaction.orderSource === 'Takeaway' ? 'ph-shopping-bag text-green-500' :
                                                                            transaction.orderSource === 'Online' ? 'ph-globe text-purple-500' :
                                                                            'ph-storefront text-gray-600'}`}></i>
                                                    {transaction.orderSource === 'In-store' ? t('inStore') : transaction.orderSource}
                                                </div>
                                            </div>
                                        )}
                                        {/* Split Bill Details */}
                                        {transaction.splitBill && (
                                            <div className="mb-3">
                                                <div className="text-xs text-gray-500 mb-2">{t('splitBillDetails')}</div>
                                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                                                    <div className="flex items-center mb-2">
                                                        <i className="ph ph-users mr-2 text-purple-600"></i>
                                                        <span className="font-medium text-purple-800">{t('splitAmong', { count: transaction.splitBill.numberOfPeople })}</span>
                                                    </div>

                                                    {/* Gather actual split transactions for this order (if any) */}
                                                    {(() => {
                                                        // First, prefer splits embedded on the transaction (new collapsed format)
                                                        let orderSplits = [];
                                                        if (transaction.splits && Array.isArray(transaction.splits) && transaction.splits.length > 0) {
                                                            orderSplits = transaction.splits.map(s => ({
                                                                id: s.id,
                                                                payer: s.payer,
                                                                paidAmount: s.paidAmount,
                                                                paymentMethod: s.paymentMethod,
                                                                date: s.date,
                                                                paid: s.paid,
                                                                splitLabel: s.splitLabel
                                                            }));
                                                        } else {
                                                            // Backwards compatible: look for legacy per-split transactions
                                                            orderSplits = filteredTransactions.filter(t => t.orderId === transaction.orderId && t.id && t.id.toString().includes(`${transaction.orderId}-split-`));
                                                        }

                                                        // Ensure splits are shown in ascending numeric order (Split 1, Split 2, ...)
                                                        try {
                                                            orderSplits = orderSplits.slice().sort((a, b) => {
                                                                const extractIndex = (tx) => {
                                                                    if (typeof tx.splitIndex === 'number') return tx.splitIndex;
                                                                    // Try to parse from id like '<orderId>-split-3'
                                                                    if (tx.id) {
                                                                        const m = tx.id.toString().match(/-split-(\d+)$/i);
                                                                        if (m && m[1]) return Number(m[1]);
                                                                    }
                                                                    // Try to parse from splitLabel like 'Split 3'
                                                                    if (tx.splitLabel) {
                                                                        const m2 = tx.splitLabel.toString().match(/(\d+)/);
                                                                        if (m2 && m2[1]) return Number(m2[1]);
                                                                    }
                                                                    return 0;
                                                                };

                                                                const ia = extractIndex(a) || 0;
                                                                const ib = extractIndex(b) || 0;
                                                                return ia - ib;
                                                            });
                                                        } catch (e) {
                                                            console.warn('Failed to sort orderSplits by index, leaving original order', e);
                                                        }

                                                        if (orderSplits && orderSplits.length > 0) {
                                                            return (
                                                                <div className="bg-white rounded p-2">
                                                                    <p className="text-xs font-medium text-purple-700 mb-2 text-center">Split Payments</p>
                                                                    <div className="space-y-1">
                                                                        {orderSplits.map((splitTx, idx) => (
                                                                            <div key={splitTx.id} className="flex justify-between items-center text-sm py-1 border-b border-purple-100 last:border-b-0">
                                                                                <div className="flex items-start flex-col">
                                                                                    <span className="font-medium text-gray-700">{splitTx.payer || formatSplitTitle(splitTx.splitLabel) || 'Split'}</span>
                                                                                    <span className="text-xs text-gray-500">{formatDate(splitTx.date || splitTx.paymentDate, 'long')}</span>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <div className="font-bold text-purple-600">{UserSession?.getCurrency()}{(splitTx.paidAmount || splitTx.amount || 0).toFixed(2)}</div>
                                                                                    <div className="text-xs text-gray-500">{splitTx.paymentMethod ? (splitTx.paymentMethod === 'upi' ? 'Digital' : splitTx.paymentMethod === 'cash' ? 'Cash' : splitTx.paymentMethod === 'mixed' ? 'Mixed' : splitTx.paymentMethod) : 'Unpaid'}</div>
                                                                                    <div className="text-xs mt-1">
                                                                                        {splitTx.paid ? (
                                                                                            <span className="inline-block px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Paid</span>
                                                                                        ) : (
                                                                                            <span className="inline-block px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">Pending</span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        // No recorded split payments yet — show expected amounts
                                                        return (
                                                            <>
                                                                {transaction.splitBill.type === 'equal' ? (
                                                                    <div className="bg-white rounded p-2 text-center">
                                                                        <p className="text-sm font-medium text-purple-700">
                                                                            Each person pays: <span className="text-lg">{UserSession?.getCurrency()}{transaction.splitBill.amountPerPerson.toFixed(2)}</span>
                                                                        </p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-white rounded p-2">
                                                                        <p className="text-xs font-medium text-purple-700 mb-2 text-center">Individual Amounts:</p>
                                                                        <div className="space-y-1">
                                                                            {transaction.splitBill.customSplits.map((split, index) => (
                                                                                <div key={index} className="flex justify-between text-sm py-1 border-b border-purple-100 last:border-b-0">
                                                                                    <span className="font-medium text-gray-700">{split.name}</span>
                                                                                    <span className="font-bold text-purple-600">{UserSession?.getCurrency()}{Number(split.amount || 0).toFixed(2)}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <div className="mt-2 text-xs text-center text-purple-600">
                                                                    💡 Total bill: {UserSession?.getCurrency()}{(transaction.originalAmount || transaction.expectedAmount || transaction.amount).toFixed(2)}
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {customer && (
                                            <div className="mb-3">
                                                <div className="text-xs text-gray-500">{t('customer')}</div>
                                                <div className="font-medium text-gray-700 flex items-center">
                                                    <i className="ph ph-user mr-2 text-gray-600"></i>
                                                    {customer.name || t('unknownCustomer')}
                                                    {customer.phone && (
                                                        <span className="text-xs text-gray-500 ml-2">({customer.phone})</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {/* Tax Breakdown in Transaction Details - hide detailed tax lines for collapsed split transactions */}
                                        {transaction.taxBreakdown && transaction.taxBreakdown.length > 0 && !isSplit && (
                                            <div className="mb-3">
                                                <div className="text-xs text-gray-500 mb-2">{t('taxCharges')}</div>
                                                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                                                    {transaction.taxBreakdown.map((tax, index) => (
                                                        <div key={index} className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-600">
                                                                {tax.name} ({tax.type === 'percentage' ? `${tax.value}%` : `${UserSession?.getCurrency()}${tax.value}`})
                                                            </span>
                                                            <span className="font-medium text-gray-700">
                                                                {UserSession?.getCurrency()}{tax.amount.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    <div className="border-t pt-1 mt-2 flex justify-between items-center text-sm font-medium">
                                                        <span className="text-blue-600">{t('totalTax')}</span>
                                                        <span className="text-blue-600">
                                                            {UserSession?.getCurrency()}{(transaction.taxAmount || 0).toFixed(2)}

                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Display loyalty points used and discount if available */}
                                        {transaction.loyaltyPointsUsed && transaction.loyaltyPointsUsed > 0 ? (
                                            <div className="mb-3">
                                                <div className="text-xs text-gray-500">{t('amount')}</div>
                                                <div>
                                                    <div className="font-medium text-lg text-primary">
                                                        {UserSession?.getCurrency()}{Math.abs(transaction.amount).toFixed(2)}
                                                    </div>
                                                    <div className="text-xs text-gray-400 line-through">
                                                        {UserSession?.getCurrency()}{Math.abs(transaction.originalAmount).toFixed(2)}
                                                    </div>
                                                    <div className="text-xs text-green-500">
                                                        Redeemed Points: {Number(transaction.loyaltyPointsUsed || 0)} pts (-{UserSession?.getCurrency()}{(Number(transaction.loyaltyDiscountAmount || 0)).toFixed(2)})
                                                    </div>
                                                </div>
                                            </div>
                                        ) : transaction.discount > 0 ? (
                                            <div className="mb-3">
                                                <div className="text-xs text-gray-500">{t('amount')}</div>
                                                <div>
                                                    <div className="font-medium text-lg text-primary">
                                                        {UserSession?.getCurrency()}{Math.abs(transaction.amount).toFixed(2)}
                                                    </div>
                                                    <div className="text-xs text-gray-400 line-through">
                                                        {UserSession?.getCurrency()}{Math.abs(transaction.originalAmount).toFixed(2)}
                                                    </div>
                                                    <div className="text-xs text-green-500">
                                                        {t('discount')}: {UserSession?.getCurrency()}{transaction.discount.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mb-3">
                                                <div className="text-xs text-gray-500">{t('totalAmount')}</div>
                                                <div className="font-medium text-lg text-primary">
                                                    {UserSession?.getCurrency()}{Math.abs(transaction.amount).toFixed(2)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // New component for transaction analysis (only shown on desktop)
    const TransactionTrends = () => {
        if (!showTrends) return null;

        // Calculate top products
        const productCounts = {};
        filteredTransactions.forEach(transaction => {
            transaction.items?.forEach(item => {
                if (item.title) {
                    productCounts[item.title] = (productCounts[item.title] || 0) + 1;
                }
            });
        });

        const topProducts = Object.keys(productCounts)
            .map(title => ({ title, count: productCounts[title] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return (
            <div className="bg-white p-4 rounded-lg shadow-sm mt-4 hidden md:block">
                <h3 className="text-lg font-medium mb-4">{t('transactionAnalysis')}</h3>

                <div className="grid grid-cols-2 gap-4">
                    {/* Top Products */}
                    <div className="border rounded-lg p-4">
                        <h4 className="text-base font-medium mb-3 flex items-center">
                            <i className="ph ph-fire mr-2 text-amber-500"></i>
                            {t('popularProducts')}
                        </h4>
                        {topProducts.length > 0 ? (
                            <div className="space-y-2">
                                {topProducts.map((product, index) => (
                                    <div key={index} className="flex justify-between items-center">
                                        <span className="text-sm">{product.title}</span>
                                        <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                                            {product.count} {t('orders')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">{t('noProductData')}</p>
                        )}
                    </div>

                    {/* Payment Method Distribution */}
                    <div className="border rounded-lg p-4">
                        <h4 className="text-base font-medium mb-3 flex items-center">
                            <i className="ph ph-credit-card mr-2 text-blue-500"></i>
                            {t('paymentMethods')}
                        </h4>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm flex items-center">
                                    <i className="ph ph-money mr-1 text-green-600"></i>
                                    {t('cash')}
                                </span>
                                <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                                    {UserSession?.getCurrency()}{summary.cash.toFixed(0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm flex items-center">
                                    <i className="ph ph-qr-code mr-1 text-blue-600"></i>
                                    Digital
                                </span>
                                <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                                    {UserSession?.getCurrency()}{summary.upi.toFixed(0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm flex items-center">
                                    <i className="ph ph-credit-card mr-1 text-red-600"></i>
                                    {t('credit')}
                                </span>
                                <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                                    {UserSession?.getCurrency()}{summary.creditPayments.toFixed(0)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="p-4 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-600">
                {error}
            </div>
        );
    }

    if (filteredTransactions.length === 0) {
        return (
            <div className="p-4 max-w-5xl mx-auto">
                <SummaryCards />
                <div className="mt-8 text-center bg-white p-8 rounded-lg shadow-sm">
                    <i className="ph ph-credit-card text-4xl text-gray-400"></i>
                    <h3 className="mt-2 text-lg font-semibold text-gray-700">{t('noTransactions')}</h3>
                    <p className="text-sm text-gray-500">
                        {activeFilters.length === 0
                            ? t('noTransactionsFound')
                            : t('posSaleHint')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <SummaryCards />
            <TransactionTrends />
            <div className="mt-5 bg-white rounded-lg overflow-hidden shadow-sm">
                <div className="py-3 px-4 bg-gray-50 border-b flex justify-between items-center">
                    <h3 className="font-medium text-gray-700">{t('recentTransactions')}</h3>
                    <span className="text-xs text-gray-500">{t('transactionsCount', { count: filteredTransactions.length })}</span>
                </div>
                {filteredTransactions.map((transaction, index) => (
                    <TransactionCard
                        key={`${transaction.id}-${index}`}
                        transaction={transaction}
                    />
                ))}
            </div>
        </div>
    );
}
