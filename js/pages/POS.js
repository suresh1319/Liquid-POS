import { useState, useEffect, useRef, useMemo } from 'react';
import { showToast, formatProductTitle } from '../utils.js';
import { UserSession } from '../utils/UserSession.js';
import { OrderStatus } from '../models/OrderStatus.js';
import { PaymentMode } from '../models/PaymentMode.js';
import { sdk } from '../sdk.js';
import { ModalManager } from '../components/ModalManager.js';
import { CategorySlider } from '../components/CategorySlider.js';
import { useLanguage } from '../contexts/LanguageContext.js';
// ...existing code...

export function POS({ title, tableId, order, variant, checkout = false, includeAllProducts = true, onClose }) {
    const { t } = useLanguage();
    const [cart, setCart] = useState({});
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearchPanel, setShowSearchPanel] = useState(false);
    const [showRawItemPanel, setShowRawItemPanel] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const dialogRef = useRef(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    // Check for mobile/desktop on resize
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Load products
    useEffect(() => {
        loadProducts();
    }, []);

    // Load products from Firestore
    const loadProducts = async () => {
        try {
            console.log("Loading products for order:", order?.id, "includeAllProducts:", includeAllProducts);
            const snapshot = await sdk.db.collection("Product").get();
            let allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            console.log("Total products before filtering:", allProducts.length);

            // Only filter out existing products if includeAllProducts is false
            if (!includeAllProducts && order && order.items && Array.isArray(order.items)) {
                const existingProductIds = order.items.map(item => item.pid);
                console.log("Existing product IDs in order:", existingProductIds);

                // Filter out products that are already in the order
                const productsBeforeFilter = allProducts.length;
                allProducts = allProducts.filter(product =>
                    !existingProductIds.includes(product.id)
                );
                console.log(`Filtered out ${productsBeforeFilter - allProducts.length} existing products`);

                // Log the products that were filtered out
                const filteredOut = productsBeforeFilter - allProducts.length;
                if (filteredOut > 0) {
                    console.log("Products filtered out:",
                        snapshot.docs
                            .map(doc => ({ id: doc.id, ...doc.data() }))
                            .filter(p => existingProductIds.includes(p.id))
                            .map(p => p.title)
                    );
                }
            } else {
                console.log("Including all products as requested by flag");
            }

            // Remove inactive products
            const beforeInactiveFilter = allProducts.length;
            allProducts = allProducts.filter(p => p.active !== false);
            console.log(`Removed ${beforeInactiveFilter - allProducts.length} inactive products`);
            console.log("Final product count:", allProducts.length);

            setProducts(allProducts);
        } catch (error) {
            console.error("Error loading products:", error);
            showToast("Failed to load products", "error");
        } finally {
            setLoading(false);
        }
    };

    // Filter products based on category and search
    const filteredProducts = useMemo(() => {
        console.log("Filtering products. Total products:", products.length);
        console.log("Search query:", searchQuery);
        console.log("Selected category:", selectedCategory);

        // Specifically check for Fruit Salad in the products array
        const fruitSaladProducts = products.filter(p =>
            p.title.toLowerCase().includes('fruit salad')
        );
        console.log("Products with 'fruit salad' in title:", fruitSaladProducts.map(p => p.title));

        // Check if we have any products with "fruit" in the title
        if (searchQuery.toLowerCase().includes('fruit')) {
            const fruitProducts = products.filter(p =>
                p.title.toLowerCase().includes('fruit')
            );
            console.log("Products with 'fruit' in title:", fruitProducts.map(p => p.title));

            // If no fruit products found in the current products array
            if (fruitProducts.length === 0) {
                console.error("No fruit products found in the current products array. This might indicate filtering issues.");

                // Check if there might be fruit products in the order that were filtered out
                if (order && order.items && Array.isArray(order.items)) {
                    const fruitItemsInOrder = order.items.filter(item =>
                        item.title.toLowerCase().includes('fruit')
                    );
                    console.log("Fruit items already in order:", fruitItemsInOrder.map(i => i.title));
                }
            }
        }

        const filtered = products.filter(product => {
            const matchesCategory = selectedCategory === 'all' || product.cat === selectedCategory;
            const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });

        console.log("Filtered products count:", filtered.length);

        // If we're searching for something but got no results, provide more debug info
        if (searchQuery && filtered.length === 0) {
            console.error(`No products found matching "${searchQuery}". This might be due to filtering issues.`);
            console.log("All product titles for reference:", products.map(p => p.title));
        }

        return filtered;
    }, [products, selectedCategory, searchQuery]);

    // Get unique categories
    const categories = useMemo(() => {
        const uniqueCategories = new Set(products.map(p => p.cat));
        return ['all', ...Array.from(uniqueCategories)];
    }, [products]);

    // Show out-of-stock popup with options
    const showOutOfStockModal = async (product) => {
        return new Promise((resolve) => {
            const modalContent = `
                <div class="p-6 text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                        <i class="ph ph-warning-circle text-red-500 text-3xl"></i>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-800 mb-2">Product Out of Stock</h3>
                    <p class="text-gray-600 mb-1">
                        <span class="font-medium">${product.title}</span> is currently out of stock.
                    </p>
                    <p class="text-gray-500 mb-6 text-sm">
                        Would you like to prepare it on-demand for this order?
                    </p>
                    
                    <div class="space-y-3">
                        <button
                            id="prepare-on-demand-btn"
                            class="w-full py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-all duration-200 transform hover:scale-[1.02] shadow-md hover:shadow-lg"
                        >
                            <i class="ph ph-cooking-pot mr-2 text-lg"></i>
                            Prepare On-Demand
                        </button>
                        <button
                            id="skip-item-btn"
                            class="w-full py-3 bg-gray-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-gray-600 transition-all duration-200 transform hover:scale-[1.02] shadow-md hover:shadow-lg"
                        >
                            <i class="ph ph-x-circle mr-2 text-lg"></i>
                            Skip This Item
                        </button>
                    </div>
                    
                    <div class="mt-4 text-center text-xs text-gray-500">
                        <span class="flex items-center justify-center">
                            <i class="ph ph-info text-xs mr-1"></i>
                            On-demand items will be prepared fresh when ordered
                        </span>
                    </div>
                </div>
            `;

            ModalManager.createCenterModal({
                title: "",
                content: modalContent,
                onShown: (modalControl) => {
                    // Prepare on-demand
                    document.getElementById('prepare-on-demand-btn').addEventListener('click', () => {
                        modalControl.close();
                        resolve('prepare');
                    });

                    // Skip item
                    document.getElementById('skip-item-btn').addEventListener('click', () => {
                        modalControl.close();
                        resolve('skip');
                    });
                }
            });
        });
    };
    const handleAddToCart = async ({ product, quantity, variant, addons }) => {
        // Check if product is out of stock (pre-prepared with 0 stock)
        const isOutOfStock = product.inventoryDeductionMode === 'pre-prepared' && 
                            product.stock !== undefined && 
                            product.stock <= 0;

        if (isOutOfStock) {
            // Show out-of-stock modal and wait for user choice
            const userChoice = await showOutOfStockModal(product);
            
            if (userChoice === 'skip') {
                // User chose to skip this item
                showToast(`${product.title} was skipped`, 'info');
                return;
            } else if (userChoice === 'prepare') {
                // User chose to prepare on-demand - modify product temporarily for this order
                product = {
                    ...product,
                    inventoryDeductionMode: 'on-demand',
                    _tempOnDemand: true // Mark as temporarily converted
                };
                showToast(`${product.title} will be prepared on-demand`, 'success');
            }
        }

        // Handle unit calculation if present
        if (product.unitCalculation) {
            // Create a copy of the product with unit calculation data
            product = {
                ...product,
                // ...existing code...
                unitCalculation: product.unitCalculation,
                // Store the original product price for reference
                originalPrice: product.originalPrice || product.price
            };
        }
        // If a variant is selected, update the product price to match the variant price
        else if (variant && !product._priceUpdatedForVariant) {
            // Create a copy of the product with the price updated to the variant price
            product = {
                ...product,
                price: variant.price,
                mrp: variant.price, // Set the MRP to the variant price as well
                _priceUpdatedForVariant: true // Mark that we've updated the price for this product
            };
        }

        setCart(prevCart => {
            const cartItemId = variant
                ? `${product.id}_${variant.id}`
                : product.id;

            const existingItem = prevCart[cartItemId];

            if (existingItem) {
                return {
                    ...prevCart,
                    [cartItemId]: {
                        ...existingItem,
                        quantity: existingItem.quantity + (quantity || 1)
                    }
                };
            }

            // Ensure recipe items are properly included in the cart
            // The product object has 'recipe' field from database, but inventory.js expects 'recipeItems'
            const productForCart = {
                ...product,
                // Ensure both recipe and recipeItems are available for inventory deduction
                recipeItems: product.recipeItems || product.recipe || product.recipeList || []
            };

            return {
                ...prevCart,
                [cartItemId]: {
                    product: productForCart,
                    quantity: quantity || 1,
                    variant,
                    addons: addons || []
                }
            };
        });
    };

    // Handle removing item from cart
    const handleRemoveFromCart = (productId) => {
        setCart(prevCart => {
            const existingItem = prevCart[productId];
            if (!existingItem) return prevCart;

            // If quantity is 1, remove the item completely
            if (existingItem.quantity === 1) {
                const newCart = { ...prevCart };
                delete newCart[productId];
                return newCart;
            }

            // Otherwise, decrease the quantity by 1
            return {
                ...prevCart,
                [productId]: {
                    ...existingItem,
                    quantity: existingItem.quantity - 1
                }
            };
        });
    };

    // Handle updating item quantity
    const handleUpdateQuantity = (productId, quantity) => {
        if (quantity < 1) {
            handleRemoveFromCart(productId);
        } else {
            setCart(prevCart => ({
                ...prevCart,
                [productId]: {
                    ...prevCart[productId],
                    quantity
                }
            }));
        }
    };

    // Handle clearing cart
    const handleClearCart = () => {
        setCart({});
    };

    // Handle barcode scanning
    const handleScanBarcode = async () => {
        try {
            // TODO: Implement barcode scanning
            showToast("Barcode scanning not implemented yet");
        } catch (error) {
            console.error("Error scanning barcode:", error);
            showToast("Failed to scan barcode", "error");
        }
    };

    // Handle adding raw item
    const handleAddRawItem = () => {
        setShowRawItemPanel(true);
    };

    // Handle smooth closing animation
    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose && onClose();
        }, 300);
    };

    // Helper function to consolidate charges from all items
    const getConsolidatedCharges = (items) => {
        if (!items || !items.length) return [];

        // Extract all unique charges by name
        const chargeMap = {};

        items.forEach(item => {
            if (item.charges && Array.isArray(item.charges)) {
                item.charges.forEach(charge => {
                    if (charge.name) {
                        // Use charge name as key for consolidation
                        chargeMap[charge.name] = charge;
                    }
                });
            }
        });

        // Convert back to array
        return Object.values(chargeMap);
    };

    // Remove undefined recursively; ensure only Firestore-supported primitives are written
    const sanitizeForFirestore = (value) => {
        if (value === undefined) return undefined; // caller will skip keys with undefined
        if (value === null) return null;
        if (value instanceof Date) {
            return value; // Return Date objects directly for Firestore
        }
        if (Array.isArray(value)) {
            const arr = value
                .map((v) => sanitizeForFirestore(v))
                .filter((v) => v !== undefined);
            return arr;
        }
        if (typeof value === 'object') {
            const out = {};
            for (const key of Object.keys(value)) {
                const v = sanitizeForFirestore(value[key]);
                if (v !== undefined) out[key] = v;
            }
            return out;
        }
        if (typeof value === 'number' && !Number.isFinite(value)) return null;
        return value;
    };

    // Create a new order
const createOrder = async () => {
    const cartItems = Object.values(cart);





    try {
        const now = new Date();
        const orderId = order?.id || sdk.db.collection("Orders").doc().id;



            // Convert cart items to Order items format
            const items = Object.values(cart).map(cartItem => {
                const product = cartItem.product;
                let effectivePrice = cartItem.variant ? cartItem.variant.price : product.price;
                let addonsTotal = 0;
                let addonsData = [];

                if (cartItem.addons && cartItem.addons.length > 0) {
                    addonsTotal = cartItem.addons.reduce((sum, addon) => sum + addon.price, 0);
                    addonsData = cartItem.addons.map(addon => ({
                        id: addon.id,
                        name: addon.name,
                        price: addon.price
                    }));
                }

                // Create display title that includes variant name if present
                const displayTitle = cartItem.variant
                    ? `${product.title} (${cartItem.variant.name})`
                    : product.title;

                return {
                    pid: product.id,
                    title: displayTitle,  // Use the display title that includes variant
                    thumb: product.imgs && product.imgs.length > 0 ? product.imgs[0] : null,
                    cat: product.cat,
                    mrp: product.mrp || product.price, // MRP should be from the base product
                    price: effectivePrice + addonsTotal, // This is the crucial calculated price
                    basePrice: effectivePrice, // Store the base price separately
                    veg: product.veg,
                    served: false,
                    qnt: cartItem.quantity,
                    variantId: cartItem.variant?.id || null,
                    variantName: cartItem.variant?.name || null,
                    variantPrice: cartItem.variant?.price || null,
                    addons: addonsData, // Store selected add-ons
                    addonsTotal: addonsTotal, // Store total price of add-ons for clarity/breakdown if needed
                    charges: product.charges || [], // Preserve product-specific charges
                    unitPricing: product?.unitPricing ? { ...product.unitPricing } : undefined,
                    newlyAdded: true, // Mark this item as newly added for KOT printing
                    newlyAddedQty: cartItem.quantity // Track the newly added quantity
                };
            });

            // If we already have an order, merge the new items with existing ones
            let finalItems = items;
            if (order) {
                if (order.ref) {
                    // If we have a Firestore reference, use it
                    const orderDoc = await order.ref.get();
                    if (orderDoc.exists) {
                        const existingItems = orderDoc.data().items || [];

                        // Create a map of existing items by product ID
                        const existingItemsMap = {};
                        existingItems.forEach(item => {
                            existingItemsMap[item.pid] = item;
                        });

                        // Merge items with the same product ID by adding quantities
                        const mergedItems = [...existingItems];

                        items.forEach(newItem => {
                            const existingItem = existingItemsMap[newItem.pid];

                            if (existingItem) {
                                // Find the existing item in the array and update its quantity
                                const index = mergedItems.findIndex(item => item.pid === newItem.pid);
                                if (index !== -1) {
                                    mergedItems[index] = {
                                        ...mergedItems[index],
                                        qnt: (parseInt(mergedItems[index].qnt) || 0) + (parseInt(newItem.qnt) || 0),
                                        // Mark that this item was modified with new quantity
                                        newlyAdded: true,
                                        modifiedAt: new Date().toISOString(),
                                        // Track the newly added quantity separately for KOT printing
                                        newlyAddedQty: parseInt(newItem.qnt) || 0
                                    };
                                }
                            } else {
                                // Add as a new item
                                mergedItems.push(newItem);
                            }
                        });

                        finalItems = mergedItems;

                        // Update only the items field in the existing order (sanitized)
                        const sanitizedFinalItems = finalItems.map((it) => sanitizeForFirestore(it));
                        await order.ref.update({ items: sanitizedFinalItems });
                        showToast("Items added to order successfully");
                        handleClearCart();
                        handleClose();
                        return;
                    }
                } else {
                    // Fallback if no ref is provided
                    const existingItems = await sdk.db.collection("Orders").doc(orderId).get()
                        .then(doc => doc.exists ? doc.data().items : []);

                    // Create a map of existing items by product ID
                    const existingItemsMap = {};
                    existingItems.forEach(item => {
                        existingItemsMap[item.pid] = item;
                    });

                    // Merge items with the same product ID by adding quantities
                    const mergedItems = [...existingItems];

                    items.forEach(newItem => {
                        const existingItem = existingItemsMap[newItem.pid];

                        if (existingItem) {
                            // Find the existing item in the array and update its quantity
                            const index = mergedItems.findIndex(item => item.pid === newItem.pid);
                            if (index !== -1) {
                                mergedItems[index] = {
                                    ...mergedItems[index],
                                    qnt: (parseInt(mergedItems[index].qnt) || 0) + (parseInt(newItem.qnt) || 0),
                                    // Mark that this item was modified with new quantity
                                    newlyAdded: true,
                                    modifiedAt: new Date().toISOString(),
                                    // Track the newly added quantity separately for KOT printing
                                    newlyAddedQty: parseInt(newItem.qnt) || 0
                                };
                            }
                        } else {
                            // Add as a new item
                            mergedItems.push(newItem);
                        }
                    });

                    finalItems = mergedItems;
                }
            }

            // Create or update order in Firestore
            // Normalize variant name (map UI default-like labels to 'Default')
            const normalizedVariant = (() => {
                if (!variant) return null;
                const v = String(variant).trim();
                return (v === '⚡Default' || v.toLowerCase() === 'default') ? 'Default' : v;
            })();

            const orderData = {
                id: orderId,
                billNo: (() => {
                    try {
                        // Try to get from localStorage first
                        const storedBillNo = parseInt(localStorage.getItem('BILL_NO') || '0');
                        const newBillNo = storedBillNo + 1;
                        localStorage.setItem('BILL_NO', newBillNo.toString());
                        console.log(`POS generated bill number: ${newBillNo}`);
                        return newBillNo;
                    } catch (e) {
                        // If localStorage fails, use timestamp as fallback
                        const fallbackBillNo = Math.floor(Date.now() / 1000) % 10000;
                        console.log(`POS generated fallback bill number: ${fallbackBillNo}`);
                        return fallbackBillNo;
                    }
                })(),
                items: finalItems.map((it) => sanitizeForFirestore(it)),
                sellerId: UserSession?.seller?.id,
                // Preserve existing order's priceVariant if present; otherwise use the channel passed into POS
                priceVariant: (order?.priceVariant ?? normalizedVariant ?? null),
                tableId: tableId,
                discount: order?.discount || 0,
                paid: checkout, // Mark as paid if this is a checkout operation
                status: checkout ? [
                    {
                        label: OrderStatus.PLACED,
                        date: now
                    },
                    {
                        label: OrderStatus.KITCHEN,
                        date: now
                    },
                    {
                        label: OrderStatus.COMPLETED,
                        date: now
                    }
                ] : [
                    {
                        label: OrderStatus.PLACED,
                        date: now
                    },
                    {
                        label: OrderStatus.KITCHEN,
                        date: now
                    }
                ],
                currentStatus: {
                    label: checkout ? OrderStatus.COMPLETED : OrderStatus.KITCHEN,
                    date: now
                },
                charges: getConsolidatedCharges(finalItems) || UserSession?.seller?.charges || [],
                payMode: PaymentMode.CASH,
                date: now,
                total: (() => {
                    try {
                        return finalItems.reduce((sum, it) => sum + ((Number(it.price) || 0) * (Number(it.qnt) || 1)), 0);
                    } catch {
                        return undefined;
                    }
                })()
            };

            // Final sanitation pass for the whole order payload
            const cleanOrderData = sanitizeForFirestore(orderData);

            // Save to Firestore
            const ordersCol = sdk.db.collection("Orders");
            let savedOrderId = orderId;
            let persisted = false;
            let data = null;
            try {
                const orderDocRef = ordersCol.doc(orderId);
                await orderDocRef.set(order ? { items: orderData.items } : cleanOrderData, { merge: true });

                // Verify persistence, retry once with full payload if needed
                let verifySnap = await orderDocRef.get();
                persisted = !!(verifySnap && verifySnap.exists);
                data = persisted ? (typeof verifySnap.data === 'function' ? verifySnap.data() : verifySnap.data) : null;
                if (!persisted || !data || !Array.isArray(data.items) || data.items.length === 0) {
                    try {
                        await orderDocRef.set(cleanOrderData, { merge: true });
                        verifySnap = await orderDocRef.get();
                        persisted = !!(verifySnap && verifySnap.exists);
                        data = persisted ? (typeof verifySnap.data === 'function' ? verifySnap.data() : verifySnap.data) : null;
                    } catch (e) {
                        console.error('Retry write failed:', e);
                    }
                }
            } catch (setErr) {
                console.warn('Primary write failed, trying add()', setErr?.message || setErr);
            }

            // Fallback to add() if not persisted yet
            if (!persisted || !data || !Array.isArray(data.items) || data.items.length === 0) {
                try {
                    const addRef = await ordersCol.add(cleanOrderData);
                    savedOrderId = addRef && addRef.id ? addRef.id : savedOrderId;
                    const snap = await addRef.get();
                    persisted = !!(snap && snap.exists);
                    data = persisted ? (typeof snap.data === 'function' ? snap.data() : snap.data) : null;
                } catch (addErr) {
                    // Defensive: avoid crashing if console is unavailable or mismapped
                    try {
                        if (typeof window !== 'undefined' && window.console && typeof window.console.error === 'function') {
                            window.console.error('Fallback add() failed:', addErr?.message || addErr);
                        }
                    } catch (_) {}
                    // Provide immediate user feedback if fallback creation fails
                    try {
                        showToast(`Order save failed: ${addErr?.message || String(addErr)}`, "error");
                    } catch (_) {}
                }
            }

            // Track order creation/update with analytics only on success
            if (persisted && data && Array.isArray(data.items) && data.items.length > 0) {
                try {
                    if (sdk.analytics && typeof sdk.analytics.logEvent === 'function') {
                        sdk.analytics.logEvent(order ? 'order_updated' : 'order_created', {
                            order_id: savedOrderId,
                            table_id: tableId || 'direct',
                            order_type: OrderStatus.KITCHEN,
                            item_count: finalItems.length,
                            total_amount: data.total || orderData.total
                        });
                    }
                } catch (e) {
                    console.warn('Analytics logging failed:', e?.message || e);
                }
                showToast("Order saved successfully");
                handleClearCart();
                handleClose();
            } else {
                showToast("Order save verification failed", "error");
            }
        } catch (error) {
            console.error("Error creating order:", error);
            showToast("Failed to create order", "error");
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
                <div className="bg-white p-8 rounded-lg shadow-section" onClick={e => e.stopPropagation()}>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                </div>
            </div>
        );
    }

    // Determine the appropriate classes based on device width and animation state
    const getDialogClasses = () => {
        const baseClasses = "overflow-y-auto shadow-xl custom-scrollbar";

        if (isMobile) {
            // Mobile classes
            const mobileClasses = "fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[90vh] mobile-bottom-sheet";
            const animationClass = isClosing ? "translate-y-full" : "translate-y-0";
            return `${baseClasses} ${mobileClasses} transition-transform ${animationClass}`;
        } else {
            // Desktop classes
            const desktopClasses = "fixed top-0 right-0 h-full w-full md:w-2/3 lg:w-1/2 xl:w-2/5";
            const animationClass = isClosing ? "translate-x-full" : "translate-x-0";
            return `${baseClasses} ${desktopClasses} transition-transform ${animationClass} desktop-slide-in`;
        }
    };

    // Overlay classes
    const overlayClasses = `fixed inset-0 bg-black transition-opacity duration-300 z-50 ${isClosing ? 'bg-opacity-0' : 'bg-opacity-50'}`;

    return (
        <div className={overlayClasses} onClick={handleClose}>
            <div
                ref={dialogRef}
                className={getDialogClasses()}
                style={{ backgroundColor: "#fff8f8" }}
                onClick={e => e.stopPropagation()}
            >
                {/* Handle/Drag indicator for mobile */}
                {isMobile && (
                    <div className="w-full flex justify-center pt-2 pb-1">
                        <div className="mobile-drag-handle"></div>
                    </div>
                )}

                {/* Header */}
                <div className="sticky top-0 bg-white border-b z-10" style={{ backgroundColor: "#fff8f8" }}>
                    <div className="p-4 flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-gray-800">
                            {title || "New Order"}
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSearchPanel(true)}
                                className="p-2.5 bg-white hover:bg-red-50 rounded-full shadow-sm transition-colors flex items-center justify-center w-10 h-10"
                                aria-label="Search"
                            >
                                <i className="ph ph-magnifying-glass text-red-500 text-xl"></i>
                            </button>
                            <button
                                onClick={handleScanBarcode}
                                className="p-2.5 bg-white hover:bg-red-50 rounded-full shadow-sm transition-colors flex items-center justify-center w-10 h-10"
                                aria-label="Scan barcode"
                            >
                                <i className="ph ph-qr-code text-red-500 text-xl"></i>
                            </button>
                            <button
                                onClick={() => setShowRawItemPanel(true)}
                                className="p-2.5 bg-white hover:bg-red-50 rounded-full shadow-sm transition-colors flex items-center justify-center w-10 h-10"
                                aria-label="Add raw item"
                            >
                                <i className="ph ph-plus text-red-500 text-xl"></i>
                            </button>
                            <button
                                onClick={handleClose}
                                className="p-2.5 bg-white hover:bg-red-50 rounded-full shadow-sm transition-colors flex items-center justify-center w-10 h-10"
                                aria-label="Close"
                            >
                                <i className="ph ph-x text-red-500 text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex flex-col h-[calc(100%-200px)]">
                    {showSearchPanel ? (
                        <div className="space-y-4 p-4" style={{ backgroundColor: "#fffcfc" }}>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('searchProducts')}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 shadow-sm"
                                />
                                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                                <button
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    onClick={() => setShowSearchPanel(false)}
                                >
                                    <i className="ph ph-x"></i>
                                </button>
                            </div>

                            {/* Quick add section for existing items */}
                            {order && order.items && order.items.length > 0 && (
                                <div className="bg-blue-50 p-3 rounded-lg mb-4">
                                    <h3 className="text-sm font-medium text-blue-700 mb-2">
                                        <i className="ph ph-lightning mr-1"></i>
                                        Quick add existing items:
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {order.items.map((item, index) => (
                                            <button
                                                key={index}
                                                onClick={() => handleAddToCart({
                                                    product: {
                                                        id: item.pid,
                                                        title: item.title,
                                                        price: item.price,
                                                        mrp: item.mrp,
                                                        imgs: item.thumb ? [item.thumb] : [],
                                                        cat: item.cat,
                                                        veg: item.veg,
                                                        charges: item.charges
                                                    },
                                                    quantity: 1
                                                })}
                                                className="flex items-center gap-1 py-1.5 px-3 bg-white border border-blue-200 text-blue-700 rounded-full hover:bg-blue-100 transition-colors text-sm"
                                            >
                                                <i className="ph ph-plus text-xs"></i>
                                                <span>{formatProductTitle(item)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {filteredProducts.map(product => (
                                    <POSProductCard
                                        key={product.id}
                                        product={product}
                                        inCart={cart[product.id]?.quantity || 0}
                                        onAdd={(data) => handleAddToCart(data)}
                                        onRemove={() => handleRemoveFromCart(product.id)}
                                    />
                                ))}
                            </div>
                            {filteredProducts.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <p>No products found matching "{searchQuery}"</p>
                                    <p className="mt-2 text-sm">Total products available: {products.length}</p>
                                    {products.length > 0 && (
                                        <p className="mt-1 text-sm">
                                            Try checking for exact spelling or browsing all categories
                                        </p>
                                    )}
                                    {order && order.items && order.items.length > 0 && (
                                        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                                            <p className="text-blue-700 text-sm font-medium mb-2">
                                                <i className="ph ph-info mr-1"></i>
                                                Looking to add more of an existing item?
                                            </p>
                                            <p className="text-sm text-blue-600">
                                                Use the "Quick add existing items" buttons above to easily add more of items already in your order.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Category tabs */}
                            <CategorySlider 
                                categories={categories}
                                selectedCategory={selectedCategory}
                                onCategorySelect={setSelectedCategory}
                                variant="pos"
                            />

                            {/* Products grid */}
                            <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: "#fffcfc" }}>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {filteredProducts.map(product => (
                                        <POSProductCard
                                            key={product.id}
                                            product={product}
                                            inCart={cart[product.id]?.quantity || 0}
                                            onAdd={(data) => handleAddToCart(data)}
                                            onRemove={() => handleRemoveFromCart(product.id)}
                                        />
                                    ))}
                                    <button
                                        className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-pink-200 rounded-lg hover:border-red-400 hover:bg-pink-50 transition-colors"
                                        onClick={() => setShowRawItemPanel(true)}
                                    >
                                        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-2">
                                            <i className="ph ph-plus-circle text-3xl text-red-500"></i>
                                        </div>
                                        <span className="text-sm text-gray-600 font-medium">Add Quick Item</span>
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Checkout Section */}
                <div className="sticky bottom-0 bg-white border-t p-4" style={{ backgroundColor: "#fff8f8" }}>
                    <div className="mb-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-medium text-gray-700">{t('subtotal')}</h3>
                            <span className="font-medium text-red-600 text-lg">
                                {UserSession?.getCurrency()}{Object.values(cart).reduce((sum, item) => {
                                    // Use product price which already includes any variant price adjustments
                                    const basePrice = item.product.price;
                                    const addonsTotal = item.addons ? item.addons.reduce((acc, addon) => acc + addon.price, 0) : 0;
                                    return sum + (basePrice + addonsTotal) * item.quantity;
                                }, 0).toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                            <span>{t('itemsInCart')}</span>
                            <span>{Object.values(cart).reduce((sum, item) => sum + item.quantity, 0)} {t('items')}</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 font-medium"
                            onClick={handleClearCart}
                        >
                            <i className="ph ph-trash text-red-500"></i>
                            {t('clear')}
                        </button>
                        <button
      className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
      onClick={() => {
        const cartItems = Object.values(cart);

        
        if (cartItems.length === 0) {
          showToast("Please add at least one item to checkout", "error");
          return;
        }

       
        const hasValidQty = cartItems.some(item => item.quantity > 0);
        if (!hasValidQty) {
          showToast("Item quantity must be greater than zero", "error");
          return;
        }

       
        createOrder();
      }}
      disabled={Object.values(cart).length === 0}
    >
                            <i className="ph ph-check-circle"></i>
                            {checkout ? t('checkout') : t('saveOrder')}
                        </button>
                    </div>
                </div>

                {/* Raw Product Panel */}
                {showRawItemPanel && (
                    <RawProductPanel
                        onClose={() => setShowRawItemPanel(false)}
                        onAdd={(product) => {
                            handleAddToCart({ product, quantity: 1 });
                            setShowRawItemPanel(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
}

// POS Product Card Component (renamed to avoid conflicts)
function POSProductCard({ product, inCart = 0, onAdd, onRemove }) {
    const [addAnimation, setAddAnimation] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [showUnitCalculation, setShowUnitCalculation] = useState(false);

    // Check if product has options
    const hasOptions = (product.priceVariants && product.priceVariants.length > 0) ||
        (product.addons && product.addons.length > 0);

    // Check if product has unit pricing
    const hasUnitPricing = product?.unitPricing?.enabled && 
        product?.unitPricing?.pricePerUnit > 0 && 
        product?.unitPricing?.displayUnit;

    // Check if product is out of stock
    const isOutOfStock = product.inventoryDeductionMode === 'pre-prepared' && 
                        product.stock !== undefined && 
                        product.stock <= 0;

    // Animation effect when adding to cart
    const handleAddWithAnimation = async () => {
        if (hasUnitPricing) {
            setShowUnitCalculation(true);
        } else if (hasOptions) {
            setShowOptions(true);
        } else {
            await onAdd({ product, quantity: 1, variant: null, addons: [] });
            setAddAnimation(true);
            setTimeout(() => setAddAnimation(false), 300);
        }
    };

    return (
        <>
            <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden transition-all group ${
                isOutOfStock 
                    ? 'opacity-90 hover:shadow cursor-pointer' 
                    : 'hover:shadow cursor-pointer'
            } ${addAnimation ? 'ring-2 ring-red-400 scale-[1.02]' : ''}`}
                style={{ transition: 'all 0.2s ease' }}>
                {/* Make the main product area clickable for adding items */}
                <div
                    className="relative cursor-pointer"
                    onClick={handleAddWithAnimation}
                >
                    <div className="aspect-square bg-gray-100 relative overflow-hidden">
                        {product.imgs && product.imgs.length > 0 ? (
                            <img
                                src={product.imgs[0]}
                                alt={product.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = 'https://via.placeholder.com/150';
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <i className="ph ph-image text-gray-400 text-3xl"></i>
                            </div>
                        )}
                        {product.hasDiscount && (
                            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                                {product.discountPercent}% OFF
                            </div>
                        )}
                        {product.veg !== undefined && (
                            <div className="absolute top-2 left-2 h-6 w-6 flex items-center justify-center">
                                <div className={`h-5 w-5 border p-0.5 bg-white shadow-sm ${product.veg ? 'border-green-500' : 'border-red-500'}`}>
                                    <div className={`h-full w-full rounded-full ${product.veg ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                            </div>
                        )}

                        {/* Add overlay on hover */}
                        {inCart === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center transition-all duration-300 bg-red-500 bg-opacity-0 group-hover:bg-opacity-20">
                                <div className="px-3 py-1 rounded-full transform transition-all duration-300 shadow-md bg-red-500 text-white translate-y-4 opacity-0 group-hover:opacity-100 group-hover:translate-y-0">
                                    <i className="ph ph-plus mr-1"></i>
                                    {isOutOfStock ? 'Order Anyway' : 'Add'}
                                </div>
                            </div>
                        )}

                        {/* Badge for items in cart */}
                        {inCart > 0 && (
                            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium animate-fadeIn">
                                {inCart} in cart
                            </div>
                        )}
                        
                        {/* Stock Badge - positioned in bottom right */}
                        <div className="absolute bottom-2 right-2">
                            {/* Show stock info based on inventory deduction mode */}
                            {product.inventoryDeductionMode === 'on-demand' ? (
                                <div className="text-2xs px-2 py-1 rounded-full font-medium shadow-sm bg-blue-100 text-blue-600 border border-blue-200 hover:bg-blue-200 transition-colors">
                                    <i className="ph ph-cooking-pot mr-1"></i>
                                    On-demand
                                </div>
                            ) : (
                                /* Show stock status for pre-prepared products */
                                product.stock !== undefined && (
                                    <div className={`text-2xs px-2 py-1 rounded-full font-medium shadow-sm border transition-colors ${
                                        product.stock <= 0
                                            ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                                            : product.stock <= 5
                                                ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
                                                : product.stock <= 10
                                                    ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200'
                                                    : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                                        }`}>
                                        <i className={`ph ${
                                            product.stock <= 0 ? 'ph-x-circle' : 'ph-package'
                                        } mr-1`}></i>
                                        {product.stock <= 0
                                            ? 'Out of stock'
                                            : `${product.stock} left`}
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                    <div className="p-3">
                        <h3 className="font-medium text-gray-800 line-clamp-1">{product.title}</h3>
                        <div className="flex items-center justify-between mt-1">
                            <div>
                                <span className="font-medium text-gray-800">{UserSession?.getCurrency()}{product.price}</span>
                                {product.mrp > product.price && (
                                    <span className="text-xs text-gray-500 line-through ml-1">{UserSession?.getCurrency()}{product.mrp}</span>
                                )}
                            </div>
                            
                            {/* Compact stock indicator in price area */}
                            {product.inventoryDeductionMode !== 'on-demand' && product.stock !== undefined && (
                                <div className="flex items-center">
                                    {product.stock <= 10 && (
                                        <div className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                            product.stock <= 0
                                                ? 'text-red-700 bg-red-50'
                                                : product.stock <= 5
                                                    ? 'text-orange-700 bg-orange-50'
                                                    : 'text-green-700 bg-green-50'
                                        }`}>
                                            ({product.stock})
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {product?.unitPricing?.enabled && product?.unitPricing?.displayUnit && Number(product?.unitPricing?.pricePerUnit) > 0 && (
                            <div className="mt-0.5 text-[10px] text-blue-600 flex items-center gap-1">
                                <i className="ph ph-calculator text-xs"></i>
                                @ {UserSession?.getCurrency()}{Number(product.unitPricing.pricePerUnit).toFixed(2)} / {product.unitPricing.displayUnit}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quantity controls */}
                <div className="px-3 pb-3 flex justify-end items-center" onClick={(e) => e.stopPropagation()}>
                    {inCart > 0 ? (
                        <div className="flex items-center bg-gray-100 rounded-full px-1">
                            <button
                                className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove();
                                }}
                            >
                                <i className="ph ph-minus"></i>
                            </button>
                            <span className="w-8 text-center font-medium">{inCart}</span>
                            <button
                                className="w-7 h-7 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (hasUnitPricing) {
                                        setShowUnitCalculation(true);
                                    } else if (hasOptions) {
                                        setShowOptions(true);
                                    } else {
                                        await handleAddWithAnimation();
                                    }
                                }}
                                title="Add more"
                            >
                                <i className="ph ph-plus"></i>
                            </button>
                        </div>
                    ) : (
                        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm opacity-0">
                            <i className="ph ph-check mr-1"></i> Add
                        </div>
                    )}
                </div>
            </div>

            {/* Product Options Modal */}
            {showOptions && (
                <ProductOptionsModal
                    product={product}
                    onClose={() => setShowOptions(false)}
                    onAdd={onAdd}
                />
            )}

            {/* Unit Calculation Modal */}
            {showUnitCalculation && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowUnitCalculation(false)}>
                    <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-medium mb-4">Unit Calculator</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Calculate quantity by weight/volume for {product.title}
                        </p>
                        <div className="text-center">
                            <button 
                                className="bg-red-500 text-white px-4 py-2 rounded-lg"
                                onClick={() => {
                                    onAdd({ product, quantity: 1, variant: null, addons: [] });
                                    setShowUnitCalculation(false);
                                }}
                            >
                                Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// Raw Product Panel Component
function RawProductPanel({ onClose, onAdd }) {
    const { t } = useLanguage();
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [isValid, setIsValid] = useState(false);

    // Validate form
    useEffect(() => {
        setIsValid(title.trim().length > 0 && !isNaN(price) && parseInt(price) > 0);
    }, [title, price]);

    // Create a quick product
    const createQuickProduct = () => {
        const id = "quick_" + Math.random().toString(36).substring(2, 15);

        const product = {
            id,
            title,
            price: parseInt(price),
            mrp: parseInt(price),
            cat: "Quick Items",
            active: true,
            date: new Date(),
            sellerId: UserSession?.seller?.id || '',
            sellerBusinessName: UserSession?.seller?.businessName || '',
            sellerAvatar: UserSession?.seller?.avatar || '',
            veg: true
        };

        onAdd(product);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
                onClick={e => e.stopPropagation()}
                style={{ backgroundColor: "#fff8f8" }}
            >
                <h2 className="text-xl font-semibold text-gray-800 mb-4">{t('quickItem')}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('title')}
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                            placeholder={t('enterItemName')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('price')}
                        </label>
                        <input
                            type="number"
                            value={price}
                            onChange={e => setPrice(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                            placeholder={t('enterPrice')}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        onClick={onClose}
                    >
                        {t('cancel')}
                    </button>
                    <button
                        className={`px-4 py-2 bg-red-500 text-white rounded-lg transition-colors ${isValid
                            ? 'hover:bg-red-600'
                            : 'opacity-50 cursor-not-allowed'
                            }`}
                        onClick={createQuickProduct}
                        disabled={!isValid}
                    >
                        {t('addToCart')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Product Options Modal Component
function ProductOptionsModal({ product, onClose, onAdd }) {
    const { t } = useLanguage();
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [selectedAddons, setSelectedAddons] = useState([]);
    const [quantity, setQuantity] = useState(1);
    const [customPrice, setCustomPrice] = useState(null);

    // Update product price when variant changes
    useEffect(() => {
        // Reset custom price when variant changes
        setCustomPrice(null);
    }, [selectedVariant]);

    // Calculate total price
    const totalPrice = useMemo(() => {
        let total;
        // If custom price exists, use it, otherwise use variant or product price
        if (customPrice !== null) {
            total = customPrice;
        } else {
            total = selectedVariant ? selectedVariant.price : product.price;
        }
        const addonTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
        return (total + addonTotal) * quantity;
    }, [product.price, selectedVariant, selectedAddons, quantity, customPrice]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-white rounded-xl w-full max-w-md mx-4 overflow-hidden shadow-xl"
                onClick={e => e.stopPropagation()}
                style={{ backgroundColor: "#fff8f8" }}
            >
                {/* Header */}
                <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="font-medium text-lg text-gray-800">{product.title}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-red-50 rounded-full">
                        <i className="ph ph-x text-red-600"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    {/* Variations Section */}
                    {product.priceVariants && product.priceVariants.length > 0 && (
                        <div className="mb-6">
                            <h4 className="font-medium text-gray-700 mb-2">{t('variations')}</h4>
                            <div className="space-y-2">
                                {/* Default price option */}
                                <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    <input
                                        type="radio"
                                        name="variant"
                                        checked={!selectedVariant}
                                        onChange={() => setSelectedVariant(null)}
                                        className="form-radio text-red-500 focus:ring-red-500"
                                    />
                                    <span className="ml-3 flex-1">{t('regular')}</span>
                                    <span className="text-gray-600">{UserSession?.getCurrency()}{product.price}</span>
                                </label>

                                {product.priceVariants.map((variant) => (
                                    <label
                                        key={variant.id}
                                        className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                                    >
                                        <input
                                            type="radio"
                                            name="variant"
                                            checked={selectedVariant?.id === variant.id}
                                            onChange={() => setSelectedVariant(variant)}
                                            className="form-radio text-red-500 focus:ring-red-500"
                                        />
                                        <span className="ml-3 flex-1">{variant.name}</span>
                                        <span className="text-gray-600">{UserSession?.getCurrency()}{variant.price}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add-ons Section */}
                    {product.addons && product.addons.length > 0 && (
                        <div className="mb-6">
                            <h4 className="font-medium text-gray-700 mb-2">{t('addons')}</h4>
                            <div className="space-y-2">
                                {product.addons.map((addon) => (
                                    <label
                                        key={addon.id}
                                        className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${addon.inStock ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-100 opacity-60 cursor-not-allowed'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            disabled={!addon.inStock}
                                            checked={selectedAddons.some(a => a.id === addon.id)}
                                            onChange={() => {
                                                if (!addon.inStock) return;
                                                setSelectedAddons(prev =>
                                                    prev.some(a => a.id === addon.id)
                                                        ? prev.filter(a => a.id !== addon.id)
                                                        : [...prev, addon]
                                                );
                                            }}
                                            className="form-checkbox text-red-500 focus:ring-red-500"
                                        />
                                        <span className="ml-3 flex-1">{addon.name}</span>
                                        <span className="text-gray-600">+{UserSession?.getCurrency()}{addon.price}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Customize Price Section */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-gray-700 mb-2">{t('price')} ({UserSession?.getCurrency()})</h4>
                            <button
                                onClick={() => {
                                    const basePrice = selectedVariant ? selectedVariant.price : product.price;
                                    setCustomPrice(customPrice === null ? basePrice : null);
                                }}
                                className={`text-sm px-2 py-1 rounded ${customPrice !== null ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}
                            >
                                {customPrice !== null ? t('resetToDefault') : t('customize')}
                            </button>
                        </div>

                        {customPrice !== null ? (
                            <div className="flex items-center justify-center bg-gray-50 rounded-lg">
                                <input
                                    type="number"
                                    value={customPrice}
                                    onChange={e => setCustomPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                                    className="w-full p-3 bg-transparent text-center focus:outline-none font-medium text-lg"
                                    min="0"
                                    step="1"
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center bg-gray-50 rounded-lg p-3">
                                <span className="font-medium text-lg">
                                    {selectedVariant ? selectedVariant.price : product.price}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Quantity Section */}
                    <div className="mb-6">
                        <h4 className="font-medium text-gray-700 mb-2">{t('quantity')}</h4>
                        <div className="flex items-center justify-center bg-gray-50 rounded-lg p-2">
                            <button
                                onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                                className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full"
                            >
                                <i className="ph ph-minus"></i>
                            </button>
                            <span className="mx-6 font-medium text-lg">{quantity}</span>
                            <button
                                onClick={() => setQuantity(prev => prev + 1)}
                                className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full"
                            >
                                <i className="ph ph-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-white">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-gray-600">{t('totalPrice')}</span>
                        <span className="text-lg font-medium text-red-600">{UserSession?.getCurrency()}{totalPrice.toFixed(2)}</span>
                    </div>
                    <button
                        onClick={() => {
                            // Create a product copy with adjusted pricing if custom price is set
                            let productToAdd = product;
                            if (customPrice !== null) {
                                // Clone the product
                                productToAdd = {
                                    ...product,
                                    price: customPrice,
                                    mrp: customPrice // Set the MRP to the same value as customPrice
                                };
                            } else if (selectedVariant) {
                                // Apply variant price as the product's MRP if no custom price
                                productToAdd = {
                                    ...product,
                                    price: selectedVariant.price,
                                    mrp: selectedVariant.price // Set the MRP to variant price
                                };
                            }

                            onAdd({
                                product: productToAdd,
                                quantity,
                                variant: selectedVariant,
                                addons: selectedAddons
                            });
                            onClose();
                        }}
                        className="w-full py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center justify-center"
                    >
                        <i className="ph ph-shopping-cart mr-2"></i>
                        {t('addToCart')}
                    </button>
                </div>
            </div>
        </div>
    );
}