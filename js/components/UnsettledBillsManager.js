import { useState, useEffect } from 'react';
import { UserSession } from '../utils/UserSession.js';
import { showToast } from '../utils.js';
import { ModalManager } from './ModalManager.js';
import { sdk } from '../sdk.js';
import { MOrder } from '../models/Order.js';

// UnsettledBillsManager component for handling unsettled bills and partial payments
export function UnsettledBillsManager({ onClose }) {
    const [unsettledOrders, setUnsettledOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all'); // all, partial, full
    const [searchTerm, setSearchTerm] = useState('');

    // Load unsettled orders
    const loadUnsettledOrders = async () => {
        try {
            setLoading(true);
            setError(null);

            // Query for unsettled orders
            const unsettledSnapshot = await sdk.db.collection("Orders")
                .where("payMode", "==", "UNSETTLED")
                .orderBy("date", "desc")
                .limit(100)
                .get();

            const orders = unsettledSnapshot.docs.map(doc => {
                const data = doc.data();
                const orderData = { ...data, id: doc.id };
                return {
                    id: doc.id,
                    ...data,
                    order: new MOrder(orderData)
                };
            });

            setUnsettledOrders(orders);
        } catch (err) {
            console.error("Error loading unsettled orders:", err);
            setError("Failed to load unsettled orders");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUnsettledOrders();
    }, []);

    // Filter orders based on settlement status and search
    const filteredOrders = unsettledOrders.filter(order => {
        // Filter by settlement status
        const statusMatch = filter === 'all' ||
            (filter === 'partial' && order.settledAmount > 0 && !order.settled) ||
            (filter === 'full' && (order.settledAmount === 0 || !order.settledAmount));

        // Filter by search term
        const searchMatch = !searchTerm ||
            order.billNo?.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.custName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.custPhone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.id.toLowerCase().includes(searchTerm.toLowerCase());

        return statusMatch && searchMatch;
    });

    // Open partial payment modal
    const openPartialPaymentModal = (order) => {
        if (!order) return;

        const orderTotal = order.order.total;
        const settledAmount = order.settledAmount || 0;
        const pendingAmount = orderTotal - settledAmount;

        if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
            const modalContent = `
                <div class="py-4">
                    <div class="flex items-center justify-center mb-6">
                        <div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                            <i class="ph ph-currency-circle-dollar text-blue-500 text-4xl"></i>
                        </div>
                    </div>
                    <h3 class="text-center font-medium text-gray-800 mb-2">Add Payment</h3>
                    <div class="text-center text-gray-600 mb-6 px-4">
                        <p class="mb-2">Bill #${order.billNo || order.id.substring(0, 8)}</p>
                        <div class="bg-gray-50 rounded-lg p-3">
                            <div class="flex justify-between text-sm">
                                <span>Total Amount:</span>
                                <span class="font-medium">${UserSession?.getCurrency()}${orderTotal.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between text-sm text-green-600">
                                <span>Settled:</span>
                                <span class="font-medium">${UserSession?.getCurrency()}${settledAmount.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between text-sm text-red-600 border-t pt-1">
                                <span>Pending:</span>
                                <span class="font-bold">${UserSession?.getCurrency()}${pendingAmount.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm text-gray-600 mb-2">Payment Amount</label>
                            <div class="flex items-center border rounded-lg overflow-hidden shadow-sm">
                                <span class="px-3 py-2 bg-gray-100 text-gray-500">
                                    ${UserSession?.getCurrency()}
                                </span>
                                <input
                                    type="number"
                                    id="payment-amount-input"
                                    placeholder="0.00"
                                    min="0.01"
                                    max="${pendingAmount.toFixed(2)}"
                                    step="0.01"
                                    value="${pendingAmount.toFixed(2)}"
                                    class="flex-1 px-3 py-2 outline-none"
                                />
                            </div>
                            <div class="flex gap-2 mt-2">
                                <button 
                                    id="quarter-btn" 
                                    class="text-xs py-1 px-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                                >
                                    25% (${UserSession?.getCurrency()}${(pendingAmount * 0.25).toFixed(2)})
                                </button>
                                <button 
                                    id="half-btn" 
                                    class="text-xs py-1 px-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                                >
                                    50% (${UserSession?.getCurrency()}${(pendingAmount * 0.5).toFixed(2)})
                                </button>
                                <button 
                                    id="full-btn" 
                                    class="text-xs py-1 px-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                                >
                                    Full (${UserSession?.getCurrency()}${pendingAmount.toFixed(2)})
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm text-gray-600 mb-2">Payment Method</label>
                            <select id="payment-method-select" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="CASH">Cash</option>
                                <option value="DIGITAL">UPI/Card</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-sm text-gray-600 mb-2">Notes (Optional)</label>
                            <input
                                type="text"
                                id="payment-notes-input"
                                placeholder="Payment notes..."
                                class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>
            `;

            const modalFooter = `
                <div class="flex gap-3">
                    <button id="cancel-payment" class="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg">
                        Cancel
                    </button>
                    <button id="add-payment" class="flex-1 py-2.5 bg-blue-600 text-white rounded-lg">
                        Add Payment
                    </button>
                </div>
            `;

            ModalManager.createCenterModal({
                id: 'partial-payment-modal',
                title: 'Add Payment',
                content: modalContent,
                actions: modalFooter,
                onShown: (modalControl) => {
                    const amountInput = document.getElementById('payment-amount-input');
                    const methodSelect = document.getElementById('payment-method-select');
                    const notesInput = document.getElementById('payment-notes-input');
                    const cancelBtn = document.getElementById('cancel-payment');
                    const addBtn = document.getElementById('add-payment');

                    // Quick amount buttons
                    const quarterBtn = document.getElementById('quarter-btn');
                    const halfBtn = document.getElementById('half-btn');
                    const fullBtn = document.getElementById('full-btn');

                    if (quarterBtn) {
                        quarterBtn.addEventListener('click', () => {
                            amountInput.value = (pendingAmount * 0.25).toFixed(2);
                        });
                    }

                    if (halfBtn) {
                        halfBtn.addEventListener('click', () => {
                            amountInput.value = (pendingAmount * 0.5).toFixed(2);
                        });
                    }

                    if (fullBtn) {
                        fullBtn.addEventListener('click', () => {
                            amountInput.value = pendingAmount.toFixed(2);
                        });
                    }

                    if (cancelBtn) {
                        cancelBtn.addEventListener('click', () => modalControl.close());
                    }

                    if (addBtn) {
                        addBtn.addEventListener('click', async () => {
                            const amount = parseFloat(amountInput.value);
                            const method = methodSelect.value;
                            const notes = notesInput.value.trim();

                            if (!amount || amount <= 0) {
                                showToast("Please enter a valid payment amount", "error");
                                return;
                            }

                            if (amount > pendingAmount) {
                                showToast("Payment amount cannot exceed pending amount", "error");
                                return;
                            }

                            try {
                                // Add payment using the order's addPartialPayment method
                                const result = await order.order.addPartialPayment(amount, method, notes);

                                modalControl.close();
                                
                                if (result && result.isFullySettled) {
                                    showToast("Payment added - Order fully settled!", "success");
                                } else {
                                    showToast(`Partial payment of ${UserSession?.getCurrency()}${amount.toFixed(2)} added`, "success");
                                }

                                // Reload orders to reflect changes
                                loadUnsettledOrders();
                            } catch (error) {
                                console.error("Error adding partial payment:", error);
                                showToast("Failed to add payment: " + (error.message || "Unknown error"), "error");
                            }
                        });
                    }
                }
            });
        }
    };

    if (loading) {
        return (
            <div className="p-6 text-center">
                <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading unsettled bills...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center">
                <div className="text-red-500 mb-4">
                    <i className="ph ph-warning-circle text-3xl"></i>
                </div>
                <p className="text-red-600">{error}</p>
                <button
                    onClick={loadUnsettledOrders}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center">
                    <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mr-3">
                        <i className="ph ph-clock-clockwise text-yellow-600 text-xl"></i>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">Unsettled Bills</h2>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <i className="ph ph-x text-gray-600"></i>
                    </button>
                )}
            </div>

            {/* Filters and Search */}
            <div className="p-4 border-b bg-gray-50">
                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1">
                        <div className="relative">
                            <i className="ph ph-magnifying-glass absolute left-3 top-3 text-gray-400"></i>
                            <input
                                type="text"
                                placeholder="Search by bill number, customer name, or phone..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
                            />
                        </div>
                    </div>

                    {/* Filter */}
                    <div className="flex gap-2">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'full', label: 'Fully Unsettled' },
                            { id: 'partial', label: 'Partially Settled' }
                        ].map(filterOption => (
                            <button
                                key={filterOption.id}
                                onClick={() => setFilter(filterOption.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    filter === filterOption.id
                                        ? 'bg-yellow-500 text-white'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {filterOption.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Summary */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-3 text-center">
                        <div className="text-sm text-gray-600">Total Bills</div>
                        <div className="text-lg font-bold text-yellow-600">{filteredOrders.length}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                        <div className="text-sm text-gray-600">Fully Unsettled</div>
                        <div className="text-lg font-bold text-red-600">
                            {filteredOrders.filter(o => (o.settledAmount || 0) === 0).length}
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                        <div className="text-sm text-gray-600">Partially Settled</div>
                        <div className="text-lg font-bold text-blue-600">
                            {filteredOrders.filter(o => (o.settledAmount || 0) > 0 && !o.settled).length}
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                        <div className="text-sm text-gray-600">Total Pending</div>
                        <div className="text-lg font-bold text-gray-800">
                            {UserSession?.getCurrency()}{filteredOrders.reduce((sum, o) => sum + (o.order.pendingAmount || 0), 0).toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto p-4">
                {filteredOrders.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-gray-400 mb-4">
                            <i className="ph ph-receipt text-6xl"></i>
                        </div>
                        <p className="text-gray-600">No unsettled bills found</p>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="mt-2 text-blue-500 hover:text-blue-600"
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredOrders.map((order) => {
                            const orderTotal = order.order.total;
                            const settledAmount = order.settledAmount || 0;
                            const pendingAmount = orderTotal - settledAmount;
                            const isPartiallySettled = settledAmount > 0 && !order.settled;
                            
                            return (
                                <div key={order.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="font-medium text-gray-900">
                                                    Bill #{order.billNo || order.id.substring(0, 8)}
                                                </h3>
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                    isPartiallySettled 
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {isPartiallySettled ? 'Partially Settled' : 'Unsettled'}
                                                </span>
                                            </div>

                                            {/* Customer info */}
                                            {(order.custName || order.custPhone) && (
                                                <div className="text-sm text-gray-600 mb-2">
                                                    <i className="ph ph-user mr-1"></i>
                                                    {order.custName}
                                                    {order.custPhone && (
                                                        <span className="ml-2">
                                                            <i className="ph ph-phone mr-1"></i>
                                                            {order.custPhone}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Order date */}
                                            <div className="text-sm text-gray-500 mb-3">
                                                <i className="ph ph-calendar mr-1"></i>
                                                {new Date(order.date?.toDate ? order.date.toDate() : order.date).toLocaleString('en-GB')}
                                            </div>

                                            {/* Payment details */}
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="text-gray-600">Total:</span>
                                                    <span className="ml-2 font-medium">{UserSession?.getCurrency()}{orderTotal.toFixed(2)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-600">Settled:</span>
                                                    <span className="ml-2 font-medium text-green-600">{UserSession?.getCurrency()}{settledAmount.toFixed(2)}</span>
                                                </div>
                                            </div>
                                            <div className="mt-1 text-sm">
                                                <span className="text-gray-600">Pending:</span>
                                                <span className="ml-2 font-bold text-red-600">{UserSession?.getCurrency()}{pendingAmount.toFixed(2)}</span>
                                            </div>

                                            {/* Payment history */}
                                            {order.partialPayments && order.partialPayments.length > 0 && (
                                                <div className="mt-3 pt-3 border-t">
                                                    <div className="text-xs text-gray-600 mb-2">Payment History:</div>
                                                    <div className="space-y-1">
                                                        {order.partialPayments.slice(-2).map((payment, index) => (
                                                            <div key={payment.id || index} className="text-xs text-gray-500 flex justify-between">
                                                                <span>
                                                                    {payment.paymentMode} - {new Date(payment.date?.toDate ? payment.date.toDate() : payment.date).toLocaleDateString()}
                                                                </span>
                                                                <span className="font-medium">
                                                                    {UserSession?.getCurrency()}{payment.amount.toFixed(2)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {order.partialPayments.length > 2 && (
                                                            <div className="text-xs text-gray-400">
                                                                ... and {order.partialPayments.length - 2} more payments
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action button */}
                                        <div className="ml-4">
                                            <button
                                                onClick={() => openPartialPaymentModal(order)}
                                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center"
                                            >
                                                <i className="ph ph-currency-circle-dollar mr-2"></i>
                                                Add Payment
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
} 