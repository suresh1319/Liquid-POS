import React, { useState, useEffect, useRef } from 'react';
import { showToast, formatProductTitle } from '../utils.js';
import { UserSession } from '../utils/UserSession.js';
import { sdk } from '../sdk.js';
import { deductInventoryForOrder } from '../utils/inventory.js';
import { ModalManager } from '../components/ModalManager.js';
import { PaymentMode } from '../models/PaymentMode.js';
import { OrderStatus } from '../models/OrderStatus.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';

export function CheckoutSheet({ order, onClose }) {
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [showContent, setShowContent] = useState(true);
    const [customer, setCustomer] = useState(null);
    // Split bill state
    const [isSplit, setIsSplit] = useState(false);
    const [splitCount, setSplitCount] = useState(2);
    const [splitPayments, setSplitPayments] = useState([]);

     const checkoutSelectedItems = (order?.items || []).filter(
    it => it.selected === true
  );

  const checkoutSubTotal = checkoutSelectedItems.reduce(
    (sum, it) =>
      sum + (Number(it.price || 0) * Number(it.qnt || it.quantity || 1)),
    0
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-stretch justify-end z-50" onClick={onClose}>
      <div className="bg-white h-full w-4/5 flex flex-col overflow-hidden shadow-lg rounded-t-xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 bg-red-50 flex items-center justify-between">
          <h2 className="text-xl font-bold text-red-600">Checkout</h2>
          <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-full text-red-600">Close</button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <h3 className="font-semibold mb-2">Customer</h3>
          {customer ? (
            <div className="mb-4">
              <div className="mb-2">{customer.name}</div>
              <div className="flex gap-2">
                <button className="px-3 py-1 bg-yellow-500 text-white rounded" onClick={() => openFreeItemChooser(order)}>Add free item</button>
                <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={() => setCustomer(null)}>Remove</button>
              </div>
            </div>
          ) : (
            <div className="mb-4">No customer selected</div>
          )}

          <h3 className="font-semibold mb-2">Order Items</h3>
          <div className="space-y-2">
            {(order.items || []).map((it, i) => (
              <div key={i} className="p-2 border rounded">{formatProductTitle(it)} - {UserSession.getCurrency()}{it.price}</div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-end">
            <button className="px-4 py-2 bg-red-600 text-white rounded" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );

  async function openFreeItemChooser(order) {
    try {
      if (!sdk || !sdk.db) { showToast('Database unavailable', 'error'); return; }

      // load persisted free items
      let persisted = [];
      try {
        const doc = await sdk.db.collection('LoyaltyRules').doc('rule_birthday').get();
        if (doc && doc.exists) {
          const d = doc.data ? doc.data() : (doc._data || {});
          persisted = Array.isArray(d.freeItems) ? d.freeItems.map(fi => ({ pid: fi.pid, title: fi.title || '' })) : [];
        }
      } catch (e) { persisted = []; }

      const resolvedPersisted = [];
      for (const p of persisted) {
        try {
          const pdoc = await sdk.db.collection('Product').doc(p.pid).get();
          if (pdoc && pdoc.exists) resolvedPersisted.push({ pid: p.pid, ...(pdoc.data ? pdoc.data() : {}), exists: true });
          else resolvedPersisted.push({ pid: p.pid, title: p.title || 'Untitled', exists: false, _persistedFallback: true });
        } catch (e) { resolvedPersisted.push({ pid: p.pid, title: p.title || 'Untitled', exists: false, _persistedFallback: true }); }
      }

      const otherProducts = menu.filter(m => !resolvedPersisted.find(r => r.pid === m.id)).slice(0, 40);

      const persistedHtml = resolvedPersisted.length ? `
        <div class="mb-2 text-sm font-medium">Previously saved</div>
        ${resolvedPersisted.map(r => `
          <div class="flex items-center justify-between p-2 border-b" data-pid="${r.pid}">
            <label class="flex items-center gap-3 min-w-0">
              <input type="radio" name="choose-free-item" data-pid="${r.pid}" data-title="${(r.title||'').replace(/</g,'&lt;')}" />
              <div class="truncate text-sm">${(r.title||'Untitled').replace(/</g,'&lt;')}${r._persistedFallback ? ' <span class="text-xs text-gray-400">(archived)</span>' : ''}</div>
            </label>
            <div class="text-xs text-gray-500">₹${Number(r.price||0).toFixed(2)}</div>
          </div>
        `).join('')}
      ` : '';

      const othersHtml = otherProducts.length ? `
        <div class="mt-3 mb-2 text-sm font-medium">Add more from menu</div>
        ${otherProducts.map(p => `
          <div class="flex items-center justify-between p-2 border-b" data-pid="${p.id}">
            <label class="flex items-center gap-3 min-w-0">
              <input type="radio" name="choose-free-item" data-pid="${p.id}" data-title="${(p.title||p.name||'').replace(/</g,'&lt;')}" />
              <div class="truncate text-sm">${(p.title||p.name||'Untitled').replace(/</g,'&lt;')}</div>
            </label>
            <div class="text-xs text-gray-500">₹${Number(p.price||p.basePrice||0).toFixed(2)}</div>
          </div>
        `).join('')}
      ` : '';

      const html = `
        <div class="space-y-3">
          <p class="text-sm text-gray-600">Select one free item to add to the order. It will be added with price ₹0.00.</p>
          <div style="max-height:320px; overflow:auto;" id="free-items-chooser">
            ${persistedHtml}
            ${othersHtml}
          </div>
        </div>
      `;

      const modal = ModalManager.createCenterModal({
        id: 'choose-birthday-free-' + Date.now(),
        title: 'Choose Free Item - Birthday',
        content: html,
        actions: `<div class="flex gap-2"><button id="free-add-save" class="py-2 px-3 bg-green-600 text-white rounded">Add to order</button><button id="free-add-cancel" class="py-2 px-3 bg-gray-200 rounded">Cancel</button></div>`,
        size: 'md',
        onShown: (mc) => {
          try {
            const container = mc && mc.container ? mc.container : document;
            const saveBtn = container.querySelector('#free-add-save');
            const cancelBtn = container.querySelector('#free-add-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', () => mc.close());
            if (saveBtn) {
              saveBtn.addEventListener('click', async () => {
                try {
                  const selected = container.querySelector('input[name="choose-free-item"]:checked');
                  if (!selected) { showToast('Select a free item', 'error'); return; }
                  const pid = selected.getAttribute('data-pid');
                  let title = selected.getAttribute('data-title') || '';
                  try {
                    const pdoc = await sdk.db.collection('Product').doc(pid).get();
                    if (pdoc && pdoc.exists) {
                      const pdata = pdoc.data ? pdoc.data() : (pdoc._data || {});
                      title = pdata.title || pdata.name || title || 'Free Item';
                    }
                  } catch (e) { }

                  const freeLine = { pid, title: title || 'Free Item', price: 0, basePrice: 0, qnt: 1, quantity: 1, freeItem: true, freeItemSource: 'birthday' };
                  order.data = order.data || {};
                  order.data.items = order.data.items || [];
                  order.data.items.push(freeLine);
                  try { await order.ref.update({ items: order.data.items }); } catch (e) { console.warn('Failed to persist free item', e); }

                  try {
                    const existing = order.data || {};
                    const used = Array.isArray(existing.birthdayFreeItemsUsed) ? existing.birthdayFreeItemsUsed : [];
                    const newUsed = used.concat({ pid, ts: new Date() });
                    order.data.birthdayFreeItemsUsed = newUsed;
                    try { await order.ref.update({ birthdayFreeItemsUsed: newUsed }); } catch (e) {}
                  } catch (e) {}

                  showToast('Free item added to order', 'success');
                  try { window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId: order.id, type: 'free-item', item: pid } })); } catch (e) {}
                  mc.close();
                } catch (err) { console.error(err); showToast('Failed to add free item', 'error'); }
              });
            }
          } catch (e) { console.warn('free items chooser onShown failed', e); }
        }
      });

    } catch (e) { console.warn('Open free items chooser failed', e); showToast('Failed to open free items selector', 'error'); }
  }

  // Show out-of-stock modal
  const showOutOfStockModal = async (productName) => {
    return new Promise((resolve) => {
      const modalContent = `
        <div class="text-center">
          <div class="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <i class="ph ph-warning-circle text-2xl text-red-600"></i>
          </div>
          <h3 class="text-lg font-medium text-gray-800 mb-2">Item Out of Stock</h3>
          <p class="text-gray-600 mb-6 px-4">
            <strong class="text-gray-800">${productName}</strong> is currently out of stock.
            <br><br>
            You can either continue by ordering it on-demand or skip this item.
          </p>
          <div class="space-y-3 px-1">
            <button
              id="continue-on-demand-btn"
              class="w-full py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm"
            >
              <i class="ph ph-cooking-pot mr-2 text-lg"></i>
              Continue On-Demand
            </button>
            <button
              id="skip-item-btn"
              class="w-full py-3 bg-orange-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-orange-600 transition-colors shadow-sm"
            >
              <i class="ph ph-x-circle mr-2 text-lg"></i>
              Skip This Item
            </button>
            <button
              id="cancel-checkout-btn"
              class="w-full py-3 bg-gray-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-gray-600 transition-colors shadow-sm"
            >
              <i class="ph ph-x mr-2 text-lg"></i>
              Cancel Checkout
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

      // Create modal using basic DOM methods if ModalManager isn't available
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
          ${modalContent}
        </div>
      `;

      document.body.appendChild(modal);

      // Add event listeners
      const continueBtn = modal.querySelector('#continue-on-demand-btn');
      const skipBtn = modal.querySelector('#skip-item-btn');
      const cancelBtn = modal.querySelector('#cancel-checkout-btn');

      const closeModal = () => {
        document.body.removeChild(modal);
      };

      continueBtn.addEventListener('click', () => {
        closeModal();
        resolve('continue');
      });

      skipBtn.addEventListener('click', () => {
        closeModal();
        resolve('skip');
      });

      cancelBtn.addEventListener('click', () => {
        closeModal();
        resolve('cancel');
      });
    });
  };

  // Handle checkout process
const handleCheckout = async (mode) => {
  console.log(" CHECKOUT HANDLER HIT");

// SYNC selected state from cart into order before any validation
if (order.items && cart) {
  const cartSelectedMap = new Map(
    Object.values(cart).map(ci => [ci.pid, ci.selected === true])
  );

  order.items = order.items.map(item => ({
    ...item,
    selected: cartSelectedMap.has(item.pid)
      ? cartSelectedMap.get(item.pid)
      : item.selected !== false // fallback: treat undefined as selected
  }));
}


  // BLOCK CHECKOUT IF NO ITEMS
const selectedItems = (order.items || []).filter(it => it.selected === true);

if (selectedItems.length === 0) {
  showToast(
    "Cannot checkout with 0 selected items. Please select at least one item.",
    "error"
  );
  return;
}


  try {
    const wasPreviouslyUnsettled =
      order?.payMode === PaymentMode.UNSETTLED &&
      order?.settled !== true;

    // continue normal checkout flow


      // Check for out-of-stock items before proceeding
      if (order.items && order.items.length > 0) {
        const outOfStockItems = [];

        // Fetch current product data to check stock levels
        for (const item of order.items) {
          try {
            const productDoc = await sdk.db.collection("Product").doc(item.pid).get(); // Fixed: Use 'Product' (singular)
            if (productDoc.exists) {
              const productData = productDoc.data();
              // Check if product is pre-prepared and out of stock
              if (productData.inventoryDeductionMode === 'pre-prepared' &&
                productData.stock !== undefined &&
                productData.stock <= 0) {
                outOfStockItems.push({
                  item,
                  productName: item.title || item.displayTitle || 'Unknown Product',
                  productData
                });
              }
            }
          } catch (error) {
            console.error(`Error checking stock for product ${item.pid}:`, error);
          }
        }

        // If there are out-of-stock items, show modal for each one
        if (outOfStockItems.length > 0) {
          console.log('Found out-of-stock items:', outOfStockItems);

          for (const { item, productName, productData } of outOfStockItems) {
            const userChoice = await showOutOfStockModal(productName);

            if (userChoice === 'continue') {
              // Update item to on-demand mode for this order
              console.log(`Converting ${productName} to on-demand for this order`);
              item.inventoryDeductionMode = 'on-demand';
              item.tempOnDemand = true; // Mark as temporarily converted
            } else if (userChoice === 'skip') {
              // Remove item from order
              console.log(`Removing ${productName} from order`);
              const itemIndex = order.items.indexOf(item);
              if (itemIndex > -1) {
                order.items.splice(itemIndex, 1);
                
              }
            } else {
              // User cancelled, abort checkout
              console.log('User cancelled checkout due to out-of-stock items');
              return;
            }
          }

        
        }
      }

      // Prepare changes
      const data = {
        payMode: mode,
        paid: mode !== PaymentMode.CREDIT && mode !== PaymentMode.UNSETTLED, // Mark as paid unless it's credit or unsettled
        settled: mode !== PaymentMode.CREDIT && mode !== PaymentMode.UNSETTLED, // Mark as settled unless it's credit or unsettled
      };

      if (customer) {
        data.custId = customer.id;
        data.custName = customer.name;
        data.custPhone = customer.phone;
      } else if (mode !== PaymentMode.CREDIT && mode !== PaymentMode.UNSETTLED) {
        // For non-credit/non-unsettled transactions without customer, use guest details
        data.custId = 'guest';
        data.custName = 'Walk-in Customer';
        data.custPhone = '';
      }

      if (mode === PaymentMode.CREDIT || mode === PaymentMode.UNSETTLED) {
        data.paid = false;
        data.settled = false;
        data.settledAmount = 0; // Initialize settled amount for unsettled bills
      } else {
        // For non-credit/non-unsettled orders, set settled amount to total
        data.settledAmount = order.total;
      }

      // Build status updates based on target mode
      const existingStatus = Array.isArray(order.data.status) ? [...order.data.status] : [];
      const now = new Date();
      const hasStatus = (label) => existingStatus.some(s => (s.label || '').toUpperCase() === label);

      if (mode === PaymentMode.UNSETTLED || mode === PaymentMode.CREDIT) {
        // Ensure PLACED and KITCHEN exist, DO NOT add COMPLETED for unsettled/credit creation
        if (!hasStatus('PLACED')) existingStatus.push({ label: OrderStatus.PLACED, date: now });
        if (!hasStatus('KITCHEN')) existingStatus.push({ label: OrderStatus.KITCHEN, date: now });
        data.status = existingStatus;
        data.currentStatus = existingStatus[existingStatus.length - 1];
      } else {
        // Paid modes: ensure COMPLETED appended once
        if (!hasStatus('PLACED')) existingStatus.push({ label: OrderStatus.PLACED, date: now });
        if (!hasStatus('KITCHEN')) existingStatus.push({ label: OrderStatus.KITCHEN, date: now });
        if (!hasStatus('COMPLETED')) existingStatus.push({ label: OrderStatus.COMPLETED, date: now });
        data.status = existingStatus;
        data.currentStatus = existingStatus.find(s => s.label === OrderStatus.COMPLETED) || existingStatus[existingStatus.length - 1];
      }

      // If we are settling a previously UNSETTLED bill now (mode changed to paid mode)
      if (wasPreviouslyUnsettled && (mode !== PaymentMode.UNSETTLED && mode !== PaymentMode.CREDIT)) {
        data.settled = true;
        data.paid = true;
        data.settledAmount = order.total; // ensure full amount captured
        // Keep a marker so we know this was settled transition
        data.unsettledSettledAt = now;
        console.log('[Checkout] Settling previously UNSETTLED order', { orderId: order.id, settledAmount: data.settledAmount });
      }

      // Set local changes first
      order.data = { ...order.data, ...data };

      // Update in Firestore
      await order.ref.update(data);

      // Dispatch events to notify other components
      if (wasPreviouslyUnsettled && (mode !== PaymentMode.UNSETTLED && mode !== PaymentMode.CREDIT)) {
        window.dispatchEvent(new CustomEvent('orderPartialPayment', {
          detail: {
            orderId: order.id,
            fullySettled: true,
            settledAmount: data.settledAmount,
            mode
          }
        }));
        console.log('[Checkout] Dispatched orderPartialPayment (final settlement) for order:', order.id);
      }

      // Deduct inventory for on-demand products after order completion
      try {
        console.log('[Checkout] Starting inventory deduction for order items...');
        // Convert order items to cart format for inventory function
        const cartForInventory = {};
        if (order.items && Array.isArray(order.items)) {
          // Fetch updated product data to ensure we have the latest recipe items
          const productPromises = order.items.map(item => {
            const productId = item.pid || item.productId;
            if (productId) {
              return sdk.db.collection("Product").doc(productId).get(); // Fixed: Use 'Product' (singular)
            }
            return Promise.resolve(null);
          });

          const productDocs = await Promise.all(productPromises);

          order.items.forEach((item, index) => {
            const productId = item.pid || item.productId;
            const productDoc = productDocs[index];
            let recipeItems = item.recipeItems || [];

            // Log what we're starting with
            console.log(`[Checkout] Processing item ${item.title || item.displayTitle || 'Unknown Product'} (index: ${index})`);
            console.log(`[Checkout] Initial recipeItems from item:`, item.recipeItems);

            // If we have the full product document, use its recipe data
            if (productDoc && productDoc.exists) {
              const productData = productDoc.data();
              console.log(`[Checkout] Product data from DB for ${productData.title}:`, productData);
              // Use recipeItems from product data if available, fallback to recipe
              recipeItems = productData.recipeItems || productData.recipe || item.recipeItems || [];
              console.log(`[Checkout] RecipeItems from DB:`, recipeItems);
            } else {
              console.log(`[Checkout] No product doc found, using item.recipeItems:`, recipeItems);
            }

            const cartKey = `${productId || 'unknown'}_${item.variantId || 'base'}_${index}`;
            cartForInventory[cartKey] = {
              product: {
                id: productId,
                title: item.title || item.displayTitle || 'Unknown Product',
                inventoryDeductionMode: item.inventoryDeductionMode || 'on-demand', // Default to on-demand for checkout deduction
                recipeItems: recipeItems
              },
              quantity: item.qnt || item.quantity || 1
            };

            console.log(`[Checkout] Cart item ${cartKey}:`, cartForInventory[cartKey]);
          });
        }

        console.log('[Checkout] Final cartForInventory:', cartForInventory);
        await deductInventoryForOrder(cartForInventory);
        console.log('[Checkout] Inventory deduction completed successfully');
      } catch (inventoryError) {
        console.error('[Checkout] Error deducting inventory:', inventoryError);
        // Don't block the order completion for inventory errors, but log and notify
        const errorMessage = inventoryError.message || 'Unknown inventory error';
        showToast(`Order completed but inventory deduction failed: ${errorMessage}`, 'warning');
      }

      // Always dispatch orderCompleted for paid modes OR for settlement transition
      if (mode !== PaymentMode.CREDIT && mode !== PaymentMode.UNSETTLED) {
        window.dispatchEvent(new CustomEvent('orderCompleted', {
          detail: {
            orderId: order.id,
            mode: mode,
            paid: true,
            status: OrderStatus.COMPLETED,
            settled: true,
            settledFromUnsettled: wasPreviouslyUnsettled
          }
        }));
        console.log('[Checkout] Dispatched orderCompleted event for order:', order.id, { settledFromUnsettled: wasPreviouslyUnsettled });
      }

      // Print bill (you'll need to implement this)
      // printBill(order);

      // Track analytics
      console.log("Order_Checkout", {
        mode: mode,
        tableId: order.tableId,
        variant: order.priceVariant,
        total: order.total
      });2401

      if (wasPreviouslyUnsettled && (mode !== PaymentMode.UNSETTLED && mode !== PaymentMode.CREDIT)) {
        showToast("Unsettled bill settled successfully", "success");
      } else if (mode === PaymentMode.UNSETTLED) {
        showToast("Unsettled bill created", "success");
      } else {
        showToast("Order completed successfully", "success");
      }
      onClose();
    } catch (error) {
      console.error("Checkout error:", error);
      showToast("Failed to complete order", "error");
    }
  };

    // Customer section
  const CustomerSection = () => (
    <div className="mb-5">
      {customer ? (
        <div className="mx-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{customer.name}</h3>
              <p className="text-sm text-gray-600">{customer.phone}</p>
            </div>
            <button
              onClick={() => setCustomer(null)}
              className="p-2 hover:bg-blue-100 rounded-full"
            >
              <i className="ph ph-x"></i>
            </button>
          </div>
        </div>
      ) : (
        <AddCustomer
          onSelectCustomer={setCustomer}
          onContentVisibilityChange={setShowContent}
        />
      )}
    </div>
  );



  // Payment buttons section
// Payment buttons section
const PaymentButtons = () => (
  <div className="grid grid-cols-2 gap-3 mb-3">

    {/* CASH */}
    <button
      className="bg-red-500 text-white py-3 px-4 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors"
      onClick={() => handleCheckout(PaymentMode.CASH)}
    >
      <i className="ph ph-money text-xl mb-1"></i>
      <span className="text-sm">Cash</span>
    </button>

    {/* UPI / CARD */}
    <button
      className="bg-red-500 text-white py-3 px-4 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors"
      onClick={() => handleCheckout(PaymentMode.DIGITAL)}
    >
      <i className="ph ph-credit-card text-xl mb-1"></i>
      <span className="text-sm">UPI/Card</span>
    </button>

    {/* CREDIT (customer required) */}
    <button
      className={`py-3 px-4 rounded-lg font-medium flex flex-col items-center justify-center transition-colors ${
        customer
          ? 'bg-orange-500 text-white hover:bg-orange-600'
          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
      }`}
      disabled={!customer}
      title={!customer ? "Select a customer first" : ""}
      onClick={() => {
        if (!customer) return;
        handleCheckout(PaymentMode.CREDIT);
      }}
    >
      <i className="ph ph-notebook text-xl mb-1"></i>
      <span className="text-sm">Credit</span>
    </button>

    {/* UNSETTLED */}
    <button
      className="bg-yellow-500 text-white py-3 px-4 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-yellow-600 transition-colors"
      onClick={() => handleCheckout(PaymentMode.UNSETTLED)}
    >
      <i className="ph ph-clock-clockwise text-xl mb-1"></i>
      <span className="text-sm">Unsettled</span>
    </button>

  </div>
);



    // Helper to record a payment for a split index
    const handleSelectSplitPayment = (index, mode) => {
        const amount = Number((order.total / Math.max(1, splitCount)).toFixed(2));
        const next = [...splitPayments];
        next[index] = { mode, amount, paid: mode !== PaymentMode.CREDIT };
        setSplitPayments(next);
        showToast(`Selected ${mode} for split ${index + 1}`);
    };

    const handlePrintSplitBills = () => {
        // Placeholder: print each split bill separately. Replace with actual print logic.
        for (let i = 0; i < splitCount; i++) {
            const info = splitPayments[i] || { mode: 'Not selected', amount: Number((order.total / Math.max(1, splitCount)).toFixed(2)) };
            console.log(`Printing split ${i + 1}:`, info);
            showToast(`Printing bill for split ${i + 1} (${info.mode})`);
        }
    };

    return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-stretch justify-end z-50" onClick={onClose}>
      <div
        className="bg-white h-full w-4/5 sm:w-4/5 md:w-1/2 lg:w-1/2 xl:w-2/5 flex flex-col overflow-hidden shadow-lg animate-slideInRight rounded-t-xl max-h-[90vh] relative"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: "#fffcfc" }}
      >
        {/* Fixed Header */}
        <div className="p-4 border-b border-gray-200 bg-red-50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-red-600 flex items-center">
              <i className="ph ph-shopping-cart mr-2"></i>
              Checkout
              {order.payMode === 'UNSETTLED' && !order.settled && (
                <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full inline-flex items-center border ${
                  order.settledAmount > 0
                    ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                    : 'bg-orange-50 text-orange-600 border-orange-200'
                }`}>
                  <i className={`text-xs mr-1 ${
                    order.settledAmount > 0
                      ? 'ph ph-clock-clockwise'
                      : 'ph ph-clock-countdown'
                  }`}></i>
                  {order.settledAmount > 0 ? 'Partially Settled' : 'Unsettled Bill'}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-2 hover:bg-red-100 rounded-full text-red-600"
              >
                <i className="ph ph-x"></i>
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center">
              <i className="ph ph-shopping-bag text-red-500 mr-1"></i>
              {order.items?.length || 0} items
            </div>
            <div className="flex items-center">
              <i className="ph ph-calendar text-red-500 mr-1"></i>
              {new Date().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto relative" style={{ scrollbarWidth: 'thin' }}>
                {/* Order Items - More Visible */}
                <div className="p-4">
                    <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                        <i className="ph ph-list text-red-500 mr-2"></i>
                        Order Items
                    </h3>
                    <div className="space-y-3">
                        {order.items.map((item, index) => (
                            <div key={index} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-3">
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                        {item.thumb ? (
                                            <img
                                                src={item.thumb}
                                                alt={item.title}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = 'https://via.placeholder.com/64x64/e5e7eb/9ca3af?text=No+Image';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <i className="ph ph-image text-gray-400 text-2xl"></i>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-gray-900 text-lg leading-tight mb-1">
                                            {formatProductTitle(item)}
                                        </h4>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center text-sm text-gray-600">
                                                <i className="ph ph-package mr-1"></i>
                                                <span>Qty: {item.qnt}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-semibold text-red-600">
                                                    {UserSession?.getCurrency()}{item.price}
                                                </div>
                                                {item?.unitPricing?.enabled && item?.unitPricing?.displayUnit && Number(item?.unitPricing?.pricePerUnit) > 0 && (
                                                    <div className="text-[10px] text-blue-600">@ {UserSession?.getCurrency()}{Number(item.unitPricing.pricePerUnit).toFixed(2)} / {item.unitPricing.displayUnit}</div>
                                                )}
                                                {item.qnt > 1 && (
                                                    <div className="text-xs text-gray-500">
                                                        {UserSession?.getCurrency()}{(item.price / item.qnt).toFixed(2)} each
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

{/* Order Summary - Now in scrollable area */}
<div className="px-4 pb-4">
  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
    <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
      <i className="ph ph-calculator text-red-500 mr-2"></i>
      Order Summary
    </h3>

    <div className="space-y-2">
      {/* Sub Total */}
      <div className="flex justify-between items-center py-1">
        <span className="text-gray-600">Sub Total</span>
        <span className="font-medium">
          {UserSession?.getCurrency()}
          {checkoutSubTotal.toFixed(2)}
        </span>
      </div>

      {/* Discount */}
      {order.discount > 0 && (
        <div className="flex justify-between items-center py-1 text-green-600">
          <span>Discount</span>
          <span className="font-medium">
            - {UserSession?.getCurrency()}
            {Number(order.discount).toFixed(2)}
          </span>
        </div>
      )}

      {/* ✅ GRAND TOTAL — PASSBOOK SOURCE */}
      {typeof order.getTotalsForBill === 'function' && (() => {
        const totals = order.getTotalsForBill();

        return (
          <div className="border-t border-gray-300 pt-2 mt-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-lg text-gray-800">
                Grand Total
              </span>
              <span className="font-bold text-xl text-red-600">
                {UserSession?.getCurrency()}
                {totals.finalAmount.toFixed(2)}
              </span>
            </div>

            {/* Unsettled info */}
            {order.payMode === 'UNSETTLED' && !order.settled && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                {totals.paid > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-green-600">Amount Paid</span>
                    <span>
                      {UserSession?.getCurrency()}
                      {totals.paid.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-orange-600 font-medium">
                    Amount Due
                  </span>
                  <span className="font-bold text-orange-600">
                    {UserSession?.getCurrency()}
                    {totals.due.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>

    {/* Discount Button */}
    <div className="mt-4 pt-3 border-t border-gray-200">
      <DiscountButton
        initialDiscount={order.discount}
        maxDiscount={checkoutSubTotal}
        onDiscountChange={(discount) => {
          if (discount > checkoutSubTotal) {
            showToast("Discount cannot be greater than subtotal");
            order.setDiscount(0);
          } else {
            order.setDiscount(discount);
          }
        }}
      />
    </div>
  </div>

  {/* Print Status */}
  <div className="mt-3 text-center text-xs text-gray-500 flex items-center justify-center">
    <i className="ph ph-info mr-1"></i>
    <span>Printing is optional</span>
  </div>
</div>

            </div>

            {/* Fixed Footer - Customer and Payment */}
            <div className="border-t border-gray-200 bg-gray-50 p-4">
                <CustomerSection />
                <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-700 flex items-center">
                            <i className="ph ph-credit-card mr-2"></i>
                            Select Payment Method
                        </h3>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={isSplit} onChange={(e) => {
                                    setIsSplit(e.target.checked);
                                    if (!e.target.checked) setSplitPayments([]);
                                }} />
                                <span>Split Bill</span>
                            </label>
                            {isSplit && (
                                <div className="flex items-center gap-2">
                                    <label className="text-sm">Splits</label>
                                    <input type="number" min="2" max="20" value={splitCount} onChange={(e) => setSplitCount(Math.max(2, Number(e.target.value) || 2))} className="w-16 px-2 py-1 border rounded" />
                                </div>
                            )}
                        </div>
                    </div>

                    {!isSplit && (
                        <>
                            <PaymentButtons />
                        </>
                    )}

                    {isSplit && (
                        <div className="space-y-3">
                            {Array.from({ length: splitCount }).map((_, idx) => (
                                <div key={idx} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-medium">Select payment method for split {idx + 1}</div>
                                        <div className="text-sm text-gray-600">{UserSession?.getCurrency()}{(order.total / splitCount).toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div className="grid grid-cols-4 gap-2">
                                            <button
                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${splitPayments[idx]?.mode === PaymentMode.CASH ? 'ring-2 ring-red-300' : ''}`}
                                                onClick={() => handleSelectSplitPayment(idx, PaymentMode.CASH)}
                                            >
                                                <i className="ph ph-money text-lg mb-0.5"></i>
                                                <span className="text-xs">Cash</span>
                                            </button>

                                            <button
                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${splitPayments[idx]?.mode === PaymentMode.DIGITAL ? 'ring-2 ring-red-300' : ''}`}
                                                onClick={() => handleSelectSplitPayment(idx, PaymentMode.DIGITAL)}
                                            >
                                                <i className="ph ph-credit-card text-lg mb-0.5"></i>
                                                <span className="text-xs">UPI/Card</span>
                                            </button>

                                            <button
                                                disabled={!customer}
                                                title={!customer ? "Select a customer first" : ""}
                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${!customer ? 'opacity-75 cursor-not-allowed' : ''} ${splitPayments[idx]?.mode === PaymentMode.CREDIT ? 'ring-2 ring-red-300' : ''}`}
                                                onClick={() => customer && handleSelectSplitPayment(idx, PaymentMode.CREDIT)}
                                            >
                                                <i className="ph ph-notebook text-lg mb-0.5"></i>
                                                <span className="text-xs">Credit</span>
                                            </button>

                                            <button
                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${splitPayments[idx]?.mode === PaymentMode.UNSETTLED ? 'ring-2 ring-red-300' : ''}`}
                                                onClick={() => handleSelectSplitPayment(idx, PaymentMode.UNSETTLED)}
                                            >
                                                <i className="ph ph-clock-clockwise text-lg mb-0.5"></i>
                                                <span className="text-xs">Unsettled</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="flex items-center justify-end gap-3 mt-2">
                                <button className="px-4 py-2 bg-gray-100 rounded" onClick={() => { setIsSplit(false); setSplitPayments([]); }}>Cancel Split</button>
                                <button className="px-4 py-2 bg-red-500 text-white rounded" onClick={handlePrintSplitBills}>Print Split Bills</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
}

// Discount Button Component
export function DiscountButton({ initialDiscount = 0, maxDiscount, onDiscountChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [discount, setDiscount] = useState(initialDiscount);
    const inputRef = useRef(null);

    const handleDiscountChange = (value) => {
        const newDiscount = Math.min(Number(value) || 0, maxDiscount);
        setDiscount(newDiscount);
        onDiscountChange(newDiscount);
    };

    return (
    <div className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      >
        <i className="ph ph-percent"></i>
        <span>Discount</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-lg border p-3 z-10">
          <input
            ref={inputRef}
            type="number"
            value={discount}
            onChange={(e) => handleDiscountChange(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Enter discount"
          />
        </div>
      )}
    </div>
  );
}

// Duplicate CheckoutSheet removed.