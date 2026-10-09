// Stock validation utilities to prevent negative inventory
import { sdk } from '../sdk.js';

/**
 * Validates that a stock operation won't result in negative inventory
 * @param {string} itemId - Inventory item ID (optional for name-based lookup)
 * @param {string} itemName - Inventory item name (used if itemId not provided)
 * @param {number} deductionAmount - Amount to deduct
 * @param {string} location - Location to check (optional)
 * @returns {Promise<{valid: boolean, currentStock: number, message: string}>}
 */
export async function validateStockDeduction(itemId = null, itemName = null, deductionAmount, location = null) {
    try {
        const inventoryRef = sdk.db.collection("Inventory");
        let query;
        
        if (itemId) {
            // Query by ID
            const doc = await inventoryRef.doc(itemId).get();
            if (!doc.exists) {
                return {
                    valid: false,
                    currentStock: 0,
                    message: `Sorry, inventory item "${itemName || 'Unknown Item'}" is not available. Please stock it now.`
                };
            }
            
            const data = doc.data();
            const currentStock = Number(data.quantity || 0);
            
            if (currentStock < deductionAmount) {
                return {
                    valid: false,
                    currentStock: currentStock,
                    message: `Sorry, inventory is low for "${data.name || 'Unknown Item'}". Available: ${currentStock}, Required: ${deductionAmount}. Please stock it now.`
                };
            }
            
            return {
                valid: true,
                currentStock: currentStock,
                message: 'Stock validation passed'
            };
        } else if (itemName) {
            // Query by name and optionally location
            query = inventoryRef.where("name", "==", itemName);
            if (location) {
                query = query.where("location", "==", location);
            }
            
            const snapshot = await query.get();
            if (snapshot.empty) {
                return {
                    valid: false,
                    currentStock: 0,
                    message: `Sorry, inventory item "${itemName}" is not available. Please stock it now.`
                };
            }
            
            const doc = snapshot.docs[0];
            const data = doc.data();
            const currentStock = Number(data.quantity || 0);
            
            if (currentStock < deductionAmount) {
                return {
                    valid: false,
                    currentStock: currentStock,
                    message: `Sorry, inventory is low for "${itemName}". Available: ${currentStock}, Required: ${deductionAmount}. Please stock it now.`
                };
            }
            
            return {
                valid: true,
                currentStock: currentStock,
                message: 'Stock validation passed'
            };
        } else {
            return {
                valid: false,
                currentStock: 0,
                message: 'Either itemId or itemName must be provided for validation'
            };
        }
    } catch (error) {
        console.error('Error validating stock deduction:', error);
        return {
            valid: false,
            currentStock: 0,
            message: `Sorry, inventory is low. Please stock the required ingredients first.`
        };
    }
}

/**
 * Validates multiple stock deductions (useful for recipe-based operations)
 * @param {Array} deductions - Array of {itemName, quantity, location?} objects
 * @returns {Promise<{valid: boolean, failures: Array, message: string}>}
 */
export async function validateMultipleStockDeductions(deductions) {
    try {
        const failures = [];
        
        for (const deduction of deductions) {
            if (!deduction.itemName || !deduction.quantity || deduction.quantity <= 0) {
                failures.push({
                    item: deduction.itemName || 'Unknown',
                    message: 'Invalid deduction data provided'
                });
                continue;
            }
            
            const validation = await validateStockDeduction(
                null, 
                deduction.itemName, 
                Number(deduction.quantity), 
                deduction.location
            );
            
            if (!validation.valid) {
                failures.push({
                    item: deduction.itemName,
                    message: validation.message,
                    currentStock: validation.currentStock,
                    requestedQuantity: deduction.quantity
                });
            }
        }
        
        return {
            valid: failures.length === 0,
            failures: failures,
            message: failures.length === 0 
                ? 'All stock validations passed' 
                : `Sorry, inventory is low. Please stock the required ingredients first.`
        };
    } catch (error) {
        console.error('Error validating multiple stock deductions:', error);
        return {
            valid: false,
            failures: [{
                item: 'Unknown',
                message: `Sorry, inventory is low. Please stock the required ingredients first.`
            }],
            message: `Sorry, inventory is low. Please stock the required ingredients first.`
        };
    }
}

/**
 * Safely performs a stock deduction with validation
 * @param {string} itemId - Inventory item ID (optional)
 * @param {string} itemName - Inventory item name (used if itemId not provided)
 * @param {number} deductionAmount - Amount to deduct
 * @param {string} location - Location to deduct from (optional)
 * @param {string} reason - Reason for deduction (for logging)
 * @returns {Promise<{success: boolean, newQuantity: number, message: string}>}
 */
export async function safeStockDeduction(itemId = null, itemName = null, deductionAmount, location = null, reason = 'Stock deduction') {
    try {
        // First validate the deduction
        const validation = await validateStockDeduction(itemId, itemName, deductionAmount, location);
        
        if (!validation.valid) {
            return {
                success: false,
                newQuantity: validation.currentStock,
                message: validation.message
            };
        }
        
        // Perform the deduction
        const inventoryRef = sdk.db.collection("Inventory");
        let itemRef;
        
        if (itemId) {
            itemRef = inventoryRef.doc(itemId);
        } else {
            let query = inventoryRef.where("name", "==", itemName);
            if (location) {
                query = query.where("location", "==", location);
            }
            const snapshot = await query.get();
            if (snapshot.empty) {
                return {
                    success: false,
                    newQuantity: 0,
                    message: `Sorry, inventory item "${itemName}" is not available. Please stock it now.`
                };
            }
            const doc = snapshot.docs[0];
            itemRef = inventoryRef.doc(doc.id);
        }
        
        // Use transaction for atomic operation
        if (sdk.db.runTransaction && typeof sdk.db.runTransaction === 'function') {
            await sdk.db.runTransaction(async (tx) => {
                const snap = await tx.get(itemRef);
                if (!snap.exists) {
                    throw new Error(`Inventory item no longer exists`);
                }
                
                const currentData = snap.data();
                const currentQty = Number(currentData.quantity || 0);
                
                // Double-check within transaction
                if (currentQty < deductionAmount) {
                    throw new Error(`Insufficient stock. Available: ${currentQty}, Required: ${deductionAmount}`);
                }
                
                const newQuantity = Math.max(0, currentQty - deductionAmount); // Ensure non-negative
                
                tx.update(itemRef, {
                    quantity: newQuantity,
                    updatedAt: new Date(),
                    lastUpdated: new Date().toISOString()
                });
            });
        } else {
            // Fallback: Direct update with re-validation
            const doc = await itemRef.get();
            const currentData = doc.data();
            const currentQty = Number(currentData.quantity || 0);
            
            if (currentQty < deductionAmount) {
                return {
                    success: false,
                    newQuantity: currentQty,
                    message: `Sorry, inventory is low. Please stock the required ingredients first.`
                };
            }
            
            const newQuantity = Math.max(0, currentQty - deductionAmount); // Ensure non-negative
            
            await itemRef.update({
                quantity: newQuantity,
                updatedAt: new Date(),
                lastUpdated: new Date().toISOString()
            });
        }
        
        const newQuantity = validation.currentStock - deductionAmount;
        
        return {
            success: true,
            newQuantity: Math.max(0, newQuantity),
            message: `Successfully deducted ${deductionAmount} units. New quantity: ${Math.max(0, newQuantity)}`
        };
        
    } catch (error) {
        console.error('Error in safe stock deduction:', error);
        return {
            success: false,
            newQuantity: 0,
            message: `Sorry, inventory is low. Please stock the required ingredients first.`
        };
    }
}

/**
 * Validates and performs multiple stock deductions safely
 * @param {Array} deductions - Array of {itemName, quantity, location?, reason?} objects
 * @returns {Promise<{success: boolean, results: Array, message: string}>}
 */
export async function safeBulkStockDeduction(deductions) {
    try {
        // First validate all deductions
        const validation = await validateMultipleStockDeductions(deductions);
        
        if (!validation.valid) {
            return {
                success: false,
                results: validation.failures,
                message: validation.message
            };
        }
        
        // Perform all deductions
        const results = [];
        for (const deduction of deductions) {
            const result = await safeStockDeduction(
                null,
                deduction.itemName,
                Number(deduction.quantity),
                deduction.location,
                deduction.reason || 'Bulk deduction'
            );
            
            results.push({
                item: deduction.itemName,
                requested: deduction.quantity,
                ...result
            });
            
            // If any deduction fails, we should ideally rollback
            // For now, we'll continue but mark the overall operation as failed
            if (!result.success) {
                return {
                    success: false,
                    results: results,
                    message: `Sorry, inventory is low. Please stock the required ingredients first.`
                };
            }
        }
        
        return {
            success: true,
            results: results,
            message: `Successfully processed ${results.length} deductions`
        };
        
    } catch (error) {
        console.error('Error in bulk stock deduction:', error);
        return {
            success: false,
            results: [],
            message: `Sorry, inventory is low. Please stock the required ingredients first.`
        };
    }
}

/**
 * Validates that a quantity is positive and not zero
 * @param {number|string} quantity - Quantity to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Promise<{valid: boolean, value: number, message: string}>}
 */
export function validatePositiveQuantity(quantity, fieldName = 'quantity') {
    const numValue = Number(quantity);
    
    if (isNaN(numValue)) {
        return {
            valid: false,
            value: 0,
            message: `${fieldName} must be a valid number`
        };
    }
    
    if (numValue < 0) {
        return {
            valid: false,
            value: 0,
            message: `${fieldName} cannot be negative`
        };
    }
    
    if (numValue === 0) {
        return {
            valid: false,
            value: 0,
            message: `${fieldName} must be greater than zero`
        };
    }
    
    return {
        valid: true,
        value: numValue,
        message: 'Valid quantity'
    };
}

/**
 * Ensures a quantity is never negative by clamping to zero
 * @param {number|string} quantity - Quantity value
 * @returns {number} Non-negative quantity
 */
export function ensureNonNegativeQuantity(quantity) {
    const numValue = Number(quantity);
    return isNaN(numValue) ? 0 : Math.max(0, numValue);
}