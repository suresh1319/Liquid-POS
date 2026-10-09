import { useState, useEffect } from 'react';
import { SalesSummaryService } from '../utils/SalesSummaryService.js';
import { FinancialYearUtils } from '../utils/FinancialYearUtils.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { CurrencyData } from '../utils/CurrencyData.js';

export default function SalesSummaryModal({ isOpen, onClose }) {
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedView, setSelectedView] = useState('current');
    const [selectedYear, setSelectedYear] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [dateFilter, setDateFilter] = useState('last7');
    const [customDateRange, setCustomDateRange] = useState({ start: null, end: null });
    
    const { profile } = useProfile();

    // Date filter options
    const dateFilters = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'last7', label: 'Last 7 Days' },
        { id: 'last30', label: 'Last 30 Days' },
        { id: 'last90', label: 'Last 90 Days' },
        { id: 'custom', label: 'Custom Date' }
    ];

    useEffect(() => {
        if (isOpen) {
            fetchSalesSummaryData();
        }
    }, [isOpen, dateFilter, customDateRange]);

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

    const fetchSalesSummaryData = async () => {
        setIsLoading(true);
        try {
            // For backward compatibility, we'll still fetch the report data
            // But we'll also fetch data based on the selected date filter
            const data = await SalesSummaryService.getSalesSummaryReport();
            
            // Fetch data based on the selected date filter
            const filteredData = await SalesSummaryService.getSalesSummaryByFilter(dateFilter, customDateRange);
            
            setReportData({
                ...data,
                currentYearSummary: filteredData,
                filteredData: filteredData
            });
            
            setSelectedYear(data.currentFinancialYear);
        } catch (error) {
            console.error('Error fetching sales summary data:', error);
            showToast('Failed to load sales summary data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Format currency using profile's currency code
    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

    const formatPercentage = (value) => {
        return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    };

    const formatTime = (hour) => {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:00 ${period}`;
    };

    const getGrowthColor = (value) => {
        if (value > 0) return 'text-green-600';
        if (value < 0) return 'text-red-600';
        return 'text-gray-600';
    };

    const exportToPDF = () => {
        if (!reportData) return;
        setIsExporting(true);
        
        try {
            const currentData = selectedView === 'current' 
                ? reportData.currentYearSummary 
                : reportData.yearlyReports[selectedYear] || {};

            const title = selectedView === 'current' 
                ? `Sales Summary Report - ${FinancialYearUtils.getFinancialYearLabel(reportData.currentFinancialYear)}`
                : `Sales Summary Report - ${FinancialYearUtils.getFinancialYearLabel(selectedYear)}`;

            const printContent = `
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #ef4444; text-align: center; }
                h2 { color: #374151; margin-top: 30px; }
                .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
                .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; }
                .metric-value { font-size: 18px; font-weight: bold; }
                .metric-label { color: #666; font-size: 14px; }
            </style>
            <h1>${title}</h1>
            <p>Generated on ${new Date().toLocaleDateString('en-IN')}</p>
            
            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Revenue</div>
                    <div class="metric-value">${formatCurrency(currentData?.summary?.totalRevenue || 0)}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Orders</div>
                    <div class="metric-value">${(currentData?.summary?.totalOrders || 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Order Value</div>
                    <div class="metric-value">${formatCurrency(currentData?.summary?.avgOrderValue || 0)}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Items Sold</div>
                    <div class="metric-value">${(currentData?.summary?.totalItems || 0).toLocaleString('en-IN')}</div>
                </div>
            </div>
            
            <h2>Key Insights</h2>
            <table>
                <tr><th>Metric</th><th>Value</th></tr>
                <tr><td>Peak Sales Hour</td><td>${formatTime(currentData?.insights?.peakSalesHour || 0)}</td></tr>
                <tr><td>Best Day of Week</td><td>${currentData?.insights?.bestDayOfWeek || 'N/A'}</td></tr>
                <tr><td>Best Month</td><td>${currentData?.insights?.bestMonth || 'N/A'}</td></tr>
                <tr><td>Total Discounts</td><td>${formatCurrency(currentData?.summary?.totalDiscounts || 0)}</td></tr>
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
            
            const currentData = selectedView === 'current' 
                ? reportData.currentYearSummary 
                : reportData.yearlyReports[selectedYear] || {};

            const title = selectedView === 'current' 
                ? `Sales Summary Report - ${FinancialYearUtils.getFinancialYearLabel(reportData.currentFinancialYear)}`
                : `Sales Summary Report - ${FinancialYearUtils.getFinancialYearLabel(selectedYear)}`;

            // Summary Sheet
            const summaryData = [
                ['Sales Summary Report - Summary'],
                ['Generated on:', new Date().toLocaleDateString('en-IN')],
                ['View:', selectedView === 'current' ? `Current Year - ${FinancialYearUtils.getFinancialYearLabel(reportData.currentFinancialYear)}` : `By Financial Year - ${FinancialYearUtils.getFinancialYearLabel(selectedYear)}`],
                [],
                ['Metric', 'Value'],
                ['Total Revenue', formatCurrency(currentData?.summary?.totalRevenue || 0)],
                ['Total Orders', currentData?.summary?.totalOrders || 0],
                ['Average Order Value', formatCurrency(currentData?.summary?.avgOrderValue || 0)],
                ['Total Items Sold', currentData?.summary?.totalItems || 0],
                ['Total Discounts', formatCurrency(currentData?.summary?.totalDiscounts || 0)]
            ];
            
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

            // Key Insights Sheet
            const insightsData = [
                ['Key Insights'],
                [],
                ['Metric', 'Value'],
                ['Peak Sales Hour', formatTime(currentData?.insights?.peakSalesHour || 0)],
                ['Best Day of Week', currentData?.insights?.bestDayOfWeek || 'N/A'],
                ['Best Month', currentData?.insights?.bestMonth || 'N/A']
            ];
            
            const insightsSheet = XLSX.utils.aoa_to_sheet(insightsData);
            XLSX.utils.book_append_sheet(workbook, insightsSheet, 'Key Insights');

            // Payment Methods Sheet (if available)
            if (currentData?.breakdowns?.paymentMethods) {
                const paymentHeaders = ['Payment Method', 'Revenue', 'Orders', 'Percentage'];
                const paymentData = [paymentHeaders];
                
                currentData.breakdowns.paymentMethods.forEach(method => {
                    paymentData.push([
                        method.method,
                        formatCurrency(method.revenue),
                        method.orders,
                        method.percentage
                    ]);
                });
                
                const paymentSheet = XLSX.utils.aoa_to_sheet(paymentData);
                XLSX.utils.book_append_sheet(workbook, paymentSheet, 'Payment Methods');
            }

            // Channels Sheet (if available)
            if (currentData?.breakdowns?.channels) {
                const channelHeaders = ['Channel', 'Revenue', 'Orders', 'Percentage'];
                const channelData = [channelHeaders];
                
                currentData.breakdowns.channels.forEach(channel => {
                    channelData.push([
                        channel.channel,
                        formatCurrency(channel.revenue),
                        channel.orders,
                        channel.percentage
                    ]);
                });
                
                const channelSheet = XLSX.utils.aoa_to_sheet(channelData);
                XLSX.utils.book_append_sheet(workbook, channelSheet, 'Channels');
            }

            // Monthly Breakdown Sheet (if available)
            if (currentData?.breakdowns?.monthly) {
                const monthlyHeaders = ['Month', 'Revenue', 'Orders', 'Items', 'Avg Order Value'];
                const monthlyData = [monthlyHeaders];
                
                currentData.breakdowns.monthly.forEach(month => {
                    const avgOrderValue = month.orders > 0 ? month.revenue / month.orders : 0;
                    monthlyData.push([
                        month.month,
                        formatCurrency(month.revenue),
                        month.orders,
                        month.items,
                        formatCurrency(avgOrderValue)
                    ]);
                });
                
                const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
                XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly Breakdown');
            }

            // Hourly Analysis Sheet (if available)
            if (currentData?.breakdowns?.hourly) {
                const hourlyHeaders = ['Hour', 'Revenue', 'Orders'];
                const hourlyData = [hourlyHeaders];
                
                currentData.breakdowns.hourly.forEach(hour => {
                    hourlyData.push([
                        formatTime(hour.hour),
                        formatCurrency(hour.revenue),
                        hour.orders
                    ]);
                });
                
                const hourlySheet = XLSX.utils.aoa_to_sheet(hourlyData);
                XLSX.utils.book_append_sheet(workbook, hourlySheet, 'Hourly Analysis');
            }

            // Year-over-Year Comparison Sheet (if available and selected)
            if (selectedView === 'comparison' && reportData?.comparisons) {
                const comparisonHeaders = ['Year', 'Vs Year', 'Revenue Growth', 'Orders Growth', 'AOV Growth'];
                const comparisonData = [comparisonHeaders];
                
                Object.keys(reportData.comparisons).forEach(year => {
                    const comparison = reportData.comparisons[year];
                    comparisonData.push([
                        FinancialYearUtils.getFinancialYearLabel(year),
                        FinancialYearUtils.getFinancialYearLabel(comparison.vs),
                        comparison.revenueGrowth,
                        comparison.ordersGrowth,
                        comparison.avgOrderValueGrowth
                    ]);
                });
                
                const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonData);
                XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'Year-over-Year Comparison');
            }
            
            // Generate and download Excel file
            const fileName = `sales-summary-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            
            showToast('Excel file downloaded successfully', 'success');
        } catch (error) {
            console.error('Error in generateExcelFile:', error);
            showToast('Failed to generate Excel file', 'error');
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    // Get display text for the selected date filter
    const getPeriodDisplayText = (filter) => {
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
                if (customDateRange.start && customDateRange.end) {
                    return `${customDateRange.start.toLocaleDateString()} - ${customDateRange.end.toLocaleDateString()}`;
                }
                return 'Custom Period';
            default:
                return 'Selected Period';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <i className="ph ph-chart-bar text-green-600 text-xl"></i>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Sales Summary Report</h2>
                                <p className="text-sm text-green-600">Overall revenue picture and business insights</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={exportToPDF}
                                disabled={isExporting || isLoading}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm flex items-center space-x-2"
                            >
                                <i className="ph ph-file-pdf"></i>
                                <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
                            </button>
                            <button
                                onClick={exportToExcel}
                                disabled={isGeneratingExcel || isLoading}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center space-x-2"
                            >
                                <i className={`ph ${isGeneratingExcel ? 'ph-spinner ph-spin' : 'ph-file-xls'}`}></i>
                                <span>{isGeneratingExcel ? 'Generating...' : 'Export Excel'}</span>
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                            >
                                <i className="ph ph-x text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
                    {isLoading ? (
                        <div className="p-8 text-center">
                            <div className="inline-flex items-center space-x-2">
                                <i className="ph ph-spinner text-green-500 text-2xl animate-spin"></i>
                                <span className="text-gray-600">Loading sales summary data...</span>
                            </div>
                        </div>
                    ) : reportData ? (
                        <div className="p-6">
                            {/* Date Filter Tabs */}
                            <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-gray-50 rounded-lg">
                                {dateFilters.map(filter => (
                                    <button
                                        key={filter.id}
                                        className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap ${
                                            dateFilter === filter.id
                                                ? 'bg-green-500 text-white'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        }`}
                                        onClick={() => {
                                            setDateFilter(filter.id);
                                            // For non-custom filters, we don't need to manually call fetchSalesSummaryData
                                            // because the useEffect will trigger when dateFilter changes
                                            if (filter.id !== 'custom') {
                                                // For non-custom filters, the useEffect will handle data fetching
                                            }
                                        }}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Date Range Picker */}
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
                                                setCustomDateRange(prev => ({
                                                    ...prev,
                                                    start: startDate
                                                }));
                                            }}
                                            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
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
                                                    // Set end time to the end of the day (23:59:59.999)
                                                    endDate.setHours(23, 59, 59, 999);
                                                }
                                                setCustomDateRange(prev => ({
                                                    ...prev,
                                                    end: endDate
                                                }));
                                            }}
                                            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => {
                                            // When start and end dates are the same, we should preserve them as is
                                            // Only adjust time boundaries if needed
                                            if (customDateRange.start && customDateRange.end) {
                                                let startDate = new Date(customDateRange.start);
                                                let endDate = new Date(customDateRange.end);
                                                
                                                // Set start time to the beginning of the day
                                                startDate.setHours(0, 0, 0, 0);
                                                
                                                // Set end time to the end of the day
                                                endDate.setHours(23, 59, 59, 999);
                                                
                                                // Update the state with adjusted dates and fetch data
                                                setCustomDateRange({ start: startDate, end: endDate });
                                                // The useEffect will trigger fetchSalesSummaryData when customDateRange changes
                                            }
                                        }}
                                        disabled={!customDateRange.start || !customDateRange.end}
                                        className="px-4 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm disabled:opacity-50"
                                    >
                                        Apply
                                    </button>
                                </div>
                            )}

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-blue-600">Total Revenue</p>
                                            <p className="text-2xl font-bold text-blue-900">
                                                {formatCurrency(reportData.filteredData?.summary?.totalRevenue || 0)}
                                            </p>
                                        </div>
                                        <i className="ph ph-currency-circle-dollar text-blue-500 text-2xl"></i>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{getPeriodDisplayText(dateFilter)}</p>
                                </div>

                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-green-600">Total Orders</p>
                                            <p className="text-2xl font-bold text-green-900">
                                                {(reportData.filteredData?.summary?.totalOrders || 0).toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                        <i className="ph ph-shopping-cart text-green-500 text-2xl"></i>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{getPeriodDisplayText(dateFilter)}</p>
                                </div>

                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-purple-600">Avg Order Value</p>
                                            <p className="text-2xl font-bold text-purple-900">
                                                {formatCurrency(reportData.filteredData?.summary?.avgOrderValue || 0)}
                                            </p>
                                        </div>
                                        <i className="ph ph-chart-line text-purple-500 text-2xl"></i>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{getPeriodDisplayText(dateFilter)}</p>
                                </div>

                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-orange-600">Items Sold</p>
                                            <p className="text-2xl font-bold text-orange-900">
                                                {(reportData.filteredData?.summary?.totalItems || 0).toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                        <i className="ph ph-package text-orange-500 text-2xl"></i>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{getPeriodDisplayText(dateFilter)}</p>
                                </div>
                            </div>

                            {/* Insights Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-white border rounded-lg p-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 bg-yellow-100 rounded-lg">
                                            <i className="ph ph-clock text-yellow-600"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Peak Sales Hour</p>
                                            <p className="font-bold text-lg">
                                                {formatTime(reportData.filteredData?.insights?.peakSalesHour || 0)}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatCurrency(reportData.filteredData?.insights?.peakSalesHourRevenue || 0)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white border rounded-lg p-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 bg-indigo-100 rounded-lg">
                                            <i className="ph ph-calendar text-indigo-600"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Best Day</p>
                                            <p className="font-bold text-lg">
                                                {reportData.filteredData?.insights?.bestDayOfWeek || 'N/A'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatCurrency(reportData.filteredData?.insights?.bestDayRevenue || 0)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white border rounded-lg p-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 bg-pink-100 rounded-lg">
                                            <i className="ph ph-star text-pink-600"></i>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Best Month</p>
                                            <p className="font-bold text-lg">
                                                {reportData.filteredData?.insights?.bestMonth || 'N/A'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatCurrency(reportData.filteredData?.insights?.bestMonthRevenue || 0)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tab Navigation */}
                            <div className="flex border-b border-gray-200 mb-6">
                                <button
                                    onClick={() => setActiveTab('overview')}
                                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                                        activeTab === 'overview'
                                            ? 'border-green-500 text-green-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <i className="ph ph-chart-bar mr-2"></i>
                                    Overview
                                </button>
                                <button
                                    onClick={() => setActiveTab('monthly')}
                                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                                        activeTab === 'monthly'
                                            ? 'border-green-500 text-green-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <i className="ph ph-calendar mr-2"></i>
                                    Monthly Breakdown
                                </button>
                                <button
                                    onClick={() => setActiveTab('hourly')}
                                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                                        activeTab === 'hourly'
                                            ? 'border-green-500 text-green-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <i className="ph ph-clock mr-2"></i>
                                    Hourly Analysis
                                </button>
                            </div>

                            {/* Tab Content */}
                            {activeTab === 'overview' && (
                                <div className="space-y-6">
                                    {/* Payment Methods & Channels */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <div className="bg-white border rounded-lg p-4">
                                            <h4 className="font-semibold text-gray-800 mb-4">Revenue by Payment Method</h4>
                                            <div className="space-y-3">
                                                {(reportData.filteredData?.breakdowns?.paymentMethods || []).map((method, index) => (
                                                    <div key={index} className="flex items-center justify-between">
                                                        <div className="flex items-center space-x-3">
                                                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                            <span className="text-sm font-medium">{method.method}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-bold">{formatCurrency(method.revenue)}</p>
                                                            <p className="text-xs text-gray-500">{formatPercentage(method.percentage)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-white border rounded-lg p-4">
                                            <h4 className="font-semibold text-gray-800 mb-4">Revenue by Channel</h4>
                                            <div className="space-y-3">
                                                {(reportData.filteredData?.breakdowns?.channels || []).map((channel, index) => (
                                                    <div key={index} className="flex items-center justify-between">
                                                        <div className="flex items-center space-x-3">
                                                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                                            <span className="text-sm font-medium">{channel.channel}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-bold">{formatCurrency(channel.revenue)}</p>
                                                            <p className="text-xs text-gray-500">{formatPercentage(channel.percentage)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'monthly' && (
                                <div className="bg-white border rounded-lg overflow-hidden">
                                    <div className="px-6 py-4 border-b bg-gray-50">
                                        <h4 className="font-semibold text-gray-800">Monthly Performance</h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orders</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Order</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {(reportData.filteredData?.breakdowns?.monthly || []).map((month, index) => (
                                                    <tr key={index} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{month.month}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-900">{formatCurrency(month.revenue)}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-900">{month.orders.toLocaleString('en-IN')}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-900">{month.items.toLocaleString('en-IN')}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-900">
                                                            {month.orders > 0 ? formatCurrency(month.revenue / month.orders) : formatCurrency(0)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'hourly' && (
                                <div className="bg-white border rounded-lg overflow-hidden">
                                    <div className="px-6 py-4 border-b bg-gray-50">
                                        <h4 className="font-semibold text-gray-800">Hourly Sales Pattern</h4>
                                    </div>
                                    <div className="p-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {(reportData.filteredData?.breakdowns?.hourly || []).map((hour, index) => (
                                                <div key={index} className="bg-gray-50 rounded-lg p-3 text-center">
                                                    <p className="text-xs text-gray-600">{formatTime(hour.hour)}</p>
                                                    <p className="text-sm font-bold text-gray-900">{formatCurrency(hour.revenue)}</p>
                                                    <p className="text-xs text-gray-500">{hour.orders} orders</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-8 text-center">
                            <div className="text-gray-500">
                                <i className="ph ph-warning-circle text-4xl mb-2"></i>
                                <p>Failed to load data. Please try again.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}