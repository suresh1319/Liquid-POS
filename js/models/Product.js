// Product model for product data
export class Product {
    constructor(data) {
        Object.assign(this, data);
        // Basic properties
        this.id = data.id || '';
        this.title = data.title || '';
        this.cat = data.cat || 'Default';
        this.desc = data.desc || '';
        this.imgs = data.imgs || [];
        this.price = data.price || 0;
        this.mrp = data.mrp || 0;
        this.active = data.active !== false; // default to true
        this.veg = data.veg !== undefined ? data.veg : true; // default to vegetarian

        // Seller info
        this.sellerId = data.sellerId || '';
        this.sellerBusinessName = data.sellerBusinessName || '';
        this.sellerAvatar = data.sellerAvatar || '';

        // Calculated properties
        this.hasDiscount = this.price < this.mrp;
        this.discountPercent = this.hasDiscount ? Math.round(((this.mrp - this.price) / this.mrp) * 100) : 0;

        // Additional properties
        this.barcode = data.barcode || '';
        this.sku = data.sku || '';
        this.stock = data.stock !== undefined ? data.stock : undefined;
        this.date = data.date ? new Date(data.date) : new Date();

        // New fields for enhanced functionality
        this.priceVariants = data.priceVariants || [];
        this.charges = data.charges || [];
        this.recipe = data.recipe || data.recipeList || []; // Support both names for backward compatibility
        this.addons = data.addons || []; // Add-ons for this product
        this.inventoryDeductionMode = data.inventoryDeductionMode || 'pre-prepared'; // 'pre-prepared' or 'on-demand'
        // Unit pricing (optional display of price per unit like /kg, /g, etc.)
        // Backward compatible: previously { enabled: false, unit: '' }
        const up = data.unitPricing || {};
        this.unitPricing = {
            enabled: Boolean(up.enabled),
            unitType: up.unitType || '', // e.g., 'Gram', 'Kilogram', 'ML', 'Litre', 'Unit'
            displayUnit: up.displayUnit || up.unit || '', // prefer displayUnit, fallback to legacy 'unit'
            pricePerUnit: typeof up.pricePerUnit === 'number' ? up.pricePerUnit : Number(up.pricePerUnit || 0)
        };
        this.suggestion = data.suggestion;
    }

    // Create a Product from a Firestore document
    static fromDoc(doc, priceVariant = 'default') {
        if (!doc || !doc.exists) {
            console.warn('Attempted to create Product from non-existent document');
            return null;
        }

        try {
            const data = doc.data();
            if (!data) {
                console.warn('Document exists but has no data');
                return null;
            }

            data.id = doc.id;

            // Handle price variants (both legacy object format and new array format)
            if (data.priceVariants) {
                if (Array.isArray(data.priceVariants)) {
                    // New format: array of variant objects
                    const variant = data.priceVariants.find(v => v.name === priceVariant);
                    if (variant) {
                        data.price = variant.price;
                    }
                } else if (typeof data.priceVariants === 'object') {
                    // Legacy format: object with variant names as keys
                    if (data.priceVariants[priceVariant]) {
                        data.price = data.priceVariants[priceVariant];
                    }
                }
            }

            return new Product(data);
        } catch (error) {
            // Log error
            console.log('Error creating Product from document: ', error);
            return null;
        }
    }

    // Convert to a simple object for storing in Firestore
    toFirestore() {
        return {
            title: this.title,
            desc: this.desc,
            cat: this.cat,
            imgs: this.imgs,
            price: this.price,
            mrp: this.mrp,
            discount: this.discountPercent,
            active: this.active,
            veg: this.veg,
            sellerId: this.sellerId,
            sellerBusinessName: this.sellerBusinessName,
            sellerAvatar: this.sellerAvatar,
            barcode: this.barcode,
            sku: this.sku,
            stock: this.stock,
            date: this.date,
            priceVariants: this.priceVariants,
            charges: this.charges,
            recipe: this.recipe,
            addons: this.addons,
            inventoryDeductionMode: this.inventoryDeductionMode,
            unitPricing: this.unitPricing
        };
    }

    // Create a Product from JSON data
    static fromJson(json) {
        return new Product(json);
    }

    // Convert Product to JSON
    toJson() {
        return {
            id: this.id,
            cat: this.cat,
            title: this.title,
            sellerId: this.sellerId,
            sellerBusinessName: this.sellerBusinessName,
            sellerAvatar: this.sellerAvatar,
            desc: this.desc,
            imgs: this.imgs,
            price: this.price,
            mrp: this.mrp,
            discount: this.discountPercent,
            active: this.active,
            veg: this.veg,
            stock: this.stock,
            date: this.date,
            barcode: this.barcode,
            sku: this.sku,
            priceVariants: this.priceVariants,
            charges: this.charges,
            recipe: this.recipe,
            addons: this.addons,
            inventoryDeductionMode: this.inventoryDeductionMode,
            unitPricing: this.unitPricing
        };
    }

    // Get URL-friendly title
    get titleUrl() {
        if (!this.title) return '';
        return this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, this.title.length > 100 ? 100 : this.title.length);
    }

    // Calculate discount percentage
    get discountPercentage() {
        if (this.hasDiscount) {
            return Math.ceil(((this.mrp - this.price) * 100) / this.mrp);
        }
        return 0;
    }

    // Get recipe items
    get recipeList() {
        if (!this.recipe || this.recipe.length === 0) return [];
        return this.recipe.map(item => {
            if (item instanceof InventoryItem) return item;
            return InventoryItem.fromJson(item);
        });
    }

    // Backward compatibility alias for recipeItems
    get recipeItems() {
        return this.recipeList;
    }

    // Calculate maximum production based on inventory
    getMaxProduction(allInventoryItems) {
        let maxProductionScale = 0;

        if (this.recipeList.length > 0) {
            const recipeItemNames = this.recipeList.map(r => r.name);
            const relevantItems = allInventoryItems.filter(i => recipeItemNames.includes(i.name));

            if (relevantItems.length > 0) {
                const productions = relevantItems.map(item => item.getMaxProduction(this));
                maxProductionScale = Math.min(...productions);
            }
        }

        return maxProductionScale;
    }

    static get DUMMY_THUMB() {
        return "https://firebasestorage.googleapis.com/v0/b/frihbi-app.appspot.com/o/assets%2Fproduct-placeholder.png?alt=media&token=183bdac4-2f9b-4645-8147-7cfa921ba0e9";
    }
}

// Inventory Item model
export class InventoryItem {
    constructor(data = {}) {
        this.id = data.id || '';
        this.name = data.name || '';
        this.quantity = data.quantity || 0;
        this.unit = data.unit || '';
        this.minQuantity = data.minQuantity || 0;
        this.date = data.date ? new Date(data.date) : new Date();
        this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
        this.lastUpdated = data.lastUpdated || data.updatedAt || new Date().toISOString();
        this.vendorName = data.vendorName || '';
        this.vendorCompany = data.vendorCompany || '';
        this.vendorGst = data.vendorGst || '';
        this.vendorContact = data.vendorContact || '';
        this.vendorAddress = data.vendorAddress || '';
        this.perKgCost = data.perKgCost || 0;
        // New fields for enhanced inventory management
        this.location = data.location || 'main'; // Default location
        this.locations = data.locations || []; // Array of location objects for multi-location support
        this.expiryDate = data.expiryDate || null;
        this.batchNumber = data.batchNumber || '';
        this.notes = data.notes || '';
        this.supplierId = data.supplierId || '';
        this.purchaseOrderId = data.purchaseOrderId || '';
    }

    static fromJson(json) {
        return new InventoryItem(json);
    }

    toJson() {
        return {
            id: this.id,
            name: this.name,
            quantity: this.quantity,
            unit: this.unit,
            minQuantity: this.minQuantity,
            date: this.date,
            updatedAt: this.updatedAt,
            lastUpdated: this.lastUpdated,
            vendorName: this.vendorName,
            vendorCompany: this.vendorCompany,
            vendorGst: this.vendorGst,
            vendorContact: this.vendorContact,
            vendorAddress: this.vendorAddress,
            perKgCost: this.perKgCost,
            // New fields for enhanced inventory management
            location: this.location,
            locations: this.locations,
            expiryDate: this.expiryDate,
            batchNumber: this.batchNumber,
            notes: this.notes,
            supplierId: this.supplierId,
            purchaseOrderId: this.purchaseOrderId
        };
    }

    // Calculate max production for a product
    getMaxProduction(product) {
        const recipeItem = product.recipeList.find(r => r.name === this.name);
        if (!recipeItem || recipeItem.quantity <= 0) return 0;

        return Math.floor(this.quantity / recipeItem.quantity);
    }
}

// Charge model for additional charges
export class Charge {
    constructor(data = {}) {
        this.name = data.name || '';
        this.value = data.value || 0;
        this.type = data.type || 'percentage'; // 'percentage' or 'fixed'
    }

    static fromJson(json) {
        return new Charge(json);
    }

    toJson() {
        return {
            name: this.name,
            value: this.value,
            type: this.type
        };
    }

    // Calculate charge amount based on base price
    calculate(basePrice) {
        if (this.type === 'percentage') {
            return (basePrice * this.value) / 100;
        }
        return this.value;
    }
}
