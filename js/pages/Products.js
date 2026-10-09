import { useState, useEffect, useMemo, useCallback, createElement } from 'react';
import { useLanguage } from '../contexts/LanguageContext.js';
import { InventoryCard } from '../components/InventoryCard.js';
import { ProductCard } from '../components/ProductCard.js';
import { ProductFormModal, AddInventoryModal } from '../components/Modals.js';
import { EnhancedInventoryModal } from '../components/EnhancedInventoryModal.js';
import { SuppliersOrdersModal } from '../components/SuppliersOrdersModal.js';
import { LocationManagementModal } from '../components/LocationManagementModal.js';
import { StockTransferModal } from '../components/StockTransferModal.js';
import { StockInOutModal } from '../components/StockInOutModal.js';
import { DailyInventoryUpdateModal } from '../components/DailyInventoryUpdateModal.js';
import { InventoryReportViewer } from '../components/InventoryReportViewer.js';

import { showToast } from '../utils.js';
import ReactDOM from 'react-dom/client';
import { sdk } from '../sdk.js';
import { Product, InventoryItem } from '../models/Product.js';
import { CategorySlider } from '../components/CategorySlider.js';
import { UserSession } from '../utils/UserSession.js';
import { getSuggestedPurchaseOrders } from '../utils/enhancedInventory.js';
import { locationService } from '../utils/locationService.js';
import { exportInventoryToExcel, importInventoryFromExcel } from '../utils/excelExport.js';

// Products Component
export default function Products() {
    const { t } = useLanguage();
    const [products, setProducts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('products');
    const [selectedCategory, setSelectedCategory] = useState('Appetizers');
    const [categories, setCategories] = useState([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEnhancedModalOpen, setIsEnhancedModalOpen] = useState(false);
    const [isSuppliersModalOpen, setIsSuppliersModalOpen] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferItem, setTransferItem] = useState(null);
    const [isStockInOutModalOpen, setIsStockInOutModalOpen] = useState(false);
    const [stockInOutItem, setStockInOutItem] = useState(null);
    const [stockInOutType, setStockInOutType] = useState('in');
    const [editingItem, setEditingItem] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [productSearchQuery, setProductSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('recent');
    const [selectedLocation, setSelectedLocation] = useState('all');
    const [suggestedOrders, setSuggestedOrders] = useState([]);
    const [locations, setLocations] = useState([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isDailyUpdateModalOpen, setIsDailyUpdateModalOpen] = useState(false);
    const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);


    // Memoized search handlers to prevent input focus loss
    const handleProductSearchChange = useCallback((value) => {
        setProductSearchQuery(value);

        // Reset selected category when searching starts
        if (value && value.trim() !== '') {
            setSelectedCategory(null);
        } else if (!value || value.trim() === '') {
            // Restore first category when search is cleared
            if (categories.length > 0) {
                setSelectedCategory(categories[0].name);
            }
        }
    }, [categories]);

    const handleInventorySearchChange = useCallback((value) => {
        setSearchQuery(value);
    }, []);

    // Function to handle inventory export
    const handleExportInventory = () => {
        try {
            // Get the location name for the filename
            const locationName = selectedLocation === 'all'
                ? 'All_Locations'
                : locations.find(loc => loc.value === selectedLocation)?.label || selectedLocation;

            // Get the items to export (based on current filter)
            const itemsToExport = filteredInventory.length > 0 ? filteredInventory : inventory;

            if (itemsToExport.length === 0) {
                showToast('No inventory items to export', 'error');
                return;
            }

            // Export to Excel
            exportInventoryToExcel(itemsToExport, locationName);
            showToast(`Exported ${itemsToExport.length} items to Excel`, 'success');
        } catch (error) {
            console.error('Error exporting inventory:', error);
            showToast('Failed to export inventory. Please try again.', 'error');
        }
    };



    // Function to handle inventory import from Excel
    const handleImportInventory = () => {
        // Create a file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            console.log('File selected for import:', file.name);
            setIsImporting(true);

            // Set timeout for file parsing (30 seconds)
            const parseTimeout = setTimeout(() => {
                console.error('File parsing timeout');
                showToast('Import is taking too long. Please try with a smaller file.', 'error');
                setIsImporting(false);
            }, 30000);

            importInventoryFromExcel(
                file,
                async (updates) => {
                    // Success callback - process the updates
                    clearTimeout(parseTimeout);
                    console.log('File parsed successfully, found', updates.length, 'updates');

                    try {
                        await processInventoryUpdates(updates);
                    } catch (error) {
                        console.error('Error processing updates:', error);
                        showToast(`Failed to update inventory: ${error.message}`, 'error');
                    } finally {
                        setIsImporting(false);
                    }
                },
                (errorMessage) => {
                    // Error callback
                    clearTimeout(parseTimeout);
                    console.error('Import error:', errorMessage);
                    showToast(errorMessage, 'error');
                    setIsImporting(false);
                }
            );
        };

        // Trigger file selection
        input.click();
    };

    // Function to process inventory updates from Excel
    const processInventoryUpdates = async (updates) => {
        if (!updates || updates.length === 0) {
            showToast('No updates to process', 'error');
            setIsImporting(false);
            return;
        }

        console.log('Processing inventory updates:', updates.length, 'items');
        console.log('Updates to process:', updates);

        // Show confirmation modal
        let confirmed = false;
        try {
            console.log('Showing confirmation modal...');

            // Check if ModalManager is available
            if (!window.ModalManager || typeof window.ModalManager.createCenterModal !== 'function') {
                console.warn('ModalManager not available, using fallback confirmation');
                // Skip confirmation and proceed directly
                const shouldProceed = confirm(`Import ${updates.length} item(s)? This will update your inventory.`);
                if (!shouldProceed) {
                    console.log('Import cancelled by user (fallback confirm)');
                    setIsImporting(false);
                    return;
                }
                confirmed = true;
            } else {
                confirmed = await showImportConfirmation(updates);
                console.log('Confirmation result:', confirmed);
            }
        } catch (error) {
            console.error('Error showing confirmation modal:', error);
            setIsImporting(false);
            showToast('Failed to show confirmation dialog', 'error');
            return;
        }

        if (!confirmed) {
            console.log('Import cancelled by user');
            setIsImporting(false);
            return;
        }

        console.log('Import confirmed, starting updates...');

        // Show progress modal
        let progressModal = null;
        try {
            if (window.ModalManager && typeof window.ModalManager.createCenterModal === 'function') {
                progressModal = showProgressModal(updates.length);
                console.log('Progress modal shown');
            } else {
                console.warn('ModalManager not available, skipping progress modal');
            }
        } catch (error) {
            console.error('Error showing progress modal:', error);
            // Continue without progress modal
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // Process each update
        for (let i = 0; i < updates.length; i++) {
            const update = updates[i];
            console.log(`Processing item ${i + 1}/${updates.length}:`, update.productName);

            // Update progress modal
            try {
                updateProgressModal(i + 1, updates.length, update.productName);
            } catch (error) {
                console.warn('Error updating progress modal:', error);
            }

            try {
                // Find the inventory item by ID
                const inventoryItem = inventory.find(item => item.id === update.id);

                if (!inventoryItem) {
                    // Try to find by name if ID doesn't match
                    const itemByName = inventory.find(item =>
                        item.name.toLowerCase().trim() === update.productName.toLowerCase().trim()
                    );

                    if (!itemByName) {
                        console.warn(`Item not found: ${update.productName} (ID: ${update.id})`);
                        errors.push(`Item not found: ${update.productName} (ID: ${update.id})`);
                        errorCount++;
                        continue;
                    }

                    // Update using the item found by name
                    console.log(`Updating ${update.productName} by name match`);
                    await updateInventoryQuantity(itemByName.id, update.stockToAdd, itemByName.name);
                } else {
                    // Update using the item found by ID
                    console.log(`Updating ${update.productName} by ID match`);
                    await updateInventoryQuantity(inventoryItem.id, update.stockToAdd, inventoryItem.name);
                }

                successCount++;
                console.log(`Successfully updated ${update.productName} (${successCount}/${updates.length})`);
            } catch (error) {
                console.error(`Error updating ${update.productName}:`, error);
                errors.push(`${update.productName}: ${error.message}`);
                errorCount++;
            }
        }

        console.log('All updates processed. Refreshing inventory...');

        // Close progress modal
        try {
            if (progressModal && progressModal.close) {
                progressModal.close();
                console.log('Progress modal closed');
            }
        } catch (error) {
            console.warn('Error closing progress modal:', error);
        }

        // Refresh inventory after updates
        try {
            await refreshProducts();
            console.log('Inventory refreshed successfully');
        } catch (refreshError) {
            console.error('Error refreshing products:', refreshError);
            showToast('Updates applied but failed to refresh view. Please reload the page.', 'warning');
        }

        // Show results
        if (successCount > 0) {
            showToast(`Successfully updated ${successCount} item(s)`, 'success');
        }

        if (errorCount > 0) {
            showToast(`Failed to update ${errorCount} item(s). Check console for details.`, 'error');
            console.error('Import errors:', errors);
        }

        console.log('Import process complete');
        setIsImporting(false);
    };

    // Function to show progress modal
    const showProgressModal = (total) => {
        const modalContent = `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <div class="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800">Importing Inventory</h3>
                        <p class="text-sm text-gray-600">Please wait while we update your items...</p>
                    </div>
                </div>
                
                <div class="mb-4">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-600" id="progress-text">Processing 0 of ${total} items...</span>
                        <span class="text-gray-600" id="progress-percent">0%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div id="progress-bar" class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-2" id="current-item"></p>
                </div>
            </div>
        `;

        return window.ModalManager?.createCenterModal(modalContent, {
            showCloseButton: false,
            closeOnOutsideClick: false
        });
    };

    // Function to update progress modal
    const updateProgressModal = (current, total, itemName) => {
        const percent = Math.round((current / total) * 100);

        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        const progressPercent = document.getElementById('progress-percent');
        const currentItem = document.getElementById('current-item');

        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `Processing ${current} of ${total} items...`;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (currentItem) currentItem.textContent = `Current: ${itemName}`;
    };

    // Function to update inventory quantity
    const updateInventoryQuantity = async (itemId, stockToAdd, itemName) => {
        console.log(`Updating inventory item: ${itemName || itemId}, Stock to Add: ${stockToAdd}`);

        const inventoryRef = sdk.db.collection("Inventory");
        const itemDoc = await inventoryRef.doc(itemId).get();

        if (!itemDoc.exists) {
            throw new Error('Item not found in database');
        }

        const itemData = itemDoc.data();
        const currentQuantity = Number(itemData.quantity || 0);
        const newQuantity = Math.max(0, currentQuantity + stockToAdd);

        console.log(`Item: ${itemData.name}, Current: ${currentQuantity}, Change: ${stockToAdd}, New: ${newQuantity}`);

        // Update the quantity
        await inventoryRef.doc(itemId).update({
            quantity: newQuantity,
            updatedAt: new Date(),
            lastUpdated: new Date().toISOString()
        });

        console.log(`Database updated for ${itemData.name}`);

        // Log the stock change
        try {
            const stockCollection = stockToAdd > 0 ? 'StockIn' : 'StockOut';
            const logData = {
                itemId: itemId,
                itemName: itemData.name,
                previousQuantity: currentQuantity,
                newQuantity: newQuantity,
                reason: 'Excel Import',
                notes: 'Imported from Excel file',
                date: new Date(),
                recordedBy: 'user',
                itemType: 'inventory'
            };

            // Add the appropriate quantity field based on whether we're adding or removing stock
            if (stockToAdd > 0) {
                logData.quantityIn = stockToAdd;
            } else {
                logData.quantityOut = Math.abs(stockToAdd);
            }

            await sdk.db.collection(stockCollection).add(logData);
            console.log(`Transaction logged for ${itemData.name}`);
        } catch (logError) {
            console.error('Error logging transaction:', logError);
            // Don't throw error for logging failures, continue with update
        }
    };

    // Function to show import confirmation modal
    const showImportConfirmation = (updates) => {
        console.log('Creating confirmation modal for', updates.length, 'items');

        return new Promise((resolve, reject) => {
            try {
                const modalContent = `
                    <div class="p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                <i class="ph ph-file-arrow-up text-blue-600 text-2xl"></i>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-gray-800">Confirm Import</h3>
                                <p class="text-sm text-gray-600">Review the changes before importing</p>
                            </div>
                        </div>
                        
                        <div class="mb-4 p-3 bg-blue-50 rounded-lg">
                            <p class="text-sm font-medium text-gray-700 mb-2">
                                Found <strong>${updates.length}</strong> item(s) to update:
                            </p>
                            <div class="max-h-48 overflow-y-auto space-y-2">
                                ${updates.slice(0, 10).map(update => `
                                    <div class="text-xs bg-white p-2 rounded border border-gray-200">
                                        <div class="font-medium text-gray-800">${update.productName}</div>
                                        <div class="text-gray-600 mt-1">
                                            Stock to Add: <span class="font-semibold ${update.stockToAdd >= 0 ? 'text-green-600' : 'text-red-600'}">
                                                ${update.stockToAdd >= 0 ? '+' : ''}${update.stockToAdd}
                                            </span>
                                        </div>
                                    </div>
                                `).join('')}
                                ${updates.length > 10 ? `
                                    <div class="text-xs text-gray-500 text-center py-2">
                                        ... and ${updates.length - 10} more items
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        
                        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                            <div class="flex gap-2">
                                <i class="ph ph-warning text-yellow-600 mt-0.5"></i>
                                <div class="text-xs text-yellow-800">
                                    <strong>Warning:</strong> This will update your inventory quantities. 
                                    Make sure the Excel file is correct before proceeding.
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex gap-3 justify-end">
                            <button id="cancel-import" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancel
                            </button>
                            <button id="confirm-import" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                                Import ${updates.length} Item(s)
                            </button>
                        </div>
                    </div>
                `;

                console.log('Creating modal with ModalManager...');
                const modal = window.ModalManager?.createCenterModal(modalContent, {
                    showCloseButton: true,
                    onClose: () => {
                        console.log('Modal closed via X button');
                        resolve(false);
                    }
                });

                if (!modal) {
                    console.error('Failed to create modal');
                    reject(new Error('Failed to create confirmation modal'));
                    return;
                }

                console.log('Modal created, setting up event listeners...');

                // Add event listeners with timeout to ensure DOM is ready
                setTimeout(() => {
                    const cancelBtn = document.getElementById('cancel-import');
                    const confirmBtn = document.getElementById('confirm-import');

                    if (!cancelBtn || !confirmBtn) {
                        console.error('Modal buttons not found in DOM');
                        reject(new Error('Modal buttons not found'));
                        return;
                    }

                    console.log('Event listeners attached to modal buttons');

                    cancelBtn.addEventListener('click', () => {
                        console.log('Cancel button clicked');
                        modal?.close();
                        resolve(false);
                    });

                    confirmBtn.addEventListener('click', () => {
                        console.log('Confirm button clicked');
                        modal?.close();
                        resolve(true);
                    });
                }, 100);

                // Fallback timeout - auto-reject after 60 seconds if no user action
                setTimeout(() => {
                    console.warn('Confirmation modal timeout - no user response after 60 seconds');
                    reject(new Error('Confirmation modal timeout'));
                }, 60000);

            } catch (error) {
                console.error('Error in showImportConfirmation:', error);
                reject(error);
            }
        });
    };

    // Define a function to refresh products and make it available globally
    const refreshProducts = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch products (get all products, we'll sort in JavaScript)
            const productsSnapshot = await sdk.db.collection("Product").get();

            // More robust handling of product creation
            const productsList = [];
            for (const doc of productsSnapshot.docs) {
                try {
                    const product = Product.fromDoc(doc);
                    if (product) {
                        productsList.push(product);
                    }
                } catch (productError) {
                    console.error(`Error creating product from doc ${doc.id}:`, productError);
                    // Continue with other products
                }
            }

            // Sort products by creation date (newest first)
            productsList.sort((a, b) => {
                const dateA = a.date || a.updatedAt || new Date(0);
                const dateB = b.date || b.updatedAt || new Date(0);
                return new Date(dateB) - new Date(dateA);
            });

            setProducts(productsList);
            console.log(`Successfully loaded ${productsList.length} products`);

            // Fetch inventory items (remove limit to get all items)
            const inventorySnapshot = await sdk.db.collection("Inventory")
                .orderBy("updatedAt", "desc")
                .get();

            // More robust handling of inventory item creation
            const inventoryList = [];
            for (const doc of inventorySnapshot.docs) {
                try {
                    const data = doc.data();
                    // Handle date conversions for Firestore Timestamps
                    const processedData = {
                        id: doc.id,
                        name: data.name || '',
                        quantity: Number(data.quantity || 0),
                        unit: data.unit || '',
                        minQuantity: Number(data.minQuantity || 0),
                        date: data.date?.toDate ? data.date.toDate() : new Date(),
                        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
                        lastUpdated: data.lastUpdated || (data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString()),
                        vendorName: data.vendorName || '',
                        vendorCompany: data.vendorCompany || '',
                        vendorGst: data.vendorGst || '',
                        vendorContact: data.vendorContact || '',
                        vendorAddress: data.vendorAddress || '',
                        perKgCost: Number(data.perKgCost || 0),
                        // New fields for enhanced inventory management
                        location: data.location || 'main',
                        expiryDate: data.expiryDate || null,
                        batchNumber: data.batchNumber || '',
                        notes: data.notes || '',
                        supplierId: data.supplierId || '',
                        purchaseOrderId: data.purchaseOrderId || ''
                    };

                    const item = new InventoryItem(processedData);
                    if (item) {
                        inventoryList.push(item);
                    }
                } catch (inventoryError) {
                    console.error(`Error creating inventory item from doc ${doc.id}:`, inventoryError);
                    // Continue with other inventory items
                }
            }

            // Log each inventory item loaded in Products.js
            console.log("Inventory items loaded in Products.js:");
            inventoryList.forEach((item, index) => {
                console.log(`Inventory tab item ${index}:`, item.name, item.id);
            });

            setInventory(inventoryList);
            console.log(`Successfully loaded ${inventoryList.length} inventory items`);

            // Extract unique categories and count products in each
            const categoryCounts = productsList.reduce((acc, product) => {
                const cat = product.cat || 'Uncategorized';
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
            }, {});

            // Format categories with counts and sort alphabetically
            const formattedCategories = Object.entries(categoryCounts)
                .sort((a, b) => a[0].localeCompare(b[0])) // Sort by category name alphabetically
                .map(([name, count]) => ({
                    name,
                    count,
                    id: name.toLowerCase()
                }));

            setCategories(formattedCategories);
            if (formattedCategories.length > 0 && !formattedCategories.find(c => c.name === selectedCategory)) {
                setSelectedCategory(formattedCategories[0].name);
            }

            setLoading(false);
        } catch (err) {
            console.error('Error fetching product data:', err);
            setError(`Failed to load product data: ${err.message}`);
            setLoading(false);
        }
    };


    // Make the refreshProducts function available globally
    window.refreshProducts = refreshProducts;

    // Load suggested purchase orders
    const loadSuggestedOrders = async () => {
        try {
            const suggestions = await getSuggestedPurchaseOrders();
            setSuggestedOrders(suggestions);
        } catch (error) {
            console.error('Error loading suggested orders:', error);
        }
    };

    useEffect(() => {
        // Load product data on initial render
        refreshProducts();
        loadSuggestedOrders();

        // Load locations from service
        locationService.loadLocations();
    }, []);

    // Subscribe to location changes
    useEffect(() => {
        const unsubscribe = locationService.subscribe((updatedLocations) => {
            setLocations(locationService.getLocationOptions());
        });

        return unsubscribe;
    }, []);

    // Listen for currency changes and trigger UI refresh
    useEffect(() => {
        const handleCurrencyChanged = (event) => {
            console.log('[Products] Currency changed event received, refreshing UI...', event.detail);
            // Force state update to trigger re-render of inventory cards
            setActiveTab(prev => prev);
        };

        window.addEventListener('currencyChanged', handleCurrencyChanged);

        return () => {
            window.removeEventListener('currencyChanged', handleCurrencyChanged);
        };
    }, []);

    // Filter inventory items based on search query and location
    const filteredInventory = useMemo(() => {
        try {
            if (!Array.isArray(inventory)) {
                return [];
            }

            let filtered = inventory;

            // Filter by location
            if (selectedLocation !== 'all') {
                filtered = filtered.filter(item => {
                    if (!item || typeof item !== 'object') {
                        return false;
                    }
                    return item.location === selectedLocation;
                });
            }

            // Filter by search query
            if (searchQuery && searchQuery.trim() !== '') {
                const searchTerm = searchQuery.toLowerCase().trim();
                filtered = filtered.filter(item => {
                    if (!item || typeof item !== 'object') {
                        return false;
                    }

                    const itemName = item.name || item.title || '';
                    const itemDescription = item.description || '';
                    return itemName.toLowerCase().includes(searchTerm) ||
                        itemDescription.toLowerCase().includes(searchTerm);
                });
            }

            return filtered;
        } catch (error) {
            console.error("Error filtering inventory:", error);
            return [];
        }
    }, [inventory, searchQuery, selectedLocation]);

    // Filter products based on search query and category
    const filteredProducts = useMemo(() => {
        try {
            // Ensure products is a valid array
            if (!Array.isArray(products)) {
                console.warn("Products is not an array in Products.js:", products);
                return [];
            }

            // Start with all valid products
            let filtered = products.filter(product => {
                // Ensure product exists and has required properties
                if (!product || typeof product !== 'object') {
                    console.warn("Invalid product object in Products.js:", product);
                    return false;
                }
                return true;
            });

            // If there's a search query, apply search filter FIRST across all categories
            if (productSearchQuery && productSearchQuery.trim() !== '') {
                const searchTerm = productSearchQuery.toLowerCase().trim();

                filtered = filtered.filter(product => {
                    try {
                        // Use both 'title' and 'name' properties to be safe
                        const productTitle = (product.title || '').toString().toLowerCase();
                        const productName = (product.name || '').toString().toLowerCase();
                        const productDescription = (product.description || '').toString().toLowerCase();

                        return productTitle.includes(searchTerm) ||
                            productName.includes(searchTerm) ||
                            productDescription.includes(searchTerm);
                    } catch (searchError) {
                        console.error("Error searching product:", product, searchError);
                        return false;
                    }
                });
            } else {
                // Only apply category filter if there's no search query
                if (selectedCategory) {
                    filtered = filtered.filter(product => {
                        const productCategory = product.cat || '';
                        return productCategory === selectedCategory;
                    });
                }
            }

            // Sort products
            try {
                switch (sortBy) {
                    case 'name':
                        filtered.sort((a, b) => {
                            // Use title as primary, name as fallback
                            const nameA = (a.title || a.name || '').toString();
                            const nameB = (b.title || b.name || '').toString();
                            return nameA.localeCompare(nameB);
                        });
                        break;
                    case 'price':
                        filtered.sort((a, b) => {
                            const priceA = parseFloat(a.price) || 0;
                            const priceB = parseFloat(b.price) || 0;
                            return priceA - priceB;
                        });
                        break;
                    case 'recent':
                    default:
                        // Sorting by date is the default from the query
                        break;
                }
            } catch (sortError) {
                console.error("Error sorting products:", sortError);
            }

            return filtered;
        } catch (error) {
            console.error("Error filtering products in Products.js:", error);
            return [];
        }
    }, [products, productSearchQuery, selectedCategory, sortBy]);

    const handleSaveInventory = async (itemData) => {
        try {
            if (editingItem) {
                // Update existing item
                const updatedItem = new InventoryItem({
                    ...editingItem,
                    ...itemData,
                    quantity: Number(itemData.quantity),
                    minQuantity: Number(itemData.minQuantity),
                    updatedAt: new Date(),
                    lastUpdated: new Date().toISOString()
                });

                const updatedInventory = inventory.map(item =>
                    item.id === editingItem.id ? updatedItem : item
                );
                setInventory(updatedInventory);

                // Update in Firestore
                await sdk.db.collection("Inventory").doc(editingItem.id).update({
                    name: itemData.name,
                    quantity: Number(itemData.quantity),
                    unit: itemData.unit,
                    minQuantity: Number(itemData.minQuantity),
                    updatedAt: new Date(),
                    lastUpdated: new Date().toISOString(),
                    vendorName: itemData.vendorName,
                    vendorCompany: itemData.vendorCompany,
                    vendorGst: itemData.vendorGst,
                    vendorContact: itemData.vendorContact,
                    vendorAddress: itemData.vendorAddress,
                    perKgCost: itemData.perKgCost
                });
                showToast('Inventory item updated successfully', 'success');
            } else {
                // Add new item - prevent duplicates by checking if item already exists
                const newItemData = new InventoryItem({
                    ...itemData,
                    quantity: Number(itemData.quantity),
                    minQuantity: Number(itemData.minQuantity),
                    date: new Date(),
                    updatedAt: new Date(),
                    lastUpdated: new Date().toISOString()
                });

                // Check if item with same name and location already exists
                const existingItem = inventory.find(item =>
                    item.name === itemData.name &&
                    item.location === (itemData.location || 'main')
                );

                if (existingItem) {
                    showToast('Item with this name already exists at this location', 'error');
                    return;
                }

                // Add to Firestore
                const newItemRef = sdk.db.collection("Inventory").doc();
                await newItemRef.set(newItemData.toJson());

                newItemData.id = newItemRef.id;
                setInventory(prevInventory => [...prevInventory, newItemData]);
                showToast('Inventory item added successfully', 'success');
            }
            setIsAddModalOpen(false);
            setEditingItem(null);
        } catch (err) {
            console.error('Error saving inventory:', err);
            showToast('Failed to save inventory item', 'error');
        }
    };

    const handleDeleteInventory = async (itemId) => {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            const updatedInventory = inventory.filter(item => item.id !== itemId);
            setInventory(updatedInventory);

            // Delete from Firestore
            await sdk.db.collection("Inventory").doc(itemId).delete();
            showToast('Inventory item deleted successfully', 'success');
        } catch (err) {
            console.error('Error deleting inventory:', err);
            showToast('Failed to delete inventory item', 'error');
        }
    };

    // Tab Button Component
    const TabButton = ({ isActive, onClick, children }) => {
        return (
            <button
                className={`px-3 md:px-6 py-1.5 md:py-2 rounded-full transition-colors text-sm ${isActive
                    ? 'bg-red-100 text-red-700'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                onClick={onClick}
            >
                {children}
            </button>
        );
    };

    // Category Tab Component
    const CategoryTab = ({ category, isActive, onClick }) => {
        return (
            <button
                className={`flex-shrink-0 transition-colors relative py-1 md:py-2 text-xs md:text-sm ${isActive
                    ? 'text-red-600 font-medium'
                    : 'text-gray-600 hover:text-red-600'
                    }`}
                onClick={onClick}
            >
                <span className="whitespace-nowrap">
                    {`${category.name} ${category.count > 0 ? `(${category.count})` : ''}`}
                </span>
                {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
                )}
            </button>
        );
    };

    // Search Bar Component - Memoized to prevent unnecessary re-renders
    const SearchBar = useMemo(() => {
        return ({ value, onChange, placeholder }) => {
            const handleInputChange = (e) => {
                const newValue = e.target.value;
                onChange(newValue);
            };

            return (
                <div className="flex items-center gap-2 md:gap-4 mb-4 md:mb-6 bg-white p-2 md:p-4 rounded-lg shadow-sm">
                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <i className="ph ph-magnifying-glass absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={value || ''}
                            onChange={handleInputChange}
                            placeholder={placeholder}
                            className="w-full text-sm pl-7 md:pl-10 pr-2 md:pr-4 py-2 md:py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            autoComplete="off"
                        />
                    </div>
                </div>
            );
        };
    }, []);

    // Function to open product form modal
    const openProductFormModal = () => {
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
                    root.unmount();
                    // Refresh products data after modal is closed
                    refreshProducts();
                },
                product: null, // null for add new product
                refreshProducts: refreshProducts
            })
        );
    };

    // Get the correct ProductCard component
    const ProductCardComponent = ProductCard || ProductCard;

    if (loading) {
        return (
            <div className="p-4 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-600">{error}</div>
        );
    }

    return (
        <div className="p-2 md:p-4">
            {/* Top Tabs (Products/Inventory) */}
            <div className="flex items-center gap-1 md:gap-2 mb-3 md:mb-6 flex-wrap">
                <TabButton
                    isActive={activeTab === 'products'}
                    onClick={() => setActiveTab('products')}
                >
                    <i className="ph ph-package text-base mr-1 md:mr-2"></i>
                    <span>{t('products')}</span>
                </TabButton>
                <TabButton
                    isActive={activeTab === 'inventory'}
                    onClick={() => setActiveTab('inventory')}
                >
                    <i className="ph ph-clipboard-text text-base mr-1 md:mr-2"></i>
                    <span>{t('inventory')}</span>
                </TabButton>
                <TabButton
                    isActive={activeTab === 'enhanced'}
                    onClick={() => {
                        setActiveTab('enhanced');
                        setIsEnhancedModalOpen(true);
                    }}
                >
                    <i className="ph ph-gear text-base mr-1 md:mr-2"></i>
                    <span>Enhanced</span>
                </TabButton>
                <TabButton
                    isActive={activeTab === 'suppliers'}
                    onClick={() => {
                        setActiveTab('suppliers');
                        setIsSuppliersModalOpen(true);
                    }}
                >
                    <i className="ph ph-users text-base mr-1 md:mr-2"></i>
                    <span>Suppliers</span>
                </TabButton>
                <TabButton
                    isActive={activeTab === 'locations'}
                    onClick={() => {
                        setActiveTab('locations');
                        setIsLocationModalOpen(true);
                    }}
                >
                    <i className="ph ph-map-pin text-base mr-1 md:mr-2"></i>
                    <span>Locations</span>
                </TabButton>

                {/* Spacer to push buttons to the right */}
                <div className="flex-1"></div>

                {/* Action Buttons - Positioned at top right */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                        onClick={openProductFormModal}
                    >
                        <i className={`ph ph-${activeTab === 'products' ? 'package-plus' : 'plus'} text-base`} />
                        <span className="inline">
                            {activeTab === 'products' ? t('addProduct') : t('addItem')}
                        </span>
                    </button>


                </div>
            </div>



            {/* Suggested Orders Alert */}
            {suggestedOrders.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <i className="ph ph-warning text-yellow-600"></i>
                            <span className="font-medium text-yellow-800">
                                Low Stock Alert: {suggestedOrders.length} items need reordering
                            </span>
                        </div>
                        <button
                            onClick={() => setIsSuppliersModalOpen(true)}
                            className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition-colors"
                        >
                            Create Order
                        </button>
                    </div>
                    <div className="mt-2 text-sm text-yellow-700">
                        {suggestedOrders.slice(0, 3).map(item => (
                            <span key={item.itemId}>
                                {item.itemName} (need {item.suggestedQuantity} {item.unit})
                                {suggestedOrders.indexOf(item) < 2 && ', '}
                            </span>
                        ))}
                        {suggestedOrders.length > 3 && '...'}
                    </div>
                </div>
            )}

            {/* Show different content based on active tab */}
            {activeTab === 'products' ? (
                <>
                    {/* Search Bar for Products */}
                    <SearchBar
                        value={productSearchQuery}
                        onChange={handleProductSearchChange}
                        placeholder={t('searchProductsByNameOrDescription')}
                    />

                    {/* Category Navigation for Products - Hidden when search is active */}
                    {(!productSearchQuery || productSearchQuery.trim() === '') && (
                        <CategorySlider
                            categories={categories}
                            selectedCategory={selectedCategory}
                            onCategorySelect={setSelectedCategory}
                            variant="default"
                        />
                    )}

                    {/* Search Results Count - Shown when search is active */}
                    {productSearchQuery && productSearchQuery.trim() !== '' && (
                        <div className="mb-4">
                            <p className="text-sm text-gray-600">
                                {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    )}

                    {/* Products List - Changed to Grid Layout */}
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3 lg:gap-4 mt-4">
                        {filteredProducts.map(product => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                refreshProducts={refreshProducts}
                            />
                        ))}
                        {filteredProducts.length === 0 && (
                            <div className="col-span-full p-8 text-center bg-white rounded-lg shadow-sm">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
                                    <i className="ph ph-package text-red-500 text-3xl"></i>
                                </div>
                                <h3 className="text-lg font-medium text-gray-800">{t('noProductsFound')}</h3>
                                <p className="text-gray-500 mt-2">
                                    {productSearchQuery
                                        ? `${t('noProductsMatching')} "${productSearchQuery}" ${t('inTheSelectedCategory')}.`
                                        : `${t('noProductsInCategory')} "${selectedCategory}" ${t('category')}.`
                                    }
                                </p>
                                <button
                                    className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors inline-flex items-center gap-2"
                                    onClick={openProductFormModal}
                                >
                                    <i className="ph ph-plus"></i>
                                    {t('addProductButton')}
                                </button>
                            </div>
                        )}
                    </div>
                </>
            ) : activeTab === 'inventory' ? (
                <>
                    {/* Search Bar for Inventory */}
                    <SearchBar
                        value={searchQuery}
                        onChange={handleInventorySearchChange}
                        placeholder={t('searchInventoryItems')}
                    />

                    {/* Inventory Content */}
                    <div className="bg-white rounded-lg shadow-sm p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-gray-700">Location:</label>
                                    <select
                                        value={selectedLocation}
                                        onChange={(e) => setSelectedLocation(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                    >
                                        <option value="all">All Locations</option>
                                        {locations.map(location => (
                                            <option key={location.value} value={location.value}>
                                                {location.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-gray-700">Sort by:</label>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                    >
                                        <option value="recent">Recently Added</option>
                                        <option value="name">Name</option>
                                        <option value="lowStock">Low Stock</option>
                                        <option value="highStock">High Stock</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={handleExportInventory}
                                    className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 text-sm"
                                >
                                    <i className="ph ph-file-arrow-down"></i>
                                    <span className="hidden md:inline">Export</span>
                                </button>
                                <button
                                    onClick={handleImportInventory}
                                    disabled={isImporting}
                                    className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                                >
                                    <i className={`ph ph-${isImporting ? 'spinner-gap' : 'file-arrow-up'} ${isImporting ? 'animate-spin' : ''}`}></i>
                                    <span className="hidden md:inline">
                                        {isImporting ? 'Importing...' : 'Import'}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setIsStockInOutModalOpen(true)}
                                    className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 text-sm"
                                >
                                    <i className="ph ph-arrows-left-right"></i>
                                    <span className="hidden md:inline">Stock In/Out</span>
                                </button>
                            </div>
                        </div>

                        {filteredInventory.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
                                    <i className="ph ph-clipboard-text text-red-500 text-3xl"></i>
                                </div>
                                <h3 className="text-lg font-medium text-gray-800 mb-2">No inventory items found</h3>
                                <p className="text-gray-500 mb-6">
                                    {searchQuery
                                        ? `No inventory items match your search for "${searchQuery}".`
                                        : 'Get started by adding your first inventory item.'
                                    }
                                </p>
                                <button
                                    onClick={() => setIsEnhancedModalOpen(true)}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors inline-flex items-center gap-2"
                                >
                                    <i className="ph ph-plus"></i>
                                    Add Item
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min Qty</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {filteredInventory.map((item) => (
                                            <InventoryCard
                                                key={item.id}
                                                item={item}
                                                refreshInventory={refreshProducts}
                                                onTransfer={(item) => {
                                                    setTransferItem(item);
                                                    setIsTransferModalOpen(true);
                                                }}
                                                onStockInOut={(item, type) => {
                                                    setStockInOutItem(item);
                                                    setStockInOutType(type);
                                                    setIsStockInOutModalOpen(true);
                                                }}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            ) : activeTab === 'enhanced' ? (
                <EnhancedInventoryModal
                    isOpen={isEnhancedModalOpen}
                    onClose={() => setIsEnhancedModalOpen(false)}
                    refreshInventory={refreshProducts}
                />
            ) : activeTab === 'suppliers' ? (
                <SuppliersOrdersModal
                    isOpen={isSuppliersModalOpen}
                    onClose={() => setIsSuppliersModalOpen(false)}
                    refreshData={refreshProducts}
                />
            ) : activeTab === 'locations' ? (
                <LocationManagementModal
                    isOpen={isLocationModalOpen}
                    onClose={() => setIsLocationModalOpen(false)}
                    refreshData={refreshProducts}
                />
            ) : null}
        </div>
    );
}
