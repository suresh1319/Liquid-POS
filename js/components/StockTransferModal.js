import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { locationService } from '../utils/locationService.js';
import { validatePositiveQuantity, validateStockDeduction } from '../utils/stockValidation.js';
import { InventoryItem } from '../models/Product.js';
// Import the enhanced transfer function
import { transferInventoryBetweenLocations } from '../utils/enhancedInventory.js';

export function StockTransferModal({ isOpen, onClose, sourceLocation, availableItems }) {
    const [formData, setFormData] = useState({
        fromLocation: sourceLocation || 'main',
        toLocation: '',
        selectedItem: '',
        quantity: 0,
        notes: ''
    });
    
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedItemData, setSelectedItemData] = useState(null);

    useEffect(() => {
        if (isOpen && sourceLocation) {
            // Only reset form data if it's a new opening, not when availableItems change
            setFormData(prev => {
                // If we already have a quantity set by user, preserve it
                const shouldPreserveQuantity = prev.quantity > 0 && 
                    prev.quantity <= (availableItems.find(item => item.id === prev.selectedItem)?.quantity || 0);
                
                return {
                    fromLocation: sourceLocation,
                    toLocation: prev.toLocation || '',
                    selectedItem: availableItems.length === 1 ? availableItems[0].id : prev.selectedItem || '',
                    quantity: availableItems.length === 1 ? 
                        (shouldPreserveQuantity ? prev.quantity : availableItems[0].quantity) : 
                        (prev.selectedItem ? prev.quantity : 0),
                    notes: prev.notes || ''
                };
            });
            
            // If there's only one item, set it as selected
            if (availableItems.length === 1) {
                setSelectedItemData(availableItems[0]);
            } else {
                setSelectedItemData(null);
            }
            
            // Load locations from service
            locationService.loadLocations();
        }
    }, [isOpen, sourceLocation, availableItems]);

    // Subscribe to location changes
    useEffect(() => {
        if (isOpen) {
            const unsubscribe = locationService.subscribe((updatedLocations) => {
                setLocations(locationService.getLocationOptions());
            });
            
            return unsubscribe;
        }
    }, [isOpen]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));

        // When item selection changes, update item data but preserve existing quantity if it's valid
        if (field === 'selectedItem' && value) {
            const selectedItem = availableItems.find(item => item.id === value);
            if (selectedItem) {
                setSelectedItemData(selectedItem);
                setFormData(prev => {
                    // Only update quantity if it hasn't been manually changed or if it's invalid
                    const currentQuantity = prev.quantity || 0;
                    const maxQuantity = selectedItem.quantity || 0;
                    const newQuantity = (currentQuantity > 0 && currentQuantity <= maxQuantity) 
                        ? currentQuantity 
                        : maxQuantity;
                    
                    return {
                        ...prev,
                        quantity: newQuantity,
                        selectedItem: value
                    };
                });
            }
        }
    };

    const handleTransfer = async () => {
        try {
            let selectedItem;
            
            // If there's only one item, use it directly
            if (availableItems.length === 1) {
                selectedItem = availableItems[0];
                // Update form data to ensure it's consistent, but preserve user-entered quantity
                setFormData(prev => ({
                    ...prev,
                    selectedItem: selectedItem.id
                    // Don't override quantity here as it may have been manually changed by user
                }));
            } else {
                // For multiple items, validate selection
                if (!formData.selectedItem) {
                    showToast('Please select an item to transfer', 'error');
                    return;
                }
                
                selectedItem = availableItems.find(item => item.id === formData.selectedItem);
                if (!selectedItem) {
                    showToast('Selected item not found', 'error');
                    return;
                }
            }

            if (!formData.toLocation) {
                showToast('Please select destination location', 'error');
                return;
            }

            // Validate transfer quantity
            const quantityValidation = validatePositiveQuantity(formData.quantity, 'transfer quantity');
            if (!quantityValidation.valid) {
                showToast(quantityValidation.message, 'error');
                return;
            }

            // Validate against available stock (pass document ID and location)
            const stockValidation = await validateStockDeduction(selectedItem.id, null, formData.quantity, formData.fromLocation);
            if (!stockValidation.valid) {
                showToast(stockValidation.message, 'error');
                return;
            }

            setLoading(true);

            // Use the enhanced transfer function that properly updates locations
            const transferResult = await transferInventoryBetweenLocations(
                selectedItem.id,
                formData.fromLocation,
                formData.toLocation,
                formData.quantity
            );

            // Log the transfer in the StockTransfers collection for tracking
            await sdk.db.collection("StockTransfers").add({
                itemId: selectedItem.id,
                itemName: selectedItem.name,
                fromLocation: formData.fromLocation,
                toLocation: formData.toLocation,
                quantity: formData.quantity,
                remainingQuantity: transferResult.fromRemaining,
                notes: formData.notes,
                date: new Date(),
                transferredBy: 'user',
                sourceItemDeleted: transferResult.sourceItemDeleted
            });

            // Show appropriate success message
            if (transferResult.sourceItemDeleted) {
                showToast(`Stock transferred successfully. Source item deleted as quantity reached 0.`, 'success');
            } else {
                showToast('Stock transferred successfully', 'success');
            }
            
            onClose();
            
            // Refresh the page to show updated inventory
            if (window.refreshProducts) {
                window.refreshProducts();
            }
        } catch (error) {
            console.error('Error transferring stock:', error);
            showToast('Failed to transfer stock: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !sourceLocation) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800">
                        Transfer Stock from {sourceLocation}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <i className="ph ph-x text-xl"></i>
                    </button>
                </div>

                <div className="p-6">
                    <form onSubmit={(e) => { e.preventDefault(); handleTransfer(); }} className="space-y-4">
                        {/* From Location */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                From Location
                            </label>
                            <select
                                value={formData.fromLocation}
                                onChange={(e) => handleInputChange('fromLocation', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                disabled
                            >
                                {locations.map(location => (
                                    <option key={location.value} value={location.value}>
                                        {location.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Item Selection - only show if there are multiple items */}
                        {availableItems.length > 1 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Select Item to Transfer *
                                </label>
                                <select
                                    value={formData.selectedItem}
                                    onChange={(e) => handleInputChange('selectedItem', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    required
                                >
                                    <option value="">Select an item</option>
                                    {availableItems.map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.name} ({item.quantity} {item.unit})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Selected Item Details */}
                        {selectedItemData && (
                            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                <h3 className="font-medium text-gray-800 mb-2">Item Details</h3>
                                <div className="text-sm text-gray-600">
                                    <div><span className="font-medium">Name:</span> {selectedItemData.name}</div>
                                    <div><span className="font-medium">Available Stock:</span> {selectedItemData.quantity} {selectedItemData.unit}</div>
                                    <div><span className="font-medium">Unit:</span> {selectedItemData.unit}</div>
                                </div>
                            </div>
                        )}

                        {/* To Location */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                To Location *
                            </label>
                            <select
                                value={formData.toLocation}
                                onChange={(e) => handleInputChange('toLocation', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                required
                            >
                                <option value="">Select destination</option>
                                {locations.map(location => (
                                    <option key={location.value} value={location.value}>
                                        {location.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Quantity */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Quantity to Transfer *
                            </label>
                            <input
                                type="number"
                                value={formData.quantity}
                                onChange={(e) => handleInputChange('quantity', Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                min="1"
                                max={selectedItemData ? selectedItemData.quantity : 0}
                                step="0.01"
                                required
                            />
                            {selectedItemData && (
                                <div className="text-xs text-gray-500 mt-1">
                                    Maximum: {selectedItemData.quantity} {selectedItemData.unit}
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Notes (Optional)
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => handleInputChange('notes', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                rows={3}
                                placeholder="Add any notes about this transfer..."
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center gap-2"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                        Transferring...
                                    </>
                                ) : (
                                    <>
                                        <i className="ph ph-arrows-left-right"></i>
                                        Transfer Stock
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}















