import React, { useState, useEffect, createElement } from 'react';
import ReactDOM from 'react-dom/client';
import { prettyTime, getOrderSource, formatProductTitle } from '../utils.js';
import { ModalManager } from './ModalManager.js';
import { BluetoothPrinting } from '../utils/BluetoothPrinting.js';
import { UserSession } from '../utils/UserSession.js';
import { ChargesCalculator } from '../utils/ChargesCalculator.js';
import { OrderStatus } from '../models/OrderStatus.js';
import { useLanguage } from '../contexts/LanguageContext.js';
import { LanguageProvider } from '../contexts/LanguageContext.js';
import { sdk } from '../sdk.js';

// Global variable for print bill function
let modalPrintBill = null;

// Helper function for formatting dates
const formatDate = (date, format = 'short') => {
    if (!date) return 'N/A';

    // Convert Firebase timestamp to Date if needed
    const dateObj = date instanceof Date ? date : new Date(date?.seconds ? date.seconds * 1000 : date);

    if (isNaN(dateObj.getTime())) return 'Invalid Date';

    if (format === 'full') {
        return dateObj.toLocaleString('en-GB', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    return dateObj.toLocaleString('en-GB', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

// Table Card Component
export function TableCard({ title, orders, duration, onTap, onLongPress, compact = false }) {
    const { t } = useLanguage();
    // Calculate color based on last placed date (similar to getColor in Flutter)
    const getColor = (duration) => {
        if (!duration) return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-card-bg to-white'
        };

        const minutes = duration.minutes || 0;

        if (minutes < 15) return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-green-50 to-white'
        };
        if (minutes < 30) return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-orange-50 to-white'
        };
        return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-red-50 to-white'
        };
    };

    // Get message based on last placed date (similar to getMsg in Flutter)
    const getMessage = (duration) => {
        if (!duration) return t('noOrders');

        const minutes = duration.minutes || 0;

        if (minutes < 3) return t('justNow');
        return `${duration.display}`;
    };

    const colorStyle = getColor(duration);
    const message = getMessage(duration);
    const hasOrders = orders && orders.length > 0;

    // Calculate order status text
    const orderText = hasOrders
        ? `${orders.length} ${orders.length === 1 ? t('item') : t('items')}`
        : t('noOrders');

    // Render compact version for mobile
    if (compact) {
        return (
            <div
                className={`${colorStyle.gradient} rounded-xl p-2 md:p-3 h-full flex flex-col cursor-pointer hover:shadow-md transition-all border ${colorStyle.border} shadow-section`}
                onClick={onTap}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onLongPress && onLongPress();
                }}
            >
                <div className="flex items-center justify-between mb-1.5 md:mb-2">
                    <h3 className="text-xs md:text-sm font-bold line-clamp-1 leading-tight max-w-[70%]">{title}</h3>
                    <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-gradient-to-br from-white to-white/80 flex items-center justify-center shadow-sm flex-shrink-0">
                        <i className="ph ph-table text-red-500 text-xs md:text-sm"></i>
                    </div>
                </div>

                <div className="mt-auto">
                    <div className={`text-2xs md:text-xs font-medium px-1.5 py-0.5 md:px-2 md:py-1 rounded-full mb-0.5 md:mb-1 inline-flex items-center ${hasOrders ? 'bg-gradient-to-r from-red-100 to-red-50 text-red-600' : 'bg-gradient-to-r from-gray-100 to-gray-50 text-gray-500'}`}>
                        {hasOrders ? (
                            <i className="ph ph-shopping-bag text-2xs md:text-xs mr-0.5 md:mr-1"></i>
                        ) : (
                            <i className="ph ph-tray-empty text-2xs md:text-xs mr-0.5 md:mr-1"></i>
                        )}
                        {orderText}
                    </div>

                    {duration && hasOrders && (
                        <div className="text-2xs md:text-xs bg-gradient-to-r from-gray-100 to-gray-50 px-1.5 md:px-2 py-0.5 md:py-1 rounded-full inline-flex items-center">
                            <i className="ph ph-clock text-red-500 text-2xs md:text-xs mr-0.5 md:mr-1"></i>
                            {message}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Render standard version
    return (
        <div
            className={`${colorStyle.gradient} rounded-xl p-4 h-full flex flex-col cursor-pointer hover:shadow-md transition-all border ${colorStyle.border} shadow-section`}
            onClick={onTap}
            onContextMenu={(e) => {
                e.preventDefault();
                onLongPress && onLongPress();
            }}
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold truncate max-w-[70%]">{title}</h3>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white to-white/80 flex items-center justify-center shadow-sm">
                    <i className="ph ph-table text-red-500 text-lg"></i>
                </div>
            </div>

            <div className="mt-auto">
                <div className={`text-sm font-medium px-3 py-1.5 rounded-full mb-2 inline-flex items-center ${hasOrders ? 'bg-gradient-to-r from-red-100 to-red-50 text-red-600' : 'bg-gradient-to-r from-gray-100 to-gray-50 text-gray-500'}`}>
                    {hasOrders ? (
                        <i className="ph ph-shopping-bag text-xs mr-1.5"></i>
                    ) : (
                        <i className="ph ph-tray-empty text-xs mr-1.5"></i>
                    )}
                    {orderText}
                </div>

                {duration && hasOrders && (
                    <div className="text-xs bg-gradient-to-r from-gray-100 to-gray-50 px-2 py-1 rounded-full inline-flex items-center">
                        <i className="ph ph-clock text-red-500 text-xs mr-1"></i>
                        {message}
                    </div>
                )}
            </div>
        </div>
    );
}

// Order Thumb Component
export function OrderThumb({ order }) {
    return (
        <div className="p-2 pl-4 pr-4">
            <div className="bg-gradient-to-br from-warm-bg to-white h-[150px] w-[150px] relative rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="absolute inset-0 overflow-hidden">
                    {order.items && order.items.length > 0 && (
                        <img
                            src={order.items[0].thumb || 'https://via.placeholder.com/150'}
                            alt={order.items[0].title || t('orderItem')}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                            }}
                        />
                    )}
                    <div className="absolute inset-2 bg-gradient-to-br from-white to-white/80 rounded-full flex items-center justify-center shadow-sm">
                        <div className="text-center">
                            <div className="text-3xl font-bold leading-none text-red-500">
                                {order.items ? order.items.length : 0}
                            </div>
                            <div className="text-sm leading-none text-gray-600">{t('items')}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Order Group Tile Component
export function OrderGroupTile({ order, onAccept, onReject, onPrintBill }) {
    const { t } = useLanguage();
    
    // Calculate time ago
    const orderDate = order.date instanceof Date ? order.date : new Date(order.date?.seconds ? order.date.seconds * 1000 : order.date);
    const timeAgo = prettyTime(orderDate);

    // Calculate total amount with taxes and discounts using ChargesCalculator
    const itemsSubtotal = (order.items || []).reduce((sum, item) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity || item.qnt || 1);
        return sum + (price * quantity);
    }, 0);

    // Manual Calculation for Tile (Discount BEFORE Tax)
    const tileTaxable = Math.max(0, itemsSubtotal - (Number(order.discount) || 0));
    let tileFinalManual = tileTaxable;
    const tileCalculatedChargesManual = [];
    
    if (order.charges && Array.isArray(order.charges)) {
        order.charges.forEach(c => {
            let amt = 0;
            let pct = 0;
            if (c.type === 'percentage' || (c.value && c.value.toString().includes('%'))) {
                if (c.type === 'percentage') {
                    pct = parseFloat(c.value) || 0;
                } else {
                    pct = parseFloat(c.value.toString().replace('%', '').trim()) || 0;
                }
                
                if (c.inclusive) {
                    amt = parseFloat(((tileTaxable * pct) / (100 + pct)).toFixed(2));
                } else {
                    amt = parseFloat(((tileTaxable * pct) / 100).toFixed(2));
                    tileFinalManual += amt;
                }
            } else {
                amt = parseFloat(c.value) || 0;
                if (!c.inclusive) {
                    tileFinalManual += amt;
                }
            }
            if (amt !== 0) {
                tileCalculatedChargesManual.push({...c, calculatedAmount: amt});
            }
        });
    }
    tileFinalManual = parseFloat(tileFinalManual.toFixed(2));
    
    const chargesCalculation = {
        finalAmount: tileFinalManual,
        calculatedCharges: tileCalculatedChargesManual
    };

    const totalAmount = chargesCalculation.finalAmount;
    const totalItems = order.items?.reduce((sum, item) => sum + (item.quantity || item.qnt || 1), 0) || 0;
    
    // Ensure totalAmount is a finite number - fallback to order.total or settledAmount if needed
    const numericTotal = Number.isFinite(Number(totalAmount)) ? Number(totalAmount) : (Number(order.total) || Number(order.settledAmount) || 0);
    const displayTotal = numericTotal.toFixed(2);

    // Compute totalTax from calculated charges when available (best-effort)
    const tileCalculatedCharges = chargesCalculation.calculatedCharges || [];
    let tileTotalTax = (tileCalculatedCharges || []).reduce((sum, c) => {
        try {
            const name = (c.displayName || c.name || '').toString().toLowerCase();
            const amt = Number(c.calculatedAmount || 0) || 0;
            if (name.includes('tax') || name.includes('gst') || name.includes('cgst') || name.includes('sgst') || name.includes('vat')) {
                return sum + amt;
            }
        } catch (e) { /* ignore */ }
        return sum;
    }, 0);

    // Fallback: infer tax as difference between finalAmount and (itemsSubtotal - discount)
    if (!tileTotalTax || tileTotalTax === 0) {
        try {
            const baseNoTax = Number(itemsSubtotal || 0) - Number(order.discount || 0);
            const inferred = Number(totalAmount || 0) - baseNoTax;
            if (!isNaN(inferred) && inferred > 0.001) tileTotalTax = inferred;
        } catch (e) { /* ignore */ }
    }

    // Loyalty info for the tile
    const loyaltyPointsUsedNum = Number(order.loyaltyPointsUsed || order.redeemedPoints || 0) || 0;
    const loyaltyDiscountAmount = Number(order.loyaltyDiscountAmount || order.loyaltyDiscount || 0) || 0;
    const loyaltyUsed = loyaltyPointsUsedNum > 0;

    // Grand total = finalAmount (already has discount applied) - loyalty discount
    // Note: ChargesCalculator now applies regular discount BEFORE tax
    const grandTotal = Math.max(0, Number(totalAmount || 0) - Number(loyaltyDiscountAmount || 0));

    // Order source (price variant or table) - using the same logic as Flutter
    const orderSource = getOrderSource(order);

    // Detect split bill
    const splitInfo = order.splitBill && order.splitBill.enabled ? order.splitBill : null;

    // Helper to build expected splits and match partial payments
    const buildSplitSummary = () => {
        if (!splitInfo) return [];
        // Build expected splits from customSplits / equal / numberOfPeople
        let expectedSplits = [];
        if (splitInfo.type === 'equal') {
            const count = Number(splitInfo.numberOfPeople || 0) || 0;
            const amt = Number(splitInfo.amountPerPerson || 0) || 0;
            for (let i = 0; i < count; i++) expectedSplits.push({ expectedAmount: amt, label: `Split ${i + 1}` });
        } else if (Array.isArray(splitInfo.customSplits) && splitInfo.customSplits.length > 0) {
            expectedSplits = splitInfo.customSplits.map((s, i) => ({ expectedAmount: Number(s.amount || 0) || 0, label: s.label || s.name || `Split ${i + 1}` }));
        } else if (splitInfo.numberOfPeople) {
            const count = Number(splitInfo.numberOfPeople || 0) || 0;
            const total = Number(splitInfo.totalAmount || totalAmount) || totalAmount;
            const per = count > 0 ? Math.round((total / count) * 100) / 100 : 0;
            for (let i = 0; i < count; i++) expectedSplits.push({ expectedAmount: per, label: `Split ${i + 1}` });
        }

        // Prefer explicit partialPayments but fall back to payments
        const partials = Array.isArray(order.partialPayments) && order.partialPayments.length > 0
            ? order.partialPayments
            : (Array.isArray(order.payments) ? order.payments : []);

        // If no expected splits but there are partials, build splits from partials directly
        if ((expectedSplits.length === 0 || expectedSplits.every(s => !s || s.expectedAmount === 0)) && Array.isArray(partials) && partials.length > 0) {
            return partials.map((p, idx) => {
                const amt = Number(p.amount || p.paidAmount || 0) || 0;
                const payer = p.payer || p.name || null;
                const label = p.splitLabel || (payer ? payer : `Split ${idx + 1}`);
                // Normalize payment method like we do in PassbookCalculator
                const rawMethod = p.paymentMode || p.mode || null;
                const normalizedMethod = rawMethod === 'DIGITAL' ? 'upi' : 
                                       rawMethod === 'CASH' ? 'cash' : 
                                       (rawMethod ? rawMethod.toLowerCase() : null);
                
                return {
                    label,
                    expectedAmount: amt,
                    paidAmount: amt,
                    paymentMethod: normalizedMethod,
                    payer,
                    paid: amt > 0
                };
            });
        }

        // If there are expected splits, match partials to each expected split by label or payer name
        const shouldSynthesize = (!Array.isArray(partials) || partials.length === 0) && (order.paid === true || order.settled === true || Number(order.settledAmount || 0) >= Number(totalAmount || 0));

        return expectedSplits.map((split, idx) => {
            const expectedAmount = Number(split.expectedAmount || 0) || 0;
            const splitLabel = split.label || `Split ${idx + 1}`;

            // Try to find a partial matching by various heuristics
            let match = null;
            if (Array.isArray(partials) && partials.length > 0) {
                // 1. Exact notes or payer label match (case-insensitive)
                match = partials.find(p => {
                    try {
                        const notes = p.notes ? p.notes.toString().toLowerCase() : '';
                        const payer = (p.payer || p.name || '').toString().toLowerCase();
                        if (notes && splitLabel && notes.includes(splitLabel.toString().toLowerCase())) return true;
                        if (split.label && payer && payer.includes(split.label.toString().toLowerCase())) return true;
                        return false;
                    } catch (e) {
                        return false;
                    }
                }) || null;

                // 2. Amount-equality fallback (within 1 paisa tolerance)
                if (!match) {
                    match = partials.find(p => {
                        try {
                            const amt = Number(p.amount || p.paidAmount || 0) || 0;
                            return Math.abs(amt - expectedAmount) < 0.011; // allow tiny rounding differences
                        } catch (e) { return false; }
                    }) || null;
                }

                // 3. Index-based fallback: if counts match, map by index
                if (!match && partials.length === expectedSplits.length) {
                    const p = partials[idx];
                    if (p) match = p;
                }

                // 4. Legacy id-based match (like 'split-2')
                if (!match) {
                    match = partials.find(p => {
                        try {
                            return p.id && p.id.toString().toLowerCase().includes(`split-${idx + 1}`);
                        } catch (e) { return false; }
                    }) || null;
                }
            }

            let paidAmount = match ? Number(match.amount || match.paidAmount || 0) : 0;

            // If nothing matched and order is completed/settled, assume expected amount was paid
            if ((!match || paidAmount === 0) && shouldSynthesize) paidAmount = expectedAmount;

            // Normalize payment method like we do in PassbookCalculator
            const rawMethod = match ? (match.paymentMode || match.mode || null) : null;
            const normalizedMethod = rawMethod === 'DIGITAL' ? 'upi' : 
                                   rawMethod === 'CASH' ? 'cash' : 
                                   (rawMethod ? rawMethod.toLowerCase() : null);
                            
            return {
                label: splitLabel,
                expectedAmount,
                paidAmount,
                paymentMethod: normalizedMethod,
                payer: match ? (match.payer || match.name || null) : null,
                paid: Number(paidAmount) > 0
            };
        });
    };

    // Determine if this is a new order that can be accepted/rejected
    const isNewOrder = order.currentStatus?.label === OrderStatus.PLACED;

    const handleOrderClick = () => {
        const isMobile = window.innerWidth < 768;

        const modalOptions = {
            id: `order-details-modal-${order.id}`,
            title: t('orderDetails'),
            content: `<div class="p-4 text-center">
                        <div class="animate-spin inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
                        <p class="mt-2">${t('loadingOrderDetails')}</p>
                     </div>`,
            onShown: (modalControl) => {
                // Add functions to modalControl
                modalControl.onAccept = onAccept;
                modalControl.onReject = onReject;

                // Add print functions to modalControl
                modalControl.printBill = async (orderId) => {
                    try {
                        if (BluetoothPrinting) {
                            await BluetoothPrinting.printBill(orderId || order.id);
                            if (ModalManager && typeof ModalManager.showToast === 'function') {
                                ModalManager.showToast(t('billPrinted'), { type: "success" });
                            } else {
                                alert(t('billPrinted'));
                            }
                        } else {
                            onPrintBill && onPrintBill(orderId || order.id);
                        }
                        modalControl.close();
                    } catch (error) {
                        console.error("Error printing bill:", error);
                        if (ModalManager && typeof ModalManager.showToast === 'function') {
                            ModalManager.showToast(t('failedToPrintBill') + ": " + error.message, { type: "error" });
                        } else {
                            alert(t('failedToPrintBill') + ": " + error.message);
                        }
                    }
                };

                modalControl.printKOT = async (orderId) => {
                    try {
                        // Use the same approach as handlePrintKOT in Modals.js to show preview
                        if (BluetoothPrinting && BluetoothPrinting.isSupported && BluetoothPrinting.isSupported()) {
                            try {
                                // Get order channel for proper printer selection
                                const channel = order.priceVariant || 'Default';
                                await BluetoothPrinting.printKOT(orderId || order.id, channel);
                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    ModalManager.showToast(t('kitchenOrderPrinted'), { type: "success" });
                                } else {
                                    alert(t('kitchenOrderPrinted'));
                                }
                                modalControl.close();
                                return; // Exit if Bluetooth printing succeeds
                            } catch (btError) {
                                console.error("Bluetooth printing failed:", btError);
                                // Fall through to traditional printing for other errors
                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    ModalManager.showToast("Bluetooth printing failed, falling back to standard printing", "warning");
                                }
                            }
                        }

                        // Traditional KOT printing with preview (fallback)
                        if (UserSession?.seller?.kotEnabled) {
                            try {
                                const orderRef = sdk.db.collection("Orders").doc(orderId || order.id);
                                const orderDoc = await orderRef.get();
                                if (!orderDoc.exists) {
                                    throw new Error("Order not found for KOT printing.");
                                }
                                const orderData = orderDoc.data();

                                // Check if there are newly added items
                                const newlyAddedItems = orderData.items?.filter(item => item.newlyAdded === true);
                                const hasNewItems = newlyAddedItems && newlyAddedItems.length > 0;

                                // Process the newly added items to show only the newly added quantities
                                const processedItems = hasNewItems ? newlyAddedItems.map(item => {
                                    // If we have a specific newly added quantity, use that
                                    if (item.newlyAddedQty && item.newlyAddedQty > 0) {
                                        return {
                                            ...item,
                                            qnt: item.newlyAddedQty, // Use only the newly added quantity for KOT
                                            originalQnt: item.qnt // Keep track of the original quantity
                                        };
                                    }
                                    return item; // Otherwise keep the item as is
                                }) : [];

                                // Check if any items have originalQnt property (indicating quantity additions)
                                const hasQuantityAdditions = processedItems.some(item => item.originalQnt !== undefined);
                                const kotTitle = hasNewItems
                                    ? (hasQuantityAdditions ? 'KITCHEN ORDER TICKET (ADDITIONS)' : 'KITCHEN ORDER TICKET (NEW ITEMS)')
                                    : 'KITCHEN ORDER TICKET';

                                let kotHtml = `
                                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px;">
                                        <h2 style="text-align: center; margin: 0 0 5px 0;">${kotTitle}</h2>
                                        <p style="text-align: center; margin: 0 0 10px 0; border-bottom: 1px dashed #000; padding-bottom: 5px;">
                                            ${UserSession?.seller?.businessName || 'Your Business'}
                                        </p>
                                        <p><strong>Order #:</strong> ${orderData.billNo || orderData.id?.substring(0, 6) || 'N/A'}</p>
                                        ${orderData.tableId ? `<p><strong>Table:</strong> ${orderData.tableId}</p>` : ''}
                                        <p><strong>Time:</strong> ${(() => {
                                            try {
                                                const date = orderData.date?.toDate ? orderData.date.toDate() : (orderData.date || new Date());
                                                const parsedDate = new Date(date);
                                                return isNaN(parsedDate.getTime()) ? new Date().toLocaleTimeString('en-GB') : parsedDate.toLocaleTimeString('en-GB');
                                            } catch (e) {
                                                return new Date().toLocaleTimeString('en-GB');
                                            }
                                        })()}</p>
                                        ${orderData.custName ? `<p><strong>Customer:</strong> ${orderData.custName}</p>` : ''}
                                        ${orderData.custPhone ? `<p><strong>Phone:</strong> ${orderData.custPhone}</p>` : ''}
                                        ${hasNewItems ? `<p><strong>Added Items:</strong> ${newlyAddedItems.length} of ${orderData.items.length}</p>` : ''}
                                        ${orderData.sourceName ? `<p><strong>Source:</strong> ${orderData.sourceName}</p>` : ''}
                                        <hr style="border: none; border-top: 1px dashed #000; margin: 10px 0;" />
                                        <p style="font-weight: bold; margin-bottom: 5px;">ITEMS:</p>
                                `;

                                // If there are newly added items, only print those with correct quantities
                                const itemsToPrint = hasNewItems ? processedItems : orderData.items;

                                if (itemsToPrint && itemsToPrint.length > 0) {
                                    itemsToPrint.forEach(item => {
                                        const quantity = item.quantity || item.qnt || 1;
                                        const title = formatProductTitle(item) || 'Unknown Item';
                                        kotHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                                        <span>${quantity}x ${title}</span>
                                                    </div>`;
                                        if (item.instructions) {
                                            kotHtml += `<div style="font-size: 10px; padding-left: 15px; margin-bottom: 3px;"><em>Notes: ${item.instructions}</em></div>`;
                                        }
                                    });

                                    // After printing newly added items, clear their flags to avoid duplicate printing
                                    if (hasNewItems) {
                                        try {
                                            // Update the items to clear the newlyAdded flag and quantity
                                            const updatedItems = orderData.items.map(item => ({
                                                ...item,
                                                newlyAdded: false,
                                                newlyAddedQty: 0  // Reset the newly added quantity as well
                                            }));

                                            // Schedule the update to run after printing is complete
                                            setTimeout(async () => {
                                                try {
                                                    const orderRef = sdk.db.collection("Orders").doc(orderData.id);
                                                    const sanitize = (val) => {
                                                        if (typeof val === 'undefined' || val === null) return null;
                                                        if (Array.isArray(val)) return val.map(sanitize);
                                                        if (typeof val === 'object') {
                                                            const out = {};
                                                            for (const k of Object.keys(val)) {
                                                                try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                                                            }
                                                            return out;
                                                        }
                                                        return val;
                                                    };
                                                    await orderRef.update({ items: sanitize(updatedItems) });
                                                    console.log("Cleared newlyAdded flags and quantities after KOT printing");
                                                } catch (err) {
                                                    console.error("Error clearing newlyAdded flags:", err);
                                                }
                                            }, 500);
                                        } catch (error) {
                                            console.error("Error preparing flag update:", error);
                                        }
                                    }
                                } else {
                                    kotHtml += `<p>${t('noItems')}</p>`;
                                }

                                if (orderData.instructions) {
                                    kotHtml += `<hr style="border: none; border-top: 1px dashed #000; margin: 10px 0;" />`;
                                    kotHtml += `<p style="font-weight: bold; margin-bottom: 5px;">SPECIAL INSTRUCTIONS:</p>`;
                                    kotHtml += `<p>${orderData.instructions}</p>`;
                                }

                                kotHtml += `<hr style="border: none; border-top: 1px dashed #000; margin: 10px 0;" />`;
                                kotHtml += `<p style="text-align: center; margin-top: 10px;">* End of KOT *</p>`;
                                kotHtml += `</div>`;

                                const printFrame = document.createElement('iframe');
                                printFrame.style.position = 'fixed';
                                printFrame.style.top = '-9999px'; // Position off-screen
                                printFrame.style.left = '-9999px';
                                printFrame.style.width = '0'; // Minimize impact
                                printFrame.style.height = '0';
                                printFrame.style.border = '0';
                                document.body.appendChild(printFrame);

                                printFrame.contentDocument.open();
                                printFrame.contentDocument.write('<html><head><title>Print KOT</title>');
                                printFrame.contentDocument.write('<style> body { margin: 0; padding: 0; color: #000; background: #fff; } @media print { @page { size: 80mm auto; margin: 3mm; } html, body { width: 74mm; } h2, p { margin: 0 0 3px 0; } hr { margin: 5px 0; } } </style>');
                                printFrame.contentDocument.write('</head><body>');
                                printFrame.contentDocument.write(kotHtml);
                                printFrame.contentDocument.write('</body></html>');
                                printFrame.contentDocument.close();

                                // Ensure content is loaded before printing
                                printFrame.onload = () => {
                                    printFrame.contentWindow.focus();
                                    printFrame.contentWindow.print();
                                    // More robust cleanup
                                    setTimeout(() => {
                                        if (document.body.contains(printFrame)) {
                                            document.body.removeChild(printFrame);
                                        }
                                    }, 1000); // Delay to ensure print dialog is processed
                                };
                                // For browsers that might not fire onload for dynamically written iframes promptly
                                if (printFrame.contentWindow.document.readyState === 'complete') {
                                    printFrame.onload();
                                }

                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    ModalManager.showToast('KOT sent to browser print dialog', 'success');
                                } else {
                                    alert('KOT sent to browser print dialog');
                                }
                            } catch (fallbackError) {
                                console.error('Error during KOT printing:', fallbackError);
                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    ModalManager.showToast(`KOT printing failed: ${fallbackError.message}`, 'error');
                                } else {
                                    alert(`KOT printing failed: ${fallbackError.message}`);
                                }
                            }
                        } else {
                            console.log('Print KOT for order (simulation - KOTs not enabled):', orderId || order.id);
                            if (ModalManager && typeof ModalManager.showToast === 'function') {
                                ModalManager.showToast('KOT Printed successfully (simulation)', 'success');
                            } else {
                                alert('KOT Printed successfully (simulation)');
                            }
                        }
                        modalControl.close();
                    } catch (error) {
                        console.error("Error printing kitchen order:", error);
                        if (ModalManager && typeof ModalManager.showToast === 'function') {
                            ModalManager.showToast(t('failedToPrintKitchenOrder') + ": " + error.message, { type: "error" });
                        } else {
                            alert(t('failedToPrintKitchenOrder') + ": " + error.message);
                        }
                    }
                };

                // Create a temporary div to render the React component
                const tempDiv = document.createElement('div');
                
                // Create a wrapper element that includes the LanguageProvider
                const element = React.createElement(
                    LanguageProvider,
                    null,
                    React.createElement(OrderDetailsContent, { order: order, modalControl: modalControl })
                );
                
                const root = ReactDOM.createRoot(tempDiv);
                root.render(element);

                // Wait for render to complete then set the content
                // Using a slightly longer delay to ensure translations are applied
                setTimeout(() => {
                    modalControl.setContent(tempDiv.innerHTML);

                    // Event Delegation for action buttons
                    const modalContent = document.getElementById(modalOptions.id);
                    if (modalContent) {
                        modalContent.addEventListener('click', (event) => {
                            const target = event.target.closest('button');
                            if (!target) return;

                            const action = target.dataset.action;
                            if (action === 'accept-order') {
                                if (modalControl.onAccept) modalControl.onAccept(order.id);
                                modalControl.close();
                            } else if (action === 'reject-order') {
                                if (modalControl.onReject) modalControl.onReject(order.id);
                                modalControl.close();
                            }
                        });
                    }
                }, 50);
            }
        };

        if (isMobile) {
            ModalManager.createSideDrawerModal({
                ...modalOptions,
                size: 'lg' // Or another appropriate size for mobile
            });
        } else {
            ModalManager.createSideDrawerModal(modalOptions);
        }
    };

    // Get status color
    const getStatusColor = (status) => {
        if (!status) return 'bg-gray-50 text-gray-600 border-gray-200';

        const label = status.label?.toUpperCase();

        if (label === 'PLACED') return 'bg-red-50 text-red-600 border-red-100';
        if (label === 'KITCHEN') return 'bg-orange-50 text-orange-600 border-orange-100';
        if (label === 'COMPLETED') return 'bg-green-50 text-green-600 border-green-100';
        if (label === 'CANCELLED') return 'bg-red-50 text-red-600 border-red-100';

        return 'bg-gray-50 text-gray-600 border-gray-200';
    };

    // Get status badge color
    const statusColor = getStatusColor(order.currentStatus);

    return (
        <div className="my-2">
            <div
                className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all border border-gray-200"
            >
                {/* Order card content - clickable area */}
                <div
                    className="p-3 md:p-4 cursor-pointer"
                    onClick={handleOrderClick}
                >
                    <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
                                <i className="ph ph-shopping-bag text-red-500 text-base"></i>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-medium text-gray-900 line-clamp-1 max-w-[120px] md:max-w-[200px] text-sm md:text-base">
                                        {order.custName || t('guestCustomer')}
                                    </h3>
                                    {splitInfo && (
                                        <span className="px-2 py-0.5 inline-flex items-center text-xs font-medium rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                                            <i className="ph ph-users mr-1 text-purple-600"></i>
                                            Split bill
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-xs text-gray-500">
                                        {timeAgo}
                                    </p>
                                    {order.custPhone ? (
                                        <>
                                            <span className="text-gray-300">•</span>
                                            <button
                                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.location.href = `tel:${order.custPhone}`;
                                                }}
                                                title={t('callCustomer')}
                                            >
                                                <i className="ph ph-phone"></i>
                                                {order.custPhone}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-gray-300">•</span>
                                            <span className="text-xs text-gray-400 italic flex items-center gap-1">
                                                <i className="ph ph-phone-slash"></i>
                                                {t('noPhone')}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm md:text-base font-semibold text-red-600">
                                {UserSession?.getCurrency()}{grandTotal.toFixed(2)}
                                {order.payMode === 'UNSETTLED' && !order.settled && order.settledAmount > 0 && (
                                    <div className="text-xs text-green-600 font-normal">
                                        {t('paid')}: {UserSession?.getCurrency()}{order.settledAmount}
                                    </div>
                                )}
                                {order.payMode === 'UNSETTLED' && !order.settled && (
                                    <div className="text-xs text-orange-600 font-normal">
                                {t('due')}: {UserSession?.getCurrency()}{(numericTotal - (order.settledAmount || 0)).toFixed(2)}
                                    </div>
                                )}
                            </div>
                            <div className="text-xs text-gray-500">#{order.id?.slice(-6)}</div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 mt-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center border ${statusColor}`}>
                                {order.currentStatus?.label === "PLACED" && <i className="ph ph-hourglass text-red-600 mr-1"></i>}
                                {order.currentStatus?.label === "KITCHEN" && <i className="ph ph-cooking-pot text-orange-600 mr-1"></i>}
                                {order.currentStatus?.label === "COMPLETED" && <i className="ph ph-check-circle text-green-600 mr-1"></i>}
                                {order.currentStatus?.label?.toUpperCase() || "PLACED"}
                            </span>
                            <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs font-medium rounded-full inline-flex items-center border border-red-100">
                                <i className="ph ph-shopping-cart-simple text-xs mr-1"></i>
                                {totalItems} {totalItems === 1 ? t('item') : t('items')}
                            </span>
                            {order.payMode === 'UNSETTLED' && (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full inline-flex items-center border ${order.settled
                                        ? 'bg-green-50 text-green-600 border-green-100'
                                        : order.settledAmount > 0
                                            ? 'bg-yellow-50 text-yellow-600 border-yellow-100'
                                            : 'bg-orange-50 text-orange-600 border-orange-100'
                                    }`}>
                                    <i className={`text-xs mr-1 ${order.settled
                                            ? 'ph ph-check-circle'
                                            : order.settledAmount > 0
                                                ? 'ph ph-clock-clockwise'
                                                : 'ph ph-credit-card'
                                        }`}></i>
                                    {order.settled ? t('settled') : order.settledAmount > 0 ? t('partial') : t('unsettled')}
                                </span>
                            )}
                            {order.unsettledSettledAt && (
                                <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs font-medium rounded-full inline-flex items-center border border-yellow-100">
                                    <i className="ph ph-clock text-xs mr-1"></i>
                                    Settled 
                                </span>
                            )}
                            <span className="hidden md:inline-flex px-2 py-0.5 bg-gray-50 text-gray-600 text-xs font-medium rounded-full items-center border border-gray-200">
                                <i className="ph ph-map-pin text-gray-500 mr-1"></i>
                                {order.address?.area || t('inStore')}
                            </span>
                            {/* Split breakdown is shown in order details modal; not on the card */}
                        </div>
                        <span className="text-2xs md:text-xs text-gray-500">
                            {orderSource === 'In-store' ? t('inStore') : orderSource}
                        </span>
                    </div>
                </div>

                {/* Action buttons - separate from clickable area */}
                {isNewOrder && (
                    <div className="border-t border-gray-100">
                        {/* Mobile buttons stacked for small screens */}
                        <div className="grid grid-cols-2 md:hidden">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAccept(order.id);
                                }}
                                className="py-1.5 bg-white text-green-600 flex items-center justify-center gap-1 hover:bg-green-50 transition-colors text-xs font-medium cursor-default border-r border-gray-100"
                            >
                                <i className={`text-sm ${isNewOrder ? 'ph ph-check-circle' : 'ph ph-check'}`}></i>
                                <span>{t('accept')}</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onReject(order.id);
                                }}
                                className="py-1.5 bg-white text-red-600 flex items-center justify-center gap-1 hover:bg-red-50 transition-colors text-xs font-medium cursor-default"
                            >
                                <i className={`text-sm ${isNewOrder ? 'ph ph-clock' : 'ph ph-x'}`}></i>
                                <span>{t('reject')}</span>
                            </button>
                        </div>

                        {/* Desktop buttons - compact right-aligned */}
                        <div className="hidden md:flex justify-end p-2">
                            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAccept(order.id);
                                    }}
                                    className="px-3 py-1.5 bg-white text-green-600 flex items-center justify-center gap-1.5 hover:bg-green-50 transition-colors text-xs font-medium cursor-default border-r border-gray-200"
                                >
                                    <i className={`${isNewOrder ? 'ph ph-check-circle' : 'ph ph-check'}`}></i>
                                    <span>{t('accept')}</span>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onReject) {
                                            console.log("Rejecting order with ID:", order.id);
                                            onReject(order.id);
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-white text-red-600 flex items-center justify-center gap-1.5 hover:bg-red-50 transition-colors text-xs font-medium cursor-default"
                                >
                                    <i className={`${isNewOrder ? 'ph ph-clock' : 'ph ph-x'}`}></i>
                                    <span>{t('reject')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Order Details Content Component for use with ModalManager
export function OrderDetailsContent({ order, modalControl }) {
    const { t } = useLanguage();

    // Use getTotalsForBill() with fallback for safety
    let billTotals;
    let subTotal, charges, discount, finalAmount, paid, due;
    
    if (typeof order.getTotalsForBill === 'function') {
        billTotals = order.getTotalsForBill();
        ({ subTotal, charges, discount, finalAmount, paid, due } = billTotals);
    } else {
        // Fallback: manual calculation if getTotalsForBill is not available
        console.log("OrderDetailsContent: Using fallback calculation");
        const totalAmount = order.items?.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || item.qnt || 1)), 0) || 0;
        const orderDiscount = order.discount || 0;
        
        // Manual Calculation Logic (Discount BEFORE Tax) to match Passbook
        const taxableAmount = Math.max(0, totalAmount - orderDiscount);
        let calculatedFinal = taxableAmount;
        const calculatedChargesFallback = [];

        if (order.charges && Array.isArray(order.charges)) {
            order.charges.forEach(charge => {
                let chargeAmt = 0;
                let pct = 0;
                if (charge.type === 'percentage' || (charge.value && charge.value.toString().includes('%'))) {
                    if (charge.type === 'percentage') {
                        pct = parseFloat(charge.value) || 0;
                    } else {
                        pct = parseFloat(charge.value.toString().replace('%', '').trim()) || 0;
                    }
                    
                    if (charge.inclusive) {
                        chargeAmt = parseFloat(((taxableAmount * pct) / (100 + pct)).toFixed(2));
                    } else {
                        chargeAmt = parseFloat(((taxableAmount * pct) / 100).toFixed(2));
                        calculatedFinal += chargeAmt;
                    }
                } else {
                    chargeAmt = parseFloat(charge.value) || 0;
                    if (!charge.inclusive) {
                        calculatedFinal += chargeAmt;
                    }
                }
                
                if (chargeAmt !== 0) {
                    calculatedChargesFallback.push({
                        ...charge,
                        calculatedAmount: chargeAmt,
                        displayName: charge.name
                    });
                }
            });
        }
        
        // Round final amount
        calculatedFinal = parseFloat(calculatedFinal.toFixed(2));

        subTotal = totalAmount;
        charges = calculatedChargesFallback;
        discount = orderDiscount;
        finalAmount = calculatedFinal;
        paid = order.settledAmount || 0;
        due = Math.max(0, finalAmount - paid);
        
        // Differentiate debug info
        window.tempCalculationSource = "FALLBACK";
    }

    // Loyalty / redeemed points info (used in bill details and payment badge)
    const loyaltyPointsUsedNum = Number(order.loyaltyPointsUsed || order.redeemedPoints || 0) || 0;
    const loyaltyDiscountAmount = Number(order.loyaltyDiscountAmount || order.loyaltyDiscount || 0) || 0;
    const loyaltyUsed = loyaltyPointsUsedNum > 0;

    // Grand Total = finalAmount (already has discount applied by ChargesCalculator) - loyalty discount
    // Note: ChargesCalculator now applies regular discount BEFORE tax, so finalAmount is already discounted
    const grandTotal = Math.max(0, (Number(finalAmount || 0) - Number(loyaltyDiscountAmount || 0)));

    // Split summary builder (local to modal)
    const buildSplitSummaryForModal = () => {
        const splitInfoLocal = order.splitBill && order.splitBill.enabled ? order.splitBill : null;
        if (!splitInfoLocal) return [];
        // Build expected splits from customSplits / equal / numberOfPeople
        let expectedSplits = [];
        if (splitInfoLocal.type === 'equal') {
            const count = Number(splitInfoLocal.numberOfPeople || 0) || 0;
            const amt = Number(splitInfoLocal.amountPerPerson || 0) || 0;
            for (let i = 0; i < count; i++) expectedSplits.push({ expectedAmount: amt, label: `Split ${i + 1}` });
        } else if (Array.isArray(splitInfoLocal.customSplits) && splitInfoLocal.customSplits.length > 0) {
            expectedSplits = splitInfoLocal.customSplits.map((s, i) => ({ expectedAmount: Number(s.amount || 0) || 0, label: s.label || s.name || `Split ${i + 1}` }));
        } else if (splitInfoLocal.numberOfPeople) {
            const count = Number(splitInfoLocal.numberOfPeople || 0) || 0;
            const total = Number(splitInfoLocal.totalAmount || finalAmount) || finalAmount;
            const per = count > 0 ? Math.round((total / count) * 100) / 100 : 0;
            for (let i = 0; i < count; i++) expectedSplits.push({ expectedAmount: per, label: `Split ${i + 1}` });
        }

        // Prefer partialPayments but fall back to any payments recorded on the order
        const partials = Array.isArray(order.partialPayments) && order.partialPayments.length > 0
            ? order.partialPayments
            : (Array.isArray(order.payments) ? order.payments : []);

        // If no expected splits but partials exist, use partials as splits
        if ((expectedSplits.length === 0 || expectedSplits.every(s => !s || s.expectedAmount === 0)) && Array.isArray(partials) && partials.length > 0) {
            return partials.map((p, idx) => {
                const amt = Number(p.amount || p.paidAmount || 0) || 0;
                const payer = p.payer || p.name || null;
                const label = p.splitLabel || (payer ? payer : `Split ${idx + 1}`);
                // Normalize payment method like we do in PassbookCalculator
                const rawMethod = p.paymentMode || p.mode || null;
                const normalizedMethod = rawMethod === 'DIGITAL' ? 'upi' : 
                                       rawMethod === 'CASH' ? 'cash' : 
                                       (rawMethod ? rawMethod.toLowerCase() : null);
                
                return {
                    label,
                    expectedAmount: amt,
                    paidAmount: amt,
                    paymentMethod: normalizedMethod,
                    paymentDate: p.date?.toDate ? p.date.toDate() : (p.date ? new Date(p.date) : null),
                    payer,
                    paid: amt > 0
                };
            });
        }

        const shouldSynthesize = (!Array.isArray(partials) || partials.length === 0) && (order.paid === true || order.settled === true || Number(order.settledAmount || 0) >= Number(finalAmount || 0));

        return expectedSplits.map((split, idx) => {
            const expectedAmount = Number(split.expectedAmount || 0) || 0;
            const splitLabel = split.label || `Split ${idx + 1}`;

            let match = null;
            if (Array.isArray(partials) && partials.length > 0) {
                // 1. notes or payer name match
                match = partials.find(p => {
                    try {
                        const notes = p.notes ? p.notes.toString().toLowerCase() : '';
                        const payer = (p.payer || p.name || '').toString().toLowerCase();
                        if (notes && splitLabel && notes.includes(splitLabel.toString().toLowerCase())) return true;
                        if (split.label && payer && payer.includes(split.label.toString().toLowerCase())) return true;
                        return false;
                    } catch (e) { return false; }
                }) || null;

                // 2. amount-equality fallback
                if (!match) {
                    match = partials.find(p => {
                        try { const amt = Number(p.amount || p.paidAmount || 0) || 0; return Math.abs(amt - expectedAmount) < 0.011; } catch (e) { return false; }
                    }) || null;
                }

                // 3. index-based fallback
                if (!match && partials.length === expectedSplits.length) {
                    match = partials[idx] || null;
                }

                // 4. legacy id-based match
                if (!match) {
                    match = partials.find(p => {
                        try { return p.id && p.id.toString().toLowerCase().includes(`split-${idx + 1}`); } catch (e) { return false; }
                    }) || null;
                }
            }

            let paidAmount = match ? Number(match.amount || match.paidAmount || 0) : 0;
            if ((!match || paidAmount === 0) && shouldSynthesize) paidAmount = expectedAmount;

            // Normalize payment method like we do in PassbookCalculator
            const rawMethod = match ? (match.paymentMode || match.mode || null) : null;
            const normalizedMethod = rawMethod === 'DIGITAL' ? 'upi' : 
                                   rawMethod === 'CASH' ? 'cash' : 
                                   (rawMethod ? rawMethod.toLowerCase() : null);
                            
            return {
                label: splitLabel,
                expectedAmount,
                paidAmount,
                paymentMethod: normalizedMethod,
                paymentDate: match ? (match.date?.toDate ? match.date.toDate() : new Date(match.date || Date.now())) : null,
                payer: match ? (match.payer || match.name || null) : null,
                paid: Number(paidAmount) > 0
            };
        });
    };

    // Determine order status for showing appropriate actions
    const isNewOrder = order.currentStatus?.label === OrderStatus.PLACED;
    const isCompletedOrder = order.currentStatus?.label === OrderStatus.COMPLETED || order.paid === true;
    const isProcessingOrder = order.currentStatus?.label === "KITCHEN";

    // Get payment mode display name
    const getPaymentModeDisplay = (payMode) => {
        if (!payMode) return t('notPaid');

        switch (payMode.toUpperCase()) {
            case 'CASH': return t('cashPayment');
            case 'DIGITAL': return t('digitalPayment');
            case 'CREDIT': return t('creditPayment');
            default: return payMode;
        }
    };

    useEffect(() => {
        // Set up the print bill handler for DOM access
        modalControl.printBillHandler = handlePrintBill;

        // Set up a global handler that can be called from onclick HTML attribute
        modalPrintBill = () => {
            console.log("Print bill triggered from global handler");
            handlePrintBill();
            return false; // Prevent default
        };

        // After component is rendered and HTML is injected, set up DOM event listener
        setTimeout(() => {
            const printButton = document.getElementById('print-bill-button');
            if (printButton) {
                printButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log("Print bill button clicked via DOM event");
                    handlePrintBill();
                });
            }
        }, 100);

        // Cleanup function
        return () => {
            modalPrintBill = null;
        };
    }, []);

    // Separate effect for setting title to ensure it runs after content is updated
    useEffect(() => {
        // Set the title after a short delay to ensure the DOM is updated
        const timer = setTimeout(() => {
            if (modalControl && typeof modalControl.setTitle === 'function') {
                modalControl.setTitle(t('orderDetails'));
            }
        }, 0);
        
        return () => clearTimeout(timer);
    }, [t, modalControl]);

    function handlePrintBill() {
        console.log("Printing bill");
        try {
            if (BluetoothPrinting) {
                console.log("Printing bill...", order.id);
                // Print the bill directly
                BluetoothPrinting.printBill(order.id);

                // Show success message
                if (ModalManager && typeof ModalManager.showToast === 'function') {
                    ModalManager.showToast(t('billPrinted'), { type: "success" });
                }
            } else {
                console.error("BluetoothPrinting service not available");
                if (ModalManager && typeof ModalManager.showToast === 'function') {
                    ModalManager.showToast(t('printingServiceNotAvailable'), { type: "error" });
                }
            }
        } catch (error) {
            console.error("Error printing bill:", error);
            if (ModalManager && typeof ModalManager.showToast === 'function') {
                ModalManager.showToast(t('failedToPrintBill') + ": " + error.message, { type: "error" });
            }
        }
        modalControl.close();
    }

    return (
        <div className="p-4 space-y-4">
            {/* Customer Info */}
            <div className="bg-gradient-to-br from-warm-bg to-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-red-50 to-white rounded-lg flex items-center justify-center shadow-sm">
                            <i className="ph ph-user text-red-500 text-lg"></i>
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900 truncate max-w-[160px]">
                                {order.custName || t('guestCustomer')}
                            </h3>
                            <p className="text-xs text-gray-500 truncate max-w-[160px]">
                                {order.customer?.phone || t('noPhone')}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="bg-gradient-to-br from-gray-100 to-gray-50 p-2 rounded-lg">
                        <p className="text-xs text-gray-500">{t('orderID')}</p>
                        <p className="font-medium text-sm">#{order.id?.slice(-6)}</p>
                    </div>
                    <div className="bg-gradient-to-br from-gray-100 to-gray-50 p-2 rounded-lg">
                        <p className="text-xs text-gray-500">{t('dateTime')}</p>
                        <p className="font-medium text-sm truncate">
                            {formatDate(order.date, 'full')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Items List */}
            <div>
                <h3 className="text-sm font-semibold mb-2 text-gray-700 flex items-center">
                    <i className="ph ph-shopping-cart text-red-500 mr-1.5"></i>
                    {t('orderItems')}
                </h3>
                <div className="space-y-2">
                    {order.items?.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-3 bg-gradient-to-br from-warm-bg to-white rounded-lg border border-gray-200 shadow-sm">
                            <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                                {item.image ? (
                                    <img
                                        src={item.image}
                                        alt={item.title}
                                        className="w-full h-full object-cover rounded-lg"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                                        }}
                                    />
                                ) : (
                                    <i className="ph ph-hamburger text-gray-400 text-lg"></i>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-900 truncate">{formatProductTitle(item)}</h4>
                                <div className="flex justify-between items-center mt-1">
                                    <p className="text-xs text-gray-500">
                                        {item.qnt} x {UserSession?.getCurrency()}{item.price || 0}
                                    </p>
                                    <p className="font-medium text-sm">
                                        {UserSession?.getCurrency()}{(item.qnt) * (item.price || 0)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bill Details */}
            <div className="bg-gradient-to-br from-warm-bg to-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <h3 className="text-sm font-semibold mb-3 text-gray-700 flex items-center">
                    <i className="ph ph-receipt text-red-500 mr-1.5"></i>
                    {t('billDetails')}
                </h3>
                <div className="space-y-2 text-sm">
                    {/* Item Total from getTotalsForBill */}
                    <div className="flex justify-between">
                        <span className="text-gray-600">{t('itemTotal')}</span>
                        <span className="font-medium">{UserSession?.getCurrency()}{subTotal.toFixed(2)}</span>
                    </div>

                    {/* Display each charge from getTotalsForBill().charges */}
                    {charges && charges.length > 0 && charges.map((charge, index) => {
                        const chargeName = charge.displayName || charge.name || 'Charge';
                        const chargeAmount = Number(charge.calculatedAmount || 0);
                        
                        // Skip if charge amount is 0
                        if (chargeAmount === 0) return null;
                        
                        return (
                            <div key={index} className="flex justify-between">
                                <span className="text-gray-600">{chargeName}</span>
                                <span className="font-medium">{UserSession?.getCurrency()}{chargeAmount.toFixed(2)}</span>
                            </div>
                        );
                    })}

                    {/* Discount from getTotalsForBill */}
                    {discount > 0 && (
                        <div className="flex justify-between text-green-600">
                            <span>{t('discount')}</span>
                            <span>- {UserSession?.getCurrency()}{discount.toFixed(2)}</span>
                        </div>
                    )}

                    {/* Display redeemed points if loyalty used */}
                    {loyaltyUsed && (
                        <div className="flex justify-between text-gray-600">
                            <span>Redeemed Points</span>
                            <span className="font-medium">{loyaltyPointsUsedNum} pts (-{UserSession?.getCurrency()}{loyaltyDiscountAmount.toFixed(2)})</span>
                        </div>
                    )}

                    {/* Grand Total = finalAmount (after discount) - loyalty discount */}
                    <div className="border-t border-gray-200 pt-2 flex justify-between mt-2">
                        <span className="font-medium">{t('grandTotal')}</span>
                        <span className="font-semibold text-red-600">{UserSession?.getCurrency()}{grandTotal.toFixed(2)}</span>
                    </div>

                    {/* Payment Method from order.payMode */}
                    {(order.payMode || loyaltyUsed) && (
                        <div className="flex justify-between items-center pt-1 text-xs">
                            <span className="text-gray-600">{t('paymentMethod')}</span>
                            <span className={`font-medium px-2 py-0.5 rounded-full ${order.payMode === 'CASH' ? 'bg-green-50 text-green-600' :
                                order.payMode === 'DIGITAL' ? 'bg-red-50 text-red-600' :
                                    order.payMode === 'CREDIT' ? 'bg-orange-50 text-orange-600' :
                                        'bg-gray-50 text-gray-600'
                                }`}>
                                {loyaltyUsed ? (
                                    <>
                                        {loyaltyPointsUsedNum} pts
                                        {order.payMode && ` + ${getPaymentModeDisplay(order.payMode)}`}
                                    </>
                                ) : (
                                    getPaymentModeDisplay(order.payMode)
                                )}
                            </span>
                        </div>
                    )}
                    {/* Split breakdown for modal view */}
                    {order.splitBill && order.splitBill.enabled && (
                        <div className="mt-4 bg-white rounded-lg p-3 border border-purple-100">
                            <h4 className="text-sm font-medium text-purple-700 mb-2 flex items-center">
                                <i className="ph ph-users mr-2 text-purple-600"></i>
                                Split Breakdown
                            </h4>
                            <div className="space-y-2">
                                {buildSplitSummaryForModal().map((s, idx) => (
                                    <div key={idx} className="flex justify-between items-center">
                                        <div>
                                            <div className="font-medium text-gray-800">{s.label || `Split ${idx + 1}`}</div>
                                            <div className="text-xs text-gray-500">{s.paymentDate ? formatDate(s.paymentDate, 'long') : 'Not paid yet'}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold text-purple-700">{UserSession?.getCurrency()}{(s.paidAmount || 0).toFixed(2)}</div>
                                            <div className="text-xs text-gray-500">{s.paymentMethod ? (s.paymentMethod === 'upi' ? 'Digital' : s.paymentMethod === 'cash' ? 'Cash' : s.paymentMethod === 'mixed' ? 'Mixed' : s.paymentMethod) : 'Unpaid'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Order Status */}
            <div className="bg-gradient-to-br from-warm-bg to-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <h3 className="text-sm font-semibold mb-3 text-gray-700 flex items-center">
                    <i className="ph ph-flag text-red-500 mr-1.5"></i>
                    {t('orderStatus')}
                </h3>
                <div className="flex items-center">
                    <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${isNewOrder ? 'bg-red-100 text-red-600' :
                        isProcessingOrder ? 'bg-orange-100 text-orange-600' :
                            isCompletedOrder ? 'bg-green-100 text-green-600' :
                                'bg-gray-100 text-gray-600'
                        }`}>
                        <i className={`ph ${isNewOrder ? 'ph-hourglass text-red-600' :
                            isProcessingOrder ? 'ph-cooking-pot text-orange-600' :
                                isCompletedOrder ? 'ph-check-circle text-green-600' :
                                    'ph-question text-gray-600'
                            } mr-1.5`}></i>
                        {order.currentStatus?.label?.toUpperCase() || "PLACED"}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            {isNewOrder && (
                <div className="pt-2 space-y-2">
                    <div className="flex gap-2">
                        <button
                            data-action="accept-order"
                            className="flex-1 py-2.5 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg flex items-center justify-center gap-1.5 hover:from-green-700 hover:to-green-600 transition-colors text-sm font-medium shadow-sm"
                        >
                            <i className="ph ph-check"></i>
                            <span>{t('acceptOrder')}</span>
                        </button>
                        <button
                            data-action="reject-order"
                            className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg flex items-center justify-center gap-1.5 hover:from-red-700 hover:to-red-600 transition-colors text-sm font-medium shadow-sm"
                        >
                            <i className="ph ph-x"></i>
                            <span>{t('rejectOrder')}</span>
                        </button>
                    </div>
                </div>
            )}

            {isProcessingOrder && (
                <button
                    onClick={async (e) => {
                        e.stopPropagation();
                        try {
                            if (BluetoothPrinting) {
                                // Show connecting message
                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    if (!BluetoothPrinting.connected) {
                                        ModalManager.showToast(t('connectingToPrinter'), { type: "info" });
                                    } else {
                                        ModalManager.showToast(t('printingKitchenOrder'), { type: "info" });
                                    }
                                }

                                // Print the kitchen order directly
                                await BluetoothPrinting.printKOT(order.id);

                                // Show success message
                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    ModalManager.showToast(t('kitchenOrderPrinted'), { type: "success" });
                                }
                            } else if (onPrintBill) {
                                onPrintBill(order.id);
                            } else {
                                console.error("BluetoothPrinting service not available");
                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    ModalManager.showToast(t('printingServiceNotAvailable'), { type: "error" });
                                }
                            }
                        } catch (error) {
                            console.error("Error printing kitchen order:", error);
                            if (ModalManager && typeof ModalManager.showToast === 'function') {
                                ModalManager.showToast("Failed to print kitchen order: " + error.message, { type: "error" });
                            }
                        }
                        modalControl.close();
                    }}
                    className="w-full py-3 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg flex items-center justify-center gap-2 hover:from-red-700 hover:to-red-600 transition-colors text-sm font-medium shadow-sm mt-2"
                >
                    <i className="ph ph-printer text-lg"></i>
                    <span>{t('printKitchenOrder')}</span>
                </button>
            )}

            {isCompletedOrder && (
                <button
                    id="print-bill-button"
                    data-action="print-bill"
                    onClick={() => modalPrintBill && modalPrintBill()}
                    className="w-full py-3 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg flex items-center justify-center gap-2 hover:from-red-700 hover:to-red-600 transition-colors text-sm font-medium shadow-sm"
                >
                    <i className="ph ph-printer text-lg"></i>
                    <span>{t('printBill')}</span>
                </button>
            )}
        </div>
    );
}
