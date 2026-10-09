import React, { createElement, useState } from 'react';
import { showToast } from '../utils.js';
import ReactDOM from 'react-dom/client';
import { sdk } from '../sdk.js';
import { ProductFormModal } from './Modals.js';
import { UserSession } from '../utils/UserSession.js';
import { StockManagementOptionsModal } from './StockManagementOptionsModal.js';

// Product Card Component
export function ProductCard({ product, refreshProducts, isBulkEditMode = false, isSelected = false, onSelectionChange }) {
    const [showContextMenu, setShowContextMenu] = useState(false);

    // Function to handle product deletion
    const handleDelete = (e) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete "${product.title}"?`)) return;

        try {
            sdk.db.collection("Product").doc(product.id).delete()
                .then(() => {
                    showToast("Product deleted successfully");
                    // Trigger a re-fetch instead of reloading the page
                    if (refreshProducts && typeof refreshProducts === 'function') {
                        refreshProducts();
                    }
                })
                .catch(error => {
                    console.error("Error deleting product:", error);
                    showToast("Failed to delete product", "error");
                });
        } catch (error) {
            console.error("Error deleting product:", error);
            showToast("Failed to delete product", "error");
        }
    };

    // Function to toggle product active status
    const toggleActive = (e) => {
        e.stopPropagation();
        const newActiveState = !product.active;

        try {
            sdk.db.collection("Product").doc(product.id).update({
                active: newActiveState
            })
                .then(() => {
                    showToast(`Product ${newActiveState ? 'activated' : 'deactivated'} successfully`);
                    // Trigger a re-fetch instead of reloading the page
                    if (refreshProducts && typeof refreshProducts === 'function') {
                        refreshProducts();
                    }
                })
                .catch(error => {
                    console.error("Error updating product status:", error);
                    showToast("Failed to update product status", "error");
                });
        } catch (error) {
            console.error("Error updating product status:", error);
            showToast("Failed to update product status", "error");
        }
    };

    // Function to open product edit form
    const handleEdit = () => {
        // Create a modal container if it doesn't exist
        let modalContainer = document.getElementById('product-form-modal-container');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'product-form-modal-container';
            document.body.appendChild(modalContainer);
        }

        // Create a root and render the ProductFormModal inside the container
        const root = ReactDOM.createRoot(modalContainer);
        root.render(
            createElement(ProductFormModal, {
                isOpen: true,
                onClose: () => {
                    // Unmount using root.unmount() instead of unmountComponentAtNode
                    root.unmount();
                    // Refresh products data after modal is closed
                    if (refreshProducts && typeof refreshProducts === 'function') {
                        refreshProducts();
                    }
                },
                product: product,
                refreshProducts: refreshProducts
            })
        );
    };

    // Function to open stock management options
    const handleStockManagement = () => {
        // Create a modal container if it doesn't exist
        let modalContainer = document.getElementById('stock-management-modal-container');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'stock-management-modal-container';
            document.body.appendChild(modalContainer);
        }

        // Create a root and render the StockManagementOptionsModal inside the container
        const root = ReactDOM.createRoot(modalContainer);
        root.render(
            createElement(StockManagementOptionsModal, {
                isOpen: true,
                onClose: () => {
                    // Unmount using root.unmount() instead of unmountComponentAtNode
                    root.unmount();
                    // Refresh products data after modal is closed
                    if (refreshProducts && typeof refreshProducts === 'function') {
                        refreshProducts();
                    }
                },
                product: product,
                refreshProducts: refreshProducts
            })
        );
    };

    // Handle card click - either select or show context menu based on mode
    const handleCardClick = (e) => {
        if (isBulkEditMode) {
            e.stopPropagation();
            onSelectionChange && onSelectionChange(!isSelected);
        } else {
            e.stopPropagation();
            setShowContextMenu(true);
        }
    };

    // Handle option selection from context menu
    const handleOptionSelect = (option) => {
        setShowContextMenu(false);
        if (option === 'edit') {
            handleEdit();
        } else if (option === 'stock') {
            handleStockManagement();
        }
    };

    // Handle closing the context menu
    const handleCloseContextMenu = (e) => {
        e.stopPropagation();
        setShowContextMenu(false);
    };

    return (
        <div
            className={`bg-gradient-to-br from-warm-bg to-white rounded-lg overflow-hidden border-2 shadow-sm hover:shadow-md transition-all flex flex-col h-full cursor-pointer ${
                !product.active ? 'opacity-70' : ''
            } ${
                isBulkEditMode 
                    ? isSelected 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-blue-300'
                    : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={handleCardClick}
        >
            {/* Selection checkbox for bulk edit mode */}
            {isBulkEditMode && (
                <div className="absolute top-2 left-2 z-10">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected 
                            ? 'bg-blue-500 border-blue-500' 
                            : 'bg-white border-gray-300'
                    }`}>
                        {isSelected && (
                            <i className="ph ph-check text-white text-xs"></i>
                        )}
                    </div>
                </div>
            )}
            
            {/* Context Menu */}
            {showContextMenu && !isBulkEditMode && (
                <div 
                    className="absolute inset-0 bg-black bg-opacity-40 z-20 flex items-center justify-center rounded-lg backdrop-blur-sm"
                    onClick={handleCloseContextMenu}
                >
                    <div 
                        className="bg-white rounded-2xl shadow-2xl w-80 py-3 border border-gray-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800 text-xl">Product Options</h3>
                            <p className="text-base text-gray-600 truncate mt-1">{product.title}</p>
                        </div>
                        <button
                            onClick={() => handleOptionSelect('stock')}
                            className="w-full px-5 py-5 text-left hover:bg-blue-50 flex items-center text-lg font-semibold transition-colors"
                        >
                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mr-4">
                                <i className="ph ph-package text-blue-600 text-2xl"></i>
                            </div>
                            <span className="text-gray-800">Stock Management</span>
                        </button>
                        <button
                            onClick={() => handleOptionSelect('edit')}
                            className="w-full px-5 py-5 text-left hover:bg-green-50 flex items-center text-lg font-semibold transition-colors"
                        >
                            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mr-4">
                                <i className="ph ph-pencil-simple text-green-600 text-2xl"></i>
                            </div>
                            <span className="text-gray-800">Edit Product</span>
                        </button>
                        <div className="border-t border-gray-100 mt-2 pt-2">
                            <button
                                onClick={handleCloseContextMenu}
                                className="w-full px-5 py-5 text-left hover:bg-gray-50 flex items-center text-lg font-semibold text-gray-600 transition-colors"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mr-4">
                                    <i className="ph ph-x-circle text-gray-600 text-2xl"></i>
                                </div>
                                <span>Cancel</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Product Image with Badges */}
            <div className="relative w-full pb-[75%] bg-gradient-to-br from-gray-50 to-white overflow-hidden">
                {product.imgs && product.imgs.length > 0 ? (
                    <img
                        src={product.imgs[0]}
                        className="absolute top-0 left-0 w-full h-full object-cover"
                        alt={product.title}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23d1d5db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
                        }}
                    />
                ) : (
                    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-gray-400">
                        <i className="ph ph-image text-3xl" />
                    </div>
                )}

                {/* Overlapping badges container */}
                <div className={`absolute inset-x-0 top-0 flex items-start justify-between p-1.5 ${isBulkEditMode ? 'mt-6' : ''}`}>
                    {/* Left badges */}
                    <div className="flex flex-col items-start gap-1">
                        {/* Veg/Non-veg indicator */}
                        <div className={`h-4 w-4 border p-0.5 bg-white shadow-sm ${product.veg ? 'border-green-500' : 'border-red-500'}`}>
                            <div className={`h-full w-full rounded-full ${product.veg ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                    </div>

                    {/* Right badges */}
                    <div className="flex flex-col items-end gap-1">
                        {/* Discount Badge */}
                        {product.hasDiscount && (
                            <div className="text-xs px-1.5 py-0.5 bg-red-500 text-white rounded-full font-medium shadow-sm">
                                {product.discountPercent}% OFF
                            </div>
                        )}

                        {/* Stock Badge - moved from bottom */}
                        {/* Show On-demand badge for on-demand products */}
                        {product.inventoryDeductionMode === 'on-demand' ? (
                            <div className="text-2xs px-1.5 py-0.5 rounded-full font-medium shadow-sm bg-blue-100 text-blue-600">
                                <i className="ph ph-cooking-pot mr-1"></i>
                                On-demand
                            </div>
                        ) : (
                            /* Show stock status for pre-prepared products */
                            product.stock !== undefined && product.stock <= 10 && (
                                <div className={`text-2xs px-1.5 py-0.5 rounded-full font-medium shadow-sm ${product.stock <= 0
                                    ? 'bg-red-100 text-red-600'
                                    : product.stock <= 5
                                        ? 'bg-orange-100 text-orange-600'
                                        : 'bg-green-100 text-green-600'
                                    }`}>
                                    {product.stock <= 0
                                        ? 'Out of stock'
                                        : `${product.stock} left`}
                                </div>
                            )
                        )}

                        {/* Status Badge */}
                        {!product.active && (
                            <div className="text-2xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full shadow-sm">
                                Inactive
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Product Details - Compact */}
            <div className="p-2 flex-1 flex flex-col justify-between">
                <div>
                    <h3 className="font-medium text-sm line-clamp-1">{product.title}</h3>
                    <p className="text-gray-500 text-2xs line-clamp-1" style={{ lineHeight: '1.2' }}>
                        {product.desc || 'No description'}
                    </p>
                </div>

                {/* Price Row */}
                <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-baseline gap-1">
                        <div className="font-semibold text-gray-800">{UserSession?.getCurrency()}{product.price}</div>
                        {product.mrp > product.price && (
                            <div className="text-2xs line-through text-gray-400">{UserSession?.getCurrency()}{product.mrp}</div>
                        )}
                    </div>
                    {product?.unitPricing?.enabled && product?.unitPricing?.displayUnit && Number(product?.unitPricing?.pricePerUnit) > 0 && (
                        <div className="text-[10px] text-blue-600 whitespace-nowrap ml-2">@ {UserSession?.getCurrency()}{Number(product.unitPricing.pricePerUnit).toFixed(2)} / {product.unitPricing.displayUnit}</div>
                    )}

                    {/* Stock number - compact format for high stock */}
                    {product.stock !== undefined && product.stock > 10 && (
                        <div className="text-2xs font-medium text-green-600">
                            ({product.stock})
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}