import { useState, useEffect } from 'react';
import React from 'react';

export default function MonthlyExpenseDetailModal({ isOpen, onClose, selectedMonth, expenses, categories }) {
    if (!isOpen || !selectedMonth) return null;

    // Filter expenses for the selected month (format: "2025-11")
    const monthlyExpenses = expenses.filter(expense => {
        const expenseMonth = expense.date.substring(0, 7); // Get YYYY-MM from date
        return expenseMonth === selectedMonth;
    });

    // Calculate totals
    const totalAmount = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalCount = monthlyExpenses.length;
    const avgAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    // Group by category
    const categoryBreakdown = {};
    monthlyExpenses.forEach(expense => {
        if (!categoryBreakdown[expense.category]) {
            categoryBreakdown[expense.category] = {
                count: 0,
                total: 0,
                expenses: []
            };
        }
        categoryBreakdown[expense.category].count++;
        categoryBreakdown[expense.category].total += expense.amount;
        categoryBreakdown[expense.category].expenses.push(expense);
    });

    // Group by vendor
    const vendorBreakdown = {};
    monthlyExpenses.forEach(expense => {
        const vendorName = expense.vendor || 'N/A';
        if (!vendorBreakdown[vendorName]) {
            vendorBreakdown[vendorName] = {
                count: 0,
                total: 0
            };
        }
        vendorBreakdown[vendorName].count++;
        vendorBreakdown[vendorName].total += expense.amount;
    });

    // Sort expenses by amount (highest to lowest)
    const sortedExpenses = [...monthlyExpenses].sort((a, b) => b.amount - a.amount);

    // Format month label (e.g., "November 2025")
    const monthDate = new Date(selectedMonth + '-01');
    const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Export to PDF function
    const exportToPDF = () => {
        // Create HTML content for PDF
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Monthly Expense Report - ${monthLabel}</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 20px; 
                    color: #333; 
                    line-height: 1.6;
                }
                h1 { 
                    color: #ef4444; 
                    border-bottom: 2px solid #ef4444; 
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                h2 { 
                    color: #374151; 
                    margin-top: 30px; 
                    margin-bottom: 15px;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .summary-card {
                    border: 1px solid #e5e7eb;
                    padding: 15px;
                    border-radius: 8px;
                    background: #f9fafb;
                }
                .metric-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #111827;
                }
                .metric-label {
                    color: #6b7280;
                    font-size: 14px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                th, td {
                    border: 1px solid #e5e7eb;
                    padding: 8px 12px;
                    text-align: left;
                }
                th {
                    background-color: #f3f4f6;
                    font-weight: bold;
                }
                tfoot td {
                    background-color: #fef2f2;
                    font-weight: bold;
                    color: #991b1b;
                    border-top: 2px solid #ef4444;
                }
                .footer {
                    margin-top: 40px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Monthly Expense Report</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${monthLabel}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Expenses</div>
                    <div class="metric-value">₹${totalAmount.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Transactions</div>
                    <div class="metric-value">${totalCount}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Amount</div>
                    <div class="metric-value">₹${avgAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
            </div>

            <h2>Category Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Items</th>
                        <th>Amount</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.keys(categoryBreakdown).map(categoryId => {
            const category = categories.find(c => c.id === categoryId);
            const categoryName = category ? category.name : categoryId;
            const breakdown = categoryBreakdown[categoryId];
            const percentage = ((breakdown.total / totalAmount) * 100).toFixed(1);
            return `
                        <tr>
                            <td>${categoryName}</td>
                            <td>${breakdown.count}</td>
                            <td>₹${breakdown.total.toLocaleString('en-IN')}</td>
                            <td>${percentage}%</td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align: right;"><strong>TOTAL:</strong></td>
                        <td><strong>₹${totalAmount.toLocaleString('en-IN')}</strong></td>
                        <td><strong>100%</strong></td>
                    </tr>
                </tfoot>
            </table>

            <h2>Vendor Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Vendor</th>
                        <th>Transactions</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(vendorBreakdown).map(([vendorName, data]) => `
                        <tr>
                            <td>${vendorName}</td>
                            <td>${data.count}</td>
                            <td>₹${data.total.toLocaleString('en-IN')}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align: right;"><strong>TOTAL:</strong></td>
                        <td><strong>₹${totalAmount.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>

            <h2>All Expenses</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Vendor</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedExpenses.map(expense => {
            const category = categories.find(c => c.id === expense.category);
            const categoryName = category ? category.name : expense.category;
            const formattedDate = new Date(expense.date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short'
            });
            return `
                        <tr>
                            <td>${formattedDate}</td>
                            <td>${expense.description}</td>
                            <td>${categoryName}</td>
                            <td>${expense.vendor || 'N/A'}</td>
                            <td>₹${expense.amount.toLocaleString('en-IN')}</td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right;"><strong>TOTAL:</strong></td>
                        <td><strong>₹${totalAmount.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>

        </body>
        </html>
        `;

        // Create and trigger print
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
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert('Error generating PDF. Please try again.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold">{monthLabel}</h2>
                        <p className="text-red-100 mt-1">Monthly Expense Details</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportToPDF}
                            className="text-white hover:bg-red-800 rounded-full p-2 transition-colors flex items-center gap-1 text-sm font-medium"
                            title="Export to PDF"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>PDF</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="text-white hover:bg-red-800 rounded-full p-2 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {monthlyExpenses.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-lg font-medium">No expenses for this month</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                                    <div className="text-sm text-red-600 font-medium">Total Expenses</div>
                                    <div className="text-2xl font-bold text-red-700 mt-1">
                                        ₹{totalAmount.toLocaleString('en-IN')}
                                    </div>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                    <div className="text-sm text-blue-600 font-medium">Total Transactions</div>
                                    <div className="text-2xl font-bold text-blue-700 mt-1">{totalCount}</div>
                                </div>
                                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                    <div className="text-sm text-green-600 font-medium">Average Amount</div>
                                    <div className="text-2xl font-bold text-green-700 mt-1">
                                        ₹{avgAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                </div>
                            </div>

                            {/* Category Breakdown */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3">Category Breakdown</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {Object.keys(categoryBreakdown).map(categoryId => {
                                        const category = categories.find(c => c.id === categoryId);
                                        const categoryName = category ? category.name : categoryId;
                                        const categoryColor = category ? category.color : '#6B7280';
                                        const breakdown = categoryBreakdown[categoryId];
                                        const percentage = ((breakdown.total / totalAmount) * 100).toFixed(1);

                                        return (
                                            <div key={categoryId} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-3 h-3 rounded-full"
                                                            style={{ backgroundColor: categoryColor }}
                                                        ></div>
                                                        <span className="font-medium text-gray-900">{categoryName}</span>
                                                    </div>
                                                    <span className="text-sm text-gray-500">{breakdown.count} items</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-lg font-bold text-gray-900">
                                                        ₹{breakdown.total.toLocaleString('en-IN')}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-600">{percentage}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Vendor Breakdown */}
                            {Object.keys(vendorBreakdown).length > 1 && (
                                <div className="mb-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Top Vendors</h3>
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <div className="space-y-2">
                                            {Object.entries(vendorBreakdown)
                                                .sort((a, b) => b[1].total - a[1].total)
                                                .slice(0, 5)
                                                .map(([vendorName, data]) => (
                                                    <div key={vendorName} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                                                        <div>
                                                            <span className="font-medium text-gray-900">{vendorName}</span>
                                                            <span className="text-sm text-gray-500 ml-2">({data.count} transactions)</span>
                                                        </div>
                                                        <span className="font-semibold text-gray-900">
                                                            ₹{data.total.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* All Expenses List */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-3">All Expenses (Sorted by Amount)</h3>
                                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {sortedExpenses.map((expense) => {
                                                    const category = categories.find(c => c.id === expense.category);
                                                    const categoryName = category ? category.name : expense.category;
                                                    const categoryColor = category ? category.color : '#6B7280';
                                                    const formattedDate = new Date(expense.date).toLocaleDateString('en-IN', {
                                                        day: 'numeric',
                                                        month: 'short'
                                                    });

                                                    return (
                                                        <tr key={expense.id} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                {formattedDate}
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-normal break-words max-w-xs">
                                                                {expense.description}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                                <span
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
                                                                    style={{
                                                                        backgroundColor: `${categoryColor}20`,
                                                                        color: categoryColor
                                                                    }}
                                                                >
                                                                    <span
                                                                        className="w-2 h-2 rounded-full"
                                                                        style={{ backgroundColor: categoryColor }}
                                                                    ></span>
                                                                    {categoryName}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                                {expense.vendor || 'N/A'}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                                                                ₹{expense.amount.toLocaleString('en-IN')}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}