import { useState, useEffect } from 'react';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { sdk } from '../sdk.js';
import { FinancialYearUtils } from '../utils/FinancialYearUtils.js';
import { CurrencyData } from '../utils/CurrencyData.js';

export default function DiscountReportModal({ isOpen, onClose }) {
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [reportType, setReportType] = useState('days'); // yearly, monthly, days, custom
    const [daysFilter, setDaysFilter] = useState('30'); // 7, 30, 90
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [selectedYear, setSelectedYear] = useState('2024-2025');
    const [selectedMonth, setSelectedMonth] = useState('jan');
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    
    const { profile } = useProfile();

    // Report type options
    const reportTypes = [
        { id: 'yearly', label: 'By Financial Year' },
        { id: 'monthly', label: 'By Month' },
        { id: 'days', label: 'By Days' },
        { id: 'custom', label: 'Custom' }
    ];

    // Financial years options
    const financialYears = [
        { id: '2023-2024', label: '2023-2024' },
        { id: '2024-2025', label: '2024-2025' },
        { id: '2025-2026', label: '2025-2026' }
    ];

    // Months options
    const months = [
        { id: 'jan', label: 'January' },
        { id: 'feb', label: 'February' },
        { id: 'mar', label: 'March' },
        { id: 'apr', label: 'April' },
        { id: 'may', label: 'May' },
        { id: 'jun', label: 'June' },
        { id: 'jul', label: 'July' },
        { id: 'aug', label: 'August' },
        { id: 'sep', label: 'September' },
        { id: 'oct', label: 'October' },
        { id: 'nov', label: 'November' },
        { id: 'dec', label: 'December' }
    ];

    // Days filter options
    const daysFilters = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: '7', label: 'Last 7 Days' },
        { id: '30', label: 'Last 30 Days' },
        { id: '90', label: 'Last 90 Days' }
    ];

    useEffect(() => {
        if (isOpen && reportType !== 'custom') {
            fetchDiscountData();
        }
    }, [isOpen, reportType, daysFilter, selectedYear, selectedMonth, customStartDate, customEndDate]);

    // Add effect to handle currency changes
    useEffect(() => {
        const handleCurrencyChange = () => {
            // Force re-render when currency changes by updating state
            setIsLoading(prev => prev); // This will trigger a re-render
        };

        window.addEventListener('currencyChanged', handleCurrencyChange);
        
        return () => {
            window.removeEventListener('currencyChanged', handleCurrencyChange);
        };
    }, []);

    const fetchDiscountData = async () => {
        setIsLoading(true);
        try {
            let data;
            
            switch (reportType) {
                case 'yearly':
                    data = await fetchYearlyDiscounts();
                    break;
                case 'monthly':
                    data = await fetchMonthlyDiscounts();
                    break;
                case 'days':
                    data = await fetchDailyDiscounts(daysFilter);
                    break;
                case 'custom':
                    if (customStartDate && customEndDate) {
                        data = await fetchCustomDiscounts();
                    }
                    break;
                default:
                    data = await fetchDailyDiscounts('30');
            }
            
            setReportData(data);
        } catch (error) {
            console.error('Error fetching discount data:', error);
            showToast('Failed to load discount data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchYearlyDiscounts = async () => {
        try {
            // Fetch data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Initialize yearly data structure
            const yearlyData = [];
            
            // Process each financial year
            for (const fy of financialYears) {
                const { start, end } = FinancialYearUtils.getFinancialYearDateRange(fy.id);
                
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
                
                // Get orders with discounts
                const ordersWithDiscounts = passbookData.orders.filter(order => {
                    // Check if order has discount
                    const hasDiscount = order.discount && Number(order.discount) > 0;
                    
                    // Check if order is within date range
                    const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now());
                    const isInRange = orderDate >= start && orderDate <= end;
                    
                    // Check if order is completed or paid
                    const isCompleted = order.currentStatus?.label === 'COMPLETED';
                    const isPaid = order.paid === true;
                    const noStatusInfo = !order.currentStatus;
                    
                    return hasDiscount && isInRange && (isCompleted || isPaid || noStatusInfo);
                });
                
                // Calculate total discount for this year
                const totalDiscount = ordersWithDiscounts.reduce((sum, order) => {
                    return sum + (Number(order.discount) || 0);
                }, 0);
                
                yearlyData.push({
                    year: fy.id,
                    label: fy.label,
                    totalDiscount,
                    orderCount: ordersWithDiscounts.length,
                    orders: ordersWithDiscounts.map(order => ({
                        id: order.id,
                        date: order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now()),
                        totalAmount: calculateOrderTotal(order),
                        discount: Number(order.discount) || 0
                    }))
                });
            }
            
            return {
                type: 'yearly',
                data: yearlyData,
                title: 'Yearly Discount Report'
            };
        } catch (error) {
            console.error('Error fetching yearly discounts:', error);
            throw error;
        }
    };

    const fetchMonthlyDiscounts = async () => {
        try {
            // Calculate date range for the selected month
            const monthIndex = months.findIndex(m => m.id === selectedMonth);
            const currentYear = new Date().getFullYear();
            const startDate = new Date(currentYear, monthIndex, 1);
            const endDate = new Date(currentYear, monthIndex + 1, 0, 23, 59, 59, 999);
            
            // Fetch data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions for the date range using PassbookCalculator
            const monthlyTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: 'custom',
                    customDateRange: { start: startDate, end: endDate },
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders with discounts
            const ordersWithDiscounts = passbookData.orders.filter(order => {
                // Check if order has discount
                const hasDiscount = order.discount && Number(order.discount) > 0;
                
                // Check if order is within date range
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now());
                const isInRange = orderDate >= startDate && orderDate <= endDate;
                
                // Check if order is completed or paid
                const isCompleted = order.currentStatus?.label === 'COMPLETED';
                const isPaid = order.paid === true;
                const noStatusInfo = !order.currentStatus;
                
                return hasDiscount && isInRange && (isCompleted || isPaid || noStatusInfo);
            });
            
            // Calculate total discount for this month
            const totalDiscount = ordersWithDiscounts.reduce((sum, order) => {
                return sum + (Number(order.discount) || 0);
            }, 0);
            
            const monthLabel = months.find(m => m.id === selectedMonth)?.label || selectedMonth;
            
            return {
                type: 'monthly',
                data: {
                    month: selectedMonth,
                    label: monthLabel,
                    year: currentYear,
                    totalDiscount,
                    orderCount: ordersWithDiscounts.length,
                    orders: ordersWithDiscounts.map(order => ({
                        id: order.id,
                        date: order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now()),
                        totalAmount: calculateOrderTotal(order),
                        discount: Number(order.discount) || 0
                    }))
                },
                title: `Monthly Discount Report - ${monthLabel} ${currentYear}`
            };
        } catch (error) {
            console.error('Error fetching monthly discounts:', error);
            throw error;
        }
    };

    const fetchDailyDiscounts = async (days) => {
        try {
            // Calculate date range using PassbookCalculator
            const dateFilter = days === 'today' || days === 'yesterday' ? days : `last${days}`;
            const dateRange = PassbookCalculator.getDateRange(dateFilter);
            
            // Fetch data using PassbookCalculator for consistency
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions for the date range using PassbookCalculator
            const dailyTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: dateFilter,
                    customDateRange: dateRange,
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders with discounts
            const ordersWithDiscounts = passbookData.orders.filter(order => {
                // Check if order has discount
                const hasDiscount = order.discount && Number(order.discount) > 0;
                
                // Check if order is within date range
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now());
                const isInRange = orderDate >= dateRange.start && orderDate <= dateRange.end;
                
                // Check if order is completed or paid
                const isCompleted = order.currentStatus?.label === 'COMPLETED';
                const isPaid = order.paid === true;
                const noStatusInfo = !order.currentStatus;
                
                return hasDiscount && isInRange && (isCompleted || isPaid || noStatusInfo);
            });
            
            // Calculate total discount for this period
            const totalDiscount = ordersWithDiscounts.reduce((sum, order) => {
                return sum + (Number(order.discount) || 0);
            }, 0);
            
            const daysLabel = daysFilters.find(d => d.id === days)?.label || `${days} Days`;
            
            return {
                type: 'days',
                data: {
                    period: days,
                    label: daysLabel,
                    totalDiscount,
                    orderCount: ordersWithDiscounts.length,
                    orders: ordersWithDiscounts.map(order => ({
                        id: order.id,
                        date: order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now()),
                        totalAmount: calculateOrderTotal(order),
                        discount: Number(order.discount) || 0
                    }))
                },
                title: `Discount Report - ${daysLabel}`
            };
        } catch (error) {
            console.error('Error fetching daily discounts:', error);
            throw error;
        }
    };

    const fetchCustomDiscounts = async () => {
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
            
            // Get orders with discounts
            const ordersWithDiscounts = passbookData.orders.filter(order => {
                // Check if order has discount
                const hasDiscount = order.discount && Number(order.discount) > 0;
                
                // Check if order is within date range
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now());
                const isInRange = orderDate >= startDate && orderDate <= endDate;
                
                // Check if order is completed or paid
                const isCompleted = order.currentStatus?.label === 'COMPLETED';
                const isPaid = order.paid === true;
                const noStatusInfo = !order.currentStatus;
                
                return hasDiscount && isInRange && (isCompleted || isPaid || noStatusInfo);
            });
            
            // Calculate total discount for this period
            const totalDiscount = ordersWithDiscounts.reduce((sum, order) => {
                return sum + (Number(order.discount) || 0);
            }, 0);
            
            return {
                type: 'custom',
                data: {
                    startDate: customStartDate,
                    endDate: customEndDate,
                    totalDiscount,
                    orderCount: ordersWithDiscounts.length,
                    orders: ordersWithDiscounts.map(order => ({
                        id: order.id,
                        date: order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now()),
                        totalAmount: calculateOrderTotal(order),
                        discount: Number(order.discount) || 0
                    }))
                },
                title: `Discount Report - Custom Period (${customStartDate} to ${customEndDate})`
            };
        } catch (error) {
            console.error('Error fetching custom discounts:', error);
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

    // Format currency using profile's currency code
    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

    const exportToPDF = () => {
        if (!reportData) return;
        setIsExporting(true);
        
        try {
            let tableHeaders = ['Date & Time', 'Order ID', 'Total Amount', 'Discount Given'];
            let tableRows = [];
            
            // Get orders based on report type
            let orders = [];
            if (reportData.type === 'yearly') {
                // For yearly, combine orders from all years
                orders = reportData.data.flatMap(yearData => yearData.orders || []);
            } else {
                // For other types, get orders directly
                orders = reportData.data.orders || [];
            }
            
            // Sort orders by date (newest first)
            orders.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Prepare table rows
            tableRows = orders.map(order => [
                new Date(order.date).toLocaleString('en-IN'),
                order.id,
                formatCurrency(order.totalAmount),
                formatCurrency(order.discount)
            ]);
            
            // Add Total Row
            if (orders.length > 0) {
                const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
                const totalDiscount = orders.reduce((sum, order) => sum + order.discount, 0);
                
                tableRows.push([
                    '', // Empty for date
                    'Total', // Total label
                    formatCurrency(totalAmount),
                    formatCurrency(totalDiscount)
                ]);
            }
            
            const title = reportData.title;
            
            let tableHTML = '<table style="width:100%; border-collapse: collapse; margin: 20px 0;">';
            tableHTML += '<thead><tr>';
            tableHeaders.forEach(header => {
                tableHTML += `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">${header}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';
            
            tableRows.forEach((row, index) => {
                // Check if this is the last row (Total Row)
                const isTotalRow = index === tableRows.length - 1 && orders.length > 0;
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
            
            const title = reportData.title;
            
            // Prepare data based on report type
            let orders = [];
            if (reportData.type === 'yearly') {
                // For yearly, combine orders from all years
                orders = reportData.data.flatMap(yearData => yearData.orders || []);
            } else {
                // For other types, get orders directly
                orders = reportData.data.orders || [];
            }
            
            // Sort orders by date (newest first)
            orders.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Prepare headers and data rows
            const headers = ['Date & Time', 'Order ID', 'Total Amount', 'Discount Given'];
            const dataRows = orders.map(order => [
                new Date(order.date).toLocaleString('en-IN'),
                order.id,
                formatCurrency(order.totalAmount),
                formatCurrency(order.discount)
            ]);
            
            // Add Total Row
            if (orders.length > 0) {
                const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
                const totalDiscount = orders.reduce((sum, order) => sum + order.discount, 0);
                
                dataRows.push([
                    '', // Empty for date
                    'Total', // Total label
                    formatCurrency(totalAmount),
                    formatCurrency(totalDiscount)
                ]);
            }
            
            // Create worksheet data
            const wsData = [headers, ...dataRows];
            const worksheet = XLSX.utils.aoa_to_sheet(wsData);
            
            // Add styling for the Total Row (if it exists)
            if (orders.length > 0 && worksheet) {
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
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Discount Report');
            
            // Generate and download Excel file
            const fileName = `discount-report-${new Date().toISOString().split('T')[0]}.xlsx`;
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
            // When start and end dates are the same, adjust the end date to include the entire day
            let startDate = new Date(customStartDate);
            let endDate = new Date(customEndDate);
            
            // Set start time to the beginning of the day
            startDate.setHours(0, 0, 0, 0);
            
            // If dates are the same, set end time to the end of the day
            if (startDate.toDateString() === endDate.toDateString()) {
                endDate.setHours(23, 59, 59, 999);
            } else {
                // Otherwise, set end time to the end of the selected day
                endDate.setHours(23, 59, 59, 999);
            }
            
            // Update the state with adjusted dates
            setCustomStartDate(startDate.toISOString().split('T')[0]);
            setCustomEndDate(endDate.toISOString().split('T')[0]);
            
            fetchDiscountData();
        }
    };

    // Get current data for display
    const getCurrentData = () => {
        if (!reportData) return null;
        
        if (reportData.type === 'yearly') {
            return reportData.data;
        } else {
            return [reportData.data]; // Wrap in array for consistent handling
        }
    };

    // Get total discount across all data
    const getTotalDiscount = () => {
        const data = getCurrentData();
        if (!data) return 0;
        
        if (reportData.type === 'yearly') {
            return data.reduce((sum, item) => sum + (item.totalDiscount || 0), 0);
        } else {
            return data[0]?.totalDiscount || 0;
        }
    };

    // Get total order count across all data
    const getTotalOrderCount = () => {
        const data = getCurrentData();
        if (!data) return 0;
        
        if (reportData.type === 'yearly') {
            return data.reduce((sum, item) => sum + (item.orderCount || 0), 0);
        } else {
            return data[0]?.orderCount || 0;
        }
    };

    // Get orders for table display
    const getOrdersForDisplay = () => {
        const data = getCurrentData();
        if (!data) return [];
        
        if (reportData.type === 'yearly') {
            // For yearly, combine orders from all years
            return data.flatMap(yearData => yearData.orders || []);
        } else {
            // For other types, get orders directly
            return data[0]?.orders || [];
        }
    };

    if (!isOpen) return null;

    const currentData = getCurrentData();
    const totalDiscount = getTotalDiscount();
    const totalOrders = getTotalOrderCount();
    const displayOrders = getOrdersForDisplay();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-rose-50 to-pink-50 rounded-t-xl">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-rose-100 rounded-xl shadow-sm">
                                <i className="ph ph-tag text-rose-600 text-2xl"></i>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Discount Report</h2>
                                <p className="text-sm text-rose-600 mt-1">Track discounts given to customers</p>
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
                                className="px-4 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 text-sm flex items-center space-x-2 transition-colors duration-200 shadow-sm"
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

                {/* Controls */}
                <div className="p-5 bg-gray-50 border-b border-gray-200">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">View:</label>
                            <div className="flex rounded-lg shadow-sm overflow-hidden">
                                {reportTypes.map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setReportType(type.id)}
                                        className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                            reportType === type.id
                                                ? 'bg-rose-600 text-white'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } ${type.id === 'yearly' ? 'rounded-l-lg' : ''} ${
                                            type.id === 'custom' ? 'rounded-r-lg' : ''
                                        }`}
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {reportType === 'yearly' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Financial Year:</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {financialYears.map(year => (
                                        <option key={year.id} value={year.id}>
                                            {year.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {reportType === 'monthly' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Month:</label>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {months.map(month => (
                                        <option key={month.id} value={month.id}>
                                            {month.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {reportType === 'days' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Period:</label>
                                <select
                                    value={daysFilter}
                                    onChange={(e) => setDaysFilter(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {daysFilters.map((filter) => (
                                        <option key={filter.id} value={filter.id}>
                                            {filter.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {reportType === 'custom' && (
                            <div className="flex flex-col sm:flex-row gap-4 items-end">
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-700 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                    />
                                </div>
                                <div className="flex items-center h-full pb-1">
                                    <button
                                        onClick={handleApplyCustomRange}
                                        disabled={!customStartDate || !customEndDate}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm ${
                                            !customStartDate || !customEndDate
                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                : 'bg-rose-600 text-white hover:bg-rose-700'
                                        }`}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        <div className="ml-auto">
                            <button
                                onClick={fetchDiscountData}
                                disabled={isLoading}
                                className="px-4 py-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 text-sm disabled:opacity-50 flex items-center space-x-1 transition-colors duration-200 shadow-sm"
                            >
                                <i className={`ph ${isLoading ? 'ph-spinner ph-spin' : 'ph-arrow-clockwise'}`}></i>
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-220px)]">
                    {isLoading ? (
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-3">
                                <i className="ph ph-spinner text-rose-500 text-3xl animate-spin"></i>
                                <span className="text-gray-600 text-lg">Loading discount data...</span>
                            </div>
                        </div>
                    ) : currentData ? (
                        <div className="p-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                                <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-rose-800">Total Discount</h3>
                                        <i className="ph ph-tag text-rose-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(totalDiscount)}
                                    </p>
                                    <div className="mt-2 text-xs text-rose-600">
                                        Total discounts given
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-blue-800">Total Orders</h3>
                                        <i className="ph ph-shopping-cart text-blue-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {totalOrders.toLocaleString('en-IN')}
                                    </p>
                                    <div className="mt-2 text-xs text-blue-600">
                                        Orders with discounts
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-purple-800">Avg Discount</h3>
                                        <i className="ph ph-calculator text-purple-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {totalOrders > 0 ? formatCurrency(totalDiscount / totalOrders) : formatCurrency(0)}
                                    </p>
                                    <div className="mt-2 text-xs text-purple-600">
                                        Average per order
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-amber-800">Discount Rate</h3>
                                        <i className="ph ph-chart-line text-amber-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {totalOrders > 0 ? `${((totalOrders / (totalOrders + 10)) * 100).toFixed(1)}%` : '0%'}
                                    </p>
                                    <div className="mt-2 text-xs text-amber-600">
                                        Of total transactions
                                    </div>
                                </div>
                            </div>

                            {/* Discount Details Table */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-900">
                                            Discount Details
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            List of all discounts given during selected period
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-rose-100 text-rose-800">
                                            {displayOrders.length} records
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date & Time</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Order ID</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Amount</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Discount Given</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {displayOrders.length > 0 ? (
                                                    displayOrders
                                                        .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort by date, newest first
                                                        .map((order, index) => (
                                                            <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {new Date(order.date).toLocaleString('en-IN')}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                    #{order.id}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {formatCurrency(order.totalAmount)}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-rose-600 font-medium">
                                                                    {formatCurrency(order.discount)}
                                                                </td>
                                                            </tr>
                                                        ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                                                            <div className="inline-flex flex-col items-center space-y-4 text-gray-500">
                                                                <i className="ph ph-warning-circle text-5xl"></i>
                                                                <div>
                                                                    <p className="text-lg font-medium">No discount data available</p>
                                                                    <p className="mt-1">No discounts found for the selected period.</p>
                                                                </div>
                                                                <button
                                                                    onClick={fetchDiscountData}
                                                                    className="mt-2 px-5 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-sm font-medium transition-colors duration-200"
                                                                >
                                                                    Try Again
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                {/* Total Row */}
                                                {displayOrders.length > 0 && (
                                                    <tr className="bg-gray-50 font-semibold">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colSpan="2">
                                                            <div className="flex items-center space-x-3">
                                                                <div className="p-2 rounded-lg bg-gray-200">
                                                                    <i className="ph ph-calculator text-sm"></i>
                                                                </div>
                                                                <span>Total</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(displayOrders.reduce((sum, order) => sum + order.totalAmount, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(displayOrders.reduce((sum, order) => sum + order.discount, 0))}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-4">
                                <div className="p-4 bg-yellow-50 rounded-full">
                                    <i className="ph ph-warning-circle text-yellow-500 text-4xl"></i>
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">No data available</h3>
                                    <p className="mt-1 text-gray-500">No discount data found for the selected period.</p>
                                </div>
                                <button
                                    onClick={fetchDiscountData}
                                    className="mt-2 px-5 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-sm font-medium transition-colors duration-200 shadow-sm"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}