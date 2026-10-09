import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { sdk } from '../sdk.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { motion, AnimatePresence } from 'framer-motion';

Chart.register(...registerables);

export default function DailyRevenueDetailModal({ isOpen, onClose, selectedDate }) {
    const [dailyData, setDailyData] = useState(null);
    const [hourlyData, setHourlyData] = useState([]);
    const [categoryBreakdown, setCategoryBreakdown] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    
    // Chart refs
    const hourlyChartRef = useRef(null);
    const paymentChartRef = useRef(null);
    const categoryChartRef = useRef(null);
    const hourlyChartInstance = useRef(null);
    const paymentChartInstance = useRef(null);
    const categoryChartInstance = useRef(null);
    
    const { profile } = useProfile();

    useEffect(() => {
        if (isOpen && selectedDate) {
            fetchDailyData();
        }
        return () => {
            // Cleanup charts when modal closes
            [hourlyChartInstance, paymentChartInstance, categoryChartInstance].forEach(chartRef => {
                if (chartRef.current) {
                    chartRef.current.destroy();
                    chartRef.current = null;
                }
            });
        };
    }, [isOpen, selectedDate]);

    const fetchDailyData = async () => {
        if (!selectedDate) return;
        
        setIsLoading(true);
        try {
            console.log('[DailyRevenueDetailModal] Fetching data for date:', selectedDate);
            
            // Parse the selected date properly to avoid timezone issues
            // selectedDate is in YYYY-MM-DD format, parse it directly without timezone conversion
            const dateParts = selectedDate.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // Month is 0-based in JavaScript
            const day = parseInt(dateParts[2]);
            
            // Create dates in local timezone to match how Reports page creates them
            const startOfDay = new Date(year, month, day, 0, 0, 0, 0);
            const endOfDay = new Date(year, month, day, 23, 59, 59, 999);
            
            console.log('[DailyRevenueDetailModal] Date range:', {
                selectedDate,
                startOfDay: startOfDay.toISOString(),
                endOfDay: endOfDay.toISOString()
            });
            
            // Fetch passbook data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            console.log('[DailyRevenueDetailModal] Passbook data loaded:', {
                totalTransactions: passbookData.transactions.length,
                totalOrders: passbookData.orders.length
            });
            
            // Use PassbookCalculator filtering for consistency with Reports page
            const dayFilters = {
                dateFilter: 'custom',
                customDateRange: { start: startOfDay, end: endOfDay },
                activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only completed sales transactions
                customers: passbookData.customers
            };
            
            // Filter transactions using PassbookCalculator for consistent status filtering
            const dayTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                dayFilters
            );
            
            console.log('[DailyRevenueDetailModal] Filtered transactions using PassbookCalculator:', {
                totalTransactionsForDay: dayTransactions.length,
                transactionIds: dayTransactions.map(t => t.id)
            });
            
            // Calculate revenue from transactions (SAME as Reports page)
            const dayRevenue = dayTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
            
            // Count unique orders (SAME as Reports page)
            const dayOrderIds = new Set();
            dayTransactions.forEach(t => {
                if (t.orderId) dayOrderIds.add(t.orderId);
            });
            const dayOrders = dayOrderIds.size;
            
            // Get actual order objects for additional details
            const actualOrders = passbookData.orders.filter(order => dayOrderIds.has(order.id));
            
            console.log('[DailyRevenueDetailModal] Calculated from transactions:', {
                dayRevenue,
                dayOrders,
                actualOrdersCount: actualOrders.length
            });
            
            // Initialize hourly data
            const hourly = Array.from({ length: 24 }, (_, hour) => ({
                hour,
                revenue: 0,
                orders: 0,
                items: 0
            }));
            
            let totalRevenue = dayRevenue; // Use transaction-based revenue
            let totalOrders = dayOrders; // Use transaction-based order count
            let totalItems = 0;
            const paymentMethods = {};
            const orderSources = {};
            const categories = {};
            
            // Process transactions for payment methods (SAME as Reports page)
            dayTransactions.forEach(t => {
                const payMethod = t.paymentMethod || 'cash';
                paymentMethods[payMethod] = (paymentMethods[payMethod] || 0) + (t.amount || 0);
            });
            
            // Process actual orders for hourly, items, categories, and order sources
            actualOrders.forEach(order => {
                try {
                    // Use date from order for hourly breakdown
                    const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now());
                    const hour = orderDate.getHours();
                    
                    // Find corresponding transaction for this order to get the exact amount
                    const orderTransaction = dayTransactions.find(t => t.orderId === order.id);
                    const orderAmount = orderTransaction ? orderTransaction.amount : 0;
                    
                    let orderItems = 0;
                    if (order.items && Array.isArray(order.items)) {
                        order.items.forEach(item => {
                            const quantity = item.qnt || item.quantity || 1;
                            orderItems += quantity;
                            
                            const categoryName = item.category || item.cat || 'Uncategorized';
                            if (!categories[categoryName]) {
                                categories[categoryName] = {
                                    name: categoryName,
                                    revenue: 0,
                                    quantity: 0,
                                    orders: new Set()
                                };
                            }
                            
                            // Use proportional revenue allocation for categories
                            const itemSubtotal = (item.price || 0) * quantity;
                            const totalItemsSubtotal = order.items.reduce((sum, i) => sum + ((i.price || 0) * (i.qnt || i.quantity || 1)), 0);
                            const proportionalRevenue = totalItemsSubtotal > 0 ? (itemSubtotal / totalItemsSubtotal) * orderAmount : 0;
                            
                            categories[categoryName].revenue += proportionalRevenue;
                            categories[categoryName].quantity += quantity;
                            categories[categoryName].orders.add(order.id);
                        });
                    }
                    
                    totalItems += orderItems;
                    
                    // Hourly breakdown using transaction amount
                    if (hour >= 0 && hour < 24) {
                        hourly[hour].revenue += orderAmount;
                        hourly[hour].orders += 1;
                        hourly[hour].items += orderItems;
                    }
                    
                    // Order source breakdown using transaction amount
                    const source = getOrderSource(order);
                    orderSources[source] = (orderSources[source] || 0) + orderAmount;
                    
                } catch (orderErr) {
                    console.warn('[DailyRevenueDetailModal] Error processing order:', orderErr, order);
                }
            });
            
            const categoryBreakdownArray = Object.values(categories).map(cat => ({
                ...cat,
                orders: cat.orders.size
            })).sort((a, b) => b.revenue - a.revenue);
            
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            
            console.log('[DailyRevenueDetailModal] Final calculated metrics:', {
                totalRevenue,
                totalOrders,
                totalItems,
                avgOrderValue,
                paymentMethodsCount: Object.keys(paymentMethods).length,
                orderSourcesCount: Object.keys(orderSources).length,
                categoriesCount: categoryBreakdownArray.length
            });
            
            setDailyData({
                date: selectedDate,
                totalRevenue,
                totalOrders,
                totalItems,
                avgOrderValue,
                paymentMethods,
                orderSources
            });
            
            setHourlyData(hourly);
            setCategoryBreakdown(categoryBreakdownArray);
            
            // Create charts after data is set
            setTimeout(() => {
                createHourlyChart(hourly);
                createPaymentChart(paymentMethods);
                createCategoryChart(categoryBreakdownArray);
            }, 100);
            
        } catch (error) {
            console.error('[DailyRevenueDetailModal] Error fetching daily data:', error);
            showToast('Failed to load daily data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const calculateOrderTotal = (order) => {
        let total = 0;
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const quantity = item.qnt || item.quantity || 1;
                const price = item.price || 0;
                total += price * quantity;
            });
        }
        const discount = order.discount || 0;
        total -= discount;
        if (order.charges && Array.isArray(order.charges)) {
            order.charges.forEach(charge => {
                if (!charge.inclusive) {
                    let chargeAmount = 0;
                    if (charge.type === 'percentage') {
                        const percentage = parseFloat(charge.value) || 0;
                        chargeAmount = (total * percentage) / 100;
                    } else {
                        chargeAmount = parseFloat(charge.value) || 0;
                    }
                    total += chargeAmount;
                }
            });
        }
        return Math.max(0, total);
    };

    const getOrderSource = (order) => {
        const source = (order.source || '').toLowerCase();
        const priceVariant = (order.priceVariant || '').toLowerCase();
        const tableId = (order.tableId || '').toLowerCase();

        if (source === 'zomato' || priceVariant === 'zomato' || tableId === 'zomato') return 'Zomato';
        if (source === 'swiggy' || priceVariant === 'swiggy' || tableId === 'swiggy') return 'Swiggy';
        if (order.isOnline || priceVariant === 'online') return 'Online';
        if (order.tableId && order.tableId.startsWith('Table')) return 'Dine-In';
        if (priceVariant === 'takeaway') return 'Takeaway';
        return 'In-Store';
    };

    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

    const createHourlyChart = (hourlyData) => {
        if (!hourlyChartRef.current || !hourlyData) return;
        
        const ctx = hourlyChartRef.current.getContext('2d');
        if (hourlyChartInstance.current) {
            hourlyChartInstance.current.destroy();
        }
        
        const labels = hourlyData.map(h => `${h.hour}:00`);
        const revenueData = hourlyData.map(h => h.revenue);
        const ordersData = hourlyData.map(h => h.orders);
        
        hourlyChartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Revenue',
                        data: revenueData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.3,
                        fill: false,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Orders',
                        data: ordersData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.3,
                        fill: false,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { display: true, title: { display: true, text: 'Hour of Day' } },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Revenue' },
                        ticks: { callback: function(value) { return formatCurrency(value); } }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Orders' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    return 'Revenue: ' + formatCurrency(context.parsed.y);
                                } else {
                                    return 'Orders: ' + context.parsed.y;
                                }
                            }
                        }
                    }
                }
            }
        });
    };

    const createPaymentChart = (paymentData) => {
        if (!paymentChartRef.current || !paymentData) return;
        
        const ctx = paymentChartRef.current.getContext('2d');
        if (paymentChartInstance.current) {
            paymentChartInstance.current.destroy();
        }
        
        const labels = Object.keys(paymentData);
        const data = Object.values(paymentData);
        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
        
        if (labels.length === 0) return;
        
        paymentChartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderColor: colors.slice(0, labels.length),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = data.reduce((sum, val) => sum + val, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': ' + formatCurrency(context.parsed) + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
    };

    const createCategoryChart = (categoryData) => {
        if (!categoryChartRef.current || !categoryData || categoryData.length === 0) return;
        
        const ctx = categoryChartRef.current.getContext('2d');
        if (categoryChartInstance.current) {
            categoryChartInstance.current.destroy();
        }
        
        const topCategories = categoryData.slice(0, 8);
        const labels = topCategories.map(cat => cat.name);
        const data = topCategories.map(cat => cat.revenue);
        
        categoryChartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: data,
                    backgroundColor: '#8b5cf6',
                    borderColor: '#7c3aed',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { callback: function(value) { return formatCurrency(value); } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Revenue: ' + formatCurrency(context.parsed.x);
                            }
                        }
                    }
                }
            }
        });
    };

    if (!isOpen) return null;

    const dateLabel = selectedDate ? (() => {
        const dateParts = selectedDate.split('-');
        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        const day = parseInt(dateParts[2]);
        const date = new Date(year, month, day);
        return date.toLocaleDateString('en-IN', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    })() : '';

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-pink-50 rounded-t-xl">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-red-100 rounded-xl shadow-sm">
                                        <i className="ph ph-calendar text-red-600 text-2xl"></i>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Daily Revenue Details</h2>
                                        <p className="text-sm text-red-600 mt-1">{dateLabel}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                                >
                                    <i className="ph ph-x text-lg"></i>
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-120px)]">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-64">
                                    <div className="text-center">
                                        <i className="ph ph-spinner ph-spin text-4xl text-red-500 mb-4"></i>
                                        <p className="text-gray-600">Loading daily data...</p>
                                    </div>
                                </div>
                            ) : dailyData ? (
                                <div className="p-6">
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.1 }}
                                            className="bg-gradient-to-r from-red-50 to-red-100 p-6 rounded-xl border border-red-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-red-600">Total Revenue</p>
                                                    <p className="text-2xl font-bold text-red-700">{formatCurrency(dailyData.totalRevenue)}</p>
                                                </div>
                                                <div className="p-3 bg-red-200 rounded-lg">
                                                    <i className="ph ph-currency-dollar text-red-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.2 }}
                                            className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-blue-600">Total Orders</p>
                                                    <p className="text-2xl font-bold text-blue-700">{dailyData.totalOrders}</p>
                                                </div>
                                                <div className="p-3 bg-blue-200 rounded-lg">
                                                    <i className="ph ph-shopping-cart text-blue-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-xl border border-green-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-green-600">Total Items</p>
                                                    <p className="text-2xl font-bold text-green-700">{dailyData.totalItems}</p>
                                                </div>
                                                <div className="p-3 bg-green-200 rounded-lg">
                                                    <i className="ph ph-package text-green-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.4 }}
                                            className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-6 rounded-xl border border-yellow-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-yellow-600">Avg Order Value</p>
                                                    <p className="text-2xl font-bold text-yellow-700">{formatCurrency(dailyData.avgOrderValue)}</p>
                                                </div>
                                                <div className="p-3 bg-yellow-200 rounded-lg">
                                                    <i className="ph ph-calculator text-yellow-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>

                                    {/* Charts Section */}
                                    <div className="space-y-8">
                                        {/* Hourly Trends */}
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.5 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                        >
                                            <div className="p-6 border-b border-gray-200">
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 bg-purple-100 rounded-lg">
                                                        <i className="ph ph-clock text-purple-600 text-xl"></i>
                                                    </div>
                                                    <h3 className="text-lg font-semibold text-gray-900">Hourly Revenue Trends</h3>
                                                </div>
                                            </div>
                                            <div className="p-6">
                                                <div className="h-80">
                                                    <canvas ref={hourlyChartRef}></canvas>
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* Payment Methods and Categories */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            <motion.div
                                                initial={{ y: 20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 0.6 }}
                                                className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                            >
                                                <div className="p-6 border-b border-gray-200">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="p-2 bg-green-100 rounded-lg">
                                                            <i className="ph ph-credit-card text-green-600 text-xl"></i>
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-gray-900">Payment Methods</h3>
                                                    </div>
                                                </div>
                                                <div className="p-6">
                                                    <div className="h-64">
                                                        <canvas ref={paymentChartRef}></canvas>
                                                    </div>
                                                </div>
                                            </motion.div>

                                            <motion.div
                                                initial={{ y: 20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 0.7 }}
                                                className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                            >
                                                <div className="p-6 border-b border-gray-200">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="p-2 bg-indigo-100 rounded-lg">
                                                            <i className="ph ph-chart-bar text-indigo-600 text-xl"></i>
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-gray-900">Top Categories</h3>
                                                    </div>
                                                </div>
                                                <div className="p-6">
                                                    <div className="h-64">
                                                        <canvas ref={categoryChartRef}></canvas>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-64">
                                    <p className="text-gray-500">No data available for this date</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}