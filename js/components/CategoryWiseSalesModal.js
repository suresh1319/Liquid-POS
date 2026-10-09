import { useState, useEffect } from 'react';
import { CategoryWiseSalesService } from '../utils/CategoryWiseSalesService.js';
import { FinancialYearUtils } from '../utils/FinancialYearUtils.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { CurrencyData } from '../utils/CurrencyData.js';

export default function CategoryWiseSalesModal({ isOpen, onClose }) {
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedView, setSelectedView] = useState('aggregated'); // aggregated, yearly, days, custom
    const [selectedYear, setSelectedYear] = useState('');
    const [activeTab, setActiveTab] = useState('channels');
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [dateFilter, setDateFilter] = useState('last7');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    
    const { profile } = useProfile();

    // View options - Updated to match SalesTrendsModal
    const viewOptions = [
        { id: 'aggregated', label: 'Aggregated Year' },
        { id: 'yearly', label: 'By Financial Year' },
        { id: 'days', label: 'By Days' },
        { id: 'custom', label: 'Custom' } // Added custom option
    ];

    // Date filter options for "By days" view
    const dateFilters = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'last7', label: 'Last 7 Days' },
        { id: 'last30', label: 'Last 30 Days' },
        { id: 'last90', label: 'Last 90 Days' }
    ];

    useEffect(() => {
        if (isOpen && selectedView !== 'days' && selectedView !== 'custom') {
            fetchCategoryWiseData();
        }
    }, [isOpen, selectedView, selectedYear]);

    // Add useEffect for automatic data fetching when date filters change
    useEffect(() => {
        if (isOpen && (selectedView === 'days' || selectedView === 'custom')) {
            // For 'days' view with non-custom filters, fetch automatically
            if (selectedView === 'days' && dateFilter !== 'custom') {
                fetchCategoryWiseData();
            }
            // For 'custom' view, we still need to click Apply
        }
    }, [isOpen, selectedView, dateFilter]);

    const fetchCategoryWiseData = async () => {
        setIsLoading(true);
        try {
            let data;
            
            // Fetch data based on the selected view
            if (selectedView === 'days') {
                // For 'days' view, use the date filter
                if (dateFilter === 'custom' && customStartDate && customEndDate) {
                    // For custom date range, we need to pass the dates to the service
                    const customRange = {
                        start: new Date(customStartDate),
                        end: new Date(customEndDate)
                    };
                    data = await CategoryWiseSalesService.fetchCategoryWiseSalesByFilter(dateFilter, customRange);
                } else {
                    data = await CategoryWiseSalesService.fetchCategoryWiseSalesByFilter(dateFilter);
                }
            } else if (selectedView === 'custom') {
                // For 'custom' view, use custom date range
                if (customStartDate && customEndDate) {
                    const customRange = {
                        start: new Date(customStartDate),
                        end: new Date(customEndDate)
                    };
                    data = await CategoryWiseSalesService.fetchCategoryWiseSalesByFilter('custom', customRange);
                }
            } else if (selectedView === 'yearly') {
                // For 'yearly' view, get the full report
                const report = await CategoryWiseSalesService.getCategoryWiseSalesReport();
                data = report;
                if (report.currentFinancialYear) {
                    setSelectedYear(report.currentFinancialYear);
                }
            } else {
                // For 'aggregated' view, get the full report
                const report = await CategoryWiseSalesService.getCategoryWiseSalesReport();
                data = report;
                if (report.currentFinancialYear) {
                    setSelectedYear(report.currentFinancialYear);
                }
            }
            
            setReportData(data);
        } catch (error) {
            console.error('Error fetching category-wise sales data:', error);
            showToast('Failed to load category-wise sales data', 'error');
        } finally {
            setIsLoading(false);
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
            
            // Update the state with adjusted dates and fetch data
            setCustomStartDate(startDate.toISOString().split('T')[0]);
            setCustomEndDate(endDate.toISOString().split('T')[0]);
            
            // Fetch data after state update
            setTimeout(() => {
                fetchCategoryWiseData();
            }, 0);
        }
    };

    // Format currency using profile's currency code
    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

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

    const formatPercentage = (value) => {
        return `${value.toFixed(1)}%`;
    };

    // Get display text for the selected date filter
    const getPeriodDisplayText = (filter) => {
        // If we have custom dates set, show them regardless of the filter
        if (customStartDate && customEndDate && (selectedView === 'days' || selectedView === 'custom')) {
            return `${customStartDate} - ${customEndDate}`;
        }
        
        switch (filter) {
            case 'today':
                return 'Today';
            case 'yesterday':
                return 'Yesterday';
            case 'last7':
                return 'Last 7 Days';
            case 'last30':
                return 'Last 30 Days';
            case 'last90':
                return 'Last 90 Days';
            case 'custom':
                if (customStartDate && customEndDate) {
                    return `${customStartDate} - ${customEndDate}`;
                }
                return 'Custom Period';
            default:
                return 'Selected Period';
        }
    };

    const getChannelIcon = (channel) => {
        const icons = {
            'Dine-In': 'ph-chair',
            'Zomato': 'ph-pizza',
            'Swiggy': 'ph-bicycle',
            'Takeaway': 'ph-shopping-bag',
            'Online': 'ph-globe',
            'In-Store': 'ph-storefront'
        };
        return icons[channel] || 'ph-storefront';
    };

    const getChannelColor = (channel) => {
        const colors = {
            'Dine-In': 'text-blue-600 bg-blue-50',
            'Zomato': 'text-red-600 bg-red-50',
            'Swiggy': 'text-orange-600 bg-orange-50',
            'Takeaway': 'text-green-600 bg-green-50',
            'Online': 'text-purple-600 bg-purple-50',
            'In-Store': 'text-gray-600 bg-gray-50'
        };
        return colors[channel] || 'text-gray-600 bg-gray-50';
    };

    const getPaymentIcon = (method) => {
        const icons = {
            'Cash': 'ph-money',
            'UPI/Card': 'ph-credit-card',
            'Credit': 'ph-clock'
        };
        return icons[method] || 'ph-wallet';
    };

    const getPaymentColor = (method) => {
        const colors = {
            'Cash': 'text-green-600 bg-green-50',
            'UPI/Card': 'text-blue-600 bg-blue-50',
            'Credit': 'text-orange-600 bg-orange-50'
        };
        return colors[method] || 'text-gray-600 bg-gray-50';
    };

    const exportToPDF = () => {
        if (!reportData) return;
        setIsExporting(true);
        
        try {
            const currentData = selectedView === 'aggregated' 
                ? reportData.aggregatedData 
                : selectedView === 'yearly' 
                    ? (reportData.yearlyData ? (reportData.yearlyData[selectedYear] || {}) : {})
                    : reportData; // For 'days' and 'custom' views, use the data directly

            const title = selectedView === 'aggregated' 
                ? `Category-wise Sales Report - All Years`
                : selectedView === 'yearly'
                    ? `Category-wise Sales Report - ${selectedYear ? FinancialYearUtils.getFinancialYearLabel(selectedYear) : ''}`
                    : selectedView === 'custom'
                        ? `Category-wise Sales Report - Custom Period (${customStartDate} to ${customEndDate})`
                        : `Category-wise Sales Report - ${getPeriodDisplayText(dateFilter)}`;

            const printContent = `
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #3b82f6; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; }
            </style>
            <h1>${title}</h1>
            <p>Generated on ${new Date().toLocaleDateString('en-IN')}</p>
            <p>Period: ${getPeriodDisplayText(dateFilter)}</p>
            
            <h2>Sales by Channel</h2>
            <table>
                <tr><th>Channel</th><th>Revenue</th><th>Orders</th><th>Percentage</th></tr>
                ${(Array.isArray(currentData.channels) ? currentData.channels : []).map(ch => 
                    `<tr><td>${ch.channel || ''}</td><td>${formatCurrency(ch.revenue || 0)}</td><td>${ch.orders || 0}</td><td>${formatPercentage(ch.percentage || 0)}</td></tr>`
                ).join('')}
            </table>
            
            <h2>Sales by Payment Method</h2>
            <table>
                <tr><th>Payment Method</th><th>Revenue</th><th>Orders</th><th>Percentage</th></tr>
                ${(Array.isArray(currentData.paymentMethods) ? currentData.paymentMethods : []).map(pm => 
                    `<tr><td>${pm.paymentMethod || ''}</td><td>${formatCurrency(pm.revenue || 0)}</td><td>${pm.orders || 0}</td><td>${formatPercentage(pm.percentage || 0)}</td></tr>`
                ).join('')}
            </table>`;

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

    // Export report as Excel
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
            
            const currentData = selectedView === 'aggregated' 
                ? reportData.aggregatedData 
                : selectedView === 'yearly' 
                    ? (reportData.yearlyData ? (reportData.yearlyData[selectedYear] || {}) : {})
                    : reportData; // For 'days' and 'custom' views, use the data directly

            const title = selectedView === 'aggregated' 
                ? `Category-wise Sales Report - All Years`
                : selectedView === 'yearly'
                    ? `Category-wise Sales Report - ${selectedYear ? FinancialYearUtils.getFinancialYearLabel(selectedYear) : ''}`
                    : selectedView === 'custom'
                        ? `Category-wise Sales Report - Custom Period (${customStartDate} to ${customEndDate})`
                        : `Category-wise Sales Report - ${getPeriodDisplayText(dateFilter)}`;

            // Summary Sheet (for aggregated view)
            if (selectedView === 'aggregated' && reportData.summary) {
                const summaryData = [
                    ['Category-wise Sales Report - Summary'],
                    ['Generated on:', new Date().toLocaleDateString('en-IN')],
                    ['Period:', getPeriodDisplayText(dateFilter)],
                    ['View:', selectedView === 'aggregated' ? 'Aggregated (All Years)' : selectedView === 'yearly' ? `By Financial Year - ${selectedYear ? FinancialYearUtils.getFinancialYearLabel(selectedYear) : ''}` : selectedView === 'custom' ? `Custom Period - ${customStartDate} to ${customEndDate}` : `By Days - ${getPeriodDisplayText(dateFilter)}`],
                    [],
                    ['Metric', 'Value'],
                    ['Total Revenue', formatCurrency(reportData.summary.totalRevenue || 0)],
                    ['Total Orders', reportData.summary.totalOrders || 0],
                    ['Average Order Value', formatCurrency(reportData.summary.averageOrderValue || 0)],
                    ['Top Channel', reportData.summary.topChannel || 'N/A']
                ];
                
                const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
                XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
            }

            // Channels Data Sheet
            const channelsHeaders = ['Channel', 'Revenue', 'Orders', 'Percentage', 'Avg Order Value'];
            const channelsData = [channelsHeaders];
            
            if (Array.isArray(currentData.channels)) {
                currentData.channels.forEach(channel => {
                    channelsData.push([
                        channel.channel || '',
                        formatCurrency(channel.revenue || 0),
                        channel.orders || 0,
                        channel.percentage || 0,
                        formatCurrency(channel.averageOrderValue || 0)
                    ]);
                });
            }
            
            const channelsSheet = XLSX.utils.aoa_to_sheet(channelsData);
            XLSX.utils.book_append_sheet(workbook, channelsSheet, 'Channels');

            // Payment Methods Data Sheet
            const paymentsHeaders = ['Payment Method', 'Revenue', 'Orders', 'Percentage', 'Avg Order Value'];
            const paymentsData = [paymentsHeaders];
            
            if (Array.isArray(currentData.paymentMethods)) {
                currentData.paymentMethods.forEach(method => {
                    paymentsData.push([
                        method.paymentMethod || '',
                        formatCurrency(method.revenue || 0),
                        method.orders || 0,
                        method.percentage || 0,
                        formatCurrency(method.averageOrderValue || 0)
                    ]);
                });
            }
            
            const paymentsSheet = XLSX.utils.aoa_to_sheet(paymentsData);
            XLSX.utils.book_append_sheet(workbook, paymentsSheet, 'Payment Methods');
            
            // Generate and download Excel file
            const fileName = `category-wise-sales-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            
            showToast('Excel file downloaded successfully', 'success');
        } catch (error) {
            console.error('Error in generateExcelFile:', error);
            showToast('Failed to generate Excel file', 'error');
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                {/* Header - Updated to match SalesTrendsModal */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-blue-100 rounded-xl shadow-sm">
                                <i className="ph ph-chart-pie text-blue-600 text-2xl"></i>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Category-wise Sales Report</h2>
                                <p className="text-sm text-blue-600 mt-1">Sales breakdown by channels and payment methods</p>
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
                                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center space-x-2 transition-colors duration-200 shadow-sm"
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

                {/* Controls - Updated to match SalesTrendsModal */}
                <div className="p-5 bg-gray-50 border-b border-gray-200">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">View:</label>
                            <div className="flex rounded-lg shadow-sm overflow-hidden">
                                {viewOptions.map((view) => (
                                    <button
                                        key={view.id}
                                        onClick={() => setSelectedView(view.id)}
                                        className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                            selectedView === view.id
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } ${view.id === 'aggregated' ? 'rounded-l-lg' : ''} ${
                                            view.id === 'custom' ? 'rounded-r-lg' : ''
                                        }`}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {selectedView === 'yearly' && reportData?.financialYears && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Financial Year:</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {reportData.financialYears.map(fy => (
                                        <option key={fy} value={fy}>
                                            {FinancialYearUtils.getFinancialYearLabel(fy)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {selectedView === 'days' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Period:</label>
                                <select
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {dateFilters.map((filter) => (
                                        <option key={filter.id} value={filter.id}>
                                            {filter.label}
                                        </option>
                                    ))}
                                    <option value="custom">Custom Period</option>
                                </select>
                            </div>
                        )}
                        
                        {/* Custom date range controls - Added to match SalesTrendsModal */}
                        {(selectedView === 'days' && dateFilter === 'custom') || selectedView === 'custom' ? (
                            <div className="flex flex-col sm:flex-row gap-4 items-end">
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-700 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                    />
                                </div>
                                <div className="flex items-center h-full pb-1">
                                    <button
                                        onClick={handleApplyCustomRange}
                                        disabled={!customStartDate || !customEndDate}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm ${
                                            !customStartDate || !customEndDate
                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        
                        <div className="ml-auto">
                            <button
                                onClick={fetchCategoryWiseData}
                                disabled={isLoading}
                                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm disabled:opacity-50 flex items-center space-x-1 transition-colors duration-200 shadow-sm"
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
                                <i className="ph ph-spinner text-blue-500 text-3xl animate-spin"></i>
                                <span className="text-gray-600 text-lg">Loading category-wise sales data...</span>
                            </div>
                        </div>
                    ) : reportData ? (
                        <div className="p-6">
                            {/* Summary Cards - Updated to match SalesTrendsModal */}
                            {selectedView === 'aggregated' && reportData.summary && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-medium text-green-800">Total Revenue</h3>
                                            <i className="ph ph-currency-circle-dollar text-green-500 text-2xl"></i>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900 mt-3">
                                            {formatCurrency(reportData.summary.totalRevenue || 0)}
                                        </p>
                                        <div className="mt-2 text-xs text-green-600">
                                            Overall sales volume
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-medium text-blue-800">Total Orders</h3>
                                            <i className="ph ph-shopping-cart text-blue-500 text-2xl"></i>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900 mt-3">
                                            {(reportData.summary.totalOrders || 0).toLocaleString('en-IN')}
                                        </p>
                                        <div className="mt-2 text-xs text-blue-600">
                                            Number of transactions
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-medium text-purple-800">Avg Order Value</h3>
                                            <i className="ph ph-chart-line text-purple-500 text-2xl"></i>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900 mt-3">
                                            {formatCurrency(reportData.summary.averageOrderValue || 0)}
                                        </p>
                                        <div className="mt-2 text-xs text-purple-600">
                                            Revenue per transaction
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-medium text-orange-800">Top Channel</h3>
                                            <i className="ph ph-trophy text-orange-500 text-2xl"></i>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900 mt-3">
                                            {reportData.summary.topChannel || 'N/A'}
                                        </p>
                                        <div className="mt-2 text-xs text-orange-600">
                                            Highest revenue source
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tab Selection - Updated to match SalesTrendsModal */}
                            <div className="flex border-b border-gray-200 mb-6">
                                <button
                                    onClick={() => setActiveTab('channels')}
                                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                                        activeTab === 'channels'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <i className="ph ph-storefront mr-2"></i>
                                    Sales by Channel
                                </button>
                                <button
                                    onClick={() => setActiveTab('payments')}
                                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                                        activeTab === 'payments'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <i className="ph ph-credit-card mr-2"></i>
                                    Sales by Payment Method
                                </button>
                            </div>

                            {/* Data Table - Updated to match SalesTrendsModal */}
                            {(() => {
                                const currentData = selectedView === 'aggregated' 
                                    ? reportData.aggregatedData 
                                    : selectedView === 'yearly' 
                                        ? (reportData.yearlyData ? (reportData.yearlyData[selectedYear] || {}) : {})
                                        : reportData; // For 'days' and 'custom' views, use the data directly
                                
                                // Add proper null checks for currentData
                                const safeCurrentData = currentData || {};
                                
                                const displayData = activeTab === 'channels' 
                                    ? (Array.isArray(safeCurrentData.channels) ? safeCurrentData.channels : 
                                       Array.isArray(safeCurrentData) ? safeCurrentData : [])
                                    : (Array.isArray(safeCurrentData.paymentMethods) ? safeCurrentData.paymentMethods : 
                                       Array.isArray(safeCurrentData) ? safeCurrentData : []);

                                if (displayData.length === 0) {
                                    return (
                                        <div className="text-center py-8">
                                            <div className="inline-flex flex-col items-center space-y-4 text-gray-500">
                                                <i className="ph ph-warning-circle text-5xl"></i>
                                                <div>
                                                    <p className="text-lg font-medium">No data available</p>
                                                    <p className="mt-1">No sales data found for the selected period.</p>
                                                </div>
                                                <button
                                                    onClick={fetchCategoryWiseData}
                                                    className="mt-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors duration-200"
                                                >
                                                    Try Again
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="mb-8">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="text-xl font-semibold text-gray-900">
                                                    {activeTab === 'channels' ? 'Sales by Channel' : 'Sales by Payment Method'}
                                                </h3>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    {selectedView === 'yearly' && selectedYear && `Financial Year: ${FinancialYearUtils.getFinancialYearLabel(selectedYear)}`}
                                                    {(selectedView === 'days' || selectedView === 'custom') && `Period: ${getPeriodDisplayText(dateFilter)}`}
                                                    {selectedView === 'aggregated' && 'Aggregated data across all years'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                                                    {displayData.length} records
                                                </span>
                                            </div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Rank</th>
                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                {activeTab === 'channels' ? 'Channel' : 'Payment Method'}
                                                            </th>
                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Revenue</th>
                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Orders</th>
                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Percentage</th>
                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg Order Value</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                        {displayData.map((item, index) => {
                                                            const itemKey = activeTab === 'channels' ? 'channel' : 'paymentMethod';
                                                            const icon = activeTab === 'channels' 
                                                                ? getChannelIcon(item[itemKey])
                                                                : getPaymentIcon(item[itemKey]);
                                                            const colorClass = activeTab === 'channels'
                                                                ? getChannelColor(item[itemKey])
                                                                : getPaymentColor(item[itemKey]);
                                                            
                                                            return (
                                                                <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                                                                            <span className="text-sm font-bold text-blue-600">{index + 1}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center space-x-3">
                                                                            <div className={`p-2 rounded-lg ${colorClass}`}>
                                                                                <i className={`${icon} text-sm`}></i>
                                                                            </div>
                                                                            <span className="text-sm font-medium text-gray-900">
                                                                                {item[itemKey] || ''}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                                        {formatCurrency(item.revenue || 0)}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                        {(item.orders || 0).toLocaleString('en-IN')}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center space-x-2">
                                                                            <span className="text-sm font-medium text-gray-900">
                                                                                {formatPercentage(item.percentage || 0)}
                                                                            </span>
                                                                            <div className="w-16 bg-gray-200 rounded-full h-2">
                                                                                <div 
                                                                                    className="bg-blue-500 h-2 rounded-full" 
                                                                                    style={{ width: `${Math.min(item.percentage || 0, 100)}%` }}
                                                                                ></div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                        {formatCurrency(item.averageOrderValue || 0)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        {/* Total Row */}
                                                        {displayData.length > 0 && (
                                                            <tr className="bg-gray-50 font-semibold">
                                                                <td className="px-6 py-4 whitespace-nowrap" colSpan="2">
                                                                    <div className="flex items-center space-x-3">
                                                                        <div className="p-2 rounded-lg bg-gray-200">
                                                                            <i className="ph ph-calculator text-sm"></i>
                                                                        </div>
                                                                        <span className="text-sm text-gray-900">Total</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {formatCurrency(displayData.reduce((sum, item) => sum + (item.revenue || 0), 0))}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {displayData.reduce((sum, item) => sum + (item.orders || 0), 0).toLocaleString('en-IN')}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {formatPercentage(100)}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {formatCurrency(displayData.reduce((sum, item) => sum + (item.revenue || 0), 0) / 
                                                                        displayData.reduce((sum, item) => sum + (item.orders || 0), 0) || 0)}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>

                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-4 text-gray-500">
                                <i className="ph ph-warning-circle text-5xl"></i>
                                <div>
                                    <p className="text-lg font-medium">Failed to load data</p>
                                    <p className="mt-1">An error occurred while loading the report data.</p>
                                </div>
                                <button
                                    onClick={fetchCategoryWiseData}
                                    className="mt-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors duration-200"
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