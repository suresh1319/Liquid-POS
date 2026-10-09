import React from 'react';

export default function CategoryExpenseDetailModal({ isOpen, onClose, selectedCategory, expenses, categories }) {
    if (!isOpen || !selectedCategory) return null;

    // Filter expenses for the selected category
    const categoryExpenses = expenses.filter(expense => expense.category === selectedCategory);

    // Get category info
    const category = categories.find(c => c.id === selectedCategory);
    const categoryName = category ? category.name : selectedCategory;
    const categoryColor = category ? category.color : '#6B7280';

    // Calculate totals
    const totalAmount = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalCount = categoryExpenses.length;
    const avgAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    // Group by vendor
    const vendorBreakdown = {};
    categoryExpenses.forEach(expense => {
        const vendor = expense.vendor || 'Unknown';
        if (!vendorBreakdown[vendor]) {
            vendorBreakdown[vendor] = {
                count: 0,
                total: 0
            };
        }
        vendorBreakdown[vendor].count++;
        vendorBreakdown[vendor].total += expense.amount;
    });

    // Sort by amount
    const sortedExpenses = [...categoryExpenses].sort((a, b) => b.amount - a.amount);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b" style={{ backgroundColor: categoryColor + '10' }}>
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: categoryColor + '20' }}
                                >
                                    <i className="ph ph-tag text-2xl" style={{ color: categoryColor }}></i>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">{categoryName}</h2>
                                    <p className="text-sm" style={{ color: categoryColor }}>Category Expense Details</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white rounded-lg transition-colors"
                        >
                            <i className="ph ph-x text-xl text-gray-600"></i>
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="p-6 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Total Spent</p>
                                    <p className="text-2xl font-bold" style={{ color: categoryColor }}>
                                        ₹{totalAmount.toLocaleString('en-IN')}
                                    </p>
                                </div>
                                <div
                                    className="p-3 rounded-full"
                                    style={{ backgroundColor: categoryColor + '20' }}
                                >
                                    <i className="ph ph-wallet text-xl" style={{ color: categoryColor }}></i>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Total Transactions</p>
                                    <p className="text-2xl font-bold text-blue-600">{totalCount}</p>
                                </div>
                                <div className="p-3 bg-blue-50 rounded-full">
                                    <i className="ph ph-receipt text-blue-500 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg shadow-sm border">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Average Amount</p>
                                    <p className="text-2xl font-bold text-green-600">₹{avgAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                                </div>
                                <div className="p-3 bg-green-50 rounded-full">
                                    <i className="ph ph-chart-line text-green-500 text-xl"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 280px)' }}>
                    {categoryExpenses.length > 0 ? (
                        <>
                            {/* Vendor Breakdown */}
                            {Object.keys(vendorBreakdown).length > 1 && (
                                <div className="mb-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Vendor Breakdown</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {Object.entries(vendorBreakdown)
                                            .sort((a, b) => b[1].total - a[1].total)
                                            .map(([vendor, data]) => (
                                                <div key={vendor} className="bg-white p-4 rounded-lg border hover:shadow-md transition-shadow">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-medium text-gray-900">{vendor}</span>
                                                        <span className="text-sm text-gray-500">{data.count} transactions</span>
                                                    </div>
                                                    <p className="text-xl font-bold" style={{ color: categoryColor }}>
                                                        ₹{data.total.toLocaleString('en-IN')}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}

                            {/* Expense List */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">All Expenses (Highest to Lowest)</h3>
                                <div className="space-y-3">
                                    {sortedExpenses.map(expense => (
                                        <div key={expense.id} className="bg-white p-4 rounded-lg border hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-gray-900 whitespace-normal break-words max-w-md">{expense.description}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                                        <span>
                                                            <i className="ph ph-calendar-blank mr-1"></i>
                                                            {new Date(expense.date).toLocaleDateString('en-IN', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })}
                                                        </span>
                                                        <span>
                                                            <i className="ph ph-user mr-1"></i>
                                                            {expense.vendor || 'N/A'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold" style={{ color: categoryColor }}>
                                                        ₹{expense.amount.toLocaleString('en-IN')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <i className="ph ph-receipt text-6xl mb-4"></i>
                            <p className="text-lg">No expenses found in this category</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
