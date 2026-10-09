import { sdk, FieldValue } from '../sdk.js';
import { InventoryItem } from '../models/Product.js';
import { validateStockDeduction, ensureNonNegativeQuantity } from './stockValidation.js';

/**
 * Get suggested purchase orders based on low stock items
 */
export async function getSuggestedPurchaseOrders() {
    try {
        const inventorySnapshot = await sdk.db.collection("Inventory").get();
        const suggestions = [];
        
        for (const doc of inventorySnapshot.docs) {
            const item = doc.data();
            if (item.quantity <= item.minQuantity && item.minQuantity > 0) {
                const suggestedQuantity = Math.max(item.minQuantity * 2, item.minQuantity + 10);
                suggestions.push({
                    itemId: doc.id,
                    itemName: item.name,
                    currentQuantity: item.quantity,
                    minQuantity: item.minQuantity,
                    suggestedQuantity: suggestedQuantity,
                    unit: item.unit,
                    location: item.location || 'main'
                });
            }
        }
        
        return suggestions;
    } catch (error) {
        console.error('Error getting suggested purchase orders:', error);
        return [];
    }
}

/**
 * Transfer inventory between locations
 * @param {string} itemId - The ID of the inventory item to transfer (document ID)
 * @param {string} fromLocation - Source location
 * @param {string} toLocation - Destination location
 * @param {number} quantity - Quantity to transfer
 */
export async function transferInventoryBetweenLocations(itemId, fromLocation, toLocation, quantity) {
    try {
        const inventoryRef = sdk.db.collection("Inventory");
        
        // Find the item at the source location using document ID
        const fromDoc = await inventoryRef.doc(itemId).get();
        
        if (!fromDoc.exists) {
            throw new Error(`Item not found with ID ${itemId}`);
        }
        
        const fromData = fromDoc.data();
        
        // Verify the item is actually at the source location
        if (fromData.location !== fromLocation) {
            throw new Error(`Item not found at location ${fromLocation}`);
        }
        
        // Validate the transfer amount against current stock
        const validation = await validateStockDeduction(itemId, null, quantity, fromLocation);
        if (!validation.valid) {
            throw new Error(validation.message);
        }
        
        // Find or create item at destination location
        const toSnapshot = await inventoryRef
            .where("name", "==", fromData.name)
            .where("location", "==", toLocation)
            .get();
            
        let toDoc;
        let toData;
        
        if (toSnapshot.empty) {
            // Create new item at destination location
            const newItemData = new InventoryItem({
                name: fromData.name,
                quantity: quantity,
                unit: fromData.unit,
                minQuantity: fromData.minQuantity,
                location: toLocation,
                date: new Date(),
                updatedAt: new Date(),
                lastUpdated: new Date().toISOString(),
                vendorName: fromData.vendorName,
                vendorCompany: fromData.vendorCompany,
                vendorGst: fromData.vendorGst,
                vendorContact: fromData.vendorContact,
                vendorAddress: fromData.vendorAddress,
                perKgCost: fromData.perKgCost,
                notes: fromData.notes
            });
            
            const newRef = inventoryRef.doc();
            await newRef.set(newItemData.toJson());
            toDoc = newRef;
            toData = newItemData;
        } else {
            // Update existing item at destination location
            toDoc = toSnapshot.docs[0];
            toData = toDoc.data();
            
            await inventoryRef.doc(toDoc.id).update({
                quantity: FieldValue ? FieldValue.increment(quantity) : toData.quantity + quantity,
                updatedAt: new Date(),
                lastUpdated: new Date().toISOString()
            });
        }
        
        // Calculate new source quantity
        const newSourceQuantity = Math.max(0, fromData.quantity - quantity);
        
        if (newSourceQuantity === 0) {
            // If source quantity is 0, delete the source item
            await inventoryRef.doc(itemId).delete();
        } else {
            // Otherwise, update the source item
            await inventoryRef.doc(itemId).update({
                quantity: FieldValue ? FieldValue.increment(-quantity) : newSourceQuantity,
                updatedAt: new Date(),
                lastUpdated: new Date().toISOString()
            });
        }
        
        // Log the transfer
        await logInventoryTransfer(itemId, fromLocation, toLocation, quantity, fromData.name);
        
        return {
            success: true,
            fromLocation: fromLocation,
            toLocation: toLocation,
            quantity: quantity,
            fromRemaining: newSourceQuantity,
            toNewQuantity: toData.quantity + quantity,
            sourceItemDeleted: newSourceQuantity === 0
        };
        
    } catch (error) {
        console.error('Error transferring inventory:', error);
        throw error;
    }
}

/**
 * Get inventory items by location
 * @param {string} location - The location to filter by
 */
export async function getInventoryByLocation(location) {
    try {
        const inventorySnapshot = await sdk.db.collection("Inventory")
            .where("location", "==", location)
            .orderBy("name")
            .get();
            
        return inventorySnapshot.docs.map(doc => new InventoryItem({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting inventory by location:', error);
        return [];
    }
}

/**
 * Get all locations with inventory counts
 */
export async function getLocationInventorySummary() {
    try {
        const inventorySnapshot = await sdk.db.collection("Inventory").get();
        const locationSummary = {};
        
        for (const doc of inventorySnapshot.docs) {
            const item = doc.data();
            const location = item.location || 'main';
            
            if (!locationSummary[location]) {
                locationSummary[location] = {
                    location: location,
                    totalItems: 0,
                    totalValue: 0,
                    items: []
                };
            }
            
            const totalCost = (item.quantity * item.perKgCost) || 0;
            locationSummary[location].totalItems++;
            locationSummary[location].totalValue += totalCost;
            locationSummary[location].items.push({
                id: doc.id,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                minQuantity: item.minQuantity,
                totalCost: totalCost,
                lowStock: item.quantity <= item.minQuantity
            });
        }
        
        return Object.values(locationSummary);
    } catch (error) {
        console.error('Error getting location inventory summary:', error);
        return [];
    }
}

/**
 * Log inventory transfer for tracking
 * @param {string} itemId - The ID of the inventory item
 * @param {string} fromLocation - Source location
 * @param {string} toLocation - Destination location
 * @param {number} quantity - Quantity transferred
 * @param {string} itemName - Name of the item
 */
async function logInventoryTransfer(itemId, fromLocation, toLocation, quantity, itemName) {
    try {
        const transfersRef = sdk.db.collection("InventoryTransfers");
        await transfersRef.add({
            itemId: itemId,
            itemName: itemName,
            fromLocation: fromLocation,
            toLocation: toLocation,
            quantity: quantity,
            timestamp: new Date(),
            date: new Date().toISOString().split('T')[0],
            type: 'transfer'
        });
    } catch (error) {
        console.error('Failed to log inventory transfer:', error);
    }
}

/**
 * Get expired items
 */
export async function getExpiredItems() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const inventorySnapshot = await sdk.db.collection("Inventory")
            .where("expiryDate", "<=", today)
            .where("expiryDate", "!=", "")
            .get();
            
        return inventorySnapshot.docs.map(doc => new InventoryItem({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting expired items:', error);
        return [];
    }
}

/**
 * Get items expiring soon (within 7 days)
 */
export async function getExpiringSoonItems() {
    try {
        const today = new Date();
        const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const todayStr = today.toISOString().split('T')[0];
        const weekFromNowStr = weekFromNow.toISOString().split('T')[0];
        
        const inventorySnapshot = await sdk.db.collection("Inventory")
            .where("expiryDate", ">=", todayStr)
            .where("expiryDate", "<=", weekFromNowStr)
            .where("expiryDate", "!=", "")
            .get();
            
        return inventorySnapshot.docs.map(doc => new InventoryItem({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting expiring soon items:', error);
        return [];
    }
}

/**
 * Mark items as wasted/expired
 * @param {string} itemId - The ID of the inventory item
 * @param {number} quantity - Quantity to mark as wasted
 * @param {string} reason - Reason for waste
 */
export async function markItemsAsWasted(itemId, quantity, reason = 'expired') {
    try {
        const inventoryRef = sdk.db.collection("Inventory");
        const itemDoc = await inventoryRef.doc(itemId).get();
        
        if (!itemDoc.exists) {
            throw new Error('Item not found');
        }
        
        const itemData = itemDoc.data();
        
        if (itemData.quantity < quantity) {
            throw new Error(`Insufficient quantity. Available: ${itemData.quantity}, Requested: ${quantity}`);
        }
        
        // Deduct the wasted quantity
        await inventoryRef.doc(itemId).update({
            quantity: FieldValue ? FieldValue.increment(-quantity) : itemData.quantity - quantity,
            updatedAt: new Date(),
            lastUpdated: new Date().toISOString()
        });
        
        // Log the waste
        await logInventoryWaste(itemId, quantity, reason, itemData.name);
        
        return {
            success: true,
            remainingQuantity: itemData.quantity - quantity
        };
        
    } catch (error) {
        console.error('Error marking items as wasted:', error);
        throw error;
    }
}

/**
 * Log inventory waste for tracking
 * @param {string} itemId - The ID of the inventory item
 * @param {number} quantity - Quantity wasted
 * @param {string} reason - Reason for waste
 * @param {string} itemName - Name of the item
 */
async function logInventoryWaste(itemId, quantity, reason, itemName) {
    try {
        const wasteRef = sdk.db.collection("InventoryWaste");
        await wasteRef.add({
            itemId: itemId,
            itemName: itemName,
            quantity: quantity,
            reason: reason,
            timestamp: new Date(),
            date: new Date().toISOString().split('T')[0]
        });
    } catch (error) {
        console.error('Failed to log inventory waste:', error);
    }
}

/**
 * Adjust inventory stock (for stock counting)
 * @param {string} itemId - The ID of the inventory item
 * @param {number} newQuantity - The new quantity after counting
 * @param {string} reason - Reason for adjustment
 * @param {string} userId - User making the adjustment
 */
export async function adjustInventoryStock(itemId, newQuantity, reason = 'stock_count', userId = null) {
    try {
        const inventoryRef = sdk.db.collection("Inventory");
        const itemDoc = await inventoryRef.doc(itemId).get();
        
        if (!itemDoc.exists) {
            throw new Error('Item not found');
        }
        
        const itemData = itemDoc.data();
        const currentQuantity = itemData.quantity;
        const difference = newQuantity - currentQuantity;
        
        // Update the inventory quantity
        await inventoryRef.doc(itemId).update({
            quantity: newQuantity,
            updatedAt: new Date(),
            lastUpdated: new Date().toISOString()
        });
        
        // Log the adjustment
        await logInventoryAdjustment(itemId, currentQuantity, newQuantity, difference, reason, userId, itemData.name);
        
        return {
            success: true,
            itemId: itemId,
            previousQuantity: currentQuantity,
            newQuantity: newQuantity,
            difference: difference
        };
        
    } catch (error) {
        console.error('Error adjusting inventory stock:', error);
        throw error;
    }
}

/**
 * Log inventory adjustment for tracking
 * @param {string} itemId - The ID of the inventory item
 * @param {number} previousQuantity - Previous quantity
 * @param {number} newQuantity - New quantity
 * @param {number} difference - Difference between quantities
 * @param {string} reason - Reason for adjustment
 * @param {string} userId - User making the adjustment
 * @param {string} itemName - Name of the item
 */
async function logInventoryAdjustment(itemId, previousQuantity, newQuantity, difference, reason, userId, itemName) {
    try {
        const adjustmentsRef = sdk.db.collection("InventoryAdjustments");
        await adjustmentsRef.add({
            itemId: itemId,
            itemName: itemName,
            previousQuantity: previousQuantity,
            newQuantity: newQuantity,
            difference: difference,
            reason: reason,
            userId: userId,
            timestamp: new Date(),
            date: new Date().toISOString().split('T')[0]
        });
    } catch (error) {
        console.error('Failed to log inventory adjustment:', error);
    }
}

/**
 * Get inventory transaction history
 * @param {string} itemId - Optional item ID to filter by
 * @param {string} startDate - Optional start date
 * @param {string} endDate - Optional end date
 */
export async function getInventoryTransactionHistory(itemId = null, startDate = null, endDate = null) {
    try {
        let transactionsQuery = sdk.db.collection("InventoryTransactions");
        
        if (itemId) {
            transactionsQuery = transactionsQuery.where("itemId", "==", itemId);
        }
        
        if (startDate) {
            transactionsQuery = transactionsQuery.where("date", ">=", startDate);
        }
        
        if (endDate) {
            transactionsQuery = transactionsQuery.where("date", "<=", endDate);
        }
        
        const transactionsSnapshot = await transactionsQuery
            .orderBy("timestamp", "desc")
            .get();
            
        return transactionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting inventory transaction history:', error);
        return [];
    }
}

/**
 * Stock in recording (for purchases, returns, etc.)
 * @param {string} itemId - The ID of the inventory item
 * @param {number} quantity - Quantity to add
 * @param {string} reason - Reason for stock in
 * @param {string} notes - Additional notes
 * @param {number} costPerUnit - Cost per unit (optional)
 */
export async function stockIn(itemId, quantity, reason = 'Purchase', notes = '', costPerUnit = 0) {
    try {
        const inventoryRef = sdk.db.collection("Inventory");
        const stockInRef = sdk.db.collection("StockIn");
        
        const itemDoc = await inventoryRef.doc(itemId).get();
        if (!itemDoc.exists) {
            throw new Error('Inventory item not found');
        }

        const itemData = itemDoc.data();
        const currentQuantity = Number(itemData.quantity || 0);
        const newQuantity = currentQuantity + quantity;

        // Update inventory quantity
        await inventoryRef.doc(itemId).update({
            quantity: newQuantity,
            updatedAt: new Date(),
            lastUpdated: new Date().toISOString(),
            // Update cost if provided
            ...(costPerUnit > 0 && { perKgCost: costPerUnit })
        });

        // Log the stock in
        await stockInRef.add({
            itemId: itemId,
            itemName: itemData.name,
            quantityIn: quantity,
            previousQuantity: currentQuantity,
            newQuantity: newQuantity,
            reason: reason,
            notes: notes,
            costPerUnit: costPerUnit,
            totalCost: quantity * costPerUnit,
            date: new Date(),
            recordedBy: 'user'
        });

        return { success: true, newQuantity: newQuantity };
    } catch (error) {
        console.error('Error recording stock in:', error);
        throw error;
    }
}

/**
 * Stock out recording (for waste, spoilage, etc.)
 * @param {string} itemId - The ID of the inventory item
 * @param {number} quantity - Quantity to remove
 * @param {string} reason - Reason for stock out
 * @param {string} notes - Additional notes
 */
export async function stockOut(itemId, quantity, reason = 'Waste', notes = '') {
    try {
        const inventoryRef = sdk.db.collection("Inventory");
        const stockOutRef = sdk.db.collection("StockOut");
        
        const itemDoc = await inventoryRef.doc(itemId).get();
        if (!itemDoc.exists) {
            throw new Error('Inventory item not found');
        }

        const itemData = itemDoc.data();
        const currentQuantity = Number(itemData.quantity || 0);
        
        // Validate input quantities
        if (quantity <= 0) {
            throw new Error('Quantity must be greater than zero');
        }
        
        // Validate against current stock
        const validation = await validateStockDeduction(itemId, null, quantity);
        if (!validation.valid) {
            throw new Error(validation.message);
        }

        const newQuantity = ensureNonNegativeQuantity(currentQuantity - quantity);

        // Update inventory quantity
        await inventoryRef.doc(itemId).update({
            quantity: newQuantity,
            updatedAt: new Date(),
            lastUpdated: new Date().toISOString()
        });

        // Log the stock out
        await stockOutRef.add({
            itemId: itemId,
            itemName: itemData.name,
            quantityOut: quantity,
            previousQuantity: currentQuantity,
            newQuantity: newQuantity,
            reason: reason,
            notes: notes,
            date: new Date(),
            recordedBy: 'user'
        });

        return { success: true, newQuantity: newQuantity };
    } catch (error) {
        console.error('Error recording stock out:', error);
        throw error;
    }
}

/**
 * Get stock in history
 * @param {string} itemId - Optional item ID to filter by
 * @param {number} limit - Maximum number of records to return
 */
export async function getStockInHistory(itemId = null, limit = 50) {
    try {
        let query = sdk.db.collection("StockIn").orderBy("date", "desc");
        
        if (itemId) {
            query = query.where("itemId", "==", itemId);
        }
        
        if (limit) {
            query = query.limit(limit);
        }
        
        const stockInSnapshot = await query.get();
        return stockInSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
        }));
    } catch (error) {
        console.error('Error getting stock in history:', error);
        return [];
    }
}

/**
 * Get stock out history
 * @param {string} itemId - Optional item ID to filter by
 * @param {number} limit - Maximum number of records to return
 */
export async function getStockOutHistory(itemId = null, limit = 50) {
    try {
        let query = sdk.db.collection("StockOut").orderBy("date", "desc");
        
        if (itemId) {
            query = query.where("itemId", "==", itemId);
        }
        
        if (limit) {
            query = query.limit(limit);
        }
        
        const stockOutSnapshot = await query.get();
        return stockOutSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
        }));
    } catch (error) {
        console.error('Error getting stock out history:', error);
        return [];
    }
}

/**
 * Get stock summary with low stock alerts
 */
export async function getStockSummary() {
    try {
        const inventorySnapshot = await sdk.db.collection("Inventory").get();
        const summary = [];

        for (const doc of inventorySnapshot.docs) {
            const data = doc.data();
            const currentQuantity = Number(data.quantity || 0);
            const minQuantity = Number(data.minQuantity || 0);
            
            summary.push({
                id: doc.id,
                name: data.name,
                quantity: currentQuantity,
                minQuantity: minQuantity,
                unit: data.unit,
                location: data.location || 'main',
                status: currentQuantity > minQuantity ? 'In Stock' : 'Low Stock',
                daysUntilExpiry: data.expiryDate ? Math.ceil((new Date(data.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)) : null,
                vendor: data.vendorName,
                costPerUnit: data.perKgCost
            });
        }

        return summary;
    } catch (error) {
        console.error('Error getting stock summary:', error);
        throw error;
    }
}

/**
 * Stock in recording for products (for purchases, returns, etc.)
 * @param {string} productId - The ID of the product
 * @param {number} quantity - Quantity to add
 * @param {string} reason - Reason for stock in
 * @param {string} notes - Additional notes
 */
export async function productStockIn(productId, quantity, reason = 'Stock Adjustment', notes = '') {
    try {
        // Validate inputs
        if (!productId) {
            throw new Error('Product ID is required');
        }
        
        if (!quantity || quantity <= 0) {
            throw new Error('Quantity must be greater than zero');
        }
        
        // Validate SDK availability
        if (!sdk || !sdk.db) {
            throw new Error('Database connection not available');
        }
        
        const productRef = sdk.db.collection("Product");
        const stockInRef = sdk.db.collection("StockIn");
        
        const productDoc = await productRef.doc(productId).get();
        if (!productDoc.exists) {
            throw new Error('Product not found');
        }

        const productData = productDoc.data();
        const currentStock = Number(productData.stock || 0);
        const newStock = currentStock + quantity;

        // Update product stock
        await productRef.doc(productId).update({
            stock: newStock,
            updatedAt: new Date()
        });

        // Log the stock in
        await stockInRef.add({
            productId: productId,
            productName: productData.title || 'Unknown Product',
            quantityIn: quantity,
            previousQuantity: currentStock,
            newQuantity: newStock,
            reason: reason,
            notes: notes,
            date: new Date(),
            recordedBy: 'user',
            itemType: 'product'
        });

        return { success: true, newStock: newStock };
    } catch (error) {
        console.error('Error recording product stock in:', error);
        throw error;
    }
}

/**
 * Stock out recording for products (for waste, spoilage, etc.)
 * @param {string} productId - The ID of the product
 * @param {number} quantity - Quantity to remove
 * @param {string} reason - Reason for stock out
 * @param {string} notes - Additional notes
 */
export async function productStockOut(productId, quantity, reason = 'Waste', notes = '') {
    try {
        // Validate inputs
        if (!productId) {
            throw new Error('Product ID is required');
        }
        
        if (!quantity || quantity <= 0) {
            throw new Error('Quantity must be greater than zero');
        }
        
        // Validate SDK availability
        if (!sdk || !sdk.db) {
            throw new Error('Database connection not available');
        }
        
        const productRef = sdk.db.collection("Product");
        const stockOutRef = sdk.db.collection("StockOut");
        
        const productDoc = await productRef.doc(productId).get();
        if (!productDoc.exists) {
            throw new Error('Product not found');
        }

        const productData = productDoc.data();
        const currentStock = Number(productData.stock || 0);
        
        // Validate against current stock
        if (quantity > currentStock) {
            throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`);
        }

        const newStock = Math.max(0, currentStock - quantity);

        // Update product stock
        await productRef.doc(productId).update({
            stock: newStock,
            updatedAt: new Date()
        });

        // Log the stock out
        await stockOutRef.add({
            productId: productId,
            productName: productData.title || 'Unknown Product',
            quantityOut: quantity,
            previousQuantity: currentStock,
            newQuantity: newStock,
            reason: reason,
            notes: notes,
            date: new Date(),
            recordedBy: 'user',
            itemType: 'product'
        });

        return { success: true, newStock: newStock };
    } catch (error) {
        console.error('Error recording product stock out:', error);
        throw error;
    }
}


















