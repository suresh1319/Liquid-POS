import { useState, useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';
import { sdk } from '../sdk.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { motion, AnimatePresence } from 'framer-motion';

Chart.register(...registerables);

export default function CustomerAnalyticsDetailModal({ isOpen, onClose, selectedDay }) {
    const [analyticsData, setAnalyticsData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Chart refs
    const dayOfWeekChartRef = useRef(null);
    const hourlyChartRef = useRef(null);
    const customerTypeChartRef = useRef(null);
    const dayOfWeekChartInstance = useRef(null);
    const hourlyChartInstance = useRef(null);
    const customerTypeChartInstance = useRef(null);
    
    const { profile } = useProfile();

    useEffect(() => {
        if (isOpen) {
            fetchAnalyticsData();
        }
        return () => {
            // Cleanup charts when modal closes
            [dayOfWeekChartInstance, hourlyChartInstance, customerTypeChartInstance].forEach(chartRef => {
                if (chartRef.current) {
                    chartRef.current.destroy();
                    chartRef.current = null;
                }
            });
        };
    }, [isOpen, selectedDay]);

    const fetchAnalyticsData = async () => {
        setIsLoading(true);
        try {
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
            
            // Analyze customer patterns
            const dayOfWeekData = analyzeDayOfWeekPatterns(periodTransactions);
            const hourlyData = analyzeHourlyPatterns(periodTransactions);
            const customerTypeData = analyzeCustomerTypes(periodTransactions, passbookData.customers);
            const customerInsights = generateCustomerInsights(periodTransactions, passbookData.customers);
            
            setAnalyticsData({
                periodLabel: selectedDay ? `Customer Analytics - ${selectedDay}` : 'Customer Analytics - Last 7 Days',
                dayOfWeekData,
                hourlyData,
                customerTypeData,
                customerInsights,
                totalTransactions: periodTransactions.length,
                uniqueCustomers: customerInsights.uniqueCustomers.size,
                totalRevenue: periodTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)
            });
            
            // Create charts after data is set
            setTimeout(() => {
                createDayOfWeekChart(dayOfWeekData);
                createHourlyChart(hourlyData);
                createCustomerTypeChart(customerTypeData);
            }, 100);
            
        } catch (error) {
            console.error('[CustomerAnalyticsDetailModal] Error fetching analytics data:', error);
            showToast('Failed to load customer analytics data', 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const analyzeDayOfWeekPatterns = (transactions) => {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayData = {};
        
        dayNames.forEach(day => {
            dayData[day] = {
                orders: 0,
                revenue: 0,
                customers: new Set()
            };
        });
        
        transactions.forEach(transaction => {
            if (transaction.type !== 'credit') return;
            
            const transactionDate = new Date(transaction.date);
            const dayName = dayNames[transactionDate.getDay()];
            
            dayData[dayName].orders += 1;
            dayData[dayName].revenue += transaction.amount || 0;
            if (transaction.customerId) {
                dayData[dayName].customers.add(transaction.customerId);
            }
        });
        
        // Convert to array format for charts
        return dayNames.map(day => ({
            day,
            orders: dayData[day].orders,
            revenue: dayData[day].revenue,
            customers: dayData[day].customers.size,
            avgOrderValue: dayData[day].orders > 0 ? dayData[day].revenue / dayData[day].orders : 0
        }));
    };
    
    const analyzeHourlyPatterns = (transactions) => {
        const hourlyData = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            orders: 0,
            revenue: 0,
            customers: new Set()
        }));
        
        transactions.forEach(transaction => {
            if (transaction.type !== 'credit') return;
            
            const transactionDate = new Date(transaction.date);
            const hour = transactionDate.getHours();
            
            hourlyData[hour].orders += 1;
            hourlyData[hour].revenue += transaction.amount || 0;
            if (transaction.customerId) {
                hourlyData[hour].customers.add(transaction.customerId);
            }
        });
        
        return hourlyData.map(data => ({
            ...data,
            customers: data.customers.size,
            avgOrderValue: data.orders > 0 ? data.revenue / data.orders : 0
        }));
    };
    
    const analyzeCustomerTypes = (transactions, customers) => {
        const customerTypes = {
            'New Customers': { count: 0, revenue: 0, orders: 0 },
            'Returning Customers': { count: 0, revenue: 0, orders: 0 },
            'VIP Customers': { count: 0, revenue: 0, orders: 0 }
        };
        
        const customerOrderCounts = {};
        const customerRevenue = {};
        
        // Count orders and revenue per customer
        transactions.forEach(transaction => {
            if (transaction.type !== 'credit' || !transaction.customerId) return;
            
            const customerId = transaction.customerId;
            customerOrderCounts[customerId] = (customerOrderCounts[customerId] || 0) + 1;
            customerRevenue[customerId] = (customerRevenue[customerId] || 0) + (transaction.amount || 0);
        });
        
        // Categorize customers
        Object.keys(customerOrderCounts).forEach(customerId => {
            const orderCount = customerOrderCounts[customerId];
            const revenue = customerRevenue[customerId];
            
            let category;
            if (orderCount === 1) {
                category = 'New Customers';
            } else if (revenue > 10000) { // VIP threshold
                category = 'VIP Customers';
            } else {
                category = 'Returning Customers';
            }
            
            customerTypes[category].count += 1;
            customerTypes[category].revenue += revenue;
            customerTypes[category].orders += orderCount;
        });
        
        return Object.keys(customerTypes).map(type => ({
            type,
            ...customerTypes[type],
            avgOrderValue: customerTypes[type].orders > 0 ? customerTypes[type].revenue / customerTypes[type].orders : 0
        }));
    };
    
    const generateCustomerInsights = (transactions, customers) => {
        const uniqueCustomers = new Set();
        const ordersByCustomer = {};
        const revenueByCustomer = {};
        
        transactions.forEach(transaction => {
            if (transaction.type !== 'credit') return;
            
            if (transaction.customerId) {
                uniqueCustomers.add(transaction.customerId);
                ordersByCustomer[transaction.customerId] = (ordersByCustomer[transaction.customerId] || 0) + 1;
                revenueByCustomer[transaction.customerId] = (revenueByCustomer[transaction.customerId] || 0) + (transaction.amount || 0);
            }
        });
        
        const avgOrdersPerCustomer = uniqueCustomers.size > 0 ? 
            Object.values(ordersByCustomer).reduce((a, b) => a + b, 0) / uniqueCustomers.size : 0;
        
        const avgRevenuePerCustomer = uniqueCustomers.size > 0 ?
            Object.values(revenueByCustomer).reduce((a, b) => a + b, 0) / uniqueCustomers.size : 0;
        
        // Find top customers
        const topCustomers = Object.keys(revenueByCustomer)
            .map(customerId => ({
                customerId,
                revenue: revenueByCustomer[customerId],
                orders: ordersByCustomer[customerId]
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
        
        return {
            uniqueCustomers,
            avgOrdersPerCustomer: Math.round(avgOrdersPerCustomer * 10) / 10,
            avgRevenuePerCustomer: Math.round(avgRevenuePerCustomer),
            topCustomers
        };
    };
    
    const createDayOfWeekChart = (dayData) => {
        if (!dayOfWeekChartRef.current || !dayData) return;
        
        const ctx = dayOfWeekChartRef.current.getContext('2d');
        if (dayOfWeekChartInstance.current) {
            dayOfWeekChartInstance.current.destroy();
        }
        
        dayOfWeekChartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayData.map(d => d.day),
                datasets: [{
                    label: 'Orders',
                    data: dayData.map(d => d.orders),
                    backgroundColor: 'rgba(139, 92, 246, 0.8)',
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                    yAxisID: 'y'
                }, {
                    label: 'Customers',
                    data: dayData.map(d => d.customers),
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderColor: '#22c55e',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Orders'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Customers'
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                return `${label}: ${context.parsed.y}`;
                            }
                        }
                    }
                }
            }
        });
    };
    
    const createHourlyChart = (hourlyData) => {
        if (!hourlyChartRef.current || !hourlyData) return;
        
        const ctx = hourlyChartRef.current.getContext('2d');
        if (hourlyChartInstance.current) {
            hourlyChartInstance.current.destroy();
        }
        
        // Filter to show only hours with activity
        const activeHours = hourlyData.filter(h => h.orders > 0);
        
        hourlyChartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: activeHours.map(h => `${h.hour}:00`),
                datasets: [{
                    label: 'Orders per Hour',
                    data: activeHours.map(h => h.orders),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Orders'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Hour of Day'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Orders: ${context.parsed.y}`;
                            }
                        }
                    }
                }
            }
        });
    };
    
    const createCustomerTypeChart = (customerData) => {
        if (!customerTypeChartRef.current || !customerData) return;
        
        const ctx = customerTypeChartRef.current.getContext('2d');
        if (customerTypeChartInstance.current) {
            customerTypeChartInstance.current.destroy();
        }
        
        const colors = ['#3b82f6', '#10b981', '#f59e0b'];
        
        customerTypeChartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: customerData.map(c => c.type),
                datasets: [{
                    data: customerData.map(c => c.count),
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} customers (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    };
    
    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div 
                        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[calc(90vh-120px)] overflow-y-auto"
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                                        <i className="ph ph-users text-2xl"></i>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Customer Analytics Details</h2>
                                        <p className="text-purple-100 text-sm">{analyticsData?.periodLabel || 'Loading...'}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={onClose}
                                    className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                                >
                                    <i className="ph ph-x text-xl"></i>
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {isLoading ? (
                                <div className="text-center py-12">
                                    <i className="ph ph-spinner text-gray-400 text-4xl animate-spin mb-4"></i>
                                    <p className="text-gray-500">Loading customer analytics...</p>
                                </div>
                            ) : !analyticsData ? (
                                <div className="text-center py-12">
                                    <i className="ph ph-chart-bar text-gray-400 text-4xl mb-4"></i>
                                    <p className="text-gray-500">No data available for this period</p>
                                </div>
                            ) : (
                                <>
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                        <motion.div 
                                            className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-4"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-blue-600 font-medium">Total Customers</p>
                                                    <p className="text-2xl font-bold text-gray-900">{analyticsData.uniqueCustomers}</p>
                                                </div>
                                                <div className="p-3 bg-blue-100 rounded-full">
                                                    <i className="ph ph-users text-blue-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div 
                                            className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-lg p-4"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-green-600 font-medium">Avg Orders/Customer</p>
                                                    <p className="text-2xl font-bold text-gray-900">{analyticsData.customerInsights.avgOrdersPerCustomer}</p>
                                                </div>
                                                <div className="p-3 bg-green-100 rounded-full">
                                                    <i className="ph ph-chart-line text-green-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div 
                                            className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100 rounded-lg p-4"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-purple-600 font-medium">Avg Revenue/Customer</p>
                                                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(analyticsData.customerInsights.avgRevenuePerCustomer)}</p>
                                                </div>
                                                <div className="p-3 bg-purple-100 rounded-full">
                                                    <i className="ph ph-currency-circle-dollar text-purple-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div 
                                            className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-100 rounded-lg p-4"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.4 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-orange-600 font-medium">Total Revenue</p>
                                                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(analyticsData.totalRevenue)}</p>
                                                </div>
                                                <div className="p-3 bg-orange-100 rounded-full">
                                                    <i className="ph ph-money text-orange-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>

                                    {/* Charts Grid */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                                        {/* Day of Week Analysis */}
                                        <motion.div 
                                            className="bg-white border rounded-lg p-6"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 }}
                                        >
                                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Orders & Customers by Day</h3>
                                            <div className="h-64">
                                                <canvas ref={dayOfWeekChartRef}></canvas>
                                            </div>
                                        </motion.div>

                                        {/* Customer Types */}
                                        <motion.div 
                                            className="bg-white border rounded-lg p-6"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.6 }}
                                        >
                                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Customer Types</h3>
                                            <div className="h-64">
                                                <canvas ref={customerTypeChartRef}></canvas>
                                            </div>
                                        </motion.div>
                                    </div>

                                    {/* Hourly Patterns */}
                                    <motion.div 
                                        className="bg-white border rounded-lg p-6 mb-8"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.7 }}
                                    >
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Hourly Order Patterns</h3>
                                        <div className="h-64">
                                            <canvas ref={hourlyChartRef}></canvas>
                                        </div>
                                    </motion.div>

                                    {/* Detailed Tables */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Day of Week Table */}
                                        <motion.div 
                                            className="bg-white border rounded-lg p-6"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.8 }}
                                        >
                                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Day Performance</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b">
                                                            <th className="text-left py-2">Day</th>
                                                            <th className="text-right py-2">Orders</th>
                                                            <th className="text-right py-2">Customers</th>
                                                            <th className="text-right py-2">Revenue</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {analyticsData.dayOfWeekData.map((day, index) => (
                                                            <tr key={index} className="border-b">
                                                                <td className="py-2 font-medium">{day.day}</td>
                                                                <td className="text-right py-2">{day.orders}</td>
                                                                <td className="text-right py-2">{day.customers}</td>
                                                                <td className="text-right py-2">{formatCurrency(day.revenue)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </motion.div>

                                        {/* Customer Types Table */}
                                        <motion.div 
                                            className="bg-white border rounded-lg p-6"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.9 }}
                                        >
                                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Customer Breakdown</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b">
                                                            <th className="text-left py-2">Type</th>
                                                            <th className="text-right py-2">Count</th>
                                                            <th className="text-right py-2">Revenue</th>
                                                            <th className="text-right py-2">Avg Order</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {analyticsData.customerTypeData.map((type, index) => (
                                                            <tr key={index} className="border-b">
                                                                <td className="py-2 font-medium">{type.type}</td>
                                                                <td className="text-right py-2">{type.count}</td>
                                                                <td className="text-right py-2">{formatCurrency(type.revenue)}</td>
                                                                <td className="text-right py-2">{formatCurrency(type.avgOrderValue)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </motion.div>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}