// Lightweight Order class for plain order data (Firestore docs)
// Lightweight Order class for plain order data (Firestore docs)
export class Order {
  constructor(data) {
    this.data = data || {};
  }

  get id() {
    return this.data?.id;
  }

  get custId() {
    return this.data?.custId;
  }

  get items() {
    return Array.isArray(this.data?.items) ? this.data.items : [];
  }

  // ✅ SINGLE SOURCE OF TRUTH
  get total() {
    if (typeof this.data?.payableAmount === 'number') {
      return this.data.payableAmount;
    }
    return Number(this.data?.finalAmount ?? this.data?.total ?? 0) || 0;
  }

  get placeDate() {
    if (this.data?.date && typeof this.data.date.toDate === 'function') {
      return this.data.date.toDate();
    }
    if (this.data?.placeDate && typeof this.data.placeDate.toDate === 'function') {
      return this.data.placeDate.toDate();
    }
    return this.data?.date
      ? new Date(this.data.date)
      : (this.data?.placeDate ? new Date(this.data.placeDate) : null);
  }
}




import { UserSession } from '../utils/UserSession.js';
import { sdk } from '../sdk.js';
import { formatProductTitle, showToast } from '../utils.js';
import { ChargesCalculator } from '../utils/ChargesCalculator.js';

// Sanitize outgoing payloads for Firestore updates.
// Preserves non-plain objects like Firestore FieldValue and Date/Timestamp instances.
const sanitizeForFirestore = (val) => {
    const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
    const sanitize = (v) => {
        if (typeof v === 'undefined' || v === null) return null;
        if (v instanceof Date) return v;
        if (Array.isArray(v)) return v.map(sanitize);
        if (typeof v === 'object') {
            // If not a plain object, preserve as-is (likely FieldValue/Timestamp/etc)
            if (!isPlainObject(v)) return v;
            const out = {};
            for (const k of Object.keys(v)) {
                try { out[k] = sanitize(v[k]); } catch (e) { out[k] = null; }
            }
            return out;
        }
        return v;
    };
    return sanitize(val);
};

// Order models for Shopto
const DUMMY_THUMB = "https://firebasestorage.googleapis.com/v0/b/frihbi-app.appspot.com/o/assets%2Fproduct-placeholder.png?alt=media&token=183bdac4-2f9b-4645-8147-7cfa921ba0e9";

// Payment modes enum
export const PaymentMode = {
    DIGITAL: "DIGITAL",
    CASH: "CASH",
    CREDIT: "CREDIT",
    UNSETTLED: "UNSETTLED"
};

// Order status enum
export const OrderStatus = {
    PLACED: "PLACED",
    KITCHEN: "KITCHEN",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED"
};

// Helper function to convert string to PaymentMode
function asPaymentMode(mode) {
    return Object.values(PaymentMode).includes(mode) ? mode : PaymentMode.CASH;
}

// Charge class for additional charges like tax, packaging, etc.
export class Charge {
    constructor(data = {}) {
        this.name = data.name || '';
        this.value = data.value || 0;
        this.type = data.type || 'percentage'; // 'percentage' or 'fixed'
        this.inclusive = data.inclusive || false;
        this.bulkTaxHashtag = data.bulkTaxHashtag || null; // Add support for bulk tax update hashtag
    }

    static fromJson(json) {
        return new Charge(json);
    }

    toJson() {
        return {
            name: this.name,
            value: this.value,
            type: this.type,
            inclusive: this.inclusive,
            bulkTaxHashtag: this.bulkTaxHashtag // Include hashtag in JSON
        };
    }

    // Calculate charge amount based on base price
    calculate(basePrice) {
        if (this.type === 'percentage') {
            // Handle both numeric values and string values with '%'
            let percentValue = this.value;
            if (typeof percentValue === 'string') {
                percentValue = parseFloat(percentValue.replace('%', '').trim()) || 0;
            } else {
                percentValue = parseFloat(percentValue) || 0;
            }
            return (basePrice * percentValue) / 100;
        }
        return parseFloat(this.value) || 0;
    }
}

// Item class - equivalent to Flutter Item
export class Item {
    constructor(data) {
        this.data = data;
    }

    // Constructor from Product
    static fromProduct(product, qnt, variant = null, addons = []) {
        const itemData = {
            pid: product.id,
            title: product.title,
            thumb: product.imgs && product.imgs.length > 0 ? product.imgs[0] : null,
            cat: product.cat,
            mrp: product.mrp,
            price: variant ? variant.price : product.price,
            veg: product.veg,
            served: false,
            qnt: qnt,
            variantId: variant ? variant.id : null,
            variantName: variant ? variant.name : null,
            variantPrice: variant ? variant.price : null,
            addons: addons.map(addon => ({
                id: addon.id,
                name: addon.name,
                price: addon.price
            })),
            addonsTotal: addons.reduce((sum, addon) => sum + addon.price, 0)
        };

        // Include tax update information if present
        if (product.taxUpdateInfo) {
            itemData.taxUpdateInfo = product.taxUpdateInfo;
        }

        return new Item(itemData);
    }

    // Getters
    get pid() {
        return this.data?.pid;
    }

    get title() {
        return this.data?.title;
    }

    get thumb() {
        return this.data?.thumb || Product.DUMMY_THUMB;
    }

    get cat() {
        return this.data?.cat;
    }

    get qnt() {
        return this.data?.qnt || 0;
    }

    get mrp() {
        return this.data?.mrp || 0;
    }

    get price() {
        return this.data?.price || 0;
    }

    get served() {
        return this.data?.served || false;
    }

    get veg() {
        return this.data?.veg || false;
    }

    get subTotal() {
        return this.price * this.qnt;
    }

    get upsell() {
        return this.data?.upsell || false;
    }

    // Update served status locally
    serveLocally(served) {
        this.data.served = served;
    }
}

// Order Status Entry class
export class OrderStatusEntry {
    constructor(statusData) {
        this.statusData = statusData;
    }

    get label() {
        return this.statusData?.label;
    }

    get date() {
        return this.statusData?.date?.toDate ?
            this.statusData.date.toDate() :
            new Date(this.statusData?.date);
    }
}

// MOrder class - equivalent to Flutter MOrder
export class MOrder {
    constructor(data) {
        this.data = data;
    }

    // Constructor with required fields
    static fromItems(id, items, discount, priceVariant, tableId, instructions, charges, isStoreClosing = false, existingBillNo = null) {
        const now = new Date();

        console.log('MOrder.fromItems called with:', {
            id: id,
            itemsCount: items ? items.length : 0,
            discount: discount,
            priceVariant: priceVariant,
            tableId: tableId,
            instructionsLength: instructions ? instructions.length : 0,
            chargesCount: charges ? charges.length : 0,
            isStoreClosing: isStoreClosing,
            existingBillNo: existingBillNo
        });

        // Get the current bill number from localStorage or use a timestamp-based fallback
        // NOTE: Do NOT mutate localStorage here to avoid double-increment when callers
        // (e.g., POS or Checkout flows) also update the counter. Persisting the used
        // bill number should be done once after the order is successfully saved.
        let billNo;
// If existingBillNo is provided (updating an existing order), use it without incrementing
        if (existingBillNo !== null && existingBillNo !== undefined) {
            billNo = existingBillNo;
            console.log(`MOrder.fromItems using existing bill number: ${billNo}`);
        } else {
            // Only generate/increment bill number for new orders
            try {
                // Try to get from localStorage first
                const storedBillNo = parseInt(localStorage.getItem('BILL_NO') || '0');
                billNo = storedBillNo + 1;
                localStorage.setItem('BILL_NO', billNo.toString());
            } catch (e) {
                console.error('Error getting bill number from localStorage:', e);
                // If localStorage fails, use timestamp as fallback
                billNo = Math.floor(Date.now() / 1000) % 10000;
            }

            console.log(`MOrder.fromItems generated new bill number: ${billNo} (isStoreClosing: ${isStoreClosing})`);
        }

        // Check if there's a bulk tax update hashtag in the charges
        let taxUpdateInfo = null;
        if (charges && charges.length > 0) {
            const bulkTaxCharge = charges.find(charge => charge.bulkTaxHashtag);
            if (bulkTaxCharge) {
                taxUpdateInfo = {
                    isFromBulkUpdate: true,
                    hashtag: bulkTaxCharge.bulkTaxHashtag,
                    timestamp: new Date().toISOString()
                };
            }
        }

        // Get seller information from UserSession
        const seller = UserSession ? UserSession.seller : null;

        return new MOrder({
            id: id,
            billNo: billNo,
            items: items.map(item => item.data || item),
            sellerId: seller?.id || null,
            priceVariant: priceVariant,
            tableId: tableId,
            discount: discount,
            paid: false,
            settled: false, // New field for settlement tracking
            settledAmount: 0, // Amount that has been settled
            partialPayments: [], // Array to track partial payments
            splitBill: null, // Bill splitting information
            status: [
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
                label: OrderStatus.KITCHEN,
                date: now
            },
            charges: charges.map(charge => (charge && typeof charge.toJson === 'function') ? charge.toJson() : charge),
            taxUpdateInfo: taxUpdateInfo,
            payMode: PaymentMode.CASH,
            instructions: instructions,
            date: now
        });
    }

    // Getters
    get charges() {
        return this.data?.charges?.map(charge => new Charge(charge)) || [];
    }

    get id() {
        return this.data?.id;
    }

    get billNo() {
        return this.data?.billNo;
    }

    get custId() {
        return this.data?.custId;
    }

    get custName() {
        return this.data?.custName;
    }

    get custPhone() {
        return this.data?.custPhone;
    }

    get items() {
        return this.data?.items?.map(item => new Item(item)) || [];
    }

    get description() {
        return this.items.map(item => `${formatProductTitle(item)} x ${item.qnt}`).join(', ');
    }

    get placeDate() {
        return this.data?.date?.toDate ?
            this.data.date.toDate() :
            new Date(this.data?.date);
    }

    get discount() {
        return this.data?.discount || 0;
    }

    get paid() {
        return this.data?.paid || false;
    }

    get settled() {
        return this.data?.settled || false;
    }

    get settledAmount() {
        return this.data?.settledAmount || 0;
    }

    get partialPayments() {
        return this.data?.partialPayments || [];
    }

    get pendingAmount() {
        return this.total - this.settledAmount;
    }

    get splitBill() {
        return this.data?.splitBill || null;
    }

    get isSplitBill() {
        return this.splitBill !== null && this.splitBill.enabled === true;
    }

    get priceVariant() {
        return this.data?.priceVariant;
    }

    get orderSource() {
        return this.priceVariant || this.tableId;
    }

    get tableId() {
        return this.data?.tableId;
    }

    get sellerId() {
        return this.data?.sellerId;
    }

    get instructions() {
        return this.data?.instructions;
    }

    get payMode() {
        return asPaymentMode(this.data?.payMode);
    }

    get menuFee() {
        return this.data?.menuFee || 0;
    }

    get subTotal() {
        return this.items.reduce((total, item) => total + item.subTotal, 0);
    }

   get total() {
    const result = ChargesCalculator.calculateCharges(
        this.subTotal,
        this.charges,
        this.discount   // PASS DISCOUNT
    );
    return result.finalAmount;
}


    get totalItems() {
        return this.items.reduce((total, item) => total + item.qnt, 0);
    }

    get servedItems() {
        return this.items.reduce((total, item) => total + (item.served ? item.qnt : 0), 0);
    }

    get currentStatus() {
        return new OrderStatusEntry(this.data?.currentStatus);
    }

    get isDineIn() {
        return this.tableId !== null && this.tableId !== undefined;
    }

    get isOnlineOrder() {
        return this.priceVariant?.includes("ONLINE") || 
               this.data?.isOnline ||
               this.data?.source === 'zomato' ||
               this.data?.source === 'swiggy' ||
               this.priceVariant === 'Zomato' ||
               this.priceVariant === 'Swiggy' ||
               this.data?.tableId === 'zomato' ||
               this.data?.tableId === 'swiggy' ||
               false;
    }

    hasStatus(checkStatus) {
        return (this.data?.status?.findIndex(s => s.label === checkStatus) !== -1);
    }

    get ref() {
        return sdk.db.collection("Orders").doc(this.id);
    }

    getOrderSourceColor() {
        const source = this.orderSource;

        if (!source || source.includes("Table")) return "#3498db"; // primary blue
        if (source === "Takeaway") return "#2980b9"; // darker blue

        // Array of colors for different sources
        const colors = [
            "#27ae60", // green
            "#e67e22", // orange
            "#9b59b6", // purple
            "#795548", // brown
            "#e91e63", // pink
            "#009688", // teal
            "#e74c3c", // red
            "#673ab7", // deep purple
            "#ff9800", // orange
        ];

        // Create a simple hash function for the source
        let hash = 0;
        for (let i = 0; i < source.length; i++) {
            hash = ((hash << 5) - hash) + source.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        hash = Math.abs(hash);

        return colors[hash % colors.length];
    }

    // Methods
    async updateStatus(statusList) {
        if (!statusList || statusList.length === 0) return;

        const newStatuses = [];
        const now = new Date();

        statusList.forEach(status => {
            if (!this.hasStatus(status)) {
                newStatuses.push({
                    label: status,
                    date: now
                });
            }
        });

        if (newStatuses.length > 0) {
            await this.ref.update(sanitizeForFirestore({
                currentStatus: newStatuses[newStatuses.length - 1],
                status: sdk.fieldValue.arrayUnion(...newStatuses)
            }));

            await this.reload();
        }
    }

    async serveItem(item, served) {
        // Update locally
        item.serveLocally(served);

        // Get current items
        const itemsData = await this._getOrderItems();
        const index = itemsData.findIndex(i => i.pid === item.pid);

        if (index !== -1) {
            itemsData[index].served = served;
            await this.ref.update(sanitizeForFirestore({ items: itemsData }));
            await this.reload();

            // Analytics tracking would be here in a real implementation
            console.log(`Item ${item.pid} served status set to ${served}`);
        }
    }

    async removeItem(item) {
        if (this.totalItems > 1) {
            // Get current items
            const itemsData = await this._getOrderItems();
            const index = itemsData.findIndex(i => i.pid === item.pid);

            if (index !== -1) {
                // Check for qnt property with fallback
                const currentQty = parseInt(itemsData[index].qnt || 1);
                const completedCount = itemsData[index].completed || 0;

                if (currentQty > 1) {
                    // Reduce quantity by 1
                    const newQuantity = currentQty - 1;
                    
                    // If the new quantity is less than the completed count, 
                    // reduce the completed count as well
                    const newCompleted = newQuantity < completedCount ? newQuantity : completedCount;
                    
                    itemsData[index].qnt = newQuantity;
                    itemsData[index].completed = newCompleted;
                } else {
                    // Remove the item entirely
                    itemsData.splice(index, 1);
                }

                await this.ref.update(sanitizeForFirestore({ items: itemsData }));
                await this.reload();

                showToast(`🗑️ ${formatProductTitle(item)} removed from order`);
                console.log(`Item ${item.pid} removed from order`);
            }
        } else if (UserSession?.seller?.hasPermission("Orders", "Delete")) {
            // Delete the entire order if it's the last item
            await this.ref.delete();
            showToast(`Order deleted`);
        }
    }

    async addItem(item) {
        // Get current items
        const itemsData = await this._getOrderItems();
        const index = itemsData.findIndex(i => i.pid === item.pid);

        if (index !== -1) {
            // Increment quantity of existing item
            const currentQty = parseInt(itemsData[index].qnt || 1);
            const completedCount = itemsData[index].completed || 0;
            const newQuantity = currentQty + 1;
            
            // Preserve the completed count when adding items
            // Ensure completed count doesn't exceed new quantity
            const adjustedCompleted = Math.min(completedCount, newQuantity);
            
            itemsData[index].qnt = newQuantity;
            itemsData[index].completed = adjustedCompleted;

                await this.ref.update(sanitizeForFirestore({ items: itemsData }));
            await this.reload();

            showToast(`🛒 ${formatProductTitle(item)} added to order`);
            console.log(`Item ${item.pid} added to order`);
        }
    }

    async setDiscount(discount) {
        if (this.data) {
            this.data.discount = discount;
            await this.ref.update(sanitizeForFirestore({ discount: discount }));

            showToast(`💰 Discount updated to ${discount}`);
            console.log(`Discount updated to ${discount}`);
        }
    }

    async reload() {
        const doc = await this.ref.get();
        if (doc.exists) {
            this.data = doc.data();
        }
    }

    async _getOrderItems() {
        const orderData = await this._getOrderData();
        return orderData.items || [];
    }

    async _getOrderData() {
        const doc = await this.ref.get();
        return doc.exists ? doc.data() : {};
    }

    // Add partial payment to the order
    async addPartialPayment(amount, paymentMode = 'CASH', notes = '') {
        if (!amount || amount <= 0) {
            throw new Error('Payment amount must be greater than 0');
        }

        const payment = {
            amount: parseFloat(amount),
            paymentMode: paymentMode,
            date: new Date(),
            notes: notes.trim(),
            id: Date.now().toString() // Simple ID for tracking
        };

        const newSettledAmount = this.settledAmount + payment.amount;
        const isFullySettled = newSettledAmount >= this.total;

        const updateData = {
            partialPayments: [...this.partialPayments, payment],
            settledAmount: newSettledAmount,
            settled: isFullySettled,
            paid: isFullySettled // Mark as paid when fully settled
        };

        // Also mirror into a generic payments array for passbook derivation
        try {
            const existingData = await this._getOrderData();
            const existingPayments = Array.isArray(existingData.payments) ? existingData.payments : [];
            updateData.payments = [...existingPayments, {
                id: payment.id,
                method: paymentMode,
                amount: payment.amount,
                date: payment.date,
                at: (payment.date?.getTime ? payment.date.getTime() : Date.now())
            }];
        } catch (mirrorErr) {
            console.warn('[MOrder.addPartialPayment] Failed to mirror to payments array:', mirrorErr);
        }

        // If fully settled, update payment mode to the last payment method
        if (isFullySettled) {
            updateData.payMode = paymentMode;
            try {
                // Ensure COMPLETED status is added so order shows in Completed Orders, Passbook & Reports
                const existingStatuses = Array.isArray(this.data.status) ? [...this.data.status] : [];
                const hasCompleted = existingStatuses.some(s => (s.label || '').toUpperCase() === 'COMPLETED');
                let completedStatusEntry;
                if (!hasCompleted) {
                    completedStatusEntry = { label: OrderStatus.COMPLETED, date: new Date() };
                    existingStatuses.push(completedStatusEntry);
                    updateData.status = existingStatuses;
                    updateData.currentStatus = completedStatusEntry;
                    console.log('[MOrder.addPartialPayment] Added COMPLETED status on full settlement for order', this.id);
                } else {
                    // Ensure currentStatus reflects COMPLETED
                    const existingCompleted = existingStatuses.find(s => (s.label || '').toUpperCase() === 'COMPLETED');
                    if (existingCompleted) {
                        updateData.currentStatus = existingCompleted;
                    }
                }
            } catch (statusErr) {
                console.warn('[MOrder.addPartialPayment] Failed to append COMPLETED status:', statusErr);
            }
        }

    await this.ref.update(sanitizeForFirestore(updateData));
        await this.reload();

        // Dispatch browser events so UI (Passbook, Dashboard, Reports) can refresh immediately
        try {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                // Always dispatch a generic partial payment event
                window.dispatchEvent(new CustomEvent('orderPartialPayment', {
                    detail: {
                        orderId: this.id,
                        payment: payment,
                        settledAmount: newSettledAmount,
                        pendingAmount: this.total - newSettledAmount,
                        fullySettled: isFullySettled
                    }
                }));

                if (isFullySettled) {
                    window.dispatchEvent(new CustomEvent('orderCompleted', {
                        detail: {
                            orderId: this.id,
                            mode: paymentMode,
                            paid: true,
                            status: 'COMPLETED',
                            settled: true
                        }
                    }));
                    console.log('[MOrder.addPartialPayment] Dispatched orderCompleted event for order', this.id);
                }
            }
        } catch (evtErr) {
            console.warn('[MOrder.addPartialPayment] Event dispatch warning:', evtErr);
        }

        return {
            payment,
            settledAmount: newSettledAmount,
            pendingAmount: this.total - newSettledAmount,
            isFullySettled
        };
    }

    // Get settlement summary
    getSettlementSummary() {
        return {
            total: this.total,
            settledAmount: this.settledAmount,
            pendingAmount: this.pendingAmount,
            settled: this.settled,
            payments: this.partialPayments,
            paymentCount: this.partialPayments.length
        };
    }

    // Helpers for partial billing and UI/printing
    getSettlementState() {
        if (this.settled || this.paid) return 'SETTLED';
        if (this.settledAmount > 0) return 'PARTIAL';
        return 'UNSETTLED';
    }

    getPayments() {
        const pp = Array.isArray(this.partialPayments) ? this.partialPayments.map(p => ({
            id: p.id,
            method: p.paymentMode || p.method,
            amount: Number(p.amount) || 0,
            at: p.date?.toDate ? p.date.toDate().getTime() : (p.date?.getTime ? p.date.getTime() : (Date.parse(p.date) || Date.now()))
        })) : [];
        const payments = Array.isArray(this.data?.payments) ? this.data.payments.map(p => ({
            id: p.id,
            method: p.method || p.paymentMode,
            amount: Number(p.amount) || 0,
            at: p.at || (p.date?.toDate ? p.date.toDate().getTime() : (p.date?.getTime ? p.date.getTime() : Date.now()))
        })) : [];
        const map = new Map();
        [...pp, ...payments].forEach(p => { if (p && p.id && !map.has(p.id)) map.set(p.id, p); });
        return [...map.values()].sort((a, b) => a.at - b.at);
    }

    getTotalsForBill() {
    const sub = this.subTotal;
    const discountVal = parseFloat(this.discount) || 0;
    
    // Explicitly calculate taxes here to ensure correct "Discount BEFORE Tax" logic
    // This avoids any caching issues with ChargesCalculator
    
    const taxableAmount = Math.max(0, sub - discountVal);
    let finalAmount = taxableAmount;
    const calculatedCharges = [];
    
    // Calculate charges manually
    if (this.charges && Array.isArray(this.charges)) {
        this.charges.forEach(charge => {
            let chargeAmount = 0;
            let percentage = 0;
            
            if (charge.type === 'percentage' || (charge.value && charge.value.toString().includes('%'))) {
                // Extract percentage
                    if (charge.type === 'percentage') {
                    percentage = parseFloat(charge.value) || 0;
                } else {
                    const value = charge.value.toString().replace('%', '').trim();
                    percentage = parseFloat(value) || 0;
                }
                
                if (charge.inclusive) {
                    chargeAmount = parseFloat(((taxableAmount * percentage) / (100 + percentage)).toFixed(2));
                } else {
                    // Tax on TAXABLE amount
                    chargeAmount = parseFloat(((taxableAmount * percentage) / 100).toFixed(2));
                    finalAmount += chargeAmount;
                }
            } else {
                // Fixed amount
                chargeAmount = parseFloat(charge.value) || 0;
                if (!charge.inclusive) {
                    finalAmount += chargeAmount;
                }
            }
            
            if (chargeAmount !== 0) {
                calculatedCharges.push({
                    ...charge, // Copy original props
                    name: charge.name,
                    // If toJson exists (it's a Charge object), use it, otherwise use raw properties
                    ...(charge.toJson ? charge.toJson() : {}), 
                    calculatedAmount: chargeAmount,
                    displayName: charge.name
                });
            }
        });
    }
    
    // Fix JS floating point precision issues
    finalAmount = parseFloat(finalAmount.toFixed(2));

    const paid = this.settledAmount || this.getPayments().reduce((s, p) => s + (p.amount || 0), 0);
    const due = Math.max(0, finalAmount - paid);
    
    return {
        subTotal: sub,
        discount: discountVal,
        charges: calculatedCharges,
        finalAmount,
        paid,
        due
    };
}

    buildBillContext(receiptType = 'AUTO') {
        const totals = this.getTotalsForBill();
        const state = this.getSettlementState();
        const type = receiptType === 'AUTO' ? (state === 'SETTLED' ? 'FINAL' : 'PARTIAL') : receiptType;
        return {
            receiptType: type, // 'FINAL' | 'PARTIAL'
            orderId: this.id,
            billNo: this.billNo,
            items: this.items.map(i => ({
                title: i.title,
                qnt: i.qnt,
                price: i.price,
                subTotal: i.subTotal
            })),
            charges: totals.charges,
            discount: totals.discount,
            totals: {
                subTotal: totals.subTotal,
                grandTotal: totals.finalAmount,
                paid: totals.paid,
                due: totals.due
            },
            payments: this.getPayments(),
            isFinal: type === 'FINAL',
            isPartial: type === 'PARTIAL'
        };
    }

    // Add static fromDoc method
    static fromDoc(doc) {
        if (!doc || !doc.exists) {
            return null;
        }
        
        try {
            const data = doc.data();
            if (!data) {
                console.warn('Document exists but has no data');
                return null;
            }
            
            return new MOrder({
                id: doc.id,
                ...data,
                date: data.date && data.date.toDate ? data.date.toDate() : new Date(data.date || Date.now()),
                status: data.status || [],
                currentStatus: data.currentStatus || { label: 'PLACED', date: new Date() }
            });
        } catch (error) {
            console.error('Error creating MOrder from document:', error);
            return null;
        }
    }
}
