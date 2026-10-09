import {
    getFirebaseExpenses,
    saveFirebaseExpenses,
    getFirebaseBudgets,
    saveFirebaseBudgets,
    getFirebaseCategories,
    saveFirebaseCategories
} from './firebaseExpenses.js';

console.log('budgetTracker.js: Firebase functions imported successfully');

// Shared budget and expense tracking utilities
// This allows Budget Management and Expenses pages to sync data
// NOW USING FIRESTORE DATABASE (not localStorage)

// Get expenses from Firebase
export const getExpenses = () => {
    try {
        // For backward compatibility, we still support localStorage as fallback
        const localStorageData = localStorage.getItem('liquid_pos_expenses');
        if (localStorageData) {
            return JSON.parse(localStorageData);
        }
        return null;
    } catch (error) {
        console.error('Error reading expenses from localStorage:', error);
        return null;
    }
};

// Save expenses to Firebase
export const saveExpenses = async (expenses) => {
    try {
        console.log('budgetTracker.js: saveExpenses called with:', expenses);
        await saveFirebaseExpenses(expenses);
        console.log('budgetTracker.js: saveExpenses completed successfully');
    } catch (error) {
        console.error('Error saving expenses to Firebase:', error);
        console.error('Expenses data being saved:', expenses);
        // Fallback to localStorage
        try {
            localStorage.setItem('liquid_pos_expenses', JSON.stringify(expenses));
            window.dispatchEvent(new CustomEvent('expensesUpdated', { detail: expenses }));
        } catch (localStorageError) {
            console.error('Error saving expenses to localStorage:', localStorageError);
        }
    }
};

// Get budgets from Firebase
export const getBudgets = () => {
    try {
        // For backward compatibility, we still support localStorage as fallback
        const localStorageData = localStorage.getItem('liquid_pos_budgets');
        if (localStorageData) {
            return JSON.parse(localStorageData);
        }
        return null;
    } catch (error) {
        console.error('Error reading budgets from localStorage:', error);
        return null;
    }
};

// Save budgets to Firebase
export const saveBudgets = async (budgets) => {
    try {
        console.log('budgetTracker.js: saveBudgets called with:', budgets);
        await saveFirebaseBudgets(budgets);
        console.log('budgetTracker.js: saveBudgets completed successfully');
    } catch (error) {
        console.error('Error saving budgets to Firebase:', error);
        console.error('Budgets data being saved:', budgets);
        // Fallback to localStorage
        try {
            localStorage.setItem('liquid_pos_budgets', JSON.stringify(budgets));
            window.dispatchEvent(new CustomEvent('budgetsUpdated', { detail: budgets }));
        } catch (localStorageError) {
            console.error('Error saving budgets to localStorage:', localStorageError);
        }
    }
};

// Get categories from Firebase
export const getCategories = () => {
    try {
        console.log('getCategories: Attempting to fetch categories from Firebase');

        // For backward compatibility, we still support localStorage as fallback
        const localStorageData = localStorage.getItem('liquid_pos_categories');
        if (localStorageData) {
            console.log('getCategories: Found data in localStorage');
            return JSON.parse(localStorageData);
        }

        console.log('getCategories: No data in localStorage, returning null');
        return null;
    } catch (error) {
        console.error('=== ERROR READING CATEGORIES ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        return null;
    }
};

// Save categories to Firebase
export const saveCategories = async (categories) => {
    try {
        console.log('budgetTracker.js: saveCategories called with:', categories);
        await saveFirebaseCategories(categories);
        console.log('budgetTracker.js: saveCategories completed successfully');
    } catch (error) {
        console.error('Error saving categories to Firebase:', error);
        console.error('Categories data being saved:', categories);
        // Fallback to localStorage
        try {
            localStorage.setItem('liquid_pos_categories', JSON.stringify(categories));
        } catch (localStorageError) {
            console.error('Error saving categories to localStorage:', localStorageError);
        }
    }
};

// Save multiple categories (batch operation)


// ============================================
// UTILITY FUNCTIONS (unchanged logic)
// ============================================

// Calculate actual spending for a budget period
export const calculateActualSpending = (expenses, category, month) => {
    if (!expenses || !Array.isArray(expenses)) return 0;

    return expenses
        .filter(expense => {
            // Handle both string and Date object formats for expense.date
            let expenseDateStr;
            if (typeof expense.date === 'string') {
                expenseDateStr = expense.date;
            } else if (expense.date instanceof Date) {
                // Check if the date is valid before converting to ISO string
                if (isNaN(expense.date.getTime())) {
                    return false; // Skip invalid dates
                }
                expenseDateStr = expense.date.toISOString();
            } else {
                // If it's neither string nor Date, try to convert to Date first
                const dateObj = new Date(expense.date);
                // Check if the date is valid
                if (isNaN(dateObj.getTime())) {
                    return false; // Skip invalid dates
                }
                expenseDateStr = dateObj.toISOString();
            }
            const expenseMonth = expenseDateStr.substring(0, 7); // YYYY-MM
            return expense.category === category && expenseMonth === month;
        })
        .reduce((sum, expense) => sum + (expense.amount || 0), 0);
};

// Calculate spending for all categories in a month
export const calculateMonthlySpending = (expenses, month) => {
    if (!expenses || !Array.isArray(expenses)) return {};

    const spending = {};
    expenses
        .filter(expense => {
            // Handle both string and Date object formats for expense.date
            let expenseDateStr;
            if (typeof expense.date === 'string') {
                expenseDateStr = expense.date;
            } else if (expense.date instanceof Date) {
                // Check if the date is valid before converting to ISO string
                if (isNaN(expense.date.getTime())) {
                    return false; // Skip invalid dates
                }
                expenseDateStr = expense.date.toISOString();
            } else {
                // If it's neither string nor Date, try to convert to Date first
                const dateObj = new Date(expense.date);
                // Check if the date is valid
                if (isNaN(dateObj.getTime())) {
                    return false; // Skip invalid dates
                }
                expenseDateStr = dateObj.toISOString();
            }
            const expenseMonth = expenseDateStr.substring(0, 7); // YYYY-MM
            return expenseMonth === month;
        })
        .forEach(expense => {
            if (!spending[expense.category]) {
                spending[expense.category] = 0;
            }
            spending[expense.category] += expense.amount || 0;
        });

    return spending;
};

// Sync budgets with actual expenses
export const syncBudgetsWithExpenses = (budgets, expenses) => {
    if (!budgets || !Array.isArray(budgets)) return budgets;
    if (!expenses || !Array.isArray(expenses)) return budgets;

    return budgets.map(budget => {
        const actualSpent = calculateActualSpending(expenses, budget.category, budget.month);
        return {
            ...budget,
            spent: actualSpent
        };
    });
};

// ============================================
// BACKWARD COMPATIBILITY - Event Listeners
// ============================================

// Listen for expense updates (backward compatibility with window events)
export const listenForExpenseUpdates = (callback) => {
    const handler = (event) => callback(event.detail);
    window.addEventListener('expensesUpdated', handler);
    return () => window.removeEventListener('expensesUpdated', handler);
};

// Listen for budget updates (backward compatibility with window events)
export const listenForBudgetUpdates = (callback) => {
    const handler = (event) => callback(event.detail);
    window.addEventListener('budgetsUpdated', handler);
    return () => window.removeEventListener('budgetsUpdated', handler);
};