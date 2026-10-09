import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { motion, AnimatePresence } from 'framer-motion';

Chart.register(...registerables);

export default function ExpenseDetailModal({ isOpen, onClose, selectedDate, expenses, categories }) {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const [showPaymentSlip, setShowPaymentSlip] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState(null);

    useEffect(() => {
        if (isOpen && selectedDate && expenses) {
            // Create chart after modal opens
            setTimeout(() => {
                createCategoryChart();
            }, 100);
        }

        return () => {
            // Cleanup chart when modal closes
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [isOpen, selectedDate, expenses]);

    const createCategoryChart = () => {
        if (!chartRef.current || !expenses) return;

        // Destroy existing chart if it exists
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        // Filter expenses for the selected date
        const dateExpenses = expenses.filter(expense => expense.date === selectedDate);

        // Calculate category-wise expenses
        const categoryExpenses = {};
        dateExpenses.forEach(expense => {
            const categoryId = expense.category;
            if (!categoryExpenses[categoryId]) {
                categoryExpenses[categoryId] = 0;
            }
            categoryExpenses[categoryId] += expense.amount;
        });

        // Prepare chart data
        const labels = Object.keys(categoryExpenses);
        const data = Object.values(categoryExpenses);

        // Handle case where there are no expenses
        if (labels.length === 0) {
            return;
        }

        const backgroundColors = labels.map((categoryId, index) => {
            const category = categories.find(c => c.id === categoryId);
            return category ? category.color : `hsl(${index * 30}, 70%, 50%)`;
        });

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.map(categoryId => {
                    const category = categories.find(c => c.id === categoryId);
                    return category ? category.name : categoryId;
                }),
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: '#FFFFFF',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const total = data.reduce((sum, val) => sum + val, 0);
                                const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ₹${context.parsed.toLocaleString('en-IN')} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    };

    // Handle case where modal is not open
    if (!isOpen) return null;

    // Handle case where required props are missing
    if (!selectedDate || !expenses || !categories) {
        return (
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
                        >
                            <div className="text-center">
                                <div className="p-3 bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                    <i className="ph ph-warning text-red-600 text-2xl"></i>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Error</h3>
                                <p className="text-gray-600 mb-4">Unable to display expense details. Missing required data.</p>
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    // Filter expenses for the selected date
    const dateExpenses = expenses.filter(expense => {
        // Handle potential null or undefined values
        if (!expense || !expense.date) return false;
        return expense.date === selectedDate;
    });

    // Calculate totals
    const totalAmount = dateExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    const totalTransactions = dateExpenses.length;

    // Calculate category-wise expenses
    const categoryExpenses = {};
    dateExpenses.forEach(expense => {
        // Handle potential null or undefined values
        if (!expense) return;

        const categoryId = expense.category;
        if (!categoryExpenses[categoryId]) {
            categoryExpenses[categoryId] = {
                amount: 0,
                count: 0,
                name: ''
            };
        }
        categoryExpenses[categoryId].amount += expense.amount || 0;
        categoryExpenses[categoryId].count += 1;

        // Set category name
        if (!categoryExpenses[categoryId].name) {
            const category = categories.find(c => c.id === categoryId);
            categoryExpenses[categoryId].name = category ? category.name : categoryId;
        }
    });

    // Format date for display
    let dateLabel = 'Unknown Date';
    if (selectedDate) {
        try {
            const date = new Date(selectedDate);
            // Check if date is valid
            if (!isNaN(date.getTime())) {
                dateLabel = date.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        } catch (e) {
            // Fallback to selectedDate string if date parsing fails
            dateLabel = selectedDate;
        }
    }

    // Show payment slip
    const handleShowPaymentSlip = (expense) => {
        setSelectedExpense(expense);
        setShowPaymentSlip(true);
    };

    // Print payment slip with professional formatting
    const handlePrintPaymentSlip = () => {
        if (!selectedExpense) return;

        const category = categories.find(c => c.id === selectedExpense.category);
        const categoryName = category ? category.name : selectedExpense.category;

        // Create print window with professional styling
        const printWindow = window.open('', 'Payment Slip', 'width=800,height=600');

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Expense Payment Slip</title>
                <style>
                    @page {
                        size: A4;
                        margin: 20mm;
                    }
                    
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        margin: 0;
                        padding: 40px;
                        color: #333;
                        background: #fff;
                    }
                    
                    .header {
                        text-align: center;
                        margin-bottom: 40px;
                        padding-bottom: 20px;
                        border-bottom: 3px solid #EF4444;
                    }
                    
                    .header h1 {
                        color: #EF4444;
                        font-size: 32px;
                        margin: 0 0 10px 0;
                        font-weight: 700;
                    }
                    
                    .header p {
                        color: #6B7280;
                        font-size: 16px;
                        margin: 5px 0;
                    }
                    
                    .slip-number {
                        text-align: right;
                        color: #6B7280;
                        font-size: 14px;
                        margin-bottom: 30px;
                    }
                    
                    .details-section {
                        background: #F9FAFB;
                        border-radius: 12px;
                        padding: 30px;
                        margin-bottom: 30px;
                        border: 1px solid #E5E7EB;
                    }
                    
                    .detail-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 12px 0;
                        border-bottom: 1px solid #E5E7EB;
                    }
                    
                    .detail-row:last-child {
                        border-bottom: none;
                    }
                    
                    .detail-label {
                        color: #6B7280;
                        font-size: 15px;
                        font-weight: 500;
                    }
                    
                    .detail-value {
                        color: #111827;
                        font-size: 15px;
                        font-weight: 600;
                        text-align: right;
                    }
                    
                    .total-section {
                        background: linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%);
                        border-radius: 12px;
                        padding: 25px 30px;
                        margin-bottom: 30px;
                        border: 2px solid #EF4444;
                    }
                    
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .total-label {
                        color: #7F1D1D;
                        font-size: 20px;
                        font-weight: 600;
                    }
                    
                    .total-amount {
                        color: #991B1B;
                        font-size: 32px;
                        font-weight: 700;
                    }
                    
                    .footer {
                        text-align: center;
                        margin-top: 50px;
                        padding-top: 20px;
                        border-top: 2px solid #E5E7EB;
                    }
                    
                    .footer p {
                        color: #9CA3AF;
                        font-size: 14px;
                        margin: 5px 0;
                    }
                    
                    .timestamp {
                        color: #D1D5DB;
                        font-size: 12px;
                        margin-top: 20px;
                    }
                    
                    .category-badge {
                        display: inline-block;
                        padding: 6px 16px;
                        border-radius: 20px;
                        font-size: 14px;
                        font-weight: 600;
                        background-color: #DBEAFE;
                        color: #1E40AF;
                    }
                    
                    @media print {
                        body {
                            padding: 20px;
                        }
                        
                        .no-print {
                            display: none;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Payment Slip</h1>
                    <p>Expense Receipt</p>
                </div>
                
                <div class="slip-number">
                    <strong>Slip No:</strong> #EXP-${selectedExpense.id}
                </div>
                
                <div class="details-section">
                    <div class="detail-row">
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${new Date(selectedExpense.date).toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })}</span>
                    </div>
                    
                    <div class="detail-row">
                        <span class="detail-label">Description:</span>
                        <span class="detail-value">${selectedExpense.description || 'N/A'}</span>
                    </div>
                    
                    <div class="detail-row">
                        <span class="detail-label">Category:</span>
                        <span class="detail-value">
                            <span class="category-badge">${categoryName}</span>
                        </span>
                    </div>
                    
                    <div class="detail-row">
                        <span class="detail-label">Vendor/Supplier:</span>
                        <span class="detail-value">${selectedExpense.vendor || 'N/A'}</span>
                    </div>
                </div>
                
                <div class="total-section">
                    <div class="total-row">
                        <span class="total-label">Total Amount Paid:</span>
                        <span class="total-amount">₹${(selectedExpense.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
                
                <div class="footer">
                    <p><strong>Thank you for your business!</strong></p>
                    <p>This is a computer generated receipt and does not require a signature.</p>
                    <p class="timestamp">Generated on: ${new Date().toLocaleString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}</p>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Wait for content to load then trigger print
        printWindow.onload = function () {
            printWindow.focus();
            printWindow.print();
        };
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    // Payment slip component with enhanced UI
    const PaymentSlip = () => {
        if (!selectedExpense) return null;

        const category = categories.find(c => c.id === selectedExpense.category);
        const categoryName = category ? category.name : selectedExpense.category;

        return (
            <div className="p-6">
                <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-xl p-8 max-w-2xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-8 pb-6 border-b-2 border-red-500">
                        <div className="inline-block p-4 bg-red-100 rounded-full mb-4">
                            <i className="ph ph-receipt text-red-600 text-4xl"></i>
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900">Payment Slip</h2>
                        <p className="text-gray-600 mt-2 text-lg">Expense Receipt</p>
                    </div>

                    {/* Slip Number */}
                    <div className="text-right mb-6">
                        <span className="text-sm text-gray-500">Slip No: </span>
                        <span className="text-sm font-semibold text-gray-700">#EXP-{selectedExpense.id}</span>
                    </div>

                    {/* Details Section */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 mb-6 border border-gray-200">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center pb-3 border-b border-gray-300">
                                <span className="text-gray-600 font-medium">Date:</span>
                                <span className="font-semibold text-gray-900">
                                    {new Date(selectedExpense.date).toLocaleDateString('en-IN', {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </span>
                            </div>

                            <div className="flex justify-between items-start pb-3 border-b border-gray-300">
                                <span className="text-gray-600 font-medium">Description:</span>
                                <span className="font-semibold text-gray-900 text-right max-w-xs">
                                    {selectedExpense.description || 'N/A'}
                                </span>
                            </div>

                            <div className="flex justify-between items-center pb-3 border-b border-gray-300">
                                <span className="text-gray-600 font-medium">Category:</span>
                                <span
                                    className="px-4 py-1.5 rounded-full text-sm font-semibold"
                                    style={{
                                        backgroundColor: category ? category.color + '20' : '#E5E7EB',
                                        color: category ? category.color : '#6B7280'
                                    }}
                                >
                                    {categoryName}
                                </span>
                            </div>

                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 font-medium">Vendor/Supplier:</span>
                                <span className="font-semibold text-gray-900">
                                    {selectedExpense.vendor || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Total Amount Section */}
                    <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-xl p-6 mb-6 border-2 border-red-500">
                        <div className="flex justify-between items-center">
                            <span className="text-xl font-semibold text-red-900">Total Amount Paid:</span>
                            <span className="text-3xl font-bold text-red-700">
                                {formatCurrency(selectedExpense.amount || 0)}
                            </span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center pt-6 border-t-2 border-gray-200">
                        <p className="text-gray-700 font-semibold mb-2">Thank you for your business!</p>
                        <p className="text-gray-500 text-sm mb-4">This is a computer generated receipt and does not require a signature.</p>
                        <p className="text-gray-400 text-xs">
                            Generated on: {new Date().toLocaleString('en-IN', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-3 mt-8">
                        <button
                            onClick={() => setShowPaymentSlip(false)}
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium flex items-center gap-2"
                        >
                            <i className="ph ph-arrow-left"></i>
                            Back to Details
                        </button>
                        <button
                            onClick={handlePrintPaymentSlip}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-lg"
                        >
                            <i className="ph ph-printer"></i>
                            Print Slip
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-pink-50 rounded-t-xl">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-red-100 rounded-xl shadow-sm">
                                        <i className="ph ph-calendar text-red-600 text-2xl"></i>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">
                                            {showPaymentSlip ? 'Payment Slip' : 'Daily Expense Details'}
                                        </h2>
                                        <p className="text-sm text-red-600 mt-1">{dateLabel}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                                >
                                    <i className="ph ph-x text-lg"></i>
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-120px)]">
                            {showPaymentSlip ? (
                                <PaymentSlip />
                            ) : (
                                <>
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.1 }}
                                            className="bg-gradient-to-r from-red-50 to-red-100 p-6 rounded-xl border border-red-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-red-600">Total Expenses</p>
                                                    <p className="text-2xl font-bold text-red-700">{formatCurrency(totalAmount)}</p>
                                                </div>
                                                <div className="p-3 bg-red-200 rounded-lg">
                                                    <i className="ph ph-wallet text-red-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.2 }}
                                            className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-blue-600">Total Transactions</p>
                                                    <p className="text-2xl font-bold text-blue-700">{totalTransactions}</p>
                                                </div>
                                                <div className="p-3 bg-blue-200 rounded-lg">
                                                    <i className="ph ph-receipt text-blue-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-xl border border-green-200"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-green-600">Categories</p>
                                                    <p className="text-2xl font-bold text-green-700">{Object.keys(categoryExpenses).length}</p>
                                                </div>
                                                <div className="p-3 bg-green-200 rounded-lg">
                                                    <i className="ph ph-tag text-green-600 text-xl"></i>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>

                                    {/* Charts and Details Section */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 pt-0">
                                        {/* Category Breakdown Chart */}
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.4 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                        >
                                            <div className="p-6 border-b border-gray-200">
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 bg-purple-100 rounded-lg">
                                                        <i className="ph ph-chart-pie text-purple-600 text-xl"></i>
                                                    </div>
                                                    <h3 className="text-lg font-semibold text-gray-900">Expense Distribution</h3>
                                                </div>
                                            </div>
                                            <div className="p-6">
                                                <div className="h-64">
                                                    <canvas ref={chartRef}></canvas>
                                                </div>
                                                {Object.keys(categoryExpenses).length === 0 && (
                                                    <div className="text-center py-4 text-gray-500">
                                                        <p>No expense data available for this date</p>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>

                                        {/* Expense Details Table */}
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.5 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm"
                                        >
                                            <div className="p-6 border-b border-gray-200">
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 bg-indigo-100 rounded-lg">
                                                        <i className="ph ph-list text-indigo-600 text-xl"></i>
                                                    </div>
                                                    <h3 className="text-lg font-semibold text-gray-900">Expense Details</h3>
                                                </div>
                                            </div>
                                            <div className="p-6">
                                                {dateExpenses.length > 0 ? (
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full divide-y divide-gray-200">
                                                            <thead className="bg-gray-50">
                                                                <tr>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-200">
                                                                {dateExpenses.map((expense, index) => {
                                                                    // Handle potential null or undefined values
                                                                    if (!expense) return null;

                                                                    const category = categories.find(c => c.id === expense.category);
                                                                    return (
                                                                        <tr key={index} className="hover:bg-gray-50">
                                                                            <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-normal break-words max-w-xs">
                                                                                {expense.description || 'No description'}
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                                                {category ? (
                                                                                    <span
                                                                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                                                                        style={{
                                                                                            backgroundColor: category.color + '20',
                                                                                            color: category.color
                                                                                        }}
                                                                                    >
                                                                                        {category.name}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                                                                                        {expense.category || 'Unknown'}
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                                                {expense.vendor || 'N/A'}
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                                {formatCurrency(expense.amount || 0)}
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                                                <button
                                                                                    onClick={() => handleShowPaymentSlip(expense)}
                                                                                    className="text-blue-600 hover:text-blue-800 flex items-center"
                                                                                >
                                                                                    <i className="ph ph-receipt mr-1"></i>
                                                                                    View Slip
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-8 text-gray-500">
                                                        <i className="ph ph-receipt text-4xl mb-2"></i>
                                                        <p>No expenses found for this date</p>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}