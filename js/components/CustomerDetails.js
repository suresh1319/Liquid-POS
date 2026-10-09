console.log('CustomerDetails.js loaded');
import { UserSession } from '../utils/UserSession.js';
import { sdk } from '../sdk.js';
import { ModalManager } from './ModalManager.js';
import { formatProductTitle, formatDate } from '../utils.js';
import { propagateCustomerUpdate } from '../utils/CustomerSync.js';
import { computeAvailablePoints } from '../utils/LoyaltyEngine.js';
import { ChargesCalculator } from '../utils/ChargesCalculator.js';

// CustomerDetails Component
export function CustomerDetails() {
    // Instance properties
    this.customerListener = null;
    this.walletListener = null;
    this.ordersListener = null;

    this.showCustomerDetailsModal = function (customerData, existingModal = null) {
        console.log('[CustomerDetails] showCustomerDetailsModal called for:', customerData);
        const self = this;
        // Use the existing modal if provided, otherwise create a new one
        let modal;

        // Cancel any previous listeners
        if (this.customerListener) {
            try { this.customerListener(); } catch (e) { console.warn('Error unsubscribing customerListener', e); }
            this.customerListener = null;
        }

        if (this.walletListener) {
            try { this.walletListener(); } catch (e) { console.warn('Error unsubscribing walletListener', e); }
            this.walletListener = null;
        }

        if (this.ordersListener) {
            try { this.ordersListener(); } catch (e) { console.warn('Error unsubscribing ordersListener', e); }
            this.ordersListener = null;
        }

        // Set up real-time listener for this customer
        this.customerListener = sdk.db.collection("Customers").doc(customerData.id)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    // Update the customer data
                    const updatedData = {
                        id: doc.id,
                        ...doc.data()
                    };

                    // Update the UI with new customer data
                    console.log('[CustomerDetails] Firestore listener triggered, calling updateCustomerUI with:', updatedData);
                    this.updateCustomerUI(updatedData, modal);

                    // Update our reference to the customer data
                    customerData = updatedData;
                }
            }, (error) => {
                console.error("Error listening to customer updates:", error);
            });

        // Set up real-time listener for wallet transactions
        this.walletListener = sdk.db.collection("Wallet")
            .where("customerId", "==", customerData.id)
            .onSnapshot(() => {
                // When wallet changes, refresh transactions if transactions tab is active
                const transactionsTab = document.getElementById('tab-transactions');
                if (transactionsTab && transactionsTab.classList.contains('text-red-500')) {
                    this.loadTransactions(customerData);
                }
            }, error => {
                console.error("Error listening to wallet updates:", error);
            });

        // Set up real-time listener for Orders of this customer so UI/metrics update immediately
        try {
            this.ordersListener = sdk.db.collection("Orders")
                .where("custId", "==", customerData.id)
                .onSnapshot((snapshot) => {
                    console.log('[CustomerDetails] Orders snapshot for customer', customerData.id, 'docs:', snapshot.size);
                    // Refresh orders view (this will re-query and re-render order list)
                    this.loadOrders(customerData);
                }, (error) => {
                    console.error('[CustomerDetails] Error listening to orders for customer:', error);
                });
            // Also listen for global orderCompleted events in case orders are marked completed elsewhere
            try {
                if (this.orderCompletedListener) {
                    try { window.removeEventListener('orderCompleted', this.orderCompletedListener); } catch (e) {}
                    this.orderCompletedListener = null;
                }
                this.orderCompletedListener = (e) => {
                    try {
                        const detail = e && e.detail ? e.detail : null;
                        // If the event includes a customerId and it matches this customer, refresh; otherwise refresh anyway
                        const eventCustId = detail && (detail.customerId || detail.custId || detail.cust) ? (detail.customerId || detail.custId || detail.cust) : null;
                        if (!eventCustId || eventCustId === customerData.id) {
                            console.log('[CustomerDetails] orderCompleted event received for customer, refreshing orders', eventCustId);
                            this.loadOrders(customerData);
                        } else if (detail && detail.orderId) {
                            // If orderId present but no customerId, still refresh to be safe
                            console.log('[CustomerDetails] orderCompleted event received (orderId), refreshing orders for customer', customerData.id);
                            this.loadOrders(customerData);
                        }
                    } catch (err) {
                        console.warn('[CustomerDetails] orderCompleted handler error', err);
                    }
                };
                window.addEventListener('orderCompleted', this.orderCompletedListener);
            } catch (e) {
                console.warn('[CustomerDetails] Failed to attach orderCompleted listener', e);
            }
        } catch (e) {
            console.warn('[CustomerDetails] Failed to attach orders listener', e);
            this.ordersListener = null;
        }

    // Split name if possible (and compute a display name for a single input)
    console.log('[CustomerDetails] updateCustomerUI called for:', customerData);
        let firstName = customerData.firstName || '';
        let lastName = customerData.lastName || '';
        if (!firstName && customerData.name) {
            const nameParts = customerData.name.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ');
        }
        const displayName = (customerData.name && String(customerData.name).trim()) || ((firstName + (lastName ? ' ' + lastName : '')).trim());
        const modalContent = `
            <!-- Editable Customer Info -->
            <div class="p-4 border-b">
                <form id="edit-customer-form">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="col-span-1 md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700">Name</label>
                            <input type="text" id="edit-name" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value="${displayName || ''}" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Contact Number</label>
                            <input type="text" id="edit-phone" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value="${customerData.phone || ''}" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" id="edit-email" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value="${customerData.email || ''}" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Birthday</label>
                            <input type="date" id="edit-birthday" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value="${customerData.birthday || ''}" />
                        </div>
                        <div class="col-span-2">
                            <label class="block text-sm font-medium text-gray-700">Join Date</label>
                            <div class="mt-1 text-gray-900 font-semibold">
                                ${(() => {
                                    let joinDate = customerData.date;
                                    if (joinDate && typeof joinDate.toDate === 'function') {
                                        joinDate = joinDate.toDate();
                                    } else if (typeof joinDate === 'string' || typeof joinDate === 'number') {
                                        joinDate = new Date(joinDate);
                                    }
                                    if (joinDate instanceof Date && !isNaN(joinDate.getTime())) {
                                        return joinDate.toLocaleDateString('en-GB') + ' ' + joinDate.toLocaleTimeString('en-GB');
                                    } else {
                                        return 'N/A';
                                    }
                                })()}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Inline save removed; use header Save button to submit the form -->
                </form>
                <!-- Balance Card -->
                <div class="mt-4 p-4 bg-red-50 rounded-lg">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-sm text-gray-600">Current Balance</p>
                            <p class="text-xl font-bold ${Number(customerData.balance || 0) < 0 ? 'text-red-600' : 'text-green-600'}">
                                ${UserSession?.getCurrency()}${Number(customerData.balance || 0) < 0
                ? `-${Math.abs(Number(customerData.balance || 0)).toLocaleString()}`
                : (Number(customerData.balance || 0)).toLocaleString()}
                            </p>
                        </div>
                        <div class="flex space-x-2">
                            ${Number(customerData.balance || 0) < 0 ? `
                                <button id="send-reminder" class="px-3 py-2 bg-red-500 text-white text-sm rounded-lg flex items-center hover:bg-red-600">
                                    <i class="ph ph-paper-plane-tilt mr-1.5"></i>
                                    Send Reminder
                                </button>
                            ` : ''}
                            <button id="deposit-balance" class="px-3 py-2 bg-red-500 text-white text-sm rounded-lg flex items-center hover:bg-red-600">
                                <i class="ph ph-plus-circle mr-1.5"></i>
                                Deposit Balance
                            </button>
                        </div>
                    </div>
                </div>
                <!-- Loyalty Points Card -->
                <div id="customer-loyalty-points" class="mt-4 p-4 bg-yellow-50 rounded-lg">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-sm text-gray-600">Loyalty Points</p>
                            <p id="customer-loyalty-available" class="text-xl font-bold text-yellow-700">-</p>
                        </div>
                        <div class="flex space-x-2">
                            <button id="adjust-points" class="px-3 py-2 bg-yellow-600 text-white text-sm rounded-lg flex items-center hover:bg-yellow-700" style="display:none;">
                                Adjust
                            </button>
                        </div>
                    </div>
                    <div class="mt-3 text-sm text-gray-600" id="customer-loyalty-breakdown"></div>
                </div>
            </div>
            <!-- Tabs -->
            <div class="bg-white border-b">
                <div class="flex">
                    <button id="tab-orders" class="flex-1 py-3 px-4 text-center text-red-500 border-b-2 border-red-500 font-medium">
                        Orders
                    </button>
                    <button id="tab-transactions" class="flex-1 py-3 px-4 text-center text-gray-600">
                        Transactions
                    </button>
                    <!-- Orphan Orders tab removed -->
                </div>
            </div>
            <!-- Tab Content -->
            <div id="tab-content" class="flex-1 overflow-auto p-4">
                <div class="text-center py-8">
                    <div class="animate-spin inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
                    <p class="mt-2 text-gray-600">Loading orders...</p>
                </div>
            </div>
        `;
        // Save handler for editable fields
        const saveHandler = (e) => {
            console.log('[CustomerDetails] saveHandler called');
            try { if (e && typeof e.preventDefault === 'function') e.preventDefault(); } catch (ex) {}
            const phoneInput = (document.getElementById('edit-phone') && document.getElementById('edit-phone').value) ? document.getElementById('edit-phone').value.trim() : '';
            const emailInput = (document.getElementById('edit-email') && document.getElementById('edit-email').value) ? document.getElementById('edit-email').value.trim() : '';
            // Validate phone: only numbers, exactly 10 digits
            // Allow empty phone (if intentionally removed), otherwise enforce 10 digits
            if (phoneInput && !/^[0-9]{10}$/.test(phoneInput)) {
                ModalManager.showToast('Please enter a valid 10-digit phone number (numbers only).', { type: 'error' });
                document.getElementById('edit-phone').focus();
                return;
            }
            // Validate email format (simple regex)
            if (emailInput) {
                if (!/^\S+@\S+\.\S+$/.test(emailInput)) {
                    ModalManager.showToast('Please enter a valid email address.', { type: 'error' });
                    document.getElementById('edit-email').focus();
                    return;
                }
                // Restrict to popular domains
                const allowedDomains = [
                    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
                    'ymail.com', 'protonmail.com', 'zoho.com', 'aol.com', 'live.com', 'msn.com', 'mail.com'
                ];
                const emailParts = emailInput.split('@');
                if (emailParts.length === 2) {
                    const emailDomain = emailParts[1].toLowerCase();
                    if (!allowedDomains.includes(emailDomain)) {
                        ModalManager.showToast('Please use a popular email provider (gmail, yahoo, outlook, etc).', { type: 'error' });
                        document.getElementById('edit-email').focus();
                        return;
                    }
                }
            }
            // Read single Name input (fallback to first/last if still present)
            const nameEl = document.getElementById('edit-name');
            let fullName = '';
            if (nameEl) {
                fullName = String(nameEl.value || '').trim();
            } else {
                const first = (document.getElementById('edit-first-name') && document.getElementById('edit-first-name').value) ? document.getElementById('edit-first-name').value.trim() : '';
                const last = (document.getElementById('edit-last-name') && document.getElementById('edit-last-name').value) ? document.getElementById('edit-last-name').value.trim() : '';
                fullName = (first + (last ? ' ' + last : '')).trim();
            }
            const preferredEl = document.getElementById('edit-preferred-items');
            const preferredItems = preferredEl ? String(preferredEl.value).split(',').map(s => s.trim()).filter(Boolean) : [];
            const updated = {
                name: fullName,
                phone: phoneInput,
                email: emailInput,
                preferredItems: preferredItems,
                birthday: (document.getElementById('edit-birthday') && document.getElementById('edit-birthday').value) ? document.getElementById('edit-birthday').value : ''
            };

            // Diagnostics: ensure sdk/db available and log payload
            console.log('[CustomerDetails] Prepared updated payload for customer', customerData && customerData.id, updated);
            if (!sdk || !sdk.db || typeof sdk.db.collection !== 'function') {
                console.error('[CustomerDetails] SDK or firestore not available', { sdk });
                ModalManager.showToast('Unable to save customer: SDK not initialized', { type: 'error' });
                return;
            }

            // Save to Firestore
            sdk.db.collection('Customers').doc(customerData.id).update(updated).then(() => {
                console.log('[CustomerDetails] Firestore update succeeded for', customerData.id);
                ModalManager.showToast('Customer updated successfully');

                // Update local customerData and refresh UI in-place
                try {
                    customerData = Object.assign({}, customerData, updated);

                    // Update modal title and live form inputs if modal exists
                    if (modal) {
                        try {
                            if (typeof modal.setTitle === 'function') {
                                modal.setTitle(customerData.name || 'Customer Details');
                            }
                            const container = modal.container;
                            if (container) {
                                const nameInput = container.querySelector('#edit-name');
                                if (nameInput) nameInput.value = customerData.name || '';
                                const phoneInputEl = container.querySelector('#edit-phone');
                                if (phoneInputEl) phoneInputEl.value = customerData.phone || '';
                                const emailInputEl = container.querySelector('#edit-email');
                                if (emailInputEl) emailInputEl.value = customerData.email || '';
                                const birthdayEl = container.querySelector('#edit-birthday');
                                if (birthdayEl) birthdayEl.value = customerData.birthday || '';
                            }
                        } catch (e) {
                            console.warn('[CustomerDetails] Error updating modal inputs after save', e);
                        }

                        // Call updateCustomerUI to refresh balance, buttons and orders view
                        try {
                            this.updateCustomerUI(customerData, modal);
                        } catch (e) {
                            console.warn('[CustomerDetails] updateCustomerUI failed after save', e);
                        }
                    }

                    // If there's a global fetchCustomers function used elsewhere, call it to refresh the list
                    try {
                        if (typeof fetchCustomers === 'function') {
                            fetchCustomers();
                        }
                    } catch (e) {
                        // Non-fatal
                    }
                    // Propagate embedded customer fields to orders and other places
                    try { propagateCustomerUpdate(customerData.id, { name: updated.name, phone: updated.phone, email: updated.email }); } catch (e) { console.warn('Propagation after update failed', e); }
                } catch (e) {
                    console.warn('[CustomerDetails] Could not update local customerData after save', e);
                }

            }).catch(err => {
                console.error('[CustomerDetails] Firestore update failed for', customerData && customerData.id, err);
                const errMsg = err && err.message ? err.message : String(err);
                // If the error indicates the document wasn't found, try set(..., { merge: true }) as a fallback
                if (/no document to update|not-found|does not exist|not found/i.test(errMsg)) {
                    console.warn('[CustomerDetails] Update failed because document not found; attempting set with merge as fallback');
                    sdk.db.collection('Customers').doc(customerData.id).set(updated, { merge: true }).then(() => {
                        console.log('[CustomerDetails] Firestore set(merge) succeeded for', customerData.id);
                        ModalManager.showToast('Customer updated successfully');
                        try {
                            customerData = Object.assign({}, customerData, updated);
                            if (modal) {
                                try {
                                    if (typeof modal.setTitle === 'function') {
                                        modal.setTitle(customerData.name || 'Customer Details');
                                    }
                                    const container = modal.container;
                                    if (container) {
                                        const nameInput = container.querySelector('#edit-name');
                                        if (nameInput) nameInput.value = customerData.name || '';
                                        const phoneInputEl = container.querySelector('#edit-phone');
                                        if (phoneInputEl) phoneInputEl.value = customerData.phone || '';
                                        const emailInputEl = container.querySelector('#edit-email');
                                        if (emailInputEl) emailInputEl.value = customerData.email || '';
                                        const birthdayEl = container.querySelector('#edit-birthday');
                                        if (birthdayEl) birthdayEl.value = customerData.birthday || '';
                                    }
                                } catch (e) {
                                    console.warn('[CustomerDetails] Error updating modal inputs after set(merge)', e);
                                }
                                try {
                                    this.updateCustomerUI(customerData, modal);
                                } catch (e) {
                                    console.warn('[CustomerDetails] updateCustomerUI failed after set(merge)', e);
                                }
                            }
                            try {
                                if (typeof fetchCustomers === 'function') fetchCustomers();
                            } catch (e) {}
                            try { propagateCustomerUpdate(customerData.id, { name: updated.name, phone: updated.phone, email: updated.email }); } catch (e) { console.warn('Propagation after set(merge) failed', e); }
                        } catch (e) {
                            console.warn('[CustomerDetails] Could not update local customerData after set(merge)', e);
                        }
                    }).catch(e2 => {
                        console.error('[CustomerDetails] Firestore set(merge) also failed for', customerData && customerData.id, e2);
                        ModalManager.showToast('Failed to update customer: ' + (e2 && e2.message ? e2.message : String(e2)), { type: 'error' });
                    });
                    return;
                }
                ModalManager.showToast('Failed to update customer: ' + errMsg, { type: 'error' });
            });
        };

        if (existingModal) {
            // Use existing modal, just update content and title
            modal = existingModal;
            modal.setContent(modalContent);
            modal.setTitle(customerData.name || 'Customer Details');
        } else {
            // Create a new modal with half-page width
            modal = ModalManager.createSideDrawerModal({
                id: 'customer-details-modal',
                title: customerData.name || 'Customer Details',
                content: modalContent,
                // Force 50vw width on desktop, w-full on mobile
                customClass: 'custom-half-width',
                closeOnBackdropClick: true,
                onClose: () => {
                    // Clean up listener when modal is closed
                    if (this.customerListener) {
                        this.customerListener();
                        this.customerListener = null;
                    }

                    if (this.walletListener) {
                        this.walletListener();
                        this.walletListener = null;
                    }
                    if (this.ordersListener) {
                        try { this.ordersListener(); } catch (e) { console.warn('Error unsubscribing ordersListener onClose', e); }
                        this.ordersListener = null;
                    }
                    if (this.customerUpdatedListener) {
                        try { window.removeEventListener('customerUpdated', this.customerUpdatedListener); } catch (e) {}
                        this.customerUpdatedListener = null;
                    }
                    if (this.orderCompletedListener) {
                        try { window.removeEventListener('orderCompleted', this.orderCompletedListener); } catch (e) {}
                        this.orderCompletedListener = null;
                    }
                    // Also remove listeners we add for loyalty/order updates to avoid leaks
                    if (this.loyaltyRedeemListener) {
                        try { window.removeEventListener('loyaltyRedeemConfirmed', this.loyaltyRedeemListener); } catch (e) {}
                        this.loyaltyRedeemListener = null;
                    }
                    if (this.orderUpdatedListener) {
                        try { window.removeEventListener('orderUpdated', this.orderUpdatedListener); } catch (e) {}
                        this.orderUpdatedListener = null;
                    }
                }
            });
        }

        // Listen for events that indicate customer's loyalty or order state changed so we can refresh the UI
        try {
            this.customerUpdatedListener = async (ev) => {
                try {
                    const d = ev && ev.detail ? ev.detail : {};
                    // If the event includes a different customerId, ignore
                    if (d.customerId && d.customerId !== customerData.id) return;
                    // Refresh customer doc and UI
                    if (sdk && sdk.db) {
                        try {
                            const snap = await sdk.db.collection('Customers').doc(customerData.id).get();
                            if (snap && snap.exists) {
                                const updated = { id: snap.id, ...(snap.data ? snap.data() : snap._data || {}) };
                                customerData = updated;
                                try { this.updateCustomerUI(updated, this.modalControl); } catch (e) { console.warn('[CustomerDetails] updateCustomerUI after customerUpdated failed', e); }
                            }
                        } catch (e) {
                            console.warn('[CustomerDetails] failed to refresh customer after customerUpdated', e);
                        }
                    }
                } catch (e) {
                    console.warn('[CustomerDetails] customerUpdated handler error', e);
                }
            };
            window.addEventListener('customerUpdated', this.customerUpdatedListener);

            // Also listen for loyaltyRedeemConfirmed events (dispatched by CheckoutSheet)
            this.loyaltyRedeemListener = async (ev) => {
                try {
                    const d = ev && ev.detail ? ev.detail : {};
                    if (d.customerId && d.customerId !== customerData.id) return;
                    // Refresh customer doc and UI on loyalty redeem/revert
                    if (sdk && sdk.db) {
                        try {
                            const snap = await sdk.db.collection('Customers').doc(customerData.id).get();
                            if (snap && snap.exists) {
                                const updated = { id: snap.id, ...(snap.data ? snap.data() : snap._data || {}) };
                                customerData = updated;
                                try { this.updateCustomerUI(updated, this.modalControl); } catch (e) { console.warn('[CustomerDetails] updateCustomerUI after loyaltyRedeemConfirmed failed', e); }
                            }
                        } catch (e) { console.warn('[CustomerDetails] failed to refresh customer after loyaltyRedeemConfirmed', e); }
                    }
                } catch (e) { console.warn('[CustomerDetails] loyaltyRedeemConfirmed handler error', e); }
            };
            window.addEventListener('loyaltyRedeemConfirmed', this.loyaltyRedeemListener);

            // Also listen for orderUpdated events (pages/Checkout dispatches orderUpdated for redeems)
            this.orderUpdatedListener = async (ev) => {
                try {
                    const d = ev && ev.detail ? ev.detail : {};
                    if (d.customerId && d.customerId !== customerData.id) return;
                    if (sdk && sdk.db) {
                        try {
                            const snap = await sdk.db.collection('Customers').doc(customerData.id).get();
                            if (snap && snap.exists) {
                                const updated = { id: snap.id, ...(snap.data ? snap.data() : snap._data || {}) };
                                customerData = updated;
                                try { this.updateCustomerUI(updated, this.modalControl); } catch (e) { console.warn('[CustomerDetails] updateCustomerUI after orderUpdated failed', e); }
                            }
                        } catch (e) { console.warn('[CustomerDetails] failed to refresh customer after orderUpdated', e); }
                    }
                } catch (e) { console.warn('[CustomerDetails] orderUpdated handler error', e); }
            };
            window.addEventListener('orderUpdated', this.orderUpdatedListener);

        } catch (e) {
            console.warn('[CustomerDetails] failed to attach update listeners', e);
        }

    // Process the modal (regardless of whether it's new or existing)
    console.log('[CustomerDetails] About to call loadOrders for:', customerData);
        const setupModal = (modalControl) => {
            const headerActions = modalControl.container.querySelector('.sticky.top-0 .flex.items-center');
            if (headerActions) {
                // Add a Save button to header (if not present) which triggers the inline edit form submit
                const existingSaveBtn = headerActions.querySelector('#save-customer-details');
                if (!existingSaveBtn) {
                    const saveBtn = document.createElement('button');
                    saveBtn.id = 'save-customer-details';
                    saveBtn.className = 'mr-2 px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600';
                    saveBtn.textContent = 'Save';
                    saveBtn.addEventListener('click', () => {
                        try {
                            const form = modalControl.container.querySelector('#edit-customer-form');
                            if (!form) {
                                console.warn('[CustomerDetails] Save clicked but edit form not found');
                                return;
                            }
                            if (typeof form.requestSubmit === 'function') {
                                form.requestSubmit();
                                return;
                            }
                            // Fallback: dispatch a real submit event so the attached handler receives a real event
                            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                            form.dispatchEvent(submitEvent);
                        } catch (err) {
                            console.error('[CustomerDetails] Error triggering save from header:', err);
                        }
                    });
                    headerActions.insertBefore(saveBtn, headerActions.firstChild);
                }
            }

                // Always attach saveHandler after content update
            const form = modalControl.container.querySelector('#edit-customer-form');
            if (form) {
                // Attach once: avoid duplicate listeners by marking the form
                if (!form.dataset.saveAttached) {
                    form.addEventListener('submit', saveHandler);
                    // Defensive: also ensure onsubmit prevents default and delegates to saveHandler
                    if (!form.dataset.onsubmitWrapped) {
                        form.onsubmit = function (ev) {
                            try {
                                if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                            } catch (e) {}
                            try {
                                saveHandler(ev);
                            } catch (e) {
                                console.error('[CustomerDetails] saveHandler threw from onsubmit wrapper', e);
                            }
                            return false;
                        };
                        form.dataset.onsubmitWrapped = '1';
                    }
                    form.dataset.saveAttached = '1';
                    console.log('[CustomerDetails] saveHandler attached to form (setupModal)');
                } else {
                    console.log('[CustomerDetails] saveHandler already attached to form (setupModal)');
                }

                // Inline save button removed; header Save triggers form.requestSubmit()
            } else {
                console.warn('[CustomerDetails] Could not find form to attach saveHandler (setupModal)');
            }

            // Add event listeners - ensure we don't add duplicates by checking for elements first
            const depositBtn = document.getElementById('deposit-balance');
            if (depositBtn) {
                // Remove existing listener to avoid duplicates
                const newDepositBtn = depositBtn.cloneNode(true);
                depositBtn.parentNode.replaceChild(newDepositBtn, depositBtn);
                newDepositBtn.addEventListener('click', () => {
                    this.handleDeposit(customerData);
                });
            }

            if (customerData.balance < 0) {
                const reminderBtn = document.getElementById('send-reminder');
                if (reminderBtn) {
                    // Remove existing listener to avoid duplicates
                    const newReminderBtn = reminderBtn.cloneNode(true);
                    reminderBtn.parentNode.replaceChild(newReminderBtn, reminderBtn);
                    newReminderBtn.addEventListener('click', () => {
                        this.handleSendReminder(customerData);
                    });
                }
            }

            // Set up tab switching
            const transactionsTab = document.getElementById('tab-transactions');
            const ordersTab = document.getElementById('tab-orders');

            if (transactionsTab) {
                const newTransactionsTab = transactionsTab.cloneNode(true);
                transactionsTab.parentNode.replaceChild(newTransactionsTab, transactionsTab);
                newTransactionsTab.addEventListener('click', () => {
                    this.switchTab('transactions', customerData);
                });
            }

            if (ordersTab) {
                const newOrdersTab = ordersTab.cloneNode(true);
                ordersTab.parentNode.replaceChild(newOrdersTab, ordersTab);
                newOrdersTab.addEventListener('click', () => {
                    this.switchTab('orders', customerData);
                });
            }

            // Load initial data
            this.loadOrders(customerData);

            // Kick off loyalty points calculation/render
            try {
                this.calculateAndRenderPoints(customerData, modal);
            } catch (e) {
                console.warn('[CustomerDetails] calculateAndRenderPoints initial call failed', e);
            }
        };

        // If this is an existing modal, directly set it up
        if (existingModal) {
            setupModal(existingModal);
        } else {
            // For new modals, use the onShown callback
            modal.onShown = (modalControl) => {
                setupModal(modalControl);
            };
            // Also run setup immediately to attach listeners in case the modal is already rendered
            try {
                setupModal(modal);
            } catch (e) {
                console.warn('[CustomerDetails] setupModal immediate call failed, will rely on onShown', e);
            }
        }

        // Store modal control for later use
        this.modalControl = modal;

        return modal;
    };

    // Switch between tabs
    this.switchTab = function (tabName, customerData) {
        // Update tab styling
        if (tabName === 'transactions') {
            document.getElementById('tab-transactions').className = 'flex-1 py-3 px-4 text-center text-red-500 border-b-2 border-red-500 font-medium';
            document.getElementById('tab-orders').className = 'flex-1 py-3 px-4 text-center text-gray-600';
            this.loadTransactions(customerData);
        } else {
            document.getElementById('tab-orders').className = 'flex-1 py-3 px-4 text-center text-red-500 border-b-2 border-red-500 font-medium';
            document.getElementById('tab-transactions').className = 'flex-1 py-3 px-4 text-center text-gray-600';
            this.loadOrders(customerData);
        }
    };

    // Load transactions for a customer
    this.loadTransactions = async function (customerData) {
        console.log('[CustomerDetails] loadTransactions called for customer:', customerData);
        const tabContent = document.getElementById('tab-content');
        if (!tabContent) {
            console.error('[CustomerDetails] tab-content element not found when loading transactions');
            return;
        }
        tabContent.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
                <p class="mt-2 text-gray-600">Loading transactions...</p>
            </div>
        `;

        try {
            console.log('[CustomerDetails] Fetching transactions for customerId:', customerData.id);
            // In a real implementation, this would fetch from the SDK
            const transactions = await this.fetchTransactionsForCustomer(customerData.id);
            console.log('[CustomerDetails] Transactions fetched:', transactions);

            if (transactions.length === 0) {
                tabContent.innerHTML = `
                    <div class="p-8 text-center text-gray-500">
                        No transactions found for this customer.
                    </div>
                `;
                return;
            }

            let html = '<ul>';
            for (const transaction of transactions) {
                html += `
                    <li class="border-b">
                        <div class="p-4">
                            <div class="flex justify-between">
                                <div class="flex">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center mr-3 
                                        ${transaction.type === 'CREDIT' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}">
                                        <i class="ph ${transaction.type === 'CREDIT' ? 'ph-shopping-cart' : 'ph-currency-circle-dollar'}"></i>
                                    </div>
                                    <div>
                                        <p class="font-medium">
                                            ${transaction.type === 'CREDIT' ? 'Order Credit' : 'Wallet Deposit'}
                                        </p>
                                        <p class="text-sm text-gray-500">${formatDate(transaction.date)}</p>
                                        <p class="text-sm text-gray-500">${transaction.description}</p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <p class="font-medium ${transaction.type === 'CREDIT' ? 'text-red-500' : 'text-green-500'}">
                                        ${transaction.type === 'CREDIT' ? '-' : '+'}${UserSession?.getCurrency()}${transaction.amount.toLocaleString()}
                                    </p>
                                    <p class="text-sm text-gray-500">
                                        Balance: ${UserSession?.getCurrency()}${transaction.balance.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </li>
                `;
            }
            html += '</ul>';

            tabContent.innerHTML = html;
        } catch (error) {
            console.error('[CustomerDetails] Error loading transactions:', error);
            tabContent.innerHTML = `
                <div class="p-8 text-center text-red-500">
                    Error loading transactions: ${error.message}
                </div>
            `;
        }
    };

    // Load orders for a customer
    this.loadOrders = async function (customerData) {
        console.log('[CustomerDetails] loadOrders called for customer:', customerData);
        const tabContent = document.getElementById('tab-content');
        if (!tabContent) {
            console.error('[CustomerDetails] tab-content element not found when loading orders');
            return;
        }
        tabContent.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
                <p class="mt-2 text-gray-600">Loading orders...</p>
            </div>
        `;

        try {
            console.log('[CustomerDetails] Fetching orders for customerId (using fetchOrdersForCustomer):', customerData.id);
            // Use helper that normalizes item quantities, totals and computes itemTotal/tax/finalAmount
            const orders = await this.fetchOrdersForCustomer(customerData.id);
            console.log('[CustomerDetails] Orders fetched (normalized):', orders);

            if (orders.length === 0) {
                tabContent.innerHTML = `
                    <div class="p-8 text-center text-gray-500">
                        <div class="mb-4">
                            <i class="ph ph-shopping-bag text-6xl text-gray-200"></i>
                        </div>
                        <p>No orders found for this customer.</p>
                    </div>
                `;
                return;
            }

            let html = '<ul class="space-y-4">';
            for (const order of orders) {
                html += `
                    <li class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div class="p-4">
                            <div class="flex justify-between items-start mb-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                                        <i class="ph ph-shopping-bag text-blue-500"></i>
                                    </div>
                                    <div>
                                        <h4 class="font-medium">Order #${order.billNo || order.id}</h4>
                                        <p class="text-sm text-gray-500">${formatDate(order.date)}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="px-2.5 py-1 text-xs font-medium rounded-full ${order.paid ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}">
                                        ${order.paid ? 'Paid' : 'Pending'}
                                    </span>
                                    <span class="px-2.5 py-1 text-xs font-medium rounded-full ${order.payMode === 'CASH' ? 'bg-green-50 text-green-600' :
                        order.payMode === 'DIGITAL' ? 'bg-blue-50 text-blue-600' :
                            'bg-orange-50 text-orange-600'}">
                                        ${order.payMode || ''}
                                    </span>
                                </div>
                            </div>

                            <!-- Order Items Table -->
                            <div class="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                                <h5 class="text-sm font-medium mb-3 flex items-center text-gray-700">
                                    <i class="ph ph-shopping-cart mr-2 text-primary"></i>
                                    Order Items
                                </h5>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead>
                                            <tr class="border-b border-gray-100">
                                                <th class="text-left py-2 px-2 font-medium text-xs text-gray-500">Item</th>
                                                <th class="text-center py-2 px-2 font-medium text-xs text-gray-500">Qty</th>
                                                <th class="text-right py-2 px-2 font-medium text-xs text-gray-500">Price</th>
                                                <th class="text-right py-2 px-2 font-medium text-xs text-gray-500">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${(order.items || []).map(item => `
                                                <tr class="border-b border-gray-50">
                                                    <td class="py-2.5 px-2 text-left">
                                                        <span class="font-medium text-gray-700">${formatProductTitle(item)}</span>
                                                    </td>
                                                    <td class="py-2.5 px-2 text-center text-gray-600">${item.quantity || item.qnt || 1}</td>
                                                    <td class="py-2.5 px-2 text-right text-gray-600">${UserSession?.getCurrency()}${Number(item.price || 0).toFixed(2)}</td>
                                                    <td class="py-2.5 px-2 text-right font-medium text-gray-700">${UserSession?.getCurrency()}${(Number(item.price || 0) * (Number(item.quantity) || Number(item.qnt) || 1)).toFixed(2)}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                        <tfoot>
                                            <tr class="border-t border-gray-100">
                                                <td colspan="3" class="py-2 px-2 text-right font-medium text-gray-600">Item Price</td>
                                                <td class="py-2 px-2 text-right font-medium text-gray-600">${UserSession?.getCurrency()}${Number(order.itemTotal || 0).toFixed(2)}</td>
                                            </tr>
                                            <tr>
                                                <td colspan="3" class="py-2 px-2 text-right font-medium text-gray-600">Subtotal</td>
                                                <td class="py-2 px-2 text-right font-medium text-gray-600">${UserSession?.getCurrency()}${Number(order.itemTotal || 0).toFixed(2)}</td>
                                            </tr>
                                            
                                            ${(order.discount || 0) > 0 ? `
                                            <tr>
                                                <td colspan="3" class="py-2 px-2 text-right font-medium text-green-600">Discount</td>
                                                <td class="py-2 px-2 text-right font-medium text-green-600">-${UserSession?.getCurrency()}${Number(order.discount).toFixed(2)}</td>
                                            </tr>` : ''}

                                            <tr>
                                                <td colspan="3" class="py-2 px-2 text-right font-medium text-gray-600">Taxable Amount</td>
                                                <td class="py-2 px-2 text-right font-medium text-gray-700">${UserSession?.getCurrency()}${(Number(order.itemTotal || 0) - Number(order.discount || 0)).toFixed(2)}</td>
                                            </tr>

                                            <tr><td colspan="4" class="py-1"></td></tr>

                                            ${(order.calculatedCharges || []).map(charge => `
                                            <tr>
                                                <td colspan="3" class="py-1 px-2 text-right text-gray-600 text-sm">
                                                    ${charge.displayName || charge.name}${charge.type === 'percentage' ? ` ${charge.value}%` : ''}
                                                </td>
                                                <td class="py-1 px-2 text-right text-gray-600 text-sm">
                                                    ${UserSession?.getCurrency()}${Number(charge.calculatedAmount || 0).toFixed(2)}
                                                </td>
                                            </tr>
                                            `).join('')}

                                            <tr class="border-t border-gray-50">
                                                <td colspan="3" class="py-2 px-2 text-right font-medium text-blue-600">Total Tax</td>
                                                <td class="py-2 px-2 text-right font-medium text-blue-600">${UserSession?.getCurrency()}${Number(order.taxAmount || 0).toFixed(2)}</td>
                                            </tr>

                                            <tr><td colspan="4" class="py-1"></td></tr>

                                            <tr>
                                                <td colspan="3" class="py-2 px-2 text-right font-semibold text-gray-700">Total with tax</td>
                                                <td class="py-2 px-2 text-right font-semibold text-gray-800">
                                                    ${UserSession?.getCurrency()}${(Number(order.itemTotal || 0) - Number(order.discount || 0) + Number(order.taxAmount || 0)).toFixed(2)}
                                                </td>
                                            </tr>

                                            <tr class="border-t border-gray-200">
                                                <td colspan="3" class="py-3 px-2 text-right font-bold text-gray-700">Grand Total</td>
                                                <td class="py-3 px-2 text-right font-bold text-red-600">${UserSession?.getCurrency()}${Number(order.finalAmount || 0).toFixed(2)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            ${order.instructions ? `
                                <div class="mt-3 text-sm text-gray-600">
                                    <i class="ph ph-note-pencil mr-1"></i>
                                    ${order.instructions}
                                </div>
                            ` : ''}
                        </div>
                    </li>
                `;
            }
            html += '</ul>';

            tabContent.innerHTML = html;
        } catch (error) {
            console.error('[CustomerDetails] Error loading orders:', error);
            tabContent.innerHTML = `
                <div class="p-8 text-center text-red-500">
                    <div class="mb-2">
                        <i class="ph ph-warning text-3xl"></i>
                    </div>
                    <p>Error loading orders: ${error.message}</p>
                </div>
            `;
        }
    };

    // Fetch transactions for a customer from SDK
    this.fetchTransactionsForCustomer = async function (customerId) {
        try {
            // Get wallet transactions
            const walletSnapshot = await sdk.db.collection("Wallet")
                .where("customerId", "==", customerId)
                .get();

            const walletTrans = walletSnapshot.docs.map(doc => {
                const data = doc.data();
                // Handle both Firestore timestamp and JavaScript Date
                let transactionDate;
                if (data.date) {
                    // Check if it's a Firestore timestamp (has toDate method)
                    if (typeof data.date.toDate === 'function') {
                        transactionDate = data.date.toDate();
                    } else {
                        // Handle it as a JavaScript Date or timestamp number
                        transactionDate = new Date(data.date);
                    }
                } else {
                    transactionDate = new Date();
                }

                return {
                    id: doc.id,
                    amount: data.amount || 0,
                    type: 'DEPOSIT',
                    date: transactionDate,
                    description: `Deposited ${UserSession?.getCurrency()}${data.amount} in ${data.mode} payment.`,
                    balance: 0 // Will calculate
                };
            });

            // Get credit orders
            const ordersSnapshot = await sdk.db.collection("Orders")
                .where("custId", "==", customerId)
                .where("payMode", "==", "CREDIT")
                .get();

            const orderTrans = ordersSnapshot.docs.map(doc => {
                const data = doc.data();
                // Handle both Firestore timestamp and JavaScript Date
                let orderDate;
                if (data.placeDate) {
                    // Check if it's a Firestore timestamp (has toDate method)
                    if (typeof data.placeDate.toDate === 'function') {
                        orderDate = data.placeDate.toDate();
                    } else {
                        // Handle it as a JavaScript Date or timestamp number
                        orderDate = new Date(data.placeDate);
                    }
                } else {
                    orderDate = new Date();
                }

                return {
                    id: doc.id,
                    amount: data.total || 0,
                    type: 'CREDIT',
                    date: orderDate,
                    description: `Items: ${data.description || ''}`,
                    balance: 0, // Will calculate
                    order: { id: doc.id, ...data }
                };
            });

            // Combine and calculate running balance
            const allTrans = [...walletTrans, ...orderTrans].sort((a, b) => a.date - b.date);
            let balance = 0;

            for (const t of allTrans) {
                if (t.type === 'CREDIT') {
                    balance -= t.amount;
                } else {
                    balance += t.amount;
                }
                t.balance = balance;
            }

            // Return sorted by newest first
            return allTrans.sort((a, b) => b.date - a.date);
        } catch (error) {
            console.error("Error fetching transactions:", error);
            return [];
        }
    };

    // Fetch orders for a customer from SDK
    this.fetchOrdersForCustomer = async function (customerId) {
        try {
            // Get orders with customer ID
            const snapshot = await sdk.db.collection("Orders")
                .where("custId", "==", customerId)
                .orderBy("date", "desc")
                .get();

            // Map orders with detailed information
            return snapshot.docs.map(doc => {
                const data = doc.data();
                // Handle both Firestore timestamp and JavaScript Date
                let orderDate = null;
                if (data.date) {
                    orderDate = typeof data.date.toDate === 'function' ? data.date.toDate() : new Date(data.date);
                }

                // Calculate totals
                const itemTotal = data.items?.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || item.qnt || 1)), 0) || 0;

                // Use ChargesCalculator for consistent tax/charge calculation (matches Checkout)
                let taxAmount = 0;
                let finalAmount = itemTotal;
                let calculatedCharges = [];
                try {
                    if (ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function') {
                        const charges = Array.isArray(data.charges) ? data.charges : [];
                        const discount = parseFloat(data.discount) || 0;
                        const calc = ChargesCalculator.calculateCharges(itemTotal, charges, discount) || {};
                        calculatedCharges = Array.isArray(calc.calculatedCharges) ? calc.calculatedCharges : [];
                        // Sum only exclusive charges for taxAmount (inclusive charges are considered included in price)
                        taxAmount = calculatedCharges.filter(c => !c.isInclusive).reduce((s, c) => s + (parseFloat(c.calculatedAmount) || 0), 0);
                        finalAmount = parseFloat(calc.finalAmount) || finalAmount;
                    } else {
                        // Fallback: if no ChargesCalculator available, assume 18% tax like before
                        taxAmount = itemTotal * 0.18;
                        finalAmount = itemTotal + taxAmount;
                        calculatedCharges = [];
                    }
                } catch (err) {
                    console.warn('[CustomerDetails] ChargesCalculator failed, falling back to 18% tax', err);
                    taxAmount = itemTotal * 0.18;
                    finalAmount = itemTotal + taxAmount;
                    calculatedCharges = [];
                }

                // Format items with details
                const formattedItems = data.items?.map(item => ({
                    title: formatProductTitle(item) || 'Unknown Item',
                    price: item.price || 0,
                    quantity: item.quantity || item.qnt || 1,
                    total: (item.price || 0) * (item.quantity || item.qnt || 1),
                    served: item.served || false
                })) || [];

                // Determine paid state: prefer explicit flag, otherwise infer from status history
                const hasCompleted = (data.currentStatus && data.currentStatus.label === 'COMPLETED') || (Array.isArray(data.status) && data.status.some(s => s && s.label === 'COMPLETED'));
                const inferredPaid = Boolean(data.paid) || hasCompleted;

                return {
                    id: doc.id,
                    date: orderDate,
                    items: formattedItems,
                    itemTotal: itemTotal,
                    taxAmount: taxAmount,
                    finalAmount: finalAmount,
                    calculatedCharges: calculatedCharges || [],
                    payMode: data.payMode || 'CASH',
                    paid: inferredPaid,
                    status: data.currentStatus?.label || 'PLACED',
                    billNo: data.billNo || doc.id.slice(-6),
                    instructions: data.instructions || '',
                    discount: data.discount || 0,
                    loyaltyDiscountAmount: Number(data.loyaltyDiscountAmount || data.loyaltyDiscount || 0) || 0,
                    loyaltyPointsUsed: Number(data.loyaltyPointsUsed || 0) || 0
                };
            });
        } catch (error) {
            console.error("Error fetching orders:", error);
            return [];
        }
    };

    // Orphan orders feature removed from customer details

    // Local date formatting is handled by shared utils.formatDate

    // Use shared helper to propagate updates
    // Calls to propagateCustomerUpdate are made directly where needed (existing code uses this.propagateCustomerUpdate)

    // Handle deposit dialog
    this.handleDeposit = function (customerData) {
        const depositContent = `
            <div class="p-4">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                    <div class="flex items-center p-3 bg-gray-50 rounded-lg">
                        <div class="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center mr-3 border border-red-100">
                            <i class="ph ph-user text-red-400"></i>
                        </div>
                        <div>
                            <p class="font-medium">${customerData.name || 'Unknown'}</p>
                            <p class="text-sm text-gray-500">${customerData.phone || 'No phone'}</p>
                        </div>
                    </div>
                </div>
                <div class="mb-4">
                    <label for="deposit-amount" class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <span class="text-gray-500">${UserSession?.getCurrency()}</span>
                        </div>
                        <input type="number" id="deposit-amount" class="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500" placeholder="0.00" min="1" step="1">
                    </div>
                </div>
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
                    <div class="flex space-x-3">
                        <label class="flex-1 flex items-center border rounded-md p-3 cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="payment-mode" value="CASH" class="mr-2" checked>
                            <span>Cash</span>
                        </label>
                        <label class="flex-1 flex items-center border rounded-md p-3 cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="payment-mode" value="DIGITAL" class="mr-2">
                            <span>UPI</span>
                        </label>
                    </div>
                </div>
            </div>
        `;

        const depositActions = `
            <button id="submit-deposit" class="w-full bg-red-500 text-white py-3 px-4 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium">
                Add Balance
            </button>
        `;

        const self = this;
        const depositModal = ModalManager.createSideDrawerModal({
            id: 'deposit-modal',
            title: 'Add Balance',
            content: depositContent,
            actions: depositActions,
            zIndex: 1060,
            closeOnBackdropClick: true,
            onShown: (modalControl) => {
                // Find the submit button inside the modal container if available, fallback to document lookup
                const container = (modalControl && modalControl.container) ? modalControl.container : document;
                const submitBtn = container.querySelector ? container.querySelector('#submit-deposit') : document.getElementById('submit-deposit');

                if (!submitBtn) {
                    console.warn('[CustomerDetails] submit-deposit button not found in modal onShown');
                    return;
                }

                const handler = async function () {
                    // Prevent double-clicks
                    if (submitBtn.__processing) return;
                    submitBtn.__processing = true;
                    submitBtn.disabled = true;
                    try {
                        const amountEl = container.querySelector ? container.querySelector('#deposit-amount') : document.getElementById('deposit-amount');
                        const amount = Number((amountEl && amountEl.value) || 0);
                        const pmEl = container.querySelector ? container.querySelector('input[name="payment-mode"]:checked') : document.querySelector('input[name="payment-mode"]:checked');
                        const paymentMode = (pmEl || {}).value || 'CASH';

                        if (!amount || amount <= 0) {
                            try { ModalManager.showToast('Please enter a valid amount', { type: 'error' }); } catch (e) {}
                            return;
                        }

                        if (!sdk || !sdk.db || typeof sdk.db.collection !== 'function') {
                            throw new Error('Database not available');
                        }

                        // Add to wallet collection
                        await sdk.db.collection("Wallet").add({
                            amount: amount,
                            mode: paymentMode,
                            customerId: customerData.id,
                            date: new Date()
                        });

                        // Show success message
                        try { ModalManager.showToast(`Added ${UserSession?.getCurrency()||''}${amount} to ${customerData.name||''}'s balance`); } catch (e) {}

                        // Close modal
                        try { modalControl.close(); } catch (e) {}

                        // Update the customer data directly instead of reloading the entire modal
                        try {
                            // Update the balance in the customerData object
                            const newBalance = (Number(customerData.balance || 0) + Number(amount)).toString();
                            customerData.balance = newBalance;
                            
                            // Update the UI elements directly in the existing modal
                            if (self.modalControl && self.modalControl.container) {
                                // Update balance display
                                const balanceElement = self.modalControl.container.querySelector('.mt-4.p-4.bg-red-50 p.text-xl.font-bold');
                                if (balanceElement) {
                                    balanceElement.className = `text-xl font-bold ${Number(newBalance) < 0 ? 'text-red-600' : 'text-green-600'}`;
                                    const currencySymbol = UserSession?.getCurrency();
                                    balanceElement.textContent = `${currencySymbol}${Number(newBalance) < 0
                                        ? `-${Math.abs(Number(newBalance)).toLocaleString()}`
                                        : Number(newBalance).toLocaleString()}`;
                                }
                                
                                // Update reminder button visibility
                                const actionsContainer = self.modalControl.container.querySelector('.mt-4.p-4.bg-red-50 .flex.space-x-2');
                                if (actionsContainer) {
                                    const hasReminderBtn = !!actionsContainer.querySelector('#send-reminder');
                                    const shouldHaveReminderBtn = Number(newBalance) < 0;

                                    if (shouldHaveReminderBtn && !hasReminderBtn) {
                                        // Add reminder button if needed
                                        const reminderBtn = document.createElement('button');
                                        reminderBtn.id = 'send-reminder';
                                        reminderBtn.className = 'px-3 py-2 bg-red-500 text-white text-sm rounded-lg flex items-center hover:bg-red-600';
                                        reminderBtn.innerHTML = '<i class="ph ph-paper-plane-tilt mr-1.5"></i>Send Reminder';
                                        reminderBtn.addEventListener('click', () => {
                                            self.handleSendReminder(customerData);
                                        });
                                        actionsContainer.insertBefore(reminderBtn, actionsContainer.firstChild);
                                    } else if (!shouldHaveReminderBtn && hasReminderBtn) {
                                        // Remove reminder button if no longer needed
                                        actionsContainer.querySelector('#send-reminder').remove();
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('Direct UI update failed, falling back to full reload', e);
                            // Fallback to full reload if direct update fails
                            self.showCustomerDetailsModal(customerData, self.modalControl);
                        }

                        // Refresh customers list in main page (defensive typeof check)
                        try { if (typeof fetchCustomers === 'function') fetchCustomers(); } catch (e) { console.warn('fetchCustomers call failed', e); }
                    } catch (error) {
                        console.error("Error adding balance:", error);
                        try { ModalManager.showToast("Failed to add balance", { type: "error" }); } catch (e) {}
                    } finally {
                        submitBtn.__processing = false;
                        try { submitBtn.disabled = false; } catch (e) {}
                    }
                };

                submitBtn.addEventListener('click', handler);

                // Remove listener when modal is closed to avoid leaks/double-binding
                try {
                    const cleanup = () => {
                        try { submitBtn.removeEventListener('click', handler); } catch (e) {}
                        try { modalControl.removeOnClose && modalControl.removeOnClose(cleanup); } catch (e) {}
                    };
                    // If modalControl provides onClose registration, use it; otherwise rely on garbage collection
                    if (modalControl && typeof modalControl.onClose === 'function') {
                        try { modalControl.onClose(cleanup); } catch (e) {}
                    }
                } catch (e) { /* non-fatal */ }
            }
        });
    };

    // Handle edit name dialog
    this.handleEditName = function (customerData) {
        const editNameContent = `
            <div class="p-4">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" id="customer-name" class="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500" 
                           value="${customerData.name || ''}" placeholder="Customer name">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="tel" id="customer-phone" class="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500" 
                           value="${customerData.phone || ''}" placeholder="Phone number">
                </div>
            </div>
        `;

        const editNameActions = `
            <div class="flex justify-end space-x-2">
                <button id="cancel-edit" class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                    Cancel
                </button>
                <button id="submit-edit" class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
                    Save
                </button>
            </div>
        `;

        const self = this;
        const editModal = ModalManager.createSideDrawerModal({
            id: 'edit-name-modal',
            title: 'Edit Customer',
            content: editNameContent,
            actions: editNameActions,
            zIndex: 1060,
            closeOnBackdropClick: true,
            onShown: (modalControl) => {
                document.getElementById('cancel-edit').addEventListener('click', () => {
                    modalControl.close();
                });

                document.getElementById('submit-edit').addEventListener('click', async function () {
                    const name = document.getElementById('customer-name').value;
                    const phone = document.getElementById('customer-phone').value;
                    if (!name || !phone) return;

                    try {
                        await sdk.db.collection("Customers").doc(customerData.id).update({
                            name: name,
                            phone: phone
                        });

                        // Show success message
                        ModalManager.showToast(`Updated customer details`);

                        // Close modal
                        modalControl.close();

                        // Update customer object
                        customerData.name = name;
                        customerData.phone = phone;

                        // Refresh view
                        self.showCustomerDetailsModal(customerData);

                        // Refresh customers list
                        if (fetchCustomers && typeof fetchCustomers === 'function') {
                            fetchCustomers();
                        }
                        // Propagate to orders and notify app
                        try { propagateCustomerUpdate(customerData.id, { name: name, phone: phone }); } catch (e) { console.warn('Propagation after quick edit failed', e); }
                    } catch (error) {
                        console.error("Error updating customer details:", error);
                        ModalManager.showToast("Failed to update details", { type: "error" });
                    }
                });

                // Focus the input field
                document.getElementById('customer-name').focus();
            }
        });
    };

    // Handle send reminder
    this.handleSendReminder = function (customerData) {
        if (!customerData.phone) {
            ModalManager.showToast("No phone number available for this customer", { type: "error" });
            return;
        }

        const balance = Number(customerData.balance || 0);
        if (balance >= 0) {
            ModalManager.showToast("This customer doesn't have a negative balance", { type: "error" });
            return;
        }

        const currencySymbol = UserSession?.getCurrency();
        const message = `Hi ${customerData.name || 'Customer'}, this is a reminder that you have an outstanding balance of ${currencySymbol}${Math.abs(balance)} with us. Please clear your dues at your earliest convenience. Thank you.`;

        window.open(`https://wa.me/${customerData.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');

        ModalManager.showToast("WhatsApp message opened", { type: "success" });
    };

    // Use common toast
    this.showToast = function (message, type = "success") {
        ModalManager.showToast(message, { type });
    };

    // Update the customer UI when data changes
    this.updateCustomerUI = function (customerData, modal) {
        if (!modal) return;

        // Update balance display
        const balanceElement = modal.container.querySelector('.mt-4.p-4.bg-red-50 p.text-xl.font-bold');
        if (balanceElement) {
            balanceElement.className = `text-xl font-bold ${Number(customerData.balance || 0) < 0 ? 'text-red-600' : 'text-green-600'}`;
            const currencySymbol = UserSession?.getCurrency();
            balanceElement.textContent = `${currencySymbol}${Number(customerData.balance || 0) < 0
                ? `-${Math.abs(Number(customerData.balance || 0)).toLocaleString()}`
                : Number(customerData.balance || 0).toLocaleString()}`;
        }

        // Check if we need to update reminder button visibility
        const actionsContainer = modal.container.querySelector('.mt-4.p-4.bg-red-50 .flex.space-x-2');
        if (actionsContainer) {
            const hasReminderBtn = !!actionsContainer.querySelector('#send-reminder');
            const shouldHaveReminderBtn = Number(customerData.balance || 0) < 0;

            if (shouldHaveReminderBtn && !hasReminderBtn) {
                // Add reminder button if needed
                const reminderBtn = document.createElement('button');
                reminderBtn.id = 'send-reminder';
                reminderBtn.className = 'px-3 py-2 bg-red-500 text-white text-sm rounded-lg flex items-center hover:bg-red-600';
                reminderBtn.innerHTML = '<i class="ph ph-paper-plane-tilt mr-1.5"></i>Send Reminder';
                reminderBtn.addEventListener('click', () => {
                    this.handleSendReminder(customerData);
                });
                actionsContainer.insertBefore(reminderBtn, actionsContainer.firstChild);
            } else if (!shouldHaveReminderBtn && hasReminderBtn) {
                // Remove reminder button if no longer needed
                actionsContainer.querySelector('#send-reminder').remove();
            }
        }

        // Setup tab switching event listeners every time UI is updated
        const ordersTab = modal.container.querySelector('#tab-orders');
        const transactionsTab = modal.container.querySelector('#tab-transactions');
        if (ordersTab) {
            ordersTab.onclick = () => {
                ordersTab.className = 'flex-1 py-3 px-4 text-center text-red-500 border-b-2 border-red-500 font-medium';
                if (transactionsTab) transactionsTab.className = 'flex-1 py-3 px-4 text-center text-gray-600';
                // orphan tab removed
                this.loadOrders(customerData);
            };
        }
        if (transactionsTab) {
            transactionsTab.onclick = () => {
                transactionsTab.className = 'flex-1 py-3 px-4 text-center text-red-500 border-b-2 border-red-500 font-medium';
                if (ordersTab) ordersTab.className = 'flex-1 py-3 px-4 text-center text-gray-600';
                this.loadTransactions(customerData);
            };
        }

        // orphan tab removed

        // Load orders by default when UI is updated, but only when the tab-content element exists.
        // Sometimes updateCustomerUI is invoked from listeners before the modal/container is attached
        // to the DOM (for example via a global customerUpdated event). Guard the call and retry
        // once after a short delay to avoid noisy errors.
        try {
            const tabContentEl = (modal && modal.container) ? modal.container.querySelector('#tab-content') : document.getElementById('tab-content');
            if (tabContentEl) {
                this.loadOrders(customerData);
            } else {
                // Retry once after a short debounce to allow modal attach
                try {
                    setTimeout(() => {
                        try {
                            const el = (modal && modal.container) ? modal.container.querySelector('#tab-content') : document.getElementById('tab-content');
                            if (el) this.loadOrders(customerData);
                            else console.debug('[CustomerDetails] tab-content still not present after retry; skipping loadOrders');
                        } catch (e) { console.warn('[CustomerDetails] retry loadOrders failed', e); }
                    }, 200);
                } catch (e) { /* ignore timers failing */ }
            }
        } catch (e) {
            console.warn('[CustomerDetails] guarded loadOrders failed', e);
        }

        // Recalculate loyalty points when UI updates
        try {
            this.calculateAndRenderPoints(customerData, modal);
        } catch (e) {
            console.warn('[CustomerDetails] calculateAndRenderPoints failed in updateCustomerUI', e);
        }
    };

    // Calculate loyalty points for a customer and render into the loyalty card
    this.calculateAndRenderPoints = async function (customerData, modal) {
        try {
            const container = modal && modal.container ? modal.container : document;
            const availableEl = container.querySelector('#customer-loyalty-available');
            const breakdownEl = container.querySelector('#customer-loyalty-breakdown');
            if (!availableEl || !breakdownEl) return;

            // Get the computed available/redeemed points from central engine
            let pts = { earnedPoints: 0, redeemedPoints: 0, available: 0 };
            try {
                // Do not override the engine rate here — use configured rate so display matches actual calculation
                pts = await computeAvailablePoints(customerData.id);
            } catch (e) {
                console.warn('[CustomerDetails] computeAvailablePoints failed', e);
            }

            // Also read the stored Customers.loyaltyPoints so we can mirror Checkout's display logic
            let storedPts = 0;
            try {
                if (sdk && sdk.db) {
                    const snap = await sdk.db.collection('Customers').doc(customerData.id).get();
                    if (snap && snap.exists) {
                        const cd = snap.data ? snap.data() : (snap._data || {});
                        storedPts = Number(cd.loyaltyPoints || 0) || 0;
                    }
                }
            } catch (e) {
                console.warn('[CustomerDetails] failed to read stored Customers.loyaltyPoints', e);
                storedPts = 0;
            }

            // Reconcile stored value with computed available when possible so other UIs see the canonical value
            try {
                const { syncCustomerLoyaltyPoints } = await import('../utils/LoyaltyEngine.js');
                try { syncCustomerLoyaltyPoints(customerData.id, Number(pts.available || 0)).catch(() => {}); } catch(e){}
            } catch(e) { /* ignore dynamic import issues */ }

            // Display canonical value matching Checkout: prefer the larger of computed.available and stored loyaltyPoints
            try {
                const computedAvailable = Number(pts.available || 0) || 0;
                const display = Math.max(computedAvailable, Number(storedPts || 0));
                try { console.debug('[Loyalty debug][CustomerDetails] computed:', pts, 'stored:', storedPts, 'display:', display); } catch(e){}
                availableEl.textContent = String(display || 0);
            } catch (e) {
                console.warn('[CustomerDetails] failed to render available points', e);
            }

            // Render redeemed only if non-zero, and also show rate when not default 1
            try {
                const parts = [];
                if (Number(pts.redeemedPoints || 0) > 0) {
                    parts.push(`Redeemed: <strong>${Number(pts.redeemedPoints).toString()}</strong>`);
                }
                if (pts.rate && Number(pts.rate) !== 1) {
                    // Show the formula: totalSpend × rate = earnedPoints
                    const spend = Number(pts.totalSpend || 0);
                    const rate = Number(pts.rate || 0);
                    const calc = Math.floor(spend * rate);
                    parts.push(`Calculated: <strong>${spend} × ${rate} = ${calc} pts</strong>`);
                }
                breakdownEl.innerHTML = parts.join(' \u2022 ');
            } catch (e) {
                console.warn('[CustomerDetails] failed to render redeemed points', e);
            }
        } catch (err) {
            console.warn('[CustomerDetails] calculateAndRenderPoints error', err);
        }
    };

} // end CustomerDetails
