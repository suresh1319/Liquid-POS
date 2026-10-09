import { sdk } from '../sdk.js';
import { Product } from '../models/Product.js';
import { validateMultipleStockDeductions, safeBulkStockDeduction } from './stockValidation.js';

const FieldValue = (function() {
  try {
    if (sdk && sdk.FieldValue) return sdk.FieldValue;
    if (sdk && sdk.db && sdk.db.FieldValue) return sdk.db.FieldValue;
    if (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue) {
      return firebase.firestore.FieldValue;
    }
  } catch (e) {}
  return { increment: () => { throw new Error('FieldValue.increment not available'); } };
})();

function convertQuantityToInventoryUnit(recipeQty, recipeUnit = '', inventoryUnit = '') {
  const r = recipeUnit.toLowerCase();
  const i = inventoryUnit.toLowerCase();
  const toBase = (q,u) => {
    if (['kg','kilogram','kilograms'].includes(u)) return q*1000;
    if (['g','gm','gram','grams'].includes(u)) return q;
    if (['ltr','l','liter','litre'].includes(u)) return q*1000;
    if (['ml','milliliter','millilitre'].includes(u)) return q;
    if (['pc','pcs','unit','piece'].includes(u)) return q;
    return q;
  };
  if (['kg','g','gm'].includes(r) && ['kg','g','gm'].includes(i)) {
    const base = toBase(recipeQty,r); return i==='kg'? base/1000 : base;
  }
  if (['ltr','ml','l'].includes(r) && ['ltr','ml','l'].includes(i)) {
    const base = toBase(recipeQty,r); return (i==='ltr'||i==='l')? base/1000: base;
  }
  return recipeQty;
}


/**
 * Deducts inventory for the items in a completed order.
 * @param {object} cart - The cart object containing the items of the order.
 */
export async function deductInventoryForOrder(cart) {
    console.log("Starting inventory deduction for order...");
    const inventoryRef = sdk.db.collection("Inventory");
    const productsRef = sdk.db.collection("Product"); // Fixed: Use 'Product' (singular) not 'Products'

    for (const cartItem of Object.values(cart)) {
        const productInCart = cartItem.product;
        const quantitySold = cartItem.quantity;

        if (!productInCart || !productInCart.id) {
            console.warn("Cart item is missing product data. Skipping.", cartItem);
            continue;
        }

        try {
            // Use the product data passed from checkout, but fetch from database if needed
            let fullProduct;
            // Try multiple field names for recipe items (recipe, recipeItems, recipeList)
            let recipeItems = productInCart.recipeItems || productInCart.recipe || productInCart.recipeList || [];
            
            // Log the cart item for debugging
            console.log(`[DEBUG] Processing cart item:`, {
                productId: productInCart.id,
                productTitle: productInCart.title,
                inventoryDeductionMode: productInCart.inventoryDeductionMode,
                hasRecipeInCart: !!(productInCart.recipe || productInCart.recipeItems || productInCart.recipeList),
                recipeItemsCount: recipeItems ? recipeItems.length : 0,
                recipeData: recipeItems
            });
            
            // If we don't have recipe items in the cart data, fetch from database
            if (!recipeItems || recipeItems.length === 0) {
                console.log(`[DEBUG] No recipe items in cart data for ${productInCart.title}, fetching from database...`);
                const productDoc = await productsRef.doc(productInCart.id).get();
                if (!productDoc.exists) {
                    console.warn(`Product with ID ${productInCart.id} not found in Products collection. Skipping inventory deduction for this item.`);
                    continue;
                }
                
                const productData = productDoc.data();
                console.log(`[DEBUG] Product data from database:`, productData);
                
                // Validate product data
                if (!productData) {
                    console.warn(`Product data is null or undefined for ID ${productInCart.id}. Skipping.`);
                    continue;
                }
                
                fullProduct = new Product(productData);
                
                // Try all possible field names for recipe items
                recipeItems = fullProduct.recipeItems || fullProduct.recipe || fullProduct.recipeList || 
                             productData.recipeItems || productData.recipe || productData.recipeList || [];
                
                console.log(`[DEBUG] Recipe items from database:`, recipeItems);
            } else {
                // Create a product instance from the cart data
                fullProduct = new Product(productInCart);
                // Recipe items already extracted at the top, so just validate them
                console.log(`[DEBUG] Using recipe items from cart data for ${productInCart.title}`);
                console.log(`[DEBUG] Recipe items from cart:`, recipeItems);
            }

            // Validate that we have recipe items
            if (!recipeItems || !Array.isArray(recipeItems)) {
                console.log(`[DEBUG] Invalid recipe items format for ${fullProduct.title || productInCart.title}. Setting to empty array.`);
                recipeItems = [];
            }
            
            // Check inventory deduction mode - only deduct for on-demand products at checkout
            const shouldDeductAtCheckout = (fullProduct.inventoryDeductionMode || 'pre-prepared') === 'on-demand';
            
            console.log(`[DEBUG] Inventory deduction mode check:`, {
                mode: fullProduct.inventoryDeductionMode,
                shouldDeduct: shouldDeductAtCheckout
            });
            
            if (!shouldDeductAtCheckout) {
                console.log(`Product ${fullProduct.title} is pre-prepared (mode: ${fullProduct.inventoryDeductionMode}) - inventory already deducted during product save. Skipping checkout deduction.`);
                continue;
            }
            
            // Additional debug logging
            console.log(`[DEBUG] Product ${fullProduct.title}:`);
            console.log(`  - inventoryDeductionMode: ${fullProduct.inventoryDeductionMode}`);
            console.log(`  - recipe field: ${JSON.stringify(fullProduct.recipe)}`);
            console.log(`  - recipeItems getter: ${JSON.stringify(fullProduct.recipeItems)}`);
            console.log(`  - final recipeItems: ${JSON.stringify(recipeItems)}`);

            // Validate recipe items before processing
            if (!recipeItems || !Array.isArray(recipeItems)) {
                console.log(`[DEBUG] Invalid recipe items for ${fullProduct.title}. Expected array, got:`, typeof recipeItems);
                recipeItems = [];
            }
            
            // Filter out any invalid recipe items
            const validRecipeItems = recipeItems.filter(item => 
                item && 
                typeof item === 'object' && 
                item.name && 
                typeof item.name === 'string'
            );
            
            console.log(`[DEBUG] Valid recipe items count: ${validRecipeItems.length}`);

            if (validRecipeItems.length > 0) {
                console.log(`Deducting inventory for ${fullProduct.title} (x${quantitySold})`);
                
                // Prepare deductions for validation
                const deductions = validRecipeItems.map(recipeItem => {
                    // Validate recipe item
                    if (!recipeItem || typeof recipeItem !== 'object') {
                        console.warn(`Invalid recipe item format:`, recipeItem);
                        return null;
                    }
                    
                    const recipeQtyRaw = (Number(recipeItem.quantity) || 0) * (Number(quantitySold) || 1);
                    const inventoryUnit = '';
                    const recipeUnit = recipeItem.unit || '';
                    const requiredQuantity = convertQuantityToInventoryUnit(recipeQtyRaw, recipeUnit, inventoryUnit);
                    
                    console.log(`[DEBUG] Recipe item processing:`, {
                        name: recipeItem.name,
                        quantity: recipeItem.quantity,
                        unit: recipeItem.unit,
                        calculatedQuantity: requiredQuantity
                    });
                    
                    return {
                        itemName: recipeItem.name,
                        quantity: requiredQuantity,
                        reason: `Order deduction for ${fullProduct.title} (x${quantitySold})`
                    };
                }).filter(Boolean); // Remove any null items
                
                // Check if we have any valid deductions
                if (deductions.length === 0) {
                    console.log(`No valid deductions to process for ${fullProduct.title}`);
                    continue;
                }
                
                // Use safe bulk deduction with validation
                const result = await safeBulkStockDeduction(deductions);
                
                if (!result.success) {
                    console.error(`Inventory deduction failed for ${fullProduct.title}:`, result.message);
                    // Log individual failures
                    if (result.results && Array.isArray(result.results)) {
                        result.results.forEach(res => {
                            if (!res.success) {
                                console.error(`- ${res.item}: ${res.message}`);
                            }
                        });
                    }
                    throw new Error(`Inventory deduction failed: ${result.message}`);
                }
                
                // Log successful deductions
                if (result.results && Array.isArray(result.results)) {
                    result.results.forEach(res => {
                        console.log(`Deducted ${res.requested} units of ${res.item}. New stock: ${res.newQuantity}`);
                    });
                
                    // Log the inventory transactions
                    for (const [index, recipeItem] of validRecipeItems.entries()) {
                        if (index < result.results.length) {
                            const deductionResult = result.results[index];
                            if (deductionResult && deductionResult.success) {
                                // Find the inventory item for logging
                                const querySnapshot = await inventoryRef.where("name", "==", recipeItem.name).get();
                                if (!querySnapshot.empty) {
                                    await logInventoryTransaction(querySnapshot.docs[0].id, 'deduction', deductionResult.requested, fullProduct.title, quantitySold);
                                }
                            }
                        }
                    }
                }
            } else {
                console.log(`Product ${fullProduct.title} has no recipe items. No inventory to deduct.`);
                console.log(`[DEBUG] Available fields: recipe=${JSON.stringify(fullProduct.recipe)}, recipeItems=${JSON.stringify(fullProduct.recipeItems)}`);
            }
        } catch (error) {
            console.error(`[DEBUG] Failed to deduct inventory for product ID ${productInCart.id}`);
            console.error(`[DEBUG] Product data:`, productInCart);
            console.error(`[DEBUG] Error details:`, error);
            console.error(`Failed to deduct inventory for product ID ${productInCart.id}:`, error);
            // For negative stock prevention, we should throw the error to prevent order completion
            // with invalid inventory state
            throw error;
        }
    }
    console.log("Inventory deduction process completed.");
}

/**
 * Deducts inventory for recipe items during product preparation.
 * @param {string} productId - The ID of the product being prepared.
 * @param {number} quantity - The quantity being prepared.
 * @param {string} location - The location where preparation is happening.
 */
export async function deductInventoryForPreparation(productId, quantity, location = 'main') {
    console.log(`Starting inventory deduction for preparation of product ${productId} (x${quantity}) at ${location}`);
    const inventoryRef = sdk.db.collection("Inventory");
    const productsRef = sdk.db.collection("Product"); // Fixed: Use 'Product' (singular) not 'Products'

    try {
        // Fetch the full product document to ensure we have the latest recipe data
        const productDoc = await productsRef.doc(productId).get();
        if (!productDoc.exists) {
            console.warn(`Product with ID ${productId} not found. Skipping inventory deduction for preparation.`);
            return false;
        }
        
        const fullProduct = new Product(productDoc.data());
        let allDeductionsSuccessful = true;

        if (fullProduct.recipeItems && fullProduct.recipeItems.length > 0) {
            // Prepare deductions for validation
            const deductions = fullProduct.recipeItems.map(recipeItem => {
                const recipeQtyRaw = (Number(recipeItem.quantity) || 0) * (Number(quantity) || 1);
                const inventoryUnit = '';
                const recipeUnit = recipeItem.unit || '';
                const requiredQuantity = convertQuantityToInventoryUnit(recipeQtyRaw, recipeUnit, inventoryUnit);
                return {
                    itemName: recipeItem.name,
                    quantity: requiredQuantity,
                    location: location,
                    reason: `Preparation deduction for ${fullProduct.title} (x${quantity})`
                };
            });
            
            // Use safe bulk deduction with validation
            const result = await safeBulkStockDeduction(deductions);
            
            if (!result.success) {
                console.error(`Preparation inventory deduction failed for ${fullProduct.title}:`, result.message);
                allDeductionsSuccessful = false;
                return false;
            }
            
            // Log successful deductions
            result.results.forEach(res => {
                console.log(`Deducted ${res.requested} units of ${res.item} at ${location}. New stock: ${res.newQuantity}`);
            });
            
            // Log the inventory transactions
            for (const [index, recipeItem] of fullProduct.recipeItems.entries()) {
                const deductionResult = result.results[index];
                if (deductionResult && deductionResult.success) {
                    // Find the inventory item for logging
                    const querySnapshot = await inventoryRef
                        .where("name", "==", recipeItem.name)
                        .where("location", "==", location)
                        .get();
                    if (!querySnapshot.empty) {
                        await logInventoryTransaction(querySnapshot.docs[0].id, 'preparation', deductionResult.requested, fullProduct.title, quantity);
                    }
                }
            }
        } else {
            console.log(`Product ${fullProduct.title} has no recipe. No inventory to deduct for preparation.`);
        }

        console.log("Inventory deduction for preparation process completed.");
        return allDeductionsSuccessful;
    } catch (error) {
        console.error(`Failed to deduct inventory for preparation of product ID ${productId}:`, error);
        return false;
    }
}

/**
 * Logs inventory transactions for tracking purposes.
 * @param {string} itemId - The ID of the inventory item.
 * @param {string} type - The type of transaction (deduction, addition, preparation, etc.).
 * @param {number} quantity - The quantity involved in the transaction.
 * @param {string} reference - Reference to the product/order causing the transaction.
 * @param {number} referenceQuantity - The quantity of the reference product.
 */
async function logInventoryTransaction(itemId, type, quantity, reference, referenceQuantity = 1) {
    try {
        const transactionsRef = sdk.db.collection("InventoryTransactions");
        await transactionsRef.add({
            itemId: itemId,
            type: type,
            quantity: quantity,
            reference: reference,
            referenceQuantity: referenceQuantity,
            timestamp: new Date(),
            date: new Date().toISOString().split('T')[0]
        });
    } catch (error) {
        console.error('Failed to log inventory transaction:', error);
    }
}

/**
 * Reverts inventory deductions (for cancelled orders or preparations).
 * @param {object} cart - The cart object containing the items to revert.
 */
export async function revertInventoryDeductions(cart) {
    console.log("Starting inventory deduction reversion...");
    const inventoryRef = sdk.db.collection("Inventory");
    const productsRef = sdk.db.collection("Product"); // Fixed: Use 'Product' (singular) not 'Products'

    for (const cartItem of Object.values(cart)) {
        const productInCart = cartItem.product;
        const quantitySold = cartItem.quantity;

        if (!productInCart || !productInCart.id) {
            console.warn("Cart item is missing product data. Skipping.", cartItem);
            continue;
        }

        try {
            // Fetch the full product document to ensure we have the latest recipe data
            const productDoc = await productsRef.doc(productInCart.id).get();
            if (!productDoc.exists) {
                console.warn(`Product with ID ${productInCart.id} not found. Skipping inventory reversion for this item.`);
                continue;
            }
            
            const fullProduct = new Product(productDoc.data());

            // Check inventory deduction mode - only revert for on-demand products
            const shouldRevertAtCheckout = fullProduct.inventoryDeductionMode === 'on-demand';
            
            if (!shouldRevertAtCheckout) {
                console.log(`Product ${fullProduct.title} is pre-prepared (mode: ${fullProduct.inventoryDeductionMode}) - inventory was deducted during product save, not at checkout. Skipping reversion.`);
                continue;
            }

            if (fullProduct.recipeItems && fullProduct.recipeItems.length > 0) {
                console.log(`Reverting inventory deduction for ${fullProduct.title} (x${quantitySold})`);
                
                // For reversals, we add back the quantities (no validation needed for adding)
                for (const recipeItem of fullProduct.recipeItems) {
                    const recipeQtyRaw = (Number(recipeItem.quantity) || 0) * (Number(quantitySold) || 1);
                    const inventoryUnit = '';
                    const recipeUnit = recipeItem.unit || '';
                    const requiredQuantity = convertQuantityToInventoryUnit(recipeQtyRaw, recipeUnit, inventoryUnit);
                    const inventoryItemName = recipeItem.name;

                    // Find the inventory item by name.
                    const querySnapshot = await inventoryRef.where("name", "==", inventoryItemName).get();

                    if (querySnapshot.empty) {
                        console.warn(`Inventory item "${inventoryItemName}" not found for product "${fullProduct.title}". Cannot revert stock.`);
                        continue;
                    }

                    // Assuming only one inventory item will match the name
                    const inventoryDoc = querySnapshot.docs[0];
                    
                    // Use Firestore transaction for atomic update
                    const invRef = inventoryRef.doc(inventoryDoc.id);
                    await sdk.db.runTransaction(async (tx) => {
                        const snap = await tx.get(invRef);
                        if (!snap.exists) throw new Error('Inventory doc disappeared');
                        tx.update(invRef, {
                            quantity: FieldValue.increment(requiredQuantity),
                            updatedAt: new Date(),
                            lastUpdated: new Date().toISOString()
                        });
                    });

                    // Log the inventory transaction
                    await logInventoryTransaction(inventoryDoc.id, 'reversal', requiredQuantity, fullProduct.title, quantitySold);

                    console.log(`Reverted ${requiredQuantity} units of ${inventoryItemName}.`);
                }
            } else {
                console.log(`Product ${fullProduct.title} has no recipe. No inventory to revert.`);
            }
        } catch (error) {
            console.error(`Failed to revert inventory for product ID ${productInCart.id}:`, error);
        }
    }
    console.log("Inventory deduction reversion process completed.");
}
