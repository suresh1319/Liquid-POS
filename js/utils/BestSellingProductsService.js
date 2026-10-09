import { sdk } from '../sdk.js';
import { FinancialYearUtils } from './FinancialYearUtils.js';
import { PassbookCalculator } from './PassbookCalculator.js'; // Add this import

export class BestSellingProductsService {
    /**
     * Fetch best selling products for a specific financial year
     * @param {string} financialYear - Financial year string (e.g., "2024-25")
     * @param {number} limit - Number of top products to return (default: 10)
     * @returns {Promise<Array>} Array of top selling products
     */
    static async fetchBestSellingProducts(financialYear, limit = 10) {
        try {
            console.log('[BestSellingProductsService] Fetching for FY:', financialYear);
            
            const { start, end } = FinancialYearUtils.getFinancialYearDateRange(financialYear);
            
            console.log('[BestSellingProductsService] Date range:', { start, end });
            
            // Use PassbookCalculator to fetch data consistently with passbook
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions for the financial year using PassbookCalculator
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
                // Only include completed orders
                const isCompleted = order.currentStatus?.label === 'COMPLETED' || order.paid === true || !order.currentStatus;
                return orderIds.has(order.id) && isCompleted;
            });

            // Fetch all products for mapping - use "Product" collection (not "Product")
            const productsSnapshot = await sdk.db.collection("Product").get();
            const products = {};
            productsSnapshot.docs.forEach(doc => {
                const productData = doc.data();
                products[doc.id] = {
                    id: doc.id,
                    name: productData.title || productData.name || 'Unknown Product',
                    category: productData.cat || productData.category || 'Unknown',
                    price: productData.price || 0,
                    ...productData
                };
            });

            console.log('[BestSellingProductsService] Products loaded:', Object.keys(products).length);

            // Aggregate product sales data
            const productSales = {};
            
            orders.forEach(order => {
                if (!order.items || !Array.isArray(order.items)) return;
                
                order.items.forEach(item => {
                    if (!item.pid || !products[item.pid]) return;
                    
                    const product = products[item.pid];
                    const quantity = item.qnt || item.quantity || 1; // Check both qnt and quantity
                    const price = item.price || product.price || 0;
                    const revenue = price * quantity;
                    
                    if (!productSales[item.pid]) {
                        productSales[item.pid] = {
                            id: item.pid,
                            name: product.name,
                            category: product.category,
                            totalQuantity: 0,
                            totalRevenue: 0,
                            orderCount: 0,
                            orders: new Set()
                        };
                    }
                    
                    productSales[item.pid].totalQuantity += quantity;
                    productSales[item.pid].totalRevenue += revenue;
                    productSales[item.pid].orders.add(order.id);
                });
            });

            // Convert to array and calculate additional metrics
            const productsArray = Object.values(productSales).map(product => ({
                ...product,
                orderCount: product.orders.size,
                averagePrice: product.totalQuantity > 0 ? product.totalRevenue / product.totalQuantity : 0,
                revenuePerOrder: product.orders.size > 0 ? product.totalRevenue / product.orders.size : 0
            }));

            // Sort by total quantity (most ordered) and take top N
            const topProducts = productsArray
                .sort((a, b) => b.totalQuantity - a.totalQuantity)
                .slice(0, limit);

            console.log('[BestSellingProductsService] Top products for FY', financialYear, ':', topProducts.length);
            
            return topProducts;
            
        } catch (error) {
            console.error('Error fetching best selling products for FY', financialYear, ':', error);
            return [];
        }
    }

    /**
     * Fetch best selling products for a specific date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {number} limit - Number of top products to return (default: 10)
     * @returns {Promise<Array>} Array of top selling products
     */
    static async fetchBestSellingProductsForDateRange(startDate, endDate, limit = 10) {
        try {
            console.log('[BestSellingProductsService] Fetching for date range:', { startDate, endDate });
            
            // Use PassbookCalculator to fetch data consistently with passbook
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions for the date range using PassbookCalculator
            const dateRangeTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: 'custom',
                    customDateRange: { start: startDate, end: endDate },
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders corresponding to these transactions
            const orderIds = new Set(dateRangeTransactions.map(t => t.orderId));
            const orders = passbookData.orders.filter(order => {
                // Only include completed orders
                const isCompleted = order.currentStatus?.label === 'COMPLETED' || order.paid === true || !order.currentStatus;
                return orderIds.has(order.id) && isCompleted;
            });

            console.log('[BestSellingProductsService] Completed orders found:', orders.length);

            // Fetch all products for mapping - use "Product" collection (not "Product")
            const productsSnapshot = await sdk.db.collection("Product").get();
            const products = {};
            productsSnapshot.docs.forEach(doc => {
                const productData = doc.data();
                products[doc.id] = {
                    id: doc.id,
                    name: productData.title || productData.name || 'Unknown Product',
                    category: productData.cat || productData.category || 'Unknown',
                    price: productData.price || 0,
                    ...productData
                };
            });

            console.log('[BestSellingProductsService] Products loaded:', Object.keys(products).length);

            // Aggregate product sales data
            const productSales = {};
            
            orders.forEach(order => {
                if (!order.items || !Array.isArray(order.items)) return;
                
                order.items.forEach(item => {
                    if (!item.pid || !products[item.pid]) return;
                    
                    const product = products[item.pid];
                    const quantity = item.qnt || item.quantity || 1; // Check both qnt and quantity
                    const price = item.price || product.price || 0;
                    const revenue = price * quantity;
                    
                    if (!productSales[item.pid]) {
                        productSales[item.pid] = {
                            id: item.pid,
                            name: product.name,
                            category: product.category,
                            totalQuantity: 0,
                            totalRevenue: 0,
                            orderCount: 0,
                            orders: new Set()
                        };
                    }
                    
                    productSales[item.pid].totalQuantity += quantity;
                    productSales[item.pid].totalRevenue += revenue;
                    productSales[item.pid].orders.add(order.id);
                });
            });

            // Convert to array and calculate additional metrics
            const productsArray = Object.values(productSales).map(product => ({
                ...product,
                orderCount: product.orders.size,
                averagePrice: product.totalQuantity > 0 ? product.totalRevenue / product.totalQuantity : 0,
                revenuePerOrder: product.orders.size > 0 ? product.totalRevenue / product.orders.size : 0
            }));

            // Sort by total quantity (most ordered) and take top N
            const topProducts = productsArray
                .sort((a, b) => b.totalQuantity - a.totalQuantity)
                .slice(0, limit);

            console.log('[BestSellingProductsService] Top products for date range:', topProducts.length);
            
            return topProducts;
            
        } catch (error) {
            console.error('Error fetching best selling products for date range:', { startDate, endDate }, error);
            return [];
        }
    }

    /**
     * Fetch best selling products based on filter type
     * @param {string} filterType - Filter type (today, yesterday, last7, last30, last90, custom)
     * @param {Object} customDateRange - Custom date range { start, end }
     * @param {number} limit - Number of top products to return (default: 10)
     * @returns {Promise<Array>} Array of top selling products
     */
    static async fetchBestSellingProductsByFilter(filterType, customDateRange = null, limit = 10) {
        // Use PassbookCalculator to get the exact same date ranges as passbook
        const dateRange = PassbookCalculator.getDateRange(filterType, customDateRange);
        
        if (!dateRange.start || !dateRange.end) {
            // Default to last 7 days if date range is invalid
            const now = new Date();
            dateRange.start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateRange.end = now;
        }
        
        return await this.fetchBestSellingProductsForDateRange(dateRange.start, dateRange.end, limit);
    }

    /**
     * Fetch best selling products for current and previous financial years
     * @param {number} previousYears - Number of previous years to include (default: 2)
     * @param {number} limit - Number of top products per year (default: 10)
     * @returns {Promise<Object>} Object with data for each financial year
     */
    static async fetchMultiYearBestSellingProducts(previousYears = 2, limit = 10) {
        try {
            const financialYears = FinancialYearUtils.getFinancialYearsList(previousYears);
            const results = {};

            // Fetch data for each financial year
            for (const fy of financialYears) {
                results[fy] = await this.fetchBestSellingProducts(fy, limit);
            }

            return results;
            
        } catch (error) {
            console.error('Error fetching multi-year best selling products:', error);
            return {};
        }
    }

    /**
     * Get aggregated best selling products across multiple financial years
     * @param {number} previousYears - Number of previous years to include (default: 2)
     * @param {number} limit - Number of top products to return (default: 10)
     * @returns {Promise<Array>} Array of top selling products aggregated across years
     */
    static async fetchAggregatedBestSellingProducts(previousYears = 2, limit = 10) {
        try {
            const financialYears = FinancialYearUtils.getFinancialYearsList(previousYears);
            
            // Use PassbookCalculator to fetch data consistently with passbook
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Get date range covering all financial years
            const allRanges = FinancialYearUtils.getMultipleFinancialYearRanges(financialYears);
            const overallStart = allRanges[allRanges.length - 1].start; // Earliest start
            const overallEnd = allRanges[0].end; // Latest end

            console.log('[BestSellingProductsService] Aggregating for date range:', { overallStart, overallEnd });
            
            // Filter transactions for the combined date range using PassbookCalculator
            const aggregatedTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: 'custom',
                    customDateRange: { start: overallStart, end: overallEnd },
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders corresponding to these transactions
            const orderIds = new Set(aggregatedTransactions.map(t => t.orderId));
            const orders = passbookData.orders.filter(order => {
                // Only include completed orders
                const isCompleted = order.currentStatus?.label === 'COMPLETED' || order.paid === true || !order.currentStatus;
                return orderIds.has(order.id) && isCompleted;
            });

            console.log('[BestSellingProductsService] Completed orders:', orders.length);

            // Fetch all products for mapping
            const productsSnapshot = await sdk.db.collection("Product").get();
            const products = {};
            productsSnapshot.docs.forEach(doc => {
                const productData = doc.data();
                products[doc.id] = {
                    id: doc.id,
                    name: productData.title || productData.name || 'Unknown Product',
                    category: productData.cat || productData.category || 'Unknown',
                    price: productData.price || 0,
                    ...productData
                };
            });

            // Aggregate across all years
            const aggregatedSales = {};
            
            orders.forEach(order => {
                if (!order.items || !Array.isArray(order.items)) return;
                
                order.items.forEach(item => {
                    if (!item.pid || !products[item.pid]) return;
                    
                    const product = products[item.pid];
                    const quantity = item.qnt || item.quantity || 1;
                    const price = item.price || product.price || 0;
                    const revenue = price * quantity;
                    
                    if (!aggregatedSales[item.pid]) {
                        aggregatedSales[item.pid] = {
                            id: item.pid,
                            name: product.name,
                            category: product.category,
                            totalQuantity: 0,
                            totalRevenue: 0,
                            orders: new Set(),
                            yearlyData: {}
                        };
                    }
                    
                    aggregatedSales[item.pid].totalQuantity += quantity;
                    aggregatedSales[item.pid].totalRevenue += revenue;
                    aggregatedSales[item.pid].orders.add(order.id);

                    // Convert order.date to proper Date object (same as PassbookCalculator does)
                    const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now());
                    
                    // Track by financial year
                    const orderFY = FinancialYearUtils.getFinancialYear(orderDate);
                    if (!aggregatedSales[item.pid].yearlyData[orderFY]) {
                        aggregatedSales[item.pid].yearlyData[orderFY] = {
                            quantity: 0,
                            revenue: 0,
                            orders: new Set()
                        };
                    }
                    aggregatedSales[item.pid].yearlyData[orderFY].quantity += quantity;
                    aggregatedSales[item.pid].yearlyData[orderFY].revenue += revenue;
                    aggregatedSales[item.pid].yearlyData[orderFY].orders.add(order.id);
                });
            });

            // Convert to array and calculate metrics
            const productsArray = Object.values(aggregatedSales).map(product => ({
                ...product,
                orderCount: product.orders.size,
                averagePrice: product.totalQuantity > 0 ? product.totalRevenue / product.totalQuantity : 0,
                revenuePerOrder: product.orders.size > 0 ? product.totalRevenue / product.orders.size : 0,
                // Calculate yearly metrics
                yearlyMetrics: Object.keys(product.yearlyData).map(fy => ({
                    financialYear: fy,
                    quantity: product.yearlyData[fy].quantity,
                    revenue: product.yearlyData[fy].revenue,
                    orderCount: product.yearlyData[fy].orders.size
                }))
            }));

            // Sort by total quantity and take top N
            const topProducts = productsArray
                .sort((a, b) => b.totalQuantity - a.totalQuantity)
                .slice(0, limit);

            console.log('[BestSellingProductsService] Aggregated top products:', topProducts.length);

            return topProducts;
            
        } catch (error) {
            console.error('Error fetching aggregated best selling products:', error);
            return [];
        }
    }

    /**
     * Get comprehensive best selling products report
     * @param {number} limit - Number of top products (default: 10)
     * @returns {Promise<Object>} Comprehensive report with current year, historical, and aggregated data
     */
    static async getBestSellingProductsReport(limit = 10) {
        try {
            const [
                multiYearData,
                aggregatedData
            ] = await Promise.all([
                this.fetchMultiYearBestSellingProducts(2, limit),
                this.fetchAggregatedBestSellingProducts(2, limit)
            ]);

            const financialYears = FinancialYearUtils.getFinancialYearsList(2);
            const currentFY = financialYears[0];

            return {
                currentFinancialYear: currentFY,
                financialYears,
                yearlyData: multiYearData,
                aggregatedData,
                summary: {
                    totalUniqueProducts: aggregatedData.length,
                    totalQuantitySold: aggregatedData.reduce((sum, p) => sum + p.totalQuantity, 0),
                    totalRevenue: aggregatedData.reduce((sum, p) => sum + p.totalRevenue, 0),
                    averageRevenuePerProduct: aggregatedData.length > 0 
                        ? aggregatedData.reduce((sum, p) => sum + p.totalRevenue, 0) / aggregatedData.length 
                        : 0
                }
            };
            
        } catch (error) {
            console.error('Error generating best selling products report:', error);
            return {
                currentFinancialYear: FinancialYearUtils.getCurrentFinancialYear(),
                financialYears: FinancialYearUtils.getFinancialYearsList(2),
                yearlyData: {},
                aggregatedData: [],
                summary: {
                    totalUniqueProducts: 0,
                    totalQuantitySold: 0,
                    totalRevenue: 0,
                    averageRevenuePerProduct: 0
                }
            };
        }
    }
}