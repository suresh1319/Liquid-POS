import { useState, useEffect } from 'react';
import { useProfile } from '../contexts/ProfileContext.js';
import { showToast } from '../utils.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';
import { sdk } from '../sdk.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { getDiscountSummary } from '../utils/DiscountSummaryCalculator.js';


export default function TaxReportModal({ isOpen, onClose }) {
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [reportType, setReportType] = useState('days'); // today, yesterday, days, custom
    const [daysFilter, setDaysFilter] = useState('7'); // 7, 30, 90
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    
    const { profile } = useProfile();

    // Report type options
    const reportTypes = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'days', label: 'Days' },
        { id: 'custom', label: 'Custom Date' }
    ];

    // Days filter options
    const daysFilters = [
        { id: '7', label: 'Last 7 Days' },
        { id: '30', label: 'Last 30 Days' },
        { id: '90', label: 'Last 90 Days' }
    ];

    useEffect(() => {
        if (isOpen && reportType !== 'custom') {
            fetchTaxReportData();
        }
    }, [isOpen, reportType, daysFilter]);

    const fetchTaxReportData = async () => {
        setIsLoading(true);
        try {
            let data;
            
            switch (reportType) {
                case 'today':
                    data = await fetchTodayTaxData();
                    break;
                case 'yesterday':
                    data = await fetchYesterdayTaxData();
                    break;
                case 'days':
                    data = await fetchDaysTaxData(daysFilter);
                    break;
                case 'custom':
                    if (customStartDate && customEndDate) {
                        data = await fetchCustomTaxData();
                    }
                    break;
                default:
                    data = await fetchDaysTaxData('7');
            }
            
            setReportData(data);
        } catch (error) {
            console.error('Error fetching tax report data:', error);
            showToast('Failed to load tax report data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

  const fetchTodayTaxData = async () => {
    try {
        const dateRange = PassbookCalculator.getDateRange('today');

        const passbookData = await PassbookCalculator.fetchPassbookData(sdk);

        const todayTransactions = PassbookCalculator.filterTransactions(
            passbookData.transactions,
            {
                dateFilter: 'today',
                activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'],
                customers: passbookData.customers
            }
        );

        const taxData = processTaxData(todayTransactions, passbookData);

        // ✅ ADDITION (READ-ONLY)
        const discountSummary = await getDiscountSummary({
            sdk,
            dateFilter: 'today',
            customers: passbookData.customers
        });

        taxData.referenceDiscount = discountSummary.totalDiscount;

        return {
            type: 'today',
            data: taxData,
            title: 'Today Tax Report',
            dateRange
        };
    } catch (error) {
        console.error('Error fetching today tax data:', error);
        throw error;
    }
};


   const fetchYesterdayTaxData = async () => {
    try {
        const dateRange = PassbookCalculator.getDateRange('yesterday');

        const passbookData = await PassbookCalculator.fetchPassbookData(sdk);

        const yesterdayTransactions = PassbookCalculator.filterTransactions(
            passbookData.transactions,
            {
                dateFilter: 'yesterday',
                activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'],
                customers: passbookData.customers
            }
        );

        const taxData = processTaxData(yesterdayTransactions, passbookData);

        // ✅ ADDITION
        const discountSummary = await getDiscountSummary({
            sdk,
            dateFilter: 'yesterday',
            customers: passbookData.customers
        });

        taxData.referenceDiscount = discountSummary.totalDiscount;

        return {
            type: 'yesterday',
            data: taxData,
            title: 'Yesterday Tax Report',
            dateRange
        };
    } catch (error) {
        console.error('Error fetching yesterday tax data:', error);
        throw error;
    }
};


   const fetchDaysTaxData = async (days) => {
    try {
        const dateFilter = `last${days}`;
        const dateRange = PassbookCalculator.getDateRange(dateFilter);

        const passbookData = await PassbookCalculator.fetchPassbookData(sdk);

        const daysTransactions = PassbookCalculator.filterTransactions(
            passbookData.transactions,
            {
                dateFilter,
                activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'],
                customers: passbookData.customers
            }
        );

        const taxData = processTaxData(daysTransactions, passbookData);

        // ✅ ADDITION
        const discountSummary = await getDiscountSummary({
            sdk,
            dateFilter,
            customers: passbookData.customers
        });

        taxData.referenceDiscount = discountSummary.totalDiscount;

        return {
            type: 'days',
            data: taxData,
            title: `${days} Days Tax Report`,
            days,
            dateRange
        };
    } catch (error) {
        console.error('Error fetching days tax data:', error);
        throw error;
    }
};


   const fetchCustomTaxData = async () => {
    try {
        if (!customStartDate || !customEndDate) {
            throw new Error('Please select both start and end dates');
        }

        const startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);

        const passbookData = await PassbookCalculator.fetchPassbookData(sdk);

        const customTransactions = PassbookCalculator.filterTransactions(
            passbookData.transactions,
            {
                dateFilter: 'custom',
                customDateRange: { start: startDate, end: endDate },
                activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'],
                customers: passbookData.customers
            }
        );

        const taxData = processTaxData(customTransactions, passbookData);

        // ✅ ADDITION
        const discountSummary = await getDiscountSummary({
            sdk,
            dateFilter: 'custom',
            customDateRange: { start: startDate, end: endDate },
            customers: passbookData.customers
        });

        taxData.referenceDiscount = discountSummary.totalDiscount;

        return {
            type: 'custom',
            data: taxData,
            title: `Custom Period Tax Report (${customStartDate} to ${customEndDate})`,
            dateRange: { start: startDate, end: endDate }
        };
    } catch (error) {
        console.error('Error fetching custom tax data:', error);
        throw error;
    }
};


    // Process tax data from transactions
// ================================
// TAX REPORT – SAFE READ-ONLY LOGIC
// ================================
const processTaxData = (transactions, passbookData) => {
    const orders = Array.isArray(passbookData?.orders)
        ? passbookData.orders
        : [];

    // 🔒 REPORT SAFETY: prevent negative tax
    const normalizeTaxAmount = (amount) => {
        return Math.max(0, Number(amount) || 0);
    };

    const taxSummary = {
        cgst: { name: 'CGST', amount: 0, count: 0 },
        sgst: { name: 'SGST', amount: 0, count: 0 },
        igst: { name: 'IGST', amount: 0, count: 0 },
        vat:  { name: 'VAT',  amount: 0, count: 0 },
        customTaxes: new Map(),

        totalTax: 0,
        totalInclusiveTax: 0,
        totalExclusiveTax: 0,

        transactionCount: 0,
         referenceDiscount: 0 ,
        productTaxDetails: []
    };

    // Date range from filtered transactions
    const dates = transactions.map(t => new Date(t.date));
    const minDate = dates.length ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length ? new Date(Math.max(...dates)) : null;

    // Customer lookup
    const customerMap = new Map();
    (passbookData.customers || []).forEach(c => {
        customerMap.set(c.id, c.name || c.phone || 'Walk-in Customer');
    });

    orders.forEach(order => {
        const orderDate = new Date(order.createdAt || order.date || Date.now());

        if (minDate && orderDate < minDate) return;
        if (maxDate && orderDate > maxDate) return;

        const taxes = Array.isArray(order.calculatedCharges)
            ? order.calculatedCharges
            : [];

        if (!taxes.length) return;

        taxSummary.transactionCount++;

        const customerName =
            customerMap.get(order.custId) || 'Walk-in Customer';

        // -------------------
        // ORDER LEVEL TAX
        // -------------------
        taxes.forEach(tax => {
            const name = (tax.name || '').toLowerCase();
            const rawAmount = Number(
                tax.calculatedAmount ?? tax.amount ?? 0
            );

            // ✅ FIX: sanitize for reports
            const amount = normalizeTaxAmount(rawAmount);

            taxSummary.totalTax += amount;

            if (tax.inclusive === true) {
                taxSummary.totalInclusiveTax += amount;
            } else {
                taxSummary.totalExclusiveTax += amount;
            }

            if (name.includes('cgst')) {
                taxSummary.cgst.amount += amount;
                taxSummary.cgst.count++;
            } else if (name.includes('sgst')) {
                taxSummary.sgst.amount += amount;
                taxSummary.sgst.count++;
            } else if (name.includes('igst')) {
                taxSummary.igst.amount += amount;
                taxSummary.igst.count++;
            } else if (name.includes('vat')) {
                taxSummary.vat.amount += amount;
                taxSummary.vat.count++;
            } else {
                if (!taxSummary.customTaxes.has(tax.name)) {
                    taxSummary.customTaxes.set(tax.name, {
                        name: tax.name,
                        amount: 0,
                        count: 0
                    });
                }
                const ct = taxSummary.customTaxes.get(tax.name);
                ct.amount += amount;
                ct.count++;
            }
        });

        // -------------------
        // PRODUCT LEVEL TAX
        // -------------------
        const items = order.items || [];
        if (!items.length) return;

        const baseAmount = items.reduce((sum, item) => {
            const price = Number(item.price) || 0;
            const qty = Number(item.qnt || item.quantity) || 1;
            return sum + price * qty;
        }, 0);

        items.forEach(item => {
            const itemPrice =
                (Number(item.price) || 0) *
                (Number(item.qnt || item.quantity) || 1);

            const ratio = baseAmount > 0 ? itemPrice / baseAmount : 0;

            let cgst = 0, sgst = 0, igst = 0, vat = 0, other = 0;

            taxes.forEach(tax => {
                const split =
                    normalizeTaxAmount(
                        Number(tax.calculatedAmount ?? tax.amount ?? 0)
                    ) * ratio;

                const n = (tax.name || '').toLowerCase();

                if (n.includes('cgst')) cgst += split;
                else if (n.includes('sgst')) sgst += split;
                else if (n.includes('igst')) igst += split;
                else if (n.includes('vat')) vat += split;
                else other += split;
            });

            const totalTax = cgst + sgst + igst + vat + other;

            taxSummary.productTaxDetails.push({
                date: orderDate,
                orderId: order.orderNo || order.id,
                customerName,
                productName: item.name || 'Item',
                mrp: itemPrice,
                cgst,
                sgst,
                igst,
                vat,
                otherTaxes: other,
                totalTax,
                netAmount: itemPrice + totalTax
            });
        });
    });

    taxSummary.customTaxes = Array.from(taxSummary.customTaxes.values());
    return taxSummary;
};







    const formatCurrency = (amount) => {
        const currencyCode = profile?.currencyCode || 'INR';
        return CurrencyData.formatAmount(amount, currencyCode);
    };

    const exportToPDF = () => {
        if (!reportData) return;
        setIsExporting(true);
        
        try {
            // Create table for product tax details
            let tableHTML = '<table style="width:100%; border-collapse: collapse; margin: 20px 0;">';
            tableHTML += '<thead><tr>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">Date</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">Order ID</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">Customer</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">Product</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">MRP</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">CGST</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">SGST</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">IGST</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">VAT</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">Other Taxes</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">Total Tax</th>';
            tableHTML += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">Net Amount</th>';
            tableHTML += '</tr></thead><tbody>';
            
            // Add product tax details rows
            reportData.data.productTaxDetails.forEach(item => {
                tableHTML += '<tr>';
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${item.date.toLocaleDateString('en-IN')}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${item.orderId}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${item.customerName}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${item.productName}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.mrp)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.cgst)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.sgst)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.igst)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.vat)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.otherTaxes)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.totalTax)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(item.netAmount)}</td>`;
                tableHTML += '</tr>';
            });
            
            // Add summary row
            if (reportData.data.productTaxDetails.length > 0) {
                const totalMRP = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.mrp, 0);
                const totalCGST = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.cgst, 0);
                const totalSGST = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.sgst, 0);
                const totalIGST = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.igst, 0);
                const totalVAT = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.vat, 0);
                const totalOtherTaxes = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.otherTaxes, 0);
                const totalTax = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.totalTax, 0);
                const totalNetAmount = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.netAmount, 0);
                
                tableHTML += '<tr style="font-weight: bold; background-color: #f0f0f0;">';
                tableHTML += '<td style="border: 1px solid #ddd; padding: 8px;" colspan="4">TOTAL</td>';
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalMRP)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalCGST)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalSGST)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalIGST)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalVAT)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalOtherTaxes)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalTax)}</td>`;
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formatCurrency(totalNetAmount)}</td>`;
                tableHTML += '</tr>';
            }
            
            tableHTML += '</tbody></table>';
            
            const title = `${reportData.title} - Detailed Tax Report`;
            
            const printContent = `
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #ef4444; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; }
                .summary-row { font-weight: bold; background-color: #f0f0f0; }
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
            
            const title = `${reportData.title} - Detailed Tax Report`;
            
            // Prepare product tax details data
            const headers = [
                'Date', 'Order ID', 'Customer', 'Product', 'MRP', 
                'CGST', 'SGST', 'IGST', 'VAT', 'Other Taxes', 'Total Tax', 'Net Amount'
            ];
            
            const dataRows = reportData.data.productTaxDetails.map(item => [
                item.date.toLocaleDateString('en-IN'),
                item.orderId,
                item.customerName,
                item.productName,
                formatCurrency(item.mrp),
                formatCurrency(item.cgst),
                formatCurrency(item.sgst),
                formatCurrency(item.igst),
                formatCurrency(item.vat),
                formatCurrency(item.otherTaxes),
                formatCurrency(item.totalTax),
                formatCurrency(item.netAmount)
            ]);
            
            // Add Total Row
            if (reportData.data.productTaxDetails.length > 0) {
                const totalMRP = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.mrp, 0);
                const totalCGST = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.cgst, 0);
                const totalSGST = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.sgst, 0);
                const totalIGST = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.igst, 0);
                const totalVAT = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.vat, 0);
                const totalOtherTaxes = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.otherTaxes, 0);
                const totalTax = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.totalTax, 0);
                const totalNetAmount = reportData.data.productTaxDetails.reduce((sum, item) => sum + item.netAmount, 0);
                
                dataRows.push([
                    'TOTAL', '', '', '',
                    formatCurrency(totalMRP),
                    formatCurrency(totalCGST),
                    formatCurrency(totalSGST),
                    formatCurrency(totalIGST),
                    formatCurrency(totalVAT),
                    formatCurrency(totalOtherTaxes),
                    formatCurrency(totalTax),
                    formatCurrency(totalNetAmount)
                ]);
            }
            
            // Create worksheet data
            const wsData = [headers, ...dataRows];
            const worksheet = XLSX.utils.aoa_to_sheet(wsData);
            
            // Add styling for the Total Row (if it exists)
            if (reportData.data.productTaxDetails.length > 0 && worksheet) {
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
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Tax Report');
            
            // Generate and download Excel file
            const fileName = `tax-report-${new Date().toISOString().split('T')[0]}.xlsx`;
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
            
            fetchTaxReportData();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-rose-50 rounded-t-xl">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-red-100 rounded-xl shadow-sm">
                                <i className="ph ph-receipt text-red-600 text-2xl"></i>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Tax Report</h2>
                                <p className="text-sm text-red-600 mt-1">Detailed tax analysis by product</p>
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

                {/* Controls */}
                <div className="p-5 bg-gray-50 border-b border-gray-200">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Report Type:</label>
                            <div className="flex rounded-lg shadow-sm overflow-hidden">
                                {reportTypes.map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setReportType(type.id)}
                                        className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                            reportType === type.id
                                                ? 'bg-red-600 text-white'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                        } ${type.id === 'today' ? 'rounded-l-lg' : ''} ${
                                            type.id === 'custom' ? 'rounded-r-lg' : ''
                                        }`}
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {reportType === 'days' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Period:</label>
                                <select
                                    value={daysFilter}
                                    onChange={(e) => setDaysFilter(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 shadow-sm"
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
                        
                        <div className="ml-auto">
                            <button
                                onClick={fetchTaxReportData}
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
                        <div className="p-12 text-center">
                            <div className="inline-flex flex-col items-center space-y-3">
                                <i className="ph ph-spinner text-red-500 text-3xl animate-spin"></i>
                                <span className="text-gray-600 text-lg">Loading tax report data...</span>
                            </div>
                        </div>
                    ) : reportData && reportData.data ? (
                        <div className="p-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-green-800">Total Tax Collected</h3>
                                        <i className="ph ph-currency-circle-dollar text-green-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(reportData.data.totalTax)}
                                    </p>
                                    <div className="mt-2 text-xs text-green-600">
                                        Total tax amount collected
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-blue-800">CGST Collected</h3>
                                        <i className="ph ph-chart-pie text-blue-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(reportData.data.cgst.amount)}
                                    </p>
                                    <div className="mt-2 text-xs text-blue-600">
                                        {reportData.data.cgst.count} transactions
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-purple-800">SGST Collected</h3>
                                        <i className="ph ph-chart-line text-purple-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {formatCurrency(reportData.data.sgst.amount)}
                                    </p>
                                    <div className="mt-2 text-xs text-purple-600">
                                        {reportData.data.sgst.count} transactions
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-orange-800">Total Transactions</h3>
                                        <i className="ph ph-receipt text-orange-500 text-2xl"></i>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 mt-3">
                                        {reportData.data.transactionCount.toLocaleString()}
                                    </p>
                                    <div className="mt-2 text-xs text-orange-600">
                                        With tax applied
                                    </div>
                                </div>
                            </div>



                            {/* Tax Breakdown Section */}
{/* Tax Breakdown Section */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

    {/* Inclusive vs Exclusive Breakdown */}
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <i className="ph ph-chart-donut text-red-600 mr-2"></i>
            Inclusive vs Exclusive Tax
        </h3>

        <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
                <div>
                    <p className="font-medium text-green-800">Inclusive Tax</p>
                    <p className="text-xs text-green-600">
                        Tax included in product price
                    </p>
                </div>
                <p className="text-xl font-bold text-green-800">
                    {formatCurrency(reportData.data.totalInclusiveTax)}
                </p>
            </div>

            <div className="flex justify-between items-center p-4 bg-red-50 rounded-lg">
                <div>
                    <p className="font-medium text-red-800">Exclusive Tax</p>
                    <p className="text-xs text-red-600">
                        Tax added to product price
                    </p>
                </div>
                <p className="text-xl font-bold text-red-800">
                    {formatCurrency(reportData.data.totalExclusiveTax)}
                </p>
            </div>
        </div>
    </div>

    {/* Tax Types Breakdown */}
{/* Tax Types Breakdown */}
<div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <i className="ph ph-list-bullets text-red-600 mr-2"></i>
        Tax Types
    </h3>

    <div className="space-y-3">

        {/* CGST */}
        {reportData.data.cgst.amount > 0 && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-700">CGST</span>
                <span className="font-semibold">
                    {formatCurrency(reportData.data.cgst.amount)}
                </span>
            </div>
        )}

        {/* SGST */}
        {reportData.data.sgst.amount > 0 && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-700">SGST</span>
                <span className="font-semibold">
                    {formatCurrency(reportData.data.sgst.amount)}
                </span>
            </div>
        )}

        {/* 🔹 Discount Reference (ONLY HERE) */}
        {reportData.data.referenceDiscount > 0 && (
            <div className="flex justify-between items-center py-2 border-t border-dashed border-gray-300 mt-2 pt-3">
                <div className="flex items-center space-x-2">
                    <span className="text-gray-600">
                        Discount 
                    </span>
                    <i
                        className="ph ph-info text-gray-400 cursor-help"
                        title="Shown for reference only. See Discount Report for full details."
                    ></i>
                </div>

                <span className="font-semibold text-gray-900">
                    {formatCurrency(reportData.data.referenceDiscount)}
                </span>
            </div>
        )}

    </div>
</div>


</div>


                            {/* Detailed Product Tax Report */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-900">
                                            Detailed Product Tax Report
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Tax breakdown by product with sale details
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                                            {reportData.data.productTaxDetails.length} records
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Order ID</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">MRP</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">CGST</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">SGST</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">IGST</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">VAT</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Other Taxes</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Tax</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Net Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {reportData.data.productTaxDetails.map((item, index) => (
                                                    <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {item.date.toLocaleDateString('en-IN')}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                            {item.orderId}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {item.customerName}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {item.productName}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(item.mrp)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(item.cgst)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(item.sgst)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(item.igst)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(item.vat)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(item.otherTaxes)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                            {formatCurrency(item.totalTax)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                            {formatCurrency(item.netAmount)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {/* Total Row */}
                                                {reportData.data.productTaxDetails.length > 0 && (
                                                    <tr className="bg-gray-50 font-semibold">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colSpan="4">
                                                            <div className="flex items-center space-x-3">
                                                                <div className="p-2 rounded-lg bg-gray-200">
                                                                    <i className="ph ph-calculator text-sm"></i>
                                                                </div>
                                                                <span>Total</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.mrp, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.cgst, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.sgst, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.igst, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.vat, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.otherTaxes, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.totalTax, 0))}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatCurrency(reportData.data.productTaxDetails.reduce((sum, item) => sum + item.netAmount, 0))}
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
                                    <p className="mt-1 text-gray-500">No tax data found for the selected period.</p>
                                </div>
                                <button
                                    onClick={fetchTaxReportData}
                                    className="mt-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors duration-200 shadow-sm"
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