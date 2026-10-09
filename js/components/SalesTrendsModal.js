import { useState, useEffect } from 'react';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { Chart, registerables } from 'chart.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { sdk } from '../sdk.js';
import { FinancialYearUtils } from '../utils/FinancialYearUtils.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { motion } from 'framer-motion';

Chart.register(...registerables);

export default function SalesTrendsModal({ isOpen, onClose }) {
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [trendType, setTrendType] = useState('years'); // years, days, months, custom
    const [daysFilter, setDaysFilter] = useState('30'); // 7, 30, 90
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [chartInstance, setChartInstance] = useState(null);
    const [expandedSection, setExpandedSection] = useState(null);

    const { profile } = useProfile();

    // Trend type options
    const trendTypes = [
        { id: 'years', label: 'Years' },
        { id: 'days', label: 'Days' },
        { id: 'months', label: 'Months' },
        { id: 'custom', label: 'Custom' }
    ];

    // Days filter options
    const daysFilters = [
        { id: '7', label: '7 Days' },
        { id: '30', label: '30 Days' },
        { id: '90', label: '90 Days' }
    ];

    useEffect(() => {
        if (isOpen && trendType !== 'custom') {
            fetchSalesTrendsData();
        }
    }, [isOpen, trendType, daysFilter]);

    // Update chart when reportData changes
    useEffect(() => {
        if (reportData) {
            updateChart(reportData);
        }
    }, [reportData]);

    const fetchSalesTrendsData = async () => {
        setIsLoading(true);
        try {
            let data;
            
            switch (trendType) {
                case 'years':
                    data = await fetchYearlyTrends();
                    break;
                case 'days':
                    data = await fetchDailyTrends(daysFilter);
                    break;
                case 'months':
                    data = await fetchMonthlyTrends();
                    break;
                case 'custom':
                    if (customStartDate && customEndDate) {
                        data = await fetchCustomTrends();
                    }
                    break;
                default:
                    data = await fetchYearlyTrends();
            }
            
            setReportData(data);
        } catch (error) {
            console.error('Error fetching sales trends data:', error);
            showToast('Failed to load sales trends data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchYearlyTrends = async () => {
        try {
            // Fetch data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Get all financial years from the data - use the same approach as other services
            const financialYears = FinancialYearUtils.getFinancialYearsList(2); // Last 2 years plus current
            
            // Initialize yearly data structure
            const yearlyData = {};
            
            // Process each financial year
            for (const fy of financialYears) {
                const { start, end } = FinancialYearUtils.getFinancialYearDateRange(fy);
                
                // Filter transactions for this financial year using PassbookCalculator
                const fyTransactions = PassbookCalculator.filterTransactions(
                    passbookData.transactions,
                    {
                        dateFilter: 'custom',
                        customDateRange: { start, end },
                        activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                        customers: passbookData.customers
                    }
                );
                
                // Get orders corresponding to these transactions
                const orderIds = new Set(fyTransactions.map(t => t.orderId));
                const orders = passbookData.orders.filter(order => {
                    // Use the same order filtering logic as other services
                    const isCompleted = order.currentStatus?.label === 'COMPLETED';
                    const isPaid = order.paid === true;
                    const noStatusInfo = !order.currentStatus;
                    
                    return orderIds.has(order.id) && (isCompleted || isPaid || noStatusInfo);
                });
                
                // Initialize metrics
                let totalSales = 0;
                const customers = new Set();
                let onlineSales = 0;
                let dineInSales = 0;
                let orderCount = 0;
                
                // Process each order
                orders.forEach(order => {
                    // Calculate order total using the same method as other services
                    const orderTotal = calculateOrderTotal(order);
                    
                    // Add to metrics
                    totalSales += orderTotal;
                    customers.add(order.customerId || 'unknown');
                    orderCount += 1;
                    
                    // Categorize sales based on order source/type
                    const channel = getOrderChannel(order);
                    if (channel === 'Zomato' || channel === 'Swiggy' || channel === 'Online') {
                        onlineSales += orderTotal;
                    } else {
                        dineInSales += orderTotal;
                    }
                });
                
                yearlyData[fy] = {
                    year: fy,
                    totalSales,
                    totalCustomers: customers.size,
                    onlineSales,
                    dineInSales,
                    orderCount
                };
            }
            
            // Convert to array and sort by year
            const result = Object.values(yearlyData).sort((a, b) => {
                // Extract numeric year for sorting (e.g., from "2024-25" get 2024)
                const yearA = parseInt(a.year.split('-')[0]);
                const yearB = parseInt(b.year.split('-')[0]);
                return yearA - yearB;
            });
            
            return {
                type: 'years',
                data: result,
                title: 'Yearly Sales Trends'
            };
        } catch (error) {
            console.error('Error fetching yearly trends:', error);
            throw error;
        }
    };

    const fetchDailyTrends = async (days) => {
        try {
            // Calculate date range using PassbookCalculator
            const dateFilter = `last${days}`;
            const dateRange = PassbookCalculator.getDateRange(dateFilter);
            
            // Fetch data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions for the date range using PassbookCalculator
            const dateRangeTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: dateFilter, // Use the actual date filter instead of 'custom'
                    customDateRange: dateRange,
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders corresponding to these transactions
            const orderIds = new Set(dateRangeTransactions.map(t => t.orderId));
            const orders = passbookData.orders.filter(order => {
                // Use the same order filtering logic as other services
                const isCompleted = order.currentStatus?.label === 'COMPLETED';
                const isPaid = order.paid === true;
                const noStatusInfo = !order.currentStatus;
                
                return orderIds.has(order.id) && (isCompleted || isPaid || noStatusInfo);
            });
            
            // Group by date
            const dailyData = {};
            
            orders.forEach(order => {
                // Calculate order total using the same method as other services
                const orderTotal = calculateOrderTotal(order);
                
                // Convert Firebase timestamp to Date if needed
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date);
                const dateKey = orderDate.toISOString().split('T')[0]; // YYYY-MM-DD
                
                if (!dailyData[dateKey]) {
                    dailyData[dateKey] = {
                        date: dateKey,
                        displayDate: orderDate.toLocaleDateString('en-IN'),
                        totalSales: 0,
                        totalCustomers: new Set(),
                        onlineSales: 0,
                        dineInSales: 0,
                        orderCount: 0
                    };
                }
                
                // Add order data
                dailyData[dateKey].totalSales += orderTotal;
                dailyData[dateKey].totalCustomers.add(order.customerId || 'unknown');
                dailyData[dateKey].orderCount += 1;
                
                // Categorize sales
                const channel = getOrderChannel(order);
                if (channel === 'Zomato' || channel === 'Swiggy' || channel === 'Online') {
                    dailyData[dateKey].onlineSales += orderTotal;
                } else {
                    dailyData[dateKey].dineInSales += orderTotal;
                }
            });
            
            // Convert to array and sort by date
            const result = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
            
            return {
                type: 'days',
                data: result,
                title: `${days} Days Sales Trends`,
                days: days
            };
        } catch (error) {
            console.error('Error fetching daily trends:', error);
            throw error;
        }
    };

    const fetchMonthlyTrends = async () => {
        try {
            // Fetch data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Get date range for the last 12 months
            const now = new Date();
            const start = new Date(now.getFullYear() - 1, now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            
            // Filter transactions for the date range using PassbookCalculator
            const monthlyTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: 'custom',
                    customDateRange: { start, end },
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders corresponding to these transactions
            const orderIds = new Set(monthlyTransactions.map(t => t.orderId));
            const orders = passbookData.orders.filter(order => {
                // Use the same order filtering logic as other services
                const isCompleted = order.currentStatus?.label === 'COMPLETED';
                const isPaid = order.paid === true;
                const noStatusInfo = !order.currentStatus;
                
                return orderIds.has(order.id) && (isCompleted || isPaid || noStatusInfo);
            });
            
            // Group by month (using calendar months for simplicity in monthly view)
            const monthlyData = {};
            
            orders.forEach(order => {
                // Calculate order total using the same method as other services
                const orderTotal = calculateOrderTotal(order);
                
                // Convert Firebase timestamp to Date if needed
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date);
                
                // Get calendar month
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthIndex = orderDate.getMonth();
                const monthName = monthNames[monthIndex];
                const year = orderDate.getFullYear();
                const monthKey = `${monthName}-${year}`;
                
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = {
                        monthKey: monthKey,
                        displayMonth: `${monthName} ${year}`,
                        totalSales: 0,
                        totalCustomers: new Set(),
                        onlineSales: 0,
                        dineInSales: 0,
                        orderCount: 0
                    };
                }
                
                // Add order data
                monthlyData[monthKey].totalSales += orderTotal;
                monthlyData[monthKey].totalCustomers.add(order.customerId || 'unknown');
                monthlyData[monthKey].orderCount += 1;
                
                // Categorize sales
                const channel = getOrderChannel(order);
                if (channel === 'Zomato' || channel === 'Swiggy' || channel === 'Online') {
                    monthlyData[monthKey].onlineSales += orderTotal;
                } else {
                    monthlyData[monthKey].dineInSales += orderTotal;
                }
            });
            
            // Convert to array and sort by month
            const result = Object.values(monthlyData).sort((a, b) => {
                // Parse month and year for proper sorting
                const [monthA, yearA] = a.monthKey.split('-');
                const [monthB, yearB] = b.monthKey.split('-');
                
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthIndexA = monthNames.indexOf(monthA);
                const monthIndexB = monthNames.indexOf(monthB);
                
                // First compare years, then months
                if (yearA !== yearB) {
                    return yearA - yearB;
                }
                return monthIndexA - monthIndexB;
            });
            
            return {
                type: 'months',
                data: result,
                title: 'Monthly Sales Trends'
            };
        } catch (error) {
            console.error('Error fetching monthly trends:', error);
            throw error;
        }
    };

    // New function to fetch custom trends
    const fetchCustomTrends = async () => {
        try {
            if (!customStartDate || !customEndDate) {
                throw new Error('Please select both start and end dates');
            }

            // Parse dates
            const startDate = new Date(customStartDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);

            // Fetch data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions for the custom date range using PassbookCalculator
            const customTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: 'custom',
                    customDateRange: { start: startDate, end: endDate },
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders corresponding to these transactions
            const orderIds = new Set(customTransactions.map(t => t.orderId));
            const orders = passbookData.orders.filter(order => {
                // Use the same order filtering logic as other services
                const isCompleted = order.currentStatus?.label === 'COMPLETED';
                const isPaid = order.paid === true;
                const noStatusInfo = !order.currentStatus;
                
                return orderIds.has(order.id) && (isCompleted || isPaid || noStatusInfo);
            });
            
            // Group by date for custom period
            const dailyData = {};
            
            // First, initialize all dates in the range with zero values
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
                dailyData[dateKey] = {
                    date: dateKey,
                    displayDate: currentDate.toLocaleDateString('en-IN'),
                    totalSales: 0,
                    totalCustomers: new Set(),
                    onlineSales: 0,
                    dineInSales: 0,
                    orderCount: 0
                };
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // Then, process orders and update the data
            orders.forEach(order => {
                // Calculate order total using the same method as other services
                const orderTotal = calculateOrderTotal(order);
                
                // Convert Firebase timestamp to Date if needed
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date);
                const dateKey = orderDate.toISOString().split('T')[0]; // YYYY-MM-DD
                
                // Add order data (this will update the existing entry for this date)
                dailyData[dateKey].totalSales += orderTotal;
                dailyData[dateKey].totalCustomers.add(order.customerId || 'unknown');
                dailyData[dateKey].orderCount += 1;
                
                // Categorize sales
                const channel = getOrderChannel(order);
                if (channel === 'Zomato' || channel === 'Swiggy' || channel === 'Online') {
                    dailyData[dateKey].onlineSales += orderTotal;
                } else {
                    dailyData[dateKey].dineInSales += orderTotal;
                }
            });
            
            // Convert to array and sort by date
            const result = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Format the date range for display
            const formattedStartDate = new Date(customStartDate).toLocaleDateString('en-IN');
            const formattedEndDate = new Date(customEndDate).toLocaleDateString('en-IN');
            
            // Create serializable date range objects
            const serializableDateRange = {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            };
            
            return {
                type: 'custom',
                data: result,
                title: `Custom Period Sales Trends (${formattedStartDate} to ${formattedEndDate})`,
                dateRange: serializableDateRange
            };
        } catch (error) {
            console.error('Error fetching custom trends:', error);
            throw error;
        }
    };

    // Helper function to calculate order total (same as other services)
    const calculateOrderTotal = (order) => {
        let total = 0;

        // Calculate items total
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const quantity = item.qnt || item.quantity || 1;
                const price = item.price || 0;
                total += price * quantity;
            });
        }

        // Apply discount
        const discount = order.discount || 0;
        total -= discount;

        // Add charges (taxes, service charges, etc.)
        if (order.charges && Array.isArray(order.charges)) {
            order.charges.forEach(charge => {
                if (!charge.inclusive) { // Only add exclusive charges
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

    // Helper function to determine order channel (same as SalesSummaryService)
    const getOrderChannel = (order) => {
        const source = (order.source || '').toLowerCase();
        const priceVariant = (order.priceVariant || '').toLowerCase();
        const tableId = (order.tableId || '').toLowerCase();

        if (source === 'zomato' || priceVariant === 'zomato' || tableId === 'zomato') {
            return 'Zomato';
        }
        if (source === 'swiggy' || priceVariant === 'swiggy' || tableId === 'swiggy') {
            return 'Swiggy';
        }
        if (order.isOnline || priceVariant === 'online') {
            return 'Online';
        }
        if (order.tableId && order.tableId.startsWith('Table')) {
            return 'Dine-In';
        }
        if (priceVariant === 'takeaway') {
            return 'Takeaway';
        }
        
        return 'In-Store';
    };

    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

    const updateChart = (data) => {
        if (!data || !data.data || data.data.length === 0) return;
        
        console.log('Updating chart with data:', data);
        
        const ctx = document.getElementById('salesTrendsChart');
        if (!ctx) return;
        
        // Destroy existing chart if it exists
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        let labels = [];
        let salesData = [];
        let customersData = [];
        let onlineSalesData = [];
        let dineInSalesData = [];
        
        switch (data.type) {
            case 'years':
                labels = data.data.map(item => item.year);
                salesData = data.data.map(item => item.totalSales);
                customersData = data.data.map(item => item.totalCustomers);
                onlineSalesData = data.data.map(item => item.onlineSales);
                dineInSalesData = data.data.map(item => item.dineInSales);
                break;
            case 'days':
                labels = data.data.map(item => item.displayDate);
                salesData = data.data.map(item => item.totalSales);
                customersData = data.data.map(item => item.totalCustomers.size);
                onlineSalesData = data.data.map(item => item.onlineSales);
                dineInSalesData = data.data.map(item => item.dineInSales);
                break;
            case 'custom': // Custom period also uses daily data
                // For custom date range, show all dates in the range, even those with no data
                if (data.dateRange) {
                    const startDate = new Date(data.dateRange.start);
                    const endDate = new Date(data.dateRange.end);
                    const currentDate = new Date(startDate);
                    
                    // Generate all dates in the range
                    const allDates = [];
                    while (currentDate <= endDate) {
                        allDates.push(new Date(currentDate));
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                    
                    // Map to labels and data
                    labels = allDates.map(date => date.toLocaleDateString('en-IN'));
                    salesData = allDates.map(date => {
                        const dateKey = date.toISOString().split('T')[0];
                        const dayData = data.data.find(item => item.date === dateKey);
                        return dayData ? dayData.totalSales : 0;
                    });
                    customersData = allDates.map(date => {
                        const dateKey = date.toISOString().split('T')[0];
                        const dayData = data.data.find(item => item.date === dateKey);
                        return dayData ? dayData.totalCustomers.size : 0;
                    });
                    onlineSalesData = allDates.map(date => {
                        const dateKey = date.toISOString().split('T')[0];
                        const dayData = data.data.find(item => item.date === dateKey);
                        return dayData ? dayData.onlineSales : 0;
                    });
                    dineInSalesData = allDates.map(date => {
                        const dateKey = date.toISOString().split('T')[0];
                        const dayData = data.data.find(item => item.date === dateKey);
                        return dayData ? dayData.dineInSales : 0;
                    });
                } else {
                    // Fallback to existing behavior
                    labels = data.data.map(item => item.displayDate);
                    salesData = data.data.map(item => item.totalSales);
                    customersData = data.data.map(item => item.totalCustomers.size);
                    onlineSalesData = data.data.map(item => item.onlineSales);
                    dineInSalesData = data.data.map(item => item.dineInSales);
                }
                break;
            case 'months':
                labels = data.data.map(item => item.displayMonth);
                salesData = data.data.map(item => item.totalSales);
                customersData = data.data.map(item => item.totalCustomers.size);
                onlineSalesData = data.data.map(item => item.onlineSales);
                dineInSalesData = data.data.map(item => item.dineInSales);
                break;
        }
        
        console.log('Chart labels:', labels);
        console.log('Chart sales data:', salesData);
        
        const newChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Total Sales',
                        data: salesData,
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'Customers',
                        data: customersData,
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.1,
                        fill: false,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Online Sales',
                        data: onlineSalesData,
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'Dine-in Sales',
                        data: dineInSalesData,
                        borderColor: 'rgb(139, 69, 19)',
                        backgroundColor: 'rgba(139, 69, 19, 0.1)',
                        tension: 0.1,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Sales Amount'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Customers'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                }
            }
        });
        
        setChartInstance(newChart);
    };

    const exportToPDF = () => {
        if (!reportData) return;
        setIsExporting(true);
        
        try {
            let tableHeaders = [];
            let tableRows = [];
            
            switch (reportData.type) {
                case 'years':
                    tableHeaders = ['Year', 'Total Sales', 'Customers', 'Online Sales', 'Dine-in Sales'];
                    tableRows = reportData.data.map(item => [
                        item.year,
                        formatCurrency(item.totalSales),
                        item.totalCustomers,
                        formatCurrency(item.onlineSales),
                        formatCurrency(item.dineInSales)
                    ]);
                    break;
                case 'days':
                case 'custom': // Custom period also uses daily data
                    tableHeaders = ['Date', 'Total Sales', 'Customers', 'Online Sales', 'Dine-in Sales'];
                    tableRows = reportData.data.map(item => [
                        item.displayDate,
                        formatCurrency(item.totalSales),
                        item.totalCustomers.size,
                        formatCurrency(item.onlineSales),
                        formatCurrency(item.dineInSales)
                    ]);
                    break;
                case 'months':
                    tableHeaders = ['Month', 'Total Sales', 'Customers', 'Online Sales', 'Dine-in Sales'];
                    tableRows = reportData.data.map(item => [
                        item.displayMonth,
                        formatCurrency(item.totalSales),
                        item.totalCustomers.size,
                        formatCurrency(item.onlineSales),
                        formatCurrency(item.dineInSales)
                    ]);
                    break;
            }
            
            // Add Total Row
            if (reportData.data.length > 0) {
                const totalSales = reportData.data.reduce((sum, item) => sum + item.totalSales, 0);
                const totalCustomers = reportData.type === 'years' 
                    ? reportData.data.reduce((sum, item) => sum + item.totalCustomers, 0)
                    : reportData.data.reduce((sum, item) => sum + item.totalCustomers.size, 0);
                const totalOnlineSales = reportData.data.reduce((sum, item) => sum + item.onlineSales, 0);
                const totalDineInSales = reportData.data.reduce((sum, item) => sum + item.dineInSales, 0);
                
                tableRows.push([
                    'Total',
                    formatCurrency(totalSales),
                    totalCustomers,
                    formatCurrency(totalOnlineSales),
                    formatCurrency(totalDineInSales)
                ]);
            }
            
            // Format the title with date range for custom reports
            let title = `Sales Trends Report - ${reportData.title}`;
            if (reportData.dateRange) {
                title += ` (${reportData.dateRange.start.toLocaleDateString('en-IN')} to ${reportData.dateRange.end.toLocaleDateString('en-IN')})`;
            }
            
            let tableHTML = '<table style="width:100%; border-collapse: collapse; margin: 20px 0;">';
            tableHTML += '<thead><tr>';
            tableHeaders.forEach(header => {
                tableHTML += `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">${header}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';
            
            tableRows.forEach((row, index) => {
                // Check if this is the last row (Total Row)
                const isTotalRow = index === tableRows.length - 1 && reportData.data.length > 0;
                const rowStyle = isTotalRow ? 'font-weight: bold; background-color: #f9f9f9;' : '';
                
                tableHTML += `<tr style="${rowStyle}">`;
                row.forEach(cell => {
                    tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${cell}</td>`;
                });
                tableHTML += '</tr>';
            });
            
            tableHTML += '</tbody></table>';
            
            const printContent = `
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #ef4444; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; }
                .total-row { font-weight: bold; background-color: #f9f9f9; }
            </style>
            <h1>${title}</h1>
            <p>Generated on ${new Date().toLocaleDateString('en-IN')}</p>
            ${tableHTML}
            `;
            
            const printWindow = window.open('', '_blank');
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.print();
            printWindow.close();
        } catch (error) {
            console.error('Error exporting PDF:', error);
            showToast('Failed to export PDF', 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const exportToExcel = () => {
        if (!reportData) return;
        
        setIsGeneratingExcel(true);
        
        try {
            // Load SheetJS library if not already loaded
            if (!window.XLSX) {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
                script.onload = () => {
                    generateExcelFile();
                };
                script.onerror = () => {
                    showToast('Failed to load Excel library', 'error');
                    setIsGeneratingExcel(false);
                };
                document.head.appendChild(script);
                return;
            }
            
            generateExcelFile();
        } catch (error) {
            console.error('Error exporting Excel:', error);
            showToast('Failed to export Excel', 'error');
            setIsGeneratingExcel(false);
        }
    };

    const generateExcelFile = () => {
        try {
            const XLSX = window.XLSX;
            
            // Create a new workbook
            const workbook = XLSX.utils.book_new();
            
            // Format the title with date range for custom reports
            let title = `Sales Trends Report - ${reportData.title}`;
            if (reportData.dateRange) {
                title += ` (${reportData.dateRange.start.toLocaleDateString('en-IN')} to ${reportData.dateRange.end.toLocaleDateString('en-IN')})`;
            }
            
            // Prepare data based on trend type
            let headers = [];
            let dataRows = [];
            
            switch (reportData.type) {
                case 'years':
                    headers = ['Year', 'Total Sales', 'Customers', 'Online Sales', 'Dine-in Sales'];
                    dataRows = reportData.data.map(item => [
                        item.year,
                        formatCurrency(item.totalSales), // Use formatCurrency for consistency
                        item.totalCustomers,
                        formatCurrency(item.onlineSales), // Use formatCurrency for consistency
                        formatCurrency(item.dineInSales) // Use formatCurrency for consistency
                    ]);
                    break;
                case 'days':
                case 'custom': // Custom period also uses daily data
                    headers = ['Date', 'Total Sales', 'Customers', 'Online Sales', 'Dine-in Sales'];
                    dataRows = reportData.data.map(item => [
                        item.displayDate,
                        formatCurrency(item.totalSales), // Use formatCurrency for consistency
                        item.totalCustomers.size,
                        formatCurrency(item.onlineSales), // Use formatCurrency for consistency
                        formatCurrency(item.dineInSales) // Use formatCurrency for consistency
                    ]);
                    break;
                case 'months':
                    headers = ['Month', 'Total Sales', 'Customers', 'Online Sales', 'Dine-in Sales'];
                    dataRows = reportData.data.map(item => [
                        item.displayMonth,
                        formatCurrency(item.totalSales), // Use formatCurrency for consistency
                        item.totalCustomers.size,
                        formatCurrency(item.onlineSales), // Use formatCurrency for consistency
                        formatCurrency(item.dineInSales) // Use formatCurrency for consistency
                    ]);
                    break;
            }
            
            // Add Total Row
            if (reportData.data.length > 0) {
                const totalSales = reportData.data.reduce((sum, item) => sum + item.totalSales, 0);
                const totalCustomers = reportData.type === 'years' 
                    ? reportData.data.reduce((sum, item) => sum + item.totalCustomers, 0)
                    : reportData.data.reduce((sum, item) => sum + item.totalCustomers.size, 0);
                const totalOnlineSales = reportData.data.reduce((sum, item) => sum + item.onlineSales, 0);
                const totalDineInSales = reportData.data.reduce((sum, item) => sum + item.dineInSales, 0);
                
                dataRows.push([
                    'Total',
                    formatCurrency(totalSales),
                    totalCustomers,
                    formatCurrency(totalOnlineSales),
                    formatCurrency(totalDineInSales)
                ]);
            }
            
            // Create worksheet data
            const wsData = [headers, ...dataRows];
            const worksheet = XLSX.utils.aoa_to_sheet(wsData);
            
            // Add styling for the Total Row (if it exists)
            if (reportData.data.length > 0 && worksheet) {
                // Get the range of the worksheet
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                
                // Style the header row
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const address = XLSX.utils.encode_cell({ r: 0, c: C });
                    if (!worksheet[address]) continue;
                    worksheet[address].s = {
                        font: { bold: true },
                        fill: { fgColor: { rgb: "FFEFEFEF" } }
                    };
                }
                
                // Style the Total Row (last row)
                const totalRow = range.e.r;
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const address = XLSX.utils.encode_cell({ r: totalRow, c: C });
                    if (!worksheet[address]) continue;
                    worksheet[address].s = {
                        font: { bold: true },
                        fill: { fgColor: { rgb: "FFF0F0F0" } }
                    };
                }
            }
            
            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Trends');
            
            // Generate and download Excel file
            const fileName = `sales-trends-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            
            showToast('Excel file downloaded successfully', 'success');
        } catch (error) {
            console.error('Error in generateExcelFile:', error);
            showToast('Failed to generate Excel file', 'error');
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    // Handle apply custom date range
    const handleApplyCustomRange = () => {
        if (customStartDate && customEndDate) {
            fetchSalesTrendsData();
        }
    };

    if (!isOpen) return null;

    const handleSectionClick = (section) => {
        if (expandedSection === section) {
            setExpandedSection(null);
        } else {
            setExpandedSection(section);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-xl">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-purple-100 rounded-xl shadow-sm">
                                <i className="ph ph-trending-up text-purple-600 text-2xl"></i>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Sales Trends Report</h2>
                                <p className="text-sm text-purple-600 mt-1">Analyze sales patterns over time</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={exportToExcel}
                                disabled={isGeneratingExcel || isLoading}
                                className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center space-x-2 transition-colors duration-200 shadow-sm"
                            >
                                <i className={`ph ${isGeneratingExcel ? 'ph-spinner ph-spin' : 'ph-file-xls'}`}></i>
                                <span>{isGeneratingExcel ? 'Generating...' : 'Export Excel'}</span>
                            </button>
                            <button
                                onClick={exportToPDF}
                                disabled={isExporting || isLoading}
                                className="px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm flex items-center space-x-2 transition-colors duration-200 shadow-sm"
                            >
                                <i className="ph ph-file-pdf"></i>
                                <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                            >
                                <i className="ph ph-x text-2xl"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Chart Container */}
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex space-x-4">
                            {trendTypes.map((type) => (
                                <button
                                    key={type.id}
                                    onClick={() => setTrendType(type.id)}
                                    className={`px-4 py-2 rounded-lg transition-colors duration-200 ${
                                        trendType === type.id 
                                            ? 'bg-purple-600 text-white' 
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                        
                        {trendType === 'custom' && (
                            <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-2">
                                    <label htmlFor="startDate" className="text-sm text-gray-600">From:</label>
                                    <input
                                        type="date"
                                        id="startDate"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <label htmlFor="endDate" className="text-sm text-gray-600">To:</label>
                                    <input
                                        type="date"
                                        id="endDate"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>
                                <button
                                    onClick={handleApplyCustomRange}
                                    disabled={!customStartDate || !customEndDate}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors duration-200"
                                >
                                    Apply
                                </button>
                            </div>
                        )}
                        
                        {trendType === 'days' && (
                            <div className="flex space-x-2">
                                {daysFilters.map((filter) => (
                                    <button
                                        key={filter.id}
                                        onClick={() => setDaysFilter(filter.id)}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 ${
                                            daysFilter === filter.id 
                                                ? 'bg-purple-600 text-white' 
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="h-80">
                        <canvas id="salesTrendsChart"></canvas>
                    </div>
                </div>

                {/* Detailed Reports Section */}
                <div className="border-t border-gray-200">
                    <div className="p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Reports</h3>
                        
                        {/* Daily Orders Section */}
                        <div className="mb-6">
                            <button
                                onClick={() => handleSectionClick('dailyOrders')}
                                className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                            >
                                <span className="text-lg font-medium text-gray-900">Daily Orders</span>
                                <i className={`ph ${expandedSection === 'dailyOrders' ? 'ph-caret-down' : 'ph-caret-right'} text-xl text-gray-500`}></i>
                            </button>
                            
                            <motion.div 
                                initial="closed"
                                animate={expandedSection === 'dailyOrders' ? 'open' : 'closed'}
                                variants={{
                                    open: { opacity: 1, height: 'auto' },
                                    closed: { opacity: 0, height: 0 }
                                }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 bg-gray-50 border-t border-gray-200">
                                    {reportData && reportData.data && reportData.data.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead>
                                                    <tr>
                                                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Sales</th>
                                                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {reportData.data.map((item, index) => (
                                                        <tr key={index} className="hover:bg-gray-50">
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.displayDate}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(item.totalSales)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.orderCount}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 text-gray-500">No data available</div>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                        
                        {/* Order Source Duration Section */}
                        <div>
                            <button
                                onClick={() => handleSectionClick('orderSource')}
                                className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                            >
                                <span className="text-lg font-medium text-gray-900">Order Source Duration</span>
                                <i className={`ph ${expandedSection === 'orderSource' ? 'ph-caret-down' : 'ph-caret-right'} text-xl text-gray-500`}></i>
                            </button>
                            
                            <motion.div 
                                initial="closed"
                                animate={expandedSection === 'orderSource' ? 'open' : 'closed'}
                                variants={{
                                    open: { opacity: 1, height: 'auto' },
                                    closed: { opacity: 0, height: 0 }
                                }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 bg-gray-50 border-t border-gray-200">
                                    {reportData && reportData.data && reportData.data.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-md font-medium text-gray-900">Online Sales</h4>
                                                <div className="text-right">
                                                    <div className="text-sm text-gray-500">Total Online Sales</div>
                                                    <div className="text-lg font-semibold text-green-600">{formatCurrency(reportData.data.reduce((sum, item) => sum + item.onlineSales, 0))}</div>
                                                </div>
                                            </div>
                                            
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead>
                                                        <tr>
                                                            <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                            <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Online Sales</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {reportData.data.map((item, index) => (
                                                            <tr key={index} className="hover:bg-gray-50">
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.displayDate}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(item.onlineSales)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            
                                            <div className="mt-4">
                                                <h4 className="text-md font-medium text-gray-900 mb-2">Dine-in Sales</h4>
                                                
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead>
                                                            <tr>
                                                                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dine-in Sales</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {reportData.data.map((item, index) => (
                                                                <tr key={index} className="hover:bg-gray-50">
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.displayDate}</td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(item.dineInSales)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 text-gray-500">No data available</div>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}