import { sdk } from '../../sdk.js';

/**
 * Creates a new product document in the database with essential parameters
 * @param {string} title - Product title
 * @param {number} price - Product price
 * @param {string} category - Product category
 * @param {string} desc - Product description
 * @param {string} sellerId - Seller ID
 * @param {string} sellerBusinessName - Seller business name
 * @returns {Promise<string>} - Returns the product ID
 */
export async function createQuickProduct(title, price, category = 'Default', desc = '', sellerId = '', sellerBusinessName = '') {
    try {
        const productsCollection = sdk.db.collection('Product');
        const newProductRef = productsCollection.doc();

        const productData = {
            title: title.trim(),
            desc: desc.trim(),
            cat: category,
            price: Number(price),
            mrp: Number(price), // Set MRP same as price initially
            active: true,
            veg: true,
            sellerId: sellerId,
            sellerBusinessName: sellerBusinessName,
            date: new Date(),
            sellIndividually: false,
            generatedFrom: 'quick-create',
            generatedAt: new Date()
        };

        await newProductRef.set(productData);

        return newProductRef.id;
    } catch (error) {
        console.error('Error creating quick product:', error);
        throw error;
    }
}