import { useState, useEffect, useCallback } from 'react';
import { sdk } from '../sdk.js';
import { appendCustomerPayment } from '../utils/CustomerSync.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { useOrders } from '../contexts/OrderContext.js';
import OrderCard from '../components/kds/OrderCard.jsx';

export default function KDS() {
    const { profile } = useProfile();
    const { activeOrders } = useOrders();
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [showKitchenNotes, setShowKitchenNotes] = useState(true);

    // KDS settings from profile
    const kdsSettings = profile?.kdsSettings || {
        notificationSounds: {
            orderReceived: 'default',
            orderCancelled: 'default',
            orderCompleted: 'default'
        },
        showKitchenNotes: true
    };

    // Ensure profile has kdsSettings
    useEffect(() => {
        if (profile && !profile.kdsSettings) {
            // Update profile with default kdsSettings
            const updatedProfile = {
                ...profile,
                kdsSettings: {
                    notificationSounds: {
                        orderReceived: 'default',
                        orderCancelled: 'default',
                        orderCompleted: 'default'
                    },
                    showKitchenNotes: true
                }
            };
            // In a real app, you would update this in the database
            // For now, we'll just use the default settings
        }
    }, [profile]);

    // Play notification sound
    const playNotificationSound = useCallback((type) => {
        if (!soundEnabled) return;

        const audio = new Audio();
        switch (type) {
            case 'orderReceived':
                audio.src = kdsSettings.notificationSounds.orderReceived === 'default' 
                    ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT' 
                    : kdsSettings.notificationSounds.orderReceived;
                break;
            case 'orderCancelled':
                audio.src = kdsSettings.notificationSounds.orderCancelled === 'default' 
                    ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT' 
                    : kdsSettings.notificationSounds.orderCancelled;
                break;
            case 'orderCompleted':
                audio.src = kdsSettings.notificationSounds.orderCompleted === 'default' 
                    ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT' 
                    : kdsSettings.notificationSounds.orderCompleted;
                break;
        }
        audio.play().catch(console.error);
    }, [soundEnabled, kdsSettings.notificationSounds]);

    // Mark item as completed
    const markItemCompleted = async (orderId, itemIndex, newCompleted, newPending) => {
        try {
            const order = activeOrders.find(o => o.id === orderId);
            if (!order) return;

            // Update the specific item in the order
            const updatedItems = [...order.items];
            
            // Update the completed count for this item
            if (updatedItems[itemIndex]) {
                updatedItems[itemIndex] = {
                    ...updatedItems[itemIndex],
                    completed: newCompleted
                };
                
                // Mark as served when no pending items left
                if (newPending === 0) {
                    updatedItems[itemIndex].served = true;
                }
            }

            // Check if all items are completed
            const allCompleted = updatedItems.every(item => {
                const itemCompleted = item.completed || 0;
                const itemQuantity = item.qnt || 0;
                return itemCompleted >= itemQuantity;
            });
            
            if (allCompleted) {
                // Update order status to completed
                await sdk.db.collection("Orders").doc(orderId).update({
                    "currentStatus.label": "COMPLETED",
                    "currentStatus.timestamp": new Date(),
                    items: updatedItems
                });

                // After marking completed, try to update customer aggregates and notify other components.
                try {
                    // Fetch fresh order data to get customer id and amounts
                    const snap = await sdk.db.collection('Orders').doc(orderId).get();
                    const data = snap && typeof snap.data === 'function' ? snap.data() : (snap && snap.data) || {};
                    const custId = data.custId || (data.customer && data.customer.id) || null;

                    // Compute amount: prefer settledAmount, then finalAmount, then derive from items
                    let amount = Number(data.settledAmount ?? data.finalAmount ?? 0) || 0;
                    if (!amount) {
                        try {
                            const items = Array.isArray(data.items) ? data.items : [];
                            amount = items.reduce((s, it) => {
                                const price = Number(it.price ?? it.basePrice ?? 0) || 0;
                                const q = Number(it.qnt ?? it.quantity ?? 1) || 1;
                                return s + (price * q);
                            }, 0);
                        } catch (e) { amount = 0; }
                    }

                    // Non-blocking: append payment for linked customer (not guest)
                    if (custId && custId !== 'guest') {
                        try {
                            appendCustomerPayment(custId, {
                                orderId: orderId,
                                amount: amount,
                                payMode: data.payMode || data.paymentMode || 'CASH',
                                isNewOrder: true,
                                date: data.date || new Date(),
                                loyaltyDiscountAmount: Number(data.loyaltyDiscountAmount || 0) || 0,
                                loyaltyPointsUsed: Number(data.loyaltyPointsUsed || 0) || 0,
                                settled: Boolean(data.paid || data.settled || ((Number(data.settledAmount || 0) || 0) > 0) || /COMPLETED/i.test((data.currentStatus && data.currentStatus.label) || data.status || ''))
                            }).catch(e => console.warn('[KDS] appendCustomerPayment failed', e));
                        } catch (e) {
                            console.warn('[KDS] Failed to call appendCustomerPayment', e);
                        }
                    }

                    // Dispatch orderCompleted event including customerId so listeners can react selectively
                    try {
                        const ev = new CustomEvent('orderCompleted', { detail: { orderId, customerId: custId, paid: true, status: 'COMPLETED' } });
                        window.dispatchEvent(ev);
                    } catch (e) {
                        console.warn('[KDS] Failed to dispatch orderCompleted event', e);
                    }
                } catch (err) {
                    console.warn('[KDS] post-completion handling failed', err);
                }

                playNotificationSound('orderCompleted');
            } else {
                // Just update the items
                await sdk.db.collection("Orders").doc(orderId).update({
                    items: updatedItems
                });
            }
        } catch (error) {
            console.error('Error marking item completed:', error);
        }
    };

    // Update item quantity (when changed from POS)
    const updateItemQuantity = async (orderId, itemIndex, newQuantity) => {
        try {
            const order = activeOrders.find(o => o.id === orderId);
            if (!order) return;

            const updatedItems = [...order.items];
            
            // Update the quantity for this item
            if (updatedItems[itemIndex]) {
                updatedItems[itemIndex] = {
                    ...updatedItems[itemIndex],
                    qnt: newQuantity
                };
            }

            // Update the items in the database
            await sdk.db.collection("Orders").doc(orderId).update({
                items: updatedItems
            });
        } catch (error) {
            console.error('Error updating item quantity:', error);
        }
    };

    // Filter orders to show pending orders and completed but not yet checked out orders
    const filteredOrders = activeOrders.filter(order => {
        // Show orders that are in KITCHEN status and have items
        if (!order.items || order.items.length === 0) return false;
        
        // Show orders that are not yet completed (have pending items)
        const hasPendingItems = order.items.some(item => {
            const completed = item.completed || 0;
            const quantity = item.qnt || 0;
            return quantity > completed;
        });
        
        // Show orders that are completed but not yet paid/checked out
        const isCompletedButNotPaid = order.currentStatus?.label === "COMPLETED" && !order.paid;
        
        // Show orders that are still in KITCHEN status
        const isInKitchen = order.currentStatus?.label === "KITCHEN";
        
        return hasPendingItems || isCompletedButNotPaid || isInKitchen;
    });

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <h1 className="text-3xl font-bold text-gray-800">
                            <i className="ph ph-cooking-pot text-red-500 mr-3"></i>
                            Kitchen Display System
                        </h1>
                        <div className="text-sm text-gray-500">
                            {new Date().toLocaleTimeString('en-GB')}
                        </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                        {/* Settings */}
                        <button
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className={`p-2 rounded-lg transition-colors ${
                                soundEnabled 
                                    ? 'bg-green-100 text-green-600' 
                                    : 'bg-gray-100 text-gray-400'
                            }`}
                            title={soundEnabled ? 'Sound On' : 'Sound Off'}
                        >
                            <i className={`ph ${soundEnabled ? 'ph-speaker-high' : 'ph-speaker-slash'} text-xl`}></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Orders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {filteredOrders.map((order) => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        onItemComplete={markItemCompleted}
                        onUpdateItemQuantity={updateItemQuantity}
                        showKitchenNotes={showKitchenNotes}
                    />
                ))}
            </div>

            {/* No Orders Message */}
            {filteredOrders.length === 0 && (
                <div className="text-center py-12">
                    <i className="ph ph-cooking-pot text-6xl text-gray-300 mb-4"></i>
                    <h3 className="text-xl font-medium text-gray-500 mb-2">No Pending Orders</h3>
                    <p className="text-gray-400">All caught up! Kitchen is clear.</p>
                </div>
            )}
        </div>
    );
}

// Order Card Component
function OrderCard({ order, onItemComplete, showKitchenNotes }) {
    const [timeElapsed, setTimeElapsed] = useState(0);

    // Calculate time elapsed since order was placed
    useEffect(() => {
        const interval = setInterval(() => {
            const orderTime = order.date?.toDate?.() || new Date(order.date);
            const elapsed = Math.floor((Date.now() - orderTime) / 1000 / 60); // minutes
            setTimeElapsed(elapsed);
        }, 1000);

        return () => clearInterval(interval);
    }, [order.date]);

    const getTimeColor = (minutes) => {
        if (minutes < 15) return 'text-green-600';
        if (minutes < 30) return 'text-yellow-600';
        return 'text-red-600';
    };

    const pendingItems = order.items.filter(item => !item.served);
    const completedItems = order.items.filter(item => item.served);

    return (
        <div className="bg-white rounded-lg shadow-sm border-l-4 border-blue-500 overflow-hidden">
            {/* Order Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                        <span className="text-2xl font-bold">T{order.tableNo || 'N/A'}</span>
                        <span className="text-sm opacity-90">#{order.billNo}</span>
                    </div>
                    <div className="text-right">
                        <div className="text-sm opacity-90">
                            {order.date?.toDate?.()?.toLocaleTimeString('en-GB') || 
                             new Date(order.date).toLocaleTimeString('en-GB')}
                        </div>
                        <div className={`text-lg font-bold ${getTimeColor(timeElapsed)}`}>
                            {timeElapsed}m
                        </div>
                    </div>
                </div>
                
                {order.customer?.name && (
                    <div className="text-sm opacity-90">
                        <i className="ph ph-user mr-2"></i>
                        {order.customer.name}
                    </div>
                )}

                {showKitchenNotes && order.notes && (
                    <div className="mt-2 p-2 bg-blue-400 bg-opacity-30 rounded text-sm">
                        <i className="ph ph-note-pencil mr-2"></i>
                        {order.notes}
                    </div>
                )}
            </div>

            {/* Order Items */}
            <div className="p-4">
                <div className="space-y-3">
                    {order.items.map((item, index) => (
                        <div
                            key={index}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                                item.served 
                                    ? 'bg-green-50 border-green-200' 
                                    : 'bg-gray-50 border-gray-200'
                            }`}
                        >
                            <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                    <span className="font-medium text-gray-800">
                                        {item.title}
                                    </span>
                                    {item.served && (
                                        <span className="text-green-600 text-sm font-medium">
                                            ✓ Completed
                                        </span>
                                    )}
                                </div>
                                
                                <div className="text-sm text-gray-600 mt-1">
                                    <span className="mr-3">Qty: {item.qnt}</span>
                                    {item.variantName && (
                                        <span className="mr-3">Variant: {item.variantName}</span>
                                    )}
                                    {item.addons && item.addons.length > 0 && (
                                        <span>Add-ons: {item.addons.map(a => a.name).join(', ')}</span>
                                    )}
                                </div>

                                {item.notes && (
                                    <div className="text-sm text-orange-600 mt-1 italic">
                                        <i className="ph ph-note-pencil mr-1"></i>
                                        {item.notes}
                                    </div>
                                )}
                            </div>

                            {!item.served && (
                                <button
                                    onClick={() => onItemComplete(order.id, index)}
                                    className="ml-4 p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                    title="Mark as completed"
                                >
                                    <i className="ph ph-check text-lg"></i>
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Order Summary */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between text-sm text-gray-600">
                        <span>Total Items: {order.items.length}</span>
                        <span>Pending: {pendingItems.length}</span>
                        <span>Completed: {completedItems.length}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}