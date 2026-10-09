import { useState, useEffect, useRef } from 'react';
import { useState, useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';
import { sdk } from '../sdk.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { useLanguage } from '../contexts/LanguageContext.js';
import { showToast } from '../utils.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { motion, AnimatePresence } from 'framer-motion';

Chart.register(...registerables);

export default function OrderSourceDetailModal({ isOpen, onClose }) {
    const [sourceData, setSourceData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Chart refs
    const sourceChartRef = useRef(null);
    const paymentChartRef = useRef(null);
    const sourceChartInstance = useRef(null);
    const paymentChartInstance = useRef(null);
    
    const { profile } = useProfile();
    const { t } = useLanguage();

    useEffect(() => {
        if (isOpen) {
            fetchSourceData();
        }
        return () => {
            // Cleanup charts when modal closes
            [sourceChartInstance, paymentChartInstance].forEach(chartRef => {
                if (chartRef.current) {
                    chartRef.current.destroy();
                    chartRef.current = null;
                }
            });
        };
    }, [isOpen]);

    const fetchSourceData = async () => {
        setIsLoading(true);
        try {
            // Use current date filter from the reports page context
            // Since this is an overall order source analysis, we'll use the current period
            
            // Fetch passbook data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions for the current period (last 7 days by default)
            const periodFilters = {
                dateFilter: 'last7',
                activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only completed sales transactions
                customers: passbookData.customers
            };
            
            const periodTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                periodFilters
            );
            
            // Get orders for detailed analysis
            const orderIds = new Set(periodTransactions.map(t => t.orderId).filter(Boolean));
            const actualOrders = passbookData.orders ? passbookData.orders.filter(order => orderIds.has(order.id)) : [];
            
            // Initialize data structures
            const orderSources = {};
            const paymentMethods = {};
            
            let totalRevenue = 0;
            let totalOrders = 0;
            
            // Process transactions and orders
            periodTransactions.forEach(transaction => {
                if (transaction.type !== 'credit' || !transaction.orderId) return;
                
                const order = actualOrders.find(o => o.id === transaction.orderId);
                const orderRevenue = transaction.amount || 0;
                totalRevenue += orderRevenue;
                totalOrders += 1;
                
                // Determine order source (with fallback if no order found)
                const source = order ? getOrderSource(order) : 'In-Store';
                
                // Payment method from transaction
                const paymentMethod = getPaymentMethodDisplay(transaction.paymentMethod);
                
                // Order source breakdown
                if (!orderSources[source]) {
                    orderSources[source] = {
                        name: source,
                        revenue: 0,
                        orders: 0,
                        percentage: 0,
                        icon: getSourceIcon(source),
                        color: getSourceColor(source)
                    };
                }
                orderSources[source].revenue += orderRevenue;
                orderSources[source].orders += 1;
                
                // Payment method breakdown
                if (!paymentMethods[paymentMethod]) {
                    paymentMethods[paymentMethod] = {
                        name: paymentMethod,
                        revenue: 0,
                        orders: 0,
                        percentage: 0,
                        icon: getPaymentIcon(paymentMethod),
                        color: getPaymentColor(paymentMethod)
                    };
                }
                paymentMethods[paymentMethod].revenue += orderRevenue;
                paymentMethods[paymentMethod].orders += 1;
            });
            
            // Calculate percentages
            Object.values(orderSources).forEach(source => {
                source.percentage = totalRevenue > 0 ? (source.revenue / totalRevenue) * 100 : 0;
            });
            
            Object.values(paymentMethods).forEach(payment => {
                payment.percentage = totalRevenue > 0 ? (payment.revenue / totalRevenue) * 100 : 0;
            });
            
            // Sort by revenue
            const sortedSources = Object.values(orderSources).sort((a, b) => b.revenue - a.revenue);
            const sortedPayments = Object.values(paymentMethods).sort((a, b) => b.revenue - a.revenue);
            
            setSourceData({
                periodLabel: 'Last 7 Days (Order Source Analysis)',
                totalRevenue,
                totalOrders,
                avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
                orderSources: sortedSources,
                paymentMethods: sortedPayments
            });
            
            // Create charts after data is set
            setTimeout(() => {
                createSourceChart(sortedSources);
                createPaymentChart(sortedPayments);
            }, 100);
            
        } catch (error) {
            console.error('[OrderSourceDetailModal] Error fetching source data:', error);
            showToast('Failed to load order source data', 'error');
        } finally {
            setIsLoading(false);
        }
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
    
    const getPaymentMethodDisplay = (method) => {
        switch (method) {
            case 'cash': return 'Cash';
            case 'upi': return 'UPI/Card';
            case 'credit': return 'Credit';
            default: return 'Other';
        }
    };
    
    const getSourceIcon = (source) => {
        switch (source) {
            case 'Zomato': return 'ph-pizza';
            case 'Swiggy': return 'ph-bicycle';
            case 'Dine-In': return 'ph-chair';
            case 'Takeaway': return 'ph-shopping-bag';
            case 'Online': return 'ph-globe';
            default: return 'ph-storefront';
        }
    };
    
    const getSourceColor = (source) => {
        switch (source) {
            case 'Zomato': return '#ef4444';
            case 'Swiggy': return '#f97316';
            case 'Dine-In': return '#3b82f6';
            case 'Takeaway': return '#10b981';
            case 'Online': return '#8b5cf6';
            default: return '#6b7280';
        }
    };
    
    const getPaymentIcon = (method) => {
        switch (method) {
            case 'Cash': return 'ph-money';
            case 'UPI/Card': return 'ph-credit-card';
            case 'Credit': return 'ph-receipt';
            default: return 'ph-wallet';
        }
    };
    
    const getPaymentColor = (method) => {
        switch (method) {
            case 'Cash': return '#10b981';
            case 'UPI/Card': return '#3b82f6';
            case 'Credit': return '#f59e0b';
            default: return '#6b7280';
        }
    };
    
    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };
    
    const createSourceChart = (sourceData) => {
        if (!sourceChartRef.current || !sourceData.length) return;
        
        const ctx = sourceChartRef.current.getContext('2d');
        if (sourceChartInstance.current) {
            sourceChartInstance.current.destroy();
        }
        
        const labels = sourceData.map(s => s.name);
        const data = sourceData.map(s => s.revenue);
        const colors = sourceData.map(s => s.color);
        
        sourceChartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors,
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
                                const percentage = ((context.parsed / data.reduce((sum, val) => sum + val, 0)) * 100).toFixed(1);
                                return context.label + ': ' + formatCurrency(context.parsed) + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
    };
    
    const createPaymentChart = (paymentData) => {
        if (!paymentChartRef.current || !paymentData.length) return;
        
        const ctx = paymentChartRef.current.getContext('2d');
        if (paymentChartInstance.current) {
            paymentChartInstance.current.destroy();
        }
        
        const labels = paymentData.map(p => p.name);
        const data = paymentData.map(p => p.revenue);
        const colors = paymentData.map(p => p.color);
        
        paymentChartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: function(value) { return formatCurrency(value); } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Revenue: ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                }
            }
        });
    };

    if (!isOpen) return null;

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
                        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-xl">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-purple-100 rounded-xl shadow-sm">
                                        <i className="ph ph-chart-pie text-purple-600 text-2xl"></i>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Order Source Distribution</h2>
                                        <p className="text-sm text-purple-600 mt-1">{sourceData?.periodLabel || 'Loading...'}</p>
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
                                        <i className="ph ph-spinner ph-spin text-4xl text-purple-500 mb-4"></i>
                                        <p className="text-gray-600">Loading order source data...</p>
                                    </div>
                                </div>
                            ) : sourceData ? (
                                <div className="p-6">
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.1 }}
                                            className="bg-gradient-to-r from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-purple-600">Total Revenue</p>
                                                    <p className="text-2xl font-bold text-purple-700">{formatCurrency(sourceData.totalRevenue)}</p>
                                                </div>
                                                <div className="p-3 bg-purple-200 rounded-lg">
                                                    <i className="ph ph-currency-dollar text-purple-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.2 }}
                                            className="bg-gradient-to-r from-indigo-50 to-indigo-100 p-6 rounded-xl border border-indigo-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-indigo-600">Total Orders</p>
                                                    <p className="text-2xl font-bold text-indigo-700">{sourceData.totalOrders}</p>
                                                </div>
                                                <div className="p-3 bg-indigo-200 rounded-lg">
                                                    <i className="ph ph-shopping-cart text-indigo-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="bg-gradient-to-r from-teal-50 to-teal-100 p-6 rounded-xl border border-teal-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-teal-600">Avg Order Value</p>
                                                    <p className="text-2xl font-bold text-teal-700">{formatCurrency(sourceData.avgOrderValue)}</p>
                                                </div>
                                                <div className="p-3 bg-teal-200 rounded-lg">
                                                    <i className="ph ph-calculator text-teal-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>

                                    {/* Charts Section */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.4 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                        >
                                            <div className="p-6 border-b border-gray-200">
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 bg-purple-100 rounded-lg">
                                                        <i className="ph ph-chart-pie text-purple-600 text-xl"></i>
                                                    </div>
                                                    <h3 className="text-lg font-semibold text-gray-900">Order Sources</h3>
                                                </div>
                                            </div>
                                            <div className="p-6">
                                                <div className="h-64">
                                                    <canvas ref={sourceChartRef}></canvas>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.5 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                        >
                                            <div className="p-6 border-b border-gray-200">
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 bg-indigo-100 rounded-lg">
                                                        <i className="ph ph-credit-card text-indigo-600 text-xl"></i>
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
                                    </div>

                                    {/* Detailed Tables */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Order Sources Table */}
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.6 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                        >
                                            <div className="p-6 border-b border-gray-200">
                                                <h3 className="text-lg font-semibold text-gray-900">Source Breakdown</h3>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Share</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {sourceData.orderSources.map((source, index) => (
                                                            <tr key={source.name} className="hover:bg-gray-50">
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <div className="flex items-center">
                                                                        <i className={`${source.icon} mr-3 text-lg`} style={{ color: source.color }}></i>
                                                                        <span className="text-sm font-medium text-gray-900">{source.name === 'In-Store' ? t('inStore') : source.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {formatCurrency(source.revenue)}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {source.orders}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <div className="flex items-center">
                                                                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                                                            <div 
                                                                                className="h-2 rounded-full" 
                                                                                style={{ 
                                                                                    width: `${source.percentage}%`,
                                                                                    backgroundColor: source.color
                                                                                }}
                                                                            ></div>
                                                                        </div>
                                                                        <span className="text-sm text-gray-600">{source.percentage.toFixed(1)}%</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </motion.div>

                                        {/* Payment Methods Table */}
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.7 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                        >
                                            <div className="p-6 border-b border-gray-200">
                                                <h3 className="text-lg font-semibold text-gray-900">Payment Breakdown</h3>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Share</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {sourceData.paymentMethods.map((payment, index) => (
                                                            <tr key={payment.name} className="hover:bg-gray-50">
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <div className="flex items-center">
                                                                        <i className={`${payment.icon} mr-3 text-lg`} style={{ color: payment.color }}></i>
                                                                        <span className="text-sm font-medium text-gray-900">{payment.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {formatCurrency(payment.revenue)}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {payment.orders}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <div className="flex items-center">
                                                                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                                                            <div 
                                                                                className="h-2 rounded-full" 
                                                                                style={{ 
                                                                                    width: `${payment.percentage}%`,
                                                                                    backgroundColor: payment.color
                                                                                }}
                                                                            ></div>
                                                                        </div>
                                                                        <span className="text-sm text-gray-600">{payment.percentage.toFixed(1)}%</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </motion.div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-64">
                                    <p className="text-gray-500">No data available for this period</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}