import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { productStockIn, productStockOut } from '../utils/enhancedInventory.js';
import { validateMultipleStockDeductions, safeBulkStockDeduction } from '../utils/stockValidation.js';

export function StockManagementOptionsModal({ isOpen, onClose, product, refreshProducts }) {
    const [selectedOption, setSelectedOption] = useState(null);
    const [formData, setFormData] = useState({
        quantity: 0,
        reason: 'Stock Adjustment',
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    const [recipeItems, setRecipeItems] = useState([]);

    // Load recipe items when product changes
    useEffect(() => {
        if (product && product.recipe) {
            setRecipeItems(product.recipe);
        }
    }, [product]);

    // Reset form when modal opens or option changes
    useEffect(() => {
        if (isOpen) {
            setSelectedOption(null);
            setFormData({
                quantity: 0,
                reason: 'Stock Adjustment',
                notes: ''
            });
        }
    }, [isOpen]);

    const handleOptionSelect = (option) => {
        setSelectedOption(option);
        // Set default reason based on option
        if (option === 'add') {
            setFormData(prev => ({ ...prev, reason: 'Stock Addition' }));
        } else if (option === 'dispose') {
            setFormData(prev => ({ ...prev, reason: 'Waste' }));
        } else if (option === 'update') {
            setFormData(prev => ({ ...prev, reason: 'Stock Update' }));
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // Deduct inventory for recipe items based on quantity
    const deductInventoryForRecipe = async (quantityToDeduct) => {
        // Check if SDK is available
        if (!sdk || !sdk.db) {
            return { success: false, message: 'Database connection not available. Please refresh the page.' };
        }
        
        if (!recipeItems || recipeItems.length === 0) {
            console.log('No recipe items to process');
            return { success: true };
        }

        // Prepare deductions for validation - only for the added quantity
        const deductions = recipeItems
            .filter(item => item && item.name && item.quantity && item.quantity > 0)
            .map(recipeItem => ({
                itemName: recipeItem.name ? recipeItem.name.trim() : '',
                quantity: (Number(recipeItem.quantity) || 0) * (Number(quantityToDeduct) || 0),
                reason: `Recipe deduction for ${quantityToDeduct} units of ${product?.title || 'product'}`
            }))
            .filter(deduction => deduction.itemName && deduction.quantity > 0); // Filter out invalid deductions

        if (deductions.length === 0) {
            console.log('No valid recipe items to process');
            return { success: true };
        }

        try {
            // Use safe bulk deduction with validation
            const result = await safeBulkStockDeduction(deductions);
            
            // Check if the result has the expected structure
            if (!result) {
                return { success: false, message: 'Failed to deduct recipe items from inventory. Please check your inventory levels.' };
            }
            
            if (result.success) {
                // Log successful deductions
                if (result.results && Array.isArray(result.results)) {
                    result.results.forEach(res => {
                        if (res.success) {
                            console.log(`Successfully deducted ${res.requested} units of ${res.item}. New stock: ${res.newQuantity}`);
                        }
                    });
                }
                
                console.log('Recipe inventory deduction completed successfully');
                return { success: true };
            } else {
                console.error('Recipe inventory deduction failed:', result.message || result);
                
                // Create user-friendly error message with specific details
                let userFriendlyMessage = 'Failed to deduct recipe items from inventory. Please check your inventory levels.';
                
                // Handle different result structures
                if (result.message && typeof result.message === 'string') {
                    userFriendlyMessage = result.message;
                } else if (result.results && Array.isArray(result.results)) {
                    const failureMessages = result.results
                        .filter(res => !res.success)
                        .map(res => {
                            // Handle different result item structures
                            if (res.message) {
                                return res.message;
                            } else if (res.item) {
                                return `"${res.item}": Available: ${res.currentStock || res.newQuantity || 0}, Required: ${res.requestedQuantity || res.requested || 0}`;
                            } else {
                                return 'Unknown item';
                            }
                        });
                    
                    if (failureMessages.length > 0) {
                        userFriendlyMessage = "Sorry, inventory is low. Please stock the required ingredients first.";
                    }
                }
                    
                return { success: false, message: userFriendlyMessage };
            }
            
        } catch (error) {
            console.error('Error in recipe inventory deduction:', error);
            // Provide a more user-friendly error message
            let errorMessage = 'An unexpected error occurred while deducting recipe inventory.';
            
            if (error && error.message) {
                errorMessage = error.message;
            }
            
            if (errorMessage.includes('not found')) {
                errorMessage = 'Sorry, some recipe ingredients are not available in your inventory. Please stock them first.';
            } else if (errorMessage.includes('Insufficient stock')) {
                errorMessage = 'Sorry, inventory is low. Please stock the required ingredients first.';
            }
            
            return { success: false, message: errorMessage };
        }
    };

    const handleSubmit = async () => {
        try {
            // Validate inputs
            if (!product || !product.id) {
                showToast('Product information is missing', 'error');
                return;
            }
            
            // Validate quantity input
            if (formData.quantity <= 0) {
                showToast('Please enter a valid quantity', 'error');
                return;
            }

            // Check if SDK is available
            if (!sdk || !sdk.db) {
                showToast('Database connection not available. Please refresh the page.', 'error');
                return;
            }

            setLoading(true);

            if (selectedOption === 'add') {
                // Add stock - only deduct recipe items for the added quantity
                const currentStock = product.stock || 0;
                const quantityToAdd = formData.quantity;
                
                // Deduct inventory for recipe items based on added quantity only
                if (recipeItems && recipeItems.length > 0) {
                    try {
                        const deductionResult = await deductInventoryForRecipe(quantityToAdd);
                        if (!deductionResult.success) {
                            showToast(deductionResult.message, 'error');
                            setLoading(false);
                            return;
                        }
                    } catch (deductionError) {
                        console.error('Error during recipe deduction:', deductionError);
                        showToast('Sorry, inventory is low. Please stock the required ingredients first.', 'error');
                        setLoading(false);
                        return;
                    }
                }
                
                // Add the stock to product
                await productStockIn(product.id, quantityToAdd, formData.reason, formData.notes);
                showToast(`Successfully added ${quantityToAdd} units to stock`, 'success');
                
            } else if (selectedOption === 'update') {
                // Update stock - dispose current stock and add new stock
                const currentStock = product.stock || 0;
                const newStock = formData.quantity;
                const difference = newStock - currentStock;
                
                if (difference > 0) {
                    // Need to add stock - deduct recipe items for the difference
                    if (recipeItems && recipeItems.length > 0) {
                        try {
                            const deductionResult = await deductInventoryForRecipe(difference);
                            if (!deductionResult.success) {
                                showToast(deductionResult.message, 'error');
                                setLoading(false);
                                return;
                            }
                        } catch (deductionError) {
                            console.error('Error during recipe deduction:', deductionError);
                            showToast('Sorry, inventory is low. Please stock the required ingredients first.', 'error');
                            setLoading(false);
                            return;
                        }
                    }
                    await productStockIn(product.id, difference, formData.reason, formData.notes);
                } else if (difference < 0) {
                    // Need to remove stock - dispose the excess
                    const quantityToRemove = Math.abs(difference);
                    await productStockOut(product.id, quantityToRemove, formData.reason, formData.notes);
                }
                // If difference is 0, no action needed
                
                showToast(`Stock updated to ${newStock} units`, 'success');
                
            } else if (selectedOption === 'dispose') {
                // Dispose to wastage - remove specified quantity
                const quantityToDispose = formData.quantity;
                const currentStock = product.stock || 0;
                
                if (quantityToDispose > currentStock) {
                    showToast(`Cannot dispose ${quantityToDispose} units. Only ${currentStock} units available.`, 'error');
                    setLoading(false);
                    return;
                }
                
                await productStockOut(product.id, quantityToDispose, formData.reason, formData.notes);
                showToast(`Disposed ${quantityToDispose} units to wastage`, 'success');
            }

            onClose();
            
            // Refresh products
            if (refreshProducts && typeof refreshProducts === 'function') {
                refreshProducts();
            }
        } catch (error) {
            console.error('Error managing stock:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                product: product,
                selectedOption: selectedOption,
                formData: formData
            });
            
            // Provide more user-friendly error messages
            let errorMessage = error.message || 'Failed to manage stock. Please try again.';
            
            // Check for specific error conditions and provide better messages
            if (errorMessage.includes('Sorry, inventory is low')) {
                errorMessage = 'Sorry, inventory is low. Please stock the required ingredients first.';
            } else if (errorMessage.includes('not available in your inventory')) {
                errorMessage = 'Sorry, some recipe ingredients are not available in your inventory. Please stock them first.';
            } else if (errorMessage.includes('Failed to deduct recipe items')) {
                errorMessage = 'Sorry, inventory is low. Please stock the required ingredients first.';
            }
            
            showToast(errorMessage, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">
                            {selectedOption ? 
                                selectedOption === 'add' ? 'Add Stock' :
                                selectedOption === 'update' ? 'Update Stock' : 'Dispose Stock'
                                : 'Stock Management'}
                        </h2>
                        <p className="text-xs text-gray-600 mt-0.5">
                            {selectedOption ? 'Manage product inventory' : 'Select an action for ' + (product?.title || 'product')}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white hover:bg-gray-100 transition-colors shadow-sm"
                    >
                        <i className="ph ph-x text-gray-600 text-base"></i>
                    </button>
                </div>

                <div className="p-3">
                    {!selectedOption ? (
                        // Main options menu
                        <div className="space-y-3">
                            <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                                <h3 className="font-semibold text-gray-800 text-sm mb-1">Product: {product?.title || 'Unknown'}</h3>
                                <div className="flex items-center text-xs text-gray-600">
                                    <span className="font-medium">Current Stock:</span>
                                    <span className="ml-2 px-1.5 py-0.5 bg-white rounded font-semibold">
                                        {product?.stock || 0} units
                                    </span>
                                </div>
                                
                                {/* Show recipe items if available */}
                                {recipeItems && recipeItems.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-200">
                                        <h4 className="font-medium text-gray-700 mb-1 text-xs">Recipe Items:</h4>
                                        <div className="grid grid-cols-1 gap-1">
                                            {recipeItems.map((item, index) => (
                                                <div key={index} className="flex justify-between text-xs bg-white p-1.5 rounded">
                                                    <span>{item.name || 'Unknown item'}</span>
                                                    <span className="font-medium">{item.quantity || 0} per unit</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => handleOptionSelect('add')}
                                    className="p-3 text-left bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 rounded-lg border border-green-200 transition-all hover:shadow-sm flex flex-col items-center group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center mb-1.5 group-hover:bg-green-200 transition-colors">
                                        <i className="ph ph-plus-circle text-green-600 text-base"></i>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-medium text-gray-800 text-xs">Add Stocks</div>
                                        <div className="text-[10px] text-gray-600 mt-0.5">Increase stock</div>
                                    </div>
                                </button>
                                
                                <button
                                    onClick={() => handleOptionSelect('update')}
                                    className="p-3 text-left bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 rounded-lg border border-blue-200 transition-all hover:shadow-sm flex flex-col items-center group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-1.5 group-hover:bg-blue-200 transition-colors">
                                        <i className="ph ph-arrows-clockwise text-blue-600 text-base"></i>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-medium text-gray-800 text-xs">Update Stocks</div>
                                        <div className="text-[10px] text-gray-600 mt-0.5">Set quantity</div>
                                    </div>
                                </button>
                                
                                <button
                                    onClick={() => handleOptionSelect('dispose')}
                                    className="p-3 text-left bg-gradient-to-r from-red-50 to-orange-50 hover:from-red-100 hover:to-orange-100 rounded-lg border border-red-200 transition-all hover:shadow-sm flex flex-col items-center group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center mb-1.5 group-hover:bg-red-200 transition-colors">
                                        <i className="ph ph-trash text-red-600 text-base"></i>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-medium text-gray-800 text-xs">Dispose</div>
                                        <div className="text-[10px] text-gray-600 mt-0.5">To wastage</div>
                                    </div>
                                </button>
                            </div>
                            
                            {/* Cancel Button */}
                            <div className="pt-2">
                                <button
                                    onClick={onClose}
                                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs"
                                >
                                    <i className="ph ph-x-circle text-xs"></i>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        // Form for selected option
                        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-3">
                            <div className="mb-2 p-3 bg-gray-50 rounded-lg">
                                <h3 className="font-semibold text-gray-800 text-sm mb-1">Product: {product?.title || 'Unknown'}</h3>
                                <div className="flex items-center text-xs text-gray-600">
                                    <span className="font-medium">Current Stock:</span>
                                    <span className="ml-2 px-1.5 py-0.5 bg-white rounded font-semibold">
                                        {product?.stock || 0} units
                                    </span>
                                </div>
                            </div>

                            {/* Quantity */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                    {selectedOption === 'add' ? 'Quantity to Add' : 
                                     selectedOption === 'update' ? 'New Stock Quantity' : 
                                     'Quantity to Dispose'} *
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={formData.quantity}
                                        onChange={(e) => handleInputChange('quantity', Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent text-sm"
                                        min="0"
                                        step="1"
                                        required
                                    />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                        <span className="text-gray-500 text-xs">units</span>
                                    </div>
                                </div>
                                
                                {/* Show preview for update option */}
                                {selectedOption === 'update' && (
                                    <div className="mt-1.5 text-xs text-gray-600">
                                        <div className="flex justify-between py-1 border-b border-gray-100">
                                            <span>Current:</span>
                                            <span className="font-medium">{product?.stock || 0} units</span>
                                        </div>
                                        <div className="flex justify-between py-1">
                                            <span>New:</span>
                                            <span className="font-medium">{formData.quantity} units</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-t border-gray-200 mt-1 pt-1">
                                            <span className="font-medium">Difference:</span>
                                            <span className={`font-bold ${formData.quantity - (product?.stock || 0) > 0 ? 'text-green-600' : formData.quantity - (product?.stock || 0) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                                {formData.quantity - (product?.stock || 0) > 0 ? '+' : ''}{formData.quantity - (product?.stock || 0)} units
                                            </span>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Show warning for dispose option */}
                                {selectedOption === 'dispose' && (
                                    <div className="mt-1.5 p-1.5 bg-amber-50 rounded border border-amber-200">
                                        <div className="flex items-start">
                                            <i className="ph ph-warning text-amber-600 text-xs mt-0.5 mr-1"></i>
                                            <div className="text-[10px] text-amber-800">
                                                This will remove {formData.quantity} units from inventory.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Reason */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                    Reason *
                                </label>
                                <select
                                    value={formData.reason}
                                    onChange={(e) => handleInputChange('reason', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent text-xs"
                                    required
                                >
                                    {selectedOption === 'add' ? (
                                        <>
                                            <option value="Stock Addition">Stock Addition</option>
                                            <option value="Purchase">Purchase</option>
                                            <option value="Return">Return</option>
                                            <option value="Other">Other</option>
                                        </>
                                    ) : selectedOption === 'dispose' ? (
                                        <>
                                            <option value="Waste">Waste</option>
                                            <option value="Spoilage">Spoilage</option>
                                            <option value="Expired">Expired</option>
                                            <option value="Stock Adjustment">Stock Adjustment</option>
                                            <option value="Other">Other</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Stock Update">Stock Update</option>
                                            <option value="Inventory Count">Inventory Count</option>
                                            <option value="Stock Adjustment">Stock Adjustment</option>
                                            <option value="Other">Other</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                    Notes (Optional)
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => handleInputChange('notes', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent text-xs"
                                    rows={2}
                                    placeholder="Add notes..."
                                />
                            </div>

                            {/* Recipe Info for Add/Update */}
                            {(selectedOption === 'add' || selectedOption === 'update') && recipeItems && recipeItems.length > 0 && (
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center mb-1.5">
                                        <i className="ph ph-info text-blue-500 text-xs mr-1.5"></i>
                                        <div className="text-xs font-semibold text-gray-800">Recipe Deduction</div>
                                    </div>
                                    <div className="text-[10px] text-gray-700 mb-1.5">
                                        {selectedOption === 'add' 
                                            ? `Adding ${formData.quantity} units will deduct:`
                                            : `Updating will ${formData.quantity - (product?.stock || 0) > 0 ? 'add' : 'remove'} ingredients:`
                                        }
                                    </div>
                                    <div className="grid grid-cols-1 gap-1">
                                        {recipeItems.map((item, index) => {
                                            const quantityToDeduct = selectedOption === 'add' 
                                                ? (Number(item.quantity) || 0) * (Number(formData.quantity) || 0)
                                                : (Number(item.quantity) || 0) * Math.abs(formData.quantity - (product?.stock || 0));
                                            return (
                                                <div key={index} className="flex justify-between bg-white p-1 rounded text-[10px]">
                                                    <span>{item.name || 'Unknown item'}</span>
                                                    <span className="font-medium">{quantityToDeduct.toFixed(2)} {item.unit || ''}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-2 pt-1.5">
                                <button
                                    type="button"
                                    onClick={() => setSelectedOption(null)}
                                    className="px-3 py-2 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs"
                                    disabled={loading}
                                >
                                    <i className="ph ph-arrow-left text-xs"></i>
                                    Back
                                </button>
                                <button
                                    type="submit"
                                    className="px-3 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs shadow-sm hover:shadow"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <i className={`ph ph-${selectedOption === 'add' ? 'plus' : selectedOption === 'update' ? 'arrows-clockwise' : 'trash'}-circle text-xs`}></i>
                                            {selectedOption === 'add' ? 'Add Stock' : 
                                             selectedOption === 'update' ? 'Update Stock' : 'Dispose Stock'}
                                        </>
                                    )}
                                </button>
                            </div>
                            
                            {/* Cancel Button */}
                            <div className="pt-1.5">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs"
                                >
                                    <i className="ph ph-x-circle text-xs"></i>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}