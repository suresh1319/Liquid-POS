import React from 'react';
import { UserSession } from '../utils/UserSession.js';
import { StockInOutModal } from './StockInOutModal.js';
import { StockTransferModal } from './StockTransferModal.js';
import { locationService } from '../utils/locationService.js';

// Inventory Card Component
export function InventoryCard({ item, onEdit, onDelete, onTransfer, onStockIn, onStockOut }) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [locationName, setLocationName] = React.useState('');

    // Get location name when item changes
    React.useEffect(() => {
        if (item && item.location) {
            const location = locationService.getLocationById(item.location);
            setLocationName(location ? location.name : 'Unknown');
        } else {
            setLocationName('Main');
        }
    }, [item]);
    // Format date properly with a fallback
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';

        try {
            return new Date(dateString).toLocaleDateString('en-GB');
        } catch (e) {
            console.error("Error formatting date:", e);
            return 'Invalid Date';
        }
    };

    const totalCost = (item.quantity * item.perKgCost).toFixed(2);

    return (
        <div className="bg-gradient-to-br from-warm-bg to-white rounded-xl p-4 border border-gray-200 shadow-section hover:shadow-md transition-all">
            <div className="flex items-start gap-4">
                {/* Item Details */}
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium text-lg">{item.name}</h3>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${Number(item.quantity) > Number(item.minQuantity) ? 'bg-gradient-to-r from-green-100 to-green-50 text-green-800' : 'bg-gradient-to-r from-red-100 to-red-50 text-red-800'}`}>
                                {Number(item.quantity) > Number(item.minQuantity) ? 'In Stock' : 'Low Stock'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                        <div className="text-sm">
                            <span className="text-gray-500">Quantity: </span>
                            <span className="font-medium">{item.quantity} {item.unit}</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-gray-500">Min Quantity: </span>
                            <span className="font-medium">{item.minQuantity} {item.unit}</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-gray-500">Location: </span>
                            <span className="font-medium">{locationName}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                        <div className="text-sm">
                            <span className="text-gray-500">Vendor: </span>
                            <span className="font-medium">{item.vendorName}</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-gray-500">Total Cost: </span>
                            <span className="font-medium">{UserSession?.getCurrency()}{totalCost}</span>
                        </div>
                    </div>
                    {item.expiryDate && (
                        <div className="flex items-center gap-4 mt-2">
                            <div className="text-sm">
                                <span className="text-gray-500">Expiry Date: </span>
                                <span className="font-medium">{new Date(item.expiryDate).toLocaleDateString()}</span>
                            </div>
                            {item.batchNumber && (
                                <div className="text-sm">
                                    <span className="text-gray-500">Batch: </span>
                                    <span className="font-medium">{item.batchNumber}</span>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                        <div className="text-sm">
                            <span className="text-gray-500">Last Updated: </span>
                            <span className="font-medium">
                                {formatDate(item.lastUpdated)}
                            </span>
                        </div>
                    </div>
                    {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                            <h4 className="font-medium text-md">Vendor Details</h4>
                            <div className="text-sm"><span className="text-gray-500">Company: </span>{item.vendorCompany}</div>
                            <div className="text-sm"><span className="text-gray-500">GST Invoice: </span>{item.vendorGst}</div>
                            <div className="text-sm"><span className="text-gray-500">Contact: </span>{item.vendorContact}</div>
                            <div className="text-sm"><span className="text-gray-500">Address: </span>{item.vendorAddress}</div>
                            <div className="text-sm"><span className="text-gray-500">Per Kg Cost: </span>{UserSession?.getCurrency()}{item.perKgCost}</div>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-3">
                <button
                    className="px-2 py-1.5 text-sm bg-gradient-to-r hover:from-red-50 hover:to-white text-red-500 border border-gray-200 rounded-lg flex items-center gap-1.5"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <i className={`ph ph-eye${isExpanded ? '-slash' : ''}`}></i>
                    <span>{isExpanded ? 'View Less' : 'View More'}</span>
                </button>
                <button
                    className="px-2 py-1.5 text-sm bg-gradient-to-r hover:from-green-50 hover:to-white text-green-600 border border-gray-200 rounded-lg flex items-center gap-1.5"
                    onClick={() => onStockIn && onStockIn(item, 'in')}
                >
                    <i className="ph ph-plus-circle"></i>
                    <span>Stock In</span>
                </button>
                <button
                    className="px-2 py-1.5 text-sm bg-gradient-to-r hover:from-orange-50 hover:to-white text-orange-600 border border-gray-200 rounded-lg flex items-center gap-1.5"
                    onClick={() => onStockOut && onStockOut(item, 'out')}
                >
                    <i className="ph ph-minus-circle"></i>
                    <span>Stock Out</span>
                </button>
                <button
                    className="px-2 py-1.5 text-sm bg-gradient-to-r hover:from-blue-50 hover:to-white text-blue-600 border border-gray-200 rounded-lg flex items-center gap-1.5"
                    onClick={() => onTransfer && onTransfer(item)}
                >
                    <i className="ph ph-arrows-left-right"></i>
                    <span>Transfer</span>
                </button>
                <button
                    className="px-2 py-1.5 text-sm bg-gradient-to-r hover:from-red-50 hover:to-white text-red-500 border border-gray-200 rounded-lg flex items-center gap-1.5"
                    onClick={() => onEdit && onEdit(item)}
                >
                    <i className="ph ph-pencil-simple-line"></i>
                    <span>Edit</span>
                </button>
                <button
                    className="px-2 py-1.5 text-sm bg-gradient-to-r hover:from-red-50 hover:to-white text-red-500 border border-gray-200 rounded-lg flex items-center gap-1.5"
                    onClick={() => onDelete && onDelete(item.id)}
                >
                    <i className="ph ph-trash"></i>
                    <span>Delete</span>
                </button>
            </div>

        </div>
    );
}