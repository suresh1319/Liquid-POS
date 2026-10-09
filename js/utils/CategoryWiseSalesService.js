import { sdk } from '../sdk.js';
import { FinancialYearUtils } from './FinancialYearUtils.js';
import { PassbookCalculator } from './PassbookCalculator.js'; // Add this import

export class CategoryWiseSalesService {
    /**
     * Calculate order total (same as other services for consistency)
     * @param {Object} order - Order data
     * @returns {number} Order total
     */
    static calculateOrderTotal(order) {
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
    }

    /**
     * Determine order source/channel from order data
     * @param {Object} order - Order data
     * @returns {string} Order channel
     */
    static getOrderChannel(order) {
        const source = (order.source || '').toLowerCase();
        const priceVariant = (order.priceVariant || '').toLowerCase();
        const tableId = (order.tableId || '').toLowerCase();

        // Check for online delivery platforms first
        if (source === 'zomato' || priceVariant === 'zomato' || tableId === 'zomato') {
            return 'Zomato';
        }
        if (source === 'swiggy' || priceVariant === 'swiggy' || tableId === 'swiggy') {
            return 'Swiggy';
        }
        
        // Check for online orders
        if (order.isOnline || priceVariant === 'online') {
            return 'Online';
        }
        
        // Check for dine-in (table orders)
        if (order.tableId && order.tableId.startsWith('Table')) {
            return 'Dine-In';
        }
        
        // Check for takeaway
        if (priceVariant === 'takeaway') {
            return 'Takeaway';
        }
        
        // Default to In-store
        return 'In-Store';
    }

    /**
     * Determine payment method from order data
     * @param {Object} order - Order data
     * @returns {string} Payment method
     */
    static getPaymentMethod(order) {
        const payMode = order.payMode || 'CASH';
        
        switch (payMode) {
            case 'DIGITAL':
                return 'UPI/Card';
            case 'CREDIT':
                return 'Credit';
            case 'CASH':
            default:
                return 'Cash';
        }
    }

    /**
     * Fetch category-wise sales data for a specific financial year
     * @param {string} financialYear - Financial year string (e.g., "2024-25")
     * @returns {Promise<Object>} Sales data by channels and payment methods
     */
    static async fetchCategoryWiseSales(financialYear) {
        try {
            console.log('[CategoryWiseSalesService] Fetching for FY:', financialYear);
            
            const { start, end } = FinancialYearUtils.getFinancialYearDateRange(financialYear);
            
            console.log('[CategoryWiseSalesService] Date range:', { start, end });

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
            const orders = passbookData.orders.filter(order => orderIds.has(order.id));

            console.log('[CategoryWiseSalesService] Completed orders found:', orders.length);

            // Initialize data structures
            const channelData = {};
            const paymentData = {};
            const combinedData = {}; // Channel + Payment combination

            let totalRevenue = 0;
            let totalOrders = 0;

            // Process each order
            orders.forEach(order => {
                if (!order.items || !Array.isArray(order.items)) return;

                // Calculate order total (like passbook does)
                const orderTotal = this.calculateOrderTotal(order);
                
                // Get channel and payment method
                const channel = this.getOrderChannel(order);
                const paymentMethod = this.getPaymentMethod(order);
                
                // Update totals
                totalRevenue += orderTotal;
                totalOrders += 1;

                // Update channel data
                if (!channelData[channel]) {
                    channelData[channel] = {
                        channel,
                        revenue: 0,
                        orders: 0,
                        percentage: 0
                    };
                }
                channelData[channel].revenue += orderTotal;
                channelData[channel].orders += 1;

                // Update payment data
                if (!paymentData[paymentMethod]) {
                    paymentData[paymentMethod] = {
                        paymentMethod,
                        revenue: 0,
                        orders: 0,
                        percentage: 0
                    };
                }
                paymentData[paymentMethod].revenue += orderTotal;
                paymentData[paymentMethod].orders += 1;

                // Update combined data (channel + payment)
                const combinedKey = `${channel}_${paymentMethod}`;
                if (!combinedData[combinedKey]) {
                    combinedData[combinedKey] = {
                        channel,
                        paymentMethod,
                        revenue: 0,
                        orders: 0
                    };
                }
                combinedData[combinedKey].revenue += orderTotal;
                combinedData[combinedKey].orders += 1;
            });

            // Calculate percentages for channels
            Object.values(channelData).forEach(item => {
                item.percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                item.averageOrderValue = item.orders > 0 ? item.revenue / item.orders : 0;
            });

            // Calculate percentages for payment methods
            Object.values(paymentData).forEach(item => {
                item.percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                item.averageOrderValue = item.orders > 0 ? item.revenue / item.orders : 0;
            });

            // Sort by revenue
            const sortedChannels = Object.values(channelData).sort((a, b) => b.revenue - a.revenue);
            const sortedPayments = Object.values(paymentData).sort((a, b) => b.revenue - a.revenue);
            const sortedCombined = Object.values(combinedData).sort((a, b) => b.revenue - a.revenue);

            const result = {
                financialYear,
                totalRevenue,
                totalOrders,
                averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
                channels: sortedChannels,
                paymentMethods: sortedPayments,
                combinedData: sortedCombined
            };

            console.log('[CategoryWiseSalesService] Processed data for FY', financialYear, ':', result);
            
            return result;
            
        } catch (error) {
            console.error('Error fetching category-wise sales for FY', financialYear, ':', error);
            return {
                financialYear,
                totalRevenue: 0,
                totalOrders: 0,
                averageOrderValue: 0,
                channels: [],
                paymentMethods: [],
                combinedData: []
            };
        }
    }

    /**
     * Fetch category-wise sales data for a specific date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} Sales data by channels and payment methods
     */
    static async fetchCategoryWiseSalesForDateRange(startDate, endDate) {
        try {
            console.log('[CategoryWiseSalesService] Fetching for date range:', { startDate, endDate });

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
            const orders = passbookData.orders.filter(order => orderIds.has(order.id));

            console.log('[CategoryWiseSalesService] Completed orders found:', orders.length);

            // Initialize data structures
            const channelData = {};
            const paymentData = {};
            const combinedData = {}; // Channel + Payment combination

            let totalRevenue = 0;
            let totalOrders = 0;

            // Process each order
            orders.forEach(order => {
                if (!order.items || !Array.isArray(order.items)) return;

                // Calculate order total (like passbook does)
                const orderTotal = this.calculateOrderTotal(order);
                
                // Get channel and payment method
                const channel = this.getOrderChannel(order);
                const paymentMethod = this.getPaymentMethod(order);
                
                // Update totals
                totalRevenue += orderTotal;
                totalOrders += 1;

                // Update channel data
                if (!channelData[channel]) {
                    channelData[channel] = {
                        channel,
                        revenue: 0,
                        orders: 0,
                        percentage: 0
                    };
                }
                channelData[channel].revenue += orderTotal;
                channelData[channel].orders += 1;

                // Update payment data
                if (!paymentData[paymentMethod]) {
                    paymentData[paymentMethod] = {
                        paymentMethod,
                        revenue: 0,
                        orders: 0,
                        percentage: 0
                    };
                }
                paymentData[paymentMethod].revenue += orderTotal;
                paymentData[paymentMethod].orders += 1;

                // Update combined data (channel + payment)
                const combinedKey = `${channel}_${paymentMethod}`;
                if (!combinedData[combinedKey]) {
                    combinedData[combinedKey] = {
                        channel,
                        paymentMethod,
                        revenue: 0,
                        orders: 0
                    };
                }
                combinedData[combinedKey].revenue += orderTotal;
                combinedData[combinedKey].orders += 1;
            });

            // Calculate percentages for channels
            Object.values(channelData).forEach(item => {
                item.percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                item.averageOrderValue = item.orders > 0 ? item.revenue / item.orders : 0;
            });

            // Calculate percentages for payment methods
            Object.values(paymentData).forEach(item => {
                item.percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                item.averageOrderValue = item.orders > 0 ? item.revenue / item.orders : 0;
            });

            // Sort by revenue
            const sortedChannels = Object.values(channelData).sort((a, b) => b.revenue - a.revenue);
            const sortedPayments = Object.values(paymentData).sort((a, b) => b.revenue - a.revenue);
            const sortedCombined = Object.values(combinedData).sort((a, b) => b.revenue - a.revenue);

            const result = {
                startDate,
                endDate,
                totalRevenue,
                totalOrders,
                averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
                channels: sortedChannels,
                paymentMethods: sortedPayments,
                combinedData: sortedCombined
            };

            console.log('[CategoryWiseSalesService] Processed data for date range:', result);
            
            return result;
            
        } catch (error) {
            console.error('Error fetching category-wise sales for date range:', { startDate, endDate }, error);
            return {
                startDate,
                endDate,
                totalRevenue: 0,
                totalOrders: 0,
                averageOrderValue: 0,
                channels: [],
                paymentMethods: [],
                combinedData: []
            };
        }
    }

    /**
     * Fetch category-wise sales based on filter type
     * @param {string} filterType - Filter type (today, yesterday, last7, last30, last90, custom)
     * @param {Object} customDateRange - Custom date range { start, end }
     * @returns {Promise<Object>} Sales data by channels and payment methods
     */
    static async fetchCategoryWiseSalesByFilter(filterType, customDateRange = null) {
        // Use PassbookCalculator to get the exact same date ranges as passbook
        const dateRange = PassbookCalculator.getDateRange(filterType, customDateRange);
        
        if (!dateRange.start || !dateRange.end) {
            // Default to last 7 days if date range is invalid
            const now = new Date();
            dateRange.start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateRange.end = now;
        }
        
        return await this.fetchCategoryWiseSalesForDateRange(dateRange.start, dateRange.end);
    }

    /**
     * Fetch category-wise sales for multiple financial years
     * @param {number} previousYears - Number of previous years to include (default: 2)
     * @returns {Promise<Object>} Object with data for each financial year
     */
    static async fetchMultiYearCategoryWiseSales(previousYears = 2) {
        try {
            const financialYears = FinancialYearUtils.getFinancialYearsList(previousYears);
            const results = {};

            // Fetch data for each financial year
            for (const fy of financialYears) {
                results[fy] = await this.fetchCategoryWiseSales(fy);
            }

            return results;
            
        } catch (error) {
            console.error('Error fetching multi-year category-wise sales:', error);
            return {};
        }
    }

    /**
     * Get aggregated category-wise sales across multiple financial years
     * @param {number} previousYears - Number of previous years to include (default: 2)
     * @returns {Promise<Object>} Aggregated sales data
     */
    static async fetchAggregatedCategoryWiseSales(previousYears = 2) {
        try {
            const financialYears = FinancialYearUtils.getFinancialYearsList(previousYears);

            // Use PassbookCalculator to fetch data consistently with passbook
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Get date range covering all financial years
            const allRanges = FinancialYearUtils.getMultipleFinancialYearRanges(financialYears);
            const overallStart = allRanges[allRanges.length - 1].start; // Earliest start
            const overallEnd = allRanges[0].end; // Latest end

            console.log('[CategoryWiseSalesService] Aggregating for date range:', { overallStart, overallEnd });
            
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
            const orders = passbookData.orders.filter(order => orderIds.has(order.id));

            console.log('[CategoryWiseSalesService] Completed orders:', orders.length);

            // Initialize data structures with yearly breakdown
            const channelData = {};
            const paymentData = {};
            const combinedData = {};
            const yearlyBreakdown = {};

            let totalRevenue = 0;
            let totalOrders = 0;

            // Process each order
            orders.forEach(order => {
                if (!order.items || !Array.isArray(order.items)) return;

                // Convert order.date to proper Date object (same as PassbookCalculator does)
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date || Date.now());
                
                const orderTotal = this.calculateOrderTotal(order);
                const channel = this.getOrderChannel(order);
                const paymentMethod = this.getPaymentMethod(order);
                const orderFY = FinancialYearUtils.getFinancialYear(orderDate); // Use converted date

                // Update totals
                totalRevenue += orderTotal;
                totalOrders += 1;

                // Update channel data
                if (!channelData[channel]) {
                    channelData[channel] = {
                        channel,
                        revenue: 0,
                        orders: 0,
                        percentage: 0,
                        yearlyData: {}
                    };
                }
                channelData[channel].revenue += orderTotal;
                channelData[channel].orders += 1;

                // Track yearly data for channels
                if (!channelData[channel].yearlyData[orderFY]) {
                    channelData[channel].yearlyData[orderFY] = { revenue: 0, orders: 0 };
                }
                channelData[channel].yearlyData[orderFY].revenue += orderTotal;
                channelData[channel].yearlyData[orderFY].orders += 1;

                // Update payment data
                if (!paymentData[paymentMethod]) {
                    paymentData[paymentMethod] = {
                        paymentMethod,
                        revenue: 0,
                        orders: 0,
                        percentage: 0,
                        yearlyData: {}
                    };
                }
                paymentData[paymentMethod].revenue += orderTotal;
                paymentData[paymentMethod].orders += 1;

                // Track yearly data for payment methods
                if (!paymentData[paymentMethod].yearlyData[orderFY]) {
                    paymentData[paymentMethod].yearlyData[orderFY] = { revenue: 0, orders: 0 };
                }
                paymentData[paymentMethod].yearlyData[orderFY].revenue += orderTotal;
                paymentData[paymentMethod].yearlyData[orderFY].orders += 1;

                // Track yearly breakdown
                if (!yearlyBreakdown[orderFY]) {
                    yearlyBreakdown[orderFY] = { revenue: 0, orders: 0 };
                }
                yearlyBreakdown[orderFY].revenue += orderTotal;
                yearlyBreakdown[orderFY].orders += 1;
            });

            // Calculate percentages and metrics
            Object.values(channelData).forEach(item => {
                item.percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                item.averageOrderValue = item.orders > 0 ? item.revenue / item.orders : 0;
            });

            Object.values(paymentData).forEach(item => {
                item.percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                item.averageOrderValue = item.orders > 0 ? item.revenue / item.orders : 0;
            });

            // Sort by revenue
            const sortedChannels = Object.values(channelData).sort((a, b) => b.revenue - a.revenue);
            const sortedPayments = Object.values(paymentData).sort((a, b) => b.revenue - a.revenue);

            const result = {
                financialYears,
                totalRevenue,
                totalOrders,
                averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
                channels: sortedChannels,
                paymentMethods: sortedPayments,
                yearlyBreakdown,
                summary: {
                    topChannel: sortedChannels[0]?.channel || 'N/A',
                    topChannelRevenue: sortedChannels[0]?.revenue || 0,
                    topPaymentMethod: sortedPayments[0]?.paymentMethod || 'N/A',
                    topPaymentRevenue: sortedPayments[0]?.revenue || 0
                }
            };

            console.log('[CategoryWiseSalesService] Aggregated data:', result);

            return result;
            
        } catch (error) {
            // Fixed potential typo in console.error
            console.error('Error fetching aggregated category-wise sales:', error);
            return {
                financialYears: FinancialYearUtils.getFinancialYearsList(previousYears),
                totalRevenue: 0,
                totalOrders: 0,
                averageOrderValue: 0,
                channels: [],
                paymentMethods: [],
                yearlyBreakdown: {},
                summary: {
                    topChannel: 'N/A',
                    topChannelRevenue: 0,
                    topPaymentMethod: 'N/A',
                    topPaymentRevenue: 0
                }
            };
        }
    }

    /**
     * Get comprehensive category-wise sales report
     * @returns {Promise<Object>} Comprehensive report with current year, historical, and aggregated data
     */
    static async getCategoryWiseSalesReport() {
        try {
            const [
                multiYearData,
                aggregatedData
            ] = await Promise.all([
                this.fetchMultiYearCategoryWiseSales(2),
                this.fetchAggregatedCategoryWiseSales(2)
            ]);

            const financialYears = FinancialYearUtils.getFinancialYearsList(2);
            const currentFY = financialYears[0];

            return {
                currentFinancialYear: currentFY,
                financialYears,
                yearlyData: multiYearData,
                aggregatedData,
                summary: {
                    totalRevenue: aggregatedData.totalRevenue,
                    totalOrders: aggregatedData.totalOrders,
                    averageOrderValue: aggregatedData.averageOrderValue,
                    topChannel: aggregatedData.summary.topChannel,
                    topPaymentMethod: aggregatedData.summary.topPaymentMethod,
                    channelCount: aggregatedData.channels.length,
                    paymentMethodCount: aggregatedData.paymentMethods.length
                }
            };
            
        } catch (error) {
            console.error('Error generating category-wise sales report:', error);
            return {
                currentFinancialYear: FinancialYearUtils.getCurrentFinancialYear(),
                financialYears: FinancialYearUtils.getFinancialYearsList(2),
                yearlyData: {},
                aggregatedData: {
                    financialYears: [],
                    totalRevenue: 0,
                    totalOrders: 0,
                    averageOrderValue: 0,
                    channels: [],
                    paymentMethods: [],
                    yearlyBreakdown: {},
                    summary: {
                        topChannel: 'N/A',
                        topChannelRevenue: 0,
                        topPaymentMethod: 'N/A',
                        topPaymentRevenue: 0
                    }
                },
                summary: {
                    totalRevenue: 0,
                    totalOrders: 0,
                    averageOrderValue: 0,
                    topChannel: 'N/A',
                    topPaymentMethod: 'N/A',
                    channelCount: 0,
                    paymentMethodCount: 0
                }
            };
        }
    }
}