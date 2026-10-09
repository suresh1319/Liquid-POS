import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { UserSession } from '../utils/UserSession.js';
import { sdk } from '../sdk.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { useLanguage } from '../contexts/LanguageContext.js';

Chart.register(...registerables);

// Analytics Component
export default function Analytics() {
    const { t, language } = useLanguage();
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateFilter, setDateFilter] = useState('last7'); // Match Passbook default
    const [customDateRange, setCustomDateRange] = useState({ start: null, end: null });
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    // Date filter options
    const dateFilters = [
        { id: 'today', label: t('dateToday') },
        { id: 'yesterday', label: t('dateYesterday') },
        { id: 'last7', label: t('dateLast7Days') },
        { id: 'last30', label: t('dateLast30Days') },
        { id: 'custom', label: t('dateCustomRange') }
    ];

    // Get date range based on filter - use PassbookCalculator for consistency
    const getDateRange = (filter) => {
        return PassbookCalculator.getDateRange(filter, customDateRange);
    };

    // Check if a date is within the selected range
    const isDateInRange = (date, range) => {
        if (!range.start || !range.end) return true;

        // Handle Firebase Timestamp or regular date
        const orderDate = date?.toDate ? date.toDate() : new Date(date);
        return orderDate >= range.start && orderDate <= range.end;
    };

    // Calculate trends by comparing with previous period
    const calculateTrends = (currentOrders, previousOrders) => {
        // If no previous data, return 0 (no change)
        if (!previousOrders || previousOrders.length === 0) {
            return {
                sales: 0,
                orders: 0,
                turnAround: 0,
                orderValue: 0
            };
        }

        // Helper function to determine if an order is online (for trends)
        const isOnlineOrderTrend = (order) => {
            const source = (order.source || '').toLowerCase();
            const priceVariant = (order.priceVariant || '').toLowerCase();
            const tableId = (order.tableId || '').toLowerCase();
            
            return order.isOnline || 
                   source === 'zomato' || 
                   source === 'swiggy' || 
                   priceVariant === 'zomato' || 
                   priceVariant === 'swiggy' ||
                   tableId === 'zomato' ||
                   tableId === 'swiggy';
        };

        // Use PassbookCalculator for consistent sales calculation
        const currentTransactions = PassbookCalculator.createTransactionsFromOrders(currentOrders);
        const currentSalesTransactions = currentTransactions.filter(t => t.type === 'credit');
        const currentSales = currentSalesTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

        const currentOrderCount = currentOrders.length;

        const currentTurnAround = currentOrders.reduce((sum, order) => {
            if (!order.date || !order.completedAt) return sum;
            const start = order.date?.toDate ? order.date.toDate() : new Date(order.date);
            const end = order.completedAt?.toDate ? order.completedAt.toDate() : new Date(order.completedAt);
            return sum + (end - start) / (1000 * 60); // in minutes
        }, 0) / (currentOrders.filter(o => o.date && o.completedAt).length || 1);

        const currentOrderValue = currentSales / (currentOrderCount || 1);

        // Use PassbookCalculator for consistent previous sales calculation
        const previousTransactions = PassbookCalculator.createTransactionsFromOrders(previousOrders);
        const previousSalesTransactions = previousTransactions.filter(t => t.type === 'credit');
        const previousSales = previousSalesTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

        const previousOrderCount = previousOrders.length;

        const previousTurnAround = previousOrders.reduce((sum, order) => {
            if (!order.date || !order.completedAt) return sum;
            const start = order.date?.toDate ? order.date.toDate() : new Date(order.date);
            const end = order.completedAt?.toDate ? order.completedAt.toDate() : new Date(order.completedAt);
            return sum + (end - start) / (1000 * 60); // in minutes
        }, 0) / (previousOrders.filter(o => o.date && o.completedAt).length || 1);

        const previousOrderValue = previousSales / (previousOrderCount || 1);

        // Calculate percentage changes
        const calculatePercentChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return ((current - previous) / previous) * 100;
        };

        return {
            sales: calculatePercentChange(currentSales, previousSales),
            orders: calculatePercentChange(currentOrderCount, previousOrderCount),
            turnAround: calculatePercentChange(currentTurnAround, previousTurnAround),
            orderValue: calculatePercentChange(currentOrderValue, previousOrderValue)
        };
    };

    useEffect(() => {
        async function fetchAnalytics() {
            try {
                setLoading(true);
                setError(null);

                // Get current date range
                const currentRange = getDateRange(dateFilter);

                // Use PassbookCalculator to get the exact same data as Passbook
                const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
                const { transactions: allTransactions, customers, orders: allOrders } = passbookData;

                // Filter transactions for current period using Passbook's filtering logic
                console.log('[Analytics] Filtering with:', {
                    dateFilter,
                    customDateRange,
                    totalTransactions: allTransactions.length,
                    dateRange: currentRange
                });
                
                const currentPeriodTransactions = PassbookCalculator.filterTransactions(allTransactions, {
                    dateFilter,
                    customDateRange,
                    searchQuery: '', // Empty search query like Passbook default
                    selectedCustomer: null, // No customer selected like Passbook default
                    customers,
                    activeFilters: ['Cash', 'Digital', 'Credit', 'Wallet', 'Sales'] // Same as Passbook default
                });
                
                console.log('[Analytics] Filtered transactions:', currentPeriodTransactions.length);

                // Get the orders corresponding to these transactions
                const currentPeriodOrders = allOrders.filter(order => 
                    currentPeriodTransactions.some(t => t.orderId === order.id));
                

                // Calculate previous period range (same duration, earlier dates)
                const previousRange = {
                    start: currentRange.start ? new Date(currentRange.start.getTime() - (currentRange.end - currentRange.start)) : null,
                    end: currentRange.start ? new Date(currentRange.start) : null
                };

                // Filter transactions for previous period using Passbook's logic
                const previousPeriodTransactions = PassbookCalculator.filterTransactions(allTransactions, {
                    dateFilter: 'custom',
                    customDateRange: previousRange,
                    searchQuery: '', // Empty search query like Passbook default
                    selectedCustomer: null, // No customer selected like Passbook default
                    customers,
                    activeFilters: ['Cash', 'Digital', 'Credit', 'Wallet', 'Sales'] // Same as Passbook default
                });

                // Get the orders corresponding to previous period transactions
                const previousPeriodOrders = allOrders.filter(order => 
                    previousPeriodTransactions.some(t => t.orderId === order.id));

                // Calculate trends
                const trends = calculateTrends(currentPeriodOrders, previousPeriodOrders);

                // Calculate metrics using Passbook's transaction-based approach
                const currentSummary = PassbookCalculator.calculateSummary(currentPeriodTransactions);
                const totalRevenue = currentSummary.credit; // Use credit (sales) from Passbook calculation
                const totalOrders = currentPeriodTransactions.filter(t => t.type === 'credit').length;

                // Debug log to verify consistency with Passbook
                console.log('[Analytics] Using Passbook calculation method:');
                console.log('[Analytics] Date Filter:', dateFilter);
                console.log('[Analytics] Total Revenue:', totalRevenue);
                console.log('[Analytics] Total Credit Transactions:', totalOrders);
                console.log('[Analytics] Current Summary:', currentSummary);
                console.log('[Analytics] All Transactions Count:', allTransactions.length);
                console.log('[Analytics] Current Period Transactions:', currentPeriodTransactions.length);

                // Calculate average turn around time
                const completedOrders = currentPeriodOrders.filter(order => order.date && order.completedAt);
                const avgTurnAroundTime = completedOrders.reduce((sum, order) => {
                    const start = order.date?.toDate ? order.date.toDate() : new Date(order.date);
                    const end = order.completedAt?.toDate ? order.completedAt.toDate() : new Date(order.completedAt);
                    return sum + (end - start) / (1000 * 60); // in minutes
                }, 0) / (completedOrders.length || 1);

                // Helper function to determine if an order is online
                const isOnlineOrder = (order) => {
                    const source = (order.source || '').toLowerCase();
                    const priceVariant = (order.priceVariant || '').toLowerCase();
                    const tableId = (order.tableId || '').toLowerCase();
                    
                    return order.isOnline || 
                           source === 'zomato' || 
                           source === 'swiggy' || 
                           priceVariant === 'zomato' || 
                           priceVariant === 'swiggy' ||
                           tableId === 'zomato' ||
                           tableId === 'swiggy';
                };

                // Split orders by type - include Swiggy and Zomato as online orders
                const onlineOrders = currentPeriodOrders.filter(order => isOnlineOrder(order));
                const zomatoOrders = currentPeriodOrders.filter(order => {
                    const source = (order.source || '').toLowerCase();
                    const priceVariant = (order.priceVariant || '').toLowerCase();
                    const tableId = (order.tableId || '').toLowerCase();
                    
                    return source === 'zomato' || 
                           priceVariant === 'zomato' || 
                           tableId === 'zomato';
                });
                const swiggyOrders = currentPeriodOrders.filter(order => {
                    const source = (order.source || '').toLowerCase();
                    const priceVariant = (order.priceVariant || '').toLowerCase();
                    const tableId = (order.tableId || '').toLowerCase();
                    
                    return source === 'swiggy' || 
                           priceVariant === 'swiggy' || 
                           tableId === 'swiggy';
                });

                // Split orders by payment status
                const paidOrders = currentPeriodOrders.filter(order => order.paid === true);
                const creditOrders = currentPeriodOrders.filter(order => order.payMode === 'CREDIT' && !order.paid);
                const unsettledOrders = currentPeriodOrders.filter(order => order.payMode === 'UNSETTLED');
                const partiallySettledOrders = unsettledOrders.filter(order => order.settledAmount > 0 && !order.settled);
                const fullyUnsettledOrders = unsettledOrders.filter(order => order.settledAmount === 0 || !order.settledAmount);

                // Calculate total unsettled amount using transaction data
                const totalUnsettledAmount = unsettledOrders.reduce((sum, order) => {
                    const transaction = currentPeriodTransactions.find(t => t.orderId === order.id && t.type === 'credit');
                    const orderTotal = transaction ? transaction.amount : 0;
                    const settledAmount = order.settledAmount || 0;
                    return sum + Math.max(0, orderTotal - settledAmount); // Ensure non-negative
                }, 0);

                // Calculate revenues by type using transaction data (Passbook's approach)
                const zomatoTransactions = currentPeriodTransactions.filter(t => t.type === 'credit' && t.orderSource === 'Zomato');
                const swiggyTransactions = currentPeriodTransactions.filter(t => t.type === 'credit' && t.orderSource === 'Swiggy');
                const onlineTransactions = currentPeriodTransactions.filter(t => t.type === 'credit' && ['Zomato', 'Swiggy', 'Online'].includes(t.orderSource));
                
                const zomatoSales = zomatoTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
                const swiggySales = swiggyTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
                const onlineSales = onlineTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
                
                // Offline Sales = Total Sales - Online Sales (as per user requirements)
                const offlineSales = totalRevenue - onlineSales;
                
                // Dine-in Sales = Offline Sales (as per user requirements)
                const dineInSales = offlineSales;

                // Determine order source for display
                const getOrderSource = (order) => {
                    const source = (order.source || '').toLowerCase();
                    const priceVariant = (order.priceVariant || '').toLowerCase();
                    const tableId = (order.tableId || '').toLowerCase();
                    
                    if (source === 'zomato' || priceVariant === 'zomato' || tableId === 'zomato') {
                        return 'Zomato';
                    }
                    if (source === 'swiggy' || priceVariant === 'swiggy' || tableId === 'swiggy') {
                        return 'Swiggy';
                    }
                    if (order.isOnline || order.priceVariant === 'Online') {
                        return 'Online';
                    }
                    if (order.tableId && order.tableId.startsWith('Table')) {
                        return `Dine-in (${order.tableId})`;
                    }
                    if (order.priceVariant === 'Takeaway') {
                        return 'Takeaway';
                    }
                    return 'In-store';
                };

                // Extract split bill information and process additional order details
                currentPeriodOrders.forEach(order => {
                    // Extract split bill information
                    const splitBillInfo = order.splitBill && order.splitBill.enabled ? order.splitBill : null;
                    
                    // Determine order source for display
                    const orderSource = getOrderSource(order);
                    
                    // Calculate individual tax amounts for breakdown
                    const taxBreakdown = [];
                    let totalTaxAmount = 0;
                    
                    if (order.charges && Array.isArray(order.charges)) {
                        order.charges.forEach(charge => {
                            if (!charge.inclusive) { // Only add exclusive charges
                                let taxAmount = 0;
                                const subtotal = (order.items || []).reduce((sum, item) =>
                                    sum + ((Number(item.price) || 0) * (Number(item.quantity || item.qnt || 0))), 0);
                                const discount = order.discount || 0;
                                const subtotalAfterDiscount = subtotal - discount;
                                
                                if (charge.type === 'percentage') {
                                    const percentage = parseFloat(charge.value) || 0;
                                    taxAmount = (subtotalAfterDiscount * percentage) / 100;
                                } else {
                                    taxAmount = parseFloat(charge.value) || 0;
                                }
                                
                                if (taxAmount > 0) {
                                    taxBreakdown.push({
                                        name: charge.name,
                                        type: charge.type,
                                        value: charge.value,
                                        amount: taxAmount
                                    });
                                    totalTaxAmount += taxAmount;
                                }
                            }
                        });
                    }
                    
                    // Store additional order processing info if needed
                    if (splitBillInfo || taxBreakdown.length > 0) {
                        order._processingInfo = {
                            splitBillInfo,
                            taxBreakdown,
                            totalTaxAmount,
                            orderSource
                        };
                    }
                });

                setMetrics({
                    totalSales: totalRevenue,
                    totalOrders,
                    avgTurnAroundTime,
                    avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
                    offlineSales,
                    onlineSales,
                    zomatoSales,
                    swiggySales,
                    dineInSales,
                    
                    // Payment status metrics
                    paidOrders: paidOrders.length,
                    creditOrders: creditOrders.length,
                    unsettledOrders: unsettledOrders.length,
                    partiallySettledOrders: partiallySettledOrders.length,
                    fullyUnsettledOrders: fullyUnsettledOrders.length,
                    totalUnsettledAmount,
                    
                    trends
                });

                setLoading(false);
            } catch (err) {
                console.error('Error fetching analytics:', err);
                setError(t('errorLoadingAnalytics'));
                setLoading(false);
            }
        }

        fetchAnalytics();

        // Set up real-time listener for orders
        const unsubscribeOrders = sdk.db.collection("Orders")
            .onSnapshot((snapshot) => {
                console.log("Orders collection updated, refreshing analytics data...");
                fetchAnalytics();
            }, (error) => {
                console.error("Error listening to orders:", error);
            });

        // Set up real-time listener for customers
        const unsubscribeCustomers = sdk.db.collection("Customers")
            .onSnapshot((snapshot) => {
                console.log("Customers collection updated, refreshing analytics data...");
                fetchAnalytics();
            }, (error) => {
                console.error("Error listening to customers:", error);
            });

        // Cleanup listeners on component unmount
        return () => {
            unsubscribeOrders();
            unsubscribeCustomers();
        };
    }, [dateFilter, customDateRange]);

    const exportToCSV = async () => {
        try {
            setIsExporting(true);
            const range = getDateRange(dateFilter);
            const ordersSnapshot = await sdk.db.collection("Orders")
                .where("date", ">=", range.start)
                .where("date", "<=", range.end)
                .orderBy("date", "desc")
                .get();

            const orders = ordersSnapshot.docs.map(doc => {
                const data = doc.data();
                
                // Use the same logic as analytics to determine if order is online
                const source = (data.source || '').toLowerCase();
                const priceVariant = (data.priceVariant || '').toLowerCase();
                const tableId = (data.tableId || '').toLowerCase();
                
                const isOrderOnline = data.isOnline || 
                                     source === 'zomato' || 
                                     source === 'swiggy' || 
                                     priceVariant === 'zomato' || 
                                     priceVariant === 'swiggy' ||
                                     tableId === 'zomato' ||
                                     tableId === 'swiggy';
                
                return {
                    id: doc.id,
                    date: data.date?.toDate?.().toLocaleString() || '',
                    total: (data.items || []).reduce((sum, item) =>
                        sum + ((Number(item.price) || 0) * (Number(item.quantity || item.qnt || 0))), 0),
                    items: data.items?.length || 0,
                    type: isOrderOnline ? 'Online' : 'Offline',
                    source: data.source || (priceVariant === 'zomato' ? 'Zomato' : 
                                           priceVariant === 'swiggy' ? 'Swiggy' : 'Direct'),
                    status: data.status?.[data.status.length - 1]?.type || 'Unknown',
                    splitBill: data.splitBill?.enabled ? `Split ${data.splitBill.numberOfPeople} ways` : 'No'
                };
            });

            const csvContent = [
                ['Order ID', 'Date', 'Total', 'Items', 'Type', 'Source', 'Status', 'Split Bill'],
                ...orders.map(order => [
                    order.id,
                    order.date,
                    order.total,
                    order.items,
                    order.type,
                    order.source,
                    order.status,
                    order.splitBill
                ])
            ].map(row => row.join(',')).join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analytics_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Error exporting data:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const MetricCard = ({ title, value, trend, type = 'currency', className = '', onClick }) => {
        const chartRef = useRef(null);
        const canvasRef = useRef(null);

        // Color schemes for different metric types
        const colorSchemes = {
            totalSales: {
                background: 'bg-gradient-to-br from-emerald-50 to-teal-50',
                border: 'border-emerald-100',
                chart: {
                    line: '#059669',
                    fill: 'rgba(5, 150, 105, 0.1)'
                }
            },
            totalOrders: {
                background: 'bg-gradient-to-br from-blue-50 to-indigo-50',
                border: 'border-blue-100',
                chart: {
                    line: '#4F46E5',
                    fill: 'rgba(79, 70, 229, 0.1)'
                }
            },
            turnAround: {
                background: 'bg-gradient-to-br from-amber-50 to-orange-50',
                border: 'border-amber-100',
                chart: {
                    line: '#D97706',
                    fill: 'rgba(217, 119, 6, 0.1)'
                }
            },
            orderValue: {
                background: 'bg-gradient-to-br from-purple-50 to-fuchsia-50',
                border: 'border-purple-100',
                chart: {
                    line: '#7C3AED',
                    fill: 'rgba(124, 58, 237, 0.1)'
                }
            },
            offlineSales: {
                background: 'bg-gradient-to-br from-rose-50 to-pink-50',
                border: 'border-rose-100',
                chart: {
                    line: '#E11D48',
                    fill: 'rgba(225, 29, 72, 0.1)'
                }
            },
            onlineSales: {
                background: 'bg-gradient-to-br from-cyan-50 to-sky-50',
                border: 'border-cyan-100',
                chart: {
                    line: '#0891B2',
                    fill: 'rgba(8, 145, 178, 0.1)'
                }
            },
            dineIn: {
                background: 'bg-gradient-to-br from-lime-50 to-green-50',
                border: 'border-lime-100',
                chart: {
                    line: '#65A30D',
                    fill: 'rgba(101, 163, 13, 0.1)'
                }
            },
            zomato: {
                background: 'bg-gradient-to-br from-red-50 to-rose-50',
                border: 'border-red-100',
                chart: {
                    line: '#DC2626',
                    fill: 'rgba(220, 38, 38, 0.1)'
                }
            },
            unsettled: {
                background: 'bg-gradient-to-br from-yellow-50 to-amber-50',
                border: 'border-yellow-100',
                chart: {
                    line: '#F59E0B',
                    fill: 'rgba(245, 158, 11, 0.1)'
                }
            },
            credit: {
                background: 'bg-gradient-to-br from-orange-50 to-red-50',
                border: 'border-orange-100',
                chart: {
                    line: '#EA580C',
                    fill: 'rgba(234, 88, 12, 0.1)'
                }
            }
        };

        // Get color scheme based on title
        const getColorScheme = () => {
            switch (title.toLowerCase()) {
                case 'total sales': return colorSchemes.totalSales;
                case 'total orders': return colorSchemes.totalOrders;
                case 'turn around time (avg)': return colorSchemes.turnAround;
                case 'order value (avg)': return colorSchemes.orderValue;
                case 'offline sales': return colorSchemes.offlineSales;
                case 'online sales': return colorSchemes.onlineSales;
                case 'dine-in sales': return colorSchemes.dineIn;
                case 'zomato': return colorSchemes.zomato;
                case 'unsettled orders':
                case 'unsettled amount':
                case 'partially settled': return colorSchemes.unsettled;
                case 'credit orders': return colorSchemes.credit;
                default: return colorSchemes.totalSales;
            }
        };

        const scheme = getColorScheme();

        useEffect(() => {
            if (canvasRef.current) {
                if (chartRef.current) {
                    chartRef.current.destroy();
                }

                const data = Array.from({ length: 12 }, () => Math.random() * 100);
                const ctx = canvasRef.current.getContext('2d');
                chartRef.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: Array.from({ length: 12 }, (_, i) => i + 1),
                        datasets: [{
                            data: data,
                            borderColor: scheme.chart.line,
                            borderWidth: 1.5,
                            fill: true,
                            backgroundColor: scheme.chart.fill,
                            tension: 0.4,
                            pointRadius: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: { enabled: false }
                        },
                        scales: {
                            x: { display: false },
                            y: { display: false }
                        }
                    }
                });
            }

            return () => {
                if (chartRef.current) {
                    chartRef.current.destroy();
                }
            };
        }, [trend, scheme]);

        const formattedValue = type === 'currency'
            ? `${UserSession?.getCurrency()}${Math.round(value).toLocaleString()}`
            : type === 'time'
                ? `${Math.round(value)} ${t('min')}`
                : value.toString();

        const trendColor = trend >= 0 ? 'text-green-600' : 'text-red-600';
        const trendIcon = trend >= 0 ? '↑' : '↓';

        return (
            <div
                className={`relative overflow-hidden rounded-xl ${scheme.background} border ${scheme.border} shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
                onClick={onClick}
            >
                <div className="p-4">
                    <h3 className="text-sm font-medium text-gray-600">{title}</h3>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">{formattedValue}</span>
                        <span className={`text-sm font-medium ${trendColor}`}>
                            {trendIcon} {Math.abs(trend).toFixed(1)}%
                        </span>
                    </div>
                </div>
                <div className="h-16 px-1">
                    <canvas ref={canvasRef} className="w-full h-full" />
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
                <button
                    className="block mx-auto mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    onClick={() => {
                        if (window.location.hash === '#analytics' || window.location.pathname.includes('analytics')) {
                            window.location.reload();
                        } else {
                            console.log('Reload button pressed, but not on analytics page. No reload.');
                        }
                    }}
                >
                    {t('tryAgain')}
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            {/* Header with Export Button */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-800">{t('analytics')}</h2>
                <button
                    onClick={exportToCSV}
                    disabled={isExporting || !metrics}
                    className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg flex items-center gap-1.5 hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <i className={`ph ${isExporting ? 'ph-spinner ph-spin' : 'ph-download-simple'}`}></i>
                    {isExporting ? t('exporting') : t('download')}
                </button>
            </div>

            {/* Date filter tabs */}
            <div className="flex items-center gap-4 overflow-x-auto pb-2 mb-6">
                {dateFilters.map(filter => (
                    <button
                        key={filter.id}
                        className={`px-4 py-2 whitespace-nowrap ${dateFilter === filter.id
                            ? 'text-blue-600 border-b-2 border-blue-600 font-medium'
                            : 'text-gray-600 hover:text-blue-600'
                            }`}
                        onClick={() => setDateFilter(filter.id)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* Custom date range picker */}
            {dateFilter === 'custom' && (
                <div className="flex items-center gap-4 mb-6">
                    <input
                        type="date"
                        value={customDateRange.start?.toISOString().split('T')[0] || ''}
                        onChange={(e) => setCustomDateRange(prev => ({
                            ...prev,
                            start: e.target.value ? new Date(e.target.value) : null
                        }))}
                        className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <span>to</span>
                    <input
                        type="date"
                        value={customDateRange.end?.toISOString().split('T')[0] || ''}
                        onChange={(e) => setCustomDateRange(prev => ({
                            ...prev,
                            end: e.target.value ? new Date(e.target.value) : null
                        }))}
                        className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                </div>
            )}

            {/* Main metrics grid */}
            <div className="grid grid-cols-2 gap-4">
                <MetricCard
                    title={t('totalSales')}
                    value={metrics.totalSales}
                    trend={metrics.trends.sales}
                    className="bg-green-50"
                    onClick={() => setSelectedMetric('sales')}
                />
                <MetricCard
                    title={t('totalOrders')}
                    value={metrics.totalOrders}
                    trend={metrics.trends.orders}
                    type="number"
                    className="bg-blue-50"
                    onClick={() => setSelectedMetric('orders')}
                />
                <MetricCard
                    title={t('turnAroundTimeAvg')}
                    value={metrics.avgTurnAroundTime}
                    trend={metrics.trends.turnAround}
                    type="time"
                    className="bg-orange-50"
                    onClick={() => setSelectedMetric('turnAround')}
                />
                <MetricCard
                    title={t('orderValueAvg')}
                    value={metrics.avgOrderValue}
                    trend={metrics.trends.orderValue}
                    className="bg-purple-50"
                    onClick={() => setSelectedMetric('orderValue')}
                />
            </div>

            {/* Sales breakdown */}
            <div className="grid grid-cols-2 gap-4 mt-6">
                <MetricCard
                    title={t('offlineSales')}
                    value={metrics.offlineSales}
                    trend={metrics.trends.sales}
                    className="bg-gray-50"
                    onClick={() => setSelectedMetric('offlineSales')}
                />
                <MetricCard
                    title={t('onlineSales')}
                    value={metrics.onlineSales}
                    trend={metrics.trends.sales}
                    className="bg-gray-50"
                    onClick={() => setSelectedMetric('onlineSales')}
                />
                <MetricCard
                    title={t('dineInSales')}
                    value={metrics.dineInSales}
                    trend={metrics.trends.sales}
                    className="bg-gray-50"
                    onClick={() => setSelectedMetric('dineInSales')}
                />
                <MetricCard
                    title={t('zomato')}
                    value={metrics.zomatoSales}
                    trend={metrics.trends.sales}
                    className="bg-gray-50"
                    onClick={() => setSelectedMetric('zomato')}
                />
            </div>

            {/* Payment Status Metrics */}
            <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-800 mb-4">{t('paymentStatus')}</h3>
                <div className="grid grid-cols-2 gap-4">
                    <MetricCard
                        title={t('unsettledOrders')}
                        value={metrics.unsettledOrders}
                        trend={0}
                        type="number"
                        className="bg-yellow-50"
                        onClick={() => setSelectedMetric('unsettledOrders')}
                    />
                    <MetricCard
                        title={t('unsettledAmount')}
                        value={metrics.totalUnsettledAmount}
                        trend={0}
                        className="bg-yellow-50"
                        onClick={() => setSelectedMetric('unsettledAmount')}
                    />
                    <MetricCard
                        title={t('creditOrders')}
                        value={metrics.creditOrders}
                        trend={0}
                        type="number"
                        className="bg-orange-50"
                        onClick={() => setSelectedMetric('creditOrders')}
                    />
                    <MetricCard
                        title={t('partiallySettled')}
                        value={metrics.partiallySettledOrders}
                        trend={0}
                        type="number"
                        className="bg-blue-50"
                        onClick={() => setSelectedMetric('partiallySettled')}
                    />
                </div>
            </div>

            {/* Metric Detail Modal */}
            {selectedMetric && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">
                                {(() => {
                                    switch (selectedMetric) {
                                        case 'sales': return t('salesDetails');
                                        case 'orders': return t('ordersDetails');
                                        case 'turnAround': return t('turnAroundDetails');
                                        case 'orderValue': return t('orderValueDetails');
                                        case 'unsettledOrders': return t('unsettledOrdersDetails');
                                        case 'unsettledAmount': return t('unsettledAmountDetails');
                                        case 'creditOrders': return t('creditOrdersDetails');
                                        case 'partiallySettled': return t('partiallySettledDetails');
                                        case 'offlineSales': return t('offlineSalesDetails');
                                        case 'onlineSales': return t('onlineSalesDetails');
                                        case 'dineInSales': return t('dineInSalesDetails');
                                        case 'zomato': return t('zomatoSalesDetails');
                                        default: return selectedMetric ? selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1) + ' Details' : '';
                                    }
                                })()}
                            </h3>
                            <button
                                onClick={() => setSelectedMetric(null)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <i className="ph ph-x text-xl"></i>
                            </button>
                        </div>
                        <div className="space-y-4">
                            {(() => {
                                const formatValue = (value, type = 'currency') => {
                                    if (type === 'currency') return `${UserSession?.getCurrency()}${Math.round(value).toLocaleString()}`;
                                    if (type === 'time') return `${Math.round(value)} ${t('min')}`;
                                    return value.toLocaleString();
                                };

                                const getMetricDetails = () => {
                                    switch (selectedMetric) {
                                        case 'sales':
                                            return {
                                                title: t('totalSales'),
                                                value: metrics.totalSales,
                                                breakdown: [
                                                    { label: t('onlineSales'), value: metrics.onlineSales },
                                                    { label: t('offlineSales'), value: metrics.offlineSales },
                                                    { label: t('dineInSales'), value: metrics.dineInSales },
                                                    { label: t('zomato'), value: metrics.zomatoSales }
                                                ]
                                            };
                                        case 'orders':
                                            return {
                                                title: t('totalOrders'),
                                                value: metrics.totalOrders,
                                                type: 'number',
                                                breakdown: [
                                                    { label: t('averageOrderValue'), value: metrics.avgOrderValue },
                                                    { label: t('averageTurnAroundTime'), value: metrics.avgTurnAroundTime, type: 'time' }
                                                ]
                                            };
                                        case 'turnAround':
                                            return {
                                                title: t('turnAroundTimeAvg'),
                                                value: metrics.avgTurnAroundTime,
                                                type: 'time'
                                            };
                                        case 'orderValue':
                                            return {
                                                title: t('orderValueAvg'),
                                                value: metrics.avgOrderValue
                                            };
                                        default:
                                            return {
                                                title: t(selectedMetric),
                                                value: metrics[selectedMetric] || 0
                                            };
                                    }
                                };

                                const details = getMetricDetails();
                                return (
                                    <>
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <div className="text-sm text-gray-600 mb-1">{details.title}</div>
                                            <div className="text-2xl font-bold text-gray-900">
                                                {formatValue(details.value, details.type)}
                                            </div>
                                            <div className={`text-sm font-medium ${metrics.trends[selectedMetric] !== undefined && metrics.trends[selectedMetric] >= 0 ? 'text-green-600' : metrics.trends[selectedMetric] !== undefined ? 'text-red-600' : 'text-gray-500'}`}>
                                                {metrics.trends[selectedMetric] !== undefined ? (
                                                    <>
                                                        {metrics.trends[selectedMetric] >= 0 ? '↑' : '↓'} {Math.abs(metrics.trends[selectedMetric]).toFixed(1)}% {t('fromPreviousPeriod')}
                                                    </>
                                                ) : (
                                                    <>-- {t('fromPreviousPeriod')}</>
                                                )}
                                            </div>
                                        </div>
                                        {details.breakdown && (
                                            <div className="grid grid-cols-2 gap-3">
                                                {details.breakdown.map((item, index) => (
                                                    <div key={index} className="bg-gray-50 rounded-lg p-3">
                                                        <div className="text-sm text-gray-600 mb-1">{item.label}</div>
                                                        <div className="text-lg font-semibold text-gray-900">
                                                            {formatValue(item.value, item.type)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}