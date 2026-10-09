import React, { useState, useEffect } from 'react';
import { CurrencyData } from '../utils/CurrencyData';
import { PassbookCalculator } from '../utils/PassbookCalculator';
import { useProfile } from '../contexts/ProfileContext.js';

const PaymentMethodsModal = ({ isOpen, onClose, data, dateRange, onExport, sdk }) => {
    const { profile } = useProfile();
    const [activeTab, setActiveTab] = useState('days'); // yearly, monthly, days, custom
    const [selectedYear, setSelectedYear] = useState('2024-2025');
    const [selectedMonth, setSelectedMonth] = useState('jan');
    const [selectedDays, setSelectedDays] = useState('last7');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [paymentData, setPaymentData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);

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

    // Days options - Updated to match SalesTrendsModal
    const daysOptions = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'last7', label: 'Last 7 Days' },
        { id: 'last30', label: 'Last 30 Days' },
        { id: 'last90', label: 'Last 90 Days' }
    ];

    // View options - Updated to match SalesTrendsModal
    const viewOptions = [
        { id: 'days', label: 'By Days' },
        { id: 'monthly', label: 'By Month' },
        { id: 'yearly', label: 'By Financial Year' },
        { id: 'custom', label: 'Custom' }
    ];

    // Fetch payment data based on selected filter
    const fetchPaymentData = async () => {
        if (!sdk) return;
        
        setLoading(true);
        try {
            // Fetch passbook data
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            let dateFilter = 'last7';
            let customDateRange = undefined;
            
            // Determine date filter based on active tab
            if (activeTab === 'yearly') {
                // For financial year, we need to calculate the date range
                const [startYear, endYear] = selectedYear.split('-').map(Number);
                const startDate = new Date(startYear, 3, 1); // April 1st of start year
                const endDate = new Date(endYear, 2, 31, 23, 59, 59, 999); // March 31st of end year
                dateFilter = 'custom';
                customDateRange = { start: startDate, end: endDate };
            } else if (activeTab === 'monthly') {
                // For monthly, we need to calculate the date range for the selected month
                const monthIndex = months.findIndex(m => m.id === selectedMonth);
                const currentYear = new Date().getFullYear();
                const startDate = new Date(currentYear, monthIndex, 1);
                const endDate = new Date(currentYear, monthIndex + 1, 0, 23, 59, 59, 999);
                dateFilter = 'custom';
                customDateRange = { start: startDate, end: endDate };
            } else if (activeTab === 'days') {
                dateFilter = selectedDays;
            } else if (activeTab === 'custom' && customStartDate && customEndDate) {
                // For custom date range
                const startDate = new Date(customStartDate);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(customEndDate);
                endDate.setHours(23, 59, 59, 999);
                dateFilter = 'custom';
                customDateRange = { start: startDate, end: endDate };
            }
            
            // Filter transactions
            const filters = {
                dateFilter,
                customDateRange,
                activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'],
                customers: passbookData.customers
            };
            
            const filteredTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                filters
            );
            
            // Calculate payment method distribution
            const paymentDistribution = {
                cash: 0,
                upi: 0,
                credit: 0,
                card: 0, // Some systems might separate card from upi
                mixed: 0 // For split bills with multiple payment methods
            };
            
            const salesTransactions = filteredTransactions.filter(t => t.type === 'credit');
            
            salesTransactions.forEach(transaction => {
                if (transaction.paymentMethod === 'cash') {
                    paymentDistribution.cash += transaction.amount || 0;
                } else if (transaction.paymentMethod === 'upi') {
                    paymentDistribution.upi += transaction.amount || 0;
                } else if (transaction.paymentMethod === 'credit') {
                    paymentDistribution.credit += transaction.amount || 0;
                } else if (transaction.paymentMethod === 'card') {
                    paymentDistribution.card += transaction.amount || 0;
                } else if (transaction.paymentMethod === 'mixed') {
                    // For mixed payments, we'll count them as a separate category
                    paymentDistribution.mixed += transaction.amount || 0;
                }
            });
            
            setPaymentData(paymentDistribution);
        } catch (error) {
            console.error('Error fetching payment data:', error);
        } finally {
            setLoading(false);
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
            setLoading(prev => prev); // This will trigger a re-render
        };

        window.addEventListener('currencyChanged', handleCurrencyChange);
        
        return () => {
            window.removeEventListener('currencyChanged', handleCurrencyChange);
        };
    }, []);

    // Export to Excel function for payment methods data
    const exportToExcel = async () => {
        setIsGeneratingExcel(true);
        try {
            // Load SheetJS library if not already loaded
            if (!window.XLSX) {
                // Create script tag to load XLSX library
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
                script.onload = () => {
                    generatePaymentMethodsExcel();
                    setIsGeneratingExcel(false);
                };
                script.onerror = () => {
                    console.error('Failed to load Excel library');
                    setIsGeneratingExcel(false);
                };
                document.head.appendChild(script);
                return;
            }
            
            generatePaymentMethodsExcel();
            setIsGeneratingExcel(false);
        } catch (error) {
            console.error('Error in exportToExcel:', error);
            setIsGeneratingExcel(false);
        }
    };

    // Generate Excel file for payment methods data
    const generatePaymentMethodsExcel = () => {
        try {
            const XLSX = window.XLSX;
            
            // Create a new workbook
            const workbook = XLSX.utils.book_new();
            
            // Get current filter label for display
            let filterLabel = '';
            if (activeTab === 'yearly') {
                filterLabel = `Financial Year: ${selectedYear}`;
            } else if (activeTab === 'monthly') {
                const month = months.find(m => m.id === selectedMonth);
                filterLabel = `Month: ${month ? month.label : selectedMonth}`;
            } else if (activeTab === 'days') {
                const dayOption = daysOptions.find(d => d.id === selectedDays);
                filterLabel = `Period: ${dayOption ? dayOption.label : selectedDays}`;
            } else if (activeTab === 'custom') {
                filterLabel = `Custom Period: ${customStartDate} to ${customEndDate}`;
            }
            
            const currencyCode = profile?.currencyCode || 'INR';
            
            // 1. Summary Sheet
            const summaryData = [
                ['PAYMENT METHODS REPORT'],
                ['Generated on:', new Date().toLocaleDateString('en-IN')],
                ['Filter:', filterLabel],
                [''], // Empty row
                ['Payment Method', 'Amount', 'Percentage'],
            ];
            
            // Calculate total for percentage calculations
            const total = paymentData ? 
                paymentData.cash + paymentData.upi + paymentData.credit + paymentData.card + (paymentData.mixed || 0) : 0;
            
            // Add payment method data
            if (paymentData?.cash > 0) {
                summaryData.push([
                    'Cash',
                    formatCurrency(paymentData.cash),
                    total > 0 ? ((paymentData.cash / total) * 100).toFixed(2) + '%' : '0%'
                ]);
            }
            
            if (paymentData?.upi > 0) {
                summaryData.push([
                    'UPI',
                    formatCurrency(paymentData.upi),
                    total > 0 ? ((paymentData.upi / total) * 100).toFixed(2) + '%' : '0%'
                ]);
            }
            
            if (paymentData?.card > 0) {
                summaryData.push([
                    'Card',
                    formatCurrency(paymentData.card),
                    total > 0 ? ((paymentData.card / total) * 100).toFixed(2) + '%' : '0%'
                ]);
            }
            
            if (paymentData?.credit > 0) {
                summaryData.push([
                    'Credit',
                    formatCurrency(paymentData.credit),
                    total > 0 ? ((paymentData.credit / total) * 100).toFixed(2) + '%' : '0%'
                ]);
            }
            
            if (paymentData?.mixed > 0) {
                summaryData.push([
                    'Mixed',
                    formatCurrency(paymentData.mixed),
                    total > 0 ? ((paymentData.mixed / total) * 100).toFixed(2) + '%' : '0%'
                ]);
            }
            
            // Add total row
            summaryData.push(['', '', '']);
            summaryData.push(['Total', formatCurrency(total), '100%']);
            
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            summarySheet['!cols'] = [{ width: 20 }, { width: 20 }, { width: 15 }];
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Payment Methods');
            
            // Generate and download Excel file
            const fileName = `payment-methods-report-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            
        } catch (error) {
            console.error('Error in generatePaymentMethodsExcel:', error);
        }
    };

    // Export to PDF function with improved formatting
    const exportToPDF = () => {
        if (!paymentData) return;
        setIsExporting(true);
        
        try {
            const total = paymentData.cash + paymentData.upi + paymentData.credit + paymentData.card + (paymentData.mixed || 0);
            const currencyCode = profile?.currencyCode || 'INR';
            
            const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Payment Methods Report</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 20px; 
                        color: #333; 
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #3b82f6;
                        padding-bottom: 20px;
                    }
                    h1 { 
                        color: #3b82f6; 
                        margin-bottom: 10px;
                    }
                    .subtitle {
                        color: #6b7280;
                        font-size: 14px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        border: 1px solid #e5e7eb;
                        padding: 12px 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #f3f4f6;
                        font-weight: bold;
                        font-size: 12px;
                    }
                    td {
                        font-size: 11px;
                    }
                    .cash { color: #10b981; }
                    .upi { color: #8b5cf6; }
                    .card { color: #f59e0b; }
                    .credit { color: #ef4444; }
                    .mixed { color: #6366f1; }
                    .total-row {
                        font-weight: bold;
                        background-color: #f9fafb;
                    }
                    .footer {
                        margin-top: 40px;
                        text-align: center;
                        color: #6b7280;
                        font-size: 12px;
                    }
                    @media print {
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Payment Methods Report</h1>
                    <p class="subtitle">Generated on ${new Date().toLocaleDateString('en-IN')} | ${getFilterLabel()}</p>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Payment Method</th>
                            <th>Amount</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paymentData?.cash > 0 ? `
                        <tr>
                            <td><span class="cash">Cash</span></td>
                            <td class="text-right">${formatCurrency(paymentData.cash)}</td>
                            <td class="text-right">${total > 0 ? ((paymentData.cash / total) * 100).toFixed(2) : '0.00'}%</td>
                        </tr>` : ''}
                        
                        ${paymentData?.upi > 0 ? `
                        <tr>
                            <td><span class="upi">UPI</span></td>
                            <td class="text-right">${formatCurrency(paymentData.upi)}</td>
                            <td class="text-right">${total > 0 ? ((paymentData.upi / total) * 100).toFixed(2) : '0.00'}%</td>
                        </tr>` : ''}
                        
                        ${paymentData?.card > 0 ? `
                        <tr>
                            <td><span class="card">Card</span></td>
                            <td class="text-right">${formatCurrency(paymentData.card)}</td>
                            <td class="text-right">${total > 0 ? ((paymentData.card / total) * 100).toFixed(2) : '0.00'}%</td>
                        </tr>` : ''}
                        
                        ${paymentData?.credit > 0 ? `
                        <tr>
                            <td><span class="credit">Credit</span></td>
                            <td class="text-right">${formatCurrency(paymentData.credit)}</td>
                            <td class="text-right">${total > 0 ? ((paymentData.credit / total) * 100).toFixed(2) : '0.00'}%</td>
                        </tr>` : ''}
                        
                        ${paymentData?.mixed > 0 ? `
                        <tr>
                            <td><span class="mixed">Mixed</span></td>
                            <td class="text-right">${formatCurrency(paymentData.mixed)}</td>
                            <td class="text-right">${total > 0 ? ((paymentData.mixed / total) * 100).toFixed(2) : '0.00'}%</td>
                        </tr>` : ''}
                        
                        <tr class="total-row">
                            <td><strong>Total</strong></td>
                            <td class="text-right"><strong>${formatCurrency(total)}</strong></td>
                            <td class="text-right"><strong>100.00%</strong></td>
                        </tr>
                    </tbody>
                </table>
                
                <div class="footer">
                    <p>Report generated by Liquid POS</p>
                </div>
            </body>
            </html>
        `;
        
        // Open print window directly without redirecting
        const printWindow = window.open('', 'Payment Methods Report', 'width=800,height=600');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        // Wait for content to load then print
        printWindow.onload = function() {
            printWindow.focus();
            printWindow.print();
            setIsExporting(false);
        };
        } catch (error) {
            console.error('Error in exportToPDF:', error);
            setIsExporting(false);
        }
    };

    // Get filter label for display
    const getFilterLabel = () => {
        if (activeTab === 'yearly') {
            return `Financial Year: ${selectedYear}`;
        } else if (activeTab === 'monthly') {
            const month = months.find(m => m.id === selectedMonth);
            return `Month: ${month ? month.label : selectedMonth}`;
        } else if (activeTab === 'days') {
            const dayOption = daysOptions.find(d => d.id === selectedDays);
            return `Period: ${dayOption ? dayOption.label : selectedDays}`;
        } else if (activeTab === 'custom') {
            return `Custom Period: ${customStartDate} to ${customEndDate}`;
        }
        return 'Period: Last 7 Days';
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
            
            fetchPaymentData();
        }
    };

    // Fetch data when filters change
    useEffect(() => {
        if (isOpen && activeTab !== 'custom') {
            fetchPaymentData();
        }
    }, [activeTab, selectedYear, selectedMonth, selectedDays, isOpen, customStartDate, customEndDate]);

    if (!isOpen) return null;

    // Calculate total for percentage calculations
    const total = paymentData ? 
        paymentData.cash + paymentData.upi + paymentData.credit + paymentData.card : 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            {/* Updated to match SalesTrendsModal styling */}
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                {/* Header - Updated to match SalesTrendsModal */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-blue-100 rounded-xl shadow-sm">
                                <i className="ph ph-credit-card text-blue-600 text-2xl"></i>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Payment Methods Report</h2>
                                <p className="text-sm text-blue-600 mt-1">Breakdown of sales by payment methods</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={exportToExcel}
                                disabled={isGeneratingExcel || loading}
                                className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center space-x-2 transition-colors duration-200 shadow-sm"
                            >
                                <i className={`ph ${isGeneratingExcel ? 'ph-spinner ph-spin' : 'ph-file-xls'}`}></i>
                                <span>{isGeneratingExcel ? 'Generating...' : 'Export Excel'}</span>
                            </button>
                            <button
                                onClick={exportToPDF}
                                disabled={isExporting || loading}
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
                                        onClick={() => setActiveTab(view.id)}
                                        className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                            activeTab === view.id
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } ${view.id === 'days' ? 'rounded-l-lg' : ''} ${
                                            view.id === 'custom' ? 'rounded-r-lg' : ''
                                        }`}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeTab === 'yearly' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Financial Year:</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {financialYears.map(year => (
                                        <option key={year.id} value={year.id}>
                                            {year.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {activeTab === 'monthly' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Month:</label>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {months.map(month => (
                                        <option key={month.id} value={month.id}>
                                            {month.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {activeTab === 'days' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Period:</label>
                                <select
                                    value={selectedDays}
                                    onChange={(e) => setSelectedDays(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {daysOptions.map(option => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {activeTab === 'custom' && (
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
                        )}
                        
                        <div className="ml-auto">
                            <button
                                onClick={fetchPaymentData}
                                disabled={loading}
                                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm disabled:opacity-50 flex items-center space-x-1 transition-colors duration-200 shadow-sm"
                            >
                                <i className={`ph ${loading ? 'ph-spinner ph-spin' : 'ph-arrow-clockwise'}`}></i>
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-220px)]">
                    {loading ? (
                        // Updated loading state to match SalesTrendsModal
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-3">
                                <i className="ph ph-spinner text-blue-500 text-3xl animate-spin"></i>
                                <span className="text-gray-600 text-lg">Loading payment methods data...</span>
                            </div>
                        </div>
                    ) : paymentData ? (
                        <div className="p-6">
                            {/* Summary Cards - Updated to match SalesTrendsModal */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-green-800">Cash</h3>
                                        <i className="ph ph-money text-green-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(paymentData.cash)}
                                    </p>
                                    <div className="mt-2 text-xs text-green-600">
                                        {total > 0 ? ((paymentData.cash / total) * 100).toFixed(1) : '0.0'}% of total
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-blue-800">UPI</h3>
                                        <i className="ph ph-qr-code text-blue-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(paymentData.upi)}
                                    </p>
                                    <div className="mt-2 text-xs text-blue-600">
                                        {total > 0 ? ((paymentData.upi / total) * 100).toFixed(1) : '0.0'}% of total
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-purple-800">Card</h3>
                                        <i className="ph ph-credit-card text-purple-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(paymentData.card)}
                                    </p>
                                    <div className="mt-2 text-xs text-purple-600">
                                        {total > 0 ? ((paymentData.card / total) * 100).toFixed(1) : '0.0'}% of total
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-orange-800">Credit</h3>
                                        <i className="ph ph-wallet text-orange-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(paymentData.credit)}
                                    </p>
                                    <div className="mt-2 text-xs text-orange-600">
                                        {total > 0 ? ((paymentData.credit / total) * 100).toFixed(1) : '0.0'}% of total
                                    </div>
                                </div>
                            </div>

                            {/* Payment Methods Comparison Table - Added to match SalesTrendsModal */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-900">
                                            Payment Methods Breakdown
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Detailed view of payment methods distribution
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                                            4 payment methods
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Payment Method</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Percentage</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {paymentData.cash > 0 && (
                                                    <tr className="hover:bg-gray-50 transition-colors duration-150">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="p-2 bg-green-100 rounded-lg">
                                                                    <i className="ph ph-money text-green-600"></i>
                                                                </div>
                                                                <div className="ml-3">
                                                                    <div className="text-sm font-medium text-gray-900">Cash</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                            {formatCurrency(paymentData.cash)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                {total > 0 ? ((paymentData.cash / total) * 100).toFixed(1) : '0.0'}%
                                                            </div>
                                                            <div className="mt-1 w-32 bg-gray-200 rounded-full h-2">
                                                                <div 
                                                                    className="bg-green-500 h-2 rounded-full" 
                                                                    style={{ width: `${total > 0 ? (paymentData.cash / total) * 100 : 0}%` }}
                                                                ></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                
                                                {paymentData.upi > 0 && (
                                                    <tr className="hover:bg-gray-50 transition-colors duration-150">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="p-2 bg-blue-100 rounded-lg">
                                                                    <i className="ph ph-qr-code text-blue-600"></i>
                                                                </div>
                                                                <div className="ml-3">
                                                                    <div className="text-sm font-medium text-gray-900">UPI</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                            {formatCurrency(paymentData.upi)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                {total > 0 ? ((paymentData.upi / total) * 100).toFixed(1) : '0.0'}%
                                                            </div>
                                                            <div className="mt-1 w-32 bg-gray-200 rounded-full h-2">
                                                                <div 
                                                                    className="bg-blue-500 h-2 rounded-full" 
                                                                    style={{ width: `${total > 0 ? (paymentData.upi / total) * 100 : 0}%` }}
                                                                ></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                
                                                {paymentData.card > 0 && (
                                                    <tr className="hover:bg-gray-50 transition-colors duration-150">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="p-2 bg-purple-100 rounded-lg">
                                                                    <i className="ph ph-credit-card text-purple-600"></i>
                                                                </div>
                                                                <div className="ml-3">
                                                                    <div className="text-sm font-medium text-gray-900">Card</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                            {formatCurrency(paymentData.card)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                {total > 0 ? ((paymentData.card / total) * 100).toFixed(1) : '0.0'}%
                                                            </div>
                                                            <div className="mt-1 w-32 bg-gray-200 rounded-full h-2">
                                                                <div 
                                                                    className="bg-purple-500 h-2 rounded-full" 
                                                                    style={{ width: `${total > 0 ? (paymentData.card / total) * 100 : 0}%` }}
                                                                ></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                
                                                {paymentData.credit > 0 && (
                                                    <tr className="hover:bg-gray-50 transition-colors duration-150">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="p-2 bg-orange-100 rounded-lg">
                                                                    <i className="ph ph-wallet text-orange-600"></i>
                                                                </div>
                                                                <div className="ml-3">
                                                                    <div className="text-sm font-medium text-gray-900">Credit</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                            {formatCurrency(paymentData.credit)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                {total > 0 ? ((paymentData.credit / total) * 100).toFixed(1) : '0.0'}%
                                                            </div>
                                                            <div className="mt-1 w-32 bg-gray-200 rounded-full h-2">
                                                                <div 
                                                                    className="bg-orange-500 h-2 rounded-full" 
                                                                    style={{ width: `${total > 0 ? (paymentData.credit / total) * 100 : 0}%` }}
                                                                ></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                
                                                {/* Total Row */}
                                                <tr className="bg-gray-50 font-semibold">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Total</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {formatCurrency(total)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">100%</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Updated empty state to match SalesTrendsModal
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-4 text-gray-500">
                                <i className="ph ph-warning-circle text-5xl"></i>
                                <div>
                                    <p className="text-lg font-medium">No data available</p>
                                    <p className="mt-1">No payment data found for the selected period.</p>
                                </div>
                                <button
                                    onClick={fetchPaymentData}
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
};

export default PaymentMethodsModal;