import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    getExpenses,
    syncBudgetsWithExpenses
} from '../utils/budgetTracker.js';

import {
    getFirebaseExpenses,
    getFirebaseBudgets,
    getFirebaseCategories
} from '../utils/firebaseExpenses.js';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    BarElement
} from 'chart.js';

import { Line, Pie, Bar } from 'react-chartjs-2';

import DailyExpenseDetailModal from '../components/DailyExpenseDetailModal.js';
import CategoryExpenseDetailModal from '../components/CategoryExpenseDetailModal.js';
import MonthlyExpenseDetailModal from '../components/MonthlyExpenseDetailModal.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    BarElement
);


export default function Expenses() {
    const navigate = useNavigate();
    const dropdownRef = useRef(null);
    const trendChartRef = useRef(null);
    const categoryChartRef = useRef(null);
    const monthlyChartRef = useRef(null);

    // State for analytics view (removed budget toggle - now separate page)
    // const [activeSection, setActiveSection] = useState('analytics'); // Always show analytics on Expenses page

    const [expenses, setExpenses] = useState([
    ]);

    // Budget Management State
    const [budgets, setBudgets] = useState([
    ]);
    const [showAddBudget, setShowAddBudget] = useState(false);
    const [newBudget, setNewBudget] = useState({
        category: 'food',
        amount: '',
        month: new Date().toISOString().slice(0, 7) // YYYY-MM format
    });

    const [showAddExpense, setShowAddExpense] = useState(false);
    const [newExpense, setNewExpense] = useState({
        description: '',
        amount: '',
        category: '',
        vendor: '',
        date: new Date().toISOString().split('T')[0]
    });
    const [dateFilter, setDateFilter] = useState('last30'); // Default to last 30 days
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [filteredExpenses, setFilteredExpenses] = useState([]);
    const [selectedMonths, setSelectedMonths] = useState([]); // For monthly comparison
    const [showMonthlyComparison, setShowMonthlyComparison] = useState(false); // Toggle for monthly comparison view
    const [showComparisonDropdown, setShowComparisonDropdown] = useState(false); // Toggle for comparison dropdown
    const [comparisonType, setComparisonType] = useState('custom'); // Type of comparison: custom, last6, last12, etc.
    const [trendChartType, setTrendChartType] = useState('line'); // Chart type for Daily Expense Trend
    const [distributionChartType, setDistributionChartType] = useState('pie'); // Chart type for Expense Distribution
    const [showDailyExpenseModal, setShowDailyExpenseModal] = useState(false); // Modal for daily expense details
    const [selectedDate, setSelectedDate] = useState(null); // Selected date for modal
    const [showCategoryModal, setShowCategoryModal] = useState(false); // Modal for category details
    const [selectedCategoryId, setSelectedCategoryId] = useState(null); // Selected category for modal
    const [showMonthlyModal, setShowMonthlyModal] = useState(false); // Modal for monthly expense details
    const [selectedMonth, setSelectedMonth] = useState(null); // Selected month for modal (YYYY-MM format)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Modal for delete confirmation
    const [expenseToDelete, setExpenseToDelete] = useState(null); // Expense to be deleted

    // Handle clicks outside dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowComparisonDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Initialize data from Firebase on mount
    useEffect(() => {
        const initializeData = async () => {
            try {
                console.log('Expenses.js: Initializing data from Firebase');

                // Fetch data from Firebase
                console.log('Expenses.js: Fetching expenses from Firebase...');
                const firebaseExpenses = await getFirebaseExpenses();
                console.log('Expenses.js: Firebase expenses result:', firebaseExpenses);

                console.log('Expenses.js: Fetching budgets from Firebase...');
                const firebaseBudgets = await getFirebaseBudgets();
                console.log('Expenses.js: Firebase budgets result:', firebaseBudgets);

                console.log('Expenses.js: Fetching categories from Firebase...');
                const firebaseCategories = await getFirebaseCategories();
                console.log('Expenses.js: Firebase categories result:', firebaseCategories);

                if (firebaseExpenses && firebaseExpenses.length > 0) {
                    console.log('Expenses.js: Setting expenses from Firebase');
                    setExpenses(firebaseExpenses);
                }

                if (firebaseBudgets && firebaseBudgets.length > 0) {
                    console.log('Expenses.js: Setting budgets from Firebase');
                    setBudgets(firebaseBudgets);
                }

                if (firebaseCategories && firebaseCategories.length > 0) {
                    console.log('Expenses.js: Setting categories from Firebase');
                    setCategories(firebaseCategories);
                }

                console.log('Expenses.js: Data initialization completed');
            } catch (error) {
                console.error('=== ERROR INITIALIZING DATA FROM FIREBASE ===');
                console.error('Error type:', error.constructor.name);
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);

                // Fallback to localStorage
                console.log('Expenses.js: Falling back to localStorage');
                const storedExpenses = getExpenses();
                const storedBudgets = getBudgets();
                const storedCategories = getCategories();

                if (storedExpenses && storedExpenses.length > 0) {
                    console.log('Expenses.js: Setting expenses from localStorage');
                    setExpenses(storedExpenses);
                }

                if (storedBudgets && storedBudgets.length > 0) {
                    console.log('Expenses.js: Setting budgets from localStorage');
                    setBudgets(storedBudgets);
                }

                if (storedCategories && storedCategories.length > 0) {
                    console.log('Expenses.js: Setting categories from localStorage');
                    setCategories(storedCategories);
                }
            }
        };

        initializeData();

        loadInitialData();

        // Subscribe to real-time Firestore updates
        const unsubscribeExpenses = subscribeToExpenses((updatedExpenses) => {
            setExpenses(updatedExpenses);
            // Also sync budgets when expenses change
            setBudgets(prevBudgets => {
                return syncBudgetsWithExpenses(prevBudgets, updatedExpenses);
            });
        });

        const unsubscribeBudgets = subscribeToBudgets((updatedBudgets) => {
            setBudgets(updatedBudgets);
        });

        return () => {
            if (typeof unsubscribeExpenses === 'function') unsubscribeExpenses();
            if (typeof unsubscribeBudgets === 'function') unsubscribeBudgets();
        };
    }, []); // Only run on mount

    // Expense categories
    const [categories, setCategories] = useState([
        { id: 'food', name: 'Food & Ingredients', color: '#EF4444' },
        { id: 'staff', name: 'Staff Salaries', color: '#3B82F6' },
        { id: 'utilities', name: 'Utilities', color: '#10B981' },
        { id: 'rent', name: 'Rent', color: '#8B5CF6' },
        { id: 'maintenance', name: 'Maintenance', color: '#F59E0B' },
        { id: 'marketing', name: 'Marketing', color: '#EC4899' },
        { id: 'other', name: 'Other', color: '#6B7280' }
    ]);

    // Date filter options
    const dateFilters = [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'last7', label: 'Last 7 Days' },
        { id: 'last30', label: 'Last 30 Days' },
        { id: 'last90', label: 'Last 90 Days' },
        { id: 'custom', label: 'Custom Date' }
    ];

    // Filter expenses based on selected date range
    useEffect(() => {
        const filterExpenses = () => {
            // Use the actual current date for 'today' and 'yesterday' filters
            const currentDate = new Date();
            const allDates = expenses.map(e => new Date(e.date));
            const latestDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : currentDate;

            let startDate, endDate;

            switch (dateFilter) {
                case 'today':
                    // Show expenses from the actual current date
                    startDate = new Date(currentDate);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(currentDate);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'yesterday':
                    // Show expenses from yesterday (1 day before actual current date)
                    startDate = new Date(currentDate);
                    startDate.setDate(currentDate.getDate() - 1);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(currentDate);
                    endDate.setDate(currentDate.getDate() - 1);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'last7':
                    // For other filters, we can use a hybrid approach - use current date as endpoint
                    startDate = new Date(currentDate);
                    startDate.setDate(currentDate.getDate() - 6);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(currentDate);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'last30':
                    startDate = new Date(currentDate);
                    startDate.setDate(currentDate.getDate() - 29);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(currentDate);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'last90':
                    startDate = new Date(currentDate);
                    startDate.setDate(currentDate.getDate() - 89);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(currentDate);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'custom':
                    if (customDateRange.start && customDateRange.end) {
                        startDate = new Date(customDateRange.start);
                        startDate.setHours(0, 0, 0, 0);
                        endDate = new Date(customDateRange.end);
                        endDate.setHours(23, 59, 59, 999);
                    } else {
                        // If custom range not set, show all expenses
                        setFilteredExpenses(expenses);
                        return;
                    }
                    break;
                default:
                    setFilteredExpenses(expenses);
                    return;
            }

            const filtered = expenses
                .filter(expense => {
                    const expenseDate = new Date(expense.date);
                    return expenseDate >= startDate && expenseDate <= endDate;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending (newest first)

            setFilteredExpenses(filtered);
        };

        filterExpenses();
    }, [expenses, dateFilter, customDateRange]);

    // Process data for charts based on filtered expenses
    const processDataForCharts = () => {
        // Determine date range based on current filter
        const currentDate = new Date();
        const allDates = expenses.map(e => new Date(e.date));
        const latestDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : currentDate;

        let startDate, endDate;

        switch (dateFilter) {
            case 'today':
                // Show expenses from the actual current date
                startDate = new Date(currentDate);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(currentDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                // Show expenses from yesterday (1 day before actual current date)
                startDate = new Date(currentDate);
                startDate.setDate(currentDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(currentDate);
                endDate.setDate(currentDate.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'last7':
                // For other filters, we can use a hybrid approach - use current date as endpoint
                startDate = new Date(currentDate);
                startDate.setDate(currentDate.getDate() - 6);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(currentDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'last30':
                startDate = new Date(currentDate);
                startDate.setDate(currentDate.getDate() - 29);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(currentDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'last90':
                startDate = new Date(currentDate);
                startDate.setDate(currentDate.getDate() - 89);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(currentDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'custom':
                if (customDateRange.start && customDateRange.end) {
                    startDate = new Date(customDateRange.start);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(customDateRange.end);
                    endDate.setHours(23, 59, 59, 999);
                } else {
                    // If custom range not set, use all filtered expenses
                    startDate = null;
                    endDate = null;
                }
                break;
            default:
                startDate = null;
                endDate = null;
        }

        // Calculate daily expenses for trend line - include all dates in range
        const dailyExpenses = {};

        // If we have a valid date range, initialize all dates with zero values
        if (startDate && endDate) {
            const currentDateIterator = new Date(startDate);
            while (currentDateIterator <= endDate) {
                const dateStr = currentDateIterator.toISOString().split('T')[0];
                dailyExpenses[dateStr] = 0;
                currentDateIterator.setDate(currentDateIterator.getDate() + 1);
            }
        }

        // Add actual expense amounts
        filteredExpenses.forEach(expense => {
            const date = expense.date;
            if (!dailyExpenses[date]) {
                dailyExpenses[date] = 0;
            }
            dailyExpenses[date] += expense.amount;
        });

        // Create sorted array of dates
        const sortedDates = Object.keys(dailyExpenses).sort();
        const trendData = sortedDates.map(date => ({
            date: (() => {
                const dateObj = new Date(date);
                return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            })(),
            fullDate: date, // Keep the original date for reference
            amount: dailyExpenses[date]
        }));

        // Calculate category-wise expenses
        const categoryExpenses = {};
        filteredExpenses.forEach(expense => {
            const categoryId = expense.category;
            if (!categoryExpenses[categoryId]) {
                categoryExpenses[categoryId] = 0;
            }
            categoryExpenses[categoryId] += expense.amount;
        });

        // Calculate vendor-wise expenses
        const vendorExpenses = {};
        filteredExpenses.forEach(expense => {
            const vendor = expense.vendor || 'Unknown';
            if (!vendorExpenses[vendor]) {
                vendorExpenses[vendor] = 0;
            }
            vendorExpenses[vendor] += expense.amount;
        });

        return {
            trendData,
            categoryExpenses,
            vendorExpenses
        };
    };

    // Process monthly expense data for comparison
    const processMonthlyData = () => {
        const monthlyExpenses = {};

        // Group expenses by month
        expenses.forEach(expense => {
            const date = new Date(expense.date);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM format

            if (!monthlyExpenses[monthYear]) {
                monthlyExpenses[monthYear] = {
                    total: 0,
                    categories: {},
                    monthLabel: date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                };
            }

            // Add to total
            monthlyExpenses[monthYear].total += expense.amount;

            // Add to category breakdown
            const categoryId = expense.category;
            if (!monthlyExpenses[monthYear].categories[categoryId]) {
                monthlyExpenses[monthYear].categories[categoryId] = 0;
            }
            monthlyExpenses[monthYear].categories[categoryId] += expense.amount;
        });

        return monthlyExpenses;
    };

    // Calculate chart data when filteredExpenses changes
    const [chartData, setChartData] = useState({
        trendData: [],
        categoryExpenses: {},
        vendorExpenses: {}
    });

    const [monthlyExpensesData, setMonthlyExpensesData] = useState({});

    useEffect(() => {
        const newChartData = processDataForCharts();
        setChartData(newChartData);

        const newMonthlyData = processMonthlyData();
        setMonthlyExpensesData(newMonthlyData);
    }, [filteredExpenses, expenses, dateFilter, customDateRange]);

    const { trendData, categoryExpenses, vendorExpenses } = chartData;

    // Chart data for daily trend
    // Function to determine which labels to show for even distribution
    const getVisibleLabels = (data) => {
        // Show all labels for better visibility (similar to ReportsPage approach)
        // Since dates are already formatted in the data, we can just return them
        return data.map((item) => item.date);
    };

    // Show all labels for better visibility (similar to ReportsPage approach)
    const lineChartData = {
        labels: getVisibleLabels(trendData),
        datasets: [
            {
                label: 'Daily Expenses (₹)',
                data: trendData.map(item => item.amount),
                borderColor: '#EF4444',
                backgroundColor: trendChartType === 'line' ? 'rgba(239, 68, 68, 0.1)' : '#EF4444',
                borderWidth: 2,
                fill: trendChartType === 'line',
                tension: 0.4
            }
        ]
    };

    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function (context) {
                        return 'Expense: ₹' + context.parsed.y.toLocaleString('en-IN');
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    // Match the ReportsPage approach - simpler configuration
                    maxRotation: 0,
                    minRotation: 0
                },
                grid: {
                    display: false
                }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function (value) {
                        return '₹' + value.toLocaleString('en-IN');
                    }
                }
            }
        },
        onHover: (event, activeElements) => {
            event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const dataIndex = elements[0].index;
                // Use fullDate if available, otherwise use the date property
                const clickedDate = trendData[dataIndex]?.fullDate || trendData[dataIndex]?.date;
                console.log('Trend Chart Clicked:', { dataIndex, clickedDate, trendData });
                if (clickedDate) {
                    setSelectedDate(clickedDate);
                    setShowDailyExpenseModal(true);
                }
            }
        }
    };

    // Chart data for category distribution
    const categoryLabels = Object.keys(categoryExpenses).map(categoryId => {
        const category = categories.find(c => c.id === categoryId);
        return category ? category.name : categoryId;
    });

    const categoryColors = Object.keys(categoryExpenses).map(categoryId => {
        const category = categories.find(c => c.id === categoryId);
        return category ? category.color : '#6B7280';
    });

    const pieChartData = {
        labels: categoryLabels,
        datasets: [
            {
                data: Object.values(categoryExpenses),
                backgroundColor: categoryColors,
                borderWidth: 0
            }
        ]
    };

    const pieChartOptions = {
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
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ₹${value.toLocaleString('en-IN')} (${percentage}%)`;
                    }
                }
            }
        },
        onHover: (event, activeElements) => {
            event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const dataIndex = elements[0].index;
                const categoryIds = Object.keys(categoryExpenses);
                const clickedCategoryId = categoryIds[dataIndex];
                console.log('Pie Chart Clicked:', { dataIndex, categoryIds, clickedCategoryId });
                if (clickedCategoryId) {
                    setSelectedCategoryId(clickedCategoryId);
                    setShowCategoryModal(true);
                }
            }
        }
    };

    // Chart data for monthly comparison
    const getMonthlyComparisonData = () => {
        // Sort selected months chronologically
        const sortedSelectedMonths = [...selectedMonths].sort();

        const selectedData = sortedSelectedMonths
            .filter(month => monthlyExpensesData[month])
            .map(month => monthlyExpensesData[month]);

        const labels = selectedData.map(item => item.monthLabel);
        const data = selectedData.map(item => item.total);

        return {
            labels,
            datasets: [
                {
                    label: 'Monthly Expenses (₹)',
                    data,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: '#ef4444',
                    borderWidth: 1
                }
            ]
        };
    };

    const monthlyComparisonData = getMonthlyComparisonData();

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return 'Expense: ₹' + context.raw.toLocaleString('en-IN');
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function (value) {
                        return '₹' + value.toLocaleString('en-IN');
                    }
                }
            }
        },
        onHover: (event, activeElements) => {
            event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const dataIndex = elements[0].index;
                // Get the clicked month from sorted selected months
                const sortedSelectedMonths = [...selectedMonths].sort();
                const clickedMonth = sortedSelectedMonths[dataIndex];
                console.log('Monthly Chart Clicked:', { dataIndex, clickedMonth, sortedSelectedMonths });
                if (clickedMonth) {
                    setSelectedMonth(clickedMonth);
                    setShowMonthlyModal(true);
                }
            }
        }
    };

    // Calculate summary statistics
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalTransactions = filteredExpenses.length;
    const avgPerTransaction = totalTransactions > 0 ? (totalExpenses / totalTransactions) : 0;

    // Find top category
    let topCategory = { name: 'N/A', amount: 0 };
    if (Object.keys(categoryExpenses).length > 0) {
        const topCategoryId = Object.keys(categoryExpenses).reduce((a, b) =>
            categoryExpenses[a] > categoryExpenses[b] ? a : b
        );
        const category = categories.find(c => c.id === topCategoryId);
        topCategory = {
            name: category ? category.name : topCategoryId,
            amount: categoryExpenses[topCategoryId]
        };
    }

    // Find top vendor
    let topVendor = { name: 'N/A', amount: 0 };
    if (Object.keys(vendorExpenses).length > 0) {
        const topVendorName = Object.keys(vendorExpenses).reduce((a, b) =>
            vendorExpenses[a] > vendorExpenses[b] ? a : b
        );
        topVendor = {
            name: topVendorName,
            amount: vendorExpenses[topVendorName]
        };
    }

    // Handle add expense
    const handleAddExpense = async (e) => {
        e.preventDefault();

        // Validate input
        if (!newExpense.description || !newExpense.amount || !newExpense.category || !newExpense.date) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            let updatedExpenses = [];

            // Check if category already exists
            const existingCategory = categories.find(cat => cat.id === newExpense.category);

            if (!existingCategory && newExpense.category) {
                // Create new category
                const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
                const newCategoryId = `cat_${Date.now()}`;

                const newCategory = {
                    id: newCategoryId,
                    name: newExpense.category,
                    color: randomColor
                };

                // Add the new category to the categories list
                const updatedCategories = [...categories, newCategory];
                setCategories(updatedCategories);
                await saveCategories(updatedCategories);

                // Save expense with the new category ID to Firestore
                const expenseData = {
                    ...newExpense,
                    category: newCategoryId,
                    amount: parseFloat(newExpense.amount)
                };
                await saveExpense(expenseData);
            } else {
                // Use existing category - Save expense to Firestore
                const expenseData = {
                    ...newExpense,
                    amount: parseFloat(newExpense.amount)
                };
                await saveExpense(expenseData);
            }

            // Update expenses state and save
            setExpenses(updatedExpenses);
            console.log('About to save expenses:', updatedExpenses);
            await saveExpenses(updatedExpenses);
            console.log('Successfully saved expenses');

            // Update budgets with new spending
            const syncedBudgets = syncBudgetsWithExpenses(budgets, updatedExpenses);
            setBudgets(syncedBudgets);
            console.log('About to save budgets:', syncedBudgets);
            await saveBudgets(syncedBudgets);
            console.log('Successfully saved budgets');

            // Reset form
            setNewExpense({
                description: '',
                amount: '',
                category: '',
                vendor: '',
                date: new Date().toISOString().split('T')[0]
            });

            setShowAddExpense(false);
        } catch (error) {
            console.error('Error adding expense:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            alert('Failed to add expense. Please try again.');
        }
    };

    // Handle month selection for comparison
    const handleMonthToggle = (month) => {
        if (selectedMonths.includes(month)) {
            setSelectedMonths(selectedMonths.filter(m => m !== month));
        } else {
            // Limit to 6 months
            if (selectedMonths.length < 6) {
                setSelectedMonths([...selectedMonths, month]);
            }
        }
    };

    // Toggle monthly comparison view
    const toggleMonthlyComparison = () => {
        setShowMonthlyComparison(!showMonthlyComparison);
        // Reset selected months when closing
        if (showMonthlyComparison) {
            setSelectedMonths([]);
            setShowComparisonDropdown(false);
        }
        // Auto-select last 6 months when opening
        else if (selectedMonths.length === 0) {
            const lastSixMonths = Object.keys(monthlyExpensesData)
                .sort()
                .slice(-6);
            setSelectedMonths(lastSixMonths);
            setComparisonType('last6');
        }
    };

    // Handle comparison type change
    const handleComparisonTypeChange = (type) => {
        setComparisonType(type);
        setShowComparisonDropdown(false);

        switch (type) {
            case 'last3':
                const lastThreeMonths = Object.keys(monthlyExpensesData)
                    .sort()
                    .slice(-3);
                setSelectedMonths(lastThreeMonths);
                break;
            case 'last6':
                const lastSixMonths = Object.keys(monthlyExpensesData)
                    .sort()
                    .slice(-6);
                setSelectedMonths(lastSixMonths);
                break;
            case 'last12':
                const lastTwelveMonths = Object.keys(monthlyExpensesData)
                    .sort()
                    .slice(-12);
                setSelectedMonths(lastTwelveMonths);
                break;
            case 'custom':
                // Keep current selection or select last 6 if none selected
                if (selectedMonths.length === 0) {
                    const lastSixMonths = Object.keys(monthlyExpensesData)
                        .sort()
                        .slice(-6);
                    setSelectedMonths(lastSixMonths);
                }
                break;
            default:

                break;
        }
    };

    // Handle input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;

        // Handle new category input
        if (name === 'newCategory') {
            // If user enters a new category, use it as the category value
            setNewExpense({
                ...newExpense,
                category: value
            });
        } else {
            setNewExpense({
                ...newExpense,
                [name]: value
            });
        }
    };

    // Handle date filter change
    const handleDateFilterChange = (filterId) => {
        setDateFilter(filterId);
    };

    // Handle custom date range change
    const handleCustomDateChange = (e) => {
        const { name, value } = e.target;
        setCustomDateRange({
            ...customDateRange,
            [name]: value
        });
    };

    // Export to CSV
    const exportToCSV = () => {
        if (filteredExpenses.length === 0) {
            alert('No data to export');
            return;
        }

        // Create CSV content
        const headers = ['Date', 'Description', 'Category', 'Vendor', 'Amount (₹)'];
        const rows = filteredExpenses.map(expense => {
            const category = categories.find(c => c.id === expense.category);
            return [
                expense.date,
                `"${(expense.description || '').replace(/"/g, '""')}"`,
                category ? category.name : expense.category,
                `"${(expense.vendor || 'N/A').replace(/"/g, '""')}"`,
                expense.amount
            ];
        });

        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const filename = `Expenses_${new Date().toISOString().split('T')[0]}.csv`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    };

    // Export to PDF
    const exportToPDF = async () => {
        if (filteredExpenses.length === 0) {
            alert('No data to export');
            return;
        }

        // Capture chart images
        let trendChartImage = '';
        let distributionChartImage = '';
        let monthlyChartImage = '';

        try {
            // Capture Daily Expense Trend Chart
            if (trendChartRef.current) {
                const canvas = trendChartRef.current.canvas || trendChartRef.current;
                if (canvas && canvas.toDataURL) {
                    trendChartImage = canvas.toDataURL('image/png');
                }
            }

            // Capture Expense Distribution Chart
            if (categoryChartRef.current) {
                const canvas = categoryChartRef.current.canvas || categoryChartRef.current;
                if (canvas && canvas.toDataURL) {
                    distributionChartImage = canvas.toDataURL('image/png');
                }
            }

            // Capture Monthly Comparison Chart (if visible)
            if (showMonthlyComparison && monthlyChartRef.current) {
                const canvas = monthlyChartRef.current.canvas || monthlyChartRef.current;
                if (canvas && canvas.toDataURL) {
                    monthlyChartImage = canvas.toDataURL('image/png');
                }
            }
        } catch (error) {
            console.error('Error capturing charts:', error);
        }

        // Get period display text
        let periodText = '';
        switch (dateFilter) {
            case 'today':
                periodText = 'Today';
                break;
            case 'yesterday':
                periodText = 'Yesterday';
                break;
            case 'last7':
                periodText = 'Last 7 Days';
                break;
            case 'last30':
                periodText = 'Last 30 Days';
                break;
            case 'last90':
                periodText = 'Last 90 Days';
                break;
            case 'custom':
                periodText = `${customDateRange.start} to ${customDateRange.end}`;
                break;
            default:
                periodText = 'All Time';
        }

        // Create HTML content for PDF printing
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Expense Report</title>
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
                    grid-template-columns: 1fr 1fr;
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
                .chart-image {
                    width: 100%;
                    max-width: 800px;
                    height: auto;
                    margin: 20px auto;
                    display: block;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    page-break-inside: avoid;
                }
                .chart-container {
                    page-break-before: always;
                    text-align: center;
                    margin-top: 40px;
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
                    .chart-container { page-break-before: always; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Expense Report</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${periodText}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Expenses (${periodText})</div>
                    <div class="metric-value">₹${totalExpenses.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Transactions (${periodText})</div>
                    <div class="metric-value">${totalTransactions}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Per Transaction</div>
                    <div class="metric-value">₹${avgPerTransaction.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Top Category</div>
                    <div class="metric-value" style="font-size: 16px;">${topCategory.name}</div>
                    <div style="color: #6b7280; font-size: 14px;">₹${topCategory.amount.toLocaleString('en-IN')}</div>
                </div>
            </div>

            <h2>Category Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Transactions</th>
                        <th>Total Amount</th>
                        <th>% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.keys(categoryExpenses).map(categoryId => {
            const category = categories.find(c => c.id === categoryId);
            const categoryName = category ? category.name : categoryId;
            const amount = categoryExpenses[categoryId];
            const percentage = ((amount / totalExpenses) * 100).toFixed(1);
            const count = filteredExpenses.filter(e => e.category === categoryId).length;
            return `
                            <tr>
                                <td>${categoryName}</td>
                                <td>${count}</td>
                                <td>₹${amount.toLocaleString('en-IN')}</td>
                                <td>${percentage}%</td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right;"><strong>TOTAL:</strong></td>
                        <td><strong>₹${totalExpenses.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>

            <h2>Expense Details</h2>
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
                    ${filteredExpenses.slice(0, 50).map(expense => {
            const category = categories.find(c => c.id === expense.category);
            const categoryName = category ? category.name : expense.category;
            return `
                            <tr>
                                <td>${expense.date}</td>
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
                        <td colspan="4" style="text-align: right;"><strong>TOTAL ${filteredExpenses.length > 50 ? '(First 50 Expenses)' : ''}:</strong></td>
                        <td><strong>₹${filteredExpenses.slice(0, 50).reduce((sum, exp) => sum + exp.amount, 0).toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>
            ${filteredExpenses.length > 50 ? `<p style="color: #6b7280; font-style: italic;">Note: Showing first 50 of ${filteredExpenses.length} expenses. Total of all expenses: ₹${totalExpenses.toLocaleString('en-IN')}</p>` : ''}

            <!-- Charts Section on Separate Page -->
            ${trendChartImage ? `
            <div class="chart-container">
                <h2>Trend Visualization</h2>
                <img src="${trendChartImage}" alt="Daily Expense Trend Chart" class="chart-image" />
            </div>
            ` : ''}

        </body>
        </html>
        `;
        ` : ''}


        </body> 
        </html>
        `;

        // Use the same browser print approach as the Reports section
        try {
            // Create a hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';

            // Add the iframe to the document
            document.body.appendChild(iframe);

            // Write content to the iframe
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            // Wait for resources to load then print
            iframe.onload = () => {
                // Trigger print dialog
                iframe.contentWindow.print();

                // Remove the iframe after printing
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 500);
            };

            // Set a timeout in case onload doesn't fire
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
            console.error("Error opening print dialog:", error);
            // Fallback: silent error handling
        }
    };

    // Export single expense to PDF (Payment Slip)
    const exportExpenseToPDF = (expense) => {
        if (!expense) {
            alert('No expense data to export');
            return;
        }

        const category = categories.find(c => c.id === expense.category);
        const categoryName = category ? category.name : expense.category;
        const categoryColor = category && category.color ? category.color : '#6b7280';

        // Format date
        const formattedDate = new Date(expense.date).toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Format amount
        const formattedAmount = `₹${(expense.amount || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;

        // Current timestamp
        const timestamp = new Date().toLocaleString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Create professional payment slip HTML
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Payment Slip - #EXP-${expense.id}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body { 
                    font-family: Arial, sans-serif;
                    background: #f3f4f6;
                    padding: 40px 20px;
                    color: #333;
                }
                .slip-container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .slip-header {
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    padding: 40px 30px;
                    text-align: center;
                    position: relative;
                }
                .slip-header h1 {
                    font-size: 36px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    letter-spacing: 1px;
                }
                .slip-header p {
                    font-size: 16px;
                    opacity: 0.95;
                }
                .slip-number {
                    position: absolute;
                    top: 20px;
                    right: 30px;
                    background: rgba(255, 255, 255, 0.2);
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: bold;
                }
                .slip-body {
                    padding: 40px 30px;
                }
                .info-section {
                    background: #f9fafb;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    padding: 30px;
                    margin-bottom: 30px;
                }
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 0;
                    border-bottom: 1px solid #e5e7eb;
                }
                .info-row:last-child {
                    border-bottom: none;
                }
                .info-label {
                    color: #6b7280;
                    font-size: 14px;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .info-value {
                    color: #111827;
                    font-size: 16px;
                    font-weight: bold;
                    text-align: right;
                }
                .category-badge {
                    display: inline-block;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: bold;
                    background: ${categoryColor}20;
                    color: ${categoryColor};
                    border: 2px solid ${categoryColor};
                }
                .amount-section {
                    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                    border: 3px solid #ef4444;
                    border-radius: 10px;
                    padding: 30px;
                    text-align: center;
                    margin-bottom: 30px;
                }
                .amount-label {
                    color: #7f1d1d;
                    font-size: 16px;
                    font-weight: bold;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 15px;
                }
                .amount-value {
                    color: #991b1b;
                    font-size: 48px;
                    font-weight: bold;
                    letter-spacing: 1px;
                }
                .slip-footer {
                    text-align: center;
                    padding-top: 30px;
                    border-top: 2px solid #e5e7eb;
                }
                .footer-thanks {
                    color: #374151;
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .footer-note {
                    color: #6b7280;
                    font-size: 13px;
                    margin-bottom: 15px;
                }
                .footer-timestamp {
                    color: #9ca3af;
                    font-size: 11px;
                }
                .company-info {
                    text-align: center;
                    margin-top: 20px;
                    padding: 20px;
                    background: #f9fafb;
                    border-radius: 8px;
                }
                .company-name {
                    color: #ef4444;
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .company-tagline {
                    color: #6b7280;
                    font-size: 13px;
                }
                @media print {
                    body {
                        background: white;
                        padding: 0;
                    }
                    .slip-container {
                        box-shadow: none;
                        max-width: 100%;
                    }
                }
            </style>
        </head>
        <body>
            <div class="slip-container">
                <div class="slip-header">
                    <div class="slip-number">#EXP-${expense.id}</div>
                    <h1>PAYMENT SLIP</h1>
                    <p>Expense Receipt</p>
                </div>
                
                <div class="slip-body">
                    <div class="info-section">
                        <div class="info-row">
                            <span class="info-label">Date</span>
                            <span class="info-value">${formattedDate}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Description</span>
                            <span class="info-value">${expense.description || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Category</span>
                            <span class="category-badge">${categoryName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Vendor/Supplier</span>
                            <span class="info-value">${expense.vendor || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="amount-section">
                        <div class="amount-label">Total Amount Paid</div>
                        <div class="amount-value">${formattedAmount}</div>
                    </div>

                    <div class="slip-footer">
                        <div class="footer-thanks">Thank you for your business!</div>
                        <div class="footer-note">This is a computer generated receipt and does not require a signature.</div>
                        <div class="footer-timestamp">Generated on: ${timestamp}</div>
                    </div>
                </div>
            </div>
            <div class="footer">
            </div>
        </body>
        </html>
        `;

        // Use the same browser print approach
        try {
            // Create a hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';

            // Add the iframe to the document
            document.body.appendChild(iframe);

            // Write content to the iframe
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            // Wait for resources to load then print
            iframe.onload = () => {
                // Trigger print dialog
                iframe.contentWindow.print();

                // Remove the iframe after printing
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 500);
            };

            // Set a timeout in case onload doesn't fire
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
            console.error("Error opening print dialog:", error);
            alert('Error generating payment slip. Please try again.');
        }
    };

    // Export Daily Expense Trend Chart to PDF
    const exportTrendChartToPDF = async () => {
        // Capture chart image
        let trendChartImage = '';

        try {
            if (trendChartRef.current) {
                const canvas = trendChartRef.current.canvas || trendChartRef.current;
                if (canvas && canvas.toDataURL) {
                    trendChartImage = canvas.toDataURL('image/png');
                }
            }
        } catch (error) {
            console.error('Error capturing chart:', error);
        }

        // Get period display text
        let periodText = '';
        switch (dateFilter) {
            case 'today':
                periodText = 'Today';
                break;
            case 'yesterday':
                periodText = 'Yesterday';
                break;
            case 'last7':
                periodText = 'Last 7 Days';
                break;
            case 'last30':
                periodText = 'Last 30 Days';
                break;
            case 'last90':
                periodText = 'Last 90 Days';
                break;
            case 'custom':
                periodText = `${customDateRange.start} to ${customDateRange.end}`;
                break;
            default:
                periodText = 'All Time';
        }

        // Calculate statistics
        const totalTrendAmount = Array.isArray(trendData) ?
            trendData.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
        const avgAmount = Array.isArray(trendData) && trendData.length > 0 ?
            totalTrendAmount / trendData.length : 0;
        const amounts = Array.isArray(trendData) ? trendData.map(item => item.amount || 0) : [];
        const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
        const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;

        // Create HTML content for PDF printing
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Daily Expense Trend</title>
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
                    grid-template-columns: 1fr 1fr;
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
                .chart-image {
                    width: 100%;
                    max-width: 800px;
                    height: auto;
                    margin: 20px auto;
                    display: block;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    page-break-inside: avoid;
                }
                .chart-container {
                    page-break-before: always;
                    text-align: center;
                    margin-top: 40px;
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
                    .chart-container { page-break-before: always; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Daily Expense Trend</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${periodText}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Expenses</div>
                    <div class="metric-value">₹${totalTrendAmount.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Number of Days</div>
                    <div class="metric-value">${Array.isArray(trendData) ? trendData.length : 0}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Daily Expense</div>
                    <div class="metric-value">₹${avgAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Peak/Low</div>
                    <div class="metric-value" style="font-size: 16px;">₹${maxAmount.toLocaleString('en-IN')}</div>
                    <div style="color: #6b7280; font-size: 14px;">₹${minAmount.toLocaleString('en-IN')}</div>
                </div>
            </div>

            <h2>Daily Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${Array.isArray(trendData) ? trendData.map(item => {
            const date = new Date(item.date);
            const formattedDate = date.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
            return `
                            <tr>
                                <td>${formattedDate}</td>
                                <td>₹${(item.amount || 0).toLocaleString('en-IN')}</td>
                            </tr>
                        `;
        }).join('') : ''}
                </tbody>
                <tfoot>
                    <tr>
                        <td style="text-align: right;"><strong>TOTAL:</strong></td>
                        <td><strong>₹${totalTrendAmount.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>

            ${trendChartImage ? `
            <div class="chart-container">
                <h2>Trend Visualization</h2>
                <img src="${trendChartImage}" alt="Daily Expense Trend Chart" class="chart-image" />
            </div>
            ` : ''}


        </body>
        </html>
        `;

        // Use the same browser print approach as the Reports section
        try {
            // Create a hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';

            // Add the iframe to the document
            document.body.appendChild(iframe);

            // Write content to the iframe
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            // Wait for resources to load then print
            iframe.onload = () => {
                // Trigger print dialog
                iframe.contentWindow.print();

                // Remove the iframe after printing
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 500);
            };

            // Set a timeout in case onload doesn't fire
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
            console.error("Error opening print dialog:", error);
            // Fallback: silent error handling
        }
    };

    // Export Category Distribution Chart to PDF
    const exportCategoryChartToPDF = async () => {
        // Capture chart image
        let distributionChartImage = '';

        try {
            if (categoryChartRef.current) {
                const canvas = categoryChartRef.current.canvas || categoryChartRef.current;
                if (canvas && canvas.toDataURL) {
                    distributionChartImage = canvas.toDataURL('image/png');
                }
            }
        } catch (error) {
            console.error('Error capturing chart:', error);
        }

        // Get period display text
        let periodText = '';
        switch (dateFilter) {
            case 'today':
                periodText = 'Today';
                break;
            case 'yesterday':
                periodText = 'Yesterday';
                break;
            case 'last7':
                periodText = 'Last 7 Days';
                break;
            case 'last30':
                periodText = 'Last 30 Days';
                break;
            case 'last90':
                periodText = 'Last 90 Days';
                break;
            case 'custom':
                periodText = `${customDateRange.start} to ${customDateRange.end}`;
                break;
            default:
                periodText = 'All Time';
        }

        // Calculate statistics
        const totalCategoryAmount = typeof categoryExpenses === 'object' && categoryExpenses !== null ?
            Object.values(categoryExpenses).reduce((sum, amount) => sum + (amount || 0), 0) : 0;
        const categoryCount = typeof categoryExpenses === 'object' && categoryExpenses !== null ?
            Object.keys(categoryExpenses).length : 0;

        // Find top category
        let topCategoryName = 'N/A';
        let topCategoryAmount = 0;
        if (typeof categoryExpenses === 'object' && categoryExpenses !== null) {
            const topCategoryId = Object.keys(categoryExpenses).reduce((a, b) =>
                categoryExpenses[a] > categoryExpenses[b] ? a : b, '');
            if (topCategoryId) {
                const category = categories.find(c => c.id === topCategoryId);
                topCategoryName = category ? category.name : topCategoryId;
                topCategoryAmount = categoryExpenses[topCategoryId] || 0;
            }
        }

        // Create HTML content for PDF printing
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Expense Distribution by Category</title>
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
                    grid-template-columns: 1fr 1fr;
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
                .chart-image {
                    width: 100%;
                    max-width: 800px;
                    height: auto;
                    margin: 20px auto;
                    display: block;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    page-break-inside: avoid;
                }
                .chart-container {
                    page-break-before: always;
                    text-align: center;
                    margin-top: 40px;
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
                    .chart-container { page-break-before: always; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Expense Distribution by Category</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${periodText}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Expenses</div>
                    <div class="metric-value">₹${totalCategoryAmount.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Number of Categories</div>
                    <div class="metric-value">${categoryCount}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Top Category</div>
                    <div class="metric-value" style="font-size: 18px;">${topCategoryName}</div>
                    <div style="color: #6b7280; font-size: 14px;">₹${topCategoryAmount.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average per Category</div>
                    <div class="metric-value">₹${categoryCount > 0 ? (totalCategoryAmount / categoryCount).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0'}</div>
                </div>
            </div>

            <h2>Category Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${typeof categoryExpenses === 'object' && categoryExpenses !== null ?
                Object.keys(categoryExpenses)
                    .sort((a, b) => categoryExpenses[b] - categoryExpenses[a])
                    .map(categoryId => {
                        const category = categories.find(c => c.id === categoryId);
                        const categoryName = category ? category.name : categoryId;
                        const amount = categoryExpenses[categoryId] || 0;
                        const percentage = totalCategoryAmount > 0 ?
                            ((amount / totalCategoryAmount) * 100).toFixed(1) : '0.0';
                        return `
                                    <tr>
                                        <td>${categoryName}</td>
                                        <td>₹${amount.toLocaleString('en-IN')}</td>
                                        <td>${percentage}%</td>
                                    </tr>
                                `;
                    }).join('') : ''}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align: right;"><strong>TOTAL:</strong></td>
                        <td><strong>₹${totalCategoryAmount.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>

            ${distributionChartImage ? `
            <div class="chart-container">
                <h2>Distribution Visualization</h2>
                <img src="${distributionChartImage}" alt="Expense Distribution Chart" class="chart-image" />
            </div>
            ` : ''}


        </body>
        </html>
        `;

        // Use the same browser print approach as the Reports section
        try {
            // Create a hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';

            // Add the iframe to the document
            document.body.appendChild(iframe);

            // Write content to the iframe
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            // Wait for resources to load then print
            iframe.onload = () => {
                // Trigger print dialog
                iframe.contentWindow.print();

                // Remove the iframe after printing
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 500);
            };

            // Set a timeout in case onload doesn't fire
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
            console.error("Error opening print dialog:", error);
            // Fallback: silent error handling
        }
    };

    // Export Monthly Comparison Chart to PDF
    const exportMonthlyChartToPDF = async () => {
        // Capture chart image
        let monthlyChartImage = '';

        try {
            if (monthlyChartRef.current) {
                const canvas = monthlyChartRef.current.canvas || monthlyChartRef.current;
                if (canvas && canvas.toDataURL) {
                    monthlyChartImage = canvas.toDataURL('image/png');
                }
            }
        } catch (error) {
            console.error('Error capturing chart:', error);
        }

        // Get comparison type display text
        let comparisonText = '';
        switch (comparisonType) {
            case 'last3':
                comparisonText = 'Last 3 Months';
                break;
            case 'last6':
                comparisonText = 'Last 6 Months';
                break;
            case 'last12':
                comparisonText = 'Last 12 Months';
                break;
            case 'custom':
                comparisonText = 'Custom Selection';
                break;
            default:
                comparisonText = 'Monthly Comparison';
        }

        // Calculate statistics
        let totalOfSelectedMonths = 0;
        let monthlyAmounts = [];

        if (Array.isArray(selectedMonths)) {
            monthlyAmounts = selectedMonths.map(month => {
                const monthData = monthlyExpensesData && monthlyExpensesData[month] ?
                    monthlyExpensesData[month] : null;
                if (monthData) {
                    totalOfSelectedMonths += monthData.total || 0;
                    return monthData.total || 0;
                }
                return 0;
            }).filter(amount => amount > 0);
        }

        const maxAmount = monthlyAmounts.length > 0 ? Math.max(...monthlyAmounts) : 0;
        const minAmount = monthlyAmounts.length > 0 ? Math.min(...monthlyAmounts) : 0;
        const avgAmount = monthlyAmounts.length > 0 ? totalOfSelectedMonths / monthlyAmounts.length : 0;

        // Find highest and lowest months
        let highestMonth = 'N/A';
        let lowestMonth = 'N/A';
        if (Array.isArray(selectedMonths) && monthlyAmounts.length > 0) {
            const highestIndex = monthlyAmounts.indexOf(maxAmount);
            const lowestIndex = monthlyAmounts.indexOf(minAmount);
            if (highestIndex !== -1 && monthlyExpensesData[selectedMonths[highestIndex]]) {
                highestMonth = monthlyExpensesData[selectedMonths[highestIndex]].monthLabel;
            }
            if (lowestIndex !== -1 && monthlyExpensesData[selectedMonths[lowestIndex]]) {
                lowestMonth = monthlyExpensesData[selectedMonths[lowestIndex]].monthLabel;
            }
        }

        // Create detailed breakdown for each selected month
        const detailedMonthBreakdown = Array.isArray(selectedMonths) ?
            [...selectedMonths]
                .sort((a, b) => {
                    // Sort chronologically
                    return a.localeCompare(b);
                })
                .map(month => {
                    const monthData = monthlyExpensesData && monthlyExpensesData[month] ?
                        monthlyExpensesData[month] : null;
                    if (monthData) {
                        // Sort categories by amount (descending)
                        const sortedCategories = Object.keys(monthData.categories || {})
                            .sort((a, b) => (monthData.categories[b] || 0) - (monthData.categories[a] || 0));

                        // Create category breakdown rows
                        const categoryRows = sortedCategories.map(categoryId => {
                            const category = categories.find(c => c.id === categoryId);
                            const categoryName = category ? category.name : categoryId;
                            const amount = monthData.categories[categoryId] || 0;
                            const percentage = monthData.total > 0 ?
                                ((amount / monthData.total) * 100).toFixed(1) : '0.0';
                            return `
                                        <tr>
                                            <td style="padding-left: 20px;">${categoryName}</td>
                                            <td>₹${amount.toLocaleString('en-IN')}</td>
                                            <td>${percentage}%</td>
                                        </tr>
                                    `;
                        }).join('');

                        // Return month section with category breakdown
                        return `
                            <div class="month-section" style="margin-bottom: 20px; page-break-inside: avoid;">
                                <h3 style="color: #ef4444; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-top: 20px;">
                                    ${monthData.monthLabel}
                                </h3>
                                <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                                    <thead>
                                        <tr style="background-color: #f3f4f6;">
                                            <th style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left;">Category</th>
                                            <th style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left;">Amount</th>
                                            <th style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left;">%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${categoryRows}
                                        <tr style="background-color: #fef2f2; font-weight: bold;">
                                            <td style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: right;">TOTAL:</td>
                                            <td style="border: 1px solid #e5e7eb; padding: 8px 12px;">₹${(monthData.total || 0).toLocaleString('en-IN')}</td>
                                            <td style="border: 1px solid #e5e7eb; padding: 8px 12px;"></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        `;
                    }
                    return '';
                }).join('') : '';

        // Create HTML content for PDF printing
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Monthly Expense Comparison</title>
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
                h3 {
                    color: #ef4444;
                    margin-top: 25px;
                    margin-bottom: 10px;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
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
                .chart-image {
                    width: 100%;
                    max-width: 800px;
                    height: auto;
                    margin: 20px auto;
                    display: block;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    page-break-inside: avoid;
                }
                .chart-container {
                    page-break-before: always;
                    text-align: center;
                    margin-top: 40px;
                }
                .footer {
                    margin-top: 40px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                }
                .month-section {
                    page-break-inside: avoid;
                }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none; }
                    .chart-container { page-break-before: always; }
                    .month-section { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Monthly Expense Comparison</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${comparisonText}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Expenses</div>
                    <div class="metric-value">₹${totalOfSelectedMonths.toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Number of Months</div>
                    <div class="metric-value">${Array.isArray(selectedMonths) ? selectedMonths.length : 0}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Average Monthly Expense</div>
                    <div class="metric-value">₹${avgAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Peak/Low</div>
                    <div class="metric-value" style="font-size: 16px;">₹${maxAmount.toLocaleString('en-IN')}</div>
                    <div style="color: #6b7280; font-size: 14px;">₹${minAmount.toLocaleString('en-IN')}</div>
                </div>
            </div>

            <h2>Monthly Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Total Expenses</th>
                        <th>% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${Array.isArray(selectedMonths) ?
                [...selectedMonths]
                    .sort((a, b) => {
                        const monthA = monthlyExpensesData && monthlyExpensesData[a] ? monthlyExpensesData[a].total : 0;
                        const monthB = monthlyExpensesData && monthlyExpensesData[b] ? monthlyExpensesData[b].total : 0;
                        return monthB - monthA;
                    })
                    .map(month => {
                        const monthData = monthlyExpensesData && monthlyExpensesData[month] ?
                            monthlyExpensesData[month] : null;
                        if (monthData) {
                            const percentage = totalOfSelectedMonths > 0 ?
                                ((monthData.total / totalOfSelectedMonths) * 100).toFixed(1) : '0.0';
                            return `
                                        <tr>
                                            <td>${monthData.monthLabel}</td>
                                            <td>₹${(monthData.total || 0).toLocaleString('en-IN')}</td>
                                            <td>${percentage}%</td>
                                        </tr>
                                    `;
                        }
                        return '';
                    }).join('') : ''}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align: right;"><strong>TOTAL:</strong></td>
                        <td><strong>₹${totalOfSelectedMonths.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>

            <h2>Detailed Monthly Breakdown</h2>
            <div class="detailed-breakdown">
                ${detailedMonthBreakdown}
            </div>

            ${monthlyChartImage ? `
            <div class="chart-container">
                <h2>Comparison Visualization</h2>
                <img src="${monthlyChartImage}" alt="Monthly Comparison Chart" class="chart-image" />
            </div>
            ` : ''}


        </body>
        </html>
        `;

        // Use the same browser print approach as the Reports section
        try {
            // Create a hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';

            // Add the iframe to the document
            document.body.appendChild(iframe);

            // Write content to the iframe
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            // Wait for resources to load then print
            iframe.onload = () => {
                // Trigger print dialog
                iframe.contentWindow.print();

                // Remove the iframe after printing
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 500);
            };

            // Set a timeout in case onload doesn't fire
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
            console.error("Error opening print dialog:", error);
            // Fallback: silent error handling
        }
    };

    // Helper function to draw a simple line chart in PDF
    const drawLineChartInPDF = (doc, data, x, y, width, height) => {
        if (!Array.isArray(data) || data.length === 0) return;

        // Chart area
        const chartX = x + 10;
        const chartY = y + 10;
        const chartWidth = width - 20;
        const chartHeight = height - 20;

        // Find min and max values
        const values = data.map(item => item.amount || 0);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal || 1; // Avoid division by zero

        // Draw axes
        doc.setDrawColor(200, 200, 200);
        doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight); // X-axis
        doc.line(chartX, chartY, chartX, chartY + chartHeight); // Y-axis

        // Draw line
        doc.setDrawColor(239, 68, 68); // Red color matching the theme
        doc.setLineWidth(1);

        const xStep = chartWidth / (data.length - 1 || 1);

        for (let i = 0; i < data.length - 1; i++) {
            const x1 = chartX + (i * xStep);
            const y1 = chartY + chartHeight - ((data[i].amount - minVal) / range) * chartHeight;
            const x2 = chartX + ((i + 1) * xStep);
            const y2 = chartY + chartHeight - ((data[i + 1].amount - minVal) / range) * chartHeight;

            doc.line(x1, y1, x2, y2);
        }

        // Draw data points
        doc.setFillColor(239, 68, 68);
        data.forEach((item, i) => {
            const px = chartX + (i * xStep);
            const py = chartY + chartHeight - ((item.amount - minVal) / range) * chartHeight;
            doc.circle(px, py, 1, 'F');
        });
    };

    // Helper function to draw a simple bar chart in PDF
    const drawBarChartInPDF = (doc, data, x, y, width, height) => {
        if (!Array.isArray(data) || data.length === 0) return;

        // Chart area
        const chartX = x + 10;
        const chartY = y + 10;
        const chartWidth = width - 20;
        const chartHeight = height - 20;

        // Find max value
        const maxValue = Math.max(...data.map(item => item.value || 0), 1);

        // Bar dimensions
        const barWidth = chartWidth / (data.length || 1);
        const barSpacing = barWidth * 0.2;
        const actualBarWidth = barWidth - barSpacing;

        // Draw bars
        data.forEach((item, i) => {
            const barHeight = ((item.value || 0) / maxValue) * chartHeight;
            const barX = chartX + (i * barWidth) + (barSpacing / 2);
            const barY = chartY + chartHeight - barHeight;

            // Set color based on item color or default
            if (item.color) {
                const hex = item.color.replace('#', '');
                const r = parseInt(hex.substr(0, 2), 16);
                const g = parseInt(hex.substr(2, 2), 16);
                const b = parseInt(hex.substr(4, 2), 16);
                doc.setFillColor(r, g, b);
            } else {
                doc.setFillColor(239, 68, 68); // Default red
            }

            doc.rect(barX, barY, actualBarWidth, barHeight, 'F');
        });

        // Draw axes
        doc.setDrawColor(200, 200, 200);
        doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight); // X-axis
        doc.line(chartX, chartY, chartX, chartY + chartHeight); // Y-axis
    };

    // Helper function to draw a simple pie chart in PDF
    const drawPieChartInPDF = (doc, data, x, y, radius) => {
        if (!Array.isArray(data) || data.length === 0) return;

        const centerX = x + radius;
        const centerY = y + radius;

        // Calculate total
        const total = data.reduce((sum, item) => sum + (item.value || 0), 0);

        if (total === 0) return;

        let startAngle = 0;

        // Draw pie slices
        data.forEach((item, i) => {
            const slice = ((item.value || 0) / total) * 360;
            const endAngle = startAngle + slice;

            // Set color based on item color or default
            if (item.color) {
                const hex = item.color.replace('#', '');
                const r = parseInt(hex.substr(0, 2), 16);
                const g = parseInt(hex.substr(2, 2), 16);
                const b = parseInt(hex.substr(4, 2), 16);
                doc.setFillColor(r, g, b);
            } else {
                // Generate different colors for each slice
                const colors = [
                    [239, 68, 68],   // Red
                    [59, 130, 246],  // Blue
                    [16, 185, 129],  // Green
                    [139, 92, 246],  // Purple
                    [245, 158, 11],  // Yellow
                    [236, 72, 153]   // Pink
                ];
                const color = colors[i % colors.length];
                doc.setFillColor(color[0], color[1], color[2]);
            }

            // Fallback: draw a simple colored circle for each item
            // This is a simplified representation when complex pie charts aren't supported
            const itemX = x + (i % 3) * (radius * 2 + 10);
            const itemY = y + Math.floor(i / 3) * (radius * 2 + 10);

            doc.circle(itemX + radius, itemY + radius, radius, 'F');

            // Add label
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.text(item.label.substring(0, 10), itemX + radius, itemY + radius + 3, null, null, 'center');
            doc.setTextColor(0, 0, 0);

            startAngle = endAngle;
        });
    };

    // Handle adding a new budget
    const handleAddBudget = (e) => {
        e.preventDefault();
        if (newBudget.amount) {
            const budget = {
                id: Date.now(),
                ...newBudget,
                amount: parseFloat(newBudget.amount),
                spent: 0
            };
            setBudgets([...budgets, budget]);
            setNewBudget({
                category: 'food',
                amount: '',
                month: new Date().toISOString().slice(0, 7)
            });
            setShowAddBudget(false);
        }
    };

    // Handle budget input changes
    const handleBudgetInputChange = (e) => {
        const { name, value } = e.target;
        setNewBudget({
            ...newBudget,
            [name]: value
        });
    };

    // Calculate budget progress
    const calculateBudgetProgress = (budget) => {
        const percentage = (budget.spent / budget.amount) * 100;
        let color = 'bg-green-500';
        if (percentage > 90) color = 'bg-red-500';
        else if (percentage > 75) color = 'bg-yellow-500';
        return { percentage, color };
    };

    // Get current month budgets
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentBudgets = budgets.filter(budget => budget.month === currentMonth);

    return (
        <div className="space-y-6 px-4 md:px-6 py-4">
            {/* Header with tab switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportToCSV}
                            className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors text-sm font-medium"
                        >
                            <i className="ph ph-file-csv text-lg"></i>
                            <span className="hidden sm:inline">Excel</span>
                        </button>
                        <button
                            onClick={exportToPDF}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm font-medium"
                        >
                            <i className="ph ph-file-pdf text-lg"></i>
                            <span className="hidden sm:inline">PDF</span>
                        </button>
                        <button
                            onClick={() => setShowAddExpense(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                            <i className="ph ph-plus text-lg"></i>
                            Add Expense
                        </button>
                    </div>
                </div>
            </div>

            {/* Toggle Switch for Budget Management and Analytics */}
            <div className="flex gap-2">
                <button
                    onClick={() => navigate('/budget-management')}
                    className="px-4 py-2 rounded-md font-medium transition-colors bg-gray-200 text-gray-700 hover:bg-red-500 hover:text-white"
                >
                    Budget Management
                </button>
                <button
                    className="px-4 py-2 rounded-md font-medium transition-colors bg-red-500 text-white cursor-default"
                >
                    Analytics & Reports
                </button>
            </div>

            {/* Date filter tabs - Analytics style */}
            <div className="flex items-center gap-4 overflow-x-auto pb-2 mb-6">
                {dateFilters.map(filter => (
                    <button
                        key={filter.id}
                        className={`px-4 py-2 whitespace-nowrap ${dateFilter === filter.id
                            ? 'text-blue-600 border-b-2 border-blue-600 font-medium'
                            : 'text-red-600 hover:text-blue-600'
                            }`}
                        onClick={() => setDateFilter(filter.id)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* Custom date range picker */}
            {dateFilter === 'custom' && (
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">
                            From:
                        </label>
                        <input
                            type="date"
                            name="start"
                            value={customDateRange.start}
                            onChange={handleCustomDateChange}
                            className="px-3 py-2 border border-gray-200 rounded-lg"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">
                            To:
                        </label>
                        <input
                            type="date"
                            name="end"
                            value={customDateRange.end}
                            onChange={handleCustomDateChange}
                            className="px-3 py-2 border border-gray-200 rounded-lg"
                        />
                    </div>
                    <button
                        onClick={() => {
                            // Force re-filter expenses when Apply is clicked
                            if (customDateRange.start && customDateRange.end) {
                                // Create a copy of the current date range to force a state update
                                setCustomDateRange({ ...customDateRange });
                            }
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                    >
                        Apply
                    </button>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Total Expenses</p>
                            <p className="text-2xl font-bold text-gray-900">₹{totalExpenses.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-full">
                            <i className="ph ph-wallet text-red-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            {dateFilter === 'custom'
                                ? `${customDateRange.start} to ${customDateRange.end}`
                                : dateFilters.find(f => f.id === dateFilter)?.label || 'Selected period'}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Total Transactions</p>
                            <p className="text-2xl font-bold text-gray-900">{totalTransactions}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-full">
                            <i className="ph ph-receipt text-blue-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            {dateFilter === 'custom'
                                ? `${customDateRange.start} to ${customDateRange.end}`
                                : dateFilters.find(f => f.id === dateFilter)?.label || 'Selected period'}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Top Category</p>
                            <p className="text-lg font-bold text-gray-900">{topCategory.name}</p>
                            <p className="text-sm text-gray-500">₹{topCategory.amount.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-full">
                            <i className="ph ph-tag text-purple-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            Highest spending category
                        </span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Top Vendor</p>
                            <p className="text-lg font-bold text-gray-900">{topVendor.name}</p>
                            <p className="text-sm text-gray-500">₹{topVendor.amount.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-full">
                            <i className="ph ph-storefront text-green-500 text-xl"></i>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center">
                        <span className="text-sm text-gray-500">
                            Highest expense vendor
                        </span>
                    </div>
                </div>
            </div>

            {/* Analytics & Reports Section - Always Visible */}
            <div>
                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Daily Trend Chart */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Daily Expense Trend</h3>
                            <div className="flex items-center space-x-2">
                                {/* Chart type toggle */}
                                <div className="flex rounded-lg shadow-sm overflow-hidden">
                                    <button
                                        onClick={() => setTrendChartType('line')}
                                        className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${trendChartType === 'line'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                            } rounded-l-lg`}
                                    >
                                        Line
                                    </button>
                                    <button
                                        onClick={() => setTrendChartType('bar')}
                                        className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${trendChartType === 'bar'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                            } rounded-r-lg`}
                                    >
                                        Bar
                                    </button>
                                </div>
                                <i className={`ph ph-chart-${trendChartType} text-gray-400 text-xl`}></i>
                                <span className="text-sm text-gray-500 capitalize">{trendChartType} Chart</span>
                                <button
                                    onClick={exportTrendChartToPDF}
                                    className="flex items-center gap-2 text-blue-500 hover:text-blue-700 text-sm font-medium ml-2"
                                >
                                    <i className="ph ph-file-pdf text-lg"></i>
                                    PDF
                                </button>
                            </div>
                        </div>
                        <div className="h-96 relative">
                            {trendData.length > 0 ? (
                                <div className="chart-container" style={{ position: 'relative', height: '100%' }}>
                                    {trendChartType === 'line' ? (
                                        <Line data={lineChartData} options={lineChartOptions} />
                                    ) : (
                                        <Bar data={lineChartData} options={lineChartOptions} />
                                    )}
                                    <div style={{
                                        position: 'absolute',
                                        top: '10px',
                                        right: '10px',
                                        fontSize: '12px',
                                        color: '#888',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        👆 Click for details
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500">
                                    No data available for the selected period
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Category Distribution Chart */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Expense Distribution</h3>
                            <div className="flex items-center space-x-2">
                                {/* Chart type toggle */}
                                <div className="flex rounded-lg shadow-sm overflow-hidden">
                                    <button
                                        onClick={() => setDistributionChartType('pie')}
                                        className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${distributionChartType === 'pie'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                            } rounded-l-lg`}
                                    >
                                        Pie
                                    </button>
                                    <button
                                        onClick={() => setDistributionChartType('bar')}
                                        className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${distributionChartType === 'bar'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                            } rounded-r-lg`}
                                    >
                                        Bar
                                    </button>
                                </div>
                                <i className={`ph ph-chart-${distributionChartType} text-gray-400 text-xl`}></i>
                                <span className="text-sm text-gray-500 capitalize">{distributionChartType} Chart</span>
                                <button
                                    onClick={exportCategoryChartToPDF}
                                    className="flex items-center gap-2 text-blue-500 hover:text-blue-700 text-sm font-medium ml-2"
                                >
                                    <i className="ph ph-file-pdf text-lg"></i>
                                    PDF
                                </button>
                            </div>
                        </div>
                        <div className="h-96 relative">
                            {Object.keys(categoryExpenses).length > 0 ? (
                                <div className="chart-container" style={{ position: 'relative', height: '100%' }}>
                                    {distributionChartType === 'pie' ? (
                                        <Pie data={pieChartData} options={pieChartOptions} />
                                    ) : (
                                        <Bar data={pieChartData} options={pieChartOptions} />
                                    )}
                                    <div style={{
                                        position: 'absolute',
                                        top: '10px',
                                        right: '10px',
                                        fontSize: '12px',
                                        color: '#888',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        👆 Click for details
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500">
                                    No data available for the selected period
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Monthly Comparison Button */}
                <div className="flex justify-center mt-6">
                    <button
                        onClick={toggleMonthlyComparison}
                        className={`flex items-center gap-2 px-6 py-3 ${showMonthlyComparison
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            } rounded-lg transition-colors font-medium shadow-sm`}
                    >
                        <i className={`ph ph-chart-bar text-xl`}></i>
                        <span>{showMonthlyComparison ? 'Hide Monthly Comparison' : 'Show Monthly Comparison'}</span>
                    </button>
                </div>

                {/* Monthly Comparison Section - Shown below button when active */}
                {showMonthlyComparison && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold">Monthly Expense Comparison</h2>
                            <button
                                onClick={exportMonthlyChartToPDF}
                                className="text-blue-500 hover:text-blue-700 flex items-center text-sm"
                            >
                                <i className="ph ph-file-pdf mr-1"></i>
                                PDF
                            </button>
                        </div>

                        {/* Month Selection */}
                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-sm text-gray-600">
                                    {comparisonType === 'custom'
                                        ? `Select up to 6 months to compare (currently selected: ${selectedMonths.length}/6)`
                                        : `Showing ${comparisonType === 'last3' ? 'last 3' : comparisonType === 'last6' ? 'last 6' : 'last 12'} months`}
                                </p>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowComparisonDropdown(!showComparisonDropdown)}
                                        className="text-sm text-red-500 hover:text-red-700 flex items-center"
                                    >
                                        Quick Select
                                        <i className={`ph ph-caret-${showComparisonDropdown ? 'up' : 'down'} ml-1`}></i>
                                    </button>

                                    {showComparisonDropdown && (
                                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                                            <div className="py-1">
                                                <button
                                                    onClick={() => handleComparisonTypeChange('last3')}
                                                    className={`block px-4 py-2 text-sm w-full text-left ${comparisonType === 'last3'
                                                        ? 'bg-red-50 text-red-500'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                >
                                                    Last 3 Months
                                                </button>
                                                <button
                                                    onClick={() => handleComparisonTypeChange('last6')}
                                                    className={`block px-4 py-2 text-sm w-full text-left ${comparisonType === 'last6'
                                                        ? 'bg-red-50 text-red-500'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                >
                                                    Last 6 Months
                                                </button>
                                                <button
                                                    onClick={() => handleComparisonTypeChange('last12')}
                                                    className={`block px-4 py-2 text-sm w-full text-left ${comparisonType === 'last12'
                                                        ? 'bg-red-50 text-red-500'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                >
                                                    Last 12 Months
                                                </button>
                                                <button
                                                    onClick={() => handleComparisonTypeChange('custom')}
                                                    className={`block px-4 py-2 text-sm w-full text-left ${comparisonType === 'custom'
                                                        ? 'bg-red-50 text-red-500'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                >
                                                    Custom Selection
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(monthlyExpensesData)
                                    .sort()
                                    .reverse()
                                    .map(month => {
                                        const monthData = monthlyExpensesData[month];
                                        const isSelected = selectedMonths.includes(month);
                                        const isDisabled = comparisonType !== 'custom' ||
                                            (!isSelected && selectedMonths.length >= 6);
                                        return (
                                            <button
                                                key={month}
                                                onClick={() => {
                                                    if (comparisonType === 'custom') {
                                                        handleMonthToggle(month);
                                                    }
                                                }}
                                                disabled={isDisabled}
                                                className={`px-3 py-2 text-sm rounded-lg transition-colors flex items-center ${isSelected
                                                    ? 'bg-red-500 text-white'
                                                    : isDisabled
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                    }`}
                                            >
                                                {isSelected && (
                                                    <i className="ph ph-check mr-1"></i>
                                                )}
                                                {monthData.monthLabel} (₹{monthData.total.toLocaleString('en-IN')})
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Monthly Comparison Bar Chart */}
                        <div className="h-96 relative">
                            {selectedMonths.length > 0 ? (
                                <div className="chart-container" style={{ position: 'relative', height: '100%' }}>
                                    <Bar data={monthlyComparisonData} options={barChartOptions} ref={monthlyChartRef} />
                                    <div style={{
                                        position: 'absolute',
                                        top: '10px',
                                        right: '10px',
                                        fontSize: '12px',
                                        color: '#888',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        👆 Click for details
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500">
                                    Select months to compare
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Expenses Table */}
            <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Expense Details</h3>
                    <p className="text-red-600 text-sm mt-1">All expenses for the selected period</p>
                </div>
                <div className="p-6">
                    {filteredExpenses.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Slip</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredExpenses.map((expense) => {
                                        const category = categories.find(c => c.id === expense.category);
                                        return (
                                            <tr key={expense.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(expense.date).toLocaleDateString('en-GB')}</td>
                                                <td className="px-6 py-4 text-sm font-medium text-gray-900 break-words max-w-xs">{expense.description}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: category?.color + '20', color: category?.color }}>
                                                        {category?.name || expense.category}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expense.vendor || 'N/A'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    ₹{expense.amount.toLocaleString('en-IN')}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <button
                                                        onClick={() => exportExpenseToPDF(expense)}
                                                        className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
                                                        title="Download Payment Slip"
                                                    >
                                                        <i className="ph ph-receipt text-base"></i>
                                                        Slip
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
                            <p>No expenses found for the selected period</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Expense Modal */}
            {showAddExpense && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
                        <div className="p-4 bg-gradient-to-r from-red-50 to-rose-50 rounded-t-2xl">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-red-500 rounded-xl">
                                        <i className="ph ph-wallet text-white text-xl"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-800">Add New Expense</h3>
                                        <p className="text-red-600 text-sm">Record a new business expense</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAddExpense(false)}
                                    className="p-2 text-gray-500 hover:text-gray-700 rounded-xl hover:bg-white transition-all"
                                >
                                    <i className="ph ph-x text-xl"></i>
                                </button>
                            </div>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleAddExpense}>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Left Column */}
                                    <div className="space-y-4">
                                        {/* Category Field */}
                                        <div>
                                            <label className="block text-base font-bold text-gray-800 mb-2">Category</label>
                                            <select
                                                name="category"
                                                value={newExpense.category}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm shadow-sm"
                                            >
                                                <option value="">Select an existing category</option>
                                                {categories.map(category => (
                                                    <option key={category.id} value={category.id}>{category.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* New Category Input */}
                                        <div>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    name="newCategory"
                                                    placeholder="Create a new category"
                                                    value={newExpense.category && !categories.find(c => c.id === newExpense.category) ? newExpense.category : ''}
                                                    onChange={handleInputChange}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm shadow-sm"
                                                />
                                                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                                    <i className="ph ph-plus-circle text-gray-400 text-sm"></i>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description Field */}
                                        <div>
                                            <label className="block text-base font-bold text-gray-800 mb-2">Description</label>
                                            <textarea
                                                name="description"
                                                value={newExpense.description}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm shadow-sm"
                                                rows="3"
                                                required
                                                placeholder="Enter detailed description..."
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column */}
                                    <div className="space-y-4">
                                        {/* Amount Field */}
                                        <div>
                                            <label className="block text-base font-bold text-gray-800 mb-2">Amount (₹)</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">₹</span>
                                                <input
                                                    type="number"
                                                    name="amount"
                                                    value={newExpense.amount}
                                                    onChange={handleInputChange}
                                                    className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm shadow-sm"
                                                    required
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        {/* Vendor Field */}
                                        <div>
                                            <label className="block text-base font-bold text-gray-800 mb-2">Vendor</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    name="vendor"
                                                    value={newExpense.vendor}
                                                    onChange={handleInputChange}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm shadow-sm"
                                                    placeholder="Enter vendor or supplier name"
                                                />
                                                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                                    <i className="ph ph-storefront text-gray-400 text-sm"></i>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Date Field */}
                                        <div>
                                            <label className="block text-base font-bold text-gray-800 mb-2">Date</label>
                                            <div className="relative">
                                                <input
                                                    type="date"
                                                    name="date"
                                                    value={newExpense.date}
                                                    onChange={handleInputChange}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm shadow-sm"
                                                    required
                                                />
                                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                                    <i className="ph ph-calendar text-gray-400 text-sm"></i>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Helpful Tips */}
                                        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-lg p-3">
                                            <div className="flex items-start">
                                                <div className="p-1.5 bg-red-100 rounded-lg">
                                                    <i className="ph ph-lightbulb text-red-500 text-base"></i>
                                                </div>
                                                <div className="ml-3">
                                                    <h4 className="text-sm font-semibold text-red-800">Expense Tips</h4>
                                                    <p className="text-xs text-red-700 mt-1">Enter detailed descriptions to help with future analysis and categorization of your expenses.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddExpense(false)}
                                        className="px-6 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold text-sm transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-semibold text-sm transition-all flex items-center gap-2"
                                    >
                                        <i className="ph ph-plus-circle text-base"></i>
                                        Add Expense
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Budget Modal */}
            {showAddBudget && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-8 bg-gradient-to-r from-red-50 to-rose-50 rounded-t-2xl">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-red-500 rounded-xl shadow-md">
                                        <i className="ph ph-wallet text-white text-2xl"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-3xl font-bold text-gray-800">Add New Budget</h3>
                                        <p className="text-red-600 text-base mt-1">Set a budget for a category</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAddBudget(false)}
                                    className="p-3 text-gray-500 hover:text-gray-700 rounded-xl hover:bg-white transition-all duration-300 shadow-sm"
                                >
                                    <i className="ph ph-x text-2xl"></i>
                                </button>
                            </div>
                        </div>
                        <div className="p-8">
                            <form onSubmit={handleAddBudget}>
                                <div className="space-y-8">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div className="space-y-8">
                                            {/* Category Field */}
                                            <div>
                                                <label className="block text-base font-semibold text-gray-800 mb-3">Category</label>
                                                <div className="relative">
                                                    <select
                                                        name="category"
                                                        value={newBudget.category}
                                                        onChange={handleBudgetInputChange}
                                                        className="w-full px-5 py-4 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-lg shadow-sm"
                                                    >
                                                        <option value="">Select a category</option>
                                                        {categories.map(category => (
                                                            <option key={category.id} value={category.id}>{category.name}</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-5">
                                                        <i className="ph ph-tag text-gray-400"></i>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Amount Field */}
                                            <div>
                                                <label className="block text-base font-semibold text-gray-800 mb-3">Budget Amount (₹)</label>
                                                <div className="relative">
                                                    <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-500 text-lg">₹</span>
                                                    <input
                                                        type="number"
                                                        name="amount"
                                                        value={newBudget.amount}
                                                        onChange={handleBudgetInputChange}
                                                        className="w-full pl-12 pr-5 py-4 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-lg shadow-sm"
                                                        required
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-8">
                                            {/* Month & Year Fields */}
                                            <div>
                                                <label className="block text-base font-semibold text-gray-800 mb-3">Period</label>
                                                <div className="grid grid-cols-2 gap-5">
                                                    <div className="relative">
                                                        <input
                                                            type="month"
                                                            name="month"
                                                            value={newBudget.month}
                                                            onChange={handleBudgetInputChange}
                                                            className="w-full px-5 py-4 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-lg shadow-sm"
                                                            required
                                                        />
                                                        <div className="absolute inset-y-0 right-0 flex items-center pr-5">
                                                            <i className="ph ph-calendar text-gray-400"></i>
                                                        </div>
                                                    </div>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            name="year"
                                                            value={newBudget.year}
                                                            onChange={handleBudgetInputChange}
                                                            className="w-full px-5 py-4 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-lg shadow-sm"
                                                            required
                                                            min="2020"
                                                            max="2030"
                                                            placeholder="Year"
                                                        />
                                                        <div className="absolute inset-y-0 right-0 flex items-center pr-5">
                                                            <i className="ph ph-calendar-plus text-gray-400"></i>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Helpful Tips */}
                                            <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl p-6 mt-4">
                                                <div className="flex items-start">
                                                    <div className="p-2 bg-red-100 rounded-lg">
                                                        <i className="ph ph-lightbulb text-red-500 text-xl"></i>
                                                    </div>
                                                    <div className="ml-4">
                                                        <h4 className="text-lg font-semibold text-red-800">Budget Tips</h4>
                                                        <p className="text-red-700 mt-2">Set realistic budgets based on your historical spending patterns for better financial control. Consider seasonal variations in your expenses.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex justify-end gap-4 pt-6">
                                        <button
                                            type="button"
                                            onClick={() => setShowAddBudget(false)}
                                            className="px-8 py-4 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-2xl font-semibold text-lg transition-all duration-300 shadow-md hover:shadow-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-8 py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-2xl font-semibold text-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                                        >
                                            <div className="flex items-center">
                                                <i className="ph ph-plus-circle text-xl mr-3"></i>
                                                Add Budget
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Daily Expense Detail Modal */}
            <DailyExpenseDetailModal
                isOpen={showDailyExpenseModal}
                onClose={() => setShowDailyExpenseModal(false)}
                selectedDate={selectedDate}
                expenses={expenses}
                categories={categories}
            />

            {/* Category Expense Detail Modal */}
            <CategoryExpenseDetailModal
                isOpen={showCategoryModal}
                onClose={() => setShowCategoryModal(false)}
                selectedCategory={selectedCategoryId}
                expenses={filteredExpenses}
                categories={categories}
            />

            {/* Monthly Expense Detail Modal */}
            <MonthlyExpenseDetailModal
                isOpen={showMonthlyModal}
                onClose={() => setShowMonthlyModal(false)}
                selectedMonth={selectedMonth}
                expenses={expenses}
                categories={categories}
            />
        </div>
    );
}
