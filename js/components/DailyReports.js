import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { sdk } from '../sdk.js';
import { UserSession } from '../utils/UserSession.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { showToast } from '../utils/toast.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';

Chart.register(...registerables);

export default function DailyReports() {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyData, setDailyData] = useState(null);
    const [categoryBreakdown, setCategoryBreakdown] = useState([]);
    const [hourlyData, setHourlyData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const chartRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        fetchDailyData();
    }, [selectedDate]);

    const fetchDailyData = async () => {
        setLoading(true);
        try {
            // Check if user is authenticated and SDK is ready
            if (!sdk || !sdk.db) {
                console.log('Firebase not initialized yet, skipping daily data fetch');
                setLoading(false);
                return;
            }

            const date = new Date(selectedDate);
            const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

            // Convert dates to Firebase Timestamp format for querying
            const startTimestamp = Timestamp.fromDate(startOfDay);
            const endTimestamp = Timestamp.fromDate(endOfDay);

            // Fetch orders for the selected date
            const ordersSnapshot = await sdk.db.collection("Orders")
                .where("date", ">=", startTimestamp)
                .where("date", "<", endTimestamp)
                .get();

            const orders = ordersSnapshot.docs.map(doc => {
                try {
                    return Order.fromDoc(doc);
                } catch (err) {
                    console.warn('Error parsing order document:', err);
                    return null;
                }
            }).filter(order => order);

            // Fetch all products for category mapping
            const productsSnapshot = await sdk.db.collection("Product").get(); // Fixed: Use 'Product' (singular)
            const products = {};
            productsSnapshot.docs.forEach(doc => {
                try {
                    const product = Product.fromDoc(doc);
                    if (product) {
                        products[product.id] = product;
                    }
                } catch (err) {
                    console.warn('Error parsing product document:', err);
                }
            });

            // Initialize hourly data for all 24 hours
            const hourly = Array.from({ length: 24 }, (_, hour) => ({
                hour,
                revenue: 0,
                orders: 0,
                items: 0
            }));

            // Calculate daily summary
            let totalRevenue = 0;
            let totalOrders = orders.length;
            let totalItems = 0;
            const paymentMethods = {};
            const orderSources = {};
            const categories = {};

            orders.forEach(order => {
                try {
                    const orderDate = order.date && order.date.toDate ? order.date.toDate() : new Date(order.date);
                    const hour = orderDate.getHours();

                    // Calculate order total
                    let orderRevenue = 0;
                    let orderItems = 0;

                    if (order.items && Array.isArray(order.items)) {
                        order.items.forEach(item => {
                            const itemRevenue = (item.price || 0) * (item.qnt || item.quantity || 0);
                            const itemQuantity = (item.qnt || item.quantity || 0);
                            
                            orderRevenue += itemRevenue;
                            orderItems += itemQuantity;

                            // Category breakdown
                            const product = products[item.pid];
                            if (product && product.cat) {
                                if (!categories[product.cat]) {
                                    categories[product.cat] = {
                                        name: product.cat,
                                        revenue: 0,
                                        quantity: 0,
                                        orders: new Set()
                                    };
                                }
                                categories[product.cat].revenue += itemRevenue;
                                categories[product.cat].quantity += itemQuantity;
                                categories[product.cat].orders.add(order.id);
                            }
                        });
                    }

                    totalRevenue += orderRevenue;
                    totalItems += orderItems;

                    // Hourly breakdown (only for valid hours 0-23)
                    if (hour >= 0 && hour < 24) {
                        hourly[hour].revenue += orderRevenue;
                        hourly[hour].orders += 1;
                        hourly[hour].items += orderItems;
                    }

                    // Payment method breakdown
                    const payMethod = order.payMode || 'Unknown';
                    paymentMethods[payMethod] = (paymentMethods[payMethod] || 0) + orderRevenue;

                    // Order source breakdown
                    let source = 'Dine-in';
                    if (order.source) source = order.source;
                    else if (order.priceVariant === 'Takeaway') source = 'Takeaway';
                    else if (order.isOnline) source = 'Online';
                    
                    orderSources[source] = (orderSources[source] || 0) + orderRevenue;
                } catch (orderErr) {
                    console.warn('Error processing order:', orderErr);
                }
            });

            // Convert categories object to array and add order count
            const categoryBreakdownArray = Object.values(categories).map(cat => ({
                ...cat,
                orders: cat.orders.size
            })).sort((a, b) => b.revenue - a.revenue);

            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

            setDailyData({
                date: selectedDate,
                totalRevenue,
                totalOrders,
                totalItems,
                avgOrderValue,
                paymentMethods,
                orderSources
            });

            setCategoryBreakdown(categoryBreakdownArray);
            setHourlyData(hourly);

        } catch (error) {
            console.error('Error fetching daily data:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            // Only show toast if it's a real error, not just initialization
            if (error.code !== 'permission-denied' && error.message !== 'Firebase not loaded') {
                showToast('Failed to load daily data', 'error');
            }
        } finally {
            setLoading(false);
        }
    };


    const exportData = async (format) => {
        if (!dailyData) {
            showToast('No data to export', 'error');
            return;
        }

        setIsExporting(true);
        try {
            const dateLabel = new Date(selectedDate).toLocaleDateString('en-GB');
            
            if (format === 'excel') {
                await exportToExcel(dateLabel);
            } else if (format === 'pdf') {
                exportToPDF(dateLabel);
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            showToast('Failed to export data', 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const exportToExcel = async (dateLabel) => {
        // Load SheetJS library if not already loaded
        if (!window.XLSX) {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            
            return new Promise((resolve, reject) => {
                script.onload = () => {
                    generateExcelFile(dateLabel);
                    resolve();
                };
                script.onerror = () => {
                    exportToCSV(dateLabel);
                    resolve();
                };
                document.head.appendChild(script);
            });
        } else {
            generateExcelFile(dateLabel);
        }
    };

    const generateExcelFile = (dateLabel) => {
        try {
            const XLSX = window.XLSX;
            const workbook = XLSX.utils.book_new();
            
            // Daily Summary Sheet
            const summaryData = [
                [`DAILY REPORT - ${dateLabel}`],
                ['Generated on:', new Date().toLocaleDateString('en-GB')],
                [''],
                ['SUMMARY METRICS'],
                ['Total Revenue', formatCurrency(dailyData.totalRevenue)],
                ['Total Orders', dailyData.totalOrders],
                ['Total Items Sold', dailyData.totalItems],
                ['Average Order Value', formatCurrency(dailyData.avgOrderValue)],
                [''],
                ['PAYMENT METHODS'],
                ['Method', 'Revenue'],
                ...Object.entries(dailyData.paymentMethods).map(([method, revenue]) => [method, revenue]),
                [''],
                ['ORDER SOURCES'],
                ['Source', 'Revenue'],
                ...Object.entries(dailyData.orderSources).map(([source, revenue]) => [source, revenue])
            ];
            
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            summarySheet['!cols'] = [{ width: 25 }, { width: 20 }];
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Daily Summary');
            
            // Category Breakdown Sheet
            const categoryData = [
                ['CATEGORY BREAKDOWN'],
                ['Category', 'Revenue', 'Quantity', 'Orders'],
                ...categoryBreakdown.map(cat => [
                    cat.name,
                    cat.revenue,
                    cat.quantity,
                    cat.orders
                ])
            ];
            
            const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
            categorySheet['!cols'] = [{ width: 20 }, { width: 15 }, { width: 12 }, { width: 10 }];
            XLSX.utils.book_append_sheet(workbook, categorySheet, 'Category Breakdown');
            
            // Hourly Breakdown Sheet
            const hourlyDataSheet = [
                ['HOURLY BREAKDOWN'],
                ['Hour', 'Revenue', 'Orders', 'Items'],
                ...hourlyData.map(hour => [
                    `${hour.hour}:00`,
                    hour.revenue,
                    hour.orders,
                    hour.items
                ])
            ];
            
            const hourlySheet = XLSX.utils.aoa_to_sheet(hourlyDataSheet);
            hourlySheet['!cols'] = [{ width: 10 }, { width: 15 }, { width: 10 }, { width: 10 }];
            XLSX.utils.book_append_sheet(workbook, hourlySheet, 'Hourly Breakdown');
            
            // Generate and download
            const fileName = `daily-report-${selectedDate}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            
            showToast('Excel file downloaded successfully', 'success');
            
        } catch (error) {
            console.error('Error generating Excel file:', error);
            exportToCSV(dateLabel);
        }
    };

    const exportToCSV = (dateLabel) => {
        let csvContent = "data:text/csv;charset=utf-8,";
        
        csvContent += `DAILY REPORT - ${dateLabel}\n`;
    csvContent += `Generated on,${new Date().toLocaleDateString('en-GB')}\n\n`;
        
        csvContent += "SUMMARY METRICS\n";
        csvContent += `Total Revenue,${dailyData.totalRevenue}\n`;
        csvContent += `Total Orders,${dailyData.totalOrders}\n`;
        csvContent += `Total Items Sold,${dailyData.totalItems}\n`;
        csvContent += `Average Order Value,${dailyData.avgOrderValue}\n\n`;
        
        csvContent += "CATEGORY BREAKDOWN\n";
        csvContent += "Category,Revenue,Quantity,Orders\n";
        categoryBreakdown.forEach(cat => {
            csvContent += `${cat.name},${cat.revenue},${cat.quantity},${cat.orders}\n`;
        });
        
        csvContent += "\nHOURLY BREAKDOWN\n";
        csvContent += "Hour,Revenue,Orders,Items\n";
        hourlyData.forEach(hour => {
            csvContent += `${hour.hour}:00,${hour.revenue},${hour.orders},${hour.items}\n`;
        });
        
        // Download CSV
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `daily-report-${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('CSV file downloaded successfully', 'success');
    };

    const exportToPDF = (dateLabel) => {
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Daily Report - ${dateLabel}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; line-height: 1.6; }
                h1 { color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px; margin-bottom: 20px; }
                h2 { color: #374151; margin-top: 30px; margin-bottom: 15px; }
                .header { text-align: center; margin-bottom: 30px; }
                .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .summary-card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; background: #f9fafb; }
                .metric-value { font-size: 24px; font-weight: bold; color: #111827; }
                .metric-label { color: #6b7280; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
                th { background-color: #f3f4f6; font-weight: bold; }
                @media print { body { margin: 0; } .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Daily Report - ${dateLabel}</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-GB')}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Revenue</div>
                    <div class="metric-value">${formatCurrency(dailyData.totalRevenue)}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Orders</div>
                    <div class="metric-value">${dailyData.totalOrders}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Items Sold</div>
                    <div class="metric-value">${dailyData.totalItems}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Order Value</div>
                    <div class="metric-value">${formatCurrency(dailyData.avgOrderValue)}</div>
                </div>
            </div>

            <h2>Category Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Revenue</th>
                        <th>Quantity</th>
                        <th>Orders</th>
                    </tr>
                </thead>
                <tbody>
                    ${categoryBreakdown.map(cat => `
                        <tr>
                            <td>${cat.name}</td>
                            <td>${formatCurrency(cat.revenue)}</td>
                            <td>${cat.quantity}</td>
                            <td>${cat.orders}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h2>Payment Methods</h2>
            <table>
                <thead>
                    <tr>
                        <th>Method</th>
                        <th>Revenue</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(dailyData.paymentMethods).map(([method, revenue]) => `
                        <tr>
                            <td>${method}</td>
                            <td>${formatCurrency(revenue)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h2>Order Sources</h2>
            <table>
                <thead>
                    <tr>
                        <th>Source</th>
                        <th>Revenue</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(dailyData.orderSources).map(([source, revenue]) => `
                        <tr>
                            <td>${source}</td>
                            <td>${formatCurrency(revenue)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
        `;

        // Use the same printing approach as existing reports
        try {
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

            showToast('PDF print dialog opened', 'success');
        } catch (error) {
            console.error("Error opening print dialog:", error);
            showToast('Please use Ctrl+P to print this report as PDF', 'info');
        }
    };

    const formatCurrency = (amount) => {
        if (CurrencyData) {
            const currencyCode = UserSession?.getCurrencyCode() || "INR";
            return CurrencyData.formatAmount(amount, currencyCode);
        }
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    // Create hourly chart
    useEffect(() => {
        if (hourlyData.length > 0 && canvasRef.current) {
            if (chartRef.current) {
                chartRef.current.destroy();
            }

            const ctx = canvasRef.current.getContext('2d');
            chartRef.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: hourlyData.map(hour => `${hour.hour}:00`),
                    datasets: [{
                        label: 'Revenue',
                        data: hourlyData.map(hour => hour.revenue),
                        backgroundColor: 'rgba(239, 68, 68, 0.5)',
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        yAxisID: 'y'
                    }, {
                        label: 'Orders',
                        data: hourlyData.map(hour => hour.orders),
                        backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        yAxisID: 'y1'
                    }]
                },
                options: {
                    responsive: true,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Hour of Day'
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Revenue'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Orders'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    }
                }
            });
        }

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };
    }, [hourlyData]);

    if (loading && !dailyData) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <i className="ph ph-spinner text-gray-400 text-4xl animate-spin mb-2"></i>
                    <p className="text-gray-500">Loading daily reports...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header and Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Daily Reports</h2>
                    <p className="text-gray-600">Detailed insights for a specific day</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        max={new Date().toISOString().split('T')[0]}
                    />
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => exportData('excel')}
                            disabled={!dailyData || isExporting}
                            className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <i className="ph ph-file-xls text-sm"></i>
                            Excel
                        </button>
                        <button 
                            onClick={() => exportData('pdf')}
                            disabled={!dailyData || isExporting}
                            className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <i className="ph ph-file-pdf text-sm"></i>
                            PDF
                        </button>
                    </div>
                </div>
            </div>

            {dailyData ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Total Revenue</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(dailyData.totalRevenue)}
                                    </p>
                                </div>
                                <div className="p-3 bg-green-50 rounded-full">
                                    <i className="ph ph-currency-circle-dollar text-green-500 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Total Orders</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {dailyData.totalOrders.toLocaleString()}
                                    </p>
                                </div>
                                <div className="p-3 bg-blue-50 rounded-full">
                                    <i className="ph ph-shopping-cart text-blue-500 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Items Sold</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {dailyData.totalItems.toLocaleString()}
                                    </p>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-full">
                                    <i className="ph ph-package text-purple-500 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Avg Order Value</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(dailyData.avgOrderValue)}
                                    </p>
                                </div>
                                <div className="p-3 bg-orange-50 rounded-full">
                                    <i className="ph ph-chart-line text-orange-500 text-xl"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Hourly Chart */}
                    {hourlyData.some(h => h.revenue > 0) && (
                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Hourly Performance</h3>
                            <div className="h-64">
                                <canvas ref={canvasRef} className="w-full h-full"></canvas>
                            </div>
                        </div>
                    )}

                    {/* Category Breakdown */}
                    {categoryBreakdown.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm border">
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-semibold text-gray-800">Category Performance</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {categoryBreakdown.map((category, index) => (
                                            <tr key={category.name} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{category.name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {formatCurrency(category.revenue)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {category.quantity}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {category.orders}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                                        <div 
                                                            className="bg-green-500 h-2 rounded-full" 
                                                            style={{ 
                                                                width: `${categoryBreakdown.length > 0 ? 
                                                                    (category.revenue / categoryBreakdown[0].revenue) * 100 : 0}%` 
                                                            }}
                                                        ></div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Payment Methods and Order Sources */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Payment Methods */}
                        <div className="bg-white rounded-lg shadow-sm border">
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-semibold text-gray-800">Payment Methods</h3>
                            </div>
                            <div className="p-6">
                                <div className="space-y-4">
                                    {Object.entries(dailyData.paymentMethods).map(([method, revenue]) => (
                                        <div key={method} className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                                                <span className="text-sm font-medium text-gray-900">{method}</span>
                                            </div>
                                            <span className="text-sm text-gray-600">{formatCurrency(revenue)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Order Sources */}
                        <div className="bg-white rounded-lg shadow-sm border">
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-semibold text-gray-800">Order Sources</h3>
                            </div>
                            <div className="p-6">
                                <div className="space-y-4">
                                    {Object.entries(dailyData.orderSources).map(([source, revenue]) => (
                                        <div key={source} className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                                                <span className="text-sm font-medium text-gray-900">{source}</span>
                                            </div>
                                            <span className="text-sm text-gray-600">{formatCurrency(revenue)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
                    <i className="ph ph-calendar text-gray-400 text-6xl mb-4"></i>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
                    <p className="text-gray-500">No orders found for {new Date(selectedDate).toLocaleDateString('en-IN')}</p>
                </div>
            )}
        </div>
    );
}
