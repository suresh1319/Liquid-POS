import React from 'react';

export default function DailyExpenseDetailModal({ isOpen, onClose, selectedDate, expenses, categories, dateFilter }) {
    if (!isOpen) return null;

    // Filter expenses based on the date filter context
    let dailyExpenses;
    let displayTitle;

    if (dateFilter === 'last30') {
        // For last30 filter, show all expenses for the month of the selected date
        const selectedDateObj = new Date(selectedDate);
        const selectedMonth = selectedDateObj.getMonth();
        const selectedYear = selectedDateObj.getFullYear();

        dailyExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getMonth() === selectedMonth && expenseDate.getFullYear() === selectedYear;
        });

        displayTitle = `All Expenses for ${selectedDateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
    } else {
        // Default behavior - show expenses for the specific selected date
        dailyExpenses = expenses.filter(expense => expense.date === selectedDate);
        displayTitle = selectedDate;
    }

    // Calculate totals
    const totalAmount = dailyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalCount = dailyExpenses.length;

    // Group by category
    const categoryBreakdown = {};
    dailyExpenses.forEach(expense => {
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

    const formatDate = (dateStr) => {
        if (dateFilter === 'last30') {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        }

        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 bg-gradient-to-r from-red-50 to-rose-50 border-b">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Daily Expense Details</h2>
                            <p className="text-red-600 mt-1">{displayTitle}</p>
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
                                    <p className="text-sm text-gray-600">Total Expenses</p>
                                    <p className="text-2xl font-bold text-red-600">₹{totalAmount.toLocaleString('en-IN')}</p>
                                </div>
                                <div className="p-3 bg-red-50 rounded-full">
                                    <i className="ph ph-wallet text-red-500 text-xl"></i>
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
                                    <p className="text-sm text-gray-600">Categories</p>
                                    <p className="text-2xl font-bold text-purple-600">{Object.keys(categoryBreakdown).length}</p>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-full">
                                    <i className="ph ph-tag text-purple-500 text-xl"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 280px)' }}>
                    {dailyExpenses.length > 0 ? (
                        <>
                            {/* Category Breakdown */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(categoryBreakdown).map(([categoryId, data]) => {
                                        const category = categories.find(c => c.id === categoryId);
                                        const categoryName = category ? category.name : categoryId;
                                        const categoryColor = category ? category.color : '#6B7280';

                                        return (
                                            <div key={categoryId} className="bg-white p-4 rounded-lg border hover:shadow-md transition-shadow">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-3 h-3 rounded-full"
                                                            style={{ backgroundColor: categoryColor }}
                                                        ></div>
                                                        <span className="font-medium text-gray-900">{categoryName}</span>
                                                    </div>
                                                    <span className="text-sm text-gray-500">{data.count} items</span>
                                                </div>
                                                <p className="text-xl font-bold" style={{ color: categoryColor }}>
                                                    ₹{data.total.toLocaleString('en-IN')}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Expense List */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">All Expenses</h3>
                                <div className="space-y-3">
                                    {dailyExpenses.map(expense => {
                                        const category = categories.find(c => c.id === expense.category);
                                        return (
                                            <div key={expense.id} className="bg-white p-4 rounded-lg border hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-medium text-gray-900 whitespace-normal break-words max-w-md">{expense.description}</span>
                                                            <span
                                                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                                                style={{
                                                                    backgroundColor: category?.color + '20',
                                                                    color: category?.color
                                                                }}
                                                            >
                                                                {category?.name || expense.category}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-500">
                                                            Vendor: {expense.vendor || 'N/A'}
                                                        </p>
                                                        <p className="text-sm text-gray-500 mt-1">
                                                            Date: {new Date(expense.date).toLocaleDateString('en-IN', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-red-600">
                                                            ₹{expense.amount.toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <i className="ph ph-receipt text-6xl mb-4"></i>
                            <p className="text-lg">No expenses found for this date</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}