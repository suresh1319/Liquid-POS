import { sdk } from '../sdk.js';
import { FinancialYearUtils } from './FinancialYearUtils.js';
import { PassbookCalculator } from './PassbookCalculator.js';

export class SalesSummaryService {
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
     * Get payment method from order
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
     * Determine order channel from order data
     * @param {Object} order - Order data
     * @returns {string} Order channel
     */
    static getOrderChannel(order) {
        const source = (order.source || '').toLowerCase();
        const priceVariant = (order.priceVariant || '').toLowerCase();
        const tableId = (order.tableId || '').toLowerCase();

        if (source === 'zomato' || priceVariant === 'zomato' || tableId === 'zomato') {
            return 'Zomato';
        }
        if (source === 'swiggy' || priceVariant === 'swiggy' || tableId === 'swiggy') {
            return 'Swiggy';
        }
        if (order.isOnline || priceVariant === 'online') {
            return 'Online';
        }
        if (order.tableId && order.tableId.startsWith('Table')) {
            return 'Dine-In';
        }
        if (priceVariant === 'takeaway') {
            return 'Takeaway';
        }
        
        return 'In-Store';
    }

    /**
     * Get sales summary for a specific financial year
     * @param {string} financialYear - Financial year (e.g., "2024-25")
     * @returns {Promise<Object>} Sales summary data
     */
    static async getSalesSummaryForYear(financialYear) {
        try {
            console.log('[SalesSummaryService] Fetching summary for FY:', financialYear);
            
            const { start, end } = FinancialYearUtils.getFinancialYearDateRange(financialYear);

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
            const orders = passbookData.orders.filter(order => orderIds.has(order.id) && order.currentStatus?.label === 'COMPLETED');

            console.log('[SalesSummaryService] Completed orders:', orders.length);

            // Initialize tracking variables
            let totalRevenue = 0;
            let totalOrders = 0;
            let totalItems = 0;
            let totalDiscounts = 0;
            let totalTaxes = 0;

            const monthlyData = {};
            const paymentMethodData = {};
            const channelData = {};
            const hourlyData = {}; // Track sales by hour of day
            const dayOfWeekData = {}; // Track sales by day of week

            // Initialize monthly data for the financial year
            const monthNames = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
            monthNames.forEach(month => {
                monthlyData[month] = { revenue: 0, orders: 0, items: 0 };
            });

            // Initialize hourly data (0-23 hours)
            for (let hour = 0; hour < 24; hour++) {
                hourlyData[hour] = { revenue: 0, orders: 0 };
            }

            // Initialize day of week data
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            daysOfWeek.forEach(day => {
                dayOfWeekData[day] = { revenue: 0, orders: 0 };
            });

            // Process each order
            orders.forEach(order => {
                // Add safety check for order object
                if (!order) return;
                
                const orderTotal = this.calculateOrderTotal(order);
                // Ensure order.date is properly converted
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date);
                if (isNaN(orderDate.getTime())) {
                    console.warn('[SalesSummaryService] Invalid order date for order:', order.id);
                    return;
                }
                
                const paymentMethod = this.getPaymentMethod(order);
                const channel = this.getOrderChannel(order);

                // Update totals
                totalRevenue += orderTotal;
                totalOrders += 1;

                // Count items
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        totalItems += item.qnt || item.quantity || 1;
                    });
                }

                // Track discounts
                totalDiscounts += order.discount || 0;

                // Track taxes (from charges)
                if (order.charges && Array.isArray(order.charges)) {
                    order.charges.forEach(charge => {
                        if (!charge.inclusive && charge.type === 'percentage') {
                            const taxAmount = (orderTotal * (parseFloat(charge.value) || 0)) / 100;
                            totalTaxes += taxAmount;
                        }
                    });
                }

                // Monthly breakdown (Financial Year: Apr-Mar)
                const month = orderDate.getMonth();
                const fyMonth = month >= 3 ? monthNames[month - 3] : monthNames[month + 9];
                if (monthlyData[fyMonth]) {
                    monthlyData[fyMonth].revenue += orderTotal;
                    monthlyData[fyMonth].orders += 1;
                    monthlyData[fyMonth].items += order.items ? order.items.reduce((sum, item) => sum + (item.qnt || item.quantity || 1), 0) : 0;
                }

                // Hourly breakdown
                const hour = orderDate.getHours();
                hourlyData[hour].revenue += orderTotal;
                hourlyData[hour].orders += 1;

                // Day of week breakdown
                const dayOfWeek = daysOfWeek[orderDate.getDay()];
                dayOfWeekData[dayOfWeek].revenue += orderTotal;
                dayOfWeekData[dayOfWeek].orders += 1;

                // Payment method breakdown
                if (!paymentMethodData[paymentMethod]) {
                    paymentMethodData[paymentMethod] = { revenue: 0, orders: 0 };
                }
                paymentMethodData[paymentMethod].revenue += orderTotal;
                paymentMethodData[paymentMethod].orders += 1;

                // Channel breakdown
                if (!channelData[channel]) {
                    channelData[channel] = { revenue: 0, orders: 0 };
                }
                channelData[channel].revenue += orderTotal;
                channelData[channel].orders += 1;
            });

            // Calculate averages and metrics
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            const avgItemsPerOrder = totalOrders > 0 ? totalItems / totalOrders : 0;
            const discountPercentage = totalRevenue > 0 ? (totalDiscounts / (totalRevenue + totalDiscounts)) * 100 : 0;

            // Find peak sales hour
            const peakHour = Object.keys(hourlyData).reduce((a, b) => 
                hourlyData[a].revenue > hourlyData[b].revenue ? a : b
            );

            // Find best day of week
            const bestDay = Object.keys(dayOfWeekData).reduce((a, b) => 
                dayOfWeekData[a].revenue > dayOfWeekData[b].revenue ? a : b
            );

            // Find best month
            const bestMonth = Object.keys(monthlyData).reduce((a, b) => 
                monthlyData[a].revenue > monthlyData[b].revenue ? a : b
            );

            return {
                financialYear,
                summary: {
                    totalRevenue,
                    totalOrders,
                    totalItems,
                    totalDiscounts,
                    totalTaxes,
                    avgOrderValue,
                    avgItemsPerOrder,
                    discountPercentage,
                    netRevenue: totalRevenue - totalDiscounts
                },
                insights: {
                    peakSalesHour: parseInt(peakHour),
                    peakSalesHourRevenue: hourlyData[peakHour]?.revenue || 0,
                    bestDayOfWeek: bestDay,
                    bestDayRevenue: dayOfWeekData[bestDay]?.revenue || 0,
                    bestMonth,
                    bestMonthRevenue: monthlyData[bestMonth]?.revenue || 0
                },
                breakdowns: {
                    monthly: Object.keys(monthlyData).map(month => ({
                        month,
                        ...monthlyData[month]
                    })),
                    hourly: Object.keys(hourlyData).map(hour => ({
                        hour: parseInt(hour),
                        hourLabel: `${hour}:00`,
                        ...hourlyData[hour]
                    })).sort((a, b) => a.hour - b.hour),
                    dayOfWeek: Object.keys(dayOfWeekData).map(day => ({
                        day,
                        ...dayOfWeekData[day]
                    })),
                    paymentMethods: Object.keys(paymentMethodData).map(method => ({
                        method,
                        ...paymentMethodData[method],
                        percentage: totalRevenue > 0 ? (paymentMethodData[method].revenue / totalRevenue) * 100 : 0
                    })).sort((a, b) => (b.revenue || 0) - (a.revenue || 0)),
                    channels: Object.keys(channelData).map(channel => ({
                        channel,
                        ...channelData[channel],
                        percentage: totalRevenue > 0 ? (channelData[channel].revenue / totalRevenue) * 100 : 0
                    })).sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
                }
            };

        } catch (error) {
            console.error('Error fetching sales summary for FY', financialYear, ':', error);
            return {
                financialYear,
                summary: {
                    totalRevenue: 0,
                    totalOrders: 0,
                    totalItems: 0,
                    totalDiscounts: 0,
                    totalTaxes: 0,
                    avgOrderValue: 0,
                    avgItemsPerOrder: 0,
                    discountPercentage: 0,
                    netRevenue: 0
                },
                insights: {
                    peakSalesHour: 0,
                    peakSalesHourRevenue: 0,
                    bestDayOfWeek: 'Monday',
                    bestDayRevenue: 0,
                    bestMonth: 'Apr',
                    bestMonthRevenue: 0
                },
                breakdowns: {
                    monthly: [],
                    hourly: [],
                    dayOfWeek: [],
                    paymentMethods: [],
                    channels: []
                }
            };
        }
    }

    /**
     * Get sales summary for a specific date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} Sales summary data
     */
    static async getSalesSummaryForDateRange(startDate, endDate) {
        try {
            console.log('[SalesSummaryService] Fetching summary for date range:', { startDate, endDate });

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
            const orders = passbookData.orders.filter(order => orderIds.has(order.id) && order.currentStatus?.label === 'COMPLETED');

            console.log('[SalesSummaryService] Completed orders:', orders.length);

            // Initialize tracking variables
            let totalRevenue = 0;
            let totalOrders = 0;
            let totalItems = 0;
            let totalDiscounts = 0;
            let totalTaxes = 0;

            const monthlyData = {};
            const paymentMethodData = {};
            const channelData = {};
            const hourlyData = {}; // Track sales by hour of day
            const dayOfWeekData = {}; // Track sales by day of week

            // Initialize monthly data for the financial year
            const monthNames = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
            monthNames.forEach(month => {
                monthlyData[month] = { revenue: 0, orders: 0, items: 0 };
            });

            // Initialize hourly data (0-23 hours)
            for (let hour = 0; hour < 24; hour++) {
                hourlyData[hour] = { revenue: 0, orders: 0 };
            }

            // Initialize day of week data
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            daysOfWeek.forEach(day => {
                dayOfWeekData[day] = { revenue: 0, orders: 0 };
            });

            // Process each order
            orders.forEach(order => {
                // Add safety check for order object
                if (!order) return;
                
                const orderTotal = this.calculateOrderTotal(order);
                // Ensure order.date is properly converted
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date);
                if (isNaN(orderDate.getTime())) {
                    console.warn('[SalesSummaryService] Invalid order date for order:', order.id);
                    return;
                }
                
                const paymentMethod = this.getPaymentMethod(order);
                const channel = this.getOrderChannel(order);

                // Update totals
                totalRevenue += orderTotal;
                totalOrders += 1;

                // Count items
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        totalItems += item.qnt || item.quantity || 1;
                    });
                }

                // Track discounts
                totalDiscounts += order.discount || 0;

                // Track taxes (from charges)
                if (order.charges && Array.isArray(order.charges)) {
                    order.charges.forEach(charge => {
                        if (!charge.inclusive && charge.type === 'percentage') {
                            const taxAmount = (orderTotal * (parseFloat(charge.value) || 0)) / 100;
                            totalTaxes += taxAmount;
                        }
                    });
                }

                // Monthly breakdown (Financial Year: Apr-Mar)
                const month = orderDate.getMonth();
                const fyMonth = month >= 3 ? monthNames[month - 3] : monthNames[month + 9];
                if (monthlyData[fyMonth]) {
                    monthlyData[fyMonth].revenue += orderTotal;
                    monthlyData[fyMonth].orders += 1;
                    monthlyData[fyMonth].items += order.items ? order.items.reduce((sum, item) => sum + (item.qnt || item.quantity || 1), 0) : 0;
                }

                // Hourly breakdown
                const hour = orderDate.getHours();
                hourlyData[hour].revenue += orderTotal;
                hourlyData[hour].orders += 1;

                // Day of week breakdown
                const dayOfWeek = daysOfWeek[orderDate.getDay()];
                dayOfWeekData[dayOfWeek].revenue += orderTotal;
                dayOfWeekData[dayOfWeek].orders += 1;

                // Payment method breakdown
                if (!paymentMethodData[paymentMethod]) {
                    paymentMethodData[paymentMethod] = { revenue: 0, orders: 0 };
                }
                paymentMethodData[paymentMethod].revenue += orderTotal;
                paymentMethodData[paymentMethod].orders += 1;

                // Channel breakdown
                if (!channelData[channel]) {
                    channelData[channel] = { revenue: 0, orders: 0 };
                }
                channelData[channel].revenue += orderTotal;
                channelData[channel].orders += 1;
            });

            // Calculate averages and metrics
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            const avgItemsPerOrder = totalOrders > 0 ? totalItems / totalOrders : 0;
            const discountPercentage = totalRevenue > 0 ? (totalDiscounts / (totalRevenue + totalDiscounts)) * 100 : 0;

            // Find peak sales hour
            const peakHour = Object.keys(hourlyData).reduce((a, b) => 
                hourlyData[a].revenue > hourlyData[b].revenue ? a : b
            );

            // Find best day of week
            const bestDay = Object.keys(dayOfWeekData).reduce((a, b) => 
                dayOfWeekData[a].revenue > dayOfWeekData[b].revenue ? a : b
            );

            // Find best month
            const bestMonth = Object.keys(monthlyData).reduce((a, b) => 
                monthlyData[a].revenue > monthlyData[b].revenue ? a : b
            );

            return {
                startDate,
                endDate,
                summary: {
                    totalRevenue,
                    totalOrders,
                    totalItems,
                    totalDiscounts,
                    totalTaxes,
                    avgOrderValue,
                    avgItemsPerOrder,
                    discountPercentage,
                    netRevenue: totalRevenue - totalDiscounts
                },
                insights: {
                    peakSalesHour: parseInt(peakHour),
                    peakSalesHourRevenue: hourlyData[peakHour]?.revenue || 0,
                    bestDayOfWeek: bestDay,
                    bestDayRevenue: dayOfWeekData[bestDay]?.revenue || 0,
                    bestMonth,
                    bestMonthRevenue: monthlyData[bestMonth]?.revenue || 0
                },
                breakdowns: {
                    monthly: Object.keys(monthlyData).map(month => ({
                        month,
                        ...monthlyData[month]
                    })),
                    hourly: Object.keys(hourlyData).map(hour => ({
                        hour: parseInt(hour),
                        hourLabel: `${hour}:00`,
                        ...hourlyData[hour]
                    })).sort((a, b) => a.hour - b.hour),
                    dayOfWeek: Object.keys(dayOfWeekData).map(day => ({
                        day,
                        ...dayOfWeekData[day]
                    })),
                    paymentMethods: Object.keys(paymentMethodData).map(method => ({
                        method,
                        ...paymentMethodData[method],
                        percentage: totalRevenue > 0 ? (paymentMethodData[method].revenue / totalRevenue) * 100 : 0
                    })).sort((a, b) => (b.revenue || 0) - (a.revenue || 0)),
                    channels: Object.keys(channelData).map(channel => ({
                        channel,
                        ...channelData[channel],
                        percentage: totalRevenue > 0 ? (channelData[channel].revenue / totalRevenue) * 100 : 0
                    })).sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
                }
            };

        } catch (error) {
            console.error('Error fetching sales summary for date range:', { startDate, endDate }, error);
            return {
                startDate,
                endDate,
                summary: {
                    totalRevenue: 0,
                    totalOrders: 0,
                    totalItems: 0,
                    totalDiscounts: 0,
                    totalTaxes: 0,
                    avgOrderValue: 0,
                    avgItemsPerOrder: 0,
                    discountPercentage: 0,
                    netRevenue: 0
                },
                insights: {
                    peakSalesHour: 0,
                    peakSalesHourRevenue: 0,
                    bestDayOfWeek: 'Monday',
                    bestDayRevenue: 0,
                    bestMonth: 'Apr',
                    bestMonthRevenue: 0
                },
                breakdowns: {
                    monthly: [],
                    hourly: [],
                    dayOfWeek: [],
                    paymentMethods: [],
                    channels: []
                }
            };
        }
    }

    /**
     * Get sales summary based on filter type
     * @param {string} filterType - Filter type (today, yesterday, last7, last30, last90, custom)
     * @param {Object} customDateRange - Custom date range { start, end }
     * @returns {Promise<Object>} Sales summary data
     */
    static async getSalesSummaryByFilter(filterType, customDateRange = null) {
        try {
            // Use PassbookCalculator to fetch data consistently with passbook
            const passbookData = await PassbookCalculator.fetchPassbookData(sdk);
            
            // Filter transactions using PassbookCalculator
            const filteredTransactions = PassbookCalculator.filterTransactions(
                passbookData.transactions,
                {
                    dateFilter: filterType,
                    customDateRange: customDateRange,
                    activeFilters: ['Cash', 'UPI/Card', 'Credit', 'Sales'], // Only sales transactions
                    customers: passbookData.customers
                }
            );
            
            // Get orders corresponding to these transactions
            const orderIds = new Set(filteredTransactions.map(t => t.orderId));
            const orders = passbookData.orders.filter(order => orderIds.has(order.id) && order.currentStatus?.label === 'COMPLETED');

            console.log('[SalesSummaryService] Filtered orders for', filterType, ':', orders.length);

            // Initialize tracking variables
            let totalRevenue = 0;
            let totalOrders = 0;
            let totalItems = 0;
            let totalDiscounts = 0;
            let totalTaxes = 0;

            const monthlyData = {};
            const paymentMethodData = {};
            const channelData = {};
            const hourlyData = {}; // Track sales by hour of day
            const dayOfWeekData = {}; // Track sales by day of week

            // Initialize monthly data
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            monthNames.forEach(month => {
                monthlyData[month] = { revenue: 0, orders: 0, items: 0 };
            });

            // Initialize hourly data (0-23 hours)
            for (let hour = 0; hour < 24; hour++) {
                hourlyData[hour] = { revenue: 0, orders: 0 };
            }

            // Initialize day of week data
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            daysOfWeek.forEach(day => {
                dayOfWeekData[day] = { revenue: 0, orders: 0 };
            });

            // Process each order
            orders.forEach(order => {
                // Add safety check for order object
                if (!order) return;
                
                const orderTotal = this.calculateOrderTotal(order);
                // Ensure order.date is properly converted
                const orderDate = order.date?.toDate ? order.date.toDate() : new Date(order.date);
                if (isNaN(orderDate.getTime())) {
                    console.warn('[SalesSummaryService] Invalid order date for order:', order.id);
                    return;
                }
                
                const paymentMethod = this.getPaymentMethod(order);
                const channel = this.getOrderChannel(order);

                // Update totals
                totalRevenue += orderTotal;
                totalOrders += 1;

                // Count items
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        totalItems += item.qnt || item.quantity || 1;
                    });
                }

                // Track discounts
                totalDiscounts += order.discount || 0;

                // Track taxes (from charges)
                if (order.charges && Array.isArray(order.charges)) {
                    order.charges.forEach(charge => {
                        if (!charge.inclusive && charge.type === 'percentage') {
                            const taxAmount = (orderTotal * (parseFloat(charge.value) || 0)) / 100;
                            totalTaxes += taxAmount;
                        }
                    });
                }

                // Monthly breakdown
                const month = monthNames[orderDate.getMonth()];
                if (monthlyData[month]) {
                    monthlyData[month].revenue += orderTotal;
                    monthlyData[month].orders += 1;
                    monthlyData[month].items += order.items ? order.items.reduce((sum, item) => sum + (item.qnt || item.quantity || 1), 0) : 0;
                }

                // Hourly breakdown
                const hour = orderDate.getHours();
                hourlyData[hour].revenue += orderTotal;
                hourlyData[hour].orders += 1;

                // Day of week breakdown
                const dayOfWeek = daysOfWeek[orderDate.getDay()];
                dayOfWeekData[dayOfWeek].revenue += orderTotal;
                dayOfWeekData[dayOfWeek].orders += 1;

                // Payment method breakdown
                if (!paymentMethodData[paymentMethod]) {
                    paymentMethodData[paymentMethod] = { revenue: 0, orders: 0 };
                }
                paymentMethodData[paymentMethod].revenue += orderTotal;
                paymentMethodData[paymentMethod].orders += 1;

                // Channel breakdown
                if (!channelData[channel]) {
                    channelData[channel] = { revenue: 0, orders: 0 };
                }
                channelData[channel].revenue += orderTotal;
                channelData[channel].orders += 1;
            });

            // Calculate averages and metrics
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            const avgItemsPerOrder = totalOrders > 0 ? totalItems / totalOrders : 0;
            const discountPercentage = totalRevenue > 0 ? (totalDiscounts / (totalRevenue + totalDiscounts)) * 100 : 0;

            // Find peak sales hour
            const peakHour = Object.keys(hourlyData).reduce((a, b) => 
                hourlyData[a].revenue > hourlyData[b].revenue ? a : b
            );

            // Find best day of week
            const bestDay = Object.keys(dayOfWeekData).reduce((a, b) => 
                dayOfWeekData[a].revenue > dayOfWeekData[b].revenue ? a : b
            );

            // Find best month
            const bestMonth = Object.keys(monthlyData).reduce((a, b) => 
                monthlyData[a].revenue > monthlyData[b].revenue ? a : b
            );

            // Get date range for return data
            const dateRange = PassbookCalculator.getDateRange(filterType, customDateRange);

            return {
                startDate: dateRange.start,
                endDate: dateRange.end,
                filterType,
                summary: {
                    totalRevenue,
                    totalOrders,
                    totalItems,
                    totalDiscounts,
                    totalTaxes,
                    avgOrderValue,
                    avgItemsPerOrder,
                    discountPercentage,
                    netRevenue: totalRevenue - totalDiscounts
                },
                insights: {
                    peakSalesHour: parseInt(peakHour),
                    peakSalesHourRevenue: hourlyData[peakHour]?.revenue || 0,
                    bestDayOfWeek: bestDay,
                    bestDayRevenue: dayOfWeekData[bestDay]?.revenue || 0,
                    bestMonth,
                    bestMonthRevenue: monthlyData[bestMonth]?.revenue || 0
                },
                breakdowns: {
                    monthly: Object.keys(monthlyData).map(month => ({
                        month,
                        ...monthlyData[month]
                    })),
                    hourly: Object.keys(hourlyData).map(hour => ({
                        hour: parseInt(hour),
                        hourLabel: `${hour}:00`,
                        ...hourlyData[hour]
                    })).sort((a, b) => a.hour - b.hour),
                    dayOfWeek: Object.keys(dayOfWeekData).map(day => ({
                        day,
                        ...dayOfWeekData[day]
                    })),
                    paymentMethods: Object.keys(paymentMethodData).map(method => ({
                        method,
                        ...paymentMethodData[method],
                        percentage: totalRevenue > 0 ? (paymentMethodData[method].revenue / totalRevenue) * 100 : 0
                    })).sort((a, b) => (b.revenue || 0) - (a.revenue || 0)),
                    channels: Object.keys(channelData).map(channel => ({
                        channel,
                        ...channelData[channel],
                        percentage: totalRevenue > 0 ? (channelData[channel].revenue / totalRevenue) * 100 : 0
                    })).sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
                }
            };

        } catch (error) {
            console.error('Error fetching sales summary for filter:', filterType, error);
            // Default to last 7 days if date range is invalid
            const now = new Date();
            const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const endDate = now;
            
            return {
                startDate,
                endDate,
                filterType,
                summary: {
                    totalRevenue: 0,
                    totalOrders: 0,
                    totalItems: 0,
                    totalDiscounts: 0,
                    totalTaxes: 0,
                    avgOrderValue: 0,
                    avgItemsPerOrder: 0,
                    discountPercentage: 0,
                    netRevenue: 0
                },
                insights: {
                    peakSalesHour: 0,
                    peakSalesHourRevenue: 0,
                    bestDayOfWeek: 'Monday',
                    bestDayRevenue: 0,
                    bestMonth: 'January',
                    bestMonthRevenue: 0
                },
                breakdowns: {
                    monthly: [],
                    hourly: [],
                    dayOfWeek: [],
                    paymentMethods: [],
                    channels: []
                }
            };
        }
    }

    /**
     * Get comprehensive sales summary report
     * @param {number} previousYears - Number of previous years to include (default: 2)
     * @returns {Promise<Object>} Comprehensive sales summary report
     */
    static async getSalesSummaryReport(previousYears = 2) {
        try {
            const financialYears = FinancialYearUtils.getFinancialYearsList(previousYears);
            const currentFY = financialYears[0];

            // Fetch data for all financial years
            const yearlyReports = {};
            for (const fy of financialYears) {
                yearlyReports[fy] = await this.getSalesSummaryForYear(fy);
            }

            // Calculate year-over-year comparisons
            const comparisons = {};
            for (let i = 1; i < financialYears.length; i++) {
                const currentYear = financialYears[i - 1];
                const previousYear = financialYears[i];
                
                const currentData = yearlyReports[currentYear];
                const previousData = yearlyReports[previousYear];

                comparisons[currentYear] = {
                    vs: previousYear,
                    revenueGrowth: previousData.summary.totalRevenue > 0 
                        ? ((currentData.summary.totalRevenue - previousData.summary.totalRevenue) / previousData.summary.totalRevenue) * 100
                        : 0,
                    ordersGrowth: previousData.summary.totalOrders > 0
                        ? ((currentData.summary.totalOrders - previousData.summary.totalOrders) / previousData.summary.totalOrders) * 100
                        : 0,
                    avgOrderValueGrowth: previousData.summary.avgOrderValue > 0
                        ? ((currentData.summary.avgOrderValue - previousData.summary.avgOrderValue) / previousData.summary.avgOrderValue) * 100
                        : 0
                };
            }

            // Calculate aggregated insights across all years
            const allYearsRevenue = Object.values(yearlyReports).reduce((sum, report) => sum + (report.summary?.totalRevenue || 0), 0);
            const allYearsOrders = Object.values(yearlyReports).reduce((sum, report) => sum + (report.summary?.totalOrders || 0), 0);
            
            return {
                currentFinancialYear: currentFY,
                financialYears,
                yearlyReports,
                comparisons,
                aggregatedSummary: {
                    totalRevenue: allYearsRevenue,
                    totalOrders: allYearsOrders,
                    avgOrderValue: allYearsOrders > 0 ? allYearsRevenue / allYearsOrders : 0,
                    yearsAnalyzed: financialYears.length
                },
                currentYearSummary: yearlyReports[currentFY] || {}
            };

        } catch (error) {
            console.error('Error generating sales summary report:', error);
            const currentFY = FinancialYearUtils.getCurrentFinancialYear();
            
            return {
                currentFinancialYear: currentFY,
                financialYears: FinancialYearUtils.getFinancialYearsList(previousYears),
                yearlyReports: {},
                comparisons: {},
                aggregatedSummary: {
                    totalRevenue: 0,
                    totalOrders: 0,
                    avgOrderValue: 0,
                    yearsAnalyzed: 0
                },
                currentYearSummary: {}
            };
        }
    }
}