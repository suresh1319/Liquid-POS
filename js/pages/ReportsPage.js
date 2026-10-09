import React, { useState, useEffect, useRef } from 'react';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { sdk } from '../sdk.js';
import { useProfile } from '../contexts/ProfileContext.js';
import Chart from 'chart.js/auto';
import BestSellingProductsModal from '../components/BestSellingProductsModal.js';
import CategoryWiseSalesModal from '../components/CategoryWiseSalesModal.js';
import SalesSummaryModal from '../components/SalesSummaryModal.js';
import SalesTrendsModal from '../components/SalesTrendsModal.js';
import PaymentMethodsModal from '../components/PaymentMethodsModal.js';
import DiscountReportModal from '../components/DiscountReportModal.js';
import TaxReportModal from '../components/TaxReportModal.js';
import DailyRevenueDetailModal from '../components/DailyRevenueDetailModal.js';
import OrderSourceDetailModal from '../components/OrderSourceDetailModal.js';
import CustomerAnalyticsDetailModal from '../components/CustomerAnalyticsDetailModal.js';
import { CurrencyData } from '../utils/CurrencyData.js';

function ReportsPage() {
    const [dateFilter, setDateFilter] = useState('last7');
    const [customDateRange, setCustomDateRange] = useState({ start: null, end: null });
    const [revenueChartType, setRevenueChartType] = useState('line');
    const [ordersChartType, setOrdersChartType] = useState('bar');
    const [paymentChartType, setPaymentChartType] = useState('pie'); // Add this state for payment chart type
    const [customerChartType, setCustomerChartType] = useState('bar'); // Add this state for customer chart type
    const [reportsData, setReportsData] = useState({
        salesData: [],
        orderData: [],
        topProducts: [],
        customerData: [],
        summary: {
            totalRevenue: 0,
            totalOrders: 0,
            avgOrderValue: 0,
            growthRate: 0
        }
    });
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [realMetrics, setRealMetrics] = useState({
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        summary: { credit: 0, total: 0 },
        transactionsCount: 0,
        period: 'last7',
        dailyData: [],
        paymentDistribution: { cash: 0, upi: 0, credit: 0 },
        customerAnalytics: {
            'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
            'Friday': 0, 'Saturday': 0, 'Sunday': 0
        }
    });
    const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
    const [showTaxReportModal, setShowTaxReportModal] = useState(false);
    const [taxReportData, setTaxReportData] = useState(null);
    const [selectedFinancialYear, setSelectedFinancialYear] = useState('2026');
    const [isLoadingTaxData, setIsLoadingTaxData] = useState(false);
    const [showBestSellingModal, setShowBestSellingModal] = useState(false);
    const [showCategoryWiseModal, setShowCategoryWiseModal] = useState(false);
    const [showSalesSummaryModal, setShowSalesSummaryModal] = useState(false);
    const [showSalesTrendsModal, setShowSalesTrendsModal] = useState(false);
    const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false);
    const [showDiscountReportModal, setShowDiscountReportModal] = useState(false);
    const [showDailyRevenueDetailModal, setShowDailyRevenueDetailModal] = useState(false);
    const [selectedDayForDetail, setSelectedDayForDetail] = useState(null);
    const [showOrderSourceModal, setShowOrderSourceModal] = useState(false);
    const [showCustomerAnalyticsModal, setShowCustomerAnalyticsModal] = useState(false);
    const [selectedDayForAnalytics, setSelectedDayForAnalytics] = useState(null);

    // Date filter options (enhanced to match user requirements)
    const dateFilters = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'last7', label: 'Last 7 Days' },
        { id: 'last30', label: 'Last 30 Days' },
        { id: 'last90', label: 'Last 90 Days' },
        { id: 'custom', label: 'Custom Date' }
    ];

    // Chart refs
    const revenueChartRef = useRef(null);
    const ordersChartRef = useRef(null);
    const pieChartRef = useRef(null);
    const customerChartRef = useRef(null);
    const revenueChartInstance = useRef(null);
    const ordersChartInstance = useRef(null);
    const pieChartInstance = useRef(null);
    const customerChartInstance = useRef(null);

    // Log refs for debugging
    useEffect(() => {
        console.log('[ReportsPage] Chart refs:', {
            revenueChartRef: !!revenueChartRef.current,
            ordersChartRef: !!ordersChartRef.current,
            pieChartRef: !!pieChartRef.current,
            customerChartRef: !!customerChartRef.current
        });
    }, []);

    // Get profile for currency formatting
    const { profile } = useProfile();

    // Generate dummy data for reports charts
    const generateDummyReportsData = (dateFilter) => {
        const now = new Date();
        const days = dateFilter === 'last7' ? 7 : dateFilter === 'last30' ? 30 : 90;

        const salesData = [];
        const orderData = [];
        const topProducts = [];
        const customerData = [];

        // Generate daily sales and order data
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);

            // Simulate realistic sales patterns (higher on weekends)
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const baseRevenue = Math.random() * 15000 + 5000; // ₹5,000 - ₹20,000
            const weekendMultiplier = isWeekend ? 1.5 : 1;
            const revenue = Math.round(baseRevenue * weekendMultiplier);

            const baseOrders = Math.random() * 40 + 10; // 10-50 orders
            const orders = Math.round(baseOrders * weekendMultiplier);

            // Format date consistently with Expenses section
            const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

            salesData.push({
                date: dateStr,
                revenue: revenue,
                orders: orders
            });

            orderData.push({
                date: dateStr,
                dineIn: Math.round(orders * 0.4),
                takeaway: Math.round(orders * 0.3),
                delivery: Math.round(orders * 0.3)
            });

            customerData.push({
                date: dateStr,
                new: Math.round(Math.random() * 15 + 5),
                returning: Math.round(Math.random() * 25 + 15)
            });
        }

        // Generate top products
        const products = [
            'Butter Chicken', 'Masala Dosa', 'Biryani', 'Paneer Tikka', 'Dal Makhani',
            'Chicken Tikka', 'Naan', 'Fried Rice', 'Samosa', 'Chole Bhature'
        ];

        products.forEach((product, index) => {
            if (index < 8) { // Top 8 products
                topProducts.push({
                    name: product,
                    sales: Math.round(Math.random() * 150 + 50),
                    revenue: Math.round(Math.random() * 25000 + 10000)
                });
            }
        });

        // Sort top products by sales
        topProducts.sort((a, b) => b.sales - a.sales);

        return {
            salesData,
            orderData,
            topProducts,
            customerData,
            summary: {
                totalRevenue: salesData.reduce((sum, day) => sum + day.revenue, 0),
                totalOrders: salesData.reduce((sum, day) => sum + day.orders, 0),
                avgOrderValue: Math.round(salesData.reduce((sum, day) => sum + day.revenue, 0) / salesData.reduce((sum, day) => sum + day.orders, 0)),
                growthRate: Math.round((Math.random() - 0.3) * 30) // -9% to +21%
            }
        };
    };

    // Generate daily breakdown data for charts
    const generateDailyBreakdown = (transactions, selectedDateFilter, customDateRangeForCalculation = null) => {
        console.log('[ReportsPage] Generating daily breakdown for', transactions.length, 'transactions');
        const dailyData = [];
        const now = new Date();

        let startDate, endDate;

        if (selectedDateFilter === 'custom' && customDateRangeForCalculation) {
            // For custom date ranges, use the provided date range
            startDate = new Date(customDateRangeForCalculation.start);
            endDate = new Date(customDateRangeForCalculation.end);
        } else {
            // For predefined filters, calculate the date range
            let days;
            switch (selectedDateFilter) {
                case 'today':
                    days = 1;
                    break;
                case 'yesterday':
                    days = 1;
                    break;
                case 'last7':
                    days = 7;
                    break;
                case 'last30':
                    days = 30;
                    break;
                case 'last90':
                    days = 90;
                    break;
                default:
                    days = 7; // fallback to 7 days
            }

            if (selectedDateFilter === 'yesterday') {
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 1);
                endDate = new Date(startDate);
            } else if (selectedDateFilter === 'today') {
                startDate = new Date(now);
                endDate = new Date(now);
            } else {
                startDate = new Date(now);
                startDate.setDate(now.getDate() - (days - 1));
                endDate = new Date(now);
            }
        }

        // Ensure start and end dates are at the beginning and end of the day
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // Generate all dates in the range, including those with no data
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            // Format date for display - matching the format used in Expenses section
            const dateStr = (() => {
                const date = new Date(currentDate);
                return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            })();

            // Filter transactions for this specific day
            const dayStart = new Date(currentDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(currentDate);
            dayEnd.setHours(23, 59, 59, 999);

            const dayTransactions = transactions.filter(t => {
                const transactionDate = new Date(t.date);
                return transactionDate >= dayStart && transactionDate <= dayEnd && t.type === 'Sale';
            });

            // Calculate revenue for this day
            const dayRevenue = dayTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

            // Count unique orders for this day
            const dayOrderIds = new Set();
            dayTransactions.forEach(t => {
                if (t.orderId) dayOrderIds.add(t.orderId);
            });
            const dayOrders = dayOrderIds.size;

            console.log('[ReportsPage] Processing date:', {
                dateStr,
                dayRevenue,
                dayOrders,
                transactionsCount: dayTransactions.length
            });

            dailyData.push({
                date: dateStr,
                fullDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()), // Create explicit date to avoid timezone issues
                revenue: dayRevenue,
                orders: dayOrders,
                transactions: dayTransactions.length
            });

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Calculate payment method distribution for pie chart
        const paymentMethodCounts = { cash: 0, upi: 0, credit: 0, mixed: 0 };
        const salesTransactions = transactions.filter(t => t.type === 'Sale');

        salesTransactions.forEach(t => {
            const amount = Math.abs(Number(t.amount) || 0);
            if (t.paymentMethod === 'cash') paymentMethodCounts.cash += amount;
            else if (t.paymentMethod === 'upi') paymentMethodCounts.upi += amount;
            else if (t.paymentMethod === 'credit') paymentMethodCounts.credit += amount;
            else if (t.paymentMethod === 'mixed') paymentMethodCounts.mixed += amount;
        });

        // Calculate customer analytics by day of week
        const dayOfWeekData = {
            'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
            'Friday': 0, 'Saturday': 0, 'Sunday': 0
        };

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Count unique orders by day of week
        const uniqueOrdersByDayOfWeek = {};
        dayNames.forEach(day => {
            uniqueOrdersByDayOfWeek[day] = new Set();
        });

        salesTransactions.forEach(t => {
            const transactionDate = new Date(t.date);
            const dayOfWeek = dayNames[transactionDate.getDay()];
            if (t.orderId) {
                uniqueOrdersByDayOfWeek[dayOfWeek].add(t.orderId);
            }
        });

        // Convert sets to counts
        Object.keys(uniqueOrdersByDayOfWeek).forEach(day => {
            dayOfWeekData[day] = uniqueOrdersByDayOfWeek[day].size;
        });

        console.log('[ReportsPage] Customer analytics data:', dayOfWeekData);

        return {
            dailyData,
            paymentDistribution: paymentMethodCounts,
            customerAnalytics: dayOfWeekData
        };
    };

    // Calculate real metrics from passbook data for specified date range
    const calculateRealMetrics = async (selectedDateFilter = 'last7') => {
        try {
            console.log('[ReportsPage] Starting calculateRealMetrics for', selectedDateFilter);
            setIsLoadingMetrics(true);

            // Fetch passbook data using PassbookCalculator
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            console.log('[ReportsPage] Fetched passbook data:', {
                ordersCount: passbookData.orders?.length || 0,
                transactionsCount: passbookData.transactions?.length || 0,
                customersCount: passbookData.customers?.length || 0
            });

            // Map date filter to PassbookCalculator filter format and handle custom range
            let passbookDateFilter;
            let customDateRangeForCalculation = undefined;

            switch (selectedDateFilter) {
                case 'today':
                    passbookDateFilter = 'today';
                    break;
                case 'yesterday':
                    passbookDateFilter = 'yesterday';
                    break;
                case 'last7':
                    passbookDateFilter = 'last7';
                    break;
                case 'last30':
                    passbookDateFilter = 'last30';
                    break;
                case 'last90':
                    // Use custom date range for 90 days since PassbookCalculator doesn't have last90
                    const now = new Date();
                    const start90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    passbookDateFilter = 'custom';
                    customDateRangeForCalculation = {
                        start: start90Days,
                        end: now
                    };
                    break;
                case 'custom':
                    passbookDateFilter = 'custom';
                    customDateRangeForCalculation = customDateRange;
                    break;

                default:
                    passbookDateFilter = 'last7';
            }

            // Filter transactions for the selected period
            const periodFilters = {
                dateFilter: passbookDateFilter,
                customDateRange: customDateRangeForCalculation,
                activeFilters: ['Cash', 'Digital', 'Credit', 'Sales'], // Only sales transactions
                customers: passbookData.customers
            };
            const periodTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                periodFilters
            );

            console.log('[ReportsPage] Filtered transactions:', {
                totalCount: periodTransactions.length,
                dateFilter: passbookDateFilter,
                customRange: customDateRangeForCalculation
            });

            // Calculate summary from filtered transactions
            const summary = PassbookCalculator.calculateSummary(periodTransactions);
            console.log('[ReportsPage] Calculated summary:', summary);

            // Count unique orders (since we only want completed sales)
            const uniqueOrderIds = new Set();
            const salesTransactions = periodTransactions.filter(t => t.type === 'Sale');

            salesTransactions.forEach(transaction => {
                if (transaction.orderId) {
                    uniqueOrderIds.add(transaction.orderId);
                }
            });

            // Count new customers (unique customers in the period)
            const uniqueCustomerIds = new Set();
            salesTransactions.forEach(transaction => {
                if (transaction.customerId) {
                    uniqueCustomerIds.add(transaction.customerId);
                }
            });

            const totalRevenue = summary.total; // Total transactions (sales revenue)
            const totalOrders = uniqueOrderIds.size; // Unique completed orders
            const newCustomers = uniqueCustomerIds.size; // Unique customers
            const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

            // Generate daily breakdown for charts
            const chartData = generateDailyBreakdown(periodTransactions, selectedDateFilter, customDateRangeForCalculation);

            const metrics = {
                totalRevenue,
                totalOrders,
                newCustomers,
                avgOrderValue,
                summary,
                transactionsCount: periodTransactions.length,
                period: selectedDateFilter,
                dailyData: chartData.dailyData, // Daily revenue/orders data
                paymentDistribution: chartData.paymentDistribution, // For pie chart
                customerAnalytics: chartData.customerAnalytics // For customer analytics chart
            };

            console.log('[ReportsPage] Setting real metrics:', metrics);
            setRealMetrics(metrics);

        } catch (error) {
            console.error('[ReportsPage] Error calculating metrics for', selectedDateFilter + ':', error);
            // Set fallback metrics in case of error
            setRealMetrics({
                totalRevenue: 0,
                totalOrders: 0,
                newCustomers: 0,
                avgOrderValue: 0,
                summary: { credit: 0, total: 0 },
                transactionsCount: 0,
                period: selectedDateFilter
            });
        } finally {
            setIsLoadingMetrics(false);
        }
    };

    // Add effect to handle currency changes
    useEffect(() => {
        const handleCurrencyChange = () => {
            // Force re-render when currency changes by updating state
            setIsLoadingMetrics(prev => !prev);
            // Recalculate metrics with new currency
            calculateRealMetrics(dateFilter);
        };

        window.addEventListener('currencyChanged', handleCurrencyChange);

        return () => {
            window.removeEventListener('currencyChanged', handleCurrencyChange);
        };
    }, [dateFilter, customDateRange]);

    // Create or update revenue chart
    const createRevenueChart = (dailyData) => {
        console.log('[ReportsPage] Creating revenue chart with data:', dailyData?.length || 0, 'points');
        console.log('[ReportsPage] Revenue chart data details:', dailyData);
        if (!revenueChartRef.current) {
            console.log('[ReportsPage] Skipping revenue chart creation - no canvas');
            return;
        }

        const ctx = revenueChartRef.current.getContext('2d');

        // Destroy existing chart if it exists
        if (revenueChartInstance.current) {
            revenueChartInstance.current.destroy();
        }

        // If no data, create empty chart
        if (!dailyData || dailyData.length === 0) {
            console.log('[ReportsPage] Creating empty revenue chart');
            revenueChartInstance.current = new Chart(ctx, {
                type: revenueChartType,
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Revenue',
                        data: [],
                        borderColor: '#ef4444',
                        backgroundColor: revenueChartType === 'line' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.7)',
                        borderWidth: 2,
                        fill: revenueChartType === 'line',
                        tension: revenueChartType === 'line' ? 0.3 : 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function (value) {
                                    return formatCurrency(value);
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return 'Revenue: ' + formatCurrency(context.parsed.y);
                                }
                            }
                        }
                    }
                }
            });
            return;
        }
        console.log('[ReportsPage] Creating revenue chart with', dailyData.length, 'data points');
        revenueChartInstance.current = new Chart(ctx, {
            type: revenueChartType, // Use the state variable for chart type
            data: {
                labels: dailyData.map(d => d.date),
                datasets: [{
                    label: 'Revenue',
                    data: dailyData.map(d => d.revenue || 0),
                    borderColor: '#ef4444',
                    backgroundColor: revenueChartType === 'line' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.7)',
                    borderWidth: 2,
                    fill: revenueChartType === 'line',
                    tension: revenueChartType === 'line' ? 0.3 : 0
                }]
            },
            plugins: [{
                id: 'customCanvasBackground',
                beforeDraw: (chart) => {
                    console.log('[ReportsPage] Revenue chart drawn');
                }
            }],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onHover: (event, activeElements) => {
                    event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const dataIndex = elements[0].index;
                        const clickedDay = dailyData[dataIndex];
                        console.log('[ReportsPage] Chart clicked:', {
                            dataIndex,
                            clickedDay,
                            fullDate: clickedDay?.fullDate,
                            selectedDate: clickedDay?.fullDate?.toISOString().split('T')[0]
                        });
                        if (clickedDay && clickedDay.fullDate) {
                            // Convert fullDate to YYYY-MM-DD format for the modal (avoid timezone issues)
                            const date = new Date(clickedDay.fullDate);
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const selectedDate = `${year}-${month}-${day}`;

                            console.log('[ReportsPage] Selected date (timezone-safe):', {
                                originalFullDate: clickedDay.fullDate,
                                selectedDate,
                                toISOString: clickedDay.fullDate.toISOString().split('T')[0]
                            });

                            setSelectedDayForDetail(selectedDate);
                            setShowDailyRevenueDetailModal(true);
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return 'Revenue: ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                }
            }
        });
    };

    // Create or update orders chart
    const createOrdersChart = (dailyData) => {
        console.log('[ReportsPage] Creating orders chart with data:', dailyData?.length || 0, 'points');
        console.log('[ReportsPage] Orders chart data details:', dailyData);
        if (!ordersChartRef.current) {
            console.log('[ReportsPage] Skipping orders chart creation - no canvas');
            return;
        }

        const ctx = ordersChartRef.current.getContext('2d');

        // Destroy existing chart if it exists
        if (ordersChartInstance.current) {
            ordersChartInstance.current.destroy();
        }

        // If no data, create empty chart
        if (!dailyData || dailyData.length === 0) {
            console.log('[ReportsPage] Creating empty orders chart');
            ordersChartInstance.current = new Chart(ctx, {
                type: ordersChartType,
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Orders',
                        data: [],
                        backgroundColor: '#3b82f6',
                        borderColor: '#2563eb',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return 'Amount: ' + formatCurrency(context.parsed.y);
                                }
                            }
                        }
                    }
                }
            });
            return;
        }

        console.log('[ReportsPage] Creating orders chart with', dailyData.length, 'data points');
        ordersChartInstance.current = new Chart(ctx, {
            type: ordersChartType, // Use the state variable for chart type
            data: {
                labels: dailyData.map(d => d.date),
                datasets: [{
                    label: 'Orders',
                    data: dailyData.map(d => d.orders || 0),
                    backgroundColor: '#3b82f6',
                    borderColor: '#2563eb',
                    borderWidth: 1
                }]
            },
            plugins: [{
                id: 'customCanvasBackground',
                beforeDraw: (chart) => {
                    console.log('[ReportsPage] Orders chart drawn');
                }
            }],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onHover: (event, activeElements) => {
                    event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const dataIndex = elements[0].index;
                        const clickedDay = dailyData[dataIndex];
                        console.log('[ReportsPage] Orders Chart clicked:', {
                            dataIndex,
                            clickedDay,
                            fullDate: clickedDay?.fullDate,
                            selectedDate: clickedDay?.fullDate
                        });
                        if (clickedDay && clickedDay.fullDate) {
                            // Convert fullDate to YYYY-MM-DD format for the modal (avoid timezone issues)
                            const date = new Date(clickedDay.fullDate);
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const selectedDate = `${year}-${month}-${day}`;

                            console.log('[ReportsPage] Orders Chart - Selected date (timezone-safe):', {
                                originalFullDate: clickedDay.fullDate,
                                selectedDate
                            });

                            setSelectedDayForDetail(selectedDate);
                            setShowDailyRevenueDetailModal(true);
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return 'Amount: ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                }
            }
        });
    };

    // Handle date filter change
    const handleDateFilterChange = (filter) => {
        setDateFilter(filter);
        if (filter === 'custom') {
            setCustomDateRange({ start: null, end: null });
        }
    };

    // Handle custom date range change
    const handleCustomDateRangeChange = (start, end) => {
        // When start and end dates are the same, adjust the end date to include the entire day
        if (start && end && start.toDateString() === end.toDateString()) {
            // Set end time to the end of the day (23:59:59.999)
            const adjustedEnd = new Date(end);
            adjustedEnd.setHours(23, 59, 59, 999);
            setCustomDateRange({ start, end: adjustedEnd });
        } else {
            setCustomDateRange({ start, end });
        }
    };



    // Handle tax report modal open
    const handleTaxReportOpen = () => {
        setShowTaxReportModal(true);
    };

    // Handle tax report modal close
    const handleTaxReportClose = () => {
        setShowTaxReportModal(false);
    };

    // Handle tax report data load
    const handleTaxReportLoad = async (year) => {
        setIsLoadingTaxData(true);
        setSelectedFinancialYear(year);

        try {
            const taxData = await sdk.getTaxReport(year);
            setTaxReportData(taxData);
        } catch (error) {
            console.error('[ReportsPage] Error fetching tax report for', year + ':', error);
            setTaxReportData(null);
        } finally {
            setIsLoadingTaxData(false);
        }
    };

    // Handle best selling products modal open
    const handleBestSellingOpen = () => {
        setShowBestSellingModal(true);
    };

    // Handle best selling products modal close
    const handleBestSellingClose = () => {
        setShowBestSellingModal(false);
    };

    // Handle category wise sales modal open
    const handleCategoryWiseOpen = () => {
        setShowCategoryWiseModal(true);
    };

    // Handle category wise sales modal close
    const handleCategoryWiseClose = () => {
        setShowCategoryWiseModal(false);
    };

    // Handle sales summary modal open
    const handleSalesSummaryOpen = () => {
        setShowSalesSummaryModal(true);
    };

    // Handle sales summary modal close
    const handleSalesSummaryClose = () => {
        setShowSalesSummaryModal(false);
    };

    // Handle sales trends modal open
    const handleSalesTrendsOpen = () => {
        setShowSalesTrendsModal(true);
    };

    // Handle sales trends modal close
    const handleSalesTrendsClose = () => {
        setShowSalesTrendsModal(false);
    };

    // Handle payment methods modal open
    const handlePaymentMethodsOpen = () => {
        setShowPaymentMethodsModal(true);
    };

    // Handle payment methods modal close
    const handlePaymentMethodsClose = () => {
        setShowPaymentMethodsModal(false);
    };

    // Handle discount report modal open
    const handleDiscountReportOpen = () => {
        setShowDiscountReportModal(true);
    };

    // Handle discount report modal close
    const handleDiscountReportClose = () => {
        setShowDiscountReportModal(false);
    };

    // Handle daily revenue detail modal open
    const handleDailyRevenueDetailOpen = (selectedDate) => {
        setSelectedDayForDetail(selectedDate);
        setShowDailyRevenueDetailModal(true);
    };

    // Handle daily revenue detail modal close
    const handleDailyRevenueDetailClose = () => {
        setShowDailyRevenueDetailModal(false);
        setSelectedDayForDetail(null);
    };

    // Handle Excel generation
    const handleGenerateExcel = () => {
        setIsGeneratingExcel(true);

        // Simulate Excel generation delay
        setTimeout(() => {
            setIsGeneratingExcel(false);
            alert('Excel file generated successfully!');
        }, 2000);
    };

    // Create or update pie chart for payment method distribution
    const createPieChart = (paymentData) => {
        console.log('[ReportsPage] Creating pie chart with data:', paymentData);
        if (!pieChartRef.current) {
            console.log('[ReportsPage] Skipping pie chart creation - no canvas');
            return;
        }

        const ctx = pieChartRef.current.getContext('2d');

        // Destroy existing chart if it exists
        if (pieChartInstance.current) {
            pieChartInstance.current.destroy();
        }

        // If no data, create empty chart
        if (!paymentData) {
            console.log('[ReportsPage] Creating empty pie chart');
            pieChartInstance.current = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#cccccc'],
                        borderColor: ['#999999'],
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
                        }
                    }
                }
            });
            console.log('[ReportsPage] Empty pie chart created');
            return;
        }

        const total = paymentData.cash + paymentData.upi + paymentData.credit;

        // If no data, create empty chart
        if (total === 0) {
            console.log('[ReportsPage] Creating empty pie chart (no payment data)');
            pieChartInstance.current = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#cccccc'],
                        borderColor: ['#999999'],
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
                        }
                    }
                }
            });
            console.log('[ReportsPage] Empty pie chart (no data) created');
            return;
        }

        if (paymentChartType === 'pie') {
            // Pie chart implementation
            const data = [];
            const labels = [];
            const colors = [];

            if (paymentData.cash > 0) {
                data.push(paymentData.cash);
                labels.push('Cash');
                colors.push('#10b981'); // Green
            }
            if (paymentData.upi > 0) {
                data.push(paymentData.upi);
                labels.push('UPI/Card');
                colors.push('#3b82f6'); // Blue
            }
            if (paymentData.credit > 0) {
                data.push(paymentData.credit);
                labels.push('Credit');
                colors.push('#f59e0b'); // Yellow/Orange
            }

            console.log('[ReportsPage] Creating pie chart with', total, 'total payments');
            pieChartInstance.current = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: colors.map(color => color),
                        borderWidth: 2
                    }]
                },
                plugins: [{
                    id: 'customCanvasBackground',
                    beforeDraw: (chart) => {
                        console.log('[ReportsPage] Pie chart drawn');
                    }
                }],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            setShowOrderSourceModal(true);
                        }
                    },
                    onHover: (event, elements) => {
                        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    },
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
                                label: function (context) {
                                    const percentage = ((context.parsed / total) * 100).toFixed(1);
                                    return context.label + ': ' + formatCurrency(context.parsed) + ' (' + percentage + '%)';
                                }
                            }
                        }
                    }
                }
            });
        } else {
            // Bar chart implementation for payment methods
            const labels = [];
            const data = [];
            const backgroundColors = [];

            if (paymentData.cash > 0) {
                labels.push('Cash');
                data.push(paymentData.cash);
                backgroundColors.push('#10b981'); // Green
            }
            if (paymentData.upi > 0) {
                labels.push('UPI/Card');
                data.push(paymentData.upi);
                backgroundColors.push('#3b82f6'); // Blue
            }
            if (paymentData.credit > 0) {
                labels.push('Credit');
                data.push(paymentData.credit);
                backgroundColors.push('#f59e0b'); // Yellow/Orange
            }

            console.log('[ReportsPage] Creating payment bar chart with', total, 'total payments');
            pieChartInstance.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Amount',
                        data: data,
                        backgroundColor: backgroundColors,
                        borderColor: backgroundColors.map(color => color),
                        borderWidth: 1
                    }]
                },
                plugins: [{
                    id: 'customCanvasBackground',
                    beforeDraw: (chart) => {
                        console.log('[ReportsPage] Payment bar chart drawn');
                    }
                }],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            setShowOrderSourceModal(true);
                        }
                    },
                    onHover: (event, elements) => {
                        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return 'Amount: ' + formatCurrency(context.parsed.y);
                                }
                            }
                        }
                    }
                }
            });
        }
    };

    // Create or update customer analytics chart
    const createCustomerChart = (customerData) => {
        console.log('[ReportsPage] Creating customer chart with data:', customerData);
        if (!customerChartRef.current) {
            console.log('[ReportsPage] Skipping customer chart creation - no canvas');
            return;
        }

        const ctx = customerChartRef.current.getContext('2d');

        // Destroy existing chart if it exists
        if (customerChartInstance.current) {
            customerChartInstance.current.destroy();
        }

        // If no data, create empty chart
        if (!customerData) {
            console.log('[ReportsPage] Creating empty customer chart');
            customerChartInstance.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    datasets: [{
                        label: 'Orders',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        backgroundColor: '#8b5cf6',
                        borderColor: '#7c3aed',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
            console.log('[ReportsPage] Empty customer chart created');
            return;
        }

        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const orderedData = dayOrder.map(day => customerData[day] || 0);

        if (customerChartType === 'bar') {
            // Bar chart implementation
            console.log('[ReportsPage] Creating customer bar chart with data:', orderedData);
            customerChartInstance.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: dayOrder,
                    datasets: [{
                        label: 'Orders',
                        data: orderedData,
                        backgroundColor: '#8b5cf6',
                        borderColor: '#7c3aed',
                        borderWidth: 1
                    }]
                },
                plugins: [{
                    id: 'customCanvasBackground',
                    beforeDraw: (chart) => {
                        console.log('[ReportsPage] Customer bar chart drawn');
                    }
                }],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const dataIndex = elements[0].index;
                            const selectedDay = dayOrder[dataIndex];
                            setSelectedDayForAnalytics(selectedDay);
                            setShowCustomerAnalyticsModal(true);
                        }
                    },
                    onHover: (event, elements) => {
                        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return 'Amount: ' + formatCurrency(context.parsed.y);
                                }
                            }
                        }
                    }
                }
            });
        } else {
            // Line chart implementation
            console.log('[ReportsPage] Creating customer line chart with data:', orderedData);
            customerChartInstance.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dayOrder,
                    datasets: [{
                        label: 'Orders',
                        data: orderedData,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3
                    }]
                },
                plugins: [{
                    id: 'customCanvasBackground',
                    beforeDraw: (chart) => {
                        console.log('[ReportsPage] Customer line chart drawn');
                    }
                }],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const dataIndex = elements[0].index;
                            const selectedDay = dayOrder[dataIndex];
                            setSelectedDayForAnalytics(selectedDay);
                            setShowCustomerAnalyticsModal(true);
                        }
                    },
                    onHover: (event, elements) => {
                        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return 'Amount: ' + formatCurrency(context.parsed.y);
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // Update charts when real metrics or chart types change
    useEffect(() => {
        console.log('[ReportsPage] Updating charts with realMetrics:', realMetrics);
        console.log('[ReportsPage] Chart types - Revenue:', revenueChartType, 'Orders:', ordersChartType, 'Payment:', paymentChartType, 'Customer:', customerChartType);

        // Always create charts, even with empty data
        console.log('[ReportsPage] Calling createRevenueChart');
        createRevenueChart(realMetrics?.dailyData || []);
        console.log('[ReportsPage] Calling createOrdersChart');
        createOrdersChart(realMetrics?.dailyData || []);
        console.log('[ReportsPage] Calling createPieChart');
        createPieChart(realMetrics?.paymentDistribution || null);
        console.log('[ReportsPage] Calling createCustomerChart');
        createCustomerChart(realMetrics?.customerAnalytics || null);

        // Cleanup function
        return () => {
            if (revenueChartInstance.current) {
                console.log('[ReportsPage] Cleaning up revenue chart');
                revenueChartInstance.current.destroy();
            }
            if (ordersChartInstance.current) {
                console.log('[ReportsPage] Cleaning up orders chart');
                ordersChartInstance.current.destroy();
            }
            if (pieChartInstance.current) {
                console.log('[ReportsPage] Cleaning up pie chart');
                pieChartInstance.current.destroy();
            }
            if (customerChartInstance.current) {
                console.log('[ReportsPage] Cleaning up customer chart');
                customerChartInstance.current.destroy();
            }
        };
    }, [realMetrics, profile, revenueChartType, ordersChartType, paymentChartType, customerChartType]); // Add chart type dependencies

    // Generate reports data when filter changes
    useEffect(() => {
        const data = generateDummyReportsData(dateFilter);
        setReportsData(data);
    }, [dateFilter]);

    // Fetch real metrics on component mount
    useEffect(() => {
        calculateRealMetrics(dateFilter);
    }, []);

    // Recalculate real metrics when date filter changes
    useEffect(() => {
        if (dateFilter) {
            calculateRealMetrics(dateFilter);
        }
    }, [dateFilter]);

    // Recalculate real metrics when custom date range changes
    useEffect(() => {
        if (dateFilter === 'custom' && customDateRange.start && customDateRange.end) {
            calculateRealMetrics(dateFilter);
        }
    }, [customDateRange, dateFilter]);

    // Get date range based on filter - use PassbookCalculator for consistency
    // Get date range based on filter - use PassbookCalculator for consistency
    const getDateRange = (filter) => {
        return PassbookCalculator.getDateRange(filter, customDateRange);
    };

    // Format currency using profile's currency code
    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

    // Get display text for the selected date filter
    const getPeriodDisplayText = (filter) => {
        switch (filter) {
            case 'today':
                return 'Today';
            case 'yesterday':
                return 'Yesterday';
            case 'last7':
                return 'Last 7 days (inc today)';
            case 'last30':
                return 'Last 30 days (inc today)';
            case 'last90':
                return 'Last 90 days (inc today)';
            case 'custom':
                if (customDateRange.start && customDateRange.end) {
                    // Use consistent MM/DD/YYYY format to match the input format
                    const formatDate = (date) => {
                        const month = (date.getMonth() + 1).toString().padStart(2, '0');
                        const day = date.getDate().toString().padStart(2, '0');
                        const year = date.getFullYear();
                        return `${month}/${day}/${year}`;
                    };
                    return `${formatDate(customDateRange.start)} - ${formatDate(customDateRange.end)}`;
                }
                return 'Custom period';

            default:
                return 'Selected period';
        }
    };

    // Open best selling products modal
    const openBestSellingModal = () => {
        setShowBestSellingModal(true);
    };

    // Close best selling products modal
    const closeBestSellingModal = () => {
        setShowBestSellingModal(false);
    };

    // Open category-wise sales modal
    const openCategoryWiseModal = () => {
        setShowCategoryWiseModal(true);
    };

    // Close category-wise sales modal
    const closeCategoryWiseModal = () => {
        setShowCategoryWiseModal(false);
    };

    // Open sales summary modal
    const openSalesSummaryModal = () => {
        setShowSalesSummaryModal(true);
    };

    // Close sales summary modal
    const closeSalesSummaryModal = () => {
        setShowSalesSummaryModal(false);
    };

    // Open sales trends modal
    const openSalesTrendsModal = () => {
        setShowSalesTrendsModal(true);
    };

    // Close sales trends modal
    const closeSalesTrendsModal = () => {
        setShowSalesTrendsModal(false);
    };

    const openPaymentMethodsModal = () => {
        setShowPaymentMethodsModal(true);
    };

    const closePaymentMethodsModal = () => {
        setShowPaymentMethodsModal(false);
    };

    // Open discount report modal
    const openDiscountReportModal = () => {
        setShowDiscountReportModal(true);
    };

    // Close discount report modal
    const closeDiscountReportModal = () => {
        setShowDiscountReportModal(false);
    };

    // Download functions
    const downloadPDF = () => {
        // Create HTML content for PDF printing
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Reports & Analytics</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 20px; 
                    color: #333; 
                    line-height: 1.6;
                }
                h1 { 
                    color: #ef4444; 
                    border-bottom: 2px solid #ef4444; 
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                h2 { 
                    color: #374151; 
                    margin-top: 30px; 
                    margin-bottom: 15px;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .summary-card {
                    border: 1px solid #e5e7eb;
                    padding: 15px;
                    border-radius: 8px;
                    background: #f9fafb;
                }
                .metric-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #111827;
                }
                .metric-label {
                    color: #6b7280;
                    font-size: 14px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                th, td {
                    border: 1px solid #e5e7eb;
                    padding: 8px 12px;
                    text-align: left;
                }
                th {
                    background-color: #f3f4f6;
                    font-weight: bold;
                }
                .footer {
                    margin-top: 40px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Reports & Analytics</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${dateFilter.replace('last', 'Last ').replace('days', ' Days')}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Revenue (${getPeriodDisplayText(dateFilter)})</div>
                    <div class="metric-value">${formatCurrency(realMetrics?.totalRevenue || reportsData.summary.totalRevenue)}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Orders (${getPeriodDisplayText(dateFilter)})</div>
                    <div class="metric-value">${realMetrics?.totalOrders || reportsData.summary.totalOrders}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Order Value (${getPeriodDisplayText(dateFilter)})</div>
                    <div class="metric-value">${formatCurrency(realMetrics?.avgOrderValue || reportsData.summary.avgOrderValue)}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Growth Rate</div>
                    <div class="metric-value">${reportsData.summary.growthRate >= 0 ? '+' : ''}${reportsData.summary.growthRate}%</div>
                </div>
            </div>

            <h2>Top Selling Products</h2>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Product Name</th>
                        <th>Sales (Units)</th>
                        <th>Revenue</th>
                    </tr>
                </thead>
                <tbody>
                    ${reportsData.topProducts.map((product, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${product.name}</td>
                            <td>${product.sales}</td>
                            <td>${formatCurrency(product.revenue)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h2>Daily Sales Data</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Revenue</th>
                        <th>Orders</th>
                    </tr>
                </thead>
                <tbody>
                    ${reportsData.salesData.map(day => `
                        <tr>
                            <td>${day.date}</td>
                            <td>${formatCurrency(day.revenue)}</td>
                            <td>${day.orders}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

        </body>
        </html>
        `;

        // Use the same browser print approach as the bill printing system
        try {
            // Create a hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';

            // Add the iframe to the document
            document.body.appendChild(iframe);

            // Write content to the iframe
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            // Wait for resources to load then print
            iframe.onload = () => {
                // Trigger print dialog
                iframe.contentWindow.print();

                // Remove the iframe after printing
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 500);
            };

            // Set a timeout in case onload doesn't fire
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    iframe.contentWindow.print();
                    setTimeout(() => {
                        if (document.body.contains(iframe)) {
                            document.body.removeChild(iframe);
                        }
                    }, 500);
                }
            }, 1000);


        } catch (error) {
            console.error("Error opening print dialog:", error);
            // Fallback: silent error handling
        }
    };

    const downloadExcel = () => {
        setIsGeneratingExcel(true);

        // Load SheetJS library if not already loaded
        if (!window.XLSX) {
            // Create script tag to load XLSX library
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            script.onload = () => generateExcelFile();
            script.onerror = () => fallbackToCSV();
            document.head.appendChild(script);
            return;
        }

        generateExcelFile();
    };

    const generateExcelFile = () => {
        try {
            const XLSX = window.XLSX;

            // Create a new workbook
            const workbook = XLSX.utils.book_new();

            // 1. Summary Sheet
            const summaryData = [
                ['REPORTS & ANALYTICS SUMMARY'],
                ['Generated on:', new Date().toLocaleDateString('en-IN')],
                ['Period:', dateFilter.replace('last', 'Last ').replace('days', ' Days')],
                [''], // Empty row
                [`SUMMARY METRICS (${getPeriodDisplayText(dateFilter)} - Real Data)`],
                ['Metric', 'Value'],
                ['Total Revenue', formatCurrency(realMetrics?.totalRevenue || 0)],
                ['Total Orders', (realMetrics?.totalOrders || 0).toLocaleString()],
                ['Average Order Value', formatCurrency(realMetrics?.avgOrderValue || 0)],
                [''], // Empty row
                ['DUMMY DATA METRICS (' + dateFilter.replace('last', 'Last ').replace('days', ' Days') + ')'],
                ['Metric', 'Value'],
                ['Total Revenue (Dummy)', formatCurrency(reportsData.summary.totalRevenue)],
                ['Total Orders (Dummy)', reportsData.summary.totalOrders.toLocaleString()],
                ['Average Order Value (Dummy)', formatCurrency(reportsData.summary.avgOrderValue)],
                ['Growth Rate', `${reportsData.summary.growthRate >= 0 ? '+' : ''}${reportsData.summary.growthRate}%`],
                ['New Customers', reportsData.customerData.reduce((sum, day) => sum + day.new, 0)]
            ];

            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            summarySheet['!cols'] = [{ width: 20 }, { width: 25 }];
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

            // 2. Top Products Sheet
            const productsData = [
                ['TOP SELLING PRODUCTS'],
                ['Rank', 'Product Name', 'Sales (Units)', 'Revenue'],
                ...reportsData.topProducts.map((product, index) => [
                    index + 1, product.name, product.sales, formatCurrency(product.revenue)
                ])
            ];

            const productsSheet = XLSX.utils.aoa_to_sheet(productsData);
            productsSheet['!cols'] = [{ width: 8 }, { width: 20 }, { width: 15 }, { width: 15 }];
            XLSX.utils.book_append_sheet(workbook, productsSheet, 'Top Products');

            // 3. Daily Sales Sheet
            const salesData = [
                ['DAILY SALES DATA'],
                ['Date', 'Revenue', 'Orders', 'Dine-in', 'Takeaway', 'Delivery'],
                ...reportsData.salesData.map((day, index) => [
                    day.date, formatCurrency(day.revenue), day.orders,
                    reportsData.orderData[index]?.dineIn || 0,
                    reportsData.orderData[index]?.takeaway || 0,
                    reportsData.orderData[index]?.delivery || 0
                ])
            ];

            const salesSheet = XLSX.utils.aoa_to_sheet(salesData);
            salesSheet['!cols'] = [{ width: 12 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }];
            XLSX.utils.book_append_sheet(workbook, salesSheet, 'Daily Sales');

            // 4. Customer Analytics Sheet
            const customerData = [
                ['CUSTOMER ANALYTICS'],
                ['Date', 'New Customers', 'Returning Customers', 'Total'],
                ...reportsData.customerData.map(day => [
                    day.date, day.new, day.returning, day.new + day.returning
                ])
            ];

            const customerSheet = XLSX.utils.aoa_to_sheet(customerData);
            customerSheet['!cols'] = [{ width: 12 }, { width: 15 }, { width: 18 }, { width: 10 }];
            XLSX.utils.book_append_sheet(workbook, customerSheet, 'Customer Analytics');

            // Generate and download Excel file
            const fileName = `reports-${dateFilter}-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);



        } catch (error) {
            console.error('Error in generateExcelFile:', error);
            fallbackToCSV();
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    const fallbackToCSV = () => {
        // Create CSV content
        let csvContent = "data:text/csv;charset=utf-8,";

        csvContent += "SUMMARY METRICS\n";
        csvContent += "Metric,Value\n";
        csvContent += `Total Revenue,${formatCurrency(reportsData.summary.totalRevenue)}\n`;
        csvContent += `Total Orders,${reportsData.summary.totalOrders}\n`;
        csvContent += `Average Order Value,${formatCurrency(reportsData.summary.avgOrderValue)}\n`;
        csvContent += `Growth Rate,${reportsData.summary.growthRate}%\n\n`;

        csvContent += "TOP SELLING PRODUCTS\n";
        csvContent += "Rank,Product Name,Sales (Units),Revenue\n";
        reportsData.topProducts.forEach((product, index) => {
            csvContent += `${index + 1},${product.name},${product.sales},${formatCurrency(product.revenue)}\n`;
        });

        csvContent += "\nDAILY SALES DATA\n";
        csvContent += "Date,Revenue,Orders\n";
        reportsData.salesData.forEach(day => {
            csvContent += `${day.date},${formatCurrency(day.revenue)},${day.orders}\n`;
        });

        // Download CSV
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `reports-${dateFilter}-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setIsGeneratingExcel(false);
    };

    // Chart placeholder component
    const ChartPlaceholder = ({ type, title, data }) => {
        return (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    <div className="flex items-center space-x-2">
                        <i className={`ph ph-chart-${type} text-gray-400 text-xl`}></i>
                        <span className="text-sm text-gray-500 capitalize">{type} Chart</span>
                    </div>
                </div>

                <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                    <div className="text-center">
                        <i className={`ph ph-chart-${type} text-gray-400 text-4xl mb-2`}></i>
                        <p className="text-gray-500 text-sm">
                            {type.charAt(0).toUpperCase() + type.slice(1)} chart placeholder
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                            Data points: {Array.isArray(data) ? data.length : 'N/A'}
                        </p>
                    </div>
                </div>
            </div>
        );
    };


    return (
        <div className="space-y-6 px-4 md:px-6 py-4">
            {/* Header with tab switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
                    <p className="text-red-600">Business insights and performance metrics</p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Download Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={downloadPDF}
                            className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
                        >
                            <i className="ph ph-file-pdf text-lg"></i>
                            <span className="hidden sm:inline">PDF</span>
                        </button>
                        <button
                            onClick={downloadExcel}
                            disabled={isGeneratingExcel}
                            className={`flex items-center gap-2 px-3 py-2 ${isGeneratingExcel ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white rounded-md transition-colors text-sm font-medium`}
                        >
                            <i className={`ph ${isGeneratingExcel ? 'ph-spinner ph-spin' : 'ph-file-xls'} text-lg`}></i>
                            <span className="hidden sm:inline">{isGeneratingExcel ? 'Generating...' : 'Excel'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Date filter tabs - Analytics style */}
            <div className="flex items-center gap-4 overflow-x-auto pb-2 mb-6">
                {dateFilters.map(filter => (
                    <button
                        key={filter.id}
                        className={`px-4 py-2 whitespace-nowrap ${dateFilter === filter.id
                            ? 'text-blue-600 border-b-2 border-blue-600 font-medium'
                            : 'text-red-600 hover:text-blue-600'
                            }`}
                        onClick={() => setDateFilter(filter.id)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* Custom date range picker */}
            {dateFilter === 'custom' && (
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">
                            From:
                        </label>
                        <input
                            type="date"
                            value={customDateRange.start?.toISOString().split('T')[0] || ''}
                            onChange={(e) => {
                                const startDate = e.target.value ? new Date(e.target.value) : null;
                                if (startDate) {
                                    // Set start time to the beginning of the day (00:00:00.000)
                                    startDate.setHours(0, 0, 0, 0);
                                }
                                handleCustomDateRangeChange(startDate, customDateRange.end);
                            }}
                            className="px-3 py-2 border border-gray-200 rounded-lg"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">
                            To:
                        </label>
                        <input
                            type="date"
                            value={customDateRange.end?.toISOString().split('T')[0] || ''}
                            onChange={(e) => {
                                const endDate = e.target.value ? new Date(e.target.value) : null;
                                if (endDate) {
                                    // For same day selection, we'll adjust this in handleCustomDateRangeChange
                                    endDate.setHours(0, 0, 0, 0);
                                }
                                handleCustomDateRangeChange(customDateRange.start, endDate);
                            }}
                            className="px-3 py-2 border border-gray-200 rounded-lg"
                        />
                    </div>
                    <button
                        onClick={() => {
                            // Trigger recalculation when dates are set
                            if (customDateRange.start && customDateRange.end) {
                                calculateRealMetrics(dateFilter);
                            }
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                    >
                        Apply
                    </button>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Total Revenue</p>
                            {isLoadingMetrics ? (
                                <div className="flex items-center space-x-2">
                                    <div className="animate-pulse bg-gray-300 h-8 w-24 rounded"></div>
                                </div>
                            ) : (
                                <p className="text-2xl font-bold text-gray-900">{formatCurrency(realMetrics?.totalRevenue || 0)}</p>
                            )}
                        </div>
                        <div className="p-3 bg-green-50 rounded-full">
                            <i className="ph ph-currency-circle-dollar text-red-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            {isLoadingMetrics ? 'Loading...' : getPeriodDisplayText(dateFilter)}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Total Orders</p>
                            {isLoadingMetrics ? (
                                <div className="flex items-center space-x-2">
                                    <div className="animate-pulse bg-gray-300 h-8 w-16 rounded"></div>
                                </div>
                            ) : (
                                <p className="text-2xl font-bold text-gray-900">{realMetrics?.totalOrders || 0}</p>
                            )}
                        </div>
                        <div className="p-3 bg-blue-50 rounded-full">
                            <i className="ph ph-shopping-cart text-blue-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            {isLoadingMetrics ? 'Loading...' : getPeriodDisplayText(dateFilter)}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Avg Order Value</p>
                            {isLoadingMetrics ? (
                                <div className="flex items-center space-x-2">
                                    <div className="animate-pulse bg-gray-300 h-8 w-20 rounded"></div>
                                </div>
                            ) : (
                                <p className="text-2xl font-bold text-gray-900">{formatCurrency(realMetrics?.avgOrderValue || 0)}</p>
                            )}
                        </div>
                        <div className="p-3 bg-purple-50 rounded-full">
                            <i className="ph ph-trending-up text-purple-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            {isLoadingMetrics ? 'Loading...' : 'Total Revenue / Total Orders'}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">New Customers</p>
                            {isLoadingMetrics ? (
                                <div className="flex items-center space-x-2">
                                    <div className="animate-pulse bg-gray-300 h-8 w-16 rounded"></div>
                                </div>
                            ) : (
                                <p className="text-2xl font-bold text-gray-900">{realMetrics?.newCustomers || 0}</p>
                            )}
                        </div>
                        <div className="p-3 bg-orange-50 rounded-full">
                            <i className="ph ph-users text-orange-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            {isLoadingMetrics ? 'Loading...' : getPeriodDisplayText(dateFilter)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sales Revenue Chart */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-semibold text-gray-800">Sales Revenue Trend</h3>
                            <div className="group relative">
                                <i className="ph ph-hand-pointing text-blue-500 text-sm cursor-pointer"></i>
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                    Click any point for details
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            {/* Chart type toggle for revenue chart */}
                            <div className="flex rounded-lg shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setRevenueChartType('line')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${revenueChartType === 'line'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-l-lg`}
                                >
                                    Line
                                </button>
                                <button
                                    onClick={() => setRevenueChartType('bar')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${revenueChartType === 'bar'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-r-lg`}
                                >
                                    Bar
                                </button>
                            </div>
                            <i className={`ph ph-chart-${revenueChartType} text-gray-400 text-xl`}></i>
                            <span className="text-sm text-gray-500 capitalize">{revenueChartType} Chart</span>
                        </div>
                    </div>

                    <div className="h-64 relative">
                        {isLoadingMetrics ? (
                            <div className="h-full bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                                <div className="text-center">
                                    <i className="ph ph-spinner text-gray-400 text-4xl animate-spin mb-2"></i>
                                    <p className="text-gray-500 text-sm">Loading chart data...</p>
                                </div>
                            </div>
                        ) : (
                            <canvas ref={revenueChartRef}></canvas>
                        )}
                    </div>
                </div>

                {/* Orders Chart */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-semibold text-gray-800">Daily Orders</h3>
                            <div className="group relative">
                                <i className="ph ph-hand-pointing text-blue-500 text-sm cursor-pointer"></i>
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                    Click any point for details
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            {/* Chart type toggle for orders chart */}
                            <div className="flex rounded-lg shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setOrdersChartType('bar')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${ordersChartType === 'bar'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-l-lg`}
                                >
                                    Bar
                                </button>
                                <button
                                    onClick={() => setOrdersChartType('line')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${ordersChartType === 'line'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-r-lg`}
                                >
                                    Line
                                </button>
                            </div>
                            <i className={`ph ph-chart-${ordersChartType} text-gray-400 text-xl`}></i>
                            <span className="text-sm text-gray-500 capitalize">{ordersChartType} Chart</span>
                        </div>
                    </div>

                    <div className="h-64 relative">
                        {isLoadingMetrics ? (
                            <div className="h-full bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                                <div className="text-center">
                                    <i className="ph ph-spinner text-gray-400 text-4xl animate-spin mb-2"></i>
                                    <p className="text-gray-500 text-sm">Loading chart data...</p>
                                </div>
                            </div>
                        ) : (
                            <canvas ref={ordersChartRef} onLoad={() => console.log('[ReportsPage] Orders chart canvas loaded')}></canvas>
                        )}
                    </div>
                </div>

                {/* Order Source Distribution */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-800">Order Source Distribution</h3>
                        <div className="flex items-center space-x-2">
                            {/* Chart type toggle for payment chart */}
                            <div className="flex rounded-lg shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setPaymentChartType('pie')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${paymentChartType === 'pie'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-l-lg`}
                                >
                                    Pie
                                </button>
                                <button
                                    onClick={() => setPaymentChartType('bar')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${paymentChartType === 'bar'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-r-lg`}
                                >
                                    Bar
                                </button>
                            </div>
                            <i className={`ph ph-chart-${paymentChartType} text-gray-400 text-xl`}></i>
                            <span className="text-sm text-gray-500 capitalize">{paymentChartType} Chart</span>
                        </div>
                    </div>

                    <div className="h-64 relative">
                        {isLoadingMetrics ? (
                            <div className="h-full bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                                <div className="text-center">
                                    <i className="ph ph-spinner text-gray-400 text-4xl animate-spin mb-2"></i>
                                    <p className="text-gray-500 text-sm">Loading chart data...</p>
                                </div>
                            </div>
                        ) : (
                            <div className="chart-container" style={{ position: 'relative', height: '100%' }}>
                                <canvas ref={pieChartRef} onLoad={() => console.log('[ReportsPage] Pie chart canvas loaded')}></canvas>
                                <div style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    fontSize: '12px',
                                    color: '#888',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    👆 Click for details
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Customer Analytics */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-800">Customer Analytics</h3>
                        <div className="flex items-center space-x-2">
                            {/* Chart type toggle for customer chart */}
                            <div className="flex rounded-lg shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setCustomerChartType('bar')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${customerChartType === 'bar'
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-l-lg`}
                                >
                                    Bar
                                </button>
                                <button
                                    onClick={() => setCustomerChartType('line')}
                                    className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${customerChartType === 'line'
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } rounded-r-lg`}
                                >
                                    Line
                                </button>
                            </div>
                            <i className={`ph ph-chart-${customerChartType} text-gray-400 text-xl`}></i>
                            <span className="text-sm text-gray-500 capitalize">{customerChartType} Chart</span>
                        </div>
                    </div>

                    <div className="h-64 relative">
                        {isLoadingMetrics ? (
                            <div className="h-full bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                                <div className="text-center">
                                    <i className="ph ph-spinner text-gray-400 text-4xl animate-spin mb-2"></i>
                                    <p className="text-gray-500 text-sm">Loading chart data...</p>
                                </div>
                            </div>
                        ) : (
                            <div className="chart-container" style={{ position: 'relative', height: '100%' }}>
                                <canvas ref={customerChartRef} onLoad={() => console.log('[ReportsPage] Customer chart canvas loaded')}></canvas>
                                <div style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    fontSize: '12px',
                                    color: '#888',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    👆 Click for details
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Reports Cards Section */}
            <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Available Reports</h3>
                    <p className="text-red-600 text-sm mt-1">Generate detailed reports for business insights and analysis</p>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Best Selling Products Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-trophy text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Best Selling Products</h4>
                            <p className="text-red-600 text-sm mb-4">Products driving the most revenue</p>
                            <button
                                onClick={openBestSellingModal}
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                            >
                                View Report
                            </button>
                        </div>

                        {/* Category-wise Sales Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-chart-pie text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Category-wise Sales</h4>
                            <p className="text-red-600 text-sm mb-4">Sales by channels and payment methods</p>
                            <button
                                onClick={openCategoryWiseModal}
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                            >
                                View Report
                            </button>
                        </div>

                        {/* Sales Summary */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-chart-bar text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Sales Summary</h4>
                            <p className="text-red-600 text-sm mb-4">Overall revenue picture and insights</p>
                            <button
                                onClick={openSalesSummaryModal}
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                            >
                                View Report
                            </button>
                        </div>

                        {/* Sales Trends Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-trending-up text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Sales Trends</h4>
                            <p className="text-red-600 text-sm mb-4">Analyze sales patterns over time</p>
                            <button
                                onClick={openSalesTrendsModal}
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium">
                                View Report
                            </button>
                        </div>

                        {/* Payment Methods Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-credit-card text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Payment Methods</h4>
                            <p className="text-red-600 text-sm mb-4">Breakdown by payment preferences</p>
                            <button
                                onClick={openPaymentMethodsModal}
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium">
                                View Report
                            </button>
                        </div>

                        {/* Discount Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-percent text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Discount Report</h4>
                            <p className="text-red-600 text-sm mb-4">Track promotional offers and discounts</p>
                            <button
                                onClick={openDiscountReportModal}
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium">
                                View Report
                            </button>
                        </div>

                        {/* Void & Comp Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-x-circle text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Void & Comp Report</h4>
                            <p className="text-red-600 text-sm mb-4">Cancelled orders and complimentary items</p>
                            <button className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium">
                                View Report
                            </button>
                        </div>

                        {/* Inventory Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-package text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Inventory Report</h4>
                            <p className="text-red-600 text-sm mb-4">Stock levels and movement analysis</p>
                            <button className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium">
                                View Report
                            </button>
                        </div>

                        {/* Wastage Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-trash text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Wastage Report</h4>
                            <p className="text-red-600 text-sm mb-4">Track food waste and cost impact</p>
                            <button className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium">
                                View Report
                            </button>
                        </div>

                        {/* Profit Margin Report */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-chart-line-up text-red-600 text-xl"></i>
                                </div>

                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Profit Margin Report</h4>
                            <p className="text-red-600 text-sm mb-4">Gross profit and margin analysis</p>
                            <button className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium">
                                View Report
                            </button>
                        </div>

                        {/* Tax Reports */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <i className="ph ph-receipt text-red-600 text-xl"></i>
                                </div>
                            </div>
                            <h4 className="font-semibold text-gray-800 mb-2">Tax Reports</h4>
                            <p className="text-red-600 text-sm mb-4">GST and tax liability breakdown</p>
                            <button
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                                onClick={handleTaxReportOpen} // Change this to use the new handler
                            >
                                View Report
                            </button>
                        </div>

                    </div>
                </div>
            </div>

            {/* Best Selling Products Modal */}
            <BestSellingProductsModal
                isOpen={showBestSellingModal}
                onClose={closeBestSellingModal}
            />

            {/* Category-wise Sales Modal */}
            <CategoryWiseSalesModal
                isOpen={showCategoryWiseModal}
                onClose={closeCategoryWiseModal}
            />

            {/* Sales Summary Modal */}
            <SalesSummaryModal
                isOpen={showSalesSummaryModal}
                onClose={closeSalesSummaryModal}
            />

            {/* Sales Trends Modal */}
            <SalesTrendsModal
                isOpen={showSalesTrendsModal}
                onClose={closeSalesTrendsModal}
            />

            {/* Payment Methods Modal */}
            <PaymentMethodsModal
                isOpen={showPaymentMethodsModal}
                onClose={closePaymentMethodsModal}
                data={realMetrics?.paymentDistribution || {}}
                dateRange={getDateRange(dateFilter)}
                onExport={() => { }} // No longer needed as the modal has its own export functions
                sdk={sdk}
            />

            {/* Discount Report Modal */}
            <DiscountReportModal
                isOpen={showDiscountReportModal}
                onClose={closeDiscountReportModal}
            />

            <TaxReportModal
                isOpen={showTaxReportModal}
                onClose={handleTaxReportClose}
            />

            {/* Daily Revenue Detail Modal */}
            <DailyRevenueDetailModal
                isOpen={showDailyRevenueDetailModal}
                onClose={handleDailyRevenueDetailClose}
                selectedDate={selectedDayForDetail}
            />

            {/* Order Source Detail Modal */}
            <OrderSourceDetailModal
                isOpen={showOrderSourceModal}
                onClose={() => setShowOrderSourceModal(false)}
            />

            {/* Customer Analytics Detail Modal */}
            <CustomerAnalyticsDetailModal
                isOpen={showCustomerAnalyticsModal}
                onClose={() => setShowCustomerAnalyticsModal(false)}
                selectedDay={selectedDayForAnalytics}
            />
        </div>
    );
}
export default ReportsPage;
