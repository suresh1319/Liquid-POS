import { useState, useMemo } from 'react';
import OrderHeader from './OrderHeader.jsx';
import ItemRow from './ItemRow.jsx';

export default function OrderCard({ 
    order, 
    onItemComplete, 
    onUpdateItemQuantity,
    showKitchenNotes 
}) {
    // Group items by product ID and variant ID to consolidate duplicates
    const groupedItems = useMemo(() => {
        const groups = {};
        
        order.items.forEach((item, index) => {
            // Create a unique key for each product/variant combination
            const key = `${item.pid}-${item.variantId || 'no-variant'}`;
            
            if (!groups[key]) {
                // Calculate initial completed and pending counts
                const completed = item.completed || 0;
                const totalQuantity = item.qnt || 0;
                const pending = Math.max(0, totalQuantity - completed);
                
                groups[key] = {
                    ...item,
                    indices: [index], // Track all indices for this group
                    totalQuantity: totalQuantity,
                    completed: completed,
                    pending: pending
                };
            } else {
                // Consolidate quantities for the same product/variant
                const newTotalQuantity = groups[key].totalQuantity + (item.qnt || 0);
                const newCompleted = groups[key].completed + (item.completed || 0);
                // Ensure completed count doesn't exceed total quantity
                const adjustedCompleted = Math.min(newCompleted, newTotalQuantity);
                const newPending = Math.max(0, newTotalQuantity - adjustedCompleted);
                
                groups[key].totalQuantity = newTotalQuantity;
                groups[key].completed = adjustedCompleted;
                groups[key].pending = newPending;
                groups[key].indices.push(index);
            }
        });
        
        // Convert to array and add index for rendering
        return Object.values(groups).map((group, index) => ({
            ...group,
            renderIndex: index
        }));
    }, [order.items]);

    const handleMarkCompleted = (orderId, itemIndex, newCompleted, newPending) => {
        // Find the original item indices for this group
        const item = order.items[itemIndex];
        const key = `${item.pid}-${item.variantId || 'no-variant'}`;
        
        const group = groupedItems.find(g => 
            `${g.pid}-${g.variantId || 'no-variant'}` === key
        );
        
        if (group) {
            // Update all instances of this item in the order
            group.indices.forEach(index => {
                onItemComplete(orderId, index, newCompleted, newPending);
            });
        }
    };

    const pendingItems = groupedItems.filter(item => item.pending > 0);
    const completedItems = groupedItems.filter(item => item.pending === 0);

    return (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Order Header */}
            <OrderHeader order={order} showKitchenNotes={showKitchenNotes} />
            
            {/* Order Instructions */}
            {showKitchenNotes && order.instructions && (
                <div className="px-3 pt-2">
                    <div className="bg-orange-50 border border-orange-200 rounded-md p-2.5 mb-2.5">
                        <div className="flex items-start space-x-1.5">
                            <i className="ph ph-note-pencil text-orange-500 mt-0.5 text-sm"></i>
                            <div>
                                <div className="text-xs font-medium text-orange-800 mb-0.5">Order Instructions</div>
                                <div className="text-xs text-orange-700">{order.instructions}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Order Items */}
            <div className="p-3">
                <div className="space-y-2.5">
                    {groupedItems.map((item) => (
                        <ItemRow
                            key={`${order.id}-${item.renderIndex}`}
                            item={item}
                            orderId={order.id}
                            itemIndex={item.indices[0]} // Use first index for reference
                            onMarkCompleted={handleMarkCompleted}
                            onUpdateQuantity={onUpdateItemQuantity}
                        />
                    ))}
                </div>

                {/* Order Summary */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>Total Items: {groupedItems.length}</span>
                        <span>Pending: {pendingItems.length}</span>
                        <span>Completed: {completedItems.length}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}