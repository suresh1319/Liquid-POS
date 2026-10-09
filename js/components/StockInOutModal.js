import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { stockIn, stockOut } from '../utils/enhancedInventory.js';
import { validatePositiveQuantity, validateStockDeduction } from '../utils/stockValidation.js';

export function StockInOutModal({ isOpen, onClose, item, type = 'in' }) {
    const [formData, setFormData] = useState({
        quantity: 0,
        reason: type === 'in' ? 'Purchase' : 'End of Day Stock Update',
        notes: '',
        costPerUnit: 0
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            setFormData({
                quantity: 0,
                reason: type === 'in' ? 'Purchase' : 'End of Day Stock Update',
                notes: '',
                costPerUnit: item.perKgCost || 0
            });
        }
    }, [isOpen, item, type]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmit = async () => {
        try {
            // Validate quantity input
            const quantityValidation = validatePositiveQuantity(formData.quantity, type === 'out' ? 'utilized quantity' : 'quantity');
            if (!quantityValidation.valid) {
                showToast(quantityValidation.message, 'error');
                return;
            }
            
            // For stock out operations, validate the utilized quantity doesn't exceed current stock
            if (type === 'out') {
                if (formData.quantity > item.quantity) {
                    showToast(`Utilized quantity (${formData.quantity}) cannot exceed current stock (${item.quantity})`, 'error');
                    return;
                }
            }

            setLoading(true);

            if (type === 'in') {
                await stockIn(item.id, formData.quantity, formData.reason, formData.notes, formData.costPerUnit);
                showToast('Stock added successfully', 'success');
            } else {
                // For stock out, the quantity entered is what was utilized
                // We deduct it from the current stock to get remaining stock
                await stockOut(item.id, formData.quantity, formData.reason, formData.notes);
                const remainingStock = item.quantity - formData.quantity;
                showToast(`Stock updated successfully. Utilized: ${formData.quantity} ${item.unit}, Remaining: ${remainingStock.toFixed(2)} ${item.unit}`, 'success');
            }

            onClose();
            
            // Refresh the page to show updated inventory
            if (window.refreshProducts) {
                window.refreshProducts();
            }
        } catch (error) {
            console.error('Error updating stock:', error);
            const errorMessage = error.message || `Failed to ${type === 'in' ? 'add' : 'update'} stock`;
            showToast(errorMessage, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !item) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {type === 'in' ? 'Add Stock' : 'End of Day Stock Update'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <i className="ph ph-x text-xl"></i>
                    </button>
                </div>

                <div className="p-6">
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <h3 className="font-medium text-gray-800 mb-2">Item Details</h3>
                        <div className="text-sm text-gray-600">
                            <div><span className="font-medium">Name:</span> {item.name}</div>
                            <div><span className="font-medium">Current Stock:</span> {item.quantity} {item.unit}</div>
                            <div><span className="font-medium">Location:</span> {item.location || 'Main'}</div>
                        </div>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
                        {/* Quantity */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {type === 'in' ? 'Quantity to Add *' : 'Stock Utilized Today *'}
                            </label>
                            <input
                                type="number"
                                value={formData.quantity}
                                onChange={(e) => handleInputChange('quantity', Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                min="0.01"
                                step="0.01"
                                required
                                placeholder={type === 'out' ? `Enter quantity used (max: ${item.quantity})` : ''}
                            />
                            {type === 'out' && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Enter how much stock was utilized at the end of the day
                                </p>
                            )}
                        </div>

                        {/* Reason */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Reason *
                            </label>
                            <select
                                value={formData.reason}
                                onChange={(e) => handleInputChange('reason', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                required
                            >
                                {type === 'in' ? (
                                    <>
                                        <option value="Purchase">Purchase</option>
                                        <option value="Return">Return</option>
                                        <option value="Stock Adjustment">Stock Adjustment</option>
                                        <option value="Other">Other</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="End of Day Stock Update">End of Day Stock Update</option>
                                        <option value="Daily Usage">Daily Usage</option>
                                        <option value="Waste">Waste</option>
                                        <option value="Spoilage">Spoilage</option>
                                        <option value="Expired">Expired</option>
                                        <option value="Stock Adjustment">Stock Adjustment</option>
                                        <option value="Other">Other</option>
                                    </>
                                )}
                            </select>
                        </div>

                        {/* Cost per unit (only for stock in) */}
                        {type === 'in' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Cost per Unit (Optional)
                                </label>
                                <input
                                    type="number"
                                    value={formData.costPerUnit}
                                    onChange={(e) => handleInputChange('costPerUnit', Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        )}

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
                                placeholder="Add any notes about this transaction..."
                            />
                        </div>

                        {/* Stock calculation summary */}
                        <div className="p-3 bg-blue-50 rounded-lg space-y-2">
                            {type === 'out' ? (
                                <>
                                    <div className="text-sm text-gray-700">
                                        <span className="font-medium">Current Stock:</span>{' '}
                                        <span className="text-blue-600 font-semibold">{item.quantity.toFixed(2)} {item.unit}</span>
                                    </div>
                                    <div className="text-sm text-gray-700">
                                        <span className="font-medium">Stock Utilized:</span>{' '}
                                        <span className="text-orange-600 font-semibold">{formData.quantity.toFixed(2)} {item.unit}</span>
                                    </div>
                                    <div className="border-t border-blue-200 pt-2 mt-2">
                                        <span className="font-medium text-sm text-gray-700">Remaining Stock:</span>{' '}
                                        <span className="text-green-600 font-bold text-lg">
                                            {Math.max(0, item.quantity - formData.quantity).toFixed(2)} {item.unit}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm text-gray-700">
                                    <span className="font-medium">Expected New Stock:</span>{' '}
                                    <span className="text-green-600 font-semibold">
                                        {(item.quantity + formData.quantity).toFixed(2)} {item.unit}
                                    </span>
                                </div>
                            )}
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
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <i className={`ph ph-${type === 'in' ? 'plus' : 'check'}-circle`}></i>
                                        {type === 'in' ? 'Add Stock' : 'Update Stock'}
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