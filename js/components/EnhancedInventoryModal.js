import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { InventoryItem } from '../models/Product.js';
import { locationService } from '../utils/locationService.js';
import { validatePositiveQuantity, ensureNonNegativeQuantity } from '../utils/stockValidation.js';

export function EnhancedInventoryModal({ isOpen, onClose, onSave, editItem = null }) {
    const [formData, setFormData] = useState({
        name: '',
        quantity: 0,
        unit: '',
        minQuantity: 0,
        location: 'main',
        expiryDate: '',
        batchNumber: '',
        notes: '',
        vendorName: '',
        vendorCompany: '',
        vendorGst: '',
        vendorContact: '',
        vendorAddress: '',
        perKgCost: 0,
        supplierId: '',
        purchaseOrderId: ''
    });
    
    const [units, setUnits] = useState(['kg', 'g', 'ml', 'l', 'piece', 'packet', 'box', 'dozen']);
    const [customUnit, setCustomUnit] = useState('');
    const [showCustomUnit, setShowCustomUnit] = useState(false);
    const [locations, setLocations] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);

    useEffect(() => {
        if (isOpen) {
            loadData();
            // Load locations from service
            locationService.loadLocations();
            
            if (editItem) {
                setFormData({
                    name: editItem.name,
                    quantity: editItem.quantity,
                    unit: editItem.unit,
                    minQuantity: editItem.minQuantity,
                    location: editItem.location || 'main',
                    expiryDate: editItem.expiryDate || '',
                    batchNumber: editItem.batchNumber || '',
                    notes: editItem.notes || '',
                    vendorName: editItem.vendorName,
                    vendorCompany: editItem.vendorCompany,
                    vendorGst: editItem.vendorGst,
                    vendorContact: editItem.vendorContact,
                    vendorAddress: editItem.vendorAddress,
                    perKgCost: editItem.perKgCost,
                    supplierId: editItem.supplierId,
                    purchaseOrderId: editItem.purchaseOrderId
                });
            } else {
                setFormData({
                    name: '',
                    quantity: 0,
                    unit: '',
                    minQuantity: 0,
                    location: 'main',
                    expiryDate: '',
                    batchNumber: '',
                    notes: '',
                    vendorName: '',
                    vendorCompany: '',
                    vendorGst: '',
                    vendorContact: '',
                    vendorAddress: '',
                    perKgCost: 0,
                    supplierId: '',
                    purchaseOrderId: ''
                });
            }
        }
    }, [isOpen, editItem]);

    // Subscribe to location changes
    useEffect(() => {
        if (isOpen) {
            const unsubscribe = locationService.subscribe((updatedLocations) => {
                setLocations(locationService.getLocationOptions());
            });
            
            return unsubscribe;
        }
    }, [isOpen]);

    const loadData = async () => {
        try {
            await Promise.all([
                loadSuppliers(),
                loadPurchaseOrders()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    const loadSuppliers = async () => {
        try {
            const suppliersSnapshot = await sdk.db.collection("Suppliers").get();
            const suppliersList = suppliersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSuppliers(suppliersList);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    };

    const loadPurchaseOrders = async () => {
        try {
            const ordersSnapshot = await sdk.db.collection("PurchaseOrders")
                .where("status", "==", "pending")
                .get();
            const ordersList = ordersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setPurchaseOrders(ordersList);
        } catch (error) {
            console.error('Error loading purchase orders:', error);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleCustomUnit = () => {
        if (customUnit.trim()) {
            setUnits(prev => [...prev, customUnit.trim()]);
            setFormData(prev => ({
                ...prev,
                unit: customUnit.trim()
            }));
            setShowCustomUnit(false);
            setCustomUnit('');
        }
    };

    const handleSave = async () => {
        try {
            if (!formData.name || !formData.unit) {
                showToast('Please fill in required fields', 'error');
                return;
            }
            
            // Validate all numeric inputs
            const quantityValidation = validatePositiveQuantity(formData.quantity, 'quantity');
            if (!quantityValidation.valid) {
                showToast(quantityValidation.message, 'error');
                return;
            }
            
            const minQuantityValidation = validatePositiveQuantity(formData.minQuantity || 0, 'minimum quantity');
            if (formData.minQuantity && !minQuantityValidation.valid) {
                showToast(minQuantityValidation.message, 'error');
                return;
            }
            
            // Ensure quantities are never negative
            const safeQuantity = ensureNonNegativeQuantity(formData.quantity);
            const safeMinQuantity = ensureNonNegativeQuantity(formData.minQuantity || 0);

            const itemData = {
                ...formData,
                quantity: safeQuantity,
                minQuantity: safeMinQuantity,
                perKgCost: Number(formData.perKgCost),
                date: new Date(),
                updatedAt: new Date(),
                lastUpdated: new Date().toISOString()
            };

            // Call onSave callback to handle the save operation
            // This prevents double saving by letting the parent component handle the database operation
            if (onSave) {
                onSave(itemData);
            }
            
            // Close modal after save operation is initiated
            onClose();
        } catch (error) {
            console.error('Error preparing inventory item:', error);
            showToast('Failed to prepare inventory item', 'error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {editItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <i className="ph ph-x text-xl"></i>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Item Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Quantity *
                                </label>
                                <input
                                    type="number"
                                    value={formData.quantity}
                                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    min="0"
                                    step="0.01"
                                    required
                                />
                            </div>
                        </div>

                        {/* Unit Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Unit *
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={formData.unit}
                                    onChange={(e) => handleInputChange('unit', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    required
                                >
                                    <option value="">Select unit</option>
                                    {units.map(unit => (
                                        <option key={unit} value={unit}>{unit}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setShowCustomUnit(!showCustomUnit)}
                                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                                >
                                    <i className="ph ph-plus"></i>
                                </button>
                            </div>
                            {showCustomUnit && (
                                <div className="mt-2 flex gap-2">
                                    <input
                                        type="text"
                                        value={customUnit}
                                        onChange={(e) => setCustomUnit(e.target.value)}
                                        placeholder="Enter custom unit"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCustomUnit}
                                        className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Location and Minimum Quantity */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Location
                                </label>
                                <select
                                    value={formData.location}
                                    onChange={(e) => handleInputChange('location', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                    {locations.map(location => (
                                        <option key={location.value} value={location.value}>
                                            {location.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Minimum Quantity
                                </label>
                                <input
                                    type="number"
                                    value={formData.minQuantity}
                                    onChange={(e) => handleInputChange('minQuantity', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        </div>

                        {/* Expiry Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expiry Date
                                </label>
                                <input
                                    type="date"
                                    value={formData.expiryDate}
                                    onChange={(e) => handleInputChange('expiryDate', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Batch Number
                                </label>
                                <input
                                    type="text"
                                    value={formData.batchNumber}
                                    onChange={(e) => handleInputChange('batchNumber', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    placeholder="Optional"
                                />
                            </div>
                        </div>

                        {/* Supplier Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Supplier
                                </label>
                                <select
                                    value={formData.supplierId}
                                    onChange={(e) => {
                                        const supplier = suppliers.find(s => s.id === e.target.value);
                                        handleInputChange('supplierId', e.target.value);
                                        if (supplier) {
                                            handleInputChange('vendorName', supplier.name);
                                            handleInputChange('vendorCompany', supplier.company);
                                            handleInputChange('vendorContact', supplier.contact);
                                            handleInputChange('vendorAddress', supplier.address);
                                        }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                    <option value="">Select supplier</option>
                                    {suppliers.map(supplier => (
                                        <option key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Purchase Order
                                </label>
                                <select
                                    value={formData.purchaseOrderId}
                                    onChange={(e) => handleInputChange('purchaseOrderId', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                    <option value="">Select purchase order</option>
                                    {purchaseOrders.map(order => (
                                        <option key={order.id} value={order.id}>
                                            {order.orderId} - {order.supplierName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Cost Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Cost per Unit
                                </label>
                                <input
                                    type="number"
                                    value={formData.perKgCost}
                                    onChange={(e) => handleInputChange('perKgCost', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Notes
                                </label>
                                <input
                                    type="text"
                                    value={formData.notes}
                                    onChange={(e) => handleInputChange('notes', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    placeholder="Additional notes"
                                />
                            </div>
                        </div>

                        {/* Detailed Supplier Information */}
                        {(formData.vendorName || formData.vendorCompany) && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-medium text-gray-800 mb-3">Supplier Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Company Name</label>
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-md">
                                            {formData.vendorCompany}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Contact Person</label>
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-md">
                                            {formData.vendorName}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Contact Number</label>
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-md">
                                            {formData.vendorContact}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">GST Number</label>
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-md">
                                            {formData.vendorGst}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm text-gray-600 mb-1">Address</label>
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-md">
                                            {formData.vendorAddress}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                            >
                                {editItem ? 'Update Item' : 'Add Item'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}