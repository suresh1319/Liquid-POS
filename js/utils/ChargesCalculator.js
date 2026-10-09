/**
 * ChargesCalculator - A utility for calculating charges consistently across the application
 * 
 * This utility provides methods to calculate charges and final amounts
 * for orders based on the subtotal and charges array.
 */
export class ChargesCalculator {
    /**
     * Calculate charges, applying them to subtotal
     * @param {number} subtotal - The order subtotal before charges
     * @param {Array} charges - Array of charge objects with name, value, type
     * @returns {Object} Object containing calculatedCharges array and finalAmount
     */
    calculateCharges(subtotal, charges, discount = 0) {
    return ChargesCalculator.calculateCharges(subtotal, charges, discount);
}

    /**
     * Static version of calculateCharges
     * @param {number} subtotal - The order subtotal before charges
     * @param {Array} charges - Array of charge objects with name, value, type
     * @returns {Object} Object containing calculatedCharges array and finalAmount
     */
    static calculateCharges(subtotal, charges, discount = 0) {
        // Ensure subtotal is number
        subtotal = parseFloat(subtotal) || 0;
        discount = parseFloat(discount) || 0;


        // Ensure charges is an array
        charges = Array.isArray(charges) ? charges : [];

        // Debug logging
        console.log("ChargesCalculator: Starting calculation with:", {
            subtotal,
            discount,
            charges: charges.map(c => ({
                name: c.name,
                value: c.value,
                type: c.type,
                inclusive: c.inclusive
            }))
        });

        const calculatedCharges = [];
        const validatedCharges = [];
        
        // ✅ APPLY DISCOUNT BEFORE TAX (Indian GST Standard)
        // Taxable Amount = Subtotal - Discount
        const taxableAmount = Math.max(0, subtotal - discount);
        let finalAmount = taxableAmount;

        // Calculate each charge on the TAXABLE amount (after discount)
        charges.forEach(charge => {
            if (!charge || !charge.name) return;
            validatedCharges.push(charge);

            let displayName = charge.name || 'Charge';
            let chargeAmount = 0;

            if (charge.type === 'percentage' || (charge.value && charge.value.toString().includes('%'))) {
                let percentage = 0;

                if (charge.type === 'percentage') {
                    percentage = parseFloat(charge.value) || 0;
                } else {
                    const value = charge.value.toString().replace('%', '').trim();
                    percentage = parseFloat(value) || 0;
                }

                if (charge.inclusive) {
                    // Inclusive charges are already part of the taxable amount
                    chargeAmount = parseFloat(((taxableAmount * percentage) / (100 + percentage)).toFixed(2));
                } else {
                    // Calculate tax on taxable amount (after discount)
                    chargeAmount = parseFloat(((taxableAmount * percentage) / 100).toFixed(2));
                    finalAmount += chargeAmount;
                }

                if (!displayName.toLowerCase().includes('%')) {
                    displayName = `${displayName} (${percentage}%)`;
                }
            } else {
                chargeAmount = parseFloat(charge.value) || 0;
                if (!charge.inclusive) {
                    finalAmount += chargeAmount;
                }
            }

            if (chargeAmount !== 0) {
                calculatedCharges.push({
                    id: charge.id,
                    name: charge.name,
                    displayName,
                    calculatedAmount: chargeAmount,
                    isInclusive: !!charge.inclusive,
                    bulkTaxHashtag: charge.bulkTaxHashtag || null
                });
            }
        });


       console.log("ChargesCalculator: Final calculation result:", {
            subtotal,
            discount,
            taxableAmount,
            calculatedCharges: calculatedCharges.map(c => ({
                name: c.displayName,
                amount: c.calculatedAmount,
                isInclusive: c.isInclusive
            })),
            finalAmount
        });

        return {
            calculatedCharges,
            finalAmount,
            validatedCharges
        };

    }

    /**
     * Format a number as currency
     * @param {number} amount - Amount to format
     * @param {number} decimals - Number of decimal places
     * @returns {string} Formatted amount
     */
    static formatAmount(amount, decimals = 2) {
        return amount.toFixed(decimals);
    }

    /**
     * Instance method for formatAmount
     */
    formatAmount(amount, decimals = 2) {
        return ChargesCalculator.formatAmount(amount, decimals);
    }
}
