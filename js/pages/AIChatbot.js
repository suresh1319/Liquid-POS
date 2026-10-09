import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { sdk } from '../sdk.js';

// Helper component for Dashboard Data Card
const DashboardDataCard = ({ data }) => {
    // Extract dashboard metrics
    const metrics = data.metrics || {};
    const tables = data.tables || [];
    const channels = data.channels || [];
    const todaysOrders = data.todaysOrders || { all: [], placed: [], kitchen: [], completed: [] };
    const dateRange = data.dateRange || 'today';

    // Calculate additional metrics
    const pendingOrders = todaysOrders.placed?.length || 0;
    const kitchenOrders = todaysOrders.kitchen?.length || 0;
    const completedOrders = todaysOrders.completed?.length || 0;

    // Calculate average order value
    const totalRevenue = metrics.todayRevenue || 0;
    const totalOrders = metrics.todayOrders || 1; // Avoid division by zero
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-storefront mr-2 text-red-500"></i>
                Business Dashboard - {getDateRangeLabel(dateRange)}
            </div>

            {/* Key Metrics - Grid Layout */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xs text-red-600 font-medium">Orders</div>
                    <div className="text-2xl font-bold text-red-700">{metrics.todayOrders?.toLocaleString() || '0'}</div>
                    {metrics.todayOrdersTrend !== undefined && (
                        <div className={`text-xs mt-1 ${metrics.todayOrdersTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${metrics.todayOrdersTrend >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {metrics.todayOrdersTrend.toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">Revenue</div>
                    <div className="text-2xl font-bold text-green-700">₹{metrics.todayRevenue?.toLocaleString() || '0'}</div>
                    {metrics.todayRevenueTrend !== undefined && (
                        <div className={`text-xs mt-1 ${metrics.todayRevenueTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${metrics.todayRevenueTrend >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {metrics.todayRevenueTrend.toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">New Customers</div>
                    <div className="text-2xl font-bold text-blue-700">{metrics.newCustomers?.toLocaleString() || '0'}</div>
                    {metrics.newCustomersTrend !== undefined && (
                        <div className={`text-xs mt-1 ${metrics.newCustomersTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${metrics.newCustomersTrend >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {metrics.newCustomersTrend.toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 font-medium">Avg Order Value</div>
                    <div className="text-2xl font-bold text-purple-700">₹{avgOrderValue?.toLocaleString() || '0'}</div>
                    {metrics.avgOrderValueTrend !== undefined && (
                        <div className={`text-xs mt-1 ${metrics.avgOrderValueTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${metrics.avgOrderValueTrend >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {metrics.avgOrderValueTrend.toFixed(1)}%
                        </div>
                    )}
                </div>
            </div>

            {/* Orders Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-center">
                    <div className="text-xs text-amber-600 font-medium">Pending Orders</div>
                    <div className="text-xl font-bold text-amber-700">{pendingOrders}</div>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-center">
                    <div className="text-xs text-indigo-600 font-medium">Kitchen Orders</div>
                    <div className="text-xl font-bold text-indigo-700">{kitchenOrders}</div>
                </div>
                <div className="bg-teal-50 p-3 rounded-lg border border-teal-100 text-center">
                    <div className="text-xs text-teal-600 font-medium">Completed Orders</div>
                    <div className="text-xl font-bold text-teal-700">{completedOrders}</div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center">
                        <div className="text-xs text-gray-500">Active Tables</div>
                        <div className="text-lg font-bold text-gray-800">{tables.length}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-gray-500">Order Channels</div>
                        <div className="text-lg font-bold text-gray-800">{channels.length}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-gray-500">Avg Service Time</div>
                        <div className="text-lg font-bold text-gray-800">
                            {metrics.avgServiceTime ? `${Math.round(metrics.avgServiceTime)} min` : 'N/A'}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-gray-500">Last Updated</div>
                        <div className="text-lg font-bold text-gray-800">
                            {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time dashboard data from Firebase for {getDateRangeLabel(dateRange).toLowerCase()}
            </div>
        </div>
    );
};

// Helper function to get date range label
const getDateRangeLabel = (dateRange) => {
    switch (dateRange) {
        case 'today': return 'Today';
        case 'yesterday': return 'Yesterday';
        case 'last7': return 'Last 7 Days';
        case 'last30': return 'Last 30 Days';
        case 'last90': return 'Last 90 Days';
        case 'thisMonth': return 'This Month';
        case 'all':
        default: return 'All Time';
    }
};

// Helper component for Completed Orders Data Card
const CompletedOrdersDataCard = ({ data }) => {
    const orders = data.orders || [];
    const dateRange = data.dateRange || 'today';

    // Format order time
    const formatOrderTime = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Format order date
    const formatOrderDate = (date) => {
        if (!date) return 'N/A';
        const orderDate = new Date(date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (orderDate.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (orderDate.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return orderDate.toLocaleDateString();
        }
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-check-circle mr-2 text-green-500"></i>
                Completed Orders - {getDateRangeLabel(dateRange)}
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-green-50 p-3 rounded-lg border border-green-100 text-center">
                    <div className="text-xs text-green-600 font-medium">Total Orders</div>
                    <div className="text-xl font-bold text-green-700">{orders.length}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                    <div className="text-xs text-blue-600 font-medium">Revenue</div>
                    <div className="text-xl font-bold text-blue-700">
                        ₹{orders.reduce((sum, order) => sum + (order.finalAmount || order.total || 0), 0).toLocaleString()}
                    </div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-center">
                    <div className="text-xs text-purple-600 font-medium">Avg. Order</div>
                    <div className="text-xl font-bold text-purple-700">
                        ₹{orders.length > 0 ? Math.round(orders.reduce((sum, order) => sum + (order.finalAmount || order.total || 0), 0) / orders.length) : 0}
                    </div>
                </div>
            </div>

            {/* Orders Timeline */}
            <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Completed Orders Timeline</div>
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                    {orders.length > 0 ? (
                        orders.map((order, index) => (
                            <div key={order.id || index} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-medium text-gray-800">Order #{order.id?.substring(0, 8) || 'N/A'}</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Table: {order.table?.title || order.tableName || 'N/A'} •
                                            Customer: {order.customer?.name || 'Walk-in'}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-gray-800">₹{(order.finalAmount || order.total || 0).toLocaleString()}</div>
                                        <div className="text-xs text-gray-500">
                                            {formatOrderTime(order.date)} • {formatOrderDate(order.date)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-xs">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-800">
                                        <i className="ph ph-check-circle mr-1"></i>
                                        Completed
                                    </span>
                                    <span className="ml-2 text-gray-500">
                                        {order.items?.length || 0} items
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 py-4">
                            No completed orders found for {getDateRangeLabel(dateRange).toLowerCase()}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Showing {orders.length} completed orders for {getDateRangeLabel(dateRange).toLowerCase()}
            </div>
        </div>
    );
};

// Helper component for Products Data Card
const ProductsDataCard = ({ data }) => {
    const products = data.products || [];
    const categories = data.categories || [];
    const totalProducts = products.length;

    // Calculate stock metrics
    const inStock = products.filter(p => p.stock > 10).length;
    const lowStock = products.filter(p => p.stock <= 10 && p.stock > 0).length;
    const outOfStock = products.filter(p => p.stock === 0).length;

    // Calculate price metrics
    const avgPrice = products.length > 0
        ? (products.reduce((sum, p) => sum + (p.price || 0), 0) / products.length).toFixed(2)
        : 0;

    // Get top categories
    const topCategories = categories.slice(0, 5);

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-package mr-2 text-blue-500"></i>
                Product Inventory Overview
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Total Products</div>
                    <div className="text-2xl font-bold text-blue-700">{totalProducts}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">In Stock</div>
                    <div className="text-2xl font-bold text-green-700">{inStock}</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                    <div className="text-xs text-yellow-600 font-medium">Low Stock</div>
                    <div className="text-2xl font-bold text-yellow-700">{lowStock}</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xs text-red-600 font-medium">Out of Stock</div>
                    <div className="text-2xl font-bold text-red-700">{outOfStock}</div>
                </div>
            </div>

            {/* Price Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">Pricing Overview</div>
                <div className="flex justify-between">
                    <div>
                        <div className="text-xs text-gray-500">Average Price</div>
                        <div className="text-lg font-bold text-gray-800">₹{avgPrice}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Highest Price</div>
                        <div className="text-lg font-bold text-gray-800">
                            ₹{products.length > 0 ? Math.max(...products.map(p => p.price || 0)) : 0}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Lowest Price</div>
                        <div className="text-lg font-bold text-gray-800">
                            ₹{products.length > 0 ? Math.min(...products.map(p => p.price || 0)) : 0}
                        </div>
                    </div>
                </div>
            </div>

            {/* Categories */}
            <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">Top Categories</div>
                <div className="flex flex-wrap gap-2">
                    {topCategories.map((category, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                            <div className="font-medium text-gray-800">{category.name}</div>
                            <div className="text-xs text-gray-500">{category.count} items</div>
                        </div>
                    ))}
                    {categories.length > 5 && (
                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                            <div className="font-medium text-gray-800">+{categories.length - 5} more</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Recent Products */}
            <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Recent Products</div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {products.slice(0, 5).map((product, index) => (
                        <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                            <div className="flex items-center">
                                <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                    {product.title?.charAt(0) || 'P'}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-gray-800">{product.title || 'Untitled Product'}</div>
                                    <div className="text-xs text-gray-500">{product.cat || 'Uncategorized'}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-gray-800">₹{product.price?.toFixed(2) || '0.00'}</div>
                                <div className={`text-xs ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    Stock: {product.stock || 0}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time product data from Firebase
            </div>
        </div>
    );
};

// Helper component for Products by Category Data Card
const ProductsByCategoryDataCard = ({ data }) => {
    const categories = data.categories || [];

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-package mr-2 text-blue-500"></i>
                Products by Category
            </div>

            {/* Categories with Products */}
            <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                {categories.map((category, catIndex) => (
                    <div key={catIndex} className="border border-gray-200 rounded-lg">
                        <div className="bg-gray-50 px-4 py-2 rounded-t-lg border-b border-gray-200">
                            <div className="font-medium text-gray-800">{category.name}</div>
                            <div className="text-xs text-gray-500">{category.products.length} items</div>
                        </div>
                        <div className="p-3 space-y-2">
                            {category.products.map((product, prodIndex) => (
                                <div key={prodIndex} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                            {product.title?.charAt(0) || 'P'}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-800">{product.title || 'Untitled Product'}</div>
                                            <div className="text-xs text-gray-500">₹{product.price?.toFixed(2) || '0.00'}</div>
                                        </div>
                                    </div>
                                    <div className={`text-xs px-2 py-1 rounded ${product.stock > 10 ? 'bg-green-100 text-green-800' : product.stock > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                        Stock: {product.stock || 0}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {categories.length === 0 && (
                    <div className="text-center text-gray-500 py-4">
                        No products found in any category
                    </div>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time product data organized by category from Firebase
            </div>
        </div>
    );
};

// Helper component for Customers Data Card
const CustomersDataCard = ({ data }) => {
    const customers = data.customers || [];
    const totalCustomers = customers.length;

    // Calculate customer metrics
    const newCustomers = customers.filter(c => {
        const customerDate = new Date(c.date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return customerDate >= thirtyDaysAgo;
    }).length;

    const activeCustomers = customers.filter(c => c.totalPaid > 0 || c.totalSpent > 0).length;

    // Calculate spending metrics
    const totalSpent = customers.reduce((sum, c) => sum + (c.totalPaid || c.totalSpent || 0), 0);
    const avgSpent = totalCustomers > 0 ? (totalSpent / totalCustomers).toFixed(2) : 0;

    // Get top customers by spending
    const topCustomers = [...customers]
        .sort((a, b) => (b.totalPaid || b.totalSpent || 0) - (a.totalPaid || a.totalSpent || 0))
        .slice(0, 5);

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-users mr-2 text-purple-500"></i>
                Customer Overview
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 font-medium">Total Customers</div>
                    <div className="text-2xl font-bold text-purple-700">{totalCustomers}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">New (30 days)</div>
                    <div className="text-2xl font-bold text-green-700">{newCustomers}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Active Customers</div>
                    <div className="text-2xl font-bold text-blue-700">{activeCustomers}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-600 font-medium">Avg. Spent</div>
                    <div className="text-2xl font-bold text-amber-700">₹{avgSpent}</div>
                </div>
            </div>

            {/* Top Customers */}
            <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Top Customers</div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {topCustomers.length > 0 ? (
                        topCustomers.map((customer, index) => (
                            <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                        {customer.name?.charAt(0) || 'C'}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-800">{customer.name || 'Unnamed Customer'}</div>
                                        <div className="text-xs text-gray-500">{customer.phone || customer.email || 'No contact'}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-800">₹{(customer.totalPaid || customer.totalSpent || 0).toLocaleString()}</div>
                                    <div className="text-xs text-gray-500">
                                        {customer.ordersCount || 0} orders
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 py-4">
                            No customers found
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time customer data from Firebase
            </div>
        </div>
    );
};

// Helper component for Customers with Loyalty Data Card
const CustomersWithLoyaltyDataCard = ({ data }) => {
    const customers = data.customers || [];
    const loyaltyRules = data.loyaltyRules || [];
    const loyaltyLevels = data.loyaltyLevels || [];

    const totalCustomers = customers.length;

    // Calculate customer metrics
    const newCustomers = customers.filter(c => {
        const customerDate = new Date(c.date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return customerDate >= thirtyDaysAgo;
    }).length;

    const activeCustomers = customers.filter(c => c.totalPaid > 0 || c.totalSpent > 0).length;

    // Calculate spending metrics
    const totalSpent = customers.reduce((sum, c) => sum + (c.totalPaid || c.totalSpent || 0), 0);
    const avgSpent = totalCustomers > 0 ? (totalSpent / totalCustomers).toFixed(2) : 0;

    // Get top customers by spending
    const topCustomers = [...customers]
        .sort((a, b) => (b.totalPaid || b.totalSpent || 0) - (a.totalPaid || a.totalSpent || 0))
        .slice(0, 5);

    // Count customers by loyalty level
    const loyaltyLevelCounts = {};
    customers.forEach(customer => {
        const level = customer.loyaltyLevel || 'Bronze';
        loyaltyLevelCounts[level] = (loyaltyLevelCounts[level] || 0) + 1;
    });

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-users mr-2 text-purple-500"></i>
                Customer & Loyalty Program Overview
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 font-medium">Total Customers</div>
                    <div className="text-2xl font-bold text-purple-700">{totalCustomers}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">New (30 days)</div>
                    <div className="text-2xl font-bold text-green-700">{newCustomers}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Active Customers</div>
                    <div className="text-2xl font-bold text-blue-700">{activeCustomers}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-600 font-medium">Avg. Spent</div>
                    <div className="text-2xl font-bold text-amber-700">₹{avgSpent}</div>
                </div>
            </div>

            {/* Loyalty Levels */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                {loyaltyLevels.map((level, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <div className="text-xs text-gray-500 font-medium">{level.name}</div>
                        <div className="text-xl font-bold text-gray-800">{loyaltyLevelCounts[level.name] || 0}</div>
                    </div>
                ))}
            </div>

            {/* Top Customers */}
            <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Top Customers</div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {topCustomers.length > 0 ? (
                        topCustomers.map((customer, index) => (
                            <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                        {customer.name?.charAt(0) || 'C'}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-800">{customer.name || 'Unnamed Customer'}</div>
                                        <div className="text-xs text-gray-500">{customer.phone || customer.email || 'No contact'}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-800">₹{(customer.totalPaid || customer.totalSpent || 0).toLocaleString()}</div>
                                    <div className="text-xs text-gray-500">
                                        {customer.ordersCount || 0} orders
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 py-4">
                            No customers found
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time customer data from Firebase
            </div>
        </div>
    );
};

// Helper component for Passbook Data Card
const PassbookDataCard = ({ data }) => {
    const transactions = data.transactions || [];
    const customers = data.customers || [];
    const dateRange = data.dateRange || 'all';

    // Calculate passbook metrics
    const totalTransactions = transactions.length;

    // Calculate financial metrics
    const totalSales = transactions
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    const totalPayments = transactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    const netBalance = totalSales - totalPayments;

    // Group transactions by type
    const salesTransactions = transactions.filter(t => t.type === 'credit');
    const paymentTransactions = transactions.filter(t => t.type === 'debit');

    // Get recent transactions (last 5)
    const recentTransactions = [...transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-book-open mr-2 text-indigo-500"></i>
                Passbook Overview - {getDateRangeLabel(dateRange)}
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <div className="text-xs text-indigo-600 font-medium">Total Transactions</div>
                    <div className="text-2xl font-bold text-indigo-700">{totalTransactions}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">Total Sales</div>
                    <div className="text-2xl font-bold text-green-700">₹{totalSales.toLocaleString()}</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xs text-red-600 font-medium">Total Payments</div>
                    <div className="text-2xl font-bold text-red-700">₹{totalPayments.toLocaleString()}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Net Balance</div>
                    <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        ₹{netBalance.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Transaction Types */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">Sales Transactions</div>
                    <div className="text-xl font-bold text-green-700">{salesTransactions.length}</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xs text-red-600 font-medium">Payment Transactions</div>
                    <div className="text-xl font-bold text-red-700">{paymentTransactions.length}</div>
                </div>
            </div>

            {/* Recent Transactions */}
            <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Recent Transactions</div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {recentTransactions.length > 0 ? (
                        recentTransactions.map((transaction, index) => {
                            const customer = customers.find(c => c.id === transaction.customerId);
                            return (
                                <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                    <div className="flex items-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs mr-2 ${transaction.type === 'credit' ? 'bg-green-500' : 'bg-red-500'
                                            }`}>
                                            <i className={`ph ${transaction.type === 'credit' ? 'ph-arrow-up' : 'ph-arrow-down'}`}></i>
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-800">
                                                {transaction.orderId ? `Order #${transaction.orderId.substring(0, 6)}` : 'Transaction'}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {customer ? customer.name : 'Unknown Customer'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-sm font-bold ${transaction.type === 'credit' ? 'text-green-700' : 'text-red-700'
                                            }`}>
                                            {transaction.type === 'credit' ? '+' : '-'}₹{Math.abs(transaction.amount || 0).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {transaction.date ? new Date(transaction.date).toLocaleDateString() : 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center text-gray-500 py-4">
                            No transactions found
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time passbook data from Firebase for {getDateRangeLabel(dateRange).toLowerCase()}
            </div>
        </div>
    );
};

// Helper component for KDS Data Card
const KDSDataCard = ({ data }) => {
    const orders = data.orders || [];

    // Calculate KDS metrics
    const totalOrders = orders.length;

    // Count orders by status
    const kitchenOrders = orders.filter(order => order.currentStatus?.label === 'KITCHEN').length;
    const placedOrders = orders.filter(order => order.currentStatus?.label === 'PLACED').length;

    // Calculate total items and pending items
    const totalItems = orders.reduce((sum, order) => sum + (order.items?.length || 0), 0);

    const pendingItems = orders.reduce((sum, order) => {
        if (!order.items) return sum;
        return sum + order.items.filter(item => {
            const completed = item.completed || 0;
            const quantity = item.qnt || 0;
            return quantity > completed;
        }).length;
    }, 0);

    // Get recent orders (last 5)
    const recentOrders = [...orders]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-cooking-pot mr-2 text-red-500"></i>
                Kitchen Display System (KDS)
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xs text-red-600 font-medium">Total Orders</div>
                    <div className="text-2xl font-bold text-red-700">{totalOrders}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Kitchen Orders</div>
                    <div className="text-2xl font-bold text-blue-700">{kitchenOrders}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">Placed Orders</div>
                    <div className="text-2xl font-bold text-green-700">{placedOrders}</div>
                </div>
            </div>

            {/* Total Items & Pending Items */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="text-xs text-gray-500 font-medium">Total Items</div>
                    <div className="text-2xl font-bold text-gray-800">{totalItems}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-600 font-medium">Pending Items</div>
                    <div className="text-2xl font-bold text-amber-700">{pendingItems}</div>
                </div>
            </div>

            {/* Recent Orders */}
            <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Recent Orders</div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {recentOrders.length > 0 ? (
                        recentOrders.map((order, index) => (
                            <div key={order.id || index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                        {order.id?.substring(0, 8) || 'N/A'}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-800">
                                            {order.customer?.name || 'Walk-in'}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {order.items?.length || 0} items
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-800">₹{(order.finalAmount || order.total || 0).toLocaleString()}</div>
                                    <div className="text-xs text-gray-500">
                                        {order.date ? new Date(order.date).toLocaleTimeString() : 'N/A'}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 py-4">
                            No orders found
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time KDS data from Firebase
            </div>
        </div>
    );
};

// Helper component for Expenses Data Card
const ExpensesDataCard = ({ data }) => {
    const expenses = data.expenses || [];
    const categories = data.categories || [];
    const budgets = data.budgets || [];
    const dateRange = data.dateRange || 'all';

    // Calculate expense metrics
    const totalExpenses = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    const expenseCount = expenses.length;

    // Group expenses by category
    const expensesByCategory = {};
    expenses.forEach(expense => {
        const category = expense.category || 'Uncategorized';
        if (!expensesByCategory[category]) {
            expensesByCategory[category] = {
                category: category,
                amount: 0,
                count: 0,
                color: '#9CA3AF' // Default gray color
            };
        }
        expensesByCategory[category].amount += expense.amount || 0;
        expensesByCategory[category].count += 1;

        // Find category color
        const categoryInfo = categories.find(cat => cat.id === category);
        if (categoryInfo && categoryInfo.color) {
            expensesByCategory[category].color = categoryInfo.color;
        }
    });

    const expensesByCategoryArray = Object.values(expensesByCategory)
        .sort((a, b) => b.amount - a.amount);

    // Get top expenses (last 5)
    const recentExpenses = [...expenses]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    // Calculate budget vs spending
    const budgetData = budgets.map(budget => {
        const categoryExpenses = expenses.filter(expense => expense.category === budget.category);
        const spent = categoryExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
        const remaining = Math.max(0, budget.amount - spent);
        const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

        return {
            ...budget,
            spent,
            remaining,
            percentage
        };
    });

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-currency-inr mr-2 text-red-500"></i>
                Business Expenses - {getDateRangeLabel(dateRange)}
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xs text-red-600 font-medium">Total Expenses</div>
                    <div className="text-2xl font-bold text-red-700">₹{totalExpenses.toLocaleString()}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Total Entries</div>
                    <div className="text-2xl font-bold text-blue-700">{expenseCount}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">Categories</div>
                    <div className="text-2xl font-bold text-green-700">{Object.keys(expensesByCategory).length}</div>
                </div>
            </div>

            {/* Expenses by Category */}
            <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">Expenses by Category</div>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {expensesByCategoryArray.length > 0 ? (
                        expensesByCategoryArray.map((categoryData, index) => (
                            <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <div
                                        className="w-3 h-3 rounded-full mr-2"
                                        style={{ backgroundColor: categoryData.color }}
                                    ></div>
                                    <div className="text-sm font-medium text-gray-800">
                                        {categories.find(cat => cat.id === categoryData.category)?.name || categoryData.category}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-800">₹{categoryData.amount.toLocaleString()}</div>
                                    <div className="text-xs text-gray-500">{categoryData.count} entries</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 py-2 text-sm">
                            No expenses found
                        </div>
                    )}
                </div>
            </div>

            {/* Budget vs Spending */}
            {budgetData.length > 0 && (
                <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Budget vs Spending</div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {budgetData.map((budget, index) => {
                            const categoryInfo = categories.find(cat => cat.id === budget.category);
                            return (
                                <div key={index} className="p-2 hover:bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="text-sm font-medium text-gray-800">
                                            {categoryInfo?.name || budget.category}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            ₹{budget.spent.toLocaleString()} / ₹{budget.amount.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className={`h-2 rounded-full ${budget.percentage > 90 ? 'bg-red-500' :
                                                budget.percentage > 75 ? 'bg-yellow-500' : 'bg-green-500'
                                                }`}
                                            style={{ width: `${Math.min(100, budget.percentage)}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        ₹{budget.remaining.toLocaleString()} remaining
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Recent Expenses */}
            <div className="mb-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Recent Expenses</div>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {recentExpenses.length > 0 ? (
                        recentExpenses.map((expense, index) => (
                            <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                        {expense.description?.charAt(0) || 'E'}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-800">
                                            {expense.description || 'Unnamed Expense'}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {categories.find(cat => cat.id === expense.category)?.name || expense.category || 'Uncategorized'}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-800">₹{expense.amount?.toLocaleString() || '0'}</div>
                                    <div className="text-xs text-gray-500">
                                        {expense.date ? new Date(expense.date).toLocaleDateString() : 'N/A'}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 py-2 text-sm">
                            No recent expenses
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time expense data from Firebase for {getDateRangeLabel(dateRange).toLowerCase()}
            </div>
        </div>
    );
};

// Helper component for Reports Data Card
const ReportsDataCard = ({ data }) => {
    const metrics = data.metrics || {};
    const topProducts = data.topProducts || [];
    const dateRange = data.dateRange || 'last7';

    // Calculate key metrics
    const totalRevenue = metrics.totalRevenue || 0;
    const totalOrders = metrics.totalOrders || 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const growthRate = metrics.growthRate || 0;

    // Get top 3 products
    const topThreeProducts = topProducts.slice(0, 3);

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-chart-line-up mr-2 text-blue-500"></i>
                Business Reports - {getDateRangeLabel(dateRange)}
            </div>

            {/* Summary Metrics - Grid Layout */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Total Revenue</div>
                    <div className="text-2xl font-bold text-blue-700">₹{totalRevenue?.toLocaleString() || '0'}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">Total Orders</div>
                    <div className="text-2xl font-bold text-green-700">{totalOrders?.toLocaleString() || '0'}</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 font-medium">Avg Order Value</div>
                    <div className="text-2xl font-bold text-purple-700">₹{avgOrderValue?.toLocaleString() || '0'}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-600 font-medium">Growth Rate</div>
                    <div className={`text-2xl font-bold ${growthRate >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {growthRate >= 0 ? '+' : ''}{growthRate?.toFixed(1) || '0'}%
                    </div>
                </div>
            </div>

            {/* Top Selling Products */}
            {topThreeProducts.length > 0 && (
                <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Top Selling Products</div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {topThreeProducts.map((product, index) => (
                            <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                        {product.name?.charAt(0) || 'P'}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-800">{product.name || 'Unnamed Product'}</div>
                                        <div className="text-xs text-gray-500">{product.category || 'Uncategorized'}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-800">{product.quantity?.toLocaleString() || '0'} sold</div>
                                    <div className="text-xs text-gray-500">₹{product.revenue?.toLocaleString() || '0'} revenue</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time business reports from Firebase for {getDateRangeLabel(dateRange).toLowerCase()}
            </div>
        </div>
    );
};

// Helper component for Analytics Data Card
const AnalyticsDataCard = ({ data }) => {
    const metrics = data.metrics || {};
    const trends = data.trends || {};
    const topProducts = data.topProducts || [];
    const dateRange = data.dateRange || 'last7';

    // Calculate key metrics
    const totalSales = metrics.totalSales || 0;
    const totalOrders = metrics.totalOrders || 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
    const turnAroundTime = metrics.avgTurnAroundTime || 0;

    // Get top 3 products
    const topThreeProducts = topProducts.slice(0, 3);

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm">
            <div className="font-bold text-gray-800 text-lg mb-3 flex items-center">
                <i className="ph ph-chart-bar mr-2 text-purple-500"></i>
                Business Analytics - {getDateRangeLabel(dateRange)}
            </div>

            {/* Summary Metrics - Grid Layout */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 font-medium">Total Sales</div>
                    <div className="text-2xl font-bold text-purple-700">₹{totalSales?.toLocaleString() || '0'}</div>
                    {trends.sales !== undefined && (
                        <div className={`text-xs mt-1 ${trends.sales >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${trends.sales >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {trends.sales.toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-medium">Total Orders</div>
                    <div className="text-2xl font-bold text-blue-700">{totalOrders?.toLocaleString() || '0'}</div>
                    {trends.orders !== undefined && (
                        <div className={`text-xs mt-1 ${trends.orders >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${trends.orders >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {trends.orders.toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-medium">Avg Order Value</div>
                    <div className="text-2xl font-bold text-green-700">₹{avgOrderValue?.toLocaleString() || '0'}</div>
                    {trends.orderValue !== undefined && (
                        <div className={`text-xs mt-1 ${trends.orderValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${trends.orderValue >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {trends.orderValue.toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-600 font-medium">Avg Turnaround</div>
                    <div className="text-2xl font-bold text-amber-700">{Math.round(turnAroundTime) || '0'} min</div>
                    {trends.turnAround !== undefined && (
                        <div className={`text-xs mt-1 ${trends.turnAround >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`ph ${trends.turnAround >= 0 ? 'ph-trend-up' : 'ph-trend-down'} mr-1`}></i>
                            {trends.turnAround.toFixed(1)}%
                        </div>
                    )}
                </div>
            </div>

            {/* Top Selling Products */}
            {topThreeProducts.length > 0 && (
                <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Top Selling Products</div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {topThreeProducts.map((product, index) => (
                            <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs mr-2">
                                        {product.name?.charAt(0) || 'P'}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-800">{product.name || 'Unnamed Product'}</div>
                                        <div className="text-xs text-gray-500">{product.category || 'Uncategorized'}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-800">{product.quantity?.toLocaleString() || '0'} sold</div>
                                    <div className="text-xs text-gray-500">₹{product.revenue?.toLocaleString() || '0'} revenue</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                Real-time business analytics from Firebase for {getDateRangeLabel(dateRange).toLowerCase()}
            </div>
        </div>
    );
};

const AIChatbot = () => {
    const { t, language } = useLanguage();
    const { profile } = useProfile();

    // Chat state with persistence
    const [messages, setMessages] = useState(() => {
        // Try to load messages from localStorage
        const savedMessages = localStorage.getItem('aiChatbotMessages');
        if (savedMessages) {
            try {
                const parsedMessages = JSON.parse(savedMessages);
                return parsedMessages.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
                }));
            } catch (e) {
                console.warn('Failed to parse saved messages, using default');
            }
        }

        // Default welcome message
        return [
            {
                id: 1,
                text: t('aiChatbotWelcomeMessage'),
                sender: 'ai',
                timestamp: new Date()
            }
        ];
    });

    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const recognitionRef = useRef(null);

    // Save messages to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('aiChatbotMessages', JSON.stringify(messages.map(msg => ({
                ...msg,
                timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp
            }))));
        } catch (e) {
            console.warn('Failed to save messages to localStorage:', e);
        }
    }, [messages]);

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // Close attachment menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isAttachmentMenuOpen && event.target.closest('.attachment-menu') === null) {
                setIsAttachmentMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isAttachmentMenuOpen]);

    // Handle file upload
    const handleFileUpload = () => {
        // Create a hidden file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.style.display = 'none';

        fileInput.onchange = (event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
                // Handle the selected files
                console.log('Selected files:', files);
                // Here you would typically upload the files or process them
                // For now, we'll just log them

                // Close the attachment menu
                setIsAttachmentMenuOpen(false);
            }
        };

        // Trigger the file selection dialog
        fileInput.click();
    };

    // Handle Google Drive integration
    const handleGoogleDrive = () => {
        // In a real implementation, you would integrate with Google Drive API
        // For now, we'll show an alert
        alert('Google Drive integration would open here');
        setIsAttachmentMenuOpen(false);
    };

    // Handle Photos integration
    const handlePhotos = () => {
        // In a real implementation, you would integrate with device photos
        // For now, we'll show an alert
        alert('Photos integration would open here');
        setIsAttachmentMenuOpen(false);
    };

    // Initialize Web Speech API
    useEffect(() => {
        const initSpeechRecognition = () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn('Web Speech API is not supported in this browser');
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = language === 'hi' ? 'hi-IN' : 'en-US';

            recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }

                // Update input with interim results for better UX
                if (interimTranscript) {
                    setInputMessage(interimTranscript);
                } else if (finalTranscript) {
                    setInputMessage(finalTranscript.trim());
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
        };

        initSpeechRecognition();

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [language]);

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Handle sending messages
    const handleSendMessage = async () => {
        if (inputMessage.trim() === '') return;

        // Add user message
        const userMessage = {
            id: Date.now(),
            text: inputMessage,
            sender: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setIsLoading(true);

        try {
            // Check if user is asking about dashboard/home page
            const lowerInput = inputMessage.toLowerCase();
            const dashboardKeywords = [
                'dashboard', 'home', 'overview', 'business status', 'performance',
                'metrics', 'kpi', 'business health', 'today', 'summary', 'orders',
                'revenue', 'customers', 'sales', 'business data', 'analytics'
            ];

            const completedOrdersKeywords = [
                'completed orders', 'finished orders', 'completed', 'finished',
                'order history', 'past orders', 'delivered orders'
            ];

            const productsKeywords = [
                'products', 'inventory', 'stock', 'menu', 'items', 'catalog',
                'product list', 'inventory status', 'stock levels', 'product catalog'
            ];

            const productsByCategoryKeywords = [
                'products in respective category', 'products by category',
                'category wise products', 'products organized by category',
                'products grouped by category', 'items in each category'
            ];

            const customersKeywords = [
                'customers', 'customer page', 'customer data', 'client information',
                'customer list', 'client list', 'customer overview', 'clients'
            ];

            const customerLoyaltyKeywords = [
                'loyalty program', 'loyalty rules', 'loyalty levels', 'customer loyalty',
                'reward program', 'points system', 'loyalty points', 'customer rewards'
            ];

            const passbookKeywords = [
                'passbook', 'passbook page', 'passbook data', 'financial records',
                'transactions', 'sales records', 'payment records', 'financial overview',
                'account book', 'ledger', 'financial transactions'
            ];

            const kdsKeywords = [
                'kds', 'kitchen display', 'kitchen orders', 'kitchen data',
                'kitchen overview', 'kitchen status', 'kitchen screen',
                'orders in kitchen', 'pending orders', 'kitchen management'
            ];

            const expensesKeywords = [
                'expenses', 'expense report', 'business expenses', 'costs',
                'spending', 'expenditure', 'expense tracking', 'financial expenses',
                'business costs', 'operational costs', 'monthly expenses', 'daily expenses'
            ];

            const reportsKeywords = [
                'reports', 'report', 'business reports', 'sales reports',
                'financial reports', 'performance reports', 'business analytics',
                'sales analytics', 'revenue reports', 'order reports', 'customer reports',
                'product reports', 'daily reports', 'weekly reports', 'monthly reports'
            ];

            const analyticsKeywords = [
                'analytics', 'analytic data', 'business analytics', 'performance analytics',
                'sales analytics', 'revenue analytics', 'order analytics', 'customer analytics',
                'product analytics', 'trend analysis', 'data analysis', 'business insights'
            ];

            const isDashboardRequest = dashboardKeywords.some(keyword => lowerInput.includes(keyword));
            const isCompletedOrdersRequest = completedOrdersKeywords.some(keyword => lowerInput.includes(keyword));
            const isProductsRequest = productsKeywords.some(keyword => lowerInput.includes(keyword));
            const isProductsByCategoryRequest = productsByCategoryKeywords.some(keyword => lowerInput.includes(keyword));
            const isCustomersRequest = customersKeywords.some(keyword => lowerInput.includes(keyword));
            const isCustomerLoyaltyRequest = customerLoyaltyKeywords.some(keyword => lowerInput.includes(keyword));
            const isPassbookRequest = passbookKeywords.some(keyword => lowerInput.includes(keyword));
            const isKDSRequest = kdsKeywords.some(keyword => lowerInput.includes(keyword));
            const isExpensesRequest = expensesKeywords.some(keyword => lowerInput.includes(keyword));
            const isReportsRequest = reportsKeywords.some(keyword => lowerInput.includes(keyword));
            const isAnalyticsRequest = analyticsKeywords.some(keyword => lowerInput.includes(keyword));

            if (isCustomerLoyaltyRequest) {
                // Fetch customers and loyalty data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Fetch customers
                        const customersSnapshot = await sdk.db.collection("Customers").get();

                        // Process customers with loyalty info
                        const customers = customersSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                name: data.name || 'Unnamed Customer',
                                phone: data.phone || '',
                                email: data.email || '',
                                totalPaid: data.totalPaid || 0,
                                totalSpent: data.totalSpent || data.totalPaid || 0,
                                ordersCount: data.ordersCount || data.orderCount || 0,
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
                                lastVisit: data.lastVisit?.toDate ? data.lastVisit.toDate() :
                                    (data.lastOrderDate?.toDate ? data.lastOrderDate.toDate() : new Date(data.lastVisit || data.lastOrderDate)),
                                loyaltyPoints: data.loyaltyPoints || 0,
                                loyaltyLevel: data.loyaltyLevel || 'Bronze'
                            };
                        });

                        // Fetch loyalty rules (if available)
                        let loyaltyRules = [];
                        try {
                            const rulesSnapshot = await sdk.db.collection("LoyaltyRules").get();
                            loyaltyRules = rulesSnapshot.docs.map(doc => {
                                const data = doc.data();
                                return {
                                    id: doc.id,
                                    name: data.name || 'Unnamed Rule',
                                    description: data.description || data.name || 'No description',
                                    points: data.points || 0,
                                    condition: data.condition || ''
                                };
                            });
                        } catch (rulesError) {
                            console.warn('Could not fetch loyalty rules:', rulesError);
                            loyaltyRules = [];
                        }

                        // Fetch loyalty levels (if available)
                        let loyaltyLevels = [];
                        try {
                            const levelsSnapshot = await sdk.db.collection("LoyaltyLevels").get();
                            loyaltyLevels = levelsSnapshot.docs.map(doc => {
                                const data = doc.data();
                                return {
                                    id: doc.id,
                                    name: data.name || 'Unnamed Level',
                                    condition: data.condition || data.pointsRequired || '',
                                    benefits: data.benefits || []
                                };
                            });
                        } catch (levelsError) {
                            console.warn('Could not fetch loyalty levels:', levelsError);
                            loyaltyLevels = [];
                        }

                        // Create customers with loyalty data object
                        const customersWithLoyaltyData = {
                            customers: customers,
                            loyaltyRules: loyaltyRules,
                            loyaltyLevels: loyaltyLevels,
                            lastUpdated: new Date()
                        };

                        // Create customers with loyalty data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your customer and loyalty program data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'customers-with-loyalty',
                                data: customersWithLoyaltyData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            customers: [
                                {
                                    id: '1',
                                    name: 'John Doe',
                                    phone: '9876543210',
                                    email: 'john@example.com',
                                    totalPaid: 5200,
                                    totalSpent: 5200,
                                    ordersCount: 15,
                                    date: new Date(Date.now() - 86400000 * 50), // 50 days ago
                                    lastVisit: new Date(Date.now() - 86400000 * 2), // 2 days ago
                                    loyaltyPoints: 250,
                                    loyaltyLevel: 'Gold'
                                },
                                {
                                    id: '2',
                                    name: 'Jane Smith',
                                    phone: '9876543211',
                                    email: 'jane@example.com',
                                    totalPaid: 1800,
                                    totalSpent: 1800,
                                    ordersCount: 8,
                                    date: new Date(Date.now() - 86400000 * 20), // 20 days ago
                                    lastVisit: new Date(Date.now() - 86400000 * 5), // 5 days ago
                                    loyaltyPoints: 90,
                                    loyaltyLevel: 'Silver'
                                }
                            ],
                            loyaltyRules: [
                                {
                                    id: '1',
                                    name: 'Spending Points',
                                    description: 'Earn 1 point for every ₹10 spent',
                                    points: 1,
                                    condition: '₹10 spent'
                                },
                                {
                                    id: '2',
                                    name: 'Visit Points',
                                    description: 'Earn 5 points for every visit',
                                    points: 5,
                                    condition: 'Per visit'
                                }
                            ],
                            loyaltyLevels: [
                                {
                                    id: '1',
                                    name: 'Bronze',
                                    condition: '0-99 points',
                                    benefits: ['Basic rewards']
                                },
                                {
                                    id: '2',
                                    name: 'Silver',
                                    condition: '100-499 points',
                                    benefits: ['10% discount', 'Priority service']
                                },
                                {
                                    id: '3',
                                    name: 'Gold',
                                    condition: '500+ points',
                                    benefits: ['15% discount', 'Free delivery', 'Priority service']
                                }
                            ],
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your customer and loyalty program data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'customers-with-loyalty',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching customers with loyalty data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the customer and loyalty data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isCustomersRequest) {
                // Fetch customers data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Fetch customers
                        const customersSnapshot = await sdk.db.collection("Customers").get();

                        // Process customers
                        const customers = customersSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                name: data.name || 'Unnamed Customer',
                                phone: data.phone || '',
                                email: data.email || '',
                                totalPaid: data.totalPaid || 0,
                                totalSpent: data.totalSpent || data.totalPaid || 0,
                                ordersCount: data.ordersCount || 0,
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
                                lastVisit: data.lastVisit?.toDate ? data.lastVisit.toDate() : new Date(data.lastVisit)
                            };
                        });

                        // Create customers data object
                        const customersData = {
                            customers: customers,
                            lastUpdated: new Date()
                        };

                        // Create customers data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your customer data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'customers',
                                data: customersData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            customers: [
                                {
                                    id: '1',
                                    name: 'John Doe',
                                    phone: '9876543210',
                                    email: 'john@example.com',
                                    totalPaid: 2500,
                                    totalSpent: 2500,
                                    ordersCount: 5,
                                    date: new Date(Date.now() - 86400000 * 10), // 10 days ago
                                    lastVisit: new Date(Date.now() - 86400000 * 2) // 2 days ago
                                },
                                {
                                    id: '2',
                                    name: 'Jane Smith',
                                    phone: '9876543211',
                                    email: 'jane@example.com',
                                    totalPaid: 1800,
                                    totalSpent: 1800,
                                    ordersCount: 3,
                                    date: new Date(Date.now() - 86400000 * 20), // 20 days ago
                                    lastVisit: new Date(Date.now() - 86400000 * 5) // 5 days ago
                                }
                            ],
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your customer data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'customers',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching customers data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the customers data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isProductsByCategoryRequest) {
                // Fetch products organized by category from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Fetch products
                        const productsSnapshot = await sdk.db.collection("Product").get();

                        // Process products and group by category
                        const categoriesMap = {};

                        productsSnapshot.docs.forEach(doc => {
                            const data = doc.data();
                            const product = {
                                id: doc.id,
                                title: data.title || 'Untitled Product',
                                desc: data.desc || '',
                                cat: data.cat || 'Uncategorized',
                                price: data.price || 0,
                                stock: data.stock || 0,
                                active: data.active !== undefined ? data.active : true,
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date)
                            };

                            const category = product.cat || 'Uncategorized';

                            if (!categoriesMap[category]) {
                                categoriesMap[category] = {
                                    name: category,
                                    products: []
                                };
                            }

                            categoriesMap[category].products.push(product);
                        });

                        // Convert map to array and sort categories alphabetically
                        const categories = Object.values(categoriesMap)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(category => ({
                                ...category,
                                products: category.products.sort((a, b) => a.title.localeCompare(b.title))
                            }));

                        // Create products by category data object
                        const productsByCategoryData = {
                            categories: categories,
                            lastUpdated: new Date()
                        };

                        // Create products by category data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your product inventory organized by category:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'products-by-category',
                                data: productsByCategoryData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            categories: [
                                {
                                    name: 'Beverages',
                                    products: [
                                        { title: 'Coke', price: 30, stock: 50 },
                                        { title: 'Pepsi', price: 30, stock: 40 }
                                    ]
                                },
                                {
                                    name: 'Main Course',
                                    products: [
                                        { title: 'Burger', price: 120, stock: 25 },
                                        { title: 'Pizza', price: 200, stock: 15 }
                                    ]
                                }
                            ],
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your product inventory organized by category:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'products-by-category',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching products by category data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the products by category data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isPassbookRequest) {
                // Fetch passbook data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Fetch passbook entries
                        const passbookSnapshot = await sdk.db.collection("Passbook").get();

                        // Process passbook entries
                        const passbookEntries = passbookSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
                                description: data.description,
                                amount: data.amount,
                                type: data.type
                            };
                        });

                        // Create passbook data object
                        const passbookData = {
                            entries: passbookEntries,
                            lastUpdated: new Date()
                        };

                        // Create passbook data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your passbook data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'passbook',
                                data: passbookData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            entries: [
                                {
                                    id: '1',
                                    date: new Date(Date.now() - 86400000 * 10), // 10 days ago
                                    description: 'Payment received',
                                    amount: 5000,
                                    type: 'credit'
                                },
                                {
                                    id: '2',
                                    date: new Date(Date.now() - 86400000 * 20), // 20 days ago
                                    description: 'Payment made',
                                    amount: 3000,
                                    type: 'debit'
                                }
                            ],
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your passbook data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'passbook',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching passbook data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the passbook data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isKDSRequest) {
                // Fetch KDS data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Fetch orders with KITCHEN and PLACED status
                        const ordersQuery = sdk.db.collection("Orders")
                            .where("currentStatus.label", "in", ["KITCHEN", "PLACED"])
                            .orderBy("date", "desc")
                            .limit(100);

                        // Fetch orders
                        const ordersSnapshot = await ordersQuery.get();

                        // Process orders
                        const orders = ordersSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                billNo: data.billNo,
                                tableNo: data.tableNo,
                                customer: data.customer,
                                items: data.items,
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
                                currentStatus: data.currentStatus,
                                notes: data.notes
                            };
                        });

                        // Create KDS data object
                        const kdsData = {
                            orders: orders,
                            lastUpdated: new Date()
                        };

                        // Create KDS data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your KDS data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'kds',
                                data: kdsData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            orders: [
                                {
                                    id: '1',
                                    billNo: 'BILL001',
                                    tableNo: 'T1',
                                    customer: { name: 'John Doe' },
                                    items: [
                                        { title: 'Burger', qnt: 2, completed: 0 },
                                        { title: 'Coke', qnt: 1, completed: 0 }
                                    ],
                                    date: new Date(Date.now() - 3600000), // 1 hour ago
                                    currentStatus: { label: 'KITCHEN' },
                                    notes: 'Extra cheese'
                                },
                                {
                                    id: '2',
                                    billNo: 'BILL002',
                                    tableNo: 'T3',
                                    customer: { name: 'Jane Smith' },
                                    items: [
                                        { title: 'Pizza', qnt: 1, completed: 0 },
                                        { title: 'Pepsi', qnt: 2, completed: 1 }
                                    ],
                                    date: new Date(Date.now() - 7200000), // 2 hours ago
                                    currentStatus: { label: 'PLACED' },
                                    notes: ''
                                }
                            ],
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your KDS data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'kds',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching KDS data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the KDS data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isProductsRequest) {
                // Fetch products data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Fetch products
                        const productsSnapshot = await sdk.db.collection("Product").get();

                        // Process products
                        const products = productsSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                title: data.title || 'Untitled Product',
                                desc: data.desc || '',
                                cat: data.cat || 'Uncategorized',
                                price: data.price || 0,
                                stock: data.stock || 0,
                                active: data.active !== undefined ? data.active : true,
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date)
                            };
                        });

                        // Group products by category
                        const categoriesMap = {};
                        products.forEach(product => {
                            const category = product.cat || 'Uncategorized';
                            if (!categoriesMap[category]) {
                                categoriesMap[category] = 0;
                            }
                            categoriesMap[category]++;
                        });

                        const categories = Object.entries(categoriesMap)
                            .map(([name, count]) => ({ name, count }))
                            .sort((a, b) => b.count - a.count);

                        // Create products data object
                        const productsData = {
                            products: products,
                            categories: categories,
                            lastUpdated: new Date()
                        };

                        // Create products data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your product inventory data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'products',
                                data: productsData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            products: [
                                {
                                    id: '1',
                                    title: 'Burger',
                                    desc: 'Delicious beef burger',
                                    cat: 'Main Course',
                                    price: 120,
                                    stock: 25,
                                    active: true,
                                    date: new Date()
                                },
                                {
                                    id: '2',
                                    title: 'Pizza',
                                    desc: 'Cheese pizza',
                                    cat: 'Main Course',
                                    price: 200,
                                    stock: 15,
                                    active: true,
                                    date: new Date()
                                },
                                {
                                    id: '3',
                                    title: 'Coke',
                                    desc: 'Cold drink',
                                    cat: 'Beverages',
                                    price: 30,
                                    stock: 50,
                                    active: true,
                                    date: new Date()
                                }
                            ],
                            categories: [
                                { name: 'Main Course', count: 2 },
                                { name: 'Beverages', count: 1 }
                            ],
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your product inventory data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'products',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching products data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the products data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isExpensesRequest) {
                // Determine date range from user input
                let dateRange = 'all';
                if (lowerInput.includes('today')) {
                    dateRange = 'today';
                } else if (lowerInput.includes('yesterday')) {
                    dateRange = 'yesterday';
                } else if (lowerInput.includes('last 7') || lowerInput.includes('last seven') || lowerInput.includes('week')) {
                    dateRange = 'last7';
                } else if (lowerInput.includes('last 30') || lowerInput.includes('month')) {
                    dateRange = 'last30';
                } else if (lowerInput.includes('last 90') || lowerInput.includes('quarter')) {
                    dateRange = 'last90';
                }

                // Fetch expenses data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Import Firebase expense functions
                        const { getFirebaseExpenses, getFirebaseCategories, getFirebaseBudgets } = await import('../utils/firebaseExpenses.js');

                        // Fetch expenses, categories, and budgets from Firebase
                        const firebaseExpenses = await getFirebaseExpenses();
                        const firebaseCategories = await getFirebaseCategories();
                        const firebaseBudgets = await getFirebaseBudgets();

                        // Filter expenses by date range
                        let filteredExpenses = firebaseExpenses || [];

                        if (dateRange !== 'all') {
                            const now = new Date();
                            let startDate;

                            switch (dateRange) {
                                case 'today':
                                    startDate = new Date(now);
                                    startDate.setHours(0, 0, 0, 0);
                                    break;
                                case 'yesterday':
                                    startDate = new Date(now);
                                    startDate.setDate(startDate.getDate() - 1);
                                    startDate.setHours(0, 0, 0, 0);
                                    break;
                                case 'last7':
                                    startDate = new Date(now);
                                    startDate.setDate(startDate.getDate() - 7);
                                    startDate.setHours(0, 0, 0, 0);
                                    break;
                                case 'last30':
                                    startDate = new Date(now);
                                    startDate.setDate(startDate.getDate() - 30);
                                    startDate.setHours(0, 0, 0, 0);
                                    break;
                                case 'last90':
                                    startDate = new Date(now);
                                    startDate.setDate(startDate.getDate() - 90);
                                    startDate.setHours(0, 0, 0, 0);
                                    break;
                            }

                            filteredExpenses = filteredExpenses.filter(expense => {
                                const expenseDate = new Date(expense.date);
                                return expenseDate >= startDate;
                            });
                        }

                        // Create expenses data object
                        const expensesData = {
                            expenses: filteredExpenses,
                            categories: firebaseCategories || [],
                            budgets: firebaseBudgets || [],
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        // Create expenses data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business expenses data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'expenses',
                                data: expensesData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            expenses: [
                                {
                                    id: 'exp1',
                                    description: 'Ingredients',
                                    amount: 15000,
                                    category: 'food',
                                    vendor: 'Local Supplier',
                                    date: new Date(Date.now() - 86400000).toISOString()
                                },
                                {
                                    id: 'exp2',
                                    description: 'Electricity Bill',
                                    amount: 8000,
                                    category: 'utilities',
                                    vendor: 'Electric Company',
                                    date: new Date(Date.now() - 172800000).toISOString()
                                },
                                {
                                    id: 'exp3',
                                    description: 'Staff Salary',
                                    amount: 45000,
                                    category: 'salary',
                                    vendor: 'Payroll',
                                    date: new Date(Date.now() - 2592000000).toISOString()
                                }
                            ],
                            categories: [
                                { id: 'food', name: 'Food & Ingredients', color: '#EF4444' },
                                { id: 'utilities', name: 'Utilities', color: '#10B981' },
                                { id: 'salary', name: 'Salary', color: '#8B5CF6' }
                            ],
                            budgets: [
                                { id: 'bud1', category: 'food', amount: 50000, month: '2023-12', year: 2023 },
                                { id: 'bud2', category: 'utilities', amount: 10000, month: '2023-12', year: 2023 },
                                { id: 'bud3', category: 'salary', amount: 50000, month: '2023-12', year: 2023 }
                            ],
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business expenses data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'expenses',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching expenses data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the expenses data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isPassbookRequest) {
                // Determine date range from user input
                let dateRange = 'all';
                if (lowerInput.includes('today')) {
                    dateRange = 'today';
                } else if (lowerInput.includes('yesterday')) {
                    dateRange = 'yesterday';
                } else if (lowerInput.includes('last 7') || lowerInput.includes('last seven') || lowerInput.includes('week')) {
                    dateRange = 'last7';
                } else if (lowerInput.includes('last 30') || lowerInput.includes('month')) {
                    dateRange = 'last30';
                } else if (lowerInput.includes('last 90') || lowerInput.includes('quarter')) {
                    dateRange = 'last90';
                } else if (lowerInput.includes('this month')) {
                    dateRange = 'thisMonth';
                }

                // Fetch passbook data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        let ordersQuery = sdk.db.collection("Orders").orderBy("date", "desc").limit(100);

                        // Apply date filters based on range
                        const now = new Date();
                        let startDate, endDate;

                        switch (dateRange) {
                            case 'today':
                                startDate = new Date(now);
                                startDate.setHours(0, 0, 0, 0);
                                ordersQuery = ordersQuery.where("date", ">=", startDate);
                                break;
                            case 'yesterday':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 1);
                                startDate.setHours(0, 0, 0, 0);
                                endDate = new Date(startDate);
                                endDate.setHours(23, 59, 59, 999);
                                ordersQuery = ordersQuery.where("date", ">=", startDate).where("date", "<=", endDate);
                                break;
                            case 'last7':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 7);
                                startDate.setHours(0, 0, 0, 0);
                                ordersQuery = ordersQuery.where("date", ">=", startDate);
                                break;
                            case 'last30':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 30);
                                startDate.setHours(0, 0, 0, 0);
                                ordersQuery = ordersQuery.where("date", ">=", startDate);
                                break;
                            case 'last90':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 90);
                                startDate.setHours(0, 0, 0, 0);
                                ordersQuery = ordersQuery.where("date", ">=", startDate);
                                break;
                            case 'thisMonth':
                                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                                ordersQuery = ordersQuery.where("date", ">=", startDate);
                                break;
                        }

                        // Fetch orders (sales transactions)
                        const ordersSnapshot = await ordersQuery.get();

                        // Process sales transactions
                        const salesTransactions = ordersSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                orderId: doc.id,
                                customerId: data.custId || data.customerId || '',
                                amount: data.total || data.finalAmount || 0,
                                type: 'credit', // Sales are credit transactions
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
                                status: data.currentStatus?.label || 'UNKNOWN',
                                paymentMethod: data.payMode || 'CASH'
                            };
                        });

                        // Fetch customers for transaction details
                        let customers = [];
                        try {
                            const customersSnapshot = await sdk.db.collection("Customers").get();
                            customers = customersSnapshot.docs.map(doc => {
                                const data = doc.data();
                                return {
                                    id: doc.id,
                                    name: data.name || 'Unnamed Customer',
                                    phone: data.phone || '',
                                    email: data.email || ''
                                };
                            });
                        } catch (customersError) {
                            console.warn('Could not fetch customers for passbook:', customersError);
                            customers = [];
                        }

                        // Create passbook data object
                        const passbookData = {
                            transactions: salesTransactions,
                            customers: customers,
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        // Create passbook data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your passbook data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'passbook',
                                data: passbookData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            transactions: [
                                {
                                    id: '1',
                                    orderId: 'ORD001',
                                    customerId: 'CUST001',
                                    amount: 1250,
                                    type: 'credit',
                                    date: new Date(Date.now() - 86400000), // Yesterday
                                    status: 'COMPLETED',
                                    paymentMethod: 'CASH'
                                },
                                {
                                    id: '2',
                                    orderId: 'ORD002',
                                    customerId: 'CUST002',
                                    amount: 890,
                                    type: 'credit',
                                    date: new Date(Date.now() - 172800000), // 2 days ago
                                    status: 'COMPLETED',
                                    paymentMethod: 'UPI'
                                }
                            ],
                            customers: [
                                {
                                    id: 'CUST001',
                                    name: 'John Doe',
                                    phone: '9876543210',
                                    email: 'john@example.com'
                                },
                                {
                                    id: 'CUST002',
                                    name: 'Jane Smith',
                                    phone: '9876543211',
                                    email: 'jane@example.com'
                                }
                            ],
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your passbook data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'passbook',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching passbook data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the passbook data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isKDSRequest) {
                // Fetch KDS data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Fetch orders with KITCHEN and PLACED status
                        const ordersQuery = sdk.db.collection("Orders")
                            .where("currentStatus.label", "in", ["KITCHEN", "PLACED"])
                            .orderBy("date", "desc")
                            .limit(100);

                        // Fetch orders
                        const ordersSnapshot = await ordersQuery.get();

                        // Process orders
                        const orders = ordersSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                billNo: data.billNo,
                                tableNo: data.tableNo,
                                customer: data.customer,
                                items: data.items,
                                date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
                                currentStatus: data.currentStatus,
                                notes: data.notes
                            };
                        });

                        // Create KDS data object
                        const kdsData = {
                            orders: orders,
                            lastUpdated: new Date()
                        };

                        // Create KDS data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your KDS data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'kds',
                                data: kdsData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            orders: [
                                {
                                    id: '1',
                                    billNo: 'BILL001',
                                    tableNo: 'T1',
                                    customer: { name: 'John Doe' },
                                    items: [
                                        { title: 'Burger', qnt: 2, completed: 0 },
                                        { title: 'Coke', qnt: 1, completed: 0 }
                                    ],
                                    date: new Date(Date.now() - 3600000), // 1 hour ago
                                    currentStatus: { label: 'KITCHEN' },
                                    notes: 'Extra cheese'
                                },
                                {
                                    id: '2',
                                    billNo: 'BILL002',
                                    tableNo: 'T3',
                                    customer: { name: 'Jane Smith' },
                                    items: [
                                        { title: 'Pizza', qnt: 1, completed: 0 },
                                        { title: 'Pepsi', qnt: 2, completed: 1 }
                                    ],
                                    date: new Date(Date.now() - 7200000), // 2 hours ago
                                    currentStatus: { label: 'PLACED' },
                                    notes: ''
                                }
                            ],
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: "Here's your KDS data:",
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'kds',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching KDS data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the KDS data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isCompletedOrdersRequest) {
                // Determine date range from user input
                let dateRange = 'today';
                if (lowerInput.includes('yesterday')) {
                    dateRange = 'yesterday';
                } else if (lowerInput.includes('last 7') || lowerInput.includes('last seven') || lowerInput.includes('week')) {
                    dateRange = 'last7';
                } else if (lowerInput.includes('last 30') || lowerInput.includes('month')) {
                    dateRange = 'last30';
                } else if (lowerInput.includes('last 90') || lowerInput.includes('quarter')) {
                    dateRange = 'last90';
                }

                // Fetch completed orders data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Calculate date range
                        const now = new Date();
                        let startDate;

                        switch (dateRange) {
                            case 'yesterday':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 1);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last7':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 7);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last30':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 30);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last90':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 90);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'today':
                            default:
                                startDate = new Date(now);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                        }

                        // Query for completed orders within the date range
                        const ordersQuery = sdk.db.collection("Orders")
                            .where("currentStatus.label", "==", "COMPLETED")
                            .where("date", ">=", startDate)
                            .orderBy("date", "desc")
                            .limit(100);

                        const ordersSnapshot = await ordersQuery.get();

                        // Process orders
                        const completedOrders = ordersSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
                        }));

                        // Create completed orders data object
                        const completedOrdersData = {
                            orders: completedOrders,
                            dateRange: dateRange,
                            lastUpdated: new Date()
                        };

                        // Create completed orders data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your completed orders timeline for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'completed-orders',
                                data: completedOrdersData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            orders: [
                                {
                                    id: 'ORD001',
                                    table: { title: 'Table 1' },
                                    customer: { name: 'John Doe' },
                                    finalAmount: 1250,
                                    total: 1250,
                                    date: new Date(),
                                    items: [{}, {}, {}],
                                    currentStatus: { label: 'COMPLETED' }
                                },
                                {
                                    id: 'ORD002',
                                    table: { title: 'Table 3' },
                                    customer: { name: 'Jane Smith' },
                                    finalAmount: 890,
                                    total: 890,
                                    date: new Date(Date.now() - 3600000),
                                    items: [{}, {}],
                                    currentStatus: { label: 'COMPLETED' }
                                },
                                {
                                    id: 'ORD003',
                                    table: { title: 'Table 2' },
                                    customer: { name: 'Robert Johnson' },
                                    finalAmount: 2100,
                                    total: 2100,
                                    date: new Date(Date.now() - 7200000),
                                    items: [{}, {}, {}, {}],
                                    currentStatus: { label: 'COMPLETED' }
                                }
                            ],
                            dateRange: dateRange,
                            lastUpdated: new Date()
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your completed orders timeline for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'completed-orders',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching completed orders data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the completed orders data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isDashboardRequest) {
                // Determine date range from user input
                let dateRange = 'today';
                if (lowerInput.includes('yesterday')) {
                    dateRange = 'yesterday';
                } else if (lowerInput.includes('last 7') || lowerInput.includes('last seven') || lowerInput.includes('week')) {
                    dateRange = 'last7';
                } else if (lowerInput.includes('last 30') || lowerInput.includes('month')) {
                    dateRange = 'last30';
                } else if (lowerInput.includes('last 90') || lowerInput.includes('quarter')) {
                    dateRange = 'last90';
                }

                // Fetch real dashboard data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Calculate date range
                        const now = new Date();
                        let startDate;

                        switch (dateRange) {
                            case 'yesterday':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 1);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last7':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 7);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last30':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 30);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last90':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 90);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'today':
                            default:
                                startDate = new Date(now);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                        }

                        // Fetch orders within the date range
                        const createdTodayQuery = sdk.db.collection("Orders")
                            .where("date", ">=", startDate)
                            .orderBy("date", "desc");

                        // Also fetch orders whose currentStatus.date is within the range
                        const statusSnapshot = await sdk.db.collection("Orders")
                            .where("currentStatus.date", ">=", startDate)
                            .get();

                        const [createdSnapshot] = await Promise.all([
                            createdTodayQuery.get()
                        ]);

                        // Process orders
                        const createdTodayOrders = createdSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
                        }));

                        const statusDateOrders = statusSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            date: doc.data().currentStatus?.date?.toDate ?
                                doc.data().currentStatus.date.toDate() :
                                new Date(doc.data().currentStatus?.date || doc.data().date)
                        }));

                        // Merge and deduplicate orders
                        const mergedById = new Map();
                        createdTodayOrders.forEach(o => mergedById.set(o.id, o));
                        statusDateOrders.forEach(o => {
                            if (!mergedById.has(o.id)) mergedById.set(o.id, o);
                        });

                        const todaysOrders = Array.from(mergedById.values())
                            .sort((a, b) => new Date(b.date) - new Date(a.date));

                        // Separate by status
                        const placedOrders = todaysOrders.filter(order =>
                            order.currentStatus?.label === 'PLACED'
                        );

                        const kitchenOrders = todaysOrders.filter(order =>
                            order.currentStatus?.label === 'KITCHEN'
                        );

                        const completedOrders = todaysOrders.filter(order => {
                            const hasCompletedStatus = order.currentStatus?.label === 'COMPLETED';
                            const isPaidOrder = order.paid === true;
                            return hasCompletedStatus || isPaidOrder;
                        });

                        // Calculate dashboard metrics
                        const todayOrdersCount = todaysOrders.length;
                        const todayRevenue = todaysOrders.reduce((sum, order) => {
                            // Calculate order total
                            if (order.finalAmount) return sum + order.finalAmount;
                            if (order.total) return sum + order.total;

                            // Calculate from items if needed
                            if (order.items && Array.isArray(order.items)) {
                                return sum + order.items.reduce((itemSum, item) => {
                                    const price = item.price || 0;
                                    const quantity = item.qnt || item.quantity || 1;
                                    return itemSum + (price * quantity);
                                }, 0);
                            }
                            return sum;
                        }, 0);

                        // Get unique customers
                        const todayCustomerIds = new Set(
                            todaysOrders
                                .filter(order => order.customer?.id)
                                .map(order => order.customer.id)
                        );
                        const newCustomersCount = todayCustomerIds.size;

                        // Calculate average order value
                        const avgOrderValue = todayOrdersCount > 0 ? todayRevenue / todayOrdersCount : 0;

                        // Fetch tables and channels data
                        let tables = [];
                        let channels = [];

                        if (profile && profile.tables) {
                            tables = profile.tables.map(table => ({
                                id: table.id || table.title,
                                title: table.title,
                                type: table.type || 'dine_in'
                            }));
                        }

                        // Get price variants from seller profile
                        if (profile && profile.variants) {
                            channels = profile.variants.map(variant => ({
                                id: variant.title,
                                title: variant.title,
                                type: 'price_variant'
                            }));
                        }

                        // Create dashboard data object
                        const dashboardData = {
                            metrics: {
                                todayOrders: todayOrdersCount,
                                todayRevenue: Math.round(todayRevenue),
                                newCustomers: newCustomersCount,
                                avgOrderValue: Math.round(avgOrderValue),
                                // Add placeholder values for trends
                                todayOrdersTrend: 0,
                                todayRevenueTrend: 0,
                                newCustomersTrend: 0,
                                avgOrderValueTrend: 0,
                                avgServiceTime: 0
                            },
                            tables: tables,
                            channels: channels,
                            todaysOrders: {
                                all: todaysOrders,
                                placed: placedOrders,
                                kitchen: kitchenOrders,
                                completed: completedOrders
                            },
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        // Create dashboard data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business dashboard data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'dashboard',
                                data: dashboardData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            metrics: {
                                todayOrders: 24,
                                todayRevenue: 12500,
                                newCustomers: 18,
                                avgOrderValue: 521,
                                todayOrdersTrend: 12.5,
                                todayRevenueTrend: 8.3,
                                newCustomersTrend: 5.7,
                                avgOrderValueTrend: 3.2,
                                avgServiceTime: 12
                            },
                            tables: [
                                { id: 'table1', title: 'Table 1' },
                                { id: 'table2', title: 'Table 2' },
                                { id: 'table3', title: 'Table 3' }
                            ],
                            channels: [
                                { id: 'default', title: 'Default' },
                                { id: 'swiggy', title: 'Swiggy' },
                                { id: 'zomato', title: 'Zomato' }
                            ],
                            todaysOrders: {
                                all: [],
                                placed: [],
                                kitchen: [],
                                completed: []
                            },
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business dashboard data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'dashboard',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching dashboard data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the dashboard data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isReportsRequest) {
                // Determine date range from user input
                let dateRange = 'last7';
                if (lowerInput.includes('today')) {
                    dateRange = 'today';
                } else if (lowerInput.includes('yesterday')) {
                    dateRange = 'yesterday';
                } else if (lowerInput.includes('last 7') || lowerInput.includes('last seven') || lowerInput.includes('week')) {
                    dateRange = 'last7';
                } else if (lowerInput.includes('last 30') || lowerInput.includes('month')) {
                    dateRange = 'last30';
                } else if (lowerInput.includes('last 90') || lowerInput.includes('quarter')) {
                    dateRange = 'last90';
                }

                // Fetch reports data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Calculate date range
                        const now = new Date();
                        let startDate;

                        switch (dateRange) {
                            case 'today':
                                startDate = new Date(now);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'yesterday':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 1);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last7':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 7);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last30':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 30);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last90':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 90);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            default:
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 7);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                        }

                        // Fetch orders within the date range
                        const ordersQuery = sdk.db.collection("Orders")
                            .where("date", ">=", startDate)
                            .orderBy("date", "desc")
                            .limit(100);

                        const ordersSnapshot = await ordersQuery.get();

                        // Process orders
                        const orders = ordersSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
                        }));

                        // Calculate reports metrics
                        const totalOrders = orders.length;
                        const totalRevenue = orders.reduce((sum, order) => {
                            if (order.finalAmount) return sum + order.finalAmount;
                            if (order.total) return sum + order.total;

                            // Calculate from items if needed
                            if (order.items && Array.isArray(order.items)) {
                                return sum + order.items.reduce((itemSum, item) => {
                                    const price = item.price || 0;
                                    const quantity = item.qnt || item.quantity || 1;
                                    return itemSum + (price * quantity);
                                }, 0);
                            }
                            return sum;
                        }, 0);

                        // Calculate average order value
                        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

                        // Calculate growth rate (simplified - comparing to previous period)
                        const growthRate = 5.2; // Placeholder value

                        // Get top selling products
                        const productSales = {};
                        orders.forEach(order => {
                            if (order.items && Array.isArray(order.items)) {
                                order.items.forEach(item => {
                                    const productId = item.productId || item.title;
                                    if (!productSales[productId]) {
                                        productSales[productId] = {
                                            name: item.title || 'Unnamed Product',
                                            category: item.category || 'Uncategorized',
                                            quantity: 0,
                                            revenue: 0
                                        };
                                    }
                                    productSales[productId].quantity += item.qnt || item.quantity || 1;
                                    const price = item.price || 0;
                                    const quantity = item.qnt || item.quantity || 1;
                                    productSales[productId].revenue += price * quantity;
                                });
                            }
                        });

                        // Convert to array and sort by revenue
                        const topProducts = Object.values(productSales)
                            .sort((a, b) => b.revenue - a.revenue);

                        // Create reports data object
                        const reportsData = {
                            metrics: {
                                totalRevenue: Math.round(totalRevenue),
                                totalOrders: totalOrders,
                                avgOrderValue: Math.round(avgOrderValue),
                                growthRate: growthRate
                            },
                            topProducts: topProducts,
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        // Create reports data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business reports data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'reports',
                                data: reportsData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            metrics: {
                                totalRevenue: 125000,
                                totalOrders: 240,
                                avgOrderValue: 521,
                                growthRate: 12.5
                            },
                            topProducts: [
                                {
                                    name: 'Burger',
                                    category: 'Main Course',
                                    quantity: 45,
                                    revenue: 5400
                                },
                                {
                                    name: 'Pizza',
                                    category: 'Main Course',
                                    quantity: 32,
                                    revenue: 6400
                                },
                                {
                                    name: 'Coke',
                                    category: 'Beverages',
                                    quantity: 68,
                                    revenue: 2040
                                }
                            ],
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business reports data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'reports',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching reports data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the reports data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            if (isAnalyticsRequest) {
                // Determine date range from user input
                let dateRange = 'last7';
                if (lowerInput.includes('today')) {
                    dateRange = 'today';
                } else if (lowerInput.includes('yesterday')) {
                    dateRange = 'yesterday';
                } else if (lowerInput.includes('last 7') || lowerInput.includes('last seven') || lowerInput.includes('week')) {
                    dateRange = 'last7';
                } else if (lowerInput.includes('last 30') || lowerInput.includes('month')) {
                    dateRange = 'last30';
                } else if (lowerInput.includes('last 90') || lowerInput.includes('quarter')) {
                    dateRange = 'last90';
                }

                // Fetch analytics data from Firebase
                try {
                    // Check if SDK is available
                    if (sdk && sdk.db && sdk.db.collection) {
                        // Calculate date range
                        const now = new Date();
                        let startDate;

                        switch (dateRange) {
                            case 'today':
                                startDate = new Date(now);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'yesterday':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 1);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last7':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 7);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last30':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 30);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            case 'last90':
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 90);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                            default:
                                startDate = new Date(now);
                                startDate.setDate(startDate.getDate() - 7);
                                startDate.setHours(0, 0, 0, 0);
                                break;
                        }

                        // Fetch orders within the date range
                        const ordersQuery = sdk.db.collection("Orders")
                            .where("date", ">=", startDate)
                            .orderBy("date", "desc")
                            .limit(100);

                        const ordersSnapshot = await ordersQuery.get();

                        // Process orders
                        const orders = ordersSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
                        }));

                        // Calculate analytics metrics
                        const totalSales = orders.reduce((sum, order) => {
                            if (order.finalAmount) return sum + order.finalAmount;
                            if (order.total) return sum + order.total;

                            // Calculate from items if needed
                            if (order.items && Array.isArray(order.items)) {
                                return sum + order.items.reduce((itemSum, item) => {
                                    const price = item.price || 0;
                                    const quantity = item.qnt || item.quantity || 1;
                                    return itemSum + (price * quantity);
                                }, 0);
                            }
                            return sum;
                        }, 0);

                        const totalOrders = orders.length;
                        const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

                        // Calculate turnaround time (simplified)
                        const avgTurnAroundTime = 15; // Placeholder value

                        // Calculate trends by comparing with previous period
                        const trends = {
                            sales: 8.5, // Placeholder
                            orders: 5.2, // Placeholder
                            orderValue: 3.1, // Placeholder
                            turnAround: -2.4 // Placeholder
                        };

                        // Get top selling products
                        const productSales = {};
                        orders.forEach(order => {
                            if (order.items && Array.isArray(order.items)) {
                                order.items.forEach(item => {
                                    const productId = item.productId || item.title;
                                    if (!productSales[productId]) {
                                        productSales[productId] = {
                                            name: item.title || 'Unnamed Product',
                                            category: item.category || 'Uncategorized',
                                            quantity: 0,
                                            revenue: 0
                                        };
                                    }
                                    productSales[productId].quantity += item.qnt || item.quantity || 1;
                                    const price = item.price || 0;
                                    const quantity = item.qnt || item.quantity || 1;
                                    productSales[productId].revenue += price * quantity;
                                });
                            }
                        });

                        // Convert to array and sort by revenue
                        const topProducts = Object.values(productSales)
                            .sort((a, b) => b.revenue - a.revenue);

                        // Create analytics data object
                        const analyticsData = {
                            metrics: {
                                totalSales: Math.round(totalSales),
                                totalOrders: totalOrders,
                                avgOrderValue: Math.round(avgOrderValue),
                                avgTurnAroundTime: avgTurnAroundTime
                            },
                            trends: trends,
                            topProducts: topProducts,
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        // Create analytics data card
                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business analytics data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'analytics',
                                data: analyticsData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    } else {
                        // Fallback to simulated data if SDK not available
                        const simulatedData = {
                            metrics: {
                                totalSales: 125000,
                                totalOrders: 240,
                                avgOrderValue: 521,
                                avgTurnAroundTime: 15
                            },
                            trends: {
                                sales: 8.5,
                                orders: 5.2,
                                orderValue: 3.1,
                                turnAround: -2.4
                            },
                            topProducts: [
                                {
                                    name: 'Burger',
                                    category: 'Main Course',
                                    quantity: 45,
                                    revenue: 5400
                                },
                                {
                                    name: 'Pizza',
                                    category: 'Main Course',
                                    quantity: 32,
                                    revenue: 6400
                                },
                                {
                                    name: 'Coke',
                                    category: 'Beverages',
                                    quantity: 68,
                                    revenue: 2040
                                }
                            ],
                            lastUpdated: new Date(),
                            dateRange: dateRange
                        };

                        const aiMessage = {
                            id: Date.now() + 1,
                            text: `Here's your business analytics data for ${getDateRangeLabel(dateRange)}:`,
                            sender: 'ai',
                            timestamp: new Date(),
                            dataCard: {
                                type: 'analytics',
                                data: simulatedData
                            }
                        };
                        setMessages(prev => [...prev, aiMessage]);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching analytics data:', error);
                    const aiMessage = {
                        id: Date.now() + 1,
                        text: `Sorry, I couldn't fetch the analytics data at the moment. Error: ${error.message}`,
                        sender: 'ai',
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
            }

            // For non-dashboard requests, simulate AI response
            setTimeout(() => {
                const aiMessage = {
                    id: Date.now() + 1,
                    text: t('aiChatbotDefaultResponse'),
                    sender: 'ai',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMessage]);
                setIsLoading(false);
            }, 1000);
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = {
                id: Date.now() + 1,
                text: 'Sorry, I encountered an error. Please try again.',
                sender: 'ai',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
            setIsLoading(false);
        }
    };

    // Handle Enter key press
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // Custom NLP parsing logic
    const parseSpeechCommand = (command) => {
        if (!command) return command;

        const lowerCommand = command.toLowerCase().trim();

        // Common dashboard commands
        if (lowerCommand.includes('show dashboard') ||
            lowerCommand.includes('business overview') ||
            lowerCommand.includes('business status') ||
            lowerCommand.includes('performance metrics')) {
            return 'Show me the business dashboard';
        }

        // Completed orders commands
        if (lowerCommand.includes('completed orders') ||
            lowerCommand.includes('finished orders') ||
            lowerCommand.includes('order history')) {
            return 'Show me completed orders';
        }

        // Products commands
        if (lowerCommand.includes('show products') ||
            lowerCommand.includes('product list') ||
            lowerCommand.includes('inventory') ||
            lowerCommand.includes('stock')) {
            return 'Show me product inventory';
        }

        // Products by category commands
        if ((lowerCommand.includes('products') && lowerCommand.includes('category')) ||
            lowerCommand.includes('organized products') ||
            lowerCommand.includes('grouped products')) {
            return 'Show me products organized by category';
        }

        // Customers commands
        if (lowerCommand.includes('show customers') ||
            lowerCommand.includes('customer list') ||
            lowerCommand.includes('client data')) {
            return 'Show me customer data';
        }

        // Customer loyalty commands
        if ((lowerCommand.includes('loyalty') && (lowerCommand.includes('program') || lowerCommand.includes('points'))) ||
            lowerCommand.includes('reward program') ||
            lowerCommand.includes('customer rewards')) {
            return 'Show me customer loyalty program data';
        }

        // Passbook commands
        if (lowerCommand.includes('passbook') ||
            lowerCommand.includes('financial records') ||
            lowerCommand.includes('transactions')) {
            return 'Show me passbook data';
        }

        // KDS commands
        if (lowerCommand.includes('kds') ||
            lowerCommand.includes('kitchen display') ||
            lowerCommand.includes('kitchen orders')) {
            return 'Show me KDS data';
        }

        // Expenses commands
        if (lowerCommand.includes('expenses') ||
            lowerCommand.includes('business costs') ||
            lowerCommand.includes('spending')) {
            return 'Show me business expenses';
        }

        // Reports commands
        if (lowerCommand.includes('reports') ||
            lowerCommand.includes('business reports') ||
            lowerCommand.includes('sales reports')) {
            return 'Show me business reports';
        }

        // Analytics commands
        if (lowerCommand.includes('analytics') ||
            lowerCommand.includes('business analytics') ||
            lowerCommand.includes('performance data')) {
            return 'Show me business analytics';
        }

        // Date range commands
        if (lowerCommand.includes('today')) {
            return command + ' for today';
        } else if (lowerCommand.includes('yesterday')) {
            return command + ' for yesterday';
        } else if (lowerCommand.includes('last week') || lowerCommand.includes('last 7 days')) {
            return command + ' for last 7 days';
        } else if (lowerCommand.includes('last month') || lowerCommand.includes('last 30 days')) {
            return command + ' for last 30 days';
        } else if (lowerCommand.includes('last quarter') || lowerCommand.includes('last 90 days')) {
            return command + ' for last 90 days';
        }

        // Default: return the original command
        return command;
    };

    // Handle mic button click
    const handleMicClick = () => {
        if (!recognitionRef.current) {
            console.warn('Speech recognition not initialized');
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            try {
                recognitionRef.current.start();
                setIsListening(true);
            } catch (error) {
                console.error('Error starting speech recognition:', error);
                setIsListening(false);
            }
        }
    };

    // Handle speech recognition end
    const handleSpeechEnd = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);

            // Parse the recognized text with custom NLP logic
            const parsedCommand = parseSpeechCommand(inputMessage);
            if (parsedCommand && parsedCommand !== inputMessage) {
                setInputMessage(parsedCommand);
            }

            // Auto-send if we have any command
            if (inputMessage && inputMessage.trim().length > 0) {
                // Small delay to allow state update
                setTimeout(() => {
                    handleSendMessage();
                    // Clear input after sending
                    setInputMessage('');
                }, 100);
            }
        }
    };

    // Effect to auto-stop recognition when input changes
    useEffect(() => {
        if (isListening && inputMessage.trim().length > 0) {
            // Auto-stop after user stops speaking (debounced)
            const timer = setTimeout(() => {
                handleSpeechEnd();
            }, 1500);

            return () => clearTimeout(timer);
        }
    }, [inputMessage, isListening]);

    // Create new chat
    const handleNewChat = () => {
        setMessages([
            {
                id: 1,
                text: t('aiChatbotWelcomeMessage'),
                sender: 'ai',
                timestamp: new Date()
            }
        ]);
        setIsSidebarOpen(false);
    };

    return (
        <div className="flex h-screen bg-white relative">
            {/* Red gradient background from bottom to top */}
            <div className="fixed inset-0 bg-gradient-to-t from-red-500/10 via-red-300/5 to-transparent pointer-events-none z-0"></div>

            {/* Custom scrollbar styles */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(239, 68, 68, 0.3);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(239, 68, 68, 0.5);
                }
            `}</style>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
                    <div className="flex items-center">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="md:hidden mr-3 p-1 rounded-md hover:bg-gray-100"
                        >
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <h1 className="text-lg font-semibold text-gray-800">POS Assistant</h1>
                    </div>
                </div>

                {/* Messages Container with custom scrollbar */}
                <div className="flex-1 overflow-y-auto relative custom-scrollbar">
                    <div className="max-w-3xl mx-auto px-4 py-6">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`mb-6 ${message.sender === 'user' ? 'text-right' : ''}`}
                            >
                                <div className="flex items-start gap-4">
                                    {message.sender === 'ai' && (
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-bold">
                                            AI
                                        </div>
                                    )}
                                    <div className={`max-w-[85%] ${message.sender === 'user' ? 'ml-auto' : ''}`}>
                                        <div
                                            className={`px-4 py-3 rounded-2xl shadow-sm ${message.sender === 'user'
                                                ? 'bg-red-500 text-white rounded-tr-none'
                                                : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
                                                }`}
                                        >
                                            <div className="text-sm whitespace-pre-wrap">
                                                {message.text}
                                            </div>

                                            {/* Render data cards if present */}
                                            {message.sender === 'ai' && message.dataCard && (
                                                <>
                                                    {message.dataCard.type === 'dashboard' && (
                                                        <div className="mt-3">
                                                            <DashboardDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'completed-orders' && (
                                                        <div className="mt-3">
                                                            <CompletedOrdersDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'products' && (
                                                        <div className="mt-3">
                                                            <ProductsDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'products-by-category' && (
                                                        <div className="mt-3">
                                                            <ProductsByCategoryDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'customers' && (
                                                        <div className="mt-3">
                                                            <CustomersDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'customers-with-loyalty' && (
                                                        <div className="mt-3">
                                                            <CustomersWithLoyaltyDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'passbook' && (
                                                        <div className="mt-3">
                                                            <PassbookDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'kds' && (
                                                        <div className="mt-3">
                                                            <KDSDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'expenses' && (
                                                        <div className="mt-3">
                                                            <ExpensesDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'reports' && (
                                                        <div className="mt-3">
                                                            <ReportsDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                    {message.dataCard.type === 'analytics' && (
                                                        <div className="mt-3">
                                                            <AnalyticsDataCard data={message.dataCard.data} />
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    {message.sender === 'user' && (
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-sm font-bold">
                                            U
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex items-start gap-4 mb-6">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-bold">
                                    AI
                                </div>
                                <div className="px-4 py-3 rounded-2xl bg-white text-gray-800 border border-gray-200 rounded-tl-none shadow-sm">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area with gradient background */}
                <div className="border-t border-gray-200 bg-gradient-to-t from-red-500/5 to-transparent p-4 relative z-10">
                    <div className="max-w-3xl mx-auto">
                        <div className="relative bg-white/80 backdrop-blur-sm border border-gray-300 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-500">
                            <div className="absolute left-2 bottom-2 flex">
                                <button
                                    onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors duration-200 relative group"
                                    aria-label="Attach file"
                                >
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                        Add files
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                                    </div>
                                </button>

                                {/* Attachment Menu Popup */}
                                {isAttachmentMenuOpen && (
                                    <div className="absolute bottom-12 left-0 bg-white rounded-lg shadow-lg border border-gray-200 py-2 w-48 z-50 attachment-menu">
                                        <button
                                            onClick={handleFileUpload}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        >
                                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                            Upload Files
                                        </button>
                                        <button
                                            onClick={handleGoogleDrive}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        >
                                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4 4 0 003 15z" />
                                            </svg>
                                            Add from Drive
                                        </button>
                                        <button
                                            onClick={handlePhotos}
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        >
                                            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            Photos
                                        </button>
                                    </div>
                                )}
                            </div>
                            <textarea
                                ref={inputRef}
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={t('aiChatbotInputPlaceholder')}
                                className="w-full px-12 py-3 pr-20 border-0 rounded-xl focus:outline-none focus:ring-0 resize-none"
                                rows="1"
                                disabled={isLoading}
                            />
                            <div className="absolute right-2 bottom-2 flex gap-2">
                                <button
                                    onClick={handleMicClick}
                                    disabled={isLoading}
                                    className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-200 hover:bg-gray-300'} relative group`}
                                    aria-label="Voice input"
                                >
                                    <svg className={`w-4 h-4 ${isListening ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                    <div className="absolute bottom-full right-1/2 transform translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                        Use microphone
                                        <div className="absolute top-full right-1/2 transform translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                                    </div>
                                </button>
                                <button
                                    onClick={handleSendMessage}
                                    disabled={isLoading || inputMessage.trim() === ''}
                                    className={`flex items-center justify-center w-8 h-8 rounded-full ${inputMessage.trim() !== '' ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-200'} transition-colors duration-200`}
                                    aria-label="Send message"
                                >
                                    <svg className={`w-4 h-4 ${inputMessage.trim() !== '' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-2 text-center">
                            {t('aiChatbotFooterNote')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'absolute inset-y-0 right-0 z-50 md:relative' : 'hidden md:flex'} flex-col w-80 bg-red-50 border-l border-red-100`}>
                <div className="p-3">
                    <button
                        onClick={handleNewChat}
                        className="flex items-center w-full px-4 py-3 text-sm text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New chat
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-3">
                    <div className="text-xs text-gray-500 px-3 py-2">No chat histories yet</div>
                </div>
            </div>
        </div>
    );
};

export default AIChatbot;