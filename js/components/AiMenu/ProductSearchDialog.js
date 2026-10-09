import { useState, useEffect } from 'react';
import { Product } from '../../models/Product.js';
import { sdk } from '../../sdk.js';
import { showToast } from '../../utils.js';
import { createQuickProduct } from './utils.js';

export default function ProductSearchDialog({ isOpen, onClose, product, allProduct }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [mode, setMode] = useState('search'); // 'search' or 'manual'
    const [manualProduct, setManualProduct] = useState({
        title: '',
        price: '',
        description: ''
    });

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setMode('search');
            setManualProduct({ title: '', price: '', description: '' });
        }
    }, [isOpen]);

    // Filter products from existing data
    const getFilteredProducts = () => {
        // Early return if product data is not available
        if (!product || !allProduct || allProduct.length === 0) {
            return [];
        }

        const currentSuggestionItems = product?.suggestion?.items || [];

        // If no search term, return all eligible products
        if (!searchTerm) {
            return allProduct.filter(p => {
                // Skip if product is null/undefined
                if (!p || !p.id) return false;

                // Filter out products that are already suggested
                const isAlreadySuggested = currentSuggestionItems.some(
                    suggestion => suggestion.productId === p.id
                );
                // Filter out the product itself
                const isSelfProduct = p.id === product.id;
                // Filter out inactive products
                const isActive = p.active !== false;

                return !isAlreadySuggested && !isSelfProduct && isActive;
            });
        }

        // If there's a search term, filter based on search criteria
        const searchLower = searchTerm.toLowerCase();

        return allProduct.filter(p => {
            // Skip if product is null/undefined
            if (!p || !p.id) return false;

            // Filter out products that are already suggested
            const isAlreadySuggested = currentSuggestionItems.some(
                suggestion => suggestion.productId === p.id
            );
            // Filter out the product itself
            const isSelfProduct = p.id === product.id;
            // Filter out inactive products
            const isActive = p.active !== false;
            // Search in title and description
            const matchesSearch =
                p.title?.toLowerCase().includes(searchLower) ||
                p.name?.toLowerCase().includes(searchLower) ||
                p.desc?.toLowerCase().includes(searchLower);

            return !isAlreadySuggested && !isSelfProduct && isActive && matchesSearch;
        });
    };

    const searchResults = getFilteredProducts();

    // Handle selecting a product from search results
    const handleSelectProduct = async (selectedProduct) => {
        try {
            const currentSuggestionItems = product?.suggestion?.items || [];

            // Check if already has 5 suggestions
            if (currentSuggestionItems.length >= 5) {
                showToast('Maximum 5 suggestions allowed per product', 'error');
                return;
            }

            const suggestionData = {
                productId: selectedProduct.id,
                title: selectedProduct.title,
                price: selectedProduct.price,
                img: selectedProduct.imgs?.[0] || null,
                punchline: selectedProduct.desc || ""
            };

            // Add to suggestion array
            const updatedSuggestions = [...currentSuggestionItems, suggestionData];

            // Update the product in database
            const productRef = sdk.db.collection("Product").doc(product.id);
            await productRef.update({
                'suggestion.items': updatedSuggestions
            });

            showToast('Product suggestion added successfully', 'success');
            onClose();
        } catch (error) {
            console.error('Error adding suggestion:', error);
            showToast('Failed to add suggestion', 'error');
        }
    };

    // Handle adding a manual product
    const handleAddManualProduct = async () => {
        try {
            if (!manualProduct.title.trim()) {
                showToast('Please enter a product title', 'error');
                return;
            }

            if (!manualProduct.price || manualProduct.price <= 0) {
                showToast('Please enter a valid price', 'error');
                return;
            }

            const currentSuggestionItems = product?.suggestion?.items || [];

            // Check if already has 5 suggestions
            if (currentSuggestionItems.length >= 5) {
                showToast('Maximum 5 suggestions allowed per product', 'error');
                return;
            }

            // Create actual product document first
            const newProductId = await createQuickProduct(
                manualProduct.title.trim(),
                parseFloat(manualProduct.price),
                'Custom', // Category for manual products
                manualProduct.description.trim(),
                product.sellerId,
                product.sellerBusinessName
            );

            const suggestionData = {
                productId: newProductId, // Use the actual product ID
                title: manualProduct.title.trim(),
                price: parseFloat(manualProduct.price),
                img: null,
                punchline: manualProduct.description.trim()
            };

            // Add to suggestion array
            const updatedSuggestions = [...currentSuggestionItems, suggestionData];

            // Update the product in database
            const productRef = sdk.db.collection("Product").doc(product.id);
            await productRef.update({
                'suggestion.items': updatedSuggestions
            });

            showToast('Product created and added to suggestions successfully', 'success');
            onClose();
        } catch (error) {
            console.error('Error adding custom suggestion:', error);
            showToast('Failed to create product and add suggestion', 'error');
        }
    };

    if (!isOpen || !product) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-gray-900">Add Product Suggestion</h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setMode('search')}
                            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                                mode === 'search'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            Search Existing Products
                        </button>
                        <button
                            onClick={() => setMode('manual')}
                            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                                mode === 'manual'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            Create Custom Product
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {mode === 'search' ? (
                        <div className="space-y-4">
                            {/* Search Input */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Type to filter products..."
                                    className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    autoFocus
                                />
                                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                                    >
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Search Results */}
                            <div className="max-h-80 overflow-y-auto">
                                {searchResults.length > 0 ? (
                                    <div className="space-y-2">
                                        {searchResults.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleSelectProduct(p)}
                                                className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={p.imgs?.[0] || Product.DUMMY_THUMB}
                                                        alt={p.title}
                                                        className="w-12 h-12 object-cover rounded-md"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-medium text-gray-900 truncate">
                                                            {p.title}
                                                        </h3>
                                                        {p.desc && (
                                                            <p className="text-sm text-gray-500 truncate mt-1">
                                                                {p.desc}
                                                            </p>
                                                        )}
                                                        <p className="text-sm font-semibold text-red-600 mt-1">
                                                            ₹{p.price}
                                                        </p>
                                                    </div>
                                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : searchTerm ? (
                                    <div className="p-8 text-center text-gray-500">
                                        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
                                        </svg>
                                        <p>No products found matching "{searchTerm}"</p>
                                        <p className="text-sm mt-2">Try a different search term or create a custom product</p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Manual Product Form */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Product Title <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={manualProduct.title}
                                    onChange={(e) => setManualProduct({ ...manualProduct, title: e.target.value })}
                                    placeholder="Enter product title"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Price <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                                    <input
                                        type="number"
                                        value={manualProduct.price}
                                        onChange={(e) => setManualProduct({ ...manualProduct, price: e.target.value })}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                        className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={manualProduct.description}
                                    onChange={(e) => setManualProduct({ ...manualProduct, description: e.target.value })}
                                    placeholder="Enter product description (optional)"
                                    rows={4}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200">
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        {mode === 'manual' && (
                            <button
                                onClick={handleAddManualProduct}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                                Add Custom Product
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}