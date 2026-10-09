import { sdk } from '../sdk.js';

// Collection names - using more descriptive names
const COLLECTIONS = {
    EXPENSES: 'business_expenses',
    BUDGETS: 'budget_plans',
    CATEGORIES: 'expense_categories'
};

// Helper function to check if Firebase is properly initialized
const isFirebaseInitialized = () => {
    try {
        console.log('isFirebaseInitialized: Checking Firebase initialization...');

        // Check if window is available (browser environment)
        if (typeof window === 'undefined') {
            console.log('isFirebaseInitialized: Window object not available (Node.js environment)');
            return false;
        }

        // Check if sdk exists
        if (typeof sdk === 'undefined') {
            console.log('isFirebaseInitialized: SDK is undefined');
            return false;
        }

        console.log('isFirebaseInitialized: SDK exists');

        // Check if sdk.db exists
        if (!sdk) {
            console.log('isFirebaseInitialized: SDK instance is null/undefined');
            return false;
        }

        if (!sdk.db) {
            console.log('isFirebaseInitialized: SDK.db is null/undefined');
            console.log('isFirebaseInitialized: SDK properties:', Object.keys ? Object.keys(sdk) : 'Cannot get keys');
            return false;
        }

        console.log('isFirebaseInitialized: SDK.db exists');

        // Check if required methods exist
        if (typeof sdk.db.collection !== 'function') {
            console.log('isFirebaseInitialized: collection method is not a function');
            console.log('isFirebaseInitialized: db.collection type:', typeof sdk.db.collection);
            return false;
        }

        // NOTE: We're allowing batch to be missing since we have a fallback
        // The batch method check is now done inside individual functions
        console.log('isFirebaseInitialized: Collection method available, Firebase is initialized');
        return true;
    } catch (error) {
        console.error('isFirebaseInitialized: Error during initialization check:', error);
        return false;
    }
};

// Helper function to get a properly initialized Firestore instance
const getFirestore = () => {
    console.log('getFirestore: Getting Firestore instance...');

    if (!isFirebaseInitialized()) {
        const error = new Error('Firebase is not properly initialized. Please check your Firebase configuration.');
        console.error('getFirestore: Firebase initialization check failed');

        // Provide detailed information about what's missing
        const debugInfo = {
            windowAvailable: typeof window !== 'undefined',
            sdkDefined: typeof sdk !== 'undefined',
            sdkInstance: !!sdk,
            dbAvailable: !!(sdk && sdk.db),
            collectionMethod: !!(sdk && sdk.db && typeof sdk.db.collection === 'function'),
            batchMethod: !!(sdk && sdk.db && typeof sdk.db.batch === 'function')
        };

        console.error('getFirestore: Debug information:', debugInfo);
        throw error;
    }

    console.log('getFirestore: Returning Firestore instance');
    return sdk.db;
};

/**
 * Get expenses from Firebase
 */
export const getFirebaseExpenses = async () => {
    try {
        console.log('getFirebaseExpenses: Starting...');
        const db = getFirestore();
        console.log('getFirebaseExpenses: Got Firestore instance');

        console.log('getFirebaseExpenses: About to fetch from collection:', COLLECTIONS.EXPENSES);
        const snapshot = await db.collection(COLLECTIONS.EXPENSES).get();
        console.log('getFirebaseExpenses: Successfully fetched snapshot with', snapshot.docs.length, 'documents');

        const expenses = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('getFirebaseExpenses: Processing document ID', doc.id, 'with data:', data);
            return {
                id: doc.id,
                ...data
            };
        });

        console.log('getFirebaseExpenses: Returning expenses:', expenses);
        return expenses;
    } catch (error) {
        console.error('=== DETAILED ERROR FETCHING EXPENSES FROM FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);

        // Additional debugging information
        console.error('Firebase SDK status:', {
            sdkAvailable: !!sdk,
            dbAvailable: !!(sdk && sdk.db),
            collectionMethod: !!(sdk && sdk.db && typeof sdk.db.collection === 'function'),
            batchMethod: !!(sdk && sdk.db && typeof sdk.db.batch === 'function')
        });

        // If it's a Firebase error, log additional details
        if (error.code) {
            console.error('Firebase error details:', {
                code: error.code,
                name: error.name,
                permission: error.permission,
                path: error.path
            });
        }

        return null;
    }
};

/**
 * Save expenses to Firebase
 */
export const saveFirebaseExpenses = async (expenses) => {
    try {
        console.log('saveFirebaseExpenses: Starting with expenses:', expenses);
        const db = getFirestore();
        console.log('saveFirebaseExpenses: Got Firestore instance');

        // Validate expenses data
        if (!Array.isArray(expenses)) {
            throw new Error('Expenses must be an array');
        }

        // Check if batch is available, if not, use individual operations
        if (typeof db.batch === 'function') {
            console.log('saveFirebaseExpenses: Using batch operations');
            console.log('saveFirebaseExpenses: Creating batch operation');
            const batch = db.batch();

            console.log('saveFirebaseExpenses: Deleting existing expenses');
            const existingSnapshot = await db.collection(COLLECTIONS.EXPENSES).get();
            existingSnapshot.docs.forEach(doc => {
                console.log('saveFirebaseExpenses: Deleting document:', doc.id);
                batch.delete(db.collection(COLLECTIONS.EXPENSES).doc(doc.id));
            });

            console.log('saveFirebaseExpenses: Adding new expenses');
            expenses.forEach((expense, index) => {
                // Validate expense object
                if (!expense || typeof expense !== 'object') {
                    console.warn('saveFirebaseExpenses: Invalid expense object skipped:', expense);
                    return;
                }

                console.log('saveFirebaseExpenses: Processing expense', index, ':', expense);

                if (expense.id) {
                    // Update existing expense
                    console.log('saveFirebaseExpenses: Updating existing expense with ID:', expense.id);
                    batch.set(db.collection(COLLECTIONS.EXPENSES).doc(expense.id.toString()), expense);
                } else {
                    // Add new expense
                    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    console.log('saveFirebaseExpenses: Creating new expense with ID:', newId);
                    batch.set(db.collection(COLLECTIONS.EXPENSES).doc(newId), { ...expense, id: newId });
                }
            });

            console.log('saveFirebaseExpenses: Committing batch');
            await batch.commit();
            console.log('saveFirebaseExpenses: Batch committed successfully');
        } else {
            console.log('saveFirebaseExpenses: Batch not available, using individual operations');

            // Delete existing expenses one by one
            console.log('saveFirebaseExpenses: Deleting existing expenses');
            const existingSnapshot = await db.collection(COLLECTIONS.EXPENSES).get();
            for (const doc of existingSnapshot.docs) {
                console.log('saveFirebaseExpenses: Deleting document:', doc.id);
                await db.collection(COLLECTIONS.EXPENSES).doc(doc.id).delete();
            }

            // Add new expenses one by one
            console.log('saveFirebaseExpenses: Adding new expenses');
            for (const expense of expenses) {
                // Validate expense object
                if (!expense || typeof expense !== 'object') {
                    console.warn('saveFirebaseExpenses: Invalid expense object skipped:', expense);
                    continue;
                }

                if (expense.id) {
                    // Update existing expense
                    console.log('saveFirebaseExpenses: Updating existing expense with ID:', expense.id);
                    await db.collection(COLLECTIONS.EXPENSES).doc(expense.id.toString()).set(expense);
                } else {
                    // Add new expense
                    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    console.log('saveFirebaseExpenses: Creating new expense with ID:', newId);
                    await db.collection(COLLECTIONS.EXPENSES).doc(newId).set({ ...expense, id: newId });
                }
            }

            console.log('saveFirebaseExpenses: Individual operations completed successfully');
        }

        // Trigger custom event to notify other components
        console.log('saveFirebaseExpenses: Dispatching expensesUpdated event');
        window.dispatchEvent(new CustomEvent('expensesUpdated', { detail: expenses }));
        console.log('saveFirebaseExpenses: Event dispatched');
    } catch (error) {
        console.error('=== DETAILED ERROR SAVING EXPENSES TO FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Expenses data being saved:', expenses);

        // Additional debugging information
        console.error('Firebase SDK status:', {
            sdkAvailable: !!sdk,
            dbAvailable: !!(sdk && sdk.db),
            collectionMethod: !!(sdk && sdk.db && typeof sdk.db.collection === 'function'),
            batchMethod: !!(sdk && sdk.db && typeof sdk.db.batch === 'function')
        });

        // If it's a Firebase error, log additional details
        if (error.code) {
            console.error('Firebase error details:', {
                code: error.code,
                name: error.name,
                permission: error.permission,
                path: error.path
            });
        }

        throw error; // Re-throw the error so it can be handled by the caller
    }
};

/**
 * Get budgets from Firebase
 */
export const getFirebaseBudgets = async () => {
    try {
        console.log('getFirebaseBudgets: Starting...');
        const db = getFirestore();
        console.log('getFirebaseBudgets: Got Firestore instance');

        console.log('getFirebaseBudgets: About to fetch from collection:', COLLECTIONS.BUDGETS);
        const snapshot = await db.collection(COLLECTIONS.BUDGETS).get();
        console.log('getFirebaseBudgets: Successfully fetched snapshot with', snapshot.docs.length, 'documents');

        const budgets = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('getFirebaseBudgets: Processing document ID', doc.id, 'with data:', data);
            return {
                id: doc.id,
                ...data
            };
        });

        console.log('getFirebaseBudgets: Returning budgets:', budgets);
        return budgets;
    } catch (error) {
        console.error('=== DETAILED ERROR FETCHING BUDGETS FROM FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);

        // Additional debugging information
        console.error('Firebase SDK status:', {
            sdkAvailable: !!sdk,
            dbAvailable: !!(sdk && sdk.db),
            collectionMethod: !!(sdk && sdk.db && typeof sdk.db.collection === 'function'),
            batchMethod: !!(sdk && sdk.db && typeof sdk.db.batch === 'function')
        });

        // If it's a Firebase error, log additional details
        if (error.code) {
            console.error('Firebase error details:', {
                code: error.code,
                name: error.name,
                permission: error.permission,
                path: error.path
            });
        }

        return null;
    }
};

/**
 * Save budgets to Firebase
 */
export const saveFirebaseBudgets = async (budgets) => {
    try {
        console.log('saveFirebaseBudgets: Starting with budgets:', budgets);
        const db = getFirestore();
        console.log('saveFirebaseBudgets: Got Firestore instance');

        // Validate budgets data
        if (!Array.isArray(budgets)) {
            throw new Error('Budgets must be an array');
        }

        // Check if batch is available, if not, use individual operations
        if (typeof db.batch === 'function') {
            console.log('saveFirebaseBudgets: Using batch operations');
            console.log('saveFirebaseBudgets: Creating batch operation');
            const batch = db.batch();

            console.log('saveFirebaseBudgets: Deleting existing budgets');
            const existingSnapshot = await db.collection(COLLECTIONS.BUDGETS).get();
            existingSnapshot.docs.forEach(doc => {
                console.log('saveFirebaseBudgets: Deleting document:', doc.id);
                batch.delete(db.collection(COLLECTIONS.BUDGETS).doc(doc.id));
            });

            console.log('saveFirebaseBudgets: Adding new budgets');
            budgets.forEach((budget, index) => {
                // Validate budget object
                if (!budget || typeof budget !== 'object') {
                    console.warn('saveFirebaseBudgets: Invalid budget object skipped:', budget);
                    return;
                }

                console.log('saveFirebaseBudgets: Processing budget', index, ':', budget);

                if (budget.id) {
                    // Update existing budget
                    console.log('saveFirebaseBudgets: Updating existing budget with ID:', budget.id);
                    batch.set(db.collection(COLLECTIONS.BUDGETS).doc(budget.id.toString()), budget);
                } else {
                    // Add new budget
                    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    console.log('saveFirebaseBudgets: Creating new budget with ID:', newId);
                    batch.set(db.collection(COLLECTIONS.BUDGETS).doc(newId), { ...budget, id: newId });
                }
            });

            console.log('saveFirebaseBudgets: Committing batch');
            await batch.commit();
            console.log('saveFirebaseBudgets: Batch committed successfully');
        } else {
            console.log('saveFirebaseBudgets: Batch not available, using individual operations');

            // Delete existing budgets one by one
            console.log('saveFirebaseBudgets: Deleting existing budgets');
            const existingSnapshot = await db.collection(COLLECTIONS.BUDGETS).get();
            for (const doc of existingSnapshot.docs) {
                console.log('saveFirebaseBudgets: Deleting document:', doc.id);
                await db.collection(COLLECTIONS.BUDGETS).doc(doc.id).delete();
            }

            // Add new budgets one by one
            console.log('saveFirebaseBudgets: Adding new budgets');
            for (const budget of budgets) {
                // Validate budget object
                if (!budget || typeof budget !== 'object') {
                    console.warn('saveFirebaseBudgets: Invalid budget object skipped:', budget);
                    continue;
                }

                if (budget.id) {
                    // Update existing budget
                    console.log('saveFirebaseBudgets: Updating existing budget with ID:', budget.id);
                    await db.collection(COLLECTIONS.BUDGETS).doc(budget.id.toString()).set(budget);
                } else {
                    // Add new budget
                    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    console.log('saveFirebaseBudgets: Creating new budget with ID:', newId);
                    await db.collection(COLLECTIONS.BUDGETS).doc(newId).set({ ...budget, id: newId });
                }
            }

            console.log('saveFirebaseBudgets: Individual operations completed successfully');
        }

        // Trigger custom event to notify other components
        console.log('saveFirebaseBudgets: Dispatching budgetsUpdated event');
        window.dispatchEvent(new CustomEvent('budgetsUpdated', { detail: budgets }));
        console.log('saveFirebaseBudgets: Event dispatched');
    } catch (error) {
        console.error('=== DETAILED ERROR SAVING BUDGETS TO FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Budgets data being saved:', budgets);

        // Additional debugging information
        console.error('Firebase SDK status:', {
            sdkAvailable: !!sdk,
            dbAvailable: !!(sdk && sdk.db),
            collectionMethod: !!(sdk && sdk.db && typeof sdk.db.collection === 'function'),
            batchMethod: !!(sdk && sdk.db && typeof sdk.db.batch === 'function')
        });

        // If it's a Firebase error, log additional details
        if (error.code) {
            console.error('Firebase error details:', {
                code: error.code,
                name: error.name,
                permission: error.permission,
                path: error.path
            });
        }

        throw error; // Re-throw the error so it can be handled by the caller
    }
};

/**
 * Get categories from Firebase
 */
export const getFirebaseCategories = async () => {
    try {
        console.log('getFirebaseCategories: Starting...');
        const db = getFirestore();
        console.log('getFirebaseCategories: Got Firestore instance');

        console.log('getFirebaseCategories: About to fetch from collection:', COLLECTIONS.CATEGORIES);
        const snapshot = await db.collection(COLLECTIONS.CATEGORIES).get();
        console.log('getFirebaseCategories: Successfully fetched snapshot with', snapshot.docs.length, 'documents');

        const categories = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('getFirebaseCategories: Processing document ID', doc.id, 'with data:', data);
            return {
                id: doc.id,
                ...data
            };
        });

        console.log('getFirebaseCategories: Returning categories:', categories);
        return categories;
    } catch (error) {
        console.error('=== DETAILED ERROR FETCHING CATEGORIES FROM FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);

        // Additional debugging information
        console.error('Firebase SDK status:', {
            windowAvailable: typeof window !== 'undefined',
            sdkDefined: typeof sdk !== 'undefined',
            sdkInstance: !!sdk,
            dbAvailable: !!(sdk && sdk.db),
            collectionMethod: !!(sdk && sdk.db && typeof sdk.db.collection === 'function'),
            batchMethod: !!(sdk && sdk.db && typeof sdk.db.batch === 'function')
        });

        // If it's a Firebase error, log additional details
        if (error.code) {
            console.error('Firebase error details:', {
                code: error.code,
                name: error.name,
                permission: error.permission,
                path: error.path
            });
        }

        // Additional specific debugging for categories
        console.error('Collection name being accessed:', COLLECTIONS.CATEGORIES);

        return null;
    }
};

/**
 * Save categories to Firebase
 */
export const saveFirebaseCategories = async (categories) => {
    try {
        console.log('saveFirebaseCategories: Starting with categories:', categories);
        const db = getFirestore();
        console.log('saveFirebaseCategories: Got Firestore instance');

        // Validate categories data
        if (!Array.isArray(categories)) {
            throw new Error('Categories must be an array');
        }

        // Check if batch is available, if not, use individual operations
        if (typeof db.batch === 'function') {
            console.log('saveFirebaseCategories: Using batch operations');
            console.log('saveFirebaseCategories: Creating batch operation');
            const batch = db.batch();

            console.log('saveFirebaseCategories: Deleting existing categories');
            const existingSnapshot = await db.collection(COLLECTIONS.CATEGORIES).get();
            existingSnapshot.docs.forEach(doc => {
                console.log('saveFirebaseCategories: Deleting document:', doc.id);
                batch.delete(db.collection(COLLECTIONS.CATEGORIES).doc(doc.id));
            });

            console.log('saveFirebaseCategories: Adding new categories');
            categories.forEach((category, index) => {
                // Validate category object
                if (!category || typeof category !== 'object') {
                    console.warn('saveFirebaseCategories: Invalid category object skipped:', category);
                    return;
                }

                console.log('saveFirebaseCategories: Processing category', index, ':', category);

                if (category.id) {
                    // Update existing category
                    console.log('saveFirebaseCategories: Updating existing category with ID:', category.id);
                    batch.set(db.collection(COLLECTIONS.CATEGORIES).doc(category.id.toString()), category);
                } else {
                    // Add new category
                    const newId = category.id || Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    console.log('saveFirebaseCategories: Creating new category with ID:', newId);
                    batch.set(db.collection(COLLECTIONS.CATEGORIES).doc(newId), { ...category, id: newId });
                }
            });

            console.log('saveFirebaseCategories: Committing batch');
            await batch.commit();
            console.log('saveFirebaseCategories: Batch committed successfully');
        } else {
            console.log('saveFirebaseCategories: Batch not available, using individual operations');

            // Delete existing categories one by one
            console.log('saveFirebaseCategories: Deleting existing categories');
            const existingSnapshot = await db.collection(COLLECTIONS.CATEGORIES).get();
            for (const doc of existingSnapshot.docs) {
                console.log('saveFirebaseCategories: Deleting document:', doc.id);
                await db.collection(COLLECTIONS.CATEGORIES).doc(doc.id).delete();
            }

            // Add new categories one by one
            console.log('saveFirebaseCategories: Adding new categories');
            for (const category of categories) {
                // Validate category object
                if (!category || typeof category !== 'object') {
                    console.warn('saveFirebaseCategories: Invalid category object skipped:', category);
                    continue;
                }

                if (category.id) {
                    // Update existing category
                    console.log('saveFirebaseCategories: Updating existing category with ID:', category.id);
                    await db.collection(COLLECTIONS.CATEGORIES).doc(category.id.toString()).set(category);
                } else {
                    // Add new category
                    const newId = category.id || Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    console.log('saveFirebaseCategories: Creating new category with ID:', newId);
                    await db.collection(COLLECTIONS.CATEGORIES).doc(newId).set({ ...category, id: newId });
                }
            }

            console.log('saveFirebaseCategories: Individual operations completed successfully');
        }
    } catch (error) {
        console.error('=== DETAILED ERROR SAVING CATEGORIES TO FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Categories data being saved:', categories);

        // Additional debugging information
        console.error('Firebase SDK status:', {
            sdkAvailable: !!sdk,
            dbAvailable: !!(sdk && sdk.db),
            collectionMethod: !!(sdk && sdk.db && typeof sdk.db.collection === 'function'),
            batchMethod: !!(sdk && sdk.db && typeof sdk.db.batch === 'function')
        });

        // If it's a Firebase error, log additional details
        if (error.code) {
            console.error('Firebase error details:', {
                code: error.code,
                name: error.name,
                permission: error.permission,
                path: error.path
            });
        }

        throw error; // Re-throw the error so it can be handled by the caller
    }
};

/**
 * Add a new expense to Firebase
 */
export const addFirebaseExpense = async (expense) => {
    try {
        console.log('addFirebaseExpense: Starting with expense:', expense);
        const db = getFirestore();
        console.log('addFirebaseExpense: Got Firestore instance');

        // Validate expense data
        if (!expense || typeof expense !== 'object') {
            throw new Error('Expense must be a valid object');
        }

        const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        console.log('addFirebaseExpense: Creating new expense with ID:', newId);
        const expenseWithId = { ...expense, id: newId };

        await db.collection(COLLECTIONS.EXPENSES).doc(newId).set(expenseWithId);
        console.log('addFirebaseExpense: Expense saved successfully');

        return expenseWithId;
    } catch (error) {
        console.error('=== DETAILED ERROR ADDING EXPENSE TO FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Expense data being saved:', expense);

        return null;
    }
};

/**
 * Delete an expense from Firebase
 */
export const deleteFirebaseExpense = async (expenseId) => {
    try {
        console.log('deleteFirebaseExpense: Starting with expenseId:', expenseId);
        const db = getFirestore();
        console.log('deleteFirebaseExpense: Got Firestore instance');

        // Validate expenseId
        if (!expenseId) {
            throw new Error('Expense ID is required');
        }

        console.log('deleteFirebaseExpense: Deleting document with ID:', expenseId.toString());
        await db.collection(COLLECTIONS.EXPENSES).doc(expenseId.toString()).delete();
        console.log('deleteFirebaseExpense: Expense deleted successfully');
    } catch (error) {
        console.error('=== DETAILED ERROR DELETING EXPENSE FROM FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Expense ID being deleted:', expenseId);

        throw error; // Re-throw the error so it can be handled by the caller
    }
};

/**
 * Add a new budget to Firebase
 */
export const addFirebaseBudget = async (budget) => {
    try {
        console.log('addFirebaseBudget: Starting with budget:', budget);
        const db = getFirestore();
        console.log('addFirebaseBudget: Got Firestore instance');

        // Validate budget data
        if (!budget || typeof budget !== 'object') {
            throw new Error('Budget must be a valid object');
        }

        const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        console.log('addFirebaseBudget: Creating new budget with ID:', newId);
        const budgetWithId = { ...budget, id: newId };

        await db.collection(COLLECTIONS.BUDGETS).doc(newId).set(budgetWithId);
        console.log('addFirebaseBudget: Budget saved successfully');

        return budgetWithId;
    } catch (error) {
        console.error('=== DETAILED ERROR ADDING BUDGET TO FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Budget data being saved:', budget);

        return null;
    }
};

/**
 * Delete a budget from Firebase
 */
export const deleteFirebaseBudget = async (budgetId) => {
    try {
        console.log('deleteFirebaseBudget: Starting with budgetId:', budgetId);
        const db = getFirestore();
        console.log('deleteFirebaseBudget: Got Firestore instance');

        // Validate budgetId
        if (!budgetId) {
            throw new Error('Budget ID is required');
        }

        console.log('deleteFirebaseBudget: Deleting document with ID:', budgetId.toString());
        await db.collection(COLLECTIONS.BUDGETS).doc(budgetId.toString()).delete();
        console.log('deleteFirebaseBudget: Budget deleted successfully');
    } catch (error) {
        console.error('=== DETAILED ERROR DELETING BUDGET FROM FIREBASE ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        console.error('Budget ID being deleted:', budgetId);

        throw error; // Re-throw the error so it can be handled by the caller
    }
};