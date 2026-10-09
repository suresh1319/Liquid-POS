import { useState, useEffect } from 'react';
import { BestSellingProductsService } from '../utils/BestSellingProductsService.js';
import { FinancialYearUtils } from '../utils/FinancialYearUtils.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { CurrencyData } from '../utils/CurrencyData.js';

export default function BestSellingProductsModal({ isOpen, onClose }) {
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedView, setSelectedView] = useState('yearly'); // 'aggregated', 'yearly', 'days', or 'custom'
    const [selectedYear, setSelectedYear] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [dateFilter, setDateFilter] = useState('last7');
    const [customStartDate, setCustomStartDate] = useState(''); // Changed to match SalesTrendsModal format
    const [customEndDate, setCustomEndDate] = useState(''); // Changed to match SalesTrendsModal format
    
    const { profile } = useProfile();

    // View options - Updated to match SalesTrendsModal
    const viewOptions = [
        { id: 'yearly', label: 'By Financial Year' },
        { id: 'days', label: 'By Days' },
        { id: 'custom', label: 'Custom' } // Added custom option
    ];

    // Date filter options for "By days" view - Removed custom option
    const dateFilters = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'last7', label: 'Last 7 Days' },
        { id: 'last30', label: 'Last 30 Days' },
        { id: 'last90', label: 'Last 90 Days' }
        // Removed custom option from days filter
    ];

    // Fetch data when modal opens or when view/filter changes
    useEffect(() => {
        if (isOpen && selectedView !== 'custom') {
            fetchBestSellingData();
        }
    }, [isOpen, selectedView, dateFilter, selectedYear]);

    const fetchBestSellingData = async () => {
        setIsLoading(true);
        try {
            let data;
            
            // Fetch data based on the selected view
            if (selectedView === 'days') {
                // Fetch data based on the selected date filter
                data = await BestSellingProductsService.fetchBestSellingProductsByFilter(dateFilter);
            } else if (selectedView === 'custom') {
                // For custom view, use custom date range
                if (customStartDate && customEndDate) {
                    const customRange = {
                        start: new Date(customStartDate),
                        end: new Date(customEndDate)
                    };
                    data = await BestSellingProductsService.fetchBestSellingProductsByFilter('custom', customRange);
                }
            } else {
                // For yearly view, use the existing method
                data = await BestSellingProductsService.getBestSellingProductsReport(10);
            }
            
            setReportData(data);
            if (data.currentFinancialYear) {
                setSelectedYear(data.currentFinancialYear);
            }
        } catch (error) {
            console.error('Error fetching best selling products data:', error);
            showToast('Failed to load best selling products data', 'error');
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
            
            // Update the state with adjusted dates
            setCustomStartDate(startDate.toISOString().split('T')[0]);
            setCustomEndDate(endDate.toISOString().split('T')[0]);
            
            fetchBestSellingData();
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
            default:
                return 'Selected Period';
        }
    };

    // Export report as PDF
    const exportToPDF = () => {
        if (!reportData) return;
        
        setIsExporting(true);
        
        try {
            let currentData;
            let title;
            
            if (selectedView === 'aggregated') {
                currentData = reportData.aggregatedData;
                title = `Best Selling Products - All Years (${reportData.financialYears ? reportData.financialYears.join(', ') : ''})`;
            } else if (selectedView === 'yearly') {
                currentData = reportData.yearlyData ? (reportData.yearlyData[selectedYear] || []) : [];
                title = `Best Selling Products - ${selectedYear ? FinancialYearUtils.getFinancialYearLabel(selectedYear) : ''}`;
            } else if (selectedView === 'custom') {
                // For 'custom' view, use the data directly
                currentData = Array.isArray(reportData) ? reportData : (reportData.aggregatedData || []);
                title = `Best Selling Products - Custom Period (${customStartDate} to ${customEndDate})`;
            } else {
                // For 'days' view, use the aggregatedData directly
                currentData = Array.isArray(reportData) ? reportData : (reportData.aggregatedData || []);
                title = `Best Selling Products - ${getPeriodDisplayText(dateFilter)}`;
            }

            const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${title}</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 20px; 
                        color: #333; 
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #ef4444;
                        padding-bottom: 20px;
                    }
                    h1 { 
                        color: #ef4444; 
                        margin-bottom: 10px;
                    }
                    .subtitle {
                        color: #6b7280;
                        font-size: 14px;
                    }
                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin: 20px 0;
                    }
                    .summary-card {
                        border: 1px solid #e5e7eb;
                        padding: 15px;
                        border-radius: 8px;
                        text-align: center;
                    }
                    .metric-value {
                        font-size: 20px;
                        font-weight: bold;
                        color: #111827;
                        margin-bottom: 5px;
                    }
                    .metric-label {
                        color: #6b7280;
                        font-size: 12px;
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
                    .rank {
                        text-align: center;
                        font-weight: bold;
                        color: #ef4444;
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
                    <h1>${title}</h1>
                    <p class="subtitle">Generated on ${new Date().toLocaleDateString('en-IN')}</p>
                    ${selectedView === 'days' || selectedView === 'custom' ? `<p class="subtitle">${getPeriodDisplayText(dateFilter)}</p>` : ''}
                </div>

                ${selectedView === 'aggregated' && reportData.summary ? `
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="metric-value">${reportData.summary.totalUniqueProducts || 0}</div>
                        <div class="metric-label">Total Products</div>
                    </div>
                    <div class="summary-card">
                        <div class="metric-value">${(reportData.summary.totalQuantitySold || 0).toLocaleString('en-IN')}</div>
                        <div class="metric-label">Total Quantity Sold</div>
                    </div>
                    <div class="summary-card">
                        <div class="metric-value">${formatCurrency(reportData.summary.totalRevenue || 0)}</div>
                        <div class="metric-label">Total Revenue</div>
                    </div>
                    <div class="summary-card">
                        <div class="metric-value">${formatCurrency(reportData.summary.averageRevenuePerProduct || 0)}</div>
                        <div class="metric-label">Avg Revenue/Product</div>
                    </div>
                </div>
                ` : ''}

                <h2>Top 10 Best Selling Products</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Product Name</th>
                            <th>Category</th>
                            <th>Quantity Sold</th>
                            <th>Revenue</th>
                            <th>Avg Price</th>
                            <th>Orders</th>
                            ${selectedView === 'aggregated' ? '<th>Top Year</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.isArray(currentData) ? currentData.map((product, index) => {
                            const topYear = selectedView === 'aggregated' && product.yearlyMetrics ? 
                                product.yearlyMetrics.reduce((max, year) => year.quantity > max.quantity ? year : max, product.yearlyMetrics[0]) : null;
                            
                            return `
                            <tr>
                                <td class="rank">${index + 1}</td>
                                <td>${product.name || ''}</td>
                                <td>${product.category || 'N/A'}</td>
                                <td>${(product.totalQuantity || 0).toLocaleString('en-IN')}</td>
                                <td>${formatCurrency(product.totalRevenue || 0)}</td>
                                <td>${formatCurrency(product.averagePrice || 0)}</td>
                                <td>${(product.orderCount || 0).toLocaleString('en-IN')}</td>
                                ${selectedView === 'aggregated' ? `<td>${topYear ? `${FinancialYearUtils.getFinancialYearLabel(topYear.financialYear)} (${topYear.quantity})` : 'N/A'}</td>` : ''}
                            </tr>`;
                        }).join('') : ''}
                        
                        <!-- Total Row -->
                        ${Array.isArray(currentData) && currentData.length > 0 ? `
                        <tr class="total-row">
                            <td colspan="3"><strong>Total</strong></td>
                            <td><strong>${currentData.reduce((sum, product) => sum + (product.totalQuantity || 0), 0).toLocaleString('en-IN')}</strong></td>
                            <td><strong>${formatCurrency(currentData.reduce((sum, product) => sum + (product.totalRevenue || 0), 0))}</strong></td>
                            <td><strong>${formatCurrency((currentData.reduce((sum, product) => sum + (product.totalRevenue || 0), 0) / 
                                currentData.reduce((sum, product) => sum + (product.totalQuantity || 0), 0)) || 0)}</strong></td>
                            <td><strong>${currentData.reduce((sum, product) => sum + (product.orderCount || 0), 0).toLocaleString('en-IN')}</strong></td>
                            ${selectedView === 'aggregated' ? '<td></td>' : ''}
                        </tr>` : ''}
                    </tbody>
                </table>

                <div class="footer">
                    <p>Generated by Liquid POS - Best Selling Products Report</p>
                </div>
            </body>
            </html>
            `;

            // Create hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            iframe.onload = () => {
                iframe.contentWindow.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 500);
            };

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
            
            let currentData;
            let title;
            
            if (selectedView === 'aggregated') {
                currentData = reportData.aggregatedData;
                title = `Best Selling Products - All Years`;
            } else if (selectedView === 'yearly') {
                currentData = reportData.yearlyData ? (reportData.yearlyData[selectedYear] || []) : [];
                title = `Best Selling Products - ${selectedYear ? FinancialYearUtils.getFinancialYearLabel(selectedYear) : ''}`;
            } else if (selectedView === 'custom') {
                // For 'custom' view, use the data directly
                currentData = Array.isArray(reportData) ? reportData : (reportData.aggregatedData || []);
                title = `Best Selling Products - Custom Period (${customStartDate} to ${customEndDate})`;
            } else {
                // For 'days' view, use the aggregatedData directly
                currentData = Array.isArray(reportData) ? reportData : (reportData.aggregatedData || []);
                title = `Best Selling Products - ${getPeriodDisplayText(dateFilter)}`;
            }

            // Summary Sheet (for aggregated view)
            if (selectedView === 'aggregated' && reportData.summary) {
                const summaryData = [
                    ['Best Selling Products Report - Summary'],
                    ['Generated on:', new Date().toLocaleDateString('en-IN')],
                    ...(selectedView === 'days' || selectedView === 'custom' ? [['Period:', getPeriodDisplayText(dateFilter)]] : []),
                    ['View:', selectedView === 'aggregated' ? 'Aggregated (All Years)' : selectedView === 'yearly' ? `By Financial Year - ${selectedYear ? FinancialYearUtils.getFinancialYearLabel(selectedYear) : ''}` : selectedView === 'custom' ? `Custom Period - ${customStartDate} to ${customEndDate}` : `By Days - ${getPeriodDisplayText(dateFilter)}`],
                    [],
                    ['Metric', 'Value'],
                    ['Total Products', reportData.summary.totalUniqueProducts || 0],
                    ['Total Quantity Sold', reportData.summary.totalQuantitySold || 0],
                    ['Total Revenue', formatCurrency(reportData.summary.totalRevenue || 0)],
                    ['Avg Revenue/Product', formatCurrency(reportData.summary.averageRevenuePerProduct || 0)]
                ];
                
                const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
                XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
            }

            // Products Sheet
            const productsHeaders = ['Rank', 'Product Name', 'Category', 'Quantity Sold', 'Revenue', 'Avg Price', 'Orders'];
            if (selectedView === 'aggregated') {
                productsHeaders.push('Top Year');
            }
            
            const productsData = [productsHeaders];
            
            if (Array.isArray(currentData)) {
                currentData.forEach((product, index) => {
                    const rowData = [
                        index + 1,
                        product.name || '',
                        product.category || 'N/A',
                        product.totalQuantity || 0,
                        formatCurrency(product.totalRevenue || 0),
                        formatCurrency(product.averagePrice || 0),
                        product.orderCount || 0
                    ];
                    
                    if (selectedView === 'aggregated') {
                        const topYear = product.yearlyMetrics ? 
                            product.yearlyMetrics.reduce((max, year) => year.quantity > max.quantity ? year : max, product.yearlyMetrics[0]) : null;
                        rowData.push(topYear ? `${FinancialYearUtils.getFinancialYearLabel(topYear.financialYear)} (${topYear.quantity})` : 'N/A');
                    }
                    
                    productsData.push(rowData);
                });
                
                // Add Total Row
                if (currentData.length > 0) {
                    const totalQuantity = currentData.reduce((sum, product) => sum + (product.totalQuantity || 0), 0);
                    const totalRevenue = currentData.reduce((sum, product) => sum + (product.totalRevenue || 0), 0);
                    const avgPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;
                    const totalOrders = currentData.reduce((sum, product) => sum + (product.orderCount || 0), 0);
                    
                    const totalRow = [
                        '', // Empty for rank
                        'Total', // Label
                        '', // Empty for category
                        totalQuantity,
                        formatCurrency(totalRevenue),
                        formatCurrency(avgPrice),
                        totalOrders
                    ];
                    
                    // Add empty cell for Top Year if in aggregated view
                    if (selectedView === 'aggregated') {
                        totalRow.push(''); // Empty for Top Year
                    }
                    
                    productsData.push(totalRow);
                }
            }
            
            const productsSheet = XLSX.utils.aoa_to_sheet(productsData);
            
            // Add styling for the Total Row (if it exists)
            if (Array.isArray(currentData) && currentData.length > 0 && productsSheet) {
                // Get the range of the worksheet
                const range = XLSX.utils.decode_range(productsSheet['!ref']);
                
                // Style the header row
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const address = XLSX.utils.encode_cell({ r: 0, c: C });
                    if (!productsSheet[address]) continue;
                    productsSheet[address].s = {
                        font: { bold: true },
                        fill: { fgColor: { rgb: "FFEFEFEF" } }
                    };
                }
                
                // Style the Total Row (last row)
                const totalRow = range.e.r;
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const address = XLSX.utils.encode_cell({ r: totalRow, c: C });
                    if (!productsSheet[address]) continue;
                    productsSheet[address].s = {
                        font: { bold: true },
                        fill: { fgColor: { rgb: "FFF0F0F0" } }
                    };
                }
            }
            
            XLSX.utils.book_append_sheet(workbook, productsSheet, 'Products');

            // Generate and download Excel file
            const fileName = `best-selling-products-${new Date().toISOString().split('T')[0]}.xlsx`;
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
            {/* Updated to match SalesTrendsModal styling */}
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                {/* Header - Updated to match SalesTrendsModal */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-rose-50 rounded-t-xl">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-red-100 rounded-xl shadow-sm">
                                <i className="ph ph-trophy text-red-600 text-2xl"></i>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Best Selling Products</h2>
                                <p className="text-sm text-red-600 mt-1">Products driving the most revenue</p>
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
                                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm flex items-center space-x-2 transition-colors duration-200 shadow-sm"
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
                                                ? 'bg-red-600 text-white'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } ${view.id === 'yearly' ? 'rounded-l-lg' : ''} ${
                                            view.id === 'custom' ? 'rounded-r-lg' : ''
                                        }`}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {selectedView === 'days' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Period:</label>
                                <select
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {dateFilters.map((filter) => (
                                        <option key={filter.id} value={filter.id}>
                                            {filter.label}
                                        </option>
                                    ))}
                                    {/* Removed custom option from days filter */}
                                </select>
                            </div>
                        )}
                        
                        {/* Custom date range controls - Only shown when custom view is selected */}
                        {selectedView === 'custom' && (
                            <div className="flex flex-col sm:flex-row gap-4 items-end">
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-700 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                    />
                                </div>
                                <div className="flex items-center h-full pb-1">
                                    <button
                                        onClick={handleApplyCustomRange}
                                        disabled={!customStartDate || !customEndDate}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm ${
                                            !customStartDate || !customEndDate
                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                : 'bg-red-600 text-white hover:bg-red-700'
                                        }`}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* Financial Year Selector (only shown when "By Financial Year" is selected) */}
                        {selectedView === 'yearly' && reportData?.financialYears && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Financial Year:</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 shadow-sm"
                                >
                                    {reportData.financialYears.map(fy => (
                                        <option key={fy} value={fy}>
                                            {FinancialYearUtils.getFinancialYearLabel(fy)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        <div className="ml-auto">
                            <button
                                onClick={fetchBestSellingData}
                                disabled={isLoading}
                                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm disabled:opacity-50 flex items-center space-x-1 transition-colors duration-200 shadow-sm"
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
                        // Updated loading state to match SalesTrendsModal
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-3">
                                <i className="ph ph-spinner text-red-500 text-3xl animate-spin"></i>
                                <span className="text-gray-600 text-lg">Loading best selling products...</span>
                            </div>
                        </div>
                    ) : reportData ? (
                        <div className="p-6">
                            {/* Products Table - Updated to match SalesTrendsModal */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-900">
                                            Top 10 Best Selling Products
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {selectedView === 'yearly' && selectedYear && `Financial Year: ${FinancialYearUtils.getFinancialYearLabel(selectedYear)}`}
                                            {(selectedView === 'days' || selectedView === 'custom') && `Period: ${selectedView === 'custom' ? `${customStartDate} - ${customEndDate}` : getPeriodDisplayText(dateFilter)}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                                            {Array.isArray(reportData) ? reportData.length : 'N/A'} products
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Rank</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity Sold</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Revenue</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg Price</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Orders</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {(() => {
                                                    let currentData;
                                                    
                                                    if (selectedView === 'yearly') {
                                                        currentData = reportData.yearlyData ? (reportData.yearlyData[selectedYear] || []) : [];
                                                    } else {
                                                        // For 'days' and 'custom' views, use the data directly
                                                        currentData = Array.isArray(reportData) ? reportData : [];
                                                    }
                                                    
                                                    if (!Array.isArray(currentData) || currentData.length === 0) {
                                                        return (
                                                            <tr>
                                                                <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                                                                    <div className="inline-flex flex-col items-center space-y-4 text-gray-500">
                                                                        <i className="ph ph-warning-circle text-5xl"></i>
                                                                        <div>
                                                                            <p className="text-lg font-medium">No data available</p>
                                                                            <p className="mt-1">No sales data found for the selected period.</p>
                                                                        </div>
                                                                        <button
                                                                            onClick={fetchBestSellingData}
                                                                            className="mt-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors duration-200"
                                                                        >
                                                                            Try Again
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    return (
                                                        <>
                                                            {currentData.map((product, index) => {
                                                                return (
                                                                    <tr key={product.id || index} className="hover:bg-gray-50 transition-colors duration-150">
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <div className="flex items-center justify-center w-8 h-8 bg-red-100 rounded-full">
                                                                                <span className="text-sm font-bold text-red-600">{index + 1}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <div className="text-sm font-medium text-gray-900">{product.name || ''}</div>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                                                                                {product.category || 'N/A'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                                            <span className="font-semibold">{(product.totalQuantity || 0).toLocaleString('en-IN')}</span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                            {formatCurrency(product.totalRevenue || 0)}
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                            {formatCurrency(product.averagePrice || 0)}
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                            {(product.orderCount || 0).toLocaleString('en-IN')}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                            {/* Total Row */}
                                                            {currentData.length > 0 && (
                                                                <tr className="bg-gray-50 font-semibold">
                                                                    <td className="px-6 py-4 whitespace-nowrap" colSpan="3">
                                                                        <div className="flex items-center space-x-3">
                                                                            <div className="p-2 rounded-lg bg-gray-200">
                                                                                <i className="ph ph-calculator text-sm"></i>
                                                                            </div>
                                                                            <span className="text-sm text-gray-900">Total</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                        {currentData.reduce((sum, product) => sum + (product.totalQuantity || 0), 0).toLocaleString('en-IN')}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                        {formatCurrency(currentData.reduce((sum, product) => sum + (product.totalRevenue || 0), 0))}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                        {formatCurrency(currentData.reduce((sum, product) => sum + (product.totalRevenue || 0), 0) / 
                                                                            currentData.reduce((sum, product) => sum + (product.totalQuantity || 0), 0) || 0)}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                        {currentData.reduce((sum, product) => sum + (product.orderCount || 0), 0).toLocaleString('en-IN')}
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Updated error state to match SalesTrendsModal
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-4 text-gray-500">
                                <i className="ph ph-warning-circle text-5xl"></i>
                                <div>
                                    <p className="text-lg font-medium">Failed to load data</p>
                                    <p className="mt-1">An error occurred while loading the report data.</p>
                                </div>
                                <button
                                    onClick={fetchBestSellingData}
                                    className="mt-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors duration-200"
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