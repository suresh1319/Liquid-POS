import { useState, useEffect } from 'react';

export default function OrderHeader({ order, showKitchenNotes }) {
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

    // Determine the correct order source name to display
    const getOrderSourceName = () => {
        // If it's a table order, show the table ID
        if (order.tableId) {
            return order.tableId;
        }
        // If it's a channel order, show the price variant or default to 'Default'
        return order.priceVariant || 'Default';
    };

    return (
        <div className="bg-white text-gray-800 p-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2.5">
                    <span className="text-xl font-bold">
                        {getOrderSourceName()}
                    </span>
                    <span className="text-xs text-gray-500">#{order.billNo}</span>
                </div>
                <div className="text-right">
                    <div className="text-xs text-gray-500">
                        {order.date?.toDate?.()?.toLocaleTimeString() || 
                         new Date(order.date).toLocaleTimeString()}
                    </div>
                    <div className={`text-base font-bold ${getTimeColor(timeElapsed)}`}>
                        {timeElapsed}m
                    </div>
                </div>
            </div>
            
            {order.customer?.name && (
                <div className="text-xs text-gray-600">
                    <i className="ph ph-user text-xs mr-1.5"></i>
                    {order.customer.name}
                </div>
            )}
        </div>
    );
}