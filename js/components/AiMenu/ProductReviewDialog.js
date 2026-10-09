import { useState, useEffect } from 'react';
import { sdk } from '../../sdk.js';
import { showToast } from '../../utils.js';
import { useProfile } from '../../contexts/ProfileContext.js';
import { FaTrash, FaTimes, FaSave, FaPlus } from 'react-icons/fa';

export default function ProductReviewDialog({ open, onClose, generatedData, onImportComplete }) {
    const [reviewData, setReviewData] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [showAddProductForm, setShowAddProductForm] = useState(false);
    const [newProduct, setNewProduct] = useState({
        title: '',
        description: '',
        price: { value: 0, currency: 'INR' },
        sellIndividually: false,
        category: ''
    });
    const [newCategoryName, setNewCategoryName] = useState('');
    const [useNewCategory, setUseNewCategory] = useState(false);
    const { profile } = useProfile();

    // Initialize review data when generatedData changes
    useEffect(() => {
        if (generatedData && open) {
            const data = JSON.parse(JSON.stringify(generatedData));
            
            // Set all product sellIndividually to false initially
            data.categories.forEach(category => {
                category.items.forEach(item => {
                    item.sellIndividually = false;
                });
            });
            
            setReviewData(data);
        }
    }, [generatedData, open]);

    if (!open || !reviewData) return null;

    // Update item field
    const updateItemField = (categoryIndex, itemIndex, field, value) => {
        const newData = { ...reviewData };
        newData.categories[categoryIndex].items[itemIndex][field] = value;
        setReviewData(newData);
    };

    // Remove item from category
    const removeItem = (categoryIndex, itemIndex) => {
        const newData = { ...reviewData };
        newData.categories[categoryIndex].items.splice(itemIndex, 1);
        
        // Remove category if no items left
        if (newData.categories[categoryIndex].items.length === 0) {
            newData.categories.splice(categoryIndex, 1);
        }
        
        setReviewData(newData);
    };

    // Add new product
    const addNewProduct = () => {
        if (!newProduct.title.trim()) {
            showToast('Product title is required', 'error');
            return;
        }

        if (!newProduct.price.value || newProduct.price.value <= 0) {
            showToast('Product price must be greater than 0', 'error');
            return;
        }

        let categoryName = newProduct.category;
        
        // If using new category, validate and create it
        if (useNewCategory) {
            if (!newCategoryName.trim()) {
                showToast('Category name is required', 'error');
                return;
            }
            categoryName = newCategoryName.trim();
        } else if (!categoryName) {
            showToast('Please select a category or create a new one', 'error');
            return;
        }

        const newData = { ...reviewData };
        
        // Check if category exists
        let categoryIndex = newData.categories.findIndex(cat => cat.name === categoryName);
        
        // If category doesn't exist, create it
        if (categoryIndex === -1) {
            newData.categories.push({
                name: categoryName,
                items: []
            });
            categoryIndex = newData.categories.length - 1;
        }
        
        // Add the new product to the category
        const productToAdd = {
            title: newProduct.title.trim(),
            description: newProduct.description.trim(),
            price: {
                value: parseInt(newProduct.price.value),
                currency: newProduct.price.currency
            },
            sellIndividually: newProduct.sellIndividually
        };
        
        newData.categories[categoryIndex].items.push(productToAdd);
        setReviewData(newData);
        
        // Reset form
        setNewProduct({
            title: '',
            description: '',
            price: { value: 0, currency: 'INR' },
            sellIndividually: false,
            category: ''
        });
        setNewCategoryName('');
        setUseNewCategory(false);
        setShowAddProductForm(false);
        
        showToast('Product added successfully', 'success');
    };

    // Import products to database
    const handleImportProducts = async () => {
        if (!profile?.id) {
            showToast('Profile information not available. Please try again.', 'error');
            return;
        }

        setIsImporting(true);
        try {
            const productsCollection = sdk.db.collection('Product');
            const batch = sdk.db.firestore.batch();
            
            // Process each category and item
            reviewData.categories.forEach(category => {
                category.items.forEach(item => {
                    // Create product document
                    const productData = {
                        title: item.title,
                        desc: item.description,
                        cat: category.name,
                        price: item.price.value,
                        mrp: item.price.value, // Set MRP same as price initially
                        active: true,
                        veg: true, // Default to vegetarian
                        sellerId: profile.id,
                        sellerBusinessName: profile.businessName || '',
                        date: new Date(),
                        sellIndividually: item.sellIndividually || false,
                        generatedFrom: 'ai-menu-engineering',
                        generatedAt: new Date()
                    };

                    // Create a reference for the new document
                    const newProductRef = productsCollection.doc();
                    batch.set(newProductRef, productData);
                });
            });

            // Commit the batch
            await batch.commit();
            
            showToast(`Successfully imported ${getTotalItemCount()} products!`, 'success');
            
            // Call the onImportComplete callback if provided
            if (onImportComplete) {
                onImportComplete();
            } else {
                onClose();
            }
        } catch (error) {
            console.error('Error importing products:', error);
            showToast('Failed to import products. Please try again.', 'error');
        } finally {
            setIsImporting(false);
        }
    };

    // Get total item count
    const getTotalItemCount = () => {
        return reviewData.categories.reduce((total, category) => total + category.items.length, 0);
    };

    return (
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
            <div
                className={`fixed top-0 right-0 h-full bg-white shadow-xl w-full max-w-4xl flex flex-col transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b bg-gray-50">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-semibold">Review Generated Products</h2>
                            <p className="text-sm text-gray-600 mt-1">
                                Review and edit products before importing to your catalog
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <FaTimes className="text-gray-600" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Add Product Button */}
                    <div className="mb-6">
                        <button
                            onClick={() => setShowAddProductForm(!showAddProductForm)}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center transition-colors"
                        >
                            <FaPlus className="mr-2" />
                            Add Manual Product
                        </button>
                    </div>

                    {/* Add Product Form */}
                    {showAddProductForm && (
                        <div className="mb-8 p-4 border rounded-lg bg-blue-50">
                            <h3 className="text-lg font-medium mb-4">Add New Product</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                {/* Product Title */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Product Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={newProduct.title}
                                        onChange={(e) => setNewProduct({...newProduct, title: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                        placeholder="Enter product title"
                                    />
                                </div>
                                
                                {/* Price */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Price ({newProduct.price.currency}) *
                                    </label>
                                    <input
                                        type="number"
                                        value={newProduct.price.value}
                                        onChange={(e) => setNewProduct({
                                            ...newProduct, 
                                            price: {...newProduct.price, value: parseInt(e.target.value) || 0}
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                        placeholder="Enter price"
                                    />
                                </div>
                                
                                {/* Description */}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={newProduct.description}
                                        onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                        placeholder="Enter product description"
                                    />
                                </div>
                                
                                {/* Category Selection */}
                                <div className="md:col-span-2">
                                    <div className="flex items-center mb-2">
                                        <input
                                            type="checkbox"
                                            id="useNewCategory"
                                            checked={useNewCategory}
                                            onChange={(e) => setUseNewCategory(e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 mr-2"
                                        />
                                        <label htmlFor="useNewCategory" className="text-sm font-medium text-gray-700">
                                            Create New Category
                                        </label>
                                    </div>
                                    
                                    {useNewCategory ? (
                                        <input
                                            type="text"
                                            value={newCategoryName}
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                            placeholder="Enter new category name"
                                        />
                                    ) : (
                                        <select
                                            value={newProduct.category}
                                            onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                        >
                                            <option value="">Select a category</option>
                                            {reviewData.categories.map((category, index) => (
                                                <option key={index} value={category.name}>
                                                    {category.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                
                                {/* Sell Individually */}
                                <div className="md:col-span-2">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={newProduct.sellIndividually}
                                            onChange={(e) => setNewProduct({...newProduct, sellIndividually: e.target.checked})}
                                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 mr-2"
                                        />
                                        <span className="text-sm font-medium text-gray-700">
                                            Sell individually
                                        </span>
                                    </label>
                                </div>
                            </div>
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={addNewProduct}
                                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                >
                                    Add Product
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAddProductForm(false);
                                        setNewProduct({
                                            title: '',
                                            description: '',
                                            price: { value: 0, currency: 'INR' },
                                            sellIndividually: false,
                                            category: ''
                                        });
                                        setNewCategoryName('');
                                        setUseNewCategory(false);
                                    }}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {reviewData.categories.map((category, categoryIndex) => (
                        <div key={categoryIndex} className="mb-8">
                            <h3 className="text-lg font-medium mb-4 pb-2 border-b">
                                {category.name} ({category.items.length})
                            </h3>
                            
                            <div className="space-y-4">
                                {category.items.map((item, itemIndex) => (
                                    <div key={itemIndex} className="border rounded-lg p-4 bg-white shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Title */}
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Product Title
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={item.title}
                                                        onChange={(e) => updateItemField(categoryIndex, itemIndex, 'title', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    />
                                                </div>
                                                
                                                {/* Price */}
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Price ({item.price.currency})
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={item.price.value}
                                                        onChange={(e) => updateItemField(categoryIndex, itemIndex, 'price', {
                                                            ...item.price,
                                                            value: parseInt(e.target.value) || 0
                                                        })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    />
                                                </div>
                                                
                                                {/* Description */}
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Description
                                                    </label>
                                                    <textarea
                                                        value={item.description}
                                                        onChange={(e) => updateItemField(categoryIndex, itemIndex, 'description', e.target.value)}
                                                        rows={2}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    />
                                                </div>
                                                
                                                {/* Sell Individually */}
                                                <div className="md:col-span-2">
                                                    <label className="flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={item.sellIndividually || false}
                                                            onChange={(e) => updateItemField(categoryIndex, itemIndex, 'sellIndividually', e.target.checked)}
                                                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 mr-2"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">
                                                            Sell individually
                                                        </span>
                                                    </label>
                                                </div>
                                            </div>
                                            
                                            {/* Remove Button */}
                                            <button
                                                onClick={() => removeItem(categoryIndex, itemIndex)}
                                                className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Remove product"
                                            >
                                                <FaTrash />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    
                    {getTotalItemCount() === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            No products to import. Add products manually or generate them using AI.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-gray-50">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">
                            {getTotalItemCount()} products ready to import
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                                disabled={isImporting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImportProducts}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 flex items-center disabled:bg-red-300 disabled:cursor-not-allowed transition-colors"
                                disabled={getTotalItemCount() === 0 || isImporting}
                            >
                                {isImporting && <div className="animate-spin mr-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                                <FaSave className="mr-2" />
                                {isImporting ? 'Importing...' : `Import ${getTotalItemCount()} Products`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}