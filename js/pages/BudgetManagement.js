import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    getExpenses,
    getBudgets,
    syncBudgetsWithExpenses,
    calculateActualSpending
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
    BarElement
} from 'chart.js';

import { Bar } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    BarElement
);


export default function BudgetManagement() {
    const navigate = useNavigate();
    const [budgets, setBudgets] = useState([]);

    const [expenses, setExpenses] = useState([]);
    const [newBudget, setNewBudget] = useState({
        category: '',
        amount: '',
        month: new Date().toISOString().slice(0, 7),
        year: new Date().getFullYear()
    });
    const [newExpense, setNewExpense] = useState({
        description: '',
        amount: '',
        category: '',
        vendor: '',
        date: new Date().toISOString().split('T')[0]
    });
    const [showAddBudget, setShowAddBudget] = useState(false);
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [showEditBudget, setShowEditBudget] = useState(false);
    const [currentBudget, setCurrentBudget] = useState(null);
    const [showEditMonthBudget, setShowEditMonthBudget] = useState(false);
    const [monthBudgetData, setMonthBudgetData] = useState({
        totalAmount: 0,
        month: new Date().toISOString().slice(0, 7),
        year: new Date().getFullYear()
    });
    const [isAddingMonthBudget, setIsAddingMonthBudget] = useState(false);
    const [isEditingFixedCategory, setIsEditingFixedCategory] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState(null);
    // View Budget dropdown state
    const [showViewBudgetDropdown, setShowViewBudgetDropdown] = useState(false);
    const [selectedViewMonth, setSelectedViewMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [selectedViewYear, setSelectedViewYear] = useState(new Date().getFullYear().toString());
    // Viewed month and year state
    const [viewedMonth, setViewedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [viewedYear, setViewedYear] = useState(new Date().getFullYear().toString());

    // Expense categories
    const categories = [
        { id: 'food', name: 'Food & Ingredients', color: '#EF4444' },
        { id: 'staff', name: 'Staff Salaries', color: '#3B82F6' },
        { id: 'utilities', name: 'Utilities', color: '#10B981' },
        { id: 'rent', name: 'Rent', color: '#8B5CF6' },
        { id: 'maintenance', name: 'Maintenance', color: '#F59E0B' },
        { id: 'marketing', name: 'Marketing', color: '#EC4899' },
        { id: 'other', name: 'Other', color: '#6366F1' }
    ];

    // Initialize with data from Firebase or localStorage
    useEffect(() => {
        const initializeData = async () => {
            try {
                console.log('BudgetManagement.js: Initializing data from Firebase');

                // Fetch data from Firebase
                console.log('BudgetManagement.js: Fetching expenses from Firebase...');
                const firebaseExpenses = await getFirebaseExpenses();
                console.log('BudgetManagement.js: Firebase expenses result:', firebaseExpenses);

                console.log('BudgetManagement.js: Fetching budgets from Firebase...');
                const firebaseBudgets = await getFirebaseBudgets();
                console.log('BudgetManagement.js: Firebase budgets result:', firebaseBudgets);

                console.log('BudgetManagement.js: Fetching categories from Firebase...');
                const firebaseCategories = await getFirebaseCategories();
                console.log('BudgetManagement.js: Firebase categories result:', firebaseCategories);

                if (firebaseExpenses && firebaseExpenses.length > 0) {
                    console.log('BudgetManagement.js: Setting expenses from Firebase');
                    setExpenses(firebaseExpenses);
                }

                if (firebaseBudgets && firebaseBudgets.length > 0) {
                    // Use stored budgets and sync with actual expenses
                    console.log('BudgetManagement.js: Syncing budgets with expenses');
                    const syncedBudgets = syncBudgetsWithExpenses(firebaseBudgets, firebaseExpenses || []);
                    setBudgets(syncedBudgets);
                } else {
                    // Initialize with sample data
                    console.log('BudgetManagement.js: Initializing with sample data');
                    const syncedBudgets = syncBudgetsWithExpenses(sampleBudgets, firebaseExpenses || []);
                    setBudgets(syncedBudgets);
                    await saveBudgets(syncedBudgets);
                }
            } catch (error) {
                console.error('=== ERROR INITIALIZING DATA FROM FIREBASE ===');
                console.error('Error type:', error.constructor.name);
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);

                // Fallback to localStorage
                console.log('BudgetManagement.js: Falling back to localStorage');
                const storedBudgets = getBudgets();
                const storedExpenses = getExpenses();
                const storedCategories = getCategories();

                if (storedExpenses && storedExpenses.length > 0) {
                    console.log('BudgetManagement.js: Setting expenses from localStorage');
                    setExpenses(storedExpenses);
                }

        if (storedBudgets && storedBudgets.length > 0) {
            // Use stored budgets and sync with actual expenses
            const syncedBudgets = syncBudgetsWithExpenses(storedBudgets, storedExpenses || []);
            setBudgets(syncedBudgets);
                } else {
            // Initialize with sample data based on categories
            const currentDate = new Date();
            const currentMonth = currentDate.toISOString().slice(0, 7);
            const currentYear = currentDate.getFullYear();
            
            const sampleBudgets = categories.map((category, index) => ({
                id: `sample-${category.id}-${Date.now()}-${index}`,
                category: category.id,
                amount: 0,
                month: currentMonth,
                year: currentYear,
                spent: 0
            }));
            
            const syncedBudgets = syncBudgetsWithExpenses(sampleBudgets, storedExpenses || []);
            setBudgets(syncedBudgets);
            saveBudgets(syncedBudgets);
        }

    }   // <-- closes catch
};      // <-- closes async initializeData

initializeData();   // <-- important!

}, []);  // <-- closes useEffect


        // Listen for expense updates from Expenses page
        const unsubscribe = listenForExpenseUpdates((updatedExpenses) => {
            // Update expenses state
            setExpenses(updatedExpenses);
            // Re-sync budgets with new expenses
            setBudgets(prevBudgets => {
                return syncBudgetsWithExpenses(prevBudgets, updatedExpenses);
            });
        });

        // Also listen for direct budget updates
        useEffect(() => {
  const unsubscribeBudgets = listenForBudgetUpdates((updatedBudgets) => {
    setBudgets(updatedBudgets);
  });

  return () => {
    unsubscribeBudgets();
  };
}, []);


    // Sync budgets to Firebase whenever they change
    useEffect(() => {
        if (budgets.length > 0) {
            saveBudgets(budgets);
        }
    }, [budgets]);

    // Sync expenses to Firebase whenever they change
    useEffect(() => {
        if (expenses.length > 0) {
            saveExpenses(expenses);
        }
    }, [expenses]);

    // Calculate budget progress
    const calculateBudgetProgress = (budget) => {
        // If budget amount is 0, set percentage to 0 to avoid division by zero
        const percentage = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
        let color = 'bg-green-500';
        if (percentage > 90) color = 'bg-red-500';
        else if (percentage > 75) color = 'bg-yellow-500';
        return { percentage, color };
    };

    // Handle input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewBudget({
            ...newBudget,
            [name]: value
        });
    };

    // Handle add budget
    const handleAddBudget = async (e) => {
        e.preventDefault();

        // If adding a month budget (no category selection), create budgets for all categories
       if (isAddingMonthBudget && newBudget.amount) {
    const totalAmount = parseFloat(newBudget.amount);
    const categoryCount = categories.length;
    const amountPerCategory = Math.round(totalAmount / categoryCount);

    // ✅ collect new budgets here
    const newBudgets = [];

    for (let index = 0; index < categories.length; index++) {
        const category = categories[index];

        const amount =
            index === categoryCount - 1
                ? totalAmount - amountPerCategory * (categoryCount - 1)
                : amountPerCategory;

        const budgetData = {
            category: category.id,
            amount: amount,
            month: newBudget.month,
            year: newBudget.year,
            spent: 0
        };

        newBudgets.push(budgetData);
    }

    // Merge with existing budgets
    const updatedBudgets = [...budgets, ...newBudgets];

    // Sync with actual expenses
    const storedExpenses = getExpenses() || [];
    const syncedBudgets = syncBudgetsWithExpenses(updatedBudgets, storedExpenses);

    console.log('About to save budgets:', syncedBudgets);

    setBudgets(syncedBudgets);

    try {
        await saveBudgets(syncedBudgets);
        console.log('Successfully saved budgets');
    } catch (error) {
        console.error('Error in handleAddBudget while saving budgets:', error);
    }

    setNewBudget({
        category: '',
        amount: '',
        month: new Date().toISOString().slice(0, 7),
        year: new Date().getFullYear()
    });

    setIsAddingMonthBudget(false);
    setShowAddBudget(false);
}

        // Regular budget addition with category selection
        else if (newBudget.category && newBudget.amount) {
            const budgetData = {
                ...newBudget,
                amount: parseFloat(newBudget.amount),
                spent: 0 // Will be calculated from actual expenses
            };

            const updatedBudgets = [...budgets, budget];
            // Sync with actual expenses
            const expenses = getExpenses() || [];
            const syncedBudgets = syncBudgetsWithExpenses(updatedBudgets, expenses);

            console.log('About to save budgets:', syncedBudgets);
            setBudgets(syncedBudgets);
            try {
                await saveBudgets(syncedBudgets);
                console.log('Successfully saved budgets');
            } catch (error) {
                console.error('Error in handleAddBudget while saving budgets:', error);
            }

            setNewBudget({
                category: '',
                amount: '',
                month: new Date().toISOString().slice(0, 7),
                year: new Date().getFullYear()
            });
            setShowAddBudget(false);
        }
    };

    // Handle update budget
    const handleUpdateBudget = async (e) => {
        e.preventDefault();
        if (newBudget.category && newBudget.amount) {
            const updatedBudgets = budgets.map(budget =>
                budget.id === currentBudget.id
                    ? { ...budget, ...newBudget, amount: parseFloat(newBudget.amount) }
                    : budget
            );
            setBudgets(updatedBudgets);
            await saveBudgets(updatedBudgets);
            setNewBudget({
                category: '',
                amount: '',
                month: viewedMonth,
                year: parseInt(viewedYear)
            });
            setCurrentBudget(null);
            setShowEditBudget(false);
        }
    };

    // Handle delete budget
    const handleDeleteBudget = async (id) => {
        const updatedBudgets = budgets.filter(budget => budget.id !== id);
        setBudgets(updatedBudgets);
        await saveBudgets(updatedBudgets);
    };

    // Handle edit budget - NEW FUNCTION
    const handleEditBudget = (budget, fromChart = false) => {
        setCurrentBudget(budget);
        setNewBudget({
            category: budget.category,
            amount: budget.amount,
            month: budget.month,
            year: budget.year
        });
        setShowEditBudget(true);
        // If called from chart, we might want to do something special
        if (fromChart) {
            console.log('Editing budget from chart:', budget);
        }
    };

    // Get viewed month/year budgets
    const viewedBudgets = budgets.filter(budget =>
        budget.month === viewedMonth && budget.year.toString() === viewedYear
    );

    // Get viewed month expenses
    const viewedExpenses = expenses
        .filter(expense => {
            // Handle both string and Date object formats for expense.date
            let expenseDate;
            if (expense.date instanceof Date) {
                expenseDate = expense.date;
            } else {
                expenseDate = new Date(expense.date);
            }

            // Check if the date is valid
            if (isNaN(expenseDate.getTime())) {
                return false; // Skip invalid dates
            }

            const expenseMonth = expenseDate.toISOString().slice(0, 7);
            const expenseYear = expenseDate.getFullYear();
            return expenseMonth === viewedMonth && expenseYear.toString() === viewedYear;
        })
        .sort((a, b) => {
            // Handle date sorting with validation for both a and b
            let dateA, dateB;

            // Handle date for expense a
            if (a.date instanceof Date) {
                dateA = a.date;
            } else {
                dateA = new Date(a.date);
            }

            // Handle date for expense b
            if (b.date instanceof Date) {
                dateB = b.date;
            } else {
                dateB = new Date(b.date);
            }

            // Check if dates are valid
            const isDateAValid = !isNaN(dateA.getTime());
            const isDateBValid = !isNaN(dateB.getTime());

            if (!isDateAValid && !isDateBValid) return 0;
            if (!isDateAValid) return 1;
            if (!isDateBValid) return -1;

            return dateB - dateA;
        }); // Sort by date descending (newest first)    // Sync budgets with expenses for the viewed month
    const viewedBudgetsWithExpenses = syncBudgetsWithExpenses(viewedBudgets, viewedExpenses);

    // Create a complete list of budgets for all categories for the viewed month
    // This ensures we show data for all categories even if no budget was explicitly set
    const completeBudgetData = categories.map(category => {
        // Find if there's an existing budget for this category and month
        const existingBudget = viewedBudgetsWithExpenses.find(b => b.category === category.id);

        if (existingBudget) {
            return existingBudget;
        } else {
            // Create a default budget entry with 0 amount if none exists
            return {
                id: `default-${category.id}-${viewedMonth}`,
                category: category.id,
                amount: 0,
                month: viewedMonth,
                year: parseInt(viewedYear),
                spent: 0
            };
        }
    });

    // Calculate actual spending for each category in the viewed month
    // This ensures we show spending data even when no budget exists
    const updatedCompleteBudgetData = completeBudgetData.map(budget => {
        const actualSpent = calculateActualSpending(viewedExpenses, budget.category, viewedMonth);
        return {
            ...budget,
            spent: actualSpent
        };
    });

    // Chart data for budget vs spent
    const budgetSpentData = {
        labels: updatedCompleteBudgetData.map(budget => {
            const category = categories.find(c => c.id === budget.category);
            return category ? category.name : budget.category;
        }),
        datasets: [
            {
                label: 'Budget',
                data: updatedCompleteBudgetData.map(budget => budget.amount),
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1
            },
            {
                label: 'Spent',
                data: updatedCompleteBudgetData.map(budget => budget.spent),
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }
        ]
    };

    const budgetSpentOptions = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Budget vs Spent by Category'
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
                const clickedBudget = updatedCompleteBudgetData[dataIndex];
                if (clickedBudget) {
                    // Only allow editing if it's a real budget (not a default one)
                    if (!clickedBudget.id.toString().startsWith('default-')) {
                        handleEditBudget(clickedBudget, true);
                    } else {
                        // For default budgets, open the add budget form with pre-filled data
                        setNewBudget({
                            category: clickedBudget.category,
                            amount: '',
                            month: clickedBudget.month,
                            year: clickedBudget.year
                        });
                        setShowAddBudget(true);
                    }
                }
            }
        }
    };

    // Chart data for budget utilization
    const budgetUtilizationData = {
        labels: updatedCompleteBudgetData.map(budget => {
            const category = categories.find(c => c.id === budget.category);
            return category ? category.name : budget.category;
        }),
        datasets: [
            {
                label: 'Utilization %',
                data: updatedCompleteBudgetData.map(budget => {
                    // If budget is 0, show 0% utilization unless spent is also 0
                    if (budget.amount === 0) {
                        return budget.spent > 0 ? 100 : 0;
                    }
                    return Math.min(100, (budget.spent / budget.amount) * 100);
                }),
                backgroundColor: updatedCompleteBudgetData.map(budget => {
                    // If budget is 0, color based on spending
                    if (budget.amount === 0) {
                        return budget.spent > 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(16, 185, 129, 0.7)';
                    }
                    const percentage = (budget.spent / budget.amount) * 100;
                    if (percentage > 90) return 'rgba(239, 68, 68, 0.7)'; // Red
                    if (percentage > 75) return 'rgba(245, 158, 11, 0.7)'; // Yellow
                    return 'rgba(16, 185, 129, 0.7)'; // Green
                }),
                borderColor: updatedCompleteBudgetData.map(budget => {
                    // If budget is 0, color based on spending
                    if (budget.amount === 0) {
                        return budget.spent > 0 ? 'rgba(239, 68, 68, 1)' : 'rgba(16, 185, 129, 1)';
                    }
                    const percentage = (budget.spent / budget.amount) * 100;
                    if (percentage > 90) return 'rgba(239, 68, 68, 1)';
                    if (percentage > 75) return 'rgba(245, 158, 11, 1)';
                    return 'rgba(16, 185, 129, 1)';
                }),
                borderWidth: 1
            }
        ]
    };

    const budgetUtilizationOptions = {
        responsive: true,
        plugins: {
            legend: {
                display: false
            },
            title: {
                display: true,
                text: 'Budget Utilization by Category'
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const budget = updatedCompleteBudgetData[context.dataIndex];
                        let label = `${context.dataset.label}: ${context.raw.toFixed(1)}%`;

                        // Add additional info for zero budgets
                        if (budget.amount === 0) {
                            if (budget.spent > 0) {
                                label += ` (No budget set, ₹${budget.spent.toLocaleString('en-IN')} spent)`;
                            } else {
                                label += ' (No budget set)';
                            }
                        }

                        return label;
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
                const clickedBudget = updatedCompleteBudgetData[dataIndex];
                if (clickedBudget) {
                    // Only allow editing if it's a real budget (not a default one)
                    if (!clickedBudget.id.toString().startsWith('default-')) {
                        handleEditBudget(clickedBudget, true);
                    } else {
                        // For default budgets, open the add budget form with pre-filled data
                        setNewBudget({
                            category: clickedBudget.category,
                            amount: '',
                            month: clickedBudget.month,
                            year: clickedBudget.year
                        });
                        setShowAddBudget(true);
                    }
                }
            }
        }
    };

    // Handle edit month budget
    const handleEditMonthBudget = () => {
        // Check if there are any real budgets for the current viewed month
        const currentMonthBudgets = budgets.filter(budget =>
            budget.month === viewedMonth && budget.year.toString() === viewedYear
        );

        // If no budgets exist for this month, show an alert with option to add budget
        if (currentMonthBudgets.length === 0) {
            // Set up the new budget with current month/year
            setNewBudget({
                category: '',
                amount: '',
                month: viewedMonth,
                year: parseInt(viewedYear)
            });
            setIsAddingMonthBudget(true);
            setShowAddBudget(true);
        } else {
            // If budgets exist, proceed with editing the month budget
            const totalBudget = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.amount, 0);
            setMonthBudgetData({
                totalAmount: totalBudget,
                month: viewedMonth,
                year: parseInt(viewedYear)
            });
            setShowEditMonthBudget(true);
        }
    };

    // Handle save month budget
    const handleSaveMonthBudget = async () => {
        // Filter budgets for the viewed month and year
        const monthBudgets = budgets.filter(budget =>
            budget.month === viewedMonth && budget.year.toString() === viewedYear
        );

        // If no budgets exist for this month, create new ones
        if (monthBudgets.length === 0) {
            // Create budgets for all categories with the specified total amount
            const totalAmount = parseFloat(monthBudgetData.totalAmount);
            const categoryCount = categories.length;
            const amountPerCategory = Math.round(totalAmount / categoryCount);

            // Create new budgets for all categories
            const newBudgets = categories.map((category, index) => {
                // For the last category, use remaining amount to account for rounding
                const amount = index === categoryCount - 1 ?
                    totalAmount - (amountPerCategory * (categoryCount - 1)) :
                    amountPerCategory;

                return {
                    id: Date.now() + index,
                    category: category.id,
                    amount: amount,
                    month: viewedMonth,
                    year: parseInt(viewedYear),
                    spent: 0
                };
            });

            // Add new budgets to existing budgets
            const updatedBudgets = [...budgets, ...newBudgets];

            // Sync with actual expenses
            const expenses = getExpenses() || [];
            const syncedBudgets = syncBudgetsWithExpenses(updatedBudgets, expenses);

            setBudgets(syncedBudgets);
            await saveBudgets(syncedBudgets);
            setShowEditMonthBudget(false);
        } else {
            // Update existing budgets
            // First, get the complete budget data for this month (including categories with 0 budgets)
            const completeBudgetData = categories.map(category => {
                // Find if there's an existing budget for this category and month
                const existingBudget = monthBudgets.find(b => b.category === category.id);

                if (existingBudget) {
                    return existingBudget;
                } else {
                    // Create a default budget entry with 0 amount if none exists
                    return {
                        id: `default-${category.id}-${viewedMonth}`,
                        category: category.id,
                        amount: 0,
                        month: viewedMonth,
                        year: parseInt(viewedYear),
                        spent: 0
                    };
                }
            });

            // Calculate the ratio to adjust each budget proportionally
            const totalBudget = completeBudgetData.reduce((sum, budget) => sum + budget.amount, 0);
            const ratio = monthBudgetData.totalAmount / totalBudget;

            // Update each budget amount proportionally
            const updatedBudgets = budgets.map(budget => {
                if (budget.month === viewedMonth && budget.year === parseInt(viewedYear)) {
                    return { ...budget, amount: Math.round(budget.amount * ratio) };
                }
                return budget;
            });

            setBudgets(updatedBudgets);
            await saveBudgets(updatedBudgets);
            setShowEditMonthBudget(false);
        }
    };

    // Handle update month budget
    const handleUpdateMonthBudget = async (e) => {
        e.preventDefault();
        if (monthBudgetData.totalAmount) {
            // Check if there are any real budgets for the current viewed month
            const currentMonthBudgets = budgets.filter(budget =>
                budget.month === viewedMonth && budget.year.toString() === viewedYear
            );

            // If no budgets exist for this month, create new budgets for all categories
            if (currentMonthBudgets.length === 0) {
                // Calculate equal amount for each category
                const totalAmount = parseFloat(monthBudgetData.totalAmount);
                const categoryCount = categories.length;
                const amountPerCategory = Math.round(totalAmount / categoryCount);

                // Create and save new budgets for all categories to Firestore
                for (let index = 0; index < categories.length; index++) {
                    const category = categories[index];
                    // For the last category, use remaining amount to account for rounding
                    const amount = index === categoryCount - 1 ?
                        totalAmount - (amountPerCategory * (categoryCount - 1)) :
                        amountPerCategory;

                    const budgetData = {
                        category: category.id,
                        amount: amount,
                        month: viewedMonth,
                        year: parseInt(viewedYear),
                        spent: 0
                    };
                    await saveBudget(budgetData);
                }

                // Add new budgets to existing budgets
                const updatedBudgets = [...budgets, ...newBudgets];

                setBudgets(updatedBudgets);
                await saveBudgets(updatedBudgets);
                setShowEditMonthBudget(false);
            } else {
                // Calculate the ratio to adjust each budget proportionally
                const totalBudget = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.amount, 0);
                const ratio = monthBudgetData.totalAmount / totalBudget;

                // Update each budget amount proportionally and save to Firestore
                for (const budget of currentMonthBudgets) {
                    // Skip sample/default budgets
                    if (budget.id.toString().startsWith('sample-') || budget.id.toString().startsWith('default-')) {
                        continue;
                    }
                    const updatedBudget = {
                        ...budget,
                        amount: Math.round(budget.amount * ratio)
                    };
                    await saveBudget(updatedBudget);
                }

                setBudgets(updatedBudgets);
                await saveBudgets(updatedBudgets);
                setShowEditMonthBudget(false);
            }
        }
    };

    // Handle month budget input changes
    const handleMonthBudgetInputChange = (e) => {
        const { name, value } = e.target;
        setMonthBudgetData({
            ...monthBudgetData,
            [name]: value
        });
    };

    // Handle expense input changes
    const handleExpenseInputChange = (e) => {
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

    // Handle adding a new expense
    const handleAddExpense = async (e) => {
        e.preventDefault();
        if (newExpense.description && newExpense.amount && newExpense.category) {
            // Check if we're editing an existing expense (has an id)
            const isEditing = newExpense.id !== undefined;

            if (isEditing) {
                // Update existing expense
                const updatedExpenses = expenses.map(expense => {
                    if (expense.id === newExpense.id) {
                        // Preserve the original ID and update other fields
                        return {
                            ...expense,
                            description: newExpense.description,
                            amount: parseFloat(newExpense.amount),
                            category: newExpense.category,
                            vendor: newExpense.vendor,
                            date: newExpense.date
                        };
                    }
                    return expense;
                });

                // Update expenses state and save
                setExpenses(updatedExpenses);
                await saveExpenses(updatedExpenses);

                // Update budgets with new spending
                const syncedBudgets = syncBudgetsWithExpenses(budgets, updatedExpenses);
                setBudgets(syncedBudgets);
                await saveBudgets(syncedBudgets);
            } else {
                // Adding new expense
                // Check if the category is a new one (not in the existing categories)
                const existingCategory = categories.find(c => c.id === newExpense.category);

                // If it's a new category (entered manually), add it to categories
                if (!existingCategory && newExpense.category.trim()) {
                    const newCategoryId = newExpense.category.toLowerCase().replace(/\s+/g, '-');
                    const colors = ['#EF4444', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#6B7280'];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];

                    const newCategory = {
                        id: newCategoryId,
                        name: newExpense.category,
                        color: randomColor
                    };

                    // Save new category to Firestore
                    await saveCategories([...categories, newCategory]);

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
                await saveExpenses(updatedExpenses);

                // Update budgets with new spending
                const syncedBudgets = syncBudgetsWithExpenses(budgets, updatedExpenses);
                setBudgets(syncedBudgets);
                await saveBudgets(syncedBudgets);
            }

            // Reset form (Firestore subscription will update the UI automatically)
            setNewExpense({
                description: '',
                amount: '',
                category: '',
                vendor: '',
                date: new Date().toISOString().split('T')[0]
            });
            setShowAddExpense(false);
        }
    };

    // Delete expense function
    const handleDeleteExpense = async (expense) => {
        setExpenseToDelete(expense);
        setShowDeleteConfirm(true);
    };

    // Confirm delete expense
    const confirmDeleteExpense = async () => {
        if (expenseToDelete) {
            // Delete expense from Firestore
            await deleteExpense(expenseToDelete.id);

            // Update expenses state and save
            setExpenses(updatedExpenses);
            await saveExpenses(updatedExpenses);

            // Update budgets with new spending
            const syncedBudgets = syncBudgetsWithExpenses(budgets, updatedExpenses);
            setBudgets(syncedBudgets);
            await saveBudgets(syncedBudgets);

            // Close the confirmation modal
            setShowDeleteConfirm(false);
            setExpenseToDelete(null);
        }
    };

    // Cancel delete expense
    const cancelDeleteExpense = () => {
        setShowDeleteConfirm(false);
        setExpenseToDelete(null);
    };

    // Handle edit expense
    const handleEditExpense = (expense) => {
        // Set the expense data in the editExpense state
        setEditExpense({
            id: expense.id,
            description: expense.description,
            amount: expense.amount,
            category: expense.category,
            vendor: expense.vendor || '',
            date: expense.date.split('T')[0] // Format date properly
        });

        // Show the edit expense modal
        setShowEditExpense(true);
    };

    // Export to CSV
    const exportToCSV = () => {
        if (viewedBudgetsWithExpenses.length === 0) {
            alert('No data to export');
            return;
        }

        // Create CSV content
        const headers = ['Category', 'Budget Amount (₹)', 'Spent (₹)', 'Remaining (₹)', 'Utilization (%)'];
        const rows = viewedBudgetsWithExpenses.map(budget => {
            const category = categories.find(c => c.id === budget.category);
            const utilization = (budget.spent / budget.amount) * 100;
            const remaining = budget.amount - budget.spent;
            return [
                category ? category.name : budget.category,
                budget.amount,
                budget.spent,
                remaining,
                utilization.toFixed(2)
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
        const filename = `Budgets_${new Date().toISOString().split('T')[0]}.csv`;

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
    const exportToPDF = () => {
        if (viewedBudgetsWithExpenses.length === 0) {
            alert('No data to export');
            return;
        }

        // Get period display text
        const periodText = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

        // Create HTML content for PDF printing
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Budget Report</title>
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
                    grid-template-columns: 1fr 1fr 1fr 1fr;
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
                }
                .chart-container {
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
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Budget Report</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${periodText}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Budget</div>
                    <div class="metric-value">₹${viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.amount, 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Spent</div>
                    <div class="metric-value">₹${viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.spent, 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Remaining</div>
                    <div class="metric-value">₹${(viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.amount, 0) - viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.spent, 0)).toLocaleString('en-IN')}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Budgets Set</div>
                    <div class="metric-value">${viewedBudgetsWithExpenses.length}</div>
                </div>
            </div>

            <h2>Budget Details</h2>
            <table>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Budget Amount</th>
                        <th>Spent</th>
                        <th>Remaining</th>
                        <th>Utilization</th>
                    </tr>
                </thead>
                <tbody>
                    ${viewedBudgetsWithExpenses.map(budget => {
            const category = categories.find(c => c.id === budget.category);
            const categoryName = category ? category.name : budget.category;
            const remaining = budget.amount - budget.spent;
            const utilization = (budget.spent / budget.amount) * 100;
            return `
                        <tr>
                            <td>${categoryName}</td>
                            <td>₹${budget.amount.toLocaleString('en-IN')}</td>
                            <td>₹${budget.spent.toLocaleString('en-IN')}</td>
                            <td>₹${remaining.toLocaleString('en-IN')}</td>
                            <td>${utilization.toFixed(1)}%</td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td><strong>TOTAL</strong></td>
                        <td><strong>₹${viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.amount, 0).toLocaleString('en-IN')}</strong></td>
                        <td><strong>₹${viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.spent, 0).toLocaleString('en-IN')}</strong></td>
                        <td><strong>₹${(viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.amount, 0) - viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.spent, 0)).toLocaleString('en-IN')}</strong></td>
                        <td><strong>${(viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.spent, 0) / viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.amount, 0) * 100).toFixed(1)}%</strong></td>
                    </tr>
                </tfoot>
            </table>

        </body>
        </html>
        `;

        // Use the same browser print approach as the Expenses section
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
            alert('Error generating budget report. Please try again.');
        }
    };

    // Handle View Budget dropdown toggle
    const toggleViewBudgetDropdown = () => {
        setShowViewBudgetDropdown(!showViewBudgetDropdown);
    };

    // Handle View Budget form submission
    const handleViewBudgetSubmit = (e) => {
        e.preventDefault();
        // Format the selected month and year to match the budget format (YYYY-MM)
        const formattedMonth = `${selectedViewYear}-${selectedViewMonth}`;

        // Set the viewed month and year to update the display
        setViewedMonth(formattedMonth);
        setViewedYear(selectedViewYear);

        // Hide the dropdown
        setShowViewBudgetDropdown(false);
    };

    // Handle click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showViewBudgetDropdown && !event.target.closest('.view-budget-dropdown')) {
                setShowViewBudgetDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showViewBudgetDropdown]);

    // Export expense to PDF (Payment Slip)
    const exportExpenseToPDF = (expense) => {
        if (!expense) {
            alert('No expense data to export');
            return;
        }

        const category = categories.find(c => c.id === expense.category);
        const categoryName = category ? category.name : expense.category;
        const categoryColor = category && category.color ? category.color : '#6b7280';

        // Format date
        const formattedDate = (() => {
            // Handle both string and Date object formats for expense.date
            let expenseDate;
            if (expense.date instanceof Date) {
                expenseDate = expense.date;
            } else {
                expenseDate = new Date(expense.date);
            }

            // Check if the date is valid
            if (isNaN(expenseDate.getTime())) {
                return 'Invalid Date'; // Return fallback for invalid dates
            }

            return expenseDate.toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        })();
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

    // Export all expenses for the viewed month to PDF
    const exportExpensesToPDF = () => {
        if (viewedExpenses.length === 0) {
            alert('No expenses to export');
            return;
        }

        // Get period display text
        const periodText = new Date(viewedYear, parseInt(viewedMonth.split('-')[1]) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

        // Calculate total amount
        const totalAmount = viewedExpenses.reduce((sum, expense) => sum + expense.amount, 0);

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
                <h1>Expense Report</h1>
                <p>Generated on ${new Date().toLocaleDateString('en-IN')} | ${periodText}</p>
            </div>

            <h2>Summary Metrics</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="metric-label">Total Expenses (${periodText})</div>
                    <div class="metric-value">${viewedExpenses.length}</div>
                </div>
                <div class="summary-card">
                    <div class="metric-label">Total Amount (${periodText})</div>
                    <div class="metric-value">₹${totalAmount.toLocaleString('en-IN')}</div>
                </div>
            </div>

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
                    ${viewedExpenses.map(expense => {
            const category = categories.find(c => c.id === expense.category);
            const categoryName = category ? category.name : expense.category;

            // Handle date formatting with validation
            let formattedDate = 'Invalid Date';
            try {
                let expenseDate;
                if (expense.date instanceof Date) {
                    expenseDate = expense.date;
                } else {
                    expenseDate = new Date(expense.date);
                }

                // Check if the date is valid
                if (!isNaN(expenseDate.getTime())) {
                    formattedDate = expenseDate.toLocaleDateString('en-GB');
                }
            } catch (e) {
                // If any error occurs, use fallback
                formattedDate = 'Invalid Date';
            }

            return `
                        <tr>
                            <td>${formattedDate}</td>
                            <td>${expense.description || 'N/A'}</td>
                            <td>${categoryName}</td>
                            <td>${expense.vendor || 'N/A'}</td>
                            <td>₹${expense.amount.toLocaleString('en-IN')}</td>
                        </tr>
                        `;
        }).join('')}                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right;"><strong>Total Amount:</strong></td>
                        <td><strong>₹${totalAmount.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </tfoot>
            </table>

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
            alert('Error generating expense report. Please try again.');
        }
    };

    return (
        <div className="space-y-6 px-4 md:px-6 py-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Budget Management</h1>
                </div>

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
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        <i className="ph ph-plus text-lg"></i>
                        Add Expense
                    </button>
                    <div className="relative view-budget-dropdown">
                        <button
                            onClick={toggleViewBudgetDropdown}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium"
                        >
                            <i className="ph ph-eye text-lg"></i>
                            View Budget
                            <i className={`ph ph-caret-${showViewBudgetDropdown ? 'up' : 'down'} text-sm`}></i>
                        </button>

                        {showViewBudgetDropdown && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                                <form onSubmit={handleViewBudgetSubmit} className="p-4">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                                            <select
                                                value={selectedViewMonth}
                                                onChange={(e) => setSelectedViewMonth(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                                                    <option key={month} value={month.toString().padStart(2, '0')}>
                                                        {new Date(2020, month - 1).toLocaleString('en-US', { month: 'long' })}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                                            <select
                                                value={selectedViewYear}
                                                onChange={(e) => setSelectedViewYear(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 short-year-dropdown"
                                                style={{
                                                    height: 'auto',
                                                    maxHeight: '100px',
                                                    overflow: 'auto',
                                                    fontSize: '14px',
                                                    lineHeight: '1.2'
                                                }}
                                            >
                                                {Array.from({ length: 51 }, (_, i) => 2020 + i).map(year => (
                                                    <option key={year} value={year} style={{ padding: '2px 8px' }}>
                                                        {year}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowViewBudgetDropdown(false)}
                                                className="flex-1 px-3 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm"
                                            >
                                                View
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Toggle Switch for Budget Management and Analytics */}
            <div className="flex gap-2">
                <button
                    className="px-4 py-2 rounded-md font-medium transition-colors bg-red-500 text-white cursor-default"
                >
                    Budget Management
                </button>
                <button
                    onClick={() => navigate('/expenses')}
                    className="px-4 py-2 rounded-md font-medium transition-colors bg-gray-200 text-gray-700 hover:bg-red-500 hover:text-white"
                >
                    Analytics & Reports
                </button>
            </div>

            {/* Budget Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Total Budget</p>
                            <p className="text-2xl font-bold text-gray-900">
                                ₹{viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.amount, 0).toLocaleString('en-IN')}
                            </p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-full">
                            <i className="ph ph-wallet text-red-500 text-xl"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Total Spent</p>
                            <p className="text-2xl font-bold text-gray-900">
                                ₹{viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.spent, 0).toLocaleString('en-IN')}
                            </p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-full">
                            <i className="ph ph-currency-circle-dollar text-blue-500 text-xl"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Remaining</p>
                            <p className="text-2xl font-bold text-gray-900">
                                ₹{(viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.amount, 0) - viewedBudgetsWithExpenses.reduce((sum, budget) => sum + budget.spent, 0)).toLocaleString('en-IN')}
                            </p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-full">
                            <i className="ph ph-check-circle text-green-500 text-xl"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">Budgets Set</p>
                            <p className="text-2xl font-bold text-gray-900">{viewedBudgetsWithExpenses.length}</p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-full">
                            <i className="ph ph-tag text-purple-500 text-xl"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Budget vs Spent Chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <Bar data={budgetSpentData} options={budgetSpentOptions} />
                </div>

                {/* Budget Utilization Chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <Bar data={budgetUtilizationData} options={budgetUtilizationOptions} />
                </div>

                {/* Budget Distribution Chart */}
                {/* Monthly Trend Chart */}
            </div>

            {/* Budget List */}
            <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Current Month Budgets</h3>
                </div>
                <div className="p-6">
                    {/* Current Month Budget Progress */}
                    <div className="mb-8">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <h4 className="text-md font-semibold text-gray-800 mb-4">
                                {new Date(viewedYear, parseInt(viewedMonth.split('-')[1]) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} Budget Progress
                            </h4>
                            <div className="border border-gray-200 rounded-lg p-6">
                                {/* Overall Monthly Progress */}
                                <div className="mb-6">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-medium text-gray-800">Monthly Budget Utilization</h3>
                                        <button
                                            onClick={handleEditMonthBudget}
                                            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
                                        >
                                            Set Month Budget
                                        </button>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mb-2">
                                        {(() => {
                                            const totalBudget = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.amount, 0);
                                            const totalSpent = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.spent, 0);
                                            const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : (totalSpent > 0 ? 100 : 0);
                                            let progressColor = 'bg-green-500';
                                            if (overallPercentage > 90) progressColor = 'bg-red-500';
                                            else if (overallPercentage > 75) progressColor = 'bg-yellow-500';

                                            return (
                                                <>
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-gray-600">₹{totalSpent.toLocaleString('en-IN')} spent</span>
                                                        <span className="text-gray-600">₹{totalBudget.toLocaleString('en-IN')} budgeted</span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 rounded-full h-6">
                                                        <div
                                                            className={`h-6 rounded-full ${progressColor} transition-all duration-500 flex items-center justify-end pr-2`}
                                                            style={{ width: `${Math.min(overallPercentage, 100)}%` }}
                                                        >
                                                            <span className="text-xs font-medium text-white">
                                                                {overallPercentage.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    <div className="flex justify-between text-sm mt-2">

                                        <span className={`font-medium ${(() => {
                                            const totalBudget = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.amount, 0);
                                            const totalSpent = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.spent, 0);
                                            const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : (totalSpent > 0 ? 100 : 0);
                                            if (overallPercentage > 90) return 'text-red-500';
                                            if (overallPercentage > 75) return 'text-yellow-500';
                                            return 'text-green-500';
                                        })()}`}>
                                            {(() => {
                                                const totalBudget = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.amount, 0);
                                                const totalSpent = updatedCompleteBudgetData.reduce((sum, budget) => sum + budget.spent, 0);
                                                const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : (totalSpent > 0 ? 100 : 0);
                                                return overallPercentage > 100 ? 'Over budget' : 'On track';
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {updatedCompleteBudgetData.map(budget => {
                            const category = categories.find(c => c.id === budget.category);
                            const progress = calculateBudgetProgress(budget);
                            return (
                                <div key={budget.id} className="border border-gray-200 rounded-lg p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-medium text-gray-800">{category?.name || budget.category}</h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                ₹{budget.spent.toLocaleString('en-IN')} spent {budget.amount > 0 ? `of ₹${budget.amount.toLocaleString('en-IN')}` : '(no budget set)'}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    if (!budget.id.toString().startsWith('default-')) {
                                                        handleEditBudget(budget);
                                                    } else {
                                                        setNewBudget({
                                                            category: budget.category,
                                                            amount: '',
                                                            month: budget.month,
                                                            year: budget.year
                                                        });
                                                        setShowAddBudget(true);
                                                    }
                                                }}
                                                className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                                            >
                                                <i className="ph ph-pencil text-lg"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                                        <div
                                            className={`h-3 rounded-full ${progress.color}`}
                                            style={{
                                                width: `${budget.amount > 0 ? Math.min(progress.percentage, 100) : 0}%`,
                                                backgroundColor: budget.amount === 0 && budget.spent > 0 ? '#EF4444' : ''
                                            }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">
                                            {budget.amount > 0 ? `${progress.percentage.toFixed(1)}% used` : (budget.spent > 0 ? '' : 'No activity')}
                                        </span>
                                        <span className={`font-medium ${progress.percentage > 90 ? 'text-red-500' : progress.percentage > 75 ? 'text-yellow-500' : 'text-green-500'}`}>
                                            {budget.amount > 0 ? (progress.percentage > 100 ? 'Over budget' : 'On track') : (budget.spent > 0 ? 'Over budget' : 'On track')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Expense Details */}
            <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-6 border-b">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Expense Details</h3>
                            <p className="text-red-600 text-sm mt-1">All expenses for {new Date(viewedYear, parseInt(viewedMonth.split('-')[1]) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
                        </div>
                        <button
                            onClick={exportExpensesToPDF}
                            className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
                            title="Export to PDF"
                        >
                            <i className="ph ph-file-pdf text-lg"></i>
                            <span className="hidden sm:inline">PDF</span>
                        </button>
                    </div>
                </div>
                <div className="p-6">
                </div>
                <div className="p-6">
                    {viewedExpenses.length > 0 ? (
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
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delete Expense</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {viewedExpenses.map((expense) => {
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
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <button
                                                        onClick={() => handleDeleteExpense(expense)}
                                                        className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition-colors"
                                                        title="Delete Expense"
                                                    >
                                                        <i className="ph ph-trash text-xl"></i>
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
                            <p>No expenses found for this month</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Month Budget Modal */}
            {
                showEditMonthBudget && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold">Set Month Budget</h3>
                                    <button
                                        onClick={() => setShowEditMonthBudget(false)}
                                        className="text-gray-400 hover:text-gray-500"
                                    >
                                        <i className="ph ph-x text-xl"></i>
                                    </button>
                                </div>
                                <form onSubmit={handleUpdateMonthBudget}>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Total Budget Amount (₹)</label>
                                            <input
                                                type="number"
                                                name="totalAmount"
                                                value={monthBudgetData.totalAmount}
                                                onChange={handleMonthBudgetInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                required
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                        <div className="bg-blue-50 p-3 rounded-lg">
                                            <p className="text-sm text-blue-800">
                                                Note: Changing the total budget will adjust all category budgets proportionally. If no budgets exist for this month, new budgets will be created for all categories when you save.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowEditMonthBudget(false)}
                                            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
                                        >
                                            Save Budget
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add Budget Modal */}
            {
                showAddBudget && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold">{isAddingMonthBudget ? 'Set Month Budget' : 'Add New Budget'}</h3>
                                    <button
                                        onClick={() => {
                                            setShowAddBudget(false);
                                            setIsAddingMonthBudget(false);
                                        }}
                                        className="text-gray-400 hover:text-gray-500"
                                    >
                                        <i className="ph ph-x text-xl"></i>
                                    </button>
                                </div>
                                <form onSubmit={handleAddBudget}>
                                    <div className="space-y-4">
                                        {!isAddingMonthBudget && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                                <select
                                                    name="category"
                                                    value={newBudget.category}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    required
                                                    disabled
                                                >
                                                    <option value="">Select Category</option>
                                                    {categories.map(category => (
                                                        <option key={category.id} value={category.id}>{category.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                                            <input
                                                type="number"
                                                name="amount"
                                                value={newBudget.amount}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                required
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowAddBudget(false);
                                                setIsAddingMonthBudget(false);
                                            }}
                                            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
                                        >
                                            {isAddingMonthBudget ? 'Save Budget' : 'Add Budget'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Edit Budget Modal */}
            {
                showEditBudget && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold">Edit Budget</h3>
                                    <button
                                        onClick={() => {
                                            setShowEditBudget(false);
                                            setIsEditingFixedCategory(false);
                                        }}
                                        className="text-gray-400 hover:text-gray-500"
                                    >
                                        <i className="ph ph-x text-xl"></i>
                                    </button>
                                </div>
                                <form onSubmit={handleUpdateBudget}>
                                    <div className="space-y-4">
                                        {!isEditingFixedCategory && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                                <select
                                                    name="category"
                                                    value={newBudget.category}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    required
                                                    disabled
                                                >
                                                    <option value="">Select Category</option>
                                                    {categories.map(category => (
                                                        <option key={category.id} value={category.id}>{category.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        {isEditingFixedCategory && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100">
                                                    {(() => {
                                                        // First try to find the category by ID
                                                        const category = categories.find(c => c.id === newBudget.category);
                                                        if (category) {
                                                            return category.name;
                                                        }
                                                        // If not found by ID, try to find by name (in case it's stored as name)
                                                        const categoryByName = categories.find(c => c.name === newBudget.category);
                                                        if (categoryByName) {
                                                            return categoryByName.name;
                                                        }
                                                        // Fallback to the raw value
                                                        return newBudget.category || 'Unknown Category';
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                                            <input
                                                type="number"
                                                name="amount"
                                                value={newBudget.amount}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                required
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowEditBudget(false);
                                                setIsEditingFixedCategory(false);
                                            }}
                                            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
                                        >
                                            Update Budget
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add Expense Modal */}
            {
                showAddExpense && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
                            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 bg-blue-500 rounded-xl">
                                            <i className="ph ph-wallet text-white text-xl"></i>
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-bold text-gray-800">Add New Expense</h3>
                                            <p className="text-blue-600 text-sm">Record a new business expense</p>
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
                                                    onChange={handleExpenseInputChange}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm shadow-sm"
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
                                                        onChange={handleExpenseInputChange}
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm shadow-sm"
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
                                                    onChange={handleExpenseInputChange}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm shadow-sm"
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
                                                        onChange={handleExpenseInputChange}
                                                        className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm shadow-sm"
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
                                                        onChange={handleExpenseInputChange}
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm shadow-sm"
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
                                                        onChange={handleExpenseInputChange}
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm shadow-sm"
                                                        required
                                                    />
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                                        <i className="ph ph-calendar text-gray-400 text-sm"></i>
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
                                            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold text-sm transition-all flex items-center gap-2"
                                        >
                                            <i className="ph ph-plus-circle text-base"></i>
                                            Add Expense
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Expense Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold">Delete Expense</h3>
                                    <button
                                        onClick={cancelDeleteExpense}
                                        className="text-gray-400 hover:text-gray-500"
                                    >
                                        <i className="ph ph-x text-xl"></i>
                                    </button>
                                </div>
                                <div className="mb-6">
                                    <p className="text-gray-700 mb-4">
                                        Are you sure you want to delete this expense? This action cannot be undone.
                                    </p>

                                    {/* Expense Details Preview */}
                                    {expenseToDelete && (
                                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                                            <h4 className="font-medium text-gray-900 mb-2">Expense Details:</h4>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Description:</span>
                                                    <span className="font-medium">{expenseToDelete.description}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Category:</span>
                                                    <span className="font-medium">
                                                        {(() => {
                                                            const category = categories.find(c => c.id === expenseToDelete.category);
                                                            return category ? category.name : expenseToDelete.category;
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Amount:</span>
                                                    <span className="font-medium text-red-600">₹{expenseToDelete.amount.toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Date:</span>
                                                    <span className="font-medium">{new Date(expenseToDelete.date).toLocaleDateString('en-GB')}</span>
                                                </div>
                                                {expenseToDelete.vendor && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500">Vendor:</span>
                                                        <span className="font-medium">{expenseToDelete.vendor}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-gray-600 text-sm">
                                        <i className="ph ph-warning text-yellow-500 mr-2"></i>
                                        Deleting this expense will adjust your budget calculations and remove it from all reports.
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={cancelDeleteExpense}
                                        className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={confirmDeleteExpense}
                                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2"
                                    >
                                        <i className="ph ph-trash"></i>
                                        Delete Expense
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
