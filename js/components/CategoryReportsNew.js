import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { sdk } from '../sdk.js';
import { UserSession } from '../utils/UserSession.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { showToast } from '../utils/toast.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';

Chart.register(...registerables);

export default function CategoryReports() {
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [period, setPeriod] = useState('week');
    const [salesData, setSalesData] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [comparisonData, setComparisonData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const chartRef = useRef(null);
    const comparisonChartRef = useRef(null);
    const canvasRef = useRef(null);
    const comparisonCanvasRef = useRef(null);

    // Period options - includes all required timeframes
    const periodOptions = [
        { value: 'day', label: 'Today' },
        { value: 'week', label: 'This Week' },
        { value: 'month', label: 'This Month' },
        { value: 'last7days', label: 'Last 7 Days' },
        { value: 'last30days', label: 'Last 30 Days' },
        { value: '90days', label: 'Last 90 Days' }
    ];

    // Fetch available categories from products
    useEffect(() => {
        fetchCategories();
        fetchComparisonData();
    }, []);

    // Fetch category-specific data when category or period changes
    useEffect(() => {
        if (selectedCategory) {
            fetchCategorySales();
            fetchTopProducts();
        }
        fetchComparisonData();
    }, [selectedCategory, period]);

    const fetchCategories = async () => {
        try {
            const productsSnapshot = await sdk.db.collection("Product").get(); // Fixed: Use 'Product' (singular)
            const categorySet = new Set();
            
            productsSnapshot.docs.forEach(doc => {
                const product = Product.fromDoc(doc);
                if (product && product.cat) {
                    categorySet.add(product.cat);
                }
            });
            
            const categoriesArray = Array.from(categorySet).map(cat => ({
                id: cat,
                name: cat
            }));
            
            setCategories(categoriesArray);
            
            // Auto-select first category if none selected
            if (categoriesArray.length > 0 && !selectedCategory) {
                setSelectedCategory(categoriesArray[0].id);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
            showToast('Failed to load categories', 'error');
        }
    };

    const getDateRange = (period) => {
        const now = new Date();
        let start = new Date();
        let end = new Date();
        
        switch(period) {
            case 'day':
                // Today: start of day to end of day
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                break;
            case 'week':
                // This Week: Monday to Sunday
                const currentDay = now.getDay();
                const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // Adjust for Sunday = 0
                start = new Date(now);
                start.setDate(now.getDate() + mondayOffset);
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            case 'month':
                // This Month: 1st to last day of current month
                start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                break;
            case 'last7days':
                // Last 7 days from today
                start = new Date(now);
                start.setDate(now.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                break;
            case 'last30days':
                // Last 30 days from today
                start = new Date(now);
                start.setDate(now.getDate() - 30);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                break;
            case '90days':
                // Last 90 days from today
                start = new Date(now);
                start.setDate(now.getDate() - 90);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                break;
            default:
                // Default to last 7 days
                start = new Date(now);
                start.setDate(now.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
        }
        
        return { start, end };
    };

    const fetchCategorySales = async () => {
        if (!selectedCategory) return;
        
        setLoading(true);
        try {
            const { start, end } = getDateRange(period);
            
            // Fetch orders in the date range
            const ordersSnapshot = await sdk.db.collection("Orders")
                .where("date", ">=", start)
                .where("date", "<=", end)
                .get();

            const orders = ordersSnapshot.docs.map(doc => Order.fromDoc(doc)).filter(order => order);
            
            // Get products for category mapping
            const productsSnapshot = await sdk.db.collection("Product").get(); // Fixed: Use 'Product' (singular)
            const products = {};
            productsSnapshot.docs.forEach(doc => {
                const product = Product.fromDoc(doc);
                if (product) {
                    products[product.id] = product;
                }
            });

            // Process sales data by date for the selected category
            const salesByDate = {};
            
            orders.forEach(order => {
                if (!order.items) return;
                
                const orderDate = order.date.toDate ? order.date.toDate() : new Date(order.date);
                const dateKey = orderDate.toISOString().split('T')[0];
                
                if (!salesByDate[dateKey]) {
                    salesByDate[dateKey] = {
                        date: dateKey,
                        revenue: 0,
                        quantity: 0,
                        orders: 0
                    };
                }

                let hasCategory = false;
                order.items.forEach(item => {
                    const product = products[item.pid];
                    if (product && product.cat === selectedCategory) {
                        const itemRevenue = (item.price || 0) * (item.qnt || item.quantity || 0);
                        salesByDate[dateKey].revenue += itemRevenue;
                        salesByDate[dateKey].quantity += (item.qnt || item.quantity || 0);
                        hasCategory = true;
                    }
                });

                if (hasCategory) {
                    salesByDate[dateKey].orders += 1;
                }
            });

            // Convert to array and sort by date
            const salesArray = Object.values(salesByDate).sort((a, b) => new Date(a.date) - new Date(b.date));
            setSalesData(salesArray);
            
        } catch (error) {
            console.error('Error fetching sales data:', error);
            showToast('Failed to load sales data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchTopProducts = async () => {
        if (!selectedCategory) return;
        
        try {
            const { start, end } = getDateRange(period);
            
            // Fetch orders in the date range
            const ordersSnapshot = await sdk.db.collection("Orders")
                .where("date", ">=", start)
                .where("date", "<=", end)
                .get();

            const orders = ordersSnapshot.docs.map(doc => Order.fromDoc(doc)).filter(order => order);
            
            // Get products for category mapping
            const productsSnapshot = await sdk.db.collection("Product").get(); // Fixed: Use 'Product' (singular)
            const products = {};
            productsSnapshot.docs.forEach(doc => {
                const product = Product.fromDoc(doc);
                if (product) {
                    products[product.id] = product;
                }
            });

            // Calculate product sales
            const productSales = {};
            
            orders.forEach(order => {
                if (!order.items) return;
                
                order.items.forEach(item => {
                    const product = products[item.pid];
                    if (product && product.cat === selectedCategory) {
                        if (!productSales[item.pid]) {
                            productSales[item.pid] = {
                                id: item.pid,
                                name: product.name,
                                quantity: 0,
                                revenue: 0
                            };
                        }
                        
                        const quantity = item.qnt || item.quantity || 0;
                        const price = item.price || 0;
                        
                        productSales[item.pid].quantity += quantity;
                        productSales[item.pid].revenue += price * quantity;
                    }
                });
            });

            // Sort by quantity sold and take top 10
            const topProductsArray = Object.values(productSales)
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 10);
            
            setTopProducts(topProductsArray);
            
        } catch (error) {
            console.error('Error fetching top products:', error);
            showToast('Failed to load top products', 'error');
        }
    };

    const fetchComparisonData = async () => {
        try {
            const { start, end } = getDateRange(period);
            
            // Fetch orders in the date range
            const ordersSnapshot = await sdk.db.collection("Orders")
                .where("date", ">=", start)
                .where("date", "<=", end)
                .get();

            const orders = ordersSnapshot.docs.map(doc => Order.fromDoc(doc)).filter(order => order);
            
            // Get all products for category mapping
            const productsSnapshot = await sdk.db.collection("Product").get(); // Fixed: Use 'Product' (singular)
            const products = {};
            productsSnapshot.docs.forEach(doc => {
                const product = Product.fromDoc(doc);
                if (product) {
                    products[product.id] = product;
                }
            });

            // Calculate data by category
            const categoryStats = {};
            
            orders.forEach(order => {
                if (!order.items) return;
                
                order.items.forEach(item => {
                    const product = products[item.pid];
                    if (product && product.cat) {
                        const category = product.cat;
                        
                        if (!categoryStats[category]) {
                            categoryStats[category] = {
                                name: category,
                                revenue: 0,
                                quantity: 0,
                                orders: new Set(),
                                products: {}
                            };
                        }
                        
                        const quantity = item.qnt || item.quantity || 0;
                        const price = item.price || 0;
                        const revenue = price * quantity;
                        
                        categoryStats[category].revenue += revenue;
                        categoryStats[category].quantity += quantity;
                        categoryStats[category].orders.add(order.id);
                        
                        // Track products for finding top product
                        if (!categoryStats[category].products[item.pid]) {
                            categoryStats[category].products[item.pid] = {
                                name: product.name,
                                quantity: 0,
                                revenue: 0
                            };
                        }
                        categoryStats[category].products[item.pid].quantity += quantity;
                        categoryStats[category].products[item.pid].revenue += revenue;
                    }
                });
            });

            // Process and find top product for each category
            const comparisonArray = Object.values(categoryStats).map(category => {
                const productsArray = Object.values(category.products);
                const topProduct = productsArray.length > 0 
                    ? productsArray.reduce((max, product) => 
                        product.quantity > max.quantity ? product : max
                    ) 
                    : { name: 'N/A', quantity: 0 };
                
                return {
                    name: category.name,
                    revenue: category.revenue,
                    quantity: category.quantity,
                    orders: category.orders.size,
                    topProduct: topProduct
                };
            });

            // Sort by revenue descending
            comparisonArray.sort((a, b) => b.revenue - a.revenue);
            setComparisonData(comparisonArray);
            
        } catch (error) {
            console.error('Error fetching comparison data:', error);
            showToast('Failed to load comparison data', 'error');
        }
    };

    const exportData = async (format) => {
        if (!selectedCategory) {
            showToast('Please select a category first', 'error');
            return;
        }

        setIsExporting(true);
        try {
            const categoryName = categories.find(c => c.id === selectedCategory)?.name || selectedCategory;
            const periodLabel = periodOptions.find(p => p.value === period)?.label || period;
            
            if (format === 'excel') {
                await exportToExcel(categoryName, periodLabel);
            } else if (format === 'pdf') {
                exportToPDF(categoryName, periodLabel);
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            showToast('Failed to export data', 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const exportToExcel = async (categoryName, periodLabel) => {
        // Load SheetJS library if not already loaded
        if (!window.XLSX) {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            
            return new Promise((resolve, reject) => {
                script.onload = () => {
                    generateExcelFile(categoryName, periodLabel);
                    resolve();
                };
                script.onerror = () => {
                    exportToCSV(categoryName, periodLabel);
                    resolve();
                };
                document.head.appendChild(script);
            });
        } else {
            generateExcelFile(categoryName, periodLabel);
        }
    };

    const generateExcelFile = (categoryName, periodLabel) => {
        try {
            const XLSX = window.XLSX;
            const workbook = XLSX.utils.book_new();
            
            // Summary metrics
            const totalRevenue = salesData.reduce((sum, day) => sum + day.revenue, 0);
            const totalQuantity = salesData.reduce((sum, day) => sum + day.quantity, 0);
            const totalOrders = salesData.reduce((sum, day) => sum + day.orders, 0);
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            
            // Category Summary Sheet
            const summaryData = [
                [`CATEGORY REPORT - ${categoryName.toUpperCase()}`],
                ['Period:', periodLabel],
                ['Generated on:', new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })],
                ['Generated at:', new Date().toLocaleTimeString('en-GB')],
                [''],
                ['SUMMARY METRICS'],
                ['Metric', 'Value'],
                ['Total Revenue', `₹${totalRevenue.toLocaleString('en-IN')}`],
                ['Total Quantity Sold', totalQuantity.toLocaleString('en-IN')],
                ['Total Orders', totalOrders.toLocaleString('en-IN')],
                ['Average Order Value', `₹${avgOrderValue.toLocaleString('en-IN')}`],
                ['Top Product', topProducts[0]?.name || 'N/A'],
                ['Top Product Sales', topProducts[0]?.quantity || 0],
                [''],
                ['DAILY BREAKDOWN'],
                ['Date', 'Day', 'Revenue (₹)', 'Quantity', 'Orders', 'Avg Order Value (₹)'],
                ...salesData.map(day => {
                    const date = new Date(day.date);
                    const dayOfWeek = date.toLocaleDateString('en-IN', { weekday: 'long' });
                    const avgValue = day.orders > 0 ? day.revenue / day.orders : 0;
                    return [
                        date.toLocaleDateString('en-IN'),
                        dayOfWeek,
                        day.revenue,
                        day.quantity,
                        day.orders,
                        avgValue.toFixed(2)
                    ];
                })
            ];
            
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            summarySheet['!cols'] = [{ width: 20 }, { width: 20 }, { width: 15 }, { width: 12 }, { width: 10 }, { width: 18 }];
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Category Summary');
            
            // Top Products Sheet
            if (topProducts.length > 0) {
                const productsData = [
                    [`TOP PRODUCTS - ${categoryName.toUpperCase()}`],
                    ['Period:', periodLabel],
                    [''],
                    ['Rank', 'Product Name', 'Quantity Sold', 'Revenue (₹)', 'Avg Price (₹)', '% of Total Revenue'],
                    ...topProducts.map((product, index) => {
                        const avgPrice = product.quantity > 0 ? product.revenue / product.quantity : 0;
                        const revenuePercent = totalRevenue > 0 ? (product.revenue / totalRevenue) * 100 : 0;
                        return [
                            index + 1,
                            product.name,
                            product.quantity,
                            product.revenue,
                            avgPrice.toFixed(2),
                            `${revenuePercent.toFixed(1)}%`
                        ];
                    })
                ];
                
                const productsSheet = XLSX.utils.aoa_to_sheet(productsData);
                productsSheet['!cols'] = [{ width: 8 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 18 }];
                XLSX.utils.book_append_sheet(workbook, productsSheet, 'Top Products');
            }
            
            // Category Comparison Sheet
            if (comparisonData.length > 0) {
                const comparisonSheetData = [
                    ['CATEGORY COMPARISON'],
                    ['Period:', periodLabel],
                    [''],
                    ['Rank', 'Category', 'Revenue (₹)', 'Quantity', 'Orders', 'Top Product', 'Market Share (%)'],
                    ...comparisonData.map((category, index) => {
                        const marketShare = comparisonData.reduce((sum, c) => sum + c.revenue, 0);
                        const share = marketShare > 0 ? (category.revenue / marketShare) * 100 : 0;
                        return [
                            index + 1,
                            category.name,
                            category.revenue,
                            category.quantity,
                            category.orders,
                            category.topProduct?.name || 'N/A',
                            `${share.toFixed(1)}%`
                        ];
                    })
                ];
                
                const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonSheetData);
                comparisonSheet['!cols'] = [{ width: 8 }, { width: 20 }, { width: 15 }, { width: 12 }, { width: 10 }, { width: 20 }, { width: 15 }];
                XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'Category Comparison');
            }
            
            // Generate and download file
            const fileName = `category-report-${categoryName.toLowerCase().replace(/\s+/g, '-')}-${period}-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            
            showToast('Excel file downloaded successfully', 'success');
        } catch (error) {
            console.error('Error generating Excel file:', error);
            showToast('Failed to generate Excel file, falling back to CSV', 'warning');
            exportToCSV(categoryName, periodLabel);
        }
    };

    const exportToCSV = (categoryName, periodLabel) => {
        let csvContent = "data:text/csv;charset=utf-8,";
        
        csvContent += `CATEGORY REPORT - ${categoryName.toUpperCase()}\n`;
        csvContent += `Period,${periodLabel}\n`;
    csvContent += `Generated on,${new Date().toLocaleDateString('en-GB')}\n\n`;
        
        csvContent += "SUMMARY METRICS\n";
        csvContent += `Total Revenue,${salesData.reduce((sum, day) => sum + day.revenue, 0)}\n`;
        csvContent += `Total Quantity Sold,${salesData.reduce((sum, day) => sum + day.quantity, 0)}\n`;
        csvContent += `Total Orders,${salesData.reduce((sum, day) => sum + day.orders, 0)}\n\n`;
        
        csvContent += "DAILY SALES\n";
        csvContent += "Date,Revenue,Quantity,Orders\n";
        salesData.forEach(day => {
            csvContent += `${new Date(day.date).toLocaleDateString('en-GB')},${day.revenue},${day.quantity},${day.orders}\n`;
        });
        
        csvContent += "\nTOP PRODUCTS\n";
        csvContent += "Product Name,Quantity Sold,Revenue\n";
        topProducts.forEach(product => {
            csvContent += `${product.name},${product.quantity},${product.revenue}\n`;
        });
        
        // Download CSV
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `category-report-${categoryName.toLowerCase().replace(/\s+/g, '-')}-${period}-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('CSV file downloaded successfully', 'success');
    };

    const exportToPDF = (categoryName, periodLabel) => {
        const totalRevenue = salesData.reduce((sum, day) => sum + day.revenue, 0);
        const totalQuantity = salesData.reduce((sum, day) => sum + day.quantity, 0);
        const totalOrders = salesData.reduce((sum, day) => sum + day.orders, 0);
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Category Report - ${categoryName}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; line-height: 1.6; }
                h1 { color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
                h2 { color: #374151; margin-top: 30px; margin-bottom: 15px; border-left: 4px solid #ef4444; padding-left: 10px; }
                .header { text-align: center; margin-bottom: 30px; }
                .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .summary-card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; background: #f9fafb; }
                .metric-value { font-size: 24px; font-weight: bold; color: #111827; }
                .metric-label { color: #6b7280; font-size: 14px; margin-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
                th { background-color: #f3f4f6; font-weight: bold; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
                @media print { body { margin: 0; } .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Category Report - ${categoryName}</h1>
                <p><strong>Period:</strong> ${periodLabel} | <strong>Generated on:</strong> ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Revenue</div>
                    <div class="metric-value">₹${totalRevenue.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Quantity Sold</div>
                    <div class="metric-value">${totalQuantity.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Orders</div>
                    <div class="metric-value">${totalOrders.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Order Value</div>
                    <div class="metric-value">₹${avgOrderValue.toLocaleString('en-IN')}</div>
                </div>
            </div>

            <h2>Top Products in ${categoryName}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Product Name</th>
                        <th>Quantity Sold</th>
                        <th>Revenue</th>
                        <th>Avg Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${topProducts.map((product, index) => {
                        const avgPrice = product.quantity > 0 ? product.revenue / product.quantity : 0;
                        return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${product.name}</td>
                            <td>${product.quantity}</td>
                            <td>₹${product.revenue.toLocaleString('en-IN')}</td>
                            <td>₹${avgPrice.toLocaleString('en-IN')}</td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>

            <h2>Daily Sales Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Revenue</th>
                        <th>Quantity</th>
                        <th>Orders</th>
                        <th>Avg Order Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${salesData.map(day => {
                        const date = new Date(day.date);
                        const dayOfWeek = date.toLocaleDateString('en-IN', { weekday: 'long' });
                        const avgValue = day.orders > 0 ? day.revenue / day.orders : 0;
                        return `
                        <tr>
                            <td>${date.toLocaleDateString('en-IN')}</td>
                            <td>${dayOfWeek}</td>
                            <td>₹${day.revenue.toLocaleString('en-IN')}</td>
                            <td>${day.quantity}</td>
                            <td>${day.orders}</td>
                            <td>₹${avgValue.toLocaleString('en-IN')}</td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
            
            <div class="footer">
                <p>Generated by Liquid POS - Category Reports System</p>
            </div>
        </body>
        </html>
        `;

        // Create and use iframe for printing
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

            showToast('PDF generation initiated', 'success');
        } catch (error) {
            console.error('Error generating PDF:', error);
            showToast('Failed to generate PDF', 'error');
        }
    };

    // Format currency
    const formatCurrency = (amount) => {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return '₹0';
        }
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    // Create sales chart
    useEffect(() => {
        if (salesData.length > 0 && canvasRef.current) {
            if (chartRef.current) {
                chartRef.current.destroy();
            }

            const ctx = canvasRef.current.getContext('2d');
            chartRef.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: salesData.map(day => new Date(day.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })),
                    datasets: [{
                        label: 'Revenue (₹)',
                        data: salesData.map(day => day.revenue),
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }, {
                        label: 'Quantity',
                        data: salesData.map(day => day.quantity),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Date'
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Revenue (₹)'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Quantity'
                            },
                            grid: {
                                drawOnChartArea: false,
                            }
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
    }, [salesData]);

    // Create comparison chart
    useEffect(() => {
        if (comparisonData.length > 0 && comparisonCanvasRef.current) {
            if (comparisonChartRef.current) {
                comparisonChartRef.current.destroy();
            }

            const ctx = comparisonCanvasRef.current.getContext('2d');
            comparisonChartRef.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: comparisonData.map(cat => cat.name),
                    datasets: [{
                        label: 'Revenue (₹)',
                        data: comparisonData.map(cat => cat.revenue),
                        backgroundColor: 'rgba(239, 68, 68, 0.8)',
                        borderColor: '#ef4444',
                        borderWidth: 1
                    }, {
                        label: 'Quantity',
                        data: comparisonData.map(cat => cat.quantity),
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: '#3b82f6',
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
                            title: {
                                display: true,
                                text: 'Revenue (₹)'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Quantity'
                            },
                            grid: {
                                drawOnChartArea: false,
                            }
                        }
                    }
                }
            });
        }

        return () => {
            if (comparisonChartRef.current) {
                comparisonChartRef.current.destroy();
            }
        };
    }, [comparisonData]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Category Reports</h2>
                    <p className="text-gray-600">Detailed analysis of category-wise sales performance</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <select 
                        value={selectedCategory} 
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                        <option value="">Select Category</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                    
                    <select 
                        value={period} 
                        onChange={(e) => setPeriod(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                        {periodOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => exportData('excel')}
                            disabled={!selectedCategory || isExporting}
                            className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <i className="ph ph-file-xls text-sm"></i>
                            Excel
                        </button>
                        <button 
                            onClick={() => exportData('pdf')}
                            disabled={!selectedCategory || isExporting}
                            className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <i className="ph ph-file-pdf text-sm"></i>
                            PDF
                        </button>
                    </div>
                </div>
            </div>

            {selectedCategory ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Total Revenue</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(salesData.reduce((sum, day) => sum + day.revenue, 0))}
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
                                    <p className="text-sm text-gray-600">Total Quantity</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {salesData.reduce((sum, day) => sum + day.quantity, 0).toLocaleString()}
                                    </p>
                                </div>
                                <div className="p-3 bg-blue-50 rounded-full">
                                    <i className="ph ph-package text-blue-500 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Total Orders</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {salesData.reduce((sum, day) => sum + day.orders, 0).toLocaleString()}
                                    </p>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-full">
                                    <i className="ph ph-shopping-cart text-purple-500 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Top Product</p>
                                    <p className="text-lg font-bold text-gray-900">
                                        {topProducts[0]?.name || 'No data'}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        {topProducts[0] ? `${topProducts[0].quantity} sold` : ''}
                                    </p>
                                </div>
                                <div className="p-3 bg-orange-50 rounded-full">
                                    <i className="ph ph-crown text-orange-500 text-xl"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sales Chart */}
                    {salesData.length > 0 && (
                        <div className="bg-white p-6 rounded-lg shadow-sm border">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                                Sales Trend - {categories.find(c => c.id === selectedCategory)?.name}
                            </h3>
                            <div className="h-64">
                                <canvas ref={canvasRef} className="w-full h-full"></canvas>
                            </div>
                        </div>
                    )}

                    {/* Top Products */}
                    {topProducts.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm border">
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-semibold text-gray-800">
                                    Top Products in {categories.find(c => c.id === selectedCategory)?.name}
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity Sold</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Price</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {topProducts.map((product, index) => {
                                            const avgPrice = product.quantity > 0 ? product.revenue / product.quantity : 0;
                                            return (
                                                <tr key={product.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full">
                                                            <span className="text-sm font-medium text-gray-600">{index + 1}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {product.quantity} units
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {formatCurrency(product.revenue)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {formatCurrency(avgPrice)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                            <div 
                                                                className="bg-red-500 h-2 rounded-full" 
                                                                style={{ 
                                                                    width: `${topProducts.length > 0 ? (product.quantity / topProducts[0].quantity) * 100 : 0}%` 
                                                                }}
                                                            ></div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
                    <i className="ph ph-chart-pie text-gray-400 text-6xl mb-4"></i>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Category</h3>
                    <p className="text-gray-500">Choose a category from the dropdown to view detailed reports</p>
                </div>
            )}

            {/* Category Comparison Chart */}
            {comparisonData.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Category Comparison</h3>
                    <div className="h-64">
                        <canvas ref={comparisonCanvasRef} className="w-full h-full"></canvas>
                    </div>
                </div>
            )}

            {/* Category Comparison Table */}
            {comparisonData.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-6 border-b">
                        <h3 className="text-lg font-semibold text-gray-800">Category Comparison</h3>
                        <p className="text-gray-600">Compare performance across all categories for {periodOptions.find(p => p.value === period)?.label}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Top Product</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market Share</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {comparisonData.map((category, index) => {
                                    const totalMarketRevenue = comparisonData.reduce((sum, c) => sum + c.revenue, 0);
                                    const marketShare = totalMarketRevenue > 0 ? (category.revenue / totalMarketRevenue) * 100 : 0;
                                    return (
                                        <tr key={category.name} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full">
                                                    <span className="text-sm font-medium text-gray-600">{index + 1}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{category.name}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatCurrency(category.revenue)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {category.quantity.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {category.orders}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {category.topProduct?.name || 'N/A'}
                                                {category.topProduct?.quantity && (
                                                    <div className="text-xs text-gray-400">
                                                        {category.topProduct.quantity} sold
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <span className="text-sm text-gray-900 mr-2">
                                                        {marketShare.toFixed(1)}%
                                                    </span>
                                                    <div className="w-16 bg-gray-200 rounded-full h-2">
                                                        <div 
                                                            className="bg-blue-500 h-2 rounded-full" 
                                                            style={{ 
                                                                width: `${marketShare}%` 
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
