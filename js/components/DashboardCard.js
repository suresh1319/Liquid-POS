// Dashboard Card Component
export default function DashboardCard({ icon, title, value, trend, color = 'primary', compact = false, className = '', language = 'en' }) {
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DashboardCard] title: ${title}`);
        console.log(`[DashboardCard] language: ${language}`);
    }
    // Set background and icon color classes based on the color prop
    let bgClass = 'bg-gradient-to-br from-warm-bg to-white';
    let iconColorClass = 'text-red-500';
    let iconBgClass = 'from-red-50 to-white/80';

    if (color === 'primary') {
        bgClass = 'bg-gradient-to-br from-warm-bg to-white';
        iconColorClass = 'text-red-500';
        iconBgClass = 'from-red-50 to-white/80';
    } else if (color === 'success') {
        bgClass = 'bg-gradient-to-br from-green-50 to-white';
        iconColorClass = 'text-green-500';
        iconBgClass = 'from-green-50 to-white/80';
    } else if (color === 'info') {
        bgClass = 'bg-gradient-to-br from-blue-50 to-white';
        iconColorClass = 'text-blue-500';
        iconBgClass = 'from-blue-50 to-white/80';
    } else if (color === 'warning') {
        bgClass = 'bg-gradient-to-br from-orange-50 to-white';
        iconColorClass = 'text-orange-500';
        iconBgClass = 'from-orange-50 to-white/80';
    }

    // Determine if trend is positive or negative
    const trendIsPositive = trend && trend.includes('+');
    const trendColor = trendIsPositive ? 'text-green-500' : 'text-red-500';
    const trendIcon = trendIsPositive ? 'ph-trend-up' : 'ph-trend-down';

    // Render compact version for mobile
    if (compact) {
        return (
            <div className={`${bgClass} rounded-xl p-3 shadow-sm border border-gray-200 hover:shadow-md transition-all h-full flex flex-col ${className}`}>
                <div className="flex items-center justify-between">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${iconBgClass} flex items-center justify-center shadow-sm flex-shrink-0`}>
                        <i className={`ph ${icon} ${iconColorClass}`}></i>
                    </div>
                    {trend && (
                        <div className={`text-sm ${trendColor} flex items-center`}>
                            <i className={`ph ${trendIcon} mr-0.5`}></i>
                            {trend}
                        </div>
                    )}
                </div>
                <div className="mt-2">
                    <div className="text-xl font-bold text-gray-800 leading-tight line-clamp-1">{value}</div>
                    <div className="text-xs text-gray-500 line-clamp-1 mt-1" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{title}</div>
                </div>
            </div>
        );
    }

    // Render standard version
    return (
        <div className={`${bgClass} rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition-all h-full flex flex-col ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-500 truncate max-w-[70%]" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{title}</h3>
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${iconBgClass} flex items-center justify-center shadow-sm`}>
                    <i className={`ph ${icon} text-lg ${iconColorClass}`}></i>
                </div>
            </div>
            <div className="flex items-end justify-between mt-auto">
                <div className="text-2xl font-bold text-gray-800 truncate max-w-[70%]">{value}</div>
                {trend && (
                    <div className={`text-sm font-medium ${trendColor} flex items-center bg-gradient-to-r from-gray-50 to-white px-2 py-0.5 rounded-full shadow-sm`}>
                        <i className={`ph ${trendIcon} text-xs mr-1`}></i>
                        {trend}
                    </div>
                )}
            </div>
        </div>
    );
}

// Dashboard Tile Component
function DashboardTile({ tableId, variant, orders, onTap, onLongPress }) {
    // Find the oldest order for this table/variant
    const lastPlacedDate = orders.length > 0
        ? orders.map(o => o.currentStatus?.date).reduce((a, b) => {
            const dateA = parseDate(a);
            const dateB = parseDate(b);
            return dateA && dateB && dateA < dateB ? a : b;
        }, orders[0].currentStatus?.date)
        : null;

    // Get duration object from the getTimeDuration function
    const duration = lastPlacedDate ? getTimeDuration(lastPlacedDate) : null;

    // Get color based on time elapsed
    const getColor = (duration) => {
        if (!duration) return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-card-bg to-white'
        };

        const minutes = duration.minutes;

        if (minutes > 30) return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-red-50 to-white'
        };
        if (minutes > 15) return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-orange-50 to-white'
        };
        return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-green-50 to-white'
        };
    };

    // Special colors for aggregator tables
    const getAggregatorColor = (id) => {
        if (id === 'zomato') return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-red-50 to-white'
        };
        if (id === 'swiggy') return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-orange-50 to-white'
        };
        if (id === 'default') return {
            border: 'border-gray-200',
            gradient: 'bg-gradient-to-br from-card-bg to-white'
        };
        return null;
    };

    // Determine if this is an aggregator table
    const isAggregator = ['zomato', 'swiggy', 'default'].includes(tableId);

    // Get the appropriate color
    const aggregatorColor = isAggregator ? getAggregatorColor(tableId) : null;
    const colorStyle = aggregatorColor || getColor(duration);

    const message = orders.length > 0
        ? `${orders.length} order${orders.length > 1 ? 's' : ''}`
        : 'No orders';

    // Display duration if available
    const durationDisplay = duration ? duration.display : '';

    // Get appropriate icon for aggregator
    const getAggregatorIcon = (id) => {
        if (id === 'zomato') return 'ph-pizza';
        if (id === 'swiggy') return 'ph-bicycle';
        return 'ph-globe';
    };

    // Get appropriate color for icon
    const getIconColor = (id) => {
        if (id === 'zomato') return 'text-red-500';
        if (id === 'swiggy') return 'text-orange-500';
        return 'text-gray-500';  // Changed from blue to gray for default
    };

    return (
        <div
            className={`${colorStyle.gradient} rounded-xl p-4 shadow-section overflow-hidden cursor-pointer border ${colorStyle.border} hover:shadow-md transition-all h-full flex flex-col`}
            onClick={() => onTap && onTap()}
            onContextMenu={(e) => {
                e.preventDefault();
                onLongPress && onLongPress();
            }}
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold truncate max-w-[70%]">
                    {isAggregator ? tableId.charAt(0).toUpperCase() + tableId.slice(1) : (tableId || variant || "Default")}
                </h3>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white to-white/80 flex items-center justify-center shadow-sm">
                    {isAggregator ? (
                        <i className={`ph ${getAggregatorIcon(tableId)} ${getIconColor(tableId)} text-lg`}></i>
                    ) : (
                        <i className="ph ph-layout text-red-500 text-lg"></i>
                    )}
                </div>
            </div>

            <div className="mt-auto">
                <div className={`text-sm font-medium px-3 py-1.5 rounded-full mb-2 inline-flex items-center ${orders.length > 0 ? 'bg-gradient-to-r from-red-100 to-red-50 text-red-600' : 'bg-gradient-to-r from-gray-100 to-gray-50 text-gray-500'}`}>
                    {orders.length > 0 ? (
                        <i className="ph ph-shopping-bag text-xs mr-1.5"></i>
                    ) : (
                        <i className="ph ph-tray-empty text-xs mr-1.5"></i>
                    )}
                    {message}
                </div>

                {duration && orders.length > 0 && (
                    <div className="text-xs bg-gradient-to-r from-gray-100 to-gray-50 px-2 py-1 rounded-full inline-flex items-center">
                        <i className="ph ph-clock text-red-500 text-xs mr-1"></i>
                        {durationDisplay}
                    </div>
                )}
            </div>
        </div>
    );
} 