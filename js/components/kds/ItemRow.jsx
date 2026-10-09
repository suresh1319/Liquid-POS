import { useState, useEffect } from 'react';

export default function ItemRow({ 
    item, 
    orderId, 
    itemIndex, 
    onMarkCompleted, 
    onUpdateQuantity 
}) {
    // Calculate pending and completed counts
    const [pending, setPending] = useState(Math.max(0, (item.totalQuantity || item.qnt || 0) - (item.completed || 0)));
    const [completed, setCompleted] = useState(item.completed || 0);

    // Update counts when item changes
    useEffect(() => {
        const totalQuantity = item.totalQuantity || item.qnt || 0;
        const completedCount = item.completed || 0;
        setPending(Math.max(0, totalQuantity - completedCount));
        setCompleted(completedCount);
    }, [item.totalQuantity, item.qnt, item.completed]);

    const handleMarkCompleted = () => {
        if (pending > 0) {
            const newCompleted = completed + 1;
            const newPending = pending - 1;
            
            setCompleted(newCompleted);
            setPending(newPending);
            
            // Call the parent handler to update in database
            onMarkCompleted(orderId, itemIndex, newCompleted, newPending);
        }
    };

    return (
        <div className={`flex items-center justify-between p-2.5 rounded-md border ${
            pending === 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
        }`}>
            <div className="flex-1">
                <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-800 text-sm">
                        {item.title}
                    </span>
                    {pending === 0 && (
                        <span className="text-green-600 text-xs font-medium">
                            ✓ Completed
                        </span>
                    )}
                </div>
                
                <div className="text-xs text-gray-600 mt-1">
                    <span className="mr-2 text-yellow-600 font-medium">Pending: {pending}</span>
                    <span className="text-green-600 font-medium">Completed: {completed}</span>
                    {item.variantName && (
                        <span className="block mt-1">Variant: {item.variantName}</span>
                    )}
                    {item.addons && item.addons.length > 0 && (
                        <span className="block mt-1">Add-ons: {item.addons.map(a => a.name).join(', ')}</span>
                    )}
                </div>

                {item.notes && (
                    <div className="text-xs text-orange-600 mt-1 italic">
                        <i className="ph ph-note-pencil mr-1 text-xs"></i>
                        {item.notes}
                    </div>
                )}
            </div>

            <button
                onClick={handleMarkCompleted}
                disabled={pending === 0}
                className={`ml-3 p-1.5 rounded-md transition-colors ${
                    pending === 0 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-green-500 text-white hover:bg-green-600'
                }`}
                title={pending === 0 ? "All items completed" : "Mark as completed"}
            >
                <i className="ph ph-check text-base"></i>
            </button>
        </div>
    );
}