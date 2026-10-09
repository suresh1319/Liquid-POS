import { useState, useEffect, useMemo, useRef } from 'react';
import { sdk } from '../../sdk.js';
import { showToast } from '../../utils.js';
import { Product } from '../../models/Product.js';
import SuggestionStrategyDialog from './SuggestionStrategyDialog.js';
import EngineerStrategyDialog from './EngineerStrategyDialog.js';
import ProductSearchDialog from './ProductSearchDialog.js';
import { createQuickProduct } from './utils.js';
import { FaWandMagicSparkles, FaEllipsisVertical } from 'react-icons/fa6';

export default function MenuTab({ products }) {
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [sortBy, setSortBy] = useState('name'); // 'name', 'suggestionDate'
    const [isStrategyDialogOpen, setIsStrategyDialogOpen] = useState(false);
    const [isEngineerDialogOpen, setIsEngineerDialogOpen] = useState(false);
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
    const [selectedProductForSuggestion, setSelectedProductForSuggestion] = useState(null);
    const [editedSuggestions, setEditedSuggestions] = useState({}); // Track edited suggestion values
    const contextMenuRef = useRef(null);

    const productGroups = useMemo(() => {
        const notSuggested = [];
        const suggested = [];

        products.forEach(p => {
            // Only include products where sellIndividually is not false
            if (p.sellIndividually === false) {
                return; // Skip this product
            }
            
            if (p?.suggestion?.items) {
                suggested.push(p);
            } else {
                notSuggested.push(p);
            }
        });

        const sortFn = (a, b) => {
            if (sortBy === 'suggestionDate') {
                const dateA = a.suggestion?.requested ? (a.suggestion.requested.toDate ? a.suggestion.requested.toDate() : new Date(a.suggestion.requested)).getTime() : 0;
                const dateB = b.suggestion?.requested ? (b.suggestion.requested.toDate ? b.suggestion.requested.toDate() : new Date(b.suggestion.requested)).getTime() : 0;
                if (dateA === 0 && dateB === 0) return (a?.title || '').localeCompare(b?.title || '');
                return dateB - dateA;
            }
            return (a?.title || '').localeCompare(b?.title || '');
        };

        notSuggested.sort(sortFn);
        suggested.sort(sortFn);

        return { notSuggested, suggested };
    }, [products, sortBy]);

    // When the modal opens, select all "Not Suggested Yet" products by default
    useEffect(() => {
        setSelectedProducts(productGroups.notSuggested.map(p => p.id));
    }, [productGroups.notSuggested]);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
                setIsContextMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const isAllNotSuggestedSelected = useMemo(() => {
        if (productGroups.notSuggested.length === 0) return false;
        return productGroups.notSuggested.every(p => selectedProducts.includes(p.id));
    }, [selectedProducts, productGroups.notSuggested]);

    const isAllSuggestedSelected = useMemo(() => {
        if (productGroups.suggested.length === 0) return false;
        return productGroups.suggested.every(p => selectedProducts.includes(p.id));
    }, [selectedProducts, productGroups.suggested]);

    const handleToggleSelectAllInSection = (section) => {
        const sectionProducts = section === 'notSuggested' ? productGroups.notSuggested : productGroups.suggested;
        const isAllSelected = section === 'notSuggested' ? isAllNotSuggestedSelected : isAllSuggestedSelected;
        const sectionIds = sectionProducts.map(p => p.id);
        
        if (isAllSelected) {
            // Deselect all in this section
            setSelectedProducts(prev => prev.filter(id => !sectionIds.includes(id)));
        } else {
            // Select all in this section
            setSelectedProducts(prev => [...new Set([...prev, ...sectionIds])]);
        }
    };

    const handleProductSelect = (productId) => {
        setSelectedProducts(prev =>
            prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    const handleGenerateClick = () => {
        if (selectedProducts.length === 0) {
            showToast('Please select at least one product to generate suggestions.', 'warning');
        } else {
            setIsStrategyDialogOpen(true);
            setIsContextMenuOpen(false);
        }
    };

    // const handleEngineerMenu = () => {
    //     setIsEngineerDialogOpen(true);
    //     setIsContextMenuOpen(false);
    // };

    const handleGenerationComplete = () => {
        setIsStrategyDialogOpen(false);
        setSelectedProducts([]);
        // Optionally, you might want to refresh the product list here
    };

    const handleEngineerComplete = () => {
        setIsEngineerDialogOpen(false);
        // Optionally, you might want to refresh the product list here
    };

    const handleRemoveSuggestion = async (productId, suggestionIndex) => {
        try {
            // Find the product to get its current suggestions
            const product = products.find(p => p.id === productId);
            if (!product || !product.suggestion || !product.suggestion.items) {
                showToast('No suggestions found for this product', 'error');
                return;
            }

            // Create a new array without the item at suggestionIndex
            const updatedSuggestions = [...product.suggestion.items];
            updatedSuggestions.splice(suggestionIndex, 1);

            // Update the product in the database
            const productRef = sdk.db.collection("Product").doc(productId);

            if (updatedSuggestions.length === 0) {
                // If no suggestions left, remove the entire suggestion object
                await productRef.update({
                    suggestion: {}
                });
            } else {
                // Otherwise, update with the remaining suggestions
                await productRef.update({
                    'suggestion.items': updatedSuggestions
                });
            }

            showToast('Suggestion removed successfully', 'success');

            // The onSnapshot listener in the parent component will automatically update the UI

        } catch (error) {
            console.error('Error removing suggestion:', error);
            showToast('Failed to remove suggestion', 'error');
        }
    };

    const handleAddSuggestion = (productId) => {
        const product = products.find(p => p.id === productId);
        setSelectedProductForSuggestion(product);
        setIsSearchDialogOpen(true);
    };

    const handleSuggestionEdit = (productId, suggestionIndex, field, value) => {
        const key = `${productId}-${suggestionIndex}`;
        setEditedSuggestions(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [field]: value
            }
        }));
    };

    // Check if any suggestions for a product are newly generated (need to be added to database)
    const hasNewlyGeneratedProducts = (product) => {
        if (!product.suggestion?.items) return false;
        return product.suggestion.items.some(item => item.isNewlyGenerated);
    };

    const handleConfirmProducts = async (product) => {
        try {
            if (!product.suggestion?.items) {
                showToast('No suggestions found', 'error');
                return;
            }

            const newlyGeneratedItems = product.suggestion.items.filter(item => item.isNewlyGenerated);

            if (newlyGeneratedItems.length === 0) {
                showToast('No new products to confirm', 'warning');
                return;
            }

            // Store mapping of suggestion items to their new product IDs
            const newProductRefs = [];

            // Create new products using utility function
            await Promise.all(product.suggestion.items.map(async (item, index) => {
                if (item.isNewlyGenerated) {
                    const key = `${product.id}-${index}`;
                    const edited = editedSuggestions[key];

                    const newProductId = await createQuickProduct(
                        edited?.title || item.title,
                        edited?.price || item.price || 0,
                        item.category || 'Default',
                        edited?.punchline || item.punchline || '',
                        product.sellerId,
                        product.sellerBusinessName || ''
                    );

                    newProductRefs.push({
                        itemIndex: index,
                        productId: newProductId
                    });
                }
            }));

            // Update suggestion items to remove isNewlyGenerated flag and add productId
            const updatedSuggestionItems = product.suggestion.items.map(item => {
                if (item.isNewlyGenerated) {
                    const itemIndex = product.suggestion.items.indexOf(item);
                    const key = `${product.id}-${itemIndex}`;
                    const edited = editedSuggestions[key];

                    // Find the corresponding new product mapping
                    const newProductMapping = newProductRefs.find(
                        ref => ref.itemIndex === itemIndex
                    );

                    return {
                        ...item,
                        productId: newProductMapping?.productId, // Update with the new document ID
                        title: edited?.title || item.title,
                        punchline: edited?.punchline || item.punchline,
                        price: edited?.price || item.price,
                        isNewlyGenerated: false // Remove the flag
                    };
                }
                return item;
            });

            // Update the original product with modified suggestions
            const productRef = sdk.db.collection("Product").doc(product.id);
            await productRef.update({
                'suggestion.items': updatedSuggestionItems
            });

            // Clear edited suggestions for this product
            const updatedEditedSuggestions = { ...editedSuggestions };
            product.suggestion.items.forEach((item, index) => {
                const key = `${product.id}-${index}`;
                if (item.isNewlyGenerated) {
                    delete updatedEditedSuggestions[key];
                }
            });
            setEditedSuggestions(updatedEditedSuggestions);

            showToast(`Successfully added ${newlyGeneratedItems.length} products to database!`, 'success');

        } catch (error) {
            console.error('Error confirming products:', error);
            showToast('Failed to confirm products. Please try again.', 'error');
        }
    };

    const renderProduct = (product) => {
        const isSelected = selectedProducts.includes(product.id);
        return (
            <div
                key={product.id}
                onClick={() => handleProductSelect(product.id)}
                className={`relative p-4 border rounded-lg cursor-pointer transition-all duration-200 ${isSelected ? 'bg-red-50 border-red-300 shadow-sm' : 'bg-white hover:bg-gray-50 hover:border-gray-300'}`}
            >
                <CheckCircleIcon isSelected={isSelected} />
                <div className="flex items-center">
                    <img
                        src={product.imgs?.[0] || Product.DUMMY_THUMB}
                        alt={product.title}
                        className="w-16 h-16 object-cover rounded-md"
                    />
                    <div className="ml-4 flex-1">
                        <span className="text-base text-gray-800 font-medium">
                            {product.title || product.name}
                        </span>
                        {product.suggestion?.requested && product.suggestion?.items && (
                            <p className="text-sm text-gray-500 mt-1">
                                {formatSuggestionAge(product.suggestion.requested)}
                            </p>
                        )}
                    </div>
                </div>
                {product.suggestion?.items?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="space-y-2">
                            {product.suggestion.items.slice(0, 5).map((item, index) => (
                                <div key={index} className="flex items-start gap-2 p-2 bg-gray-50 rounded-md relative group">
                                    <img
                                        src={item.img || Product.DUMMY_THUMB}
                                        alt={item.title}
                                        className="w-8 h-8 object-cover rounded-md border border-gray-200 flex-shrink-0 mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                        {item.isNewlyGenerated ? (
                                            // Editable fields for newly generated products
                                            <>
                                                <input
                                                    type="text"
                                                    value={editedSuggestions[`${product.id}-${index}`]?.title || item.title}
                                                    onChange={(e) => handleSuggestionEdit(product.id, index, 'title', e.target.value)}
                                                    className="w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
                                                />

                                                <textarea
                                                    value={editedSuggestions[`${product.id}-${index}`]?.punchline || item.punchline || ''}
                                                    onChange={(e) => handleSuggestionEdit(product.id, index, 'punchline', e.target.value)}
                                                    rows={2}
                                                    className="w-full text-xs text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                                                    placeholder="Add a description..."
                                                />

                                                <div className="flex items-center mt-1">
                                                    <span className="text-xs font-semibold text-red-600 mr-1">₹</span>
                                                    <input
                                                        type="number"
                                                        value={editedSuggestions[`${product.id}-${index}`]?.price || item.price || 0}
                                                        onChange={(e) => handleSuggestionEdit(product.id, index, 'price', parseInt(e.target.value) || 0)}
                                                        className="w-20 text-xs font-semibold text-red-600 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            // Static display for existing suggestions
                                            <>
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {item.title}
                                                </p>
                                                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                                                    {item.punchline}
                                                </p>
                                                <p className="text-xs font-semibold text-red-600 mt-0.5">
                                                    ₹{item.price}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveSuggestion(product.id, index);
                                        }}
                                        className="absolute top-0.5 right-0.5 p-0.5 bg-gray-200 text-gray-500 rounded-full transition-all duration-200 hover:bg-gray-300 hover:text-gray-600 hover:scale-110"
                                        title="Remove suggestion"
                                    >
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>
                            ))}
                            {product.suggestion.items.length < 5 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddSuggestion(product.id);
                                    }}
                                    className="w-full p-2 border-2 border-dashed border-gray-300 rounded-md text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors duration-200 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                                    </svg>
                                    <span className="text-sm">Add Suggestion</span>
                                </button>
                            )}

                            {/* Confirm button for newly generated products */}
                            {hasNewlyGeneratedProducts(product) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleConfirmProducts(product);
                                    }}
                                    className="w-full p-2 border-2 border-solid border-green-500 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-600 transition-colors duration-200 flex items-center justify-center gap-2 rounded-md"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                    <span className="text-sm font-medium">Confirm & Save</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderProductSection = (title, products, sectionKey) => {
        // If there are no products, don't render the section at all
        if (products.length === 0) {
            return null;
        }
        
        return (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">{title} ({products.length})</h2>
                </div>
                
                {products.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {products.map(renderProduct)}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        No products in this section.
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="space-y-6">
                {/* Header and Global Controls */}
                <div className="sticky top-0 bg-white z-10 flex justify-between items-center border-b pb-4">
                    <h1 className="text-xl font-bold text-gray-900">AI Menu Suggestions</h1>
                    <div className="flex items-center gap-4">
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
                            <option value="name">Sort by Name</option>
                            <option value="suggestionDate">Sort by Suggestion Date</option>
                        </select>
                        <div className="relative" ref={contextMenuRef}>
                            <button
                                onClick={() => setIsContextMenuOpen(!isContextMenuOpen)}
                                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 flex items-center"
                            >
                                <FaEllipsisVertical />
                            </button>
                            {isContextMenuOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-50 border border-gray-200">
                                    <div className="py-1">
                                        <button
                                            onClick={handleGenerateClick}
                                            disabled={selectedProducts.length === 0}
                                            className={`flex items-start w-full px-4 py-2 text-sm text-left whitespace-nowrap ${
                                                selectedProducts.length === 0 
                                                    ? 'text-gray-400 cursor-not-allowed' 
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            <FaWandMagicSparkles className="mr-2 flex-shrink-0" />
                                            <span className="flex-1 min-w-0 truncate">
                                                Generate Suggestions ({selectedProducts.length})
                                            </span>
                                        </button>
                                        {/* <button
                                            onClick={handleEngineerMenu}
                                            className="flex items-start w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 whitespace-nowrap"
                                        >
                                            <FaGear className="mr-2 flex-shrink-0" />
                                            <span className="flex-1 min-w-0 truncate">Engineer menu</span>
                                        </button> */}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Product Sections */}
                <div className="space-y-8">
                    {/* Not Suggested Section */}
                    {renderProductSection("Not Suggested", productGroups.notSuggested, "notSuggested")}
                    
                    {/* AI Suggested Section */}
                    {renderProductSection("AI Suggested", productGroups.suggested, "suggested")}
                </div>
            </div>

            <SuggestionStrategyDialog
                open={isStrategyDialogOpen}
                onClose={() => setIsStrategyDialogOpen(false)}
                selectedProducts={selectedProducts}
                onGenerationComplete={handleGenerationComplete}
            />
            <EngineerStrategyDialog
                open={isEngineerDialogOpen}
                onClose={() => setIsEngineerDialogOpen(false)}
                onGenerationComplete={handleEngineerComplete}
            />
            <ProductSearchDialog
                isOpen={isSearchDialogOpen}
                onClose={() => {
                    setIsSearchDialogOpen(false);
                    setSelectedProductForSuggestion(null);
                }}
                product={selectedProductForSuggestion}
                allProduct={products}
            />
        </>
    );
}

const CheckCircleIcon = ({ isSelected }) => (
    <div className={`absolute top-1 right-1 h-4 w-4 rounded-full flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-red-500' : 'bg-white'}`}>
        {isSelected && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
            </svg>
        )}
    </div>
);

const formatSuggestionAge = (date) => {
    if (!date) return '';
    
    // Handle Firestore Timestamps
    const suggestionDate = date.toDate ? date.toDate() : new Date(date);
    
    if (isNaN(suggestionDate)) {
        return 'Invalid date';
    }

    const now = new Date();
    const diffTime = Math.abs(now - suggestionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) return 'Suggested today';
    if (diffDays <= 7) return `Suggested ${diffDays} days ago`;
    if (diffDays <= 30) return `Suggested ${Math.floor(diffDays / 7)} weeks ago`;
    return `Suggested ${Math.floor(diffDays / 30)} months ago`;
};
