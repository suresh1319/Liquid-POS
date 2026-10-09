import { useState, useRef, useEffect, useCallback } from 'react';
import DashboardCard from '../components/DashboardCard.js';
import { TableCard } from '../components/TableCard.js';
import { AddTableModal, RenameRoomModal } from '../components/Modals.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { useOrders } from '../contexts/OrderContext.js';
import { ModalManager } from '../components/ModalManager.js';
import { parseDate, getTimeDuration } from '../utils.js';
import { showToast } from '../utils/toast.js';
import { UserSession } from '../utils/UserSession.js';
import { OrderRoom } from '../components/Modals.js';
import { sdk } from '../sdk.js';
import { appendCustomerPayment } from '../utils/CustomerSync.js';
import { OrderGroupTile } from '../components/TableCard.js';
import { ChargesCalculator } from '../utils/ChargesCalculator.js';
import { BluetoothPrinting } from '../utils/BluetoothPrinting.js';
import { OrderStatus } from '../models/OrderStatus.js';
import { QrOrderAssignmentModal } from '../components/Modals.js';
import { PrintTemplate } from '../utils/PrintTemplate.js';
import { getDefaultBillTemplate, getDefaultKOTTemplate } from '../utils/PrintTemplate.js';
import { useLanguage } from '../contexts/LanguageContext.js';

// Dashboard Component
export default function Dashboard() {
    const { t, language } = useLanguage();
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Dashboard] language: ${language}`);
        console.log(`[Dashboard] dashboard translation: ${t('dashboard')}`);
        console.log(`[Dashboard] todayOrders translation: ${t('todayOrders')}`);
        console.log(`[Dashboard] todayRevenue translation: ${t('todayRevenue')}`);
        console.log(`[Dashboard] newCustomers translation: ${t('newCustomers')}`);
        console.log(`[Dashboard] avgOrderValue translation: ${t('avgOrderValue')}`);
        console.log(`[Dashboard] avgServiceTime translation: ${t('avgServiceTime')}`);
        console.log(`[Dashboard] addTable translation: ${t('addTable')}`);
        console.log(`[Dashboard] todaySummary translation: ${t('todaySummary')}`);
        console.log(`[Dashboard] orderChannels translation: ${t('orderChannels')}`);
        console.log(`[Dashboard] diningTables translation: ${t('diningTables')}`);
        console.log(`[Dashboard] loadingOrders translation: ${t('loadingOrders')}`);
        console.log(`[Dashboard] loadingTables translation: ${t('loadingTables')}`);
        console.log(`[Dashboard] noTablesAdded translation: ${t('noTablesAdded')}`);
    }
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Dashboard] language: ${language}`);
    }
    const { profile: seller, tables: profileTables } = useProfile ? useProfile() : { profile: null, tables: [] };
    const {
        activeOrders,
        isLoading,
        getOrdersForSource
    } = useOrders ? useOrders() : {
        activeOrders: [],
        completedOrders: [],
        isLoading: true,
        error: null,
        getOrdersByTableAndChannel: () => ({ tableOrders: {}, channelOrders: {} }),
        loadCompletedOrders: () => { },
        getOrdersForSource: () => []
    };

    const [error, setError] = useState(null);
    const [showCompletedOrders, setShowCompletedOrders] = useState(false);
    const [qrOrders, setQrOrders] = useState([]);
    const [loadingQrOrders, setLoadingQrOrders] = useState(true);
    const [errorQrOrders, setErrorQrOrders] = useState(null);
    const [loadedItemCount, setLoadedItemCount] = useState(50); // Initially load 50 items
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const qrOrdersScrollRef = useRef(null);
    const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false);
    const [isRenameRoomModalOpen, setIsRenameRoomModalOpen] = useState(false);
    const [selectedTableId, setSelectedTableId] = useState(null);
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [orders, setOrders] = useState([]);
    const [kitchenOrders, setKitchenOrders] = useState([]); // New state for KITCHEN orders only
    const [loadingCompletedOrders, setLoadingCompletedOrders] = useState(true);
    const [errorCompletedOrders, setErrorCompletedOrders] = useState(null);
    const [isOrderRoomOpen, setIsOrderRoomOpen] = useState(false);
    const [selectedRoomTableId, setSelectedRoomTableId] = useState(null);
    const [selectedRoomVariant, setSelectedRoomVariant] = useState(null);
    const [showQrAssignmentModal, setShowQrAssignmentModal] = useState(false);
    const [selectedQrOrder, setSelectedQrOrder] = useState(null);
    const [availableTables, setAvailableTables] = useState([]);
    const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' or 'settings'
    const [dashboardMetrics, setDashboardMetrics] = useState({
        todayOrders: 0,
        todayRevenue: 0,
        newCustomers: 0,
        avgOrderValue: 0,
        avgServiceTime: 0,
        todayOrdersTrend: 0,
        todayRevenueTrend: 0,
        newCustomersTrend: 0,
        avgOrderValueTrend: 0,
        avgServiceTimeTrend: 0
    });

    // Computed state for tables and channels
    const [tables, setTables] = useState([]);
    const [channels, setChannels] = useState([]);

    // State for date filtering in completed orders
    const [dateFilter, setDateFilter] = useState('7days'); // Options: today, yesterday, 7days, custom
    const [customDateRange, setCustomDateRange] = useState({
        startDate: null,
        endDate: null
    });

    // Add a state to store unsubscribe functions
    const [kitchenOrdersUnsubscribe, setKitchenOrdersUnsubscribe] = useState(null);
    const [completedOrdersUnsubscribe, setCompletedOrdersUnsubscribe] = useState(null);

    // Add state for the unsubscribe function
    const [placedOrdersUnsubscribe, setPlacedOrdersUnsubscribe] = useState(null);

    // State for today's orders data
    const [todaysOrdersData, setTodaysOrdersData] = useState({
        all: [],
        placed: [],
        kitchen: [],
        completed: [],
        totalCount: 0,
        totalValue: 0,
        lastUpdated: null
    });

    // Standardized order total calculation function
    const calculateOrderTotal = (order) => {
        // Use the same calculation logic as CheckoutSheet for consistency
        const subtotal = (order.items || []).reduce((sum, item) => {
            const price = Number(item.price) || 0;
            const quantity = Number(item.quantity || item.qnt || 1);
            return sum + (price * quantity);
        }, 0);
        
        // Apply discount
        const discount = Number(order.discount) || 0;
        
        // Calculate charges using ChargesCalculator for consistency
        if (ChargesCalculator && order.charges) {
            const calculation = ChargesCalculator.calculateCharges(
                subtotal, 
                order.charges
            );
            return calculation.finalAmount;
        }
        
        // Fallback calculation
        const subtotalAfterDiscount = Math.max(0, subtotal - discount);
        let finalTotal = subtotalAfterDiscount;
        
        if (order.charges && Array.isArray(order.charges)) {
            order.charges.forEach(charge => {
                if (!charge.inclusive) {
                    if (charge.type === 'percentage') {
                        const percentage = parseFloat(charge.value) || 0;
                        finalTotal += (subtotalAfterDiscount * percentage) / 100;
                    } else {
                        finalTotal += parseFloat(charge.value) || 0;
                    }
                }
            });
        }
        
        return finalTotal;
    };

    // Unified function to fetch all today's orders regardless of status
    const fetchTodaysOrders = async () => {
        try {
            const now = new Date();
            // Use UTC start of day to avoid timezone issues
            const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            
            console.log('[Dashboard] Debug - Fetching today\'s orders from:', startOfToday.toISOString());
            
            // Fetch ALL orders created today (by creation date)
            const createdTodayQuery = sdk.db.collection("Orders")
                .where("date", ">=", startOfToday)
                .orderBy("date", "desc");

            const [createdSnapshot, statusSnapshot] = await Promise.all([
                createdTodayQuery.get(),
                // Also fetch orders whose currentStatus.date (completion timestamp) is today
                sdk.db.collection("Orders").where("currentStatus.date", ">=", startOfToday).get()
            ]);

            const createdTodayOrders = createdSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: parseDate(doc.data().date)
            }));

            const statusDateOrders = statusSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Ensure we still set a date field for ordering; prefer currentStatus.date when available
                date: parseDate(doc.data().currentStatus?.date || doc.data().date)
            }));

            // Merge both lists, dedupe by id (prefer createdTodayOrders data when duplicate)
            const mergedById = new Map();
            createdTodayOrders.forEach(o => mergedById.set(o.id, o));
            statusDateOrders.forEach(o => { if (!mergedById.has(o.id)) mergedById.set(o.id, o); });

            const todaysOrders = Array.from(mergedById.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Separate by status for different UI sections
            const placedOrders = todaysOrders.filter(order => 
                order.currentStatus?.label === OrderStatus.PLACED
            );
            
            const kitchenOrders = todaysOrders.filter(order => 
                order.currentStatus?.label === 'KITCHEN'
            );
            
            const completedOrders = todaysOrders.filter(order => {
                const hasCompletedStatus = order.currentStatus?.label === OrderStatus.COMPLETED;
                const isPaidOrder = order.paid === true;
                const isCompleted = hasCompletedStatus || isPaidOrder;
                
                if (isCompleted) {
                    console.log('[Dashboard] Found completed order:', {
                        id: order.id,
                        currentStatus: order.currentStatus?.label,
                        paid: order.paid,
                        date: order.date?.toISOString()
                    });
                }
                
                return isCompleted;
            });
            
            return {
                all: todaysOrders,
                placed: placedOrders,
                kitchen: kitchenOrders,
                completed: completedOrders
            };
            
        } catch (error) {
            console.error('Error fetching today\'s orders:', error);
            throw error;
        }
    };

    // Add validation function to cross-check data accuracy

    // Sync today's orders function - made accessible throughout component
    const syncTodaysOrders = useCallback(async () => {
        try {
            const todaysData = await fetchTodaysOrders();
            
            // Calculate total value using standardized function
            const totalValue = todaysData.all.reduce((sum, order) => 
                sum + calculateOrderTotal(order), 0
            );
            
            setTodaysOrdersData({
                ...todaysData,
                totalCount: todaysData.all.length,
                totalValue: totalValue,
                lastUpdated: new Date()
            });
            
            // Update existing states for backward compatibility
            setQrOrders(todaysData.placed);
            setKitchenOrders(todaysData.kitchen);
            
            // Update dashboard metrics using accurate today's orders data
            const metrics = calculateDashboardMetrics(todaysData.all);
            setDashboardMetrics(metrics);
            
            if (process.env.NODE_ENV === 'development') {
                console.log(`[Today's Orders Sync] Total: ${todaysData.all.length}, Value: ₹${totalValue.toFixed(2)}`);
                console.log(`[Today's Orders Sync] Updated dashboard metrics with accurate data`);
            }
            
        } catch (error) {
            console.error('Error syncing today\'s orders:', error);
        }
    }, []);

    // Add refreshTables function to window object
    useEffect(() => {
        // Function to refresh tables UI
        window.refreshTables = () => {
            // Force re-render of tables from profile
            if (profileTables && profileTables.length > 0) {
                setTables((prevTables) => {
                    // Merge profile tables with any dynamic tables that might exist
                    const dynamicTables = prevTables.filter(t =>
                        t.section === 'dynamic' && !profileTables.some(pt => pt.title === t.id)
                    );
                    return [...profileTables, ...dynamicTables];
                });
            }
        };

        // Expose setupKitchenOrdersListener to window object
        window.setupKitchenOrdersListener = setupKitchenOrdersListener;

        // Clean up
        return () => {
            window.refreshTables = null;
            window.setupKitchenOrdersListener = null;
        };
    }, [profileTables]);

    // useEffect to fetch and sync today's orders
    useEffect(() => {
        if (!seller) return;
        
        // Initial fetch
        syncTodaysOrders();
        
        // Set up real-time listener for today's orders
        const now = new Date();
        const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        
        const unsubscribeCreated = sdk.db.collection("Orders")
            .where("date", ">=", startOfToday)
            .onSnapshot(() => {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Today\'s Orders] Real-time update (created) triggered');
                }
                syncTodaysOrders();
            });

        // Also listen for orders whose completion status date was updated today
        const unsubscribeStatusDate = sdk.db.collection("Orders")
            .where("currentStatus.date", ">=", startOfToday)
            .onSnapshot(() => {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Today\'s Orders] Real-time update (status.date) triggered');
                }
                syncTodaysOrders();
            });

        return () => {
            try { unsubscribeCreated(); } catch (e) { /* ignore */ }
            try { unsubscribeStatusDate(); } catch (e) { /* ignore */ }
        };
    }, [seller, syncTodaysOrders]);

    // Get the OrderContext data to update tables and channels
    useEffect(() => {
        // Require seller to be present
        if (!seller) return;

        // Prefer real-time active orders (faster), fallback to today's snapshot
        const realtimeKitchen = (activeOrders || []).filter(o =>
            o?.currentStatus?.label === 'KITCHEN' && Array.isArray(o?.items) && o.items.length > 0
        );
        const relevantOrders = realtimeKitchen.length > 0 ? realtimeKitchen : (todaysOrdersData.kitchen || []);

        if (process.env.NODE_ENV === 'development') {
            console.log(`[Kitchen useEffect] Processing ${relevantOrders.length} KITCHEN orders (source: ${realtimeKitchen.length > 0 ? 'realtime' : 'today-snapshot'})...`);
            console.log(`[Kitchen useEffect] Kitchen orders:`, relevantOrders);
        }

        try {

            // --- Manual Grouping Logic ---
            const tableOrdersMap = {};
            const channelOrdersMap = {};

            relevantOrders.forEach(order => {
                // Filter out orders without items
                if (!order.items || order.items.length === 0) return;

                // Extract values and check if they are valid (not null, undefined, or empty string)
                const tableId = order.tableId || null;
                const priceVariant = order.priceVariant || null;

                const hasValidTableId = tableId !== null && tableId !== undefined && tableId !== '';
                // Consider "Default" as a valid priceVariant that should go to Default channel
                const isDefaultVariant = priceVariant === 'Default' || priceVariant === '⚡Default';
                const hasValidPriceVariant = priceVariant !== null && priceVariant !== undefined && priceVariant !== '' && !isDefaultVariant;

                // Log every order processing for debugging (development only)
                if (process.env.NODE_ENV === 'development') {
                console.log(`[Dashboard Grouping] Order ID: ${order.id}, HasTableID: ${hasValidTableId}, HasPriceVariant: ${hasValidPriceVariant}, IsDefaultVariant: ${isDefaultVariant}`);
                console.log(`  TableID: '${tableId || ''}' (${typeof tableId}), PriceVariant: '${priceVariant || ''}' (${typeof priceVariant})`);
                }

                // 1. Handle table assignments first - if there's a valid tableId
                if (hasValidTableId) {
                    if (!tableOrdersMap[tableId]) {
                        tableOrdersMap[tableId] = [];
                    }
                    tableOrdersMap[tableId].push(order);
                    if (process.env.NODE_ENV === 'development') {
                    console.log(`[Dashboard Grouping]   Assigned to Table: ${tableId}`);
                    }
                }
                // 2. Handle specific non-Default price variant channels (if no tableId and variant is meaningful)
                else if (hasValidPriceVariant) {
                    if (!channelOrdersMap[priceVariant]) {
                        channelOrdersMap[priceVariant] = [];
                    }
                    channelOrdersMap[priceVariant].push(order);
                    if (process.env.NODE_ENV === 'development') {
                    console.log(`[Dashboard Grouping]   Assigned to Channel: ${priceVariant}`);
                    }
                }
                // 3. Handle Default channel for both cases:
                //    - orders explicitly marked with Default variant
                //    - orders without any tableId or meaningful priceVariant
                else {
                    if (!channelOrdersMap['Default']) {
                        channelOrdersMap['Default'] = [];
                    }
                    channelOrdersMap['Default'].push(order);

                    if (process.env.NODE_ENV === 'development') {
                    if (isDefaultVariant) {
                        console.log(`[Dashboard Grouping]   Assigned to Channel: Default (Explicitly marked as Default)`);
                    } else {
                        console.log(`[Dashboard Grouping]   Assigned to Channel: Default (No tableId or priceVariant)`);
                        }
                    }
                }
            });
            // --- End Manual Grouping Logic --- 

            // Summarize the final assignment counts (development only)
            if (process.env.NODE_ENV === 'development') {
            console.log(`[Dashboard Grouping Summary] Final assignments:`);
            console.log(`  - Total orders processed: ${relevantOrders.length}`);
            console.log(`  - Tables: ${Object.keys(tableOrdersMap).length} tables with orders`);
            console.log(`  - Channels: ${Object.keys(channelOrdersMap).length} channels with orders`);
            if (channelOrdersMap['Default']) {
                console.log(`  - Default channel: ${channelOrdersMap['Default'].length} orders`);
            } else {
                console.log(`  - Default channel: Not created (no orders)`);
                }
            }

            // Get price variants from seller profile
            const variants = (seller?.variants || [])
                .map(v => v.title)
                .filter(Boolean);

            // Also collect unique price variants from orders
            const orderPriceVariants = new Set();
            relevantOrders.forEach(order => {
                if (order.priceVariant && order.priceVariant !== '') {
                    orderPriceVariants.add(order.priceVariant);
                }
            });

            // Combine both sources
            const allPriceVariants = [...new Set([...variants, ...orderPriceVariants])];

            // Always ensure we have a Default variant for channel creation
            if (!allPriceVariants.includes('Default')) {
                allPriceVariants.unshift('Default');
            }

            // Log all variants
            console.log(`[Dashboard] Price variants from profile: ${variants.join(', ')}`);
            console.log(`[Dashboard] Price variants from orders: ${[...orderPriceVariants].join(', ')}`);
            console.log(`[Dashboard] Combined price variants: ${allPriceVariants.join(', ')}`);

            // Create channel definitions based on all defined price variants
            const normalizedNames = new Set();
            const orderChannels = [];

            allPriceVariants.forEach(variant => {
                const normalizedName = variant.toLowerCase();
                if (!normalizedNames.has(normalizedName)) {
                    normalizedNames.add(normalizedName);
                    orderChannels.push({
                        id: variant, // Use the variant title as ID
                        title: variant,
                        type: 'price_variant',
                        isChannel: true
                    });
                }
            });

            // Convert seller tables to the format we need
            const formattedTables = (seller?.tables || []).map(table => ({
                id: table.id || table.title, // Use title as fallback id
                title: table.title,
                desc: table.desc,
                type: table.type || 'dine_in',
                section: table.section || 'main', // Provide a default section
                isTable: true
            }));

            // Also collect unique tableIds from orders that are not in the seller profile
            const profileTableIds = new Set(formattedTables.map(table => table.id));
            const orderTableIds = new Set();

            relevantOrders.forEach(order => {
                if (order.tableId && !profileTableIds.has(order.tableId)) {
                    orderTableIds.add(order.tableId);
                }
            });

            // Add dynamic tables from orders
            const dynamicTables = [...orderTableIds].map(tableId => ({
                id: tableId,
                title: tableId,
                type: 'dine_in',
                section: 'dynamic', // Mark these as dynamic
                isTable: true
            }));

            // Combine profile tables with dynamic tables from orders
            const allTables = [...formattedTables, ...dynamicTables];

            console.log(`[Dashboard] Tables from profile: ${formattedTables.length}`);
            console.log(`[Dashboard] Dynamic tables from orders: ${dynamicTables.length}`);
            console.log(`[Dashboard] Combined tables: ${allTables.length}`);

            // Assign orders to tables using the map
            const tablesWithOrders = allTables.map(table => {
                const tableOrdersList = tableOrdersMap[table.id] || []; // Use table.id for lookup
                let oldestOrderDate = null;
                if (tableOrdersList.length > 0) {
                    oldestOrderDate = tableOrdersList
                        .map(o => o.currentStatus?.date)
                        .filter(Boolean) // Ensure date exists before parsing/comparing
                        .reduce((oldest, current) => {
                            const oldestD = parseDate(oldest);
                            const currentD = parseDate(current);
                            // Handle cases where parseDate might return null
                            if (!currentD) return oldest;
                            if (!oldestD) return current;
                            return oldestD < currentD ? oldest : current;
                        }); // No need for initial value if we filter nulls first
                }

                return {
                    ...table,
                    orders: tableOrdersList,
                    duration: oldestOrderDate ? getTimeDuration(oldestOrderDate, t) : null
                };
            });

            // Assign orders to channels using the map
            const channelsWithOrders = orderChannels.map(channel => {
                const channelOrdersList = channelOrdersMap[channel.id] || []; // Use channel.id (variant title) for lookup
                let oldestOrderDate = null;
                if (channelOrdersList.length > 0) {
                    oldestOrderDate = channelOrdersList
                        .map(o => o.currentStatus?.date)
                        .filter(Boolean)
                        .reduce((oldest, current) => {
                            const oldestD = parseDate(oldest);
                            const currentD = parseDate(current);
                            if (!currentD) return oldest;
                            if (!oldestD) return current;
                            return oldestD < currentD ? oldest : current;
                        });
                }

                return {
                    ...channel,
                    orders: channelOrdersList,
                    duration: oldestOrderDate ? getTimeDuration(oldestOrderDate, t) : null
                };
            });

            // Update state
            setTables(tablesWithOrders);
            setChannels(channelsWithOrders);

            // Note: Dashboard metrics are now calculated in syncTodaysOrders for accuracy
        } catch (err) {
            console.error('Error processing orders:', err);
            setError('Failed to process orders data');
        }
        // Update dependencies: React to seller, realtime active orders and today's kitchen snapshot
    }, [seller, activeOrders, todaysOrdersData.kitchen]);

    // Fetch orders based on current filter
    useEffect(() => {
        if (showCompletedOrders) {
            // Clean up any existing completed orders listener before creating a new one
            if (completedOrdersUnsubscribe) {
                completedOrdersUnsubscribe();
            }
            // Set up the listener for completed orders
            setupCompletedOrdersListener();
        }
    }, [dateFilter, customDateRange, showCompletedOrders]);

    // Function to show the add table modal
    const showAddTableModal = () => {
        setIsAddTableModalOpen(true);
    };

    // Function to show the rename room modal
    const showRenameRoomModal = (tableId, variant) => {
        setSelectedTableId(tableId);
        setSelectedVariant(variant);
        setIsRenameRoomModalOpen(true);
    };

    // Helper function to calculate start date based on filter
    const calculateStartDate = (filter, customStart = null) => {
        const now = new Date();
        const customStartDate = parseDate(customStart);

        switch (filter) {
            case 'today':
                return new Date(now.getFullYear(), now.getMonth(), now.getDate());
            case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
            case '7days':
                const sevenDaysAgo = new Date(now);
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
                return new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate());
            case '30days':
                const thirtyDaysAgo = new Date(now);
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
                return new Date(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth(), thirtyDaysAgo.getDate());
            case 'custom':
                return customStartDate || now;
            default:
                return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
    };

    // Helper function to calculate end date based on filter
    const calculateEndDate = (filter, customEnd = null) => {
        const now = new Date();
        const customEndDate = parseDate(customEnd);

        switch (filter) {
            case 'today':
                return now;
            case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
            case '7days':
                return now;
            case '30days':
                return now;
            case 'custom':
                return customEndDate || now;
            default:
                return now;
        }
    };

    // Handle room click
    const handleRoomClick = (tableId, variant) => {
        setSelectedRoomTableId(tableId);
        setSelectedRoomVariant(variant);
        setIsOrderRoomOpen(true);

        // Enhanced debugging for OrderRoom
        console.log(`[Dashboard] Opening OrderRoom for ${tableId ? `Table ${tableId}` : variant || 'Default'} showing KITCHEN status orders`);

        // Check what data we're sending to OrderRoom
        if (getOrdersForSource) {
            const previewOrders = getOrdersForSource(tableId, variant, "KITCHEN");
            console.log(`[Dashboard] Preview: OrderRoom will receive ${previewOrders.length} orders for ${tableId ? `Table ${tableId}` : variant || 'Default'}`);

            if (previewOrders.length === 0 && variant === 'Swiggy') {
                // Special case for Swiggy which shows in tile but not in OrderRoom
                console.log(`[Dashboard] WARNING: Swiggy channel shows 0 orders in preview. This may indicate a data inconsistency!`);
                console.log(`[Dashboard] Checking all KITCHEN orders for Swiggy data...`);

                const allKitchenOrders = kitchenOrders.filter(o =>
                    (o.priceVariant === 'Swiggy' || o.tableId === 'Swiggy') &&
                    o.currentStatus?.label === 'KITCHEN'
                );

                console.log(`[Dashboard] Found ${allKitchenOrders.length} raw KITCHEN status orders with Swiggy data`);
                if (allKitchenOrders.length > 0) {
                    console.log(`[Dashboard] First Swiggy order:`, {
                        id: allKitchenOrders[0].id,
                        tableId: allKitchenOrders[0].tableId || null,
                        priceVariant: allKitchenOrders[0].priceVariant || null,
                        status: allKitchenOrders[0].currentStatus?.label,
                        items: allKitchenOrders[0].items?.length || 0
                    });
                }
            }
        }
    };

    // Calculate dashboard metrics from orders data
    const calculateDashboardMetrics = (allOrders) => {
        try {
            if (!allOrders || !Array.isArray(allOrders)) {
                console.error('[Dashboard Metrics] Invalid orders data:', allOrders);
                return {
                    todayOrders: 0,
                    todayRevenue: 0,
                    newCustomers: 0,
                    avgOrderValue: 0,
                    avgServiceTime: 0,
                    todayOrdersTrend: 0,
                    todayRevenueTrend: 0,
                    newCustomersTrend: 0,
                    avgOrderValueTrend: 0,
                    avgServiceTimeTrend: 0
                };
            }

            console.log(`[Dashboard Metrics] Calculating metrics from ${allOrders.length} orders`);

            // Create date objects for today and yesterday
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

            // Filter orders for today and yesterday
            const todayOrders = allOrders.filter(order => {
                const orderDate = order.date;
                return orderDate && orderDate >= startOfToday;
            });

            const yesterdayOrders = allOrders.filter(order => {
                const orderDate = order.date;
                return orderDate && orderDate >= startOfYesterday && orderDate < startOfToday;
            });

            console.log(`[Dashboard Metrics] Found ${todayOrders.length} orders for today and ${yesterdayOrders.length} for yesterday`);

            // Calculate today's metrics
            const todayOrdersCount = todayOrders.length;

            // Calculate revenue with taxes and discounts using standardized function
            const todayRevenue = todayOrders.reduce((sum, order) => sum + calculateOrderTotal(order), 0);

            console.log(`[Dashboard Metrics] Today's revenue: ${todayRevenue}`);

            // Calculate yesterday's metrics for trend comparison
            const yesterdayOrdersCount = yesterdayOrders.length;
            const yesterdayRevenue = yesterdayOrders.reduce((sum, order) => sum + calculateOrderTotal(order), 0);

            // Get unique customer count for today
            const todayCustomerIds = new Set(todayOrders
                .filter(order => order.customer?.id)
                .map(order => order.customer.id));
            const newCustomersCount = todayCustomerIds.size;

            // Yesterday's unique customers
            const yesterdayCustomerIds = new Set(yesterdayOrders
                .filter(order => order.customer?.id)
                .map(order => order.customer.id));
            const yesterdayNewCustomersCount = yesterdayCustomerIds.size;

            // Calculate average order value for today's orders
            const avgOrderValue = todayOrdersCount > 0
                ? todayRevenue / todayOrdersCount
                : 0;

            // Calculate avg order value for yesterday
            const yesterdayAvgOrderValue = yesterdayOrdersCount > 0
                ? yesterdayRevenue / yesterdayOrdersCount
                : 1; // Avoid division by zero in trend calculation

            // Calculate service time (from PLACED to COMPLETED)
            let totalServiceTimeMinutes = 0;
            let serviceTimeOrderCount = 0;

            todayOrders.forEach(order => {
                if (order.status && Array.isArray(order.status)) {
                    const placedStatus = order.status.find(s => s.label === "PLACED");
                    const completedStatus = order.status.find(s => s.label === "COMPLETED");

                    if (placedStatus && completedStatus && placedStatus.date && completedStatus.date) {
                        const placedDate = placedStatus.date;
                        const completedDate = completedStatus.date;

                        if (placedDate && completedDate) {
                            const serviceTimeMinutes = (completedDate - placedDate) / (1000 * 60);
                            if (serviceTimeMinutes > 0 && serviceTimeMinutes < 1440) { // Less than a day
                                totalServiceTimeMinutes += serviceTimeMinutes;
                                serviceTimeOrderCount++;
                            }
                        }
                    }
                }
            });

            const avgServiceTime = serviceTimeOrderCount > 0
                ? totalServiceTimeMinutes / serviceTimeOrderCount
                : 0;

            // Calculate trends (percentage change from yesterday)
            const calculateTrend = (today, yesterday) => {
                if (yesterday === 0) return today > 0 ? 100 : 0;
                return ((today - yesterday) / yesterday) * 100;
            };

            const todayOrdersTrend = calculateTrend(todayOrdersCount, yesterdayOrdersCount);
            const todayRevenueTrend = calculateTrend(todayRevenue, yesterdayRevenue);
            const newCustomersTrend = calculateTrend(newCustomersCount, yesterdayNewCustomersCount);
            const avgOrderValueTrend = calculateTrend(avgOrderValue, yesterdayAvgOrderValue);

            // For service time, a negative trend is actually good (faster service)
            let avgServiceTimeTrend = 0;

            // Calculate yesterday's average service time
            let yesterdayTotalServiceTimeMinutes = 0;
            let yesterdayServiceTimeOrderCount = 0;

            yesterdayOrders.forEach(order => {
                if (order.status && Array.isArray(order.status)) {
                    const placedStatus = order.status.find(s => s.label === "PLACED");
                    const completedStatus = order.status.find(s => s.label === "COMPLETED");

                    if (placedStatus && completedStatus && placedStatus.date && completedStatus.date) {
                        const placedDate = placedStatus.date;
                        const completedDate = completedStatus.date;

                        if (placedDate && completedDate) {
                            const serviceTimeMinutes = (completedDate - placedDate) / (1000 * 60);
                            if (serviceTimeMinutes > 0 && serviceTimeMinutes < 1440) { // Less than a day
                                yesterdayTotalServiceTimeMinutes += serviceTimeMinutes;
                                yesterdayServiceTimeOrderCount++;
                            }
                        }
                    }
                }
            });

            const yesterdayAvgServiceTime = yesterdayServiceTimeOrderCount > 0
                ? yesterdayTotalServiceTimeMinutes / yesterdayServiceTimeOrderCount
                : 1; // Avoid division by zero

            // For service time, a negative trend is actually good (faster service)
            avgServiceTimeTrend = calculateTrend(avgServiceTime, yesterdayAvgServiceTime) * -1;

            const result = {
                todayOrders: todayOrdersCount,
                todayRevenue: todayRevenue,
                newCustomers: newCustomersCount,
                avgOrderValue: avgOrderValue,
                avgServiceTime: avgServiceTime,
                todayOrdersTrend: todayOrdersTrend,
                todayRevenueTrend: todayRevenueTrend,
                newCustomersTrend: newCustomersTrend,
                avgOrderValueTrend: avgOrderValueTrend,
                avgServiceTimeTrend: avgServiceTimeTrend
            };

            console.log('[Dashboard Metrics] Calculated metrics:', result);
            return result;
        } catch (err) {
            console.error('Error calculating dashboard metrics:', err);
            return {
                todayOrders: 0,
                todayRevenue: 0,
                newCustomers: 0,
                avgOrderValue: 0,
                avgServiceTime: 0,
                todayOrdersTrend: 0,
                todayRevenueTrend: 0,
                newCustomersTrend: 0,
                avgOrderValueTrend: 0,
                avgServiceTimeTrend: 0
            };
        }
    };

    // Check SDK availability when component mounts
    useEffect(() => {
        if (!sdk || !sdk.db.collection) {
            console.error("SDK is not available or not properly initialized");
            setError("SDK is not available. Some features may not work properly.");
        }
    }, []);

    // Fetch QR orders and set up real-time listeners
    useEffect(() => {
        setupPlacedOrdersListener();
        setupKitchenOrdersListener();

        // Listen for order completion events to refresh data
        const handleOrderCompleted = (event) => {
            console.log('[Dashboard] Order completed event received, refreshing data...', event.detail);
            // Refresh kitchen orders, placed orders, and completed orders
            setupKitchenOrdersListener();
            setupPlacedOrdersListener();
            setupCompletedOrdersListener();
        };

        // Listen for partial payments (settlements) to update revenue related metrics
        const handlePartialPayment = (event) => {
            console.log('[Dashboard] orderPartialPayment event received, refreshing completed orders & metrics...', event.detail);
            // A partial or full settlement can change paid status & revenue figures
            setupCompletedOrdersListener();
        };
        
        // Listen for currency changes to refresh UI
        const handleCurrencyChanged = (event) => {
            console.log('[Dashboard] Currency changed event received, refreshing UI...', event.detail);
            // Force refresh of completed orders to show new currency
            if (showCompletedOrders) {
                setupCompletedOrdersListener();
            }
            // Force state update to trigger re-render
            setActiveView(prev => prev);
        };

    window.addEventListener('orderCompleted', handleOrderCompleted);
    window.addEventListener('orderPartialPayment', handlePartialPayment);
        window.addEventListener('currencyChanged', handleCurrencyChanged);

        // Cleanup listeners on component unmount
        return () => {
            // Clean up Firestore listeners
            if (kitchenOrdersUnsubscribe) {
                kitchenOrdersUnsubscribe();
            }
            if (completedOrdersUnsubscribe) {
                completedOrdersUnsubscribe();
            }
            if (placedOrdersUnsubscribe) {
                placedOrdersUnsubscribe();
            }
            window.removeEventListener('orderCompleted', handleOrderCompleted);
            window.removeEventListener('orderPartialPayment', handlePartialPayment);
            window.removeEventListener('currencyChanged', handleCurrencyChanged);
        };
    }, []); // Empty dependency array means this runs once on mount

    // Set up real-time listener for KITCHEN orders
    const setupKitchenOrdersListener = () => {
        try {
            // Check if SDK is available
            if (!sdk || !sdk.db.collection) {
                console.error("SDK is not available or not properly initialized");
                setError("SDK is not available. Please try again later.");
                return;
            }

            console.log("[Kitchen Listener] Setting up real-time listener for KITCHEN orders");

            // Query for KITCHEN orders - mirrors the Flutter implementation
            const kitchenQuery = sdk.db.collection("Orders")
                .where("currentStatus.label", "==", "KITCHEN")
                .orderBy("date", "desc")
                .limit(100); // Increased limit for better pagination

            // Set up real-time listener
            const unsubscribe = kitchenQuery.onSnapshot(
                (snapshot) => {
                    // Process the snapshot data
                    const kitchenOrdersData = snapshot.docs
                        .map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            date: parseDate(doc.data().date),
                            // Parse status dates properly
                            status: Array.isArray(doc.data().status)
                                ? doc.data().status.map(s => ({
                                    ...s,
                                    date: parseDate(s.date)
                                }))
                                : []
                        }))
                        .filter(order => order.items && order.items.length > 0);

                    console.log(`[Kitchen Listener] Received ${kitchenOrdersData.length} KITCHEN orders`);

                    // Update state with the real-time KITCHEN orders data
                    setKitchenOrders(kitchenOrdersData);

                    // Also fetch recent COMPLETED orders for metrics
                    fetchRecentCompletedOrders(kitchenOrdersData);

                    console.log(`[Realtime update] ${kitchenOrdersData.length} KITCHEN orders (real-time listener active)`);
                },
                (error) => {
                    console.error('Error in KITCHEN orders listener:', error);
                    setError(`Failed to listen to kitchen orders updates: ${error.message}`);
                }
            );

            // Save the unsubscribe function
            setKitchenOrdersUnsubscribe(() => unsubscribe);
        } catch (err) {
            console.error('Error setting up kitchen orders listener:', err);
            setError('Failed to set up kitchen orders listener');
        }
    };

    // Fetch recent COMPLETED orders for metrics only
    const fetchRecentCompletedOrders = async (kitchenOrdersData) => {
        try {
            // Check if SDK is available
            if (!sdk || !sdk.db.collection) {
                console.error("SDK is not available or not properly initialized");
                return;
            }

            // Get start of today for metrics calculation (UTC-based to match Firestore)
            const now = new Date();
            // Use UTC start of day to avoid timezone issues
            const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const startOfYesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

            console.log('[Dashboard Metrics] Debug - Current time:', now.toISOString());
            console.log('[Dashboard Metrics] Debug - Start of today (UTC):', startOfToday.toISOString());
            console.log('[Dashboard Metrics] Debug - Start of yesterday (UTC):', startOfYesterday.toISOString());

            // Fetch ALL recent orders for metrics (both COMPLETED and other statuses for today/yesterday)
            const recentCompletedQuery = sdk.db.collection("Orders")
                .orderBy("date", "desc")
                .where("date", ">=", startOfYesterday) // Get at least yesterday's orders
                .limit(300); // Increased limit to ensure we get all relevant orders

            const completedSnapshot = await recentCompletedQuery.get();

            const completedOrdersData = completedSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Ensure date is properly parsed from Firestore timestamps
                    date: parseDate(data.date),
                    // Parse status dates properly
                    status: Array.isArray(data.status)
                        ? data.status.map(s => ({
                            ...s,
                            date: parseDate(s.date)
                        }))
                        : []
                };
            });

            console.log(`[Dashboard Metrics] Fetched ${completedOrdersData.length} orders for metrics calculation`);

            // Debug: Show first few orders with their dates and statuses
            if (completedOrdersData.length > 0) {
                console.log('[Dashboard Metrics] Debug - First few orders:', completedOrdersData.slice(0, 3).map(order => ({
                    id: order.id,
                    date: order.date?.toISOString(),
                    currentStatus: order.currentStatus?.label,
                    paid: order.paid
                })));
            }

            // Log date ranges for debugging
            console.log(`[Dashboard Metrics] Today starts at: ${startOfToday.toISOString()}`);
            console.log(`[Dashboard Metrics] Yesterday starts at: ${startOfYesterday.toISOString()}`);

            // Count how many orders are from today for debugging
            const todayOrdersCount = completedOrdersData.filter(order => {
                const orderDate = order.date;
                return orderDate && orderDate >= startOfToday;
            }).length;

            console.log(`[Dashboard Metrics] Orders from today: ${todayOrdersCount}`);

            // Combine KITCHEN and recent orders for the metrics state
            const allMetricsOrders = [...kitchenOrdersData, ...completedOrdersData];
            setOrders(allMetricsOrders);

            // Note: Dashboard metrics are now calculated in syncTodaysOrders for accuracy

            console.log(`[Dashboard Metrics] Orders state updated with ${allMetricsOrders.length} orders`);
        } catch (err) {
            console.error('Error fetching orders for metrics:', err);
        }
    };

    // Set up real-time listener for PLACED orders
    const setupPlacedOrdersListener = async () => {
        try {
            setLoadingQrOrders(true);
            setErrorQrOrders(null);

            // Check if SDK is available
            if (!sdk || !sdk.db.collection) {
                console.error("SDK is not available or not properly initialized");
                setErrorQrOrders("SDK is not available. Please try again later.");
                setLoadingQrOrders(false);
                return;
            }

            console.log("[PLACED Listener] Setting up real-time listener for PLACED orders");

            // Query for PLACED orders - similar to the KITCHEN orders listener
            const placedQuery = sdk.db.collection("Orders")
                .where("currentStatus.label", "==", OrderStatus.PLACED)
                .orderBy("date", "desc")
                .limit(100);

            // Set up real-time listener with enhanced error handling
            const unsubscribe = placedQuery.onSnapshot(
                (snapshot) => {
                    // Process the snapshot data based on query method
                    let placedOrdersData = snapshot.docs
                        .map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            date: parseDate(doc.data().date)
                        }));

                    // Update state with the real-time PLACED orders data
                    setQrOrders(placedOrdersData);
                    setLoadingQrOrders(false);
                },
                (error) => {
                    console.error('Error in PLACED orders listener:', error);
                    setErrorQrOrders(`Failed to listen to QR orders updates: ${error.message}`);
                    setLoadingQrOrders(false);
                }
            );

            // Save the unsubscribe function
            setPlacedOrdersUnsubscribe(() => unsubscribe);
        } catch (err) {
            console.error('Error setting up PLACED orders listener:', err);
            setErrorQrOrders(`Failed to set up PLACED orders listener: ${err.message}`);
            setLoadingQrOrders(false);
        }
    };

    // Keep the handleAcceptOrder function for accepting orders
    const handleAcceptOrder = async (orderId) => {
        console.log("handleAcceptOrder", orderId);

        try {
            setLoadingQrOrders(true);

            // Check if SDK is available
            if (!sdk || !sdk.db.collection) {
                throw new Error('SDK is not available or not properly initialized');
            }

            // Fetch the order first to log its current state
            const orderRef = sdk.db.collection("Orders").doc(orderId);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                throw new Error(`Order ${orderId} not found`);
            }

            const orderData = orderDoc.data();
            console.log(`[handleAcceptOrder] Before update - Order ${orderId}:`, {
                tableId: orderData.tableId || 'null/undefined',
                priceVariant: orderData.priceVariant || 'null/undefined',
                currentStatus: orderData.currentStatus,
                statusCount: orderData.status?.length || 0
            });

            // Create status entry for kitchen processing - use KITCHEN status to be consistent with OrderRoom
            const statusEntry = {
                label: 'KITCHEN',
                date: new Date()
            };

            // Get existing order data
            const existingData = orderData || {};
            
            // Manually append the status entry to the existing array
            const existingStatus = existingData.status || [];
            const updatedStatus = [...existingStatus, statusEntry];
            
            // Update the order status
            await orderRef.update({
                currentStatus: statusEntry,
                status: updatedStatus
            });

            // Fetch the updated order to confirm changes
            const updatedOrderDoc = await orderRef.get();
            const updatedOrderData = updatedOrderDoc.data();

            console.log(`[handleAcceptOrder] After update - Order ${orderId}:`, {
                tableId: updatedOrderData.tableId || 'null/undefined',
                priceVariant: updatedOrderData.priceVariant || 'null/undefined',
                currentStatus: updatedOrderData.currentStatus,
                statusCount: updatedOrderData.status?.length || 0
            });

            // Show success message
            showToast("Order accepted successfully");
            console.log(`Order ${orderId} moved to KITCHEN status and will appear in tables/channels`);

            // Refresh unified today's orders data
            syncTodaysOrders();

            // Extra check - force refresh of kitchen orders listener by calling setupKitchenOrdersListener
            console.log("Refreshing kitchen orders listener to ensure the updated order appears...");
            if (kitchenOrdersUnsubscribe) {
                kitchenOrdersUnsubscribe();
            }
            setupKitchenOrdersListener();
        } catch (err) {
            console.error('Error accepting order:', err);
            showToast(`Failed to accept order: ${err.message}`, "error");
        } finally {
            setLoadingQrOrders(false);
        }
    };

    const handleRejectOrder = async (orderId) => {
        try {
            if (!orderId) {
                throw new Error('Order ID is required');
            }
            
            setLoadingQrOrders(true);

            // Check if SDK is available
            if (!sdk || !sdk.db.collection) {
                throw new Error('SDK is not available or not properly initialized');
            }

            // Create status entry for rejected
            const statusEntry = {
                label: 'CANCELLED',
                date: new Date()
            };

            // Get reference to the order and check if it exists
            const orderRef = sdk.db.collection("Orders").doc(orderId);
            const orderDoc = await orderRef.get();
            
            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }

            // Debug the SDK object to understand what's available
            console.log("SDK object:", Object.keys(sdk));
            console.log("SDK.db object:", sdk.db ? Object.keys(sdk.db) : "undefined");
            console.log("SDK.firestore object:", sdk.firestore ? Object.keys(sdk.firestore) : "undefined");
            
            // Get existing order data and manually update the status array
            const existingData = orderDoc.data();
            
            // Manually append the status entry to the existing array
            const existingStatus = existingData.status || [];
            const updatedStatus = [...existingStatus, statusEntry];
            
            // Update with manual array append
            await orderRef.update({
                currentStatus: statusEntry,
                status: updatedStatus
            });

            // Show success message
            showToast("Order rejected successfully");
            
            // Refresh unified today's orders data
            syncTodaysOrders();
        } catch (err) {
            console.error('Error rejecting order:', err);
            showToast(`Failed to reject order: ${err.message}`, "error");
        } finally {
            setLoadingQrOrders(false);
        }
    };

    // Handle assigning QR order to table
    const handleAssignToTable = async (orderId, tableId) => {
        try {
            if (!sdk || !sdk.db.collection) {
                throw new Error('SDK is not available or not properly initialized');
            }

            const orderRef = sdk.db.collection("Orders").doc(orderId);
            const orderDoc = await orderRef.get();
            
            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }
            
            // Create status entry for KITCHEN (assigned to table)
            const statusEntry = {
                label: "KITCHEN",
                date: new Date()
            };

            // Get existing order data and update
            const existingData = orderDoc.data();
            const existingStatus = existingData.status || [];
            const updatedStatus = [...existingStatus, statusEntry];

            // Update order with table assignment and KITCHEN status
            await orderRef.update({
                tableId: tableId,
                status: updatedStatus,
                currentStatus: statusEntry
            });

            showToast(`Order assigned to table ${tableId}`, "success");
            
            // Refresh today's orders data
            syncTodaysOrders();
            
        } catch (error) {
            console.error('Error assigning order to table:', error);
            throw error; // Re-throw to be handled by modal
        }
    };

    // Handle confirming QR order as parcel
    const handleConfirmAsParcel = async (orderId) => {
        try {
            if (!sdk || !sdk.db.collection) {
                throw new Error('SDK is not available or not properly initialized');
            }

            const orderRef = sdk.db.collection("Orders").doc(orderId);
            const orderDoc = await orderRef.get();
            
            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }
            
            // Create status entry for completed
            const statusEntry = {
                label: OrderStatus.COMPLETED,
                date: new Date()
            };

            // Get existing order data and update
            const existingData = orderDoc.data();
            const existingStatus = existingData.status || [];
            const updatedStatus = [...existingStatus, statusEntry];

            // Update order with completed status (no table assignment)
            await orderRef.update({
                status: updatedStatus,
                currentStatus: statusEntry
            });

            showToast("Order confirmed as parcel", "success");
            
            // Post-completion: update customer aggregates and notify listeners (non-blocking)
            (async () => {
                try {
                    const updatedDoc = await orderRef.get();
                    if (!updatedDoc.exists) return;
                    const updatedOrder = updatedDoc.data();
                    const custId = updatedOrder.custId || (updatedOrder.customer && updatedOrder.customer.id) || null;
                    if (custId && custId !== 'guest') {
                        let amount = Number(updatedOrder.settledAmount ?? updatedOrder.finalAmount ?? 0) || 0;
                        if (!amount && Array.isArray(updatedOrder.items)) {
                            amount = updatedOrder.items.reduce((s, it) => {
                                const q = Number(it.qnt || it.quantity || 1) || 1;
                                const base = (typeof it.basePrice === 'number') ? it.basePrice : (Number(it.price) || 0);
                                const addons = Array.isArray(it.addons) ? it.addons.reduce((a,b)=>a+(Number(b.price)||0),0) : (Number(it.addonsTotal)||0);
                                return s + (q * (base + addons));
                            }, 0);
                        }
                        const paymentEntry = {
                            orderId: updatedOrder.id || orderId,
                            amount: Number(amount) || 0,
                            payMode: updatedOrder.payMode || 'CASH',
                            date: updatedOrder.date || new Date(),
                            loyaltyDiscountAmount: Number(updatedOrder.loyaltyDiscountAmount || 0) || 0,
                            loyaltyPointsUsed: Number(updatedOrder.loyaltyPointsUsed || 0) || 0,
                            settled: Boolean(updatedOrder.paid || updatedOrder.settled || ((Number(updatedOrder.settledAmount || 0) || 0) > 0) || /COMPLETED/i.test((updatedOrder.currentStatus && updatedOrder.currentStatus.label) || updatedOrder.status || ''))
                        };
                        appendCustomerPayment(custId, paymentEntry).catch(e => console.warn('[Dashboard] appendCustomerPayment failed', e));
                    }
                    try { window.dispatchEvent(new CustomEvent('orderCompleted', { detail: { orderId: orderId, customerId: custId || null, paid: true, status: 'COMPLETED' } })); } catch(e) { console.warn('[Dashboard] orderCompleted dispatch failed', e); }
                } catch (e) { console.warn('[Dashboard] post-completion customer update failed', e); }
            })();

            // Refresh today's orders data
            syncTodaysOrders();
            
        } catch (error) {
            console.error('Error confirming order as parcel:', error);
            throw error; // Re-throw to be handled by modal
        }
    };

    const handlePrintBill = async (orderId) => {
        try {
            // Check if SDK is available
            if (!sdk || !sdk.db.collection) {
                throw new Error('SDK is not available or not properly initialized');
            }

            console.log(`[Dashboard] Attempting to print bill for order: ${orderId}`);

            // Check if bill printing is available in SDK and print directly without checking if order exists
            if (sdk.bill && typeof sdk.bill.print === 'function') {
                console.log(`[Dashboard] Using SDK bill.print function`);
                await sdk.bill.print(orderId);
                showToast("Bill printed successfully");
            } else if (BluetoothPrinting && PrintTemplate) {
                // Use our own implementation with PrintTemplate and BluetoothPrinting
                console.log(`[Dashboard] Using BluetoothPrinting with PrintTemplate`);

                try {
                    // Fetch the order data
                    const orderDoc = await sdk.db.collection("Orders").doc(orderId).get();
                    const orderData = orderDoc.data();

                    if (!orderData) {
                        throw new Error("Order not found");
                    }

                    // Print the bill using BluetoothPrinting
                    const success = await BluetoothPrinting.printBill(orderId);

                    if (success) {
                        showToast("Bill printed successfully");
                    } else {
                        throw new Error("Printing failed");
                    }
                } catch (printError) {
                    console.error('Error in BluetoothPrinting:', printError);
                    throw printError;
                }
            } else if (sdk.kot && typeof sdk.kot.print === 'function') {
                // Fallback to KOT printing if bill printing is not available
                console.log(`[Dashboard] Bill print not available, falling back to KOT print`);
                await sdk.kot.print(orderId);
                showToast("KOT printed successfully");
            } else {
                // Fallback for development/testing
                console.log('[Dashboard] Print simulation for order:', orderId);
                showToast("Print simulation: Bill printed successfully");
            }
        } catch (err) {
            console.error('Error printing bill:', err);
            showToast(`Failed to print bill: ${err.message}`, "error");
        }
    };

    // Format a number with commas
    const formatNumber = (num) => {
        return num.toLocaleString('en-IN');
    };

    // Format a currency value
    const formatCurrency = (amount) => {
        if (CurrencyData) {
            const currencyCode = UserSession?.getCurrencyCode() || "INR";
            return CurrencyData.formatAmount(amount, currencyCode);
        }
        // Fallback to default formatting if CurrencyData is not available
        const currencySymbol = UserSession?.getCurrency() || '₹';
        return `${currencySymbol} ${amount.toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })}`;
    };

    // Set up real-time listener for COMPLETED orders with date filtering
    const setupCompletedOrdersListener = () => {
        try {
            setLoadingCompletedOrders(true);
            setErrorCompletedOrders(null);

            // Check if SDK is available
            if (!sdk || !sdk.db.collection) {
                console.error("SDK is not available or not properly initialized");
                setErrorCompletedOrders("SDK is not available. Please try again later.");
                setLoadingCompletedOrders(false);
                return;
            }

            console.log("[COMPLETED Listener] Setting up real-time listener for COMPLETED orders");

            // Calculate date range based on selected filter
            const startDate = calculateStartDate(dateFilter, customDateRange.startDate);
            const endDate = calculateEndDate(dateFilter, customDateRange.endDate);

            // Query orders within the date range (we'll filter client-side to include
            // orders that are COMPLETED or have been settled (e.g., previously UNSETTLED but now settled)
            // This avoids missing orders that were UNSETTLED earlier but later settled and marked COMPLETED
            let ordersQuery = sdk.db.collection("Orders")
                .orderBy("date", "desc")
                .limit(300); // increased limit to ensure coverage across the selected range

            // Set up real-time listener
            const unsubscribe = ordersQuery.onSnapshot(
                (snapshot) => {
                    if (!snapshot || !snapshot.docs) {
                        setErrorCompletedOrders("Failed to fetch completed orders data");
                        setLoadingCompletedOrders(false);
                        return;
                    }

                    const fetchedOrders = snapshot.docs.map(doc => {
                        const data = doc.data();
                        // Prefer currentStatus.date (completion timestamp) when available
                        const createdDate = parseDate(data.date);
                        const statusDate = parseDate(data.currentStatus?.date);
                        const dateForFilter = statusDate || createdDate;

                        return {
                            id: doc.id,
                            ...data,
                            // date now represents the most relevant date for completed-orders filtering
                            date: dateForFilter,
                            // keep originals for debugging/ordering if needed
                            _createdDate: createdDate,
                            _statusDate: statusDate
                        };
                    });

                    // Client-side filtering for date range and completed/settled state
                    const filteredOrders = fetchedOrders.filter(order => {
                        // Get order date
                        const orderDate = order.date;
                        if (!orderDate) return false;

                        // Check if within date range
                        if (!(orderDate >= startDate && orderDate <= endDate)) return false;

                        // Include order when it's completed OR has settled/payed status
                        const isCompleted = (order.currentStatus && order.currentStatus.label === 'COMPLETED');
                        const isPaidOrSettled = Boolean(order.paid === true || order.settled === true || (order.payMode && order.payMode !== 'UNSETTLED'));

                        return isCompleted || isPaidOrSettled;
                    });
                    
                    // Sort filtered completed orders so the most recent appear first
                    const safeTime = (d) => {
                        try {
                            const dt = new Date(d);
                            return isNaN(dt.getTime()) ? 0 : dt.getTime();
                        } catch (e) { return 0; }
                    };

                    const sortedOrders = (filteredOrders || []).slice().sort((a, b) => safeTime(b.date) - safeTime(a.date));

                    // Store filtered completed orders (newest first)
                    setOrders(sortedOrders);
                    setLoadingCompletedOrders(false);

                    console.log(`[Realtime update] Fetched ${fetchedOrders.length} COMPLETED orders, ${filteredOrders.length} matched the selected date range (real-time listener active)`);
                },
                (error) => {
                    console.error('Error in COMPLETED orders listener:', error);
                    setErrorCompletedOrders(`Failed to listen to completed orders updates: ${error.message}`);
                    setLoadingCompletedOrders(false);
                }
            );

            // Save the unsubscribe function
            setCompletedOrdersUnsubscribe(() => unsubscribe);
        } catch (err) {
            console.error('Error setting up completed orders listener:', err);
            setErrorCompletedOrders(`Failed to set up completed orders listener: ${err.message}`);
            setLoadingCompletedOrders(false);
        }
    };

    // Handle scroll to load more items (restore this function)
    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;

        // Check if scrolled to bottom and not already loading
        if (scrollHeight - scrollTop <= clientHeight * 1.2 && !isLoadingMore && qrOrders.length >= loadedItemCount) {
            setIsLoadingMore(true);

            // Increase the limit and fetch more orders
            setLoadedItemCount(prev => prev + 50);

            // Reset loading state after a delay
            setTimeout(() => {
                setIsLoadingMore(false);
            }, 2000);
        }
    };

    const handlePrintTemplateManagement = () => {
        if (!sdk) {
            showToast(t('sdkNotLoaded'));
            return;
        }

        // Ensure PrintTemplate is available
        if (!PrintTemplate) {
            console.error("PrintTemplate class is not available. Loading from PrintTemplate.js");
            showToast("Loading print template system...");

            // Try to load PrintTemplate.js dynamically if not already loaded
            const scriptElement = document.createElement('script');
            scriptElement.src = 'js/utils/PrintTemplate.js';
            scriptElement.onload = () => {
                console.log("PrintTemplate.js loaded successfully");
                // Retry after loading
                setTimeout(() => handlePrintTemplateManagement(), 500);
            };
            scriptElement.onerror = () => {
                console.error("Failed to load PrintTemplate.js");
                showToast("Failed to load print template system", "error");
            };
            document.head.appendChild(scriptElement);
            return;
        }

        // Shared state object for communication between windows
        const sharedState = {
            currentTemplateType: 'bill',
            templates: {},
            editorModal: null,
            previewModal: null,
            updatePreview: null,
            renderTemplateSections: null
        };

        // Initialize templates
        if (seller && seller.printTemplate) {
            console.log("Loading saved print templates from seller profile:", seller.printTemplate);
            sharedState.templates = seller.printTemplate;
        } else {
            console.log("No saved templates found, using defaults from PrintTemplate.js");
            // Use PrintTemplate.js to create default templates
            if (PrintTemplate) {
                try {
                    // Ensure seller data has necessary fields
                    const sellerData = {
                        businessName: seller?.businessName || 'Your Business',
                        logo: seller?.logo || '',
                        phone: seller?.phone || '',
                        address: seller?.address || '',
                        website: seller?.storeLink || seller?.website || '',
                        gstIN: seller?.gstIN || seller?.gstNo || ''
                    };

                    // Create default bill template
                    const defaultBill = new PrintTemplate({
                        type: 'bill',
                        orderData: {}, // Empty order for default template
                        seller: sellerData
                    });

                    // Create default KOT template
                    const defaultKOT = new PrintTemplate({
                        type: 'kot',
                        orderData: {}, // Empty order for default template
                        seller: sellerData
                    });

                    sharedState.templates = {
                        'bill': defaultBill.templateData || getDefaultBillTemplate(),
                        'kot': defaultKOT.templateData || getDefaultKOTTemplate()
                    };
                } catch (error) {
                    console.error("Error creating default templates from PrintTemplate.js:", error);
                    console.log("Falling back to built-in default templates");
                    sharedState.templates = {
                        'bill': getDefaultBillTemplate(),
                        'kot': getDefaultKOTTemplate()
                    };
                }
            } else {
                console.warn("PrintTemplate.js not available, using built-in default templates");
                sharedState.templates = {
                    'bill': getDefaultBillTemplate(),
                    'kot': getDefaultKOTTemplate()
                };
            }
        }

        // Ensure both bill and kot templates exist and have valid sections
        if (!sharedState.templates.bill || !sharedState.templates.bill.sections || sharedState.templates.bill.sections.length === 0) {
            console.log("Bill template missing or invalid, using default");
            sharedState.templates.bill = getDefaultBillTemplate();
        }

        if (!sharedState.templates.kot || !sharedState.templates.kot.sections || sharedState.templates.kot.sections.length === 0) {
            console.log("KOT template missing or invalid, using default");
            sharedState.templates.kot = getDefaultKOTTemplate();
        }

        // Create Template Editor Window (Left)
        sharedState.editorModal = ModalManager.createCenterModal({
            id: 'print-template-editor-modal',
            title: t('templateEditor'),
            content: `
                <div class="space-y-5 px-5 pb-4" style="width: 560px;">
                    <div id="print-template-error-container" class="hidden p-3 bg-red-50 text-red-700 rounded-md"></div>

                    <div class="flex space-x-2 border-b border-gray-200">
                        <button id="bill-tab" class="px-4 py-2 bg-red-500 text-white rounded-t-md focus:outline-none">${t('bill')}</button>
                        <button id="kot-tab" class="px-4 py-2 border border-gray-200 text-gray-700 rounded-t-md focus:outline-none">${t('kot')}</button>
                    </div>

                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <h3 class="text-base font-semibold text-gray-800">${t('templateSections')}</h3>
                            <button id="add-section-btn" class="p-2 text-red-600 hover:bg-red-50 rounded-full" title="${t('addSection')}">
                                <i class="ph ph-plus"></i>
                            </button>
                        </div>
                        <div id="template-sections" class="space-y-3">
                            <!-- Template sections will be rendered here -->
                        </div>
                    </div>
                </div>
            `,
            actions: `
                <div class="flex justify-end px-4 py-1">
                    <div class="space-x-3">
                        <button id="reset-template-btn" class="px-4 py-1.5 border text-red-500 rounded-md hover:bg-red-50">${t('reset')}</button>
                        <button id="save-template-btn" class="px-4 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600">${t('save')}</button>
                    </div>
                </div>
            `,
            size: 'xl',
            closeOnBackdropClick: false,
            windowed: true,
            zIndex: 60,
            onShown: (editorModalControl) => {
                sharedState.editorModal = editorModalControl;
                
                // Position editor window on the left side (windowed uses fixed panel)
                setTimeout(() => {
                    const editorContainer = document.getElementById('print-template-editor-modal');
                    if (editorContainer) {
                        const modalContent = editorContainer.querySelector('.bg-white.w-full');
                        if (modalContent) {
                            modalContent.style.left = '140px';
                            modalContent.style.top = '40px';
                            // Slightly wider default for comfortable editing
                            const rect = modalContent.getBoundingClientRect();
                            if (rect.width < 600) modalContent.style.width = '600px';

                            // Avoid horizontal scrollbar in content scroller
                            const scroller = editorContainer.querySelector('.flex-1.overflow-auto');
                            if (scroller) {
                                scroller.style.overflowX = 'hidden';
                                scroller.style.overflowY = 'auto';
                            }

                            // Helper to expand editor width to accommodate widest textarea content
                            const adjustEditorWidth = () => {
                                try {
                                    const currentRect = modalContent.getBoundingClientRect();
                                    let maxOver = 0;
                                    editorContainer.querySelectorAll('textarea').forEach(ta => {
                                        const over = ta.scrollWidth - ta.clientWidth;
                                        if (over > maxOver) maxOver = over;
                                    });
                                    if (maxOver > 0) {
                                        const margin = 24; // breathing room
                                        let newWidth = Math.ceil(currentRect.width + maxOver + margin);
                                        const maxAllowed = Math.max(600, window.innerWidth - 40);
                                        modalContent.style.width = `${Math.min(maxAllowed, newWidth)}px`;
                                    }
                                } catch (_) {}
                            };
                            editorContainer._lp_adjustEditorWidth = adjustEditorWidth;
                        }
                    }
                }, 100);
                
                const billTab = document.getElementById('bill-tab');
                const kotTab = document.getElementById('kot-tab');
                const templateSections = document.getElementById('template-sections');
                const addSectionBtn = document.getElementById('add-section-btn');
                const resetBtn = document.getElementById('reset-template-btn');
                const saveBtn = document.getElementById('save-template-btn');
                const errorContainer = document.getElementById('print-template-error-container');

                let currentTemplateType = sharedState.currentTemplateType;
                let templates = sharedState.templates;

                // Check if seller has saved templates
                if (seller && seller.printTemplate) {
                    console.log("Loading saved print templates from seller profile:", seller.printTemplate);
                    templates = seller.printTemplate;
                } else {
                    console.log("No saved templates found, using defaults from PrintTemplate.js");
                    // Use PrintTemplate.js to create default templates
                    if (PrintTemplate) {
                        try {
                            // Ensure seller data has necessary fields
                            const sellerData = {
                                businessName: seller?.businessName || 'Your Business',
                                logo: seller?.logo || '',
                                phone: seller?.phone || '',
                                address: seller?.address || '',
                                website: seller?.storeLink || seller?.website || '',
                                gstIN: seller?.gstIN || seller?.gstNo || ''
                            };

                            // Create default bill template
                            const defaultBill = new PrintTemplate({
                                type: 'bill',
                                orderData: {}, // Empty order for default template
                                seller: sellerData
                            });

                            // Create default KOT template
                            const defaultKOT = new PrintTemplate({
                                type: 'kot',
                                orderData: {}, // Empty order for default template
                                seller: sellerData
                            });

                            templates = {
                                'bill': defaultBill.templateData || getDefaultBillTemplate(),
                                'kot': defaultKOT.templateData || getDefaultKOTTemplate()
                            };
                        } catch (error) {
                            console.error("Error creating default templates from PrintTemplate.js:", error);
                            console.log("Falling back to built-in default templates");
                            templates = {
                                'bill': getDefaultBillTemplate(),
                                'kot': getDefaultKOTTemplate()
                            };
                        }
                    } else {
                        console.warn("PrintTemplate.js not available, using built-in default templates");
                        templates = {
                            'bill': getDefaultBillTemplate(),
                            'kot': getDefaultKOTTemplate()
                        };
                    }
                }

                // Ensure both bill and kot templates exist and have valid sections
                if (!templates.bill || !templates.bill.sections || templates.bill.sections.length === 0) {
                    console.log("Bill template missing or invalid, using default");
                    templates.bill = getDefaultBillTemplate();
                }

                if (!templates.kot || !templates.kot.sections || templates.kot.sections.length === 0) {
                    console.log("KOT template missing or invalid, using default");
                    templates.kot = getDefaultKOTTemplate();
                }

                // Generate live preview content based on the current template
                function updateLivePreview() {
                    console.log("updateLivePreview called - generating HTML for template type:", currentTeplateType);
                    livePreviewContainer.innerHTML = generatePreviewHTML(currentTemplateType);
                    console.log("Live preview updated");
                }

                // Generate HTML for the preview
                function generatePreviewHTML(templateType) {
                    console.log("generatePreviewHTML called with templateType:", templateType);

                    // Create a mock test order for the preview
                    const testOrder = {
                        id: 'PREVIEW-123',
                        billNo: 'PREVIEW-123',
                        date: new Date(),
                        tableId: 'Preview',
                        priceVariant: 'Dine-in',
                        items: [
                            { title: 'Butter Chicken', quantity: 2, price: 299.50 },
                            { title: 'Jeera Rice', quantity: 1, price: 149.00 }
                        ],
                        discount: 50,
                        charges: [
                            { name: 'Service Charge', value: 30 }
                        ],
                        total: 733.00,
                        payMode: 'CASH'
                    };

                    // Check if we have a custom template and it has sections
                    const currentTemplate = templates[templateType];
                    console.log("Current template:", currentTemplate);

                    if (currentTemplate && currentTemplate.sections && currentTemplate.sections.length > 0) {
                        // Use the PrintTemplate class directly to generate HTML based on the current template
                        if (PrintTemplate) {
                            try {
                                console.log("Using PrintTemplate for preview with seller data:", seller);

                                // Ensure seller data has necessary fields
                                const sellerData = {
                                    businessName: seller?.businessName || 'Your Business',
                                    logo: seller?.logo || '',
                                    phone: seller?.phone || '',
                                    address: seller?.address || '',
                                    website: seller?.storeLink || seller?.website || '',
                                    gstIN: seller?.gstIN || seller?.gstNo || '',
                                    upiId: seller?.upiId || ''
                                };

                                // Create a PrintTemplate instance and generate HTML
                                const template = new PrintTemplate({
                                    orderData: testOrder,
                                    seller: sellerData,
                                    type: templateType,
                                    templateData: currentTemplate
                                });

                                const fullHtml = template.toHTML();
                                const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                                const bodyInner = bodyMatch ? bodyMatch[1] : fullHtml;
                                console.log("Generated HTML preview successfully");
                                // Wrap and include a marker to post-process QR placeholders
                                const wrapped = `<div class="lp-preview-wrap font-sans" style="max-width:58mm; margin:0 auto; padding: 0 12px;">${bodyInner}</div>`;
                                return wrapped;
                            } catch (error) {
                                console.error('Error generating template preview:', error);
                                return `<div class="text-center text-red-500 p-4">
                                    <i class="ph ph-warning-circle text-3xl mb-2"></i>
                                    <p>Error generating preview: ${error.message}</p>
                                    <pre class="mt-2 text-xs text-left bg-gray-100 p-2 rounded overflow-auto">${error.stack}</pre>
                                </div>`;
                            }
                        } else {
                            console.warn("PrintTemplate is not available");
                            return `<div class="text-center text-amber-500 p-4">
                                <i class="ph ph-warning-circle text-3xl mb-2"></i>
                                <p>PrintTemplate class is not available. Please refresh the page and try again.</p>
                            </div>`;
                        }
                    }

                    // Fallback to default preview if no template or PrintTemplate not available
                    return `
                        <div class="text-center" style="max-width:58mm; margin:0 auto; padding: 0 12px;">
                            <div class="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-2">
                                <i class="ph ph-storefront text-red-500 text-2xl"></i>
                            </div>
                            <h2 class="text-xl font-bold">${seller?.businessName || 'Your Business Name'}</h2>
                        </div>
                        <div class="text-center text-sm text-gray-600 mt-2">
                            <p>Phone: ${seller?.phone || '1234567890'}</p>
                            <p>Address: ${seller?.address || '123 Main St'}</p>
                            <p>Web: ${seller?.storeLink || 'www.yourbusiness.com'}</p>
                            <p>GST: ${seller?.gstIN || 'GSTIN12345'}</p>
                        </div>
                        <div class="mt-4">
                            <p>Bill No: #12345</p>
                            <p>Order from: Dine-in</p>
                        </div>
                        <div class="mt-4 border-t border-b py-2">
                            <table class="w-full">
                                <thead>
                                    <tr class="text-left">
                                        <th class="py-1 px-2">Qt</th>
                                        <th class="py-1">Item</th>
                                        <th class="py-1 text-right">Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td class="py-1 px-2">2</td>
                                        <td class="py-1">Butter Chicken</td>
                                        <td class="py-1 text-right">${UserSession?.getCurrency()}599</td>
                                    </tr>
                                    <tr>
                                        <td class="py-1 px-2">1</td>
                                        <td class="py-1">Jeera Rice</td>
                                        <td class="py-1 text-right">${UserSession?.getCurrency()}149</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="mt-4 text-right">
                            <p>Sub Total: ${UserSession?.getCurrency()}748</p>
                            <p>Discount: -${UserSession?.getCurrency()}50</p>
                            <p>GST: ${UserSession?.getCurrency()}35</p>
                            <p class="font-bold mt-2">TOTAL: ${UserSession?.getCurrency()}733</p>
                        </div>
                        <div class="mt-4 text-right">
                            <p>Payment mode: Cash</p>
                        </div>
                        ${templateType === 'bill' ? `
                            <div class="mt-4 flex justify-center">
                                <div class="w-32 h-32 bg-gray-200 flex items-center justify-center">
                                    <i class="ph ph-qr-code text-4xl"></i>
                                </div>
                            </div>
                        ` : ''}
                        <div class="mt-4 text-center text-sm">
                            <p>Thank you!</p>
                            <p>${new Date().toLocaleString()}</p>
                        </div>
                    `;
                }

                // Render template sections function
                sharedState.renderTemplateSections = function renderTemplateSections() {
                    console.log("Starting renderTemplateSections for type:", sharedState.currentTemplateType);
                    templateSections.innerHTML = '';

                    const currentTemplate = sharedState.templates[sharedState.currentTemplateType];
                    if (!currentTemplate || !currentTemplate.sections) {
                        console.error("No template or sections found for type:", sharedState.currentTemplateType);
                        return;
                    }

                    currentTemplate.sections.forEach((section, index) => {
                        const sectionCard = document.createElement('div');
                        sectionCard.className = 'border rounded-md p-3 bg-white shadow-sm';
                        sectionCard.dataset.index = index;

                        // Format toolbar
                        const toolbar = document.createElement('div');
                        toolbar.className = 'flex justify-between items-center mb-2';

                        const formatControls = document.createElement('div');
                        formatControls.className = 'flex items-center space-x-2';

                        // Font size selector
                        const fontSizeSelect = document.createElement('select');
                        fontSizeSelect.className = 'px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-red-500';
                        fontSizeSelect.innerHTML = `
                            <option value="12" ${section.fontSize === 12 ? 'selected' : ''}>${t('fontSize')} 12</option>
                            <option value="14" ${section.fontSize === 14 ? 'selected' : ''}>${t('fontSize')} 14</option>
                            <option value="16" ${section.fontSize === 16 ? 'selected' : ''}>${t('fontSize')} 16</option>
                            <option value="18" ${section.fontSize === 18 ? 'selected' : ''}>${t('fontSize')} 18</option>
                            <option value="20" ${section.fontSize === 20 ? 'selected' : ''}>${t('fontSize')} 20</option>
                            <option value="22" ${section.fontSize === 22 ? 'selected' : ''}>${t('fontSize')} 22</option>
                            <option value="24" ${section.fontSize === 24 ? 'selected' : ''}>${t('fontSize')} 24</option>
                            <option value="26" ${section.fontSize === 26 ? 'selected' : ''}>${t('fontSize')} 26</option>
                            <option value="28" ${section.fontSize === 28 ? 'selected' : ''}>${t('fontSize')} 28</option>
                            <option value="30" ${section.fontSize === 30 ? 'selected' : ''}>${t('fontSize')} 30</option>
                        `;

                        // Alignment selector
                        const alignmentSelect = document.createElement('select');
                        alignmentSelect.className = 'px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-red-500';
                        alignmentSelect.innerHTML = `
                            <option value="TextAlign.left" ${section.alignment === 'TextAlign.left' ? 'selected' : ''}>${t('alignLeft')}</option>
                            <option value="TextAlign.center" ${section.alignment === 'TextAlign.center' ? 'selected' : ''}>${t('alignCenter')}</option>
                            <option value="TextAlign.right" ${section.alignment === 'TextAlign.right' ? 'selected' : ''}>${t('alignRight')}</option>
                        `;

                        // Style buttons container
                        const styleBtns = document.createElement('div');
                        styleBtns.className = 'flex items-center space-x-1';

                        // Bold button
                        const boldBtn = document.createElement('button');
                        boldBtn.className = `p-1.5 rounded ${section.isBold ? 'bg-red-100 text-red-600' : 'text-gray-600 hover:bg-gray-100'}`;
                        boldBtn.innerHTML = '<i class="ph ph-text-b"></i>';
                        boldBtn.title = 'Bold';

                        // Underline button
                        const underlineBtn = document.createElement('button');
                        underlineBtn.className = `p-1.5 rounded ${section.isUnderlined ? 'bg-red-100 text-red-600' : 'text-gray-600 hover:bg-gray-100'}`;
                        underlineBtn.innerHTML = '<i class="ph ph-text-underline"></i>';
                        underlineBtn.title = 'Underline';

                        // Delete button
                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50';
                        deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
                        deleteBtn.title = 'Delete Section';

                        // Insert Variable (moved to toolbar)
                        const insertVariableBtn = document.createElement('button');
                        insertVariableBtn.className = 'p-1.5 rounded text-gray-600 hover:bg-gray-100 hover:text-red-600';
                        insertVariableBtn.innerHTML = '<i class="ph ph-brackets-curly"></i>';
                        insertVariableBtn.title = 'Insert Variable';
                        insertVariableBtn.addEventListener('click', () => {
                            const ta = sectionCard.querySelector('textarea');
                            if (ta) showVariablesList(ta);
                        });

                        // Right-side controls group
                        const rightControls = document.createElement('div');
                        rightControls.className = 'flex items-center space-x-2';
                        rightControls.appendChild(insertVariableBtn);
                        rightControls.appendChild(deleteBtn);

                        // Add event listeners
                        fontSizeSelect.addEventListener('change', () => {
                            sharedState.templates[sharedState.currentTemplateType].sections[index].fontSize = parseInt(fontSizeSelect.value);
                            if (sharedState.updatePreview) sharedState.updatePreview();
                        });

                        alignmentSelect.addEventListener('change', () => {
                            sharedState.templates[sharedState.currentTemplateType].sections[index].alignment = alignmentSelect.value;
                            const textArea = sectionCard.querySelector('textarea');
                            if (textArea) {
                                textArea.className = textArea.className.replace(/text-(left|center|right)/,
                                    alignmentSelect.value === 'TextAlign.center' ? 'text-center' :
                                        alignmentSelect.value === 'TextAlign.right' ? 'text-right' :
                                            'text-left'
                                );
                            }
                            if (sharedState.updatePreview) sharedState.updatePreview();
                        });

                        boldBtn.addEventListener('click', () => {
                            sharedState.templates[sharedState.currentTemplateType].sections[index].isBold = !sharedState.templates[sharedState.currentTemplateType].sections[index].isBold;
                            boldBtn.classList.toggle('bg-red-100');
                            boldBtn.classList.toggle('text-red-500');
                            const textArea = sectionCard.querySelector('textarea');
                            if (textArea) {
                                textArea.classList.toggle('font-bold');
                            }
                            if (sharedState.updatePreview) sharedState.updatePreview();
                        });

                        underlineBtn.addEventListener('click', () => {
                            sharedState.templates[sharedState.currentTemplateType].sections[index].isUnderlined = !sharedState.templates[sharedState.currentTemplateType].sections[index].isUnderlined;
                            underlineBtn.classList.toggle('bg-red-100');
                            underlineBtn.classList.toggle('text-red-500');
                            const textArea = sectionCard.querySelector('textarea');
                            if (textArea) {
                                textArea.classList.toggle('underline');
                            }
                            if (sharedState.updatePreview) sharedState.updatePreview();
                        });

                        deleteBtn.addEventListener('click', () => {
                            if (sharedState.templates[sharedState.currentTemplateType].sections.length <= 1) {
                                errorContainer.textContent = t('cannotDeleteLastSection');
                                errorContainer.classList.remove('hidden');
                                return;
                            }

                            if (confirm(t('confirmDeleteSection'))) {
                                sharedState.templates[sharedState.currentTemplateType].sections.splice(index, 1);
                                sharedState.renderTemplateSections();
                                if (sharedState.updatePreview) sharedState.updatePreview();
                            }
                        });

                        // Assemble toolbar
                        formatControls.appendChild(fontSizeSelect);
                        formatControls.appendChild(alignmentSelect);
                        styleBtns.appendChild(boldBtn);
                        styleBtns.appendChild(underlineBtn);
                        formatControls.appendChild(styleBtns);
                        toolbar.appendChild(formatControls);
                        toolbar.appendChild(rightControls);
                        sectionCard.appendChild(toolbar);

                        // Create textarea container
                        const textAreaContainer = document.createElement('div');
                        textAreaContainer.className = 'relative';

                        // Get text alignment class
                        let alignmentClass = 'text-left';
                        if (section.alignment === 'TextAlign.center') alignmentClass = 'text-center';
                        if (section.alignment === 'TextAlign.right') alignmentClass = 'text-right';

                        // Create textarea
                        const textArea = document.createElement('textarea');
                        textArea.className = `w-full min-h-28 p-3 border rounded-lg transition-all ${alignmentClass} ${section.isBold ? 'font-bold' : ''} ${section.isUnderlined ? 'underline' : ''} focus:outline-none focus:ring-2 focus:ring-red-500 text-sm font-mono leading-6`;
                        textArea.value = section.template || '';
                        textArea.placeholder = t('enterTemplateContent');

                        // Auto-size textarea (no internal scrollbars) and expand editor width if needed
                        textArea.style.overflow = 'hidden';
                        textArea.style.resize = 'none';
                        const autoResizeTA = () => {
                            textArea.style.height = 'auto';
                            textArea.style.height = Math.max(textArea.scrollHeight, 112) + 'px';
                            const editorContainer = document.getElementById('print-template-editor-modal');
                            if (editorContainer && typeof editorContainer._lp_adjustEditorWidth === 'function') {
                                editorContainer._lp_adjustEditorWidth();
                            }
                        };
                        setTimeout(autoResizeTA, 0);

                        // Add input event listener to persist text
                        textArea.addEventListener('input', () => {
                            const sectionIndex = parseInt(textArea.closest('[data-index]').dataset.index);
                            sharedState.templates[sharedState.currentTemplateType].sections[sectionIndex].template = textArea.value;
                            autoResizeTA();
                            if (sharedState.updatePreview) sharedState.updatePreview();
                        });

                        // Hashtag autocomplete: show variable list when typing '#...'
                        const handleHashtagTrigger = (e) => {
                            const caret = textArea.selectionStart;
                            const before = textArea.value.substring(0, caret);
                            const hashIndex = before.lastIndexOf('#');
                            // If '#' exists and is not part of a previous word with whitespace before caret
                            if (hashIndex >= 0) {
                                const fragment = before.substring(hashIndex + 1);
                                // Stop if there's a space or newline in the fragment (hashtag ended)
                                if (/\s/.test(fragment)) {
                                    // Hide dropdown if open
                                    const dd = document.getElementById('variables-dropdown');
                                    if (dd) dd.style.display = 'none';
                                    return;
                                }
                                // Show filtered list near caret
                                showVariablesList(textArea, fragment);
                            }
                        };
                        textArea.addEventListener('keyup', (e) => {
                            if (e.key === '#' || e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                                handleHashtagTrigger(e);
                            }
                        });
                        textArea.addEventListener('keydown', (e) => {
                            const dd = document.getElementById('variables-dropdown');
                            if (e.key === 'Escape') {
                                if (dd) dd.style.display = 'none';
                                return;
                            }
                            if (!dd || dd.style.display === 'none') return;
                            if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
                                e.preventDefault();
                                const items = Array.from(dd.querySelectorAll('.variable-item'));
                                if (!items.length) return;
                                let idx = parseInt(dd.dataset.activeIndex || '0', 10);
                                if (e.key === 'ArrowDown') idx = (idx + 1) % items.length;
                                if (e.key === 'ArrowUp') idx = (idx - 1 + items.length) % items.length;
                                // Update selection styles
                                items.forEach((el, i) => {
                                    if (i === idx) el.classList.add('bg-gray-100'); else el.classList.remove('bg-gray-100');
                                });
                                dd.dataset.activeIndex = String(idx);
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                    items[idx].click();
                                }
                            }
                        });
                        // Hide the dropdown on blur (slight delay to allow click)
                        textArea.addEventListener('blur', () => {
                            setTimeout(() => {
                                const dd = document.getElementById('variables-dropdown');
                                if (dd) dd.style.display = 'none';
                            }, 150);
                        });

                        // Assemble textarea container
                        textAreaContainer.appendChild(textArea);
                        sectionCard.appendChild(textAreaContainer);

                        // Add section to template
                        templateSections.appendChild(sectionCard);
                    });
                };

                // Show variables list for insertion
                function showVariablesList(textArea, filter = '') {
                    // Create dropdown for variables if it doesn't exist
                    let variablesDropdown = document.getElementById('variables-dropdown');
                    if (!variablesDropdown) {
                        variablesDropdown = document.createElement('div');
                        variablesDropdown.id = 'variables-dropdown';
                        variablesDropdown.className = 'absolute bg-white border rounded-md shadow-lg p-2 max-h-60 overflow-y-auto';
                        variablesDropdown.style.width = '250px';
                        variablesDropdown.style.display = 'none';
                        variablesDropdown.style.zIndex = '1000';
                        document.body.appendChild(variablesDropdown);
                        // Global outside click handler
                        document.addEventListener('mousedown', (evt) => {
                            const dd = document.getElementById('variables-dropdown');
                            if (!dd || dd.style.display === 'none') return;
                            if (!dd.contains(evt.target)) {
                                dd.style.display = 'none';
                            }
                        });
                    }

                    // Populate dropdown with variables
            const allVars = [
                            { name: 'businessName', label: 'Business Name' },
                            { name: 'logo', label: 'Business Logo' },
                            { name: 'phone', label: 'Phone Number' },
                            { name: 'address', label: 'Address' },
                            { name: 'storeLink', label: 'Store Website' },
                            { name: 'gstIN', label: 'GST Number' },
                            { name: 'billNo', label: 'Bill Number' },
                            { name: 'orderSource', label: 'Order Source' },
                            { name: 'payMode', label: 'Payment Mode' },
                            { name: 'timestamp', label: 'Date & Time' },
                            { name: 'cut', label: 'Divider Line' },
                            { name: 'upiQR', label: 'UPI QR Code' },
                            { name: 'itemsList', label: 'Items List (Bill)' },
                            { name: 'kotItemsList', label: 'Items List (KOT)' },
                            { name: 'subtotal', label: 'Subtotal' },
                            { name: 'discount', label: 'Discount' },
                            { name: 'charges', label: 'Additional Charges' },
                            { name: 'cgst', label: 'CGST Amount' },
                            { name: 'sgst', label: 'SGST Amount' },
                            { name: 'cgstPercent', label: 'CGST Percentage' },
                            { name: 'sgstPercent', label: 'SGST Percentage' },
                            { name: 'total', label: 'Total Amount' },
                            { name: 'instructions', label: 'Special Instructions' },
                            { name: 'customerName', label: 'Customer Name' },
                            { name: 'customerPhone', label: 'Customer Phone' },
                            { name: 'settlementStatus', label: 'Settlement Status' },
                            { name: 'settledAmount', label: 'Settled Amount' },
                            { name: 'pendingAmount', label: 'Pending Amount' },
                { name: 'paymentCount', label: 'Payment Count' },
                { name: 'partialPaymentDetails', label: 'Partial Payments Details' },
                { name: 'bulkTaxHashtag', label: 'Tax ID / Bulk Tax Hashtag' },
                // Split bill variables
                { name: 'split_bill_enabled', label: 'Split Bill Enabled' },
                { name: 'split_bill_people', label: 'Split Bill People' },
                { name: 'split_bill_type', label: 'Split Bill Type' },
                { name: 'split_bill_amount_per_person', label: 'Split Bill Amount Per Person' },
                { name: 'split_bill_details', label: 'Split Bill Details' }
                        ];
                    const filtered = filter ? allVars.filter(v => v.name.toLowerCase().startsWith(filter.toLowerCase())) : allVars;
                    variablesDropdown.innerHTML = `
                        <div class="text-sm font-medium text-gray-700 mb-2">${t('insertVariable')}</div>
                        <div class="space-y-1">
                            ${filtered.map(variable => `
                                <div class="variable-item p-1 hover:bg-gray-100 rounded cursor-pointer" data-variable="${variable.name}">
                                    <span class="text-red-500">#${variable.name}</span> - ${variable.label}
                                </div>
                            `).join('')}
                        </div>
                    `;
                    variablesDropdown.dataset.activeIndex = '0';
                    const allItems = variablesDropdown.querySelectorAll('.variable-item');
                    if (allItems.length) allItems[0].classList.add('bg-gray-100');

                    // Position dropdown near caret inside textarea
                    const getCaretClientPosition = (ta) => {
                        const selEnd = ta.selectionEnd;
                        const style = window.getComputedStyle(ta);
                        const taRect = ta.getBoundingClientRect();
                        const div = document.createElement('div');
                        div.style.position = 'absolute';
                        div.style.whiteSpace = 'pre-wrap';
                        div.style.wordWrap = 'break-word';
                        div.style.visibility = 'hidden';
                        div.style.fontFamily = style.fontFamily;
                        div.style.fontSize = style.fontSize;
                        div.style.lineHeight = style.lineHeight;
                        div.style.padding = style.padding;
                        div.style.border = style.border;
                        div.style.width = ta.clientWidth + 'px';
                        // Position the mirror at the same place as the textarea
                        div.style.left = `${taRect.left + window.scrollX}px`;
                        div.style.top = `${taRect.top + window.scrollY}px`;
                        const text = ta.value.substring(0, selEnd)
                            .replace(/\r?\n$/g, '\n ') // preserve last line
                            .replace(/\r?\n/g, '<br/>')
                            .replace(/\s/g, '&nbsp;');
                        div.innerHTML = text + '<span id="caret-pos">\u200b</span>';
                        document.body.appendChild(div);
                        const marker = div.querySelector('#caret-pos');
                        const rect = marker.getBoundingClientRect();
                        const res = { left: rect.left + window.scrollX, top: rect.top + window.scrollY };
                        document.body.removeChild(div);
                        return res;
                    };
                    const pos = getCaretClientPosition(textArea);
                    const lineH = parseFloat(window.getComputedStyle(textArea).lineHeight) || 20;
                    let top = pos.top + lineH + 6 - textArea.scrollTop;
                    let left = pos.left - textArea.scrollLeft;
                    // Clamp within viewport
                    const ddWidth = 250; // as set in style.width
                    const margin = 8;
                    const maxLeft = window.scrollX + window.innerWidth - ddWidth - margin;
                    const minLeft = window.scrollX + margin;
                    if (left > maxLeft) left = maxLeft;
                    if (left < minLeft) left = minLeft;
                    variablesDropdown.style.top = `${top}px`;
                    variablesDropdown.style.left = `${left}px`;
                    variablesDropdown.style.display = 'block';

                    // Handle variable click
                    const variableItems = variablesDropdown.querySelectorAll('.variable-item');
                    variableItems.forEach(item => {
                        item.addEventListener('click', () => {
                            const variable = item.dataset.variable;
                            const caret = textArea.selectionStart;
                            const before = textArea.value.substring(0, caret);
                            const after = textArea.value.substring(caret);
                            const hashIndex = before.lastIndexOf('#');
                            const start = hashIndex >= 0 ? hashIndex : caret;
                            const newText = before.substring(0, start) + `#${variable}` + after;
                            textArea.value = newText;
                            // Place caret after inserted variable
                            const newCaret = start + variable.length + 1;
                            textArea.setSelectionRange(newCaret, newCaret);

                            // Update the section content
                            const sectionIndex = parseInt(textArea.closest('[data-index]').dataset.index);
                            sharedState.templates[sharedState.currentTemplateType].sections[sectionIndex].template = newText;

                            // Update the live preview
                            if (sharedState.updatePreview) sharedState.updatePreview();

                            // Close the dropdown
                            variablesDropdown.style.display = 'none';
                        });
                    });

                    // Close dropdown when clicking elsewhere
                    const handleClickOutside = (e) => {
                        if (!variablesDropdown.contains(e.target) && e.target !== textArea) {
                            variablesDropdown.style.display = 'none';
                            document.removeEventListener('click', handleClickOutside);
                        }
                    };

                    // Delay adding the event listener to prevent immediate closure
                    setTimeout(() => {
                        document.addEventListener('click', handleClickOutside);
                    }, 10);

                }

                // Add new section
                function addNewSection() {
                    sharedState.templates[sharedState.currentTemplateType].sections.push({
                        content: '',
                        fontSize: 24,
                        alignment: 'TextAlign.left',
                        isBold: false,
                        isUnderlined: false
                    });
                    sharedState.renderTemplateSections();
                    if (sharedState.updatePreview) sharedState.updatePreview();
                }

                // Reset to default
                function resetToDefault() {
                    if (confirm(t('confirmResetToDefault'))) {
                        sharedState.templates[sharedState.currentTemplateType] = sharedState.currentTemplateType === 'bill' ?
                            getDefaultBillTemplate() : getDefaultKOTTemplate();
                        sharedState.renderTemplateSections();
                        if (sharedState.updatePreview) sharedState.updatePreview();
                    }
                }

                // Save template
                async function saveTemplate() {
                    try {
                        console.log("Saving templates to profile:", sharedState.templates);
                        await sdk.profile.update({
                            printTemplate: sharedState.templates
                        });
                        ModalManager.showToast(t('printTemplateSaved'));
                        
                        // Close both windows
                        if (sharedState.editorModal) sharedState.editorModal.close();
                        if (sharedState.previewModal) sharedState.previewModal.close();
                    } catch (error) {
                        console.error('Error saving print template:', error);
                        errorContainer.textContent = t('failedToSaveTemplate');
                        errorContainer.classList.remove('hidden');
                    }
                }

                // Open preview window function
                function openPreviewWindow() {
                    if (sharedState.previewModal) {
                        // If preview window already exists, just bring it to front
                        return;
                    }

                    // Create Preview Window (Right)
                    sharedState.previewModal = ModalManager.createCenterModal({
                        id: 'print-template-preview-modal',
                        title: t('templatePreview'),
                        content: `
                            <div class="space-y-4 px-4 mx-auto" style="width: 400px;">
                                <div class="flex justify-between items-center">
                                    <h3 class="text-lg font-medium">${t('livePreview')}</h3>
                                    <div class="text-sm text-gray-500">${sharedState.currentTemplateType.toUpperCase()} ${t('template')}</div>
                                </div>
                                
                                <div class="bg-gray-50 p-3 rounded-md text-sm text-gray-700 flex items-start">
                                    <i class="ph ph-info mr-2 mt-0.5 text-gray-500"></i>
                                    <p>${t('previewInfo')}</p>
                                </div>
                                
                                <div class="border-2 border-dashed border-gray-300 p-4 rounded-lg min-h-[500px] overflow-auto max-w-[430px] mx-auto">
                                    <div id="live-preview-container" class="text-sm max-w-[380px] mx-auto px-4">
                                        <!-- Live preview content will be rendered here -->
                                    </div>
                                </div>
                            </div>
                        `,
                        actions: `
                            <div class="flex justify-center px-4 py-1">
                                <button id="refresh-preview-btn" class="px-4 py-1.5 border rounded-md hover:bg-gray-50">
                                    <i class="ph ph-arrows-clockwise mr-1"></i> ${t('refreshPreview')}
                                </button>
                            </div>
                        `,
                        size: 'xl',
                        closeOnBackdropClick: false,
                        windowed: true,
                        zIndex: 61,
                        onShown: (previewModalControl) => {
                            sharedState.previewModal = previewModalControl;
                            // Remove the close (X) button from the preview window header
                            try {
                                const previewContainer = document.getElementById('print-template-preview-modal');
                                const xBtn = previewContainer?.querySelector('#print-template-preview-modal-close-btn');
                                if (xBtn && xBtn.parentElement) {
                                    xBtn.parentElement.removeChild(xBtn);
                                }
                            } catch (_) {}
                            
                            // Position preview window on the right side (windowed uses fixed panel)
                            setTimeout(() => {
                                const previewContainer = document.getElementById('print-template-preview-modal');
                                if (previewContainer) {
                                    const modalContent = previewContainer.querySelector('.bg-white.w-full');
                                    if (modalContent) {
                                        // Place preview window closer to the editor window (left window)
                                        // Editor is at left: 140px, width: 500px; so preview should be just to its right
                                        const editorLeft = 140;
                                        const editorWidth = 500;
                                        const gap = 120; // gap between windows
                                        modalContent.style.left = `${editorLeft + editorWidth + gap}px`;
                                        modalContent.style.top = '40px';
                                    }
                                }
                            }, 150);
                            
                            const livePreviewContainer = document.getElementById('live-preview-container');
                            const refreshPreviewBtn = document.getElementById('refresh-preview-btn');

                            // Generate HTML for the preview
                            function generatePreviewHTML(templateType) {
                                // Create a mock test order for the preview
                                const testOrder = {
                                    id: 'PREVIEW-123',
                                    billNo: 'PREVIEW-123',
                                    date: new Date(),
                                    tableId: 'Preview',
                                    priceVariant: 'Dine-in',
                                    items: [
                                        { title: 'Butter Chicken', quantity: 2, price: 299.50 },
                                        { title: 'Jeera Rice', quantity: 1, price: 149.00 }
                                    ],
                                    discount: 50,
                                    charges: [
                                        { name: 'Service Charge', value: 30 }
                                    ],
                                    total: 733.00,
                                    payMode: 'CASH'
                                };

                                // Check if we have a custom template and it has sections
                                const currentTemplate = sharedState.templates[templateType];

                                if (currentTemplate && currentTemplate.sections && currentTemplate.sections.length > 0) {
                                    // Use the PrintTemplate class directly to generate HTML based on the current template
                                    if (PrintTemplate) {
                                        try {
                                            // Ensure seller data has necessary fields
                                            const sellerData = {
                                                businessName: seller?.businessName || 'Your Business',
                                                logo: seller?.logo || '',
                                                phone: seller?.phone || '',
                                                address: seller?.address || '',
                                                website: seller?.storeLink || seller?.website || '',
                                                gstIN: seller?.gstIN || seller?.gstNo || '',
                                                upiId: seller?.upiId || ''
                                            };

                                            // Create a PrintTemplate instance and generate HTML
                                            const template = new PrintTemplate({
                                                orderData: testOrder,
                                                seller: sellerData,
                                                type: templateType,
                                                templateData: currentTemplate
                                            });

                                            const fullHtml = template.toHTML();
                                            // Extract only the <body> content so styles from the main page apply
                                            const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                                            const bodyInner = bodyMatch ? bodyMatch[1] : fullHtml;
                                            // Wrap in a centered container with padding
                                            return `<div style="max-width:58mm; margin:0 auto; padding: 0 12px;">${bodyInner}</div>`;
                                        } catch (error) {
                                            console.error('Error generating template preview:', error);
                                            return `<div class="text-center text-red-500 p-4">
                                                <i class="ph ph-warning-circle text-3xl mb-2"></i>
                                                <p>Error generating preview: ${error.message}</p>
                                            </div>`;
                                        }
                                    }
                                }

                                // Fallback to default preview
                                return `
                                    <div class="text-center" style="max-width:58mm; margin:0 auto; padding: 0 12px;">
                                        <div class="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-2">
                                            <i class="ph ph-storefront text-red-500 text-2xl"></i>
                                        </div>
                                        <h2 class="text-xl font-bold">${seller?.businessName || 'Your Business Name'}</h2>
                                    </div>
                                    <div class="text-center text-sm text-gray-600 mt-2">
                                        <p>Phone: ${seller?.phone || '1234567890'}</p>
                                        <p>Address: ${seller?.address || '123 Main St'}</p>
                                        <p>Web: ${seller?.storeLink || 'www.yourbusiness.com'}</p>
                                        <p>GST: ${seller?.gstIN || 'GSTIN12345'}</p>
                                    </div>
                                    <div class="mt-4">
                                        <p>Bill No: #PREVIEW-123</p>
                                        <p>Order from: Dine-in</p>
                                    </div>
                                    <div class="mt-4 border-t border-b py-2">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="text-left">
                                                    <th class="py-1 px-2">Qt</th>
                                                    <th class="py-1">Item</th>
                                                    <th class="py-1 text-right">Price</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td class="py-1 px-2">2</td>
                                                    <td class="py-1">Butter Chicken</td>
                                                    <td class="py-1 text-right">${UserSession?.getCurrency()}599</td>
                                                </tr>
                                                <tr>
                                                    <td class="py-1 px-2">1</td>
                                                    <td class="py-1">Jeera Rice</td>
                                                    <td class="py-1 text-right">${UserSession?.getCurrency()}149</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div class="mt-4 text-right">
                                        <p>Sub Total: ${UserSession?.getCurrency()}748</p>
                                        <p>Discount: -${UserSession?.getCurrency()}50</p>
                                        <p>GST: ${UserSession?.getCurrency()}35</p>
                                        <p class="font-bold mt-2">TOTAL: ${UserSession?.getCurrency()}733</p>
                                    </div>
                                    <div class="mt-4 text-right">
                                        <p>Payment mode: Cash</p>
                                    </div>
                                    ${templateType === 'bill' ? `
                                        <div class="mt-4 flex justify-center">
                                            <div class="w-32 h-32 bg-gray-200 flex items-center justify-center">
                                                <i class="ph ph-qr-code text-4xl"></i>
                                            </div>
                                        </div>
                                    ` : ''}
                                    <div class="mt-4 text-center text-sm">
                                        <p>Thank you!</p>
                                        <p>${new Date().toLocaleString()}</p>
                                    </div>
                                `;
                            }

                            // Update preview function
                            sharedState.updatePreview = function() {
                                livePreviewContainer.innerHTML = generatePreviewHTML(sharedState.currentTemplateType);
                                // Post-process QR placeholders using QRCode library if available
                                try {
                                    const qrs = livePreviewContainer.querySelectorAll('.lp-qr');
                                    if (qrs && qrs.length) {
                                        qrs.forEach(node => {
                                            const text = node.getAttribute('data-qr-text');
                                            const size = parseInt(node.getAttribute('data-size') || '128', 10);
                                            if (!text) return;
                                            // Prefer QRCode library if present
                                            if (window.QRCode && window.QRCode.toCanvas) {
                                                node.innerHTML = '';
                                                const canvas = document.createElement('canvas');
                                                node.appendChild(canvas);
                                                window.QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, (err) => {
                                                    if (err) console.warn('QR render error:', err);
                                                });
                                            } else {
                                                // Fallback: use a remote QR service to generate an image
                                                node.innerHTML = '';
                                                const img = document.createElement('img');
                                                img.width = size; img.height = size;
                                                img.alt = 'QR'; img.loading = 'lazy';
                                                const enc = encodeURIComponent(text);
                                                const src1 = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&data=${enc}`;
                                                const src2 = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chld=L|1&chl=${enc}`;
                                                img.src = src1;
                                                img.onerror = () => { img.onerror = null; img.src = src2; };
                                                node.appendChild(img);
                                            }
                                        });
                                    }
                                } catch (e) {
                                    console.warn('QR post-process failed:', e);
                                }
                            };

                            // Manual refresh button
                            refreshPreviewBtn.addEventListener('click', () => {
                                sharedState.updatePreview();
                            });

                            // Initial preview generation
                            sharedState.updatePreview();
                        },
                        onClose: () => {
                            // Prevent close loop
                            if (!sharedState._syncClosing) {
                                sharedState._syncClosing = true;
                                if (sharedState.editorModal) {
                                    try { sharedState.editorModal.close(); } catch (e) {}
                                }
                            }
                            sharedState.previewModal = null;
                            sharedState.updatePreview = null;
                            // Allow reopening later
                            setTimeout(() => { sharedState._syncClosing = false; }, 0);
                        }
                    });
                }

                // Tab switching functionality
                billTab.addEventListener('click', () => {
                    sharedState.currentTemplateType = 'bill';
                    billTab.classList.add('bg-red-500', 'text-white');
                    billTab.classList.remove('border', 'border-gray-200', 'text-gray-700');
                    kotTab.classList.remove('bg-red-500', 'text-white');
                    kotTab.classList.add('border', 'border-gray-200', 'text-gray-700');
                    sharedState.renderTemplateSections();
                    if (sharedState.updatePreview) sharedState.updatePreview();
                });

                kotTab.addEventListener('click', () => {
                    sharedState.currentTemplateType = 'kot';
                    kotTab.classList.add('bg-red-500', 'text-white');
                    kotTab.classList.remove('border', 'border-gray-200', 'text-gray-700');
                    billTab.classList.remove('bg-red-500', 'text-white');
                    billTab.classList.add('border', 'border-gray-200', 'text-gray-700');
                    sharedState.renderTemplateSections();
                    if (sharedState.updatePreview) sharedState.updatePreview();
                });

                // Button event listeners
                addSectionBtn.addEventListener('click', addNewSection);
                // Auto-open the Preview window so both windows appear together
                // Call immediately so both render in the same moment
                try { openPreviewWindow(); } catch (_) {}
                resetBtn.addEventListener('click', resetToDefault);
                saveBtn.addEventListener('click', saveTemplate);

                // Initial render
                sharedState.renderTemplateSections();

            },
            onClose: () => {
                // Close preview too (avoid loop with guard)
                if (!sharedState._syncClosing) {
                    sharedState._syncClosing = true;
                    if (sharedState.previewModal) {
                        try { sharedState.previewModal.close(); } catch (e) {}
                    }
                }
                sharedState.editorModal = null;
                // Allow reopening later
                setTimeout(() => { sharedState._syncClosing = false; }, 0);
            }
        });
    };

    // Handle bulk tax update
    const handleBulkTaxUpdate = () => {
        if (!sdk) {
            showToast("SDK not loaded. Please try again later.");
            return;
        }

        // Create modal
        ModalManager.createCenterModal({
            id: 'bulk-tax-update-modal',
            title: t('bulkTaxUpdate'),
            content: `
                <div class="p-4">
                    <div id="tax-update-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                    
                    <div class="mb-4">
                        <p class="text-sm text-gray-600 mb-4">
                            ${t('updateTaxRatesInfo')}
                        </p>
                    </div>
                    
                    <div class="mb-6">
                        <div class="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                            <div class="flex items-start">
                                <i class="ph ph-warning-circle text-amber-500 mt-0.5 mr-2 text-lg"></i>
                                <p class="text-sm text-amber-700">
                                    ${t('updateTaxWarning')}
                                </p>
                            </div>
                        </div>
                        
                        <div id="tax-config-container" class="space-y-4">
                            <!-- Tax items will be added here -->
                        </div>
                        
                        <div class="mt-4">
                            <button id="add-tax-btn" class="flex items-center text-sm text-blue-600 hover:text-blue-800">
                                <i class="ph ph-plus-circle mr-1"></i>
                                ${t('addAnotherTax')}
                            </button>
                        </div>
                    </div>
                </div>
            `,
            actions: `
                <div class="flex justify-end p-4 space-x-3">
                    <button id="cancel-tax-update-btn" class="px-4 py-2 border rounded-md hover:bg-gray-50">${t('cancel')}</button>
                    <button id="save-tax-update-btn" class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">${t('updateAllProducts')}</button>
                </div>
            `,
            size: 'md',
            onShown: (modalControl) => {
                // Add language change listener to refresh modal content
                const handleLanguageChange = () => {
                    // Update modal title
                    modalControl.setTitle(t('bulkTaxUpdate'));
                    
                    // Update modal content
                    modalControl.setContent(`
                        <div class="p-4">
                            <div id="tax-update-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                            
                            <div class="mb-4">
                                <p class="text-sm text-gray-600 mb-4">
                                    ${t('updateTaxRatesInfo')}
                                </p>
                            </div>
                            
                            <div class="mb-6">
                                <div class="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                                    <div class="flex items-start">
                                        <i class="ph ph-warning-circle text-amber-500 mt-0.5 mr-2 text-lg"></i>
                                        <p class="text-sm text-amber-700">
                                            ${t('updateTaxWarning')}
                                        </p>
                                    </div>
                                </div>
                                
                                <div id="tax-config-container" class="space-y-4">
                                    <!-- Tax items will be added here -->
                                </div>
                                
                                <div class="mt-4">
                                    <button id="add-tax-btn" class="flex items-center text-sm text-blue-600 hover:text-blue-800">
                                        <i class="ph ph-plus-circle mr-1"></i>
                                        ${t('addAnotherTax')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    `);
                    
                    // Update modal actions
                    modalControl.setActions(`
                        <div class="flex justify-end p-4 space-x-3">
                            <button id="cancel-tax-update-btn" class="px-4 py-2 border rounded-md hover:bg-gray-50">${t('cancel')}</button>
                            <button id="save-tax-update-btn" class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">${t('updateAllProducts')}</button>
                        </div>
                    `);
                };
                
                // Listen for language changes
                const languageChangeListener = () => {
                    setTimeout(handleLanguageChange, 100);
                };
                
                window.addEventListener('languageChange', languageChangeListener);
                
                // Clean up listener when modal is closed
                const originalClose = modalControl.close;
                modalControl.close = () => {
                    window.removeEventListener('languageChange', languageChangeListener);
                    originalClose();
                };
                
                const taxConfigContainer = document.getElementById('tax-config-container');
                const addTaxBtn = document.getElementById('add-tax-btn');
                const errorContainer = document.getElementById('tax-update-error-container');
                const cancelButton = document.getElementById('cancel-tax-update-btn');
                const saveButton = document.getElementById('save-tax-update-btn');

                // Keep track of tax items
                let taxItems = [];

                // Function to create a new tax item
                const createTaxItem = (data = {}) => {
                    const id = Date.now().toString();
                    const taxItem = {
                        id,
                        name: data.name || '',
                        value: data.value || '',
                        type: data.type || 'percentage',
                        inclusive: data.inclusive !== undefined ? data.inclusive : false
                    };

                    taxItems.push(taxItem);
                    return taxItem;
                };

                // Function to render a tax item
                const renderTaxItem = (taxItem) => {
                    const taxItemEl = document.createElement('div');
                    taxItemEl.className = 'tax-item border rounded-md p-3';
                    taxItemEl.dataset.id = taxItem.id;

                    taxItemEl.innerHTML = `
                        <div class="flex items-center justify-between mb-2">
                            <div class="font-medium">${t('taxConfiguration')}</div>
                            <button class="remove-tax-btn text-gray-400 hover:text-red-500 ${taxItems.length <= 1 ? 'hidden' : ''}">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                                <label class="block text-sm text-gray-600 mb-1">${t('taxName')}</label>
                                <input 
                                    type="text" 
                                    class="tax-name-input w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" 
                                    placeholder="${t('egGST')}" 
                                    value="${taxItem.name}"
                                />
                            </div>
                            <div>
                                <label class="block text-sm text-gray-600 mb-1">${t('taxValue')}</label>
                                <input 
                                    type="number" 
                                    class="tax-value-input w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" 
                                    placeholder="${t('eg18')}" 
                                    min="0" 
                                    max="100" 
                                    value="${taxItem.value}"
                                />
                            </div>
                            <div>
                                <label class="block text-sm text-gray-600 mb-1">${t('type')}</label>
                                <select 
                                    class="tax-type-input w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                    <option value="percentage" ${taxItem.type === 'percentage' ? 'selected' : ''}>${t('percentage')}</option>
                                    <option value="fixed" ${taxItem.type === 'fixed' ? 'selected' : ''}>${t('fixedAmount')} (${UserSession?.getCurrency()})</option>
                                </select>
                            </div>
                        </div>
                        <div class="flex items-center mt-4">
                            <label class="block text-sm text-gray-600 mr-2">${t('inclusive')}</label>
                            <input type="checkbox" class="tax-inclusive-input w-5 h-5 text-red-600 rounded focus:ring-red-500" ${taxItem.inclusive ? 'checked' : ''} />
                            <span class="ml-2 text-xs text-gray-500">${t('inclusiveInfo')}</span>
                        </div>
                    `;

                    // Add event listener for remove button
                    const removeBtn = taxItemEl.querySelector('.remove-tax-btn');
                    if (removeBtn) {
                        removeBtn.addEventListener('click', () => {
                            taxItems = taxItems.filter(item => item.id !== taxItem.id);
                            taxItemEl.remove();

                            // Show/hide remove buttons based on number of tax items
                            if (taxItems.length <= 1) {
                                document.querySelectorAll('.remove-tax-btn').forEach(btn => {
                                    btn.classList.add('hidden');
                                });
                            }
                        });
                    }

                    // Add event listeners to update tax item data
                    const nameInput = taxItemEl.querySelector('.tax-name-input');
                    const valueInput = taxItemEl.querySelector('.tax-value-input');
                    const typeInput = taxItemEl.querySelector('.tax-type-input');
                    const inclusiveInput = taxItemEl.querySelector('.tax-inclusive-input');

                    nameInput.addEventListener('input', () => {
                        const index = taxItems.findIndex(item => item.id === taxItem.id);
                        if (index !== -1) {
                            taxItems[index].name = nameInput.value;
                        }
                    });

                    valueInput.addEventListener('input', () => {
                        const index = taxItems.findIndex(item => item.id === taxItem.id);
                        if (index !== -1) {
                            taxItems[index].value = valueInput.value;
                        }
                    });

                    typeInput.addEventListener('change', () => {
                        const index = taxItems.findIndex(item => item.id === taxItem.id);
                        if (index !== -1) {
                            taxItems[index].type = typeInput.value;
                        }
                    });

                    inclusiveInput.addEventListener('change', () => {
                        const index = taxItems.findIndex(item => item.id === taxItem.id);
                        if (index !== -1) {
                            taxItems[index].inclusive = inclusiveInput.checked;
                        }
                    });

                    return taxItemEl;
                };

                // Function to add a new tax item
                const addTaxItem = (data = {}) => {
                    const taxItem = createTaxItem(data);
                    const taxItemEl = renderTaxItem(taxItem);
                    taxConfigContainer.appendChild(taxItemEl);

                    // Show remove buttons if there are multiple tax items
                    if (taxItems.length > 1) {
                        document.querySelectorAll('.remove-tax-btn').forEach(btn => {
                            btn.classList.remove('hidden');
                        });
                    }
                };

                // Add default tax item
                addTaxItem({ name: 'GST', value: '18', type: 'percentage' });

                // Add event listener for add tax button
                addTaxBtn.addEventListener('click', () => {
                    addTaxItem();
                });

                // Validation function
                const validateForm = () => {
                    // Reset error
                    errorContainer.classList.add('hidden');
                    errorContainer.textContent = '';

                    // Check if there are any tax items
                    if (taxItems.length === 0) {
                        errorContainer.textContent = t('pleaseEnterValidTaxValue') + ' ' + t('taxConfiguration').toLowerCase();
                        errorContainer.classList.remove('hidden');
                        return false;
                    }

                    // Validate each tax item
                    for (let i = 0; i < taxItems.length; i++) {
                        const taxItem = taxItems[i];

                        if (!taxItem.name.trim()) {
                            errorContainer.textContent = t('pleaseEnterTitle') + ' ' + t('taxName').toLowerCase() + ` #${i + 1}`;
                            errorContainer.classList.remove('hidden');
                            return false;
                        }

                        const taxValue = parseFloat(taxItem.value);
                        if (isNaN(taxValue) || taxValue < 0) {
                            errorContainer.textContent = t('pleaseEnterValidTaxValue') + ' ' + taxItem.name;
                            errorContainer.classList.remove('hidden');
                            return false;
                        }

                        if (taxItem.type === 'percentage' && taxValue > 100) {
                            errorContainer.textContent = t('percentage') + ' ' + t('taxValue').toLowerCase() + ' ' + t('cannotExceed100') + ' ' + taxItem.name;
                            errorContainer.classList.remove('hidden');
                            return false;
                        }
                    }

                    return true;
                };

                // Event handlers
                cancelButton.addEventListener('click', () => {
                    modalControl.close();
                });

                saveButton.addEventListener('click', async () => {
                    if (!validateForm()) return;

                    try {
                        // Show loading state
                        saveButton.disabled = true;
                        saveButton.innerHTML = `
                            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            ${t('updating')}
                        `;

                        // Prepare tax charges
                        const taxCharges = taxItems.map(item => ({
                            name: item.name.trim(),
                            value: item.type === 'percentage' ? `${parseFloat(item.value)}%` : parseFloat(item.value),
                            type: item.type,
                            inclusive: item.inclusive
                        }));

                        // Add timestamp and hashtag for tracking bulk tax updates
                        const updateTimestamp = new Date().toISOString();
                        const updateHashtag = `#BulkTaxUpdate_${Math.floor(Date.now() / 1000)}`;

                        // Get all products for this seller
                        const productsSnapshot = await sdk.db.collection("Product").get();

                        let successCount = 0;
                        const totalProducts = productsSnapshot.size;

                        // Update each product with the new tax configuration
                        const batch = sdk.db.firestore.batch();

                        productsSnapshot.forEach(doc => {
                            const productData = doc.data();

                            // Replace existing tax charges with the new ones
                            productData.charges = taxCharges;

                            // Add metadata for bulk tax update
                            productData.taxUpdateInfo = {
                                timestamp: updateTimestamp,
                                hashtag: updateHashtag,
                                isFromBulkUpdate: true
                            };

                            // Update the product in the batch
                            batch.update(doc.ref, {
                                charges: productData.charges,
                                taxUpdateInfo: productData.taxUpdateInfo
                            });
                            successCount++;
                        });

                        // Store the bulk tax update info in seller profile for reference
                        if (seller && seller.id) {
                            const sellerRef = sdk.profile;
                            batch.update(sellerRef, {
                                lastBulkTaxUpdate: {
                                    timestamp: updateTimestamp,
                                    hashtag: updateHashtag,
                                    taxes: taxCharges
                                }
                            });
                        }

                        // Commit all updates
                        await batch.commit();

                        ModalManager.showToast(t('successfullyUpdatedTax').replace('{count}', successCount));
                        modalControl.close();
                    } catch (error) {
                        console.error('Error updating product taxes:', error);
                        errorContainer.textContent = t('failedToUpdateTax');
                        errorContainer.classList.remove('hidden');

                        // Reset button
                        saveButton.disabled = false;
                        saveButton.textContent = t('updateAllProducts');
                    }
                });
            }
        });
    };

    // Handle product import
    const handleProductImport = () => {
        if (!sdk) {
            showToast(t('sdkNotLoaded'));
            return;
        }

        // Create modal
        ModalManager.createCenterModal({
            id: 'import-products-modal',
            title: t('bulkImportProducts'),
            content: `
                <div class="p-4 text-center">
                    <div class="mb-6">
                        <p class="font-medium text-gray-700">${t('step1')}</p>
                        <div class="flex justify-center items-center mt-2">
                            <span class="text-gray-700 mr-2">${t('downloadTemplateFile')}:</span>
                            <a href="https://firebasestorage.googleapis.com/v0/b/frihbi-app.appspot.com/o/assets%2FImport%20Product%20Sample%20sheet.xlsx?alt=media" class="text-red-500 font-medium hover:underline" download>${t('sampleXlsx')}</a>
                        </div>
                    </div>
                    <div class="mb-6">
                        <p class="font-medium text-gray-700">${t('step2')}</p>
                        <div id="file-upload-area" class="mt-2 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:bg-gray-50">
                            <i class="ph ph-upload text-gray-400 text-4xl"></i>
                            <p class="mt-2 font-medium">${t('uploadCsvXlsx')}</p>
                            <p class="text-sm text-gray-500">${t('maxFileSize')}</p>
                            <input type="file" id="import-file" class="hidden" accept=".csv, .xlsx" />
                        </div>
                    </div>
                </div>
            `,
            actions: `
                <div class="flex justify-center p-4">
                    <button id="start-import-btn" class="px-8 py-3 bg-red-500 text-white rounded-md font-medium">${t('start')}</button>
                </div>
            `,
            size: 'md',
            onShown: (modalControl) => {
                const fileUploadArea = document.getElementById('file-upload-area');
                const importFileInput = document.getElementById('import-file');
                const startImportBtn = document.getElementById('start-import-btn');

                let selectedFile = null;

                // Handle file upload area click
                fileUploadArea.addEventListener('click', () => {
                    importFileInput.click();
                });

                // Handle file selection
                importFileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        selectedFile = e.target.files[0];

                        // Update the upload area UI to show selected file
                        fileUploadArea.innerHTML = `
                            <i class="ph ph-check-circle text-green-500 text-4xl"></i>
                            <p class="mt-2 font-medium">${selectedFile.name}</p>
                            <p class="text-sm text-gray-500">${Math.round(selectedFile.size / 1024)} ${t('kilobytes')}</p>
                            <input type="file" id="import-file" class="hidden" accept=".csv, .xlsx" />
                        `;
                    }
                });

                // Handle import start
                startImportBtn.addEventListener('click', async () => {
                    if (!selectedFile) {
                        ModalManager.showToast(t('pleaseSelectFile'));
                        return;
                    }

                    try {
                        // Show loading state
                        startImportBtn.disabled = true;
                        startImportBtn.innerHTML = `
                            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            ${t('uploading')}...
                        `;

                        // Read file as array buffer for Firebase Storage
                        const fileReader = new FileReader();
                        fileReader.onload = async (event) => {
                            try {
                                const fileData = event.target.result;

                                // Generate a unique storage path
                                const storagePath = `seller/${seller.id}/import_product_${Date.now()}.xlsx`;

                                // Get a reference to the storage location
                                const storageRef = window.sdk.storage.ref(storagePath);

                                // Upload the file
                                await storageRef.put(new Uint8Array(fileData));

                                ModalManager.showToast(t('fileUploadSuccess'));
                                modalControl.close();
                            } catch (error) {
                                console.error('Error uploading file:', error);
                                ModalManager.showToast(t('fileUploadFailed'));

                                // Reset button
                                startImportBtn.disabled = false;
                                startImportBtn.textContent = 'Start';
                            }
                        };

                        fileReader.readAsArrayBuffer(selectedFile);
                    } catch (error) {
                        console.error('Error starting import:', error);
                        ModalManager.showToast(t('importFailed'));

                        // Reset button
                        startImportBtn.disabled = false;
                        startImportBtn.textContent = t('start');
                    }
                });
            }
        });
    };

    // Handle printer management
    const handlePrinterManagement = () => {
        if (!sdk) {
            showToast(t('sdkNotLoaded'));
            return;
        }

        // Get all available order channels
        const orderChannels = [];

        // Add the Default channel
        orderChannels.push('Default');

        // Add channels from price variants
        if (seller?.variants && Array.isArray(seller.variants)) {
            seller.variants.forEach(variant => {
                if (variant.title && variant.title !== 'Default' && !orderChannels.includes(variant.title)) {
                    orderChannels.push(variant.title);
                }
            });
        }

        // Get managed printers from BluetoothPrinting
        const bluetoothPrinting = BluetoothPrinting;
        const managedPrinters = bluetoothPrinting ? bluetoothPrinting.getSavedPrinters() : [];

        // Get currently connected printer info
        const currentlyConnected = bluetoothPrinting && bluetoothPrinting.connected;
        const connectedDevice = bluetoothPrinting && bluetoothPrinting.device;
        const connectedDeviceId = connectedDevice ? connectedDevice.id : null;
        const connectedDeviceName = connectedDevice ? connectedDevice.name : null;

        // Create modal
        ModalManager.createCenterModal({
            id: 'printer-management-modal',
            title: t('printerManagement'),
            content: `
                <div class="p-5">
                    <div id="printer-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-lg"></div>
                    
                    <div class="mb-5">
                        <p class="text-sm text-gray-600 leading-relaxed">
                            ${t('configurePrinters')}
                        </p>
                    </div>
                    
                    <div class="mb-5">
                        <div class="flex items-center">
                            <div class="w-3 h-3 rounded-full ${currentlyConnected ? 'bg-green-500' : 'bg-gray-300'} mr-2"></div>
                            <span class="text-sm ${currentlyConnected ? 'text-green-600' : 'text-gray-500'} font-medium">
                                ${currentlyConnected ? t('printerConnected') : t('noPrinterConnected')}
                            </span>
                        </div>
                    </div>
                    
                    <!-- Printer List -->
                    <div id="printer-list" class="mb-5 space-y-4">
                        ${currentlyConnected && connectedDevice ? `
                        <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200 shadow-sm">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center">
                                    <div class="w-10 h-10 bg-gradient-to-br from-green-100 to-green-200 rounded-lg flex items-center justify-center mr-3 shadow-sm">
                                        <i class="ph ${connectedDevice.type === 'wired' ? 'ph-plug' : 'ph-bluetooth'} text-green-600 text-xl"></i>
                                    </div>
                                    <div>
                                        <h4 class="font-medium text-gray-800 flex items-center">
                                            ${connectedDeviceName || t('connectedPrinter')}
                                            <span class="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center">
                                                <i class="ph ph-plug text-green-600 mr-1 text-xs"></i>${t('connectedNow')}
                                            </span>
                                        </h4>
                                        <p class="text-xs text-gray-500">
                                            ${connectedDevice.type === 'wired'
                        ? `${t('address')}: ${connectedDevice.address || t('unknown')}`
                        : `${t('id')}: ${connectedDeviceId || t('unknown')}`
                    }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${!managedPrinters.length && !currentlyConnected ? `
                            <div class="text-center py-8 bg-gradient-to-br from-gray-50 to-white rounded-lg border border-dashed border-gray-300">
                                <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                    <i class="ph ph-printer text-gray-400 text-3xl"></i>
                                </div>
                                <p class="text-gray-500 mb-1">${t('noPrintersConfigured')}</p>
                                <p class="text-xs text-gray-400">${t('connectBluetoothPrinter')}</p>
                            </div>
                        ` : ''}
                        
                        ${managedPrinters.map((printer, index) => {
                        // Determine if this printer is connected - check both id and name
                        const isPrinterConnected = currentlyConnected && (
                            (connectedDeviceId && printer.deviceId === connectedDeviceId) ||
                            (connectedDeviceName && printer.deviceName === connectedDeviceName)
                        );

                        // Skip if this is already shown as the connected printer
                        if (isPrinterConnected && currentlyConnected && connectedDevice) {
                            return '';
                        }

                        // Format date added or last connected date
                        let dateInfo = '';
                        if (printer.lastConnected) {
                            const lastConnectedDate = new Date(printer.lastConnected);
                            const now = new Date();
                            const diffMs = now - lastConnectedDate;
                            const diffMins = Math.round(diffMs / 60000);
                            const diffHours = Math.round(diffMs / 3600000);
                            const diffDays = Math.round(diffMs / 86400000);

                            if (diffMins < 1) {
                                dateInfo = t('connectedJustNow');
                            } else if (diffMins < 60) {
                                dateInfo = t('connectedMinutesAgo').replace('{minutes}', diffMins).replace('{plural}', diffMins > 1 ? 's' : '');
                            } else if (diffHours < 24) {
                                dateInfo = t('connectedHoursAgo').replace('{hours}', diffHours).replace('{plural}', diffHours > 1 ? 's' : '');
                            } else {
                                dateInfo = t('connectedDaysAgo').replace('{days}', diffDays).replace('{plural}', diffDays > 1 ? 's' : '');
                            }
                        } else if (printer.dateAdded) {
                            const addedDate = new Date(printer.dateAdded);
                            dateInfo = t('addedOn').replace('{date}', addedDate.toLocaleDateString());
                        }

                        // Determine printer type (for backward compatibility)
                        const printerType = printer.type || (printer.deviceId ? 'bluetooth' : 'wired');
                        const isBluetoothPrinter = printerType === 'bluetooth';

                        // Choose icon and background color based on printer type
                        const iconClass = isBluetoothPrinter ? 'ph-bluetooth' : 'ph-plug';
                        const bgColorClass = isBluetoothPrinter ? 'from-blue-50 to-blue-100' : 'from-green-50 to-green-100';
                        const textColorClass = isBluetoothPrinter ? 'text-blue-500' : 'text-green-500';

                        return `
                                <div class="printer-item bg-gradient-to-br from-white to-gray-50 border ${isPrinterConnected ? 'border-green-300 ring-1 ring-green-300' : 'border-gray-200'} rounded-lg shadow-sm p-4 transition-all hover:shadow-md" data-printer-id="${printer.id}">
                                    <div class="flex justify-between items-start mb-3">
                                        <div class="flex items-center">
                                            <div class="w-10 h-10 bg-gradient-to-br ${bgColorClass} rounded-lg flex items-center justify-center mr-3 shadow-sm">
                                                <i class="ph ${iconClass} ${textColorClass} text-xl"></i>
                                            </div>
                                            <div>
                                                <h4 class="font-medium text-gray-800">${printer.name || t('unnamedPrinter')}</h4>
                                                <p class="text-xs text-gray-500">
                                                    ${isBluetoothPrinter
                                ? `${printer.deviceName || t('unknownDevice')}`
                                : `${printer.address || t('noAddress')}`
                            }
                                                </p>
                                                ${dateInfo ? `<p class="text-xs text-gray-500 italic">${dateInfo}</p>` : ''}
                                            </div>
                                            ${printer.isDefault ? `<span class="ml-2 px-2 py-0.5 bg-gradient-to-r from-red-100 to-red-50 text-red-700 text-xs rounded-full flex items-center"><i class="ph ph-star-fill text-amber-500 mr-1 text-xs"></i>${t('default')}</span>` : ''}
                                            ${isPrinterConnected ? `<span class="ml-2 px-2 py-0.5 bg-gradient-to-r from-green-100 to-green-50 text-green-700 text-xs rounded-full flex items-center"><i class="ph ph-plug text-green-500 mr-1 text-xs"></i>${t('connected')}</span>` : ''}
                                        </div>
                                        <div class="flex space-x-1">
                                            <button class="printer-edit-btn p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors" data-printer-id="${printer.id}" title="${t('editPrinter')}">
                                                <i class="ph ph-pencil-simple"></i>
                                            </button>
                                            <button class="printer-remove-btn p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 transition-colors" data-printer-id="${printer.id}" title="${t('removePrinter')}">
                                                <i class="ph ph-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <!-- Assignments -->
                                    <div class="mt-3 pt-3 border-t border-gray-200">
                                        <h5 class="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                            <i class="ph ph-link text-gray-400 mr-1.5"></i>
                                            ${t('channelAssignments')}
                                        </h5>
                                        ${printer.assignments && printer.assignments.length > 0 ? `
                                            <div class="flex flex-wrap gap-2">
                                                ${printer.assignments.map(assignment => `
                                                    <div class="inline-flex items-center px-2 py-1 bg-gradient-to-r from-gray-100 to-gray-50 text-xs rounded-md border border-gray-100 shadow-sm">
                                                        <span class="font-medium">${assignment.channel}</span>
                                                        <span class="mx-1 text-gray-400">•</span>
                                                        <span class="text-${assignment.printType === 'all' ? 'blue' : assignment.printType === 'kot' ? 'green' : 'orange'}-500">
                                                            ${assignment.printType === 'all' ? t('all') : assignment.printType === 'kot' ? t('kot') : t('bill')}
                                                        </span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : `
                                            <p class="text-xs text-gray-500 flex items-center">
                                                <i class="ph ph-info text-gray-400 mr-1"></i>
                                                ${t('noChannelAssignments')}
                                            </p>
                                        `}
                                    </div>
                                </div>
                            `;
                    }).join('')}
                    </div>
                    
                    <!-- Add Printer Button -->
                    <button id="add-printer-btn" class="w-full py-3 border border-dashed border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 hover:shadow-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-white to-gray-50">
                        <i class="ph ph-plus-circle"></i>
                        ${t('addNewPrinter')}
                    </button>
                </div>
            `,
            actions: `
                <div class="flex justify-end px-5 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
                    <button id="close-printer-management-btn" class="px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-600">
                        <i class="ph ph-x"></i>
                        ${t('close')}
                    </button>
                </div>
            `,
            size: 'lg',
            onShown: (modalControl) => {
                const addPrinterBtn = document.getElementById('add-printer-btn');
                const closePrinterManagementBtn = document.getElementById('close-printer-management-btn');

                // Add printer event handler
                addPrinterBtn.addEventListener('click', () => {
                    showAddPrinterModal(modalControl);
                });

                // Close button event handler
                closePrinterManagementBtn.addEventListener('click', () => {
                    modalControl.close();
                });

                // Edit printer event handlers
                document.querySelectorAll('.printer-edit-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const printerId = btn.getAttribute('data-printer-id');
                        showEditPrinterModal(printerId, modalControl);
                    });
                });

                // Remove printer event handlers
                document.querySelectorAll('.printer-remove-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const printerId = btn.getAttribute('data-printer-id');
                        removePrinter(printerId, modalControl);
                    });
                });
            }
        });
    };

    // Show add printer modal
    const showAddPrinterModal = (parentModalControl) => {
        // Get all available order channels
        const orderChannels = ['All Channels', 'Default'];

        // Add channels from price variants
        if (seller?.variants && Array.isArray(seller.variants)) {
            seller.variants.forEach(variant => {
                if (variant.title && variant.title !== 'Default' && !orderChannels.includes(variant.title)) {
                    orderChannels.push(variant.title);
                }
            });
        }

        // Create modal
        ModalManager.createCenterModal({
            id: 'add-printer-modal',
            title: t('addPrinter'),
            content: `
                <div class="p-5 pt-4">
                    <div id="add-printer-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-lg"></div>
                    
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-1.5">
                            <i class="ph ph-tag text-gray-400 mr-1.5"></i>
                            ${t('printerName')}
                        </label>
                        <input
                            type="text"
                            id="printer-name-input"
                            class="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-gradient-to-r from-white to-gray-50 shadow-sm"
                            placeholder="${t('egKitchenPrinter')}"
                        />
                    </div>
                    
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-1.5">
                            <i class="ph ph-printer text-gray-400 mr-1.5"></i>
                            ${t('printerType')}
                        </label>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="flex items-center border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                <input type="radio" name="printer-type" value="bluetooth" class="w-4 h-4 text-red-600" checked>
                                <div class="ml-2">
                                    <div class="font-medium text-sm">${t('bluetooth')}</div>
                                    <div class="text-xs text-gray-500">${t('wirelessPrinter')}</div>
                                </div>
                            </label>
                            <label class="flex items-center border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                <input type="radio" name="printer-type" value="wired" class="w-4 h-4 text-red-600">
                                <div class="ml-2">
                                    <div class="font-medium text-sm">${t('wired')}</div>
                                    <div class="text-xs text-gray-500">${t('usbNetworkPrinter')}</div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div id="bluetooth-device-section" class="mb-6">
                        <div class="flex items-center justify-between mb-1.5">
                            <label class="block text-sm font-medium text-gray-700">
                                <i class="ph ph-bluetooth text-gray-400 mr-1.5"></i>
                                ${t('bluetoothDevice')}
                            </label>
                            <button id="select-device-btn" class="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors">
                                <i class="ph ph-scan"></i>
                                ${t('selectDevice')}
                            </button>
                        </div>
                        <div id="selected-device-container" class="border rounded-lg p-4 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white shadow-sm">
                            <div id="no-device-selected" class="text-gray-500 text-sm flex items-center">
                                <i class="ph ph-bluetooth-x text-gray-400 mr-2"></i>
                                ${t('noDeviceSelected')}
                            </div>
                            <div id="device-info" class="hidden">
                                <div class="flex items-center">
                                    <div class="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center mr-2 shadow-sm">
                                        <i class="ph ph-bluetooth text-blue-500"></i>
                                    </div>
                                    <div>
                                        <div id="device-name" class="font-medium"></div>
                                        <div id="device-id" class="text-xs text-gray-500"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="wired-device-section" class="mb-6 hidden">
                        <div class="flex items-center justify-between mb-1.5">
                            <label class="block text-sm font-medium text-gray-700">
                                <i class="ph ph-plug text-gray-400 mr-1.5"></i>
                                ${t('printerAddress')}
                            </label>
                        </div>
                        <input
                            type="text"
                            id="wired-address-input"
                            class="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-gradient-to-r from-white to-gray-50 shadow-sm"
                            placeholder="${t('eg18')} 192.168.1.100 or USB port"
                        />
                        <p class="text-xs text-gray-500 mt-1">${t('enterIpAddress')}</p>
                    </div>
                    
                    <div class="mb-3">
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                id="is-default-printer-input"
                                class="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                            />
                            <div class="ml-2">
                                <div class="text-sm text-gray-700 font-medium">${t('setAsDefaultPrinter')}</div>
                                <div class="text-xs text-gray-500">${t('thisPrinterDefault')}</div>
                            </div>
                        </label>
                    </div>
                    
                    <div class="mb-5">
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                id="add-assignments-input"
                                class="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                            />
                            <div class="ml-2">
                                <div class="text-sm text-gray-700 font-medium">${t('addChannelAssignmentsCheckbox')}</div>
                                <div class="text-xs text-gray-500">${t('configureChannels')}</div>
                            </div>
                        </label>
                    </div>
                    
                    <div id="assignments-container" class="hidden space-y-4 p-4 border border-gray-200 rounded-lg bg-gradient-to-r from-gray-50 to-white shadow-sm">
                        <div id="assignments-list" class="space-y-4">
                            <div class="assignment-entry grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-medium text-gray-700 mb-1.5 flex items-center">
                                        <i class="ph ph-storefront text-gray-400 mr-1"></i>
                                        ${t('channel')}
                                    </label>
                                    <select class="assignment-channel w-full px-3 py-2 border rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none">
                                        ${orderChannels.map(channel => `
                                            <option value="${channel}">${channel}</option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-700 mb-1.5 flex items-center">
                                        <i class="ph ph-printer text-gray-400 mr-1"></i>
                                        ${t('printType')}
                                    </label>
                                    <select class="assignment-type w-full px-3 py-2 border rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none">
                                        <option value="all">${t('all')}</option>
                                        <option value="kot">${t('kotOnly')}</option>
                                        <option value="bill">${t('billOnly')}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <button id="add-assignment-btn" class="w-full py-2 border border-dashed border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 hover:shadow-sm transition-all flex items-center justify-center text-sm gap-1">
                            <i class="ph ph-plus-circle"></i>
                            ${t('addAnotherAssignment')}
                        </button>
                    </div>
                </div>
            `,
            actions: `
                <div class="flex justify-end px-5 py-4 space-x-3 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
                    <button id="cancel-add-printer-btn" class="px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-600">
                        <i class="ph ph-x"></i>
                        ${t('cancel')}
                    </button>
                    <button id="save-add-printer-btn" class="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-md hover:from-red-600 hover:to-red-700 transition-colors flex items-center gap-2 shadow-sm">
                        <i class="ph ph-check"></i>
                        ${t('addPrinter')}
                    </button>
                </div>
            `,
            size: 'md',
            onShown: (modalControl) => {
                const errorContainer = document.getElementById('add-printer-error-container');
                const printerNameInput = document.getElementById('printer-name-input');
                const printerTypeRadios = document.querySelectorAll('input[name="printer-type"]');
                const bluetoothSection = document.getElementById('bluetooth-device-section');
                const wiredSection = document.getElementById('wired-device-section');
                const wiredAddressInput = document.getElementById('wired-address-input');
                const selectDeviceBtn = document.getElementById('select-device-btn');
                const deviceInfoDiv = document.getElementById('device-info');
                const noDeviceSelectedDiv = document.getElementById('no-device-selected');
                const deviceNameDiv = document.getElementById('device-name');
                const deviceIdDiv = document.getElementById('device-id');
                const isDefaultPrinterInput = document.getElementById('is-default-printer-input');
                const addAssignmentsInput = document.getElementById('add-assignments-input');
                const assignmentsContainer = document.getElementById('assignments-container');
                const assignmentsList = document.getElementById('assignments-list');
                const addAssignmentBtn = document.getElementById('add-assignment-btn');
                const cancelButton = document.getElementById('cancel-add-printer-btn');
                const saveButton = document.getElementById('save-add-printer-btn');

                let selectedDevice = null;
                let printerType = 'bluetooth'; // Default printer type

                // Handle printer type change
                printerTypeRadios.forEach(radio => {
                    radio.addEventListener('change', () => {
                        printerType = radio.value;
                        bluetoothSection.classList.toggle('hidden', printerType !== 'bluetooth');
                        wiredSection.classList.toggle('hidden', printerType !== 'wired');

                        // Reset device selection when switching types
                        if (printerType === 'wired') {
                            selectedDevice = null;
                        }
                    });
                });

                // Show/hide assignments based on checkbox
                addAssignmentsInput.addEventListener('change', () => {
                    assignmentsContainer.classList.toggle('hidden', !addAssignmentsInput.checked);
                });

                // Add assignment button event handler
                addAssignmentBtn.addEventListener('click', () => {
                    const assignmentEntry = document.createElement('div');
                    assignmentEntry.className = 'assignment-entry grid grid-cols-2 gap-4 relative';
                    assignmentEntry.innerHTML = `
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">
                                ${t('channel')}
                            </label>
                            <select class="assignment-channel w-full px-3 py-2 border rounded-md text-sm">
                                ${orderChannels.map(channel => `
                                    <option value="${channel}">${channel}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">
                                ${t('printType')}
                            </label>
                            <div class="flex">
                                <select class="assignment-type w-full px-3 py-2 border rounded-md text-sm">
                                    <option value="all">${t('all')}</option>
                                    <option value="kot">${t('kotOnly')}</option>
                                    <option value="bill">${t('billOnly')}</option>
                                </select>
                                <button class="remove-assignment-btn ml-2 p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100">
                                    <i class="ph ph-x"></i>
                                </button>
                            </div>
                        </div>
                    `;

                    assignmentsList.appendChild(assignmentEntry);

                    // Add event listener to the remove button
                    assignmentEntry.querySelector('.remove-assignment-btn').addEventListener('click', () => {
                        assignmentEntry.remove();
                    });
                });

                // Select device button event handler
                selectDeviceBtn.addEventListener('click', async () => {
                    try {
                        errorContainer.classList.add('hidden');

                        if (!BluetoothPrinting) {
                            throw new Error('Bluetooth printing service not available');
                        }

                        const bluetoothPrinting = BluetoothPrinting;

                        // Check if the browser supports Web Bluetooth
                        if (!bluetoothPrinting.isSupported()) {
                            throw new Error('Web Bluetooth is not supported in this browser');
                        }

                        // Request a Bluetooth device
                        const device = await navigator.bluetooth.requestDevice({
                            acceptAllDevices: true,
                            optionalServices: [
                                '000018f0-0000-1000-8000-00805f9b34fb',  // Common printer service
                                '00001101-0000-1000-8000-00805f9b34fb',  // Serial Port Profile
                                '00001800-0000-1000-8000-00805f9b34fb',  // Generic Access Service
                                '00001801-0000-1000-8000-00805f9b34fb',  // Generic Attribute Service
                                '0000180a-0000-1000-8000-00805f9b34fb',  // Device Information Service
                                '0000ffff-0000-1000-8000-00805f9b34fb',  // Vendor specific service
                                '0000fff0-0000-1000-8000-00805f9b34fb',  // Vendor specific service
                                '0000ff00-0000-1000-8000-00805f9b34fb',  // Vendor specific service
                                '0000fe00-0000-1000-8000-00805f9b34fb',  // Vendor specific service
                                '00010000-0000-1000-8000-00805f9b34fb',  // Vendor specific service
                                '00000000-0000-1000-8000-00805f9b34fb'   // Vendor specific service
                            ]
                        });

                        // Set the selected device
                        selectedDevice = {
                            id: device.id,
                            name: device.name || 'Unknown Device'
                        };

                        // Update the UI
                        deviceNameDiv.textContent = selectedDevice.name;
                        deviceIdDiv.textContent = selectedDevice.id;
                        deviceInfoDiv.classList.remove('hidden');
                        noDeviceSelectedDiv.classList.add('hidden');

                        // Set printer name if empty
                        if (!printerNameInput.value) {
                            printerNameInput.value = selectedDevice.name;
                        }
                    } catch (error) {
                        console.error('Error selecting device:', error);
                        errorContainer.textContent = `Error: ${error.message}`;
                        errorContainer.classList.remove('hidden');
                    }
                });

                // Cancel button event handler
                cancelButton.addEventListener('click', () => {
                    modalControl.close();
                });

                // Save button event handler
                saveButton.addEventListener('click', async () => {
                    try {
                        // Basic validation
                        if (!printerNameInput.value.trim()) {
                            errorContainer.textContent = t('pleaseEnterPrinterName');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        if (printerType === 'bluetooth' && !selectedDevice) {
                            errorContainer.textContent = t('pleaseSelectBluetoothDevice');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        if (printerType === 'wired' && !wiredAddressInput.value.trim()) {
                            errorContainer.textContent = t('pleaseEnterPrinterAddress');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        // Collect assignments if enabled
                        const assignments = [];
                        if (addAssignmentsInput.checked) {
                            const assignmentEntries = assignmentsList.querySelectorAll('.assignment-entry');
                            assignmentEntries.forEach(entry => {
                                const channelSelect = entry.querySelector('.assignment-channel');
                                const typeSelect = entry.querySelector('.assignment-type');

                                if (channelSelect && typeSelect) {
                                    assignments.push({
                                        channel: channelSelect.value,
                                        printType: typeSelect.value
                                    });
                                }
                            });
                        }

                        // Create the printer object
                        const printer = {
                            name: printerNameInput.value.trim(),
                            type: printerType,
                            assignments: assignments,
                            dateAdded: new Date().toISOString()
                        };

                        // Add device-specific properties based on printer type
                        if (printerType === 'bluetooth' && selectedDevice) {
                            printer.deviceId = selectedDevice.id;
                            printer.deviceName = selectedDevice.name;
                        } else if (printerType === 'wired') {
                            printer.address = wiredAddressInput.value.trim();
                        }

                        // Add the printer to the managed printers list
                        if (BluetoothPrinting) {
                            const bluetoothPrinting = BluetoothPrinting;
                            bluetoothPrinting.addPrinter(printer, isDefaultPrinterInput.checked);

                            // Show success message
                            ModalManager.showToast(t('printerAddedSuccess'));

                            // Close the modal
                            modalControl.close();

                            // Refresh the parent modal
                            parentModalControl.close();
                            handlePrinterManagement();
                        } else {
                            throw new Error('Bluetooth printing service not available');
                        }
                    } catch (error) {
                        console.error('Error saving printer:', error);
                        errorContainer.textContent = `Error: ${error.message}`;
                        errorContainer.classList.remove('hidden');
                    }
                });
            }
        });
    };

    // Show edit printer modal
    const showEditPrinterModal = (printerId, parentModalControl) => {
        // Get the printer from BluetoothPrinting
        const bluetoothPrinting = BluetoothPrinting;
        if (!bluetoothPrinting) {
            ModalManager.showToast(t('bluetoothServiceNotAvailable'), { type: 'error' });
            return;
        }

        const printers = bluetoothPrinting.getSavedPrinters();
        const printer = printers.find(p => p.id === printerId);

        if (!printer) {
            ModalManager.showToast(t('printerNotFound'), { type: 'error' });
            return;
        }

        // Get all available order channels
        const orderChannels = ['All Channels', 'Default'];

        // Add channels from price variants
        if (seller?.variants && Array.isArray(seller.variants)) {
            seller.variants.forEach(variant => {
                if (variant.title && variant.title !== 'Default' && !orderChannels.includes(variant.title)) {
                    orderChannels.push(variant.title);
                }
            });
        }

        // Determine printer type (for backward compatibility)
        const printerType = printer.type || (printer.deviceId ? 'bluetooth' : 'wired');

        // Create modal
        ModalManager.createCenterModal({
            id: 'edit-printer-modal',
            title: t('editPrinter'),
            content: `
                <div class="p-5 pt-4">
                    <div id="edit-printer-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-lg"></div>
                    
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-1.5">
                            <i class="ph ph-tag text-gray-400 mr-1.5"></i>
                            ${t('printerName')}
                        </label>
                        <input
                            type="text"
                            id="edit-printer-name-input"
                            class="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-gradient-to-r from-white to-gray-50 shadow-sm"
                            value="${printer.name || ''}"
                            placeholder="${t('egKitchenPrinter')}"
                        />
                    </div>
                    
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-1.5">
                            <i class="ph ph-printer text-gray-400 mr-1.5"></i>
                            ${t('printerType')}
                        </label>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="flex items-center border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                <input type="radio" name="printer-type" value="bluetooth" class="w-4 h-4 text-red-600" ${printerType === 'bluetooth' ? 'checked' : ''}>
                                <div class="ml-2">
                                    <div class="font-medium text-sm">${t('bluetooth')}</div>
                                    <div class="text-xs text-gray-500">${t('wirelessPrinter')}</div>
                                </div>
                            </label>
                            <label class="flex items-center border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                <input type="radio" name="printer-type" value="wired" class="w-4 h-4 text-red-600" ${printerType === 'wired' ? 'checked' : ''}>
                                <div class="ml-2">
                                    <div class="font-medium text-sm">${t('wired')}</div>
                                    <div class="text-xs text-gray-500">${t('usbNetworkPrinter')}</div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div id="edit-bluetooth-section" class="mb-6 ${printerType !== 'bluetooth' ? 'hidden' : ''}">
                        <div class="flex items-center justify-between mb-1.5">
                            <label class="block text-sm font-medium text-gray-700">
                                <i class="ph ph-bluetooth text-gray-400 mr-1.5"></i>
                                ${t('bluetoothDevice')}
                            </label>
                        </div>
                        <div id="selected-device-container" class="border rounded-lg p-4 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white shadow-sm">
                            <div class="flex items-center">
                                <div class="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center mr-2 shadow-sm">
                                    <i class="ph ph-bluetooth text-blue-500"></i>
                                </div>
                                <div>
                                    <div class="font-medium">${printer.deviceName || t('unknownDevice')}</div>
                                    <div class="text-xs text-gray-500">${printer.deviceId || ''}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="edit-wired-section" class="mb-6 ${printerType !== 'wired' ? 'hidden' : ''}">
                        <div class="flex items-center justify-between mb-1.5">
                            <label class="block text-sm font-medium text-gray-700">
                                <i class="ph ph-plug text-gray-400 mr-1.5"></i>
                                ${t('printerAddress')}
                            </label>
                        </div>
                        <input
                            type="text"
                            id="edit-wired-address-input"
                            class="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-gradient-to-r from-white to-gray-50 shadow-sm"
                            value="${printer.address || ''}"
                            placeholder="${t('eg18')} 192.168.1.100 or USB port"
                        />
                        <p class="text-xs text-gray-500 mt-1">${t('enterIpAddress')}</p>
                    </div>
                    
                    <div class="mb-4">
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                id="edit-is-default-printer-input"
                                class="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                ${printer.isDefault ? 'checked' : ''}
                            />
                            <div class="ml-2">
                                <div class="text-sm text-gray-700 font-medium">${t('setAsDefaultPrinter')}</div>
                                <div class="text-xs text-gray-500">${t('thisPrinterDefault')}</div>
                            </div>
                        </label>
                    </div>
                    
                    <div class="mb-5">
                        <h5 class="text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <i class="ph ph-link text-gray-400 mr-1.5"></i>
                            ${t('channelAssignments')}
                        </h5>
                    </div>
                    
                    <div id="edit-assignments-container" class="space-y-4 p-4 border border-gray-200 rounded-lg bg-gradient-to-r from-gray-50 to-white shadow-sm">
                        <div id="edit-assignments-list" class="space-y-4">
                            ${(printer.assignments || []).map((assignment, index) => `
                                <div class="assignment-entry grid grid-cols-2 gap-4 relative" data-index="${index}">
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1.5 flex items-center">
                                            <i class="ph ph-storefront text-gray-400 mr-1"></i>
                                            ${t('channel')}
                                        </label>
                                        <select class="assignment-channel w-full px-3 py-2 border rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none">
                                            ${orderChannels.map(channel => `
                                                <option value="${channel}" ${assignment.channel === channel ? 'selected' : ''}>${channel}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1.5 flex items-center">
                                            <i class="ph ph-printer text-gray-400 mr-1"></i>
                                            ${t('printType')}
                                        </label>
                                        <div class="flex">
                                            <select class="assignment-type w-full px-3 py-2 border rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none">
                                                <option value="all" ${assignment.printType === 'all' ? 'selected' : ''}>${t('all')}</option>
                                                <option value="kot" ${assignment.printType === 'kot' ? 'selected' : ''}>${t('kotOnly')}</option>
                                                <option value="bill" ${assignment.printType === 'bill' ? 'selected' : ''}>${t('billOnly')}</option>
                                            </select>
                                            <button class="remove-assignment-btn ml-2 p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 transition-colors">
                                                <i class="ph ph-x"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <button id="edit-add-assignment-btn" class="w-full py-2 border border-dashed border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 hover:shadow-sm transition-all flex items-center justify-center text-sm gap-1">
                            <i class="ph ph-plus-circle"></i>
                            ${t('addAssignment')}
                        </button>
                    </div>
                </div>
            `,
            actions: `
                <div class="flex justify-end px-5 py-4 space-x-3 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
                    <button id="cancel-edit-printer-btn" class="px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-600">
                        <i class="ph ph-x"></i>
                        ${t('cancel')}
                    </button>
                    <button id="save-edit-printer-btn" class="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-md hover:from-red-600 hover:to-red-700 transition-colors flex items-center gap-2 shadow-sm">
                        <i class="ph ph-check"></i>
                        ${t('saveChanges')}
                    </button>
                </div>
            `,
            size: 'md',
            onShown: (modalControl) => {
                const errorContainer = document.getElementById('edit-printer-error-container');
                const printerNameInput = document.getElementById('edit-printer-name-input');
                const printerTypeRadios = document.querySelectorAll('input[name="printer-type"]');
                const bluetoothSection = document.getElementById('edit-bluetooth-section');
                const wiredSection = document.getElementById('edit-wired-section');
                const wiredAddressInput = document.getElementById('edit-wired-address-input');
                const isDefaultPrinterInput = document.getElementById('edit-is-default-printer-input');
                const assignmentsList = document.getElementById('edit-assignments-list');
                const addAssignmentBtn = document.getElementById('edit-add-assignment-btn');
                const cancelButton = document.getElementById('cancel-edit-printer-btn');
                const saveButton = document.getElementById('save-edit-printer-btn');

                // Track current printer type
                let currentPrinterType = printerType;

                // Handle printer type change
                printerTypeRadios.forEach(radio => {
                    radio.addEventListener('change', () => {
                        currentPrinterType = radio.value;
                        bluetoothSection.classList.toggle('hidden', currentPrinterType !== 'bluetooth');
                        wiredSection.classList.toggle('hidden', currentPrinterType !== 'wired');
                    });
                });

                // Add assignment button event handler
                addAssignmentBtn.addEventListener('click', () => {
                    const assignmentEntry = document.createElement('div');
                    assignmentEntry.className = 'assignment-entry grid grid-cols-2 gap-4 relative';
                    assignmentEntry.innerHTML = `
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1.5 flex items-center">
                                <i class="ph ph-storefront text-gray-400 mr-1"></i>
                                ${t('channel')}
                            </label>
                            <select class="assignment-channel w-full px-3 py-2 border rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none">
                                ${orderChannels.map(channel => `
                                    <option value="${channel}">${channel}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1.5 flex items-center">
                                <i class="ph ph-printer text-gray-400 mr-1"></i>
                                ${t('printType')}
                            </label>
                            <div class="flex">
                                <select class="assignment-type w-full px-3 py-2 border rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none">
                                    <option value="all">${t('all')}</option>
                                    <option value="kot">${t('kotOnly')}</option>
                                    <option value="bill">${t('billOnly')}</option>
                                </select>
                                <button class="remove-assignment-btn ml-2 p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 transition-colors">
                                    <i class="ph ph-x"></i>
                                </button>
                            </div>
                        </div>
                    `;

                    assignmentsList.appendChild(assignmentEntry);

                    // Add event listener to the remove button
                    assignmentEntry.querySelector('.remove-assignment-btn').addEventListener('click', () => {
                        assignmentEntry.remove();
                    });
                });

                // Add event listeners to existing remove buttons
                document.querySelectorAll('.remove-assignment-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        btn.closest('.assignment-entry').remove();
                    });
                });

                // Cancel button event handler
                cancelButton.addEventListener('click', () => {
                    modalControl.close();
                });

                // Save button event handler
                saveButton.addEventListener('click', async () => {
                    try {
                        // Basic validation
                        if (!printerNameInput.value.trim()) {
                            errorContainer.textContent = t('pleaseEnterPrinterName');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        if (currentPrinterType === 'wired' && !wiredAddressInput.value.trim()) {
                            errorContainer.textContent = t('pleaseEnterPrinterAddress');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        // Collect assignments
                        const assignments = [];
                        const assignmentEntries = assignmentsList.querySelectorAll('.assignment-entry');
                        assignmentEntries.forEach(entry => {
                            const channelSelect = entry.querySelector('.assignment-channel');
                            const typeSelect = entry.querySelector('.assignment-type');

                            if (channelSelect && typeSelect) {
                                assignments.push({
                                    channel: channelSelect.value,
                                    printType: typeSelect.value
                                });
                            }
                        });

                        // Create the update object with common properties
                        const updates = {
                            name: printerNameInput.value.trim(),
                            type: currentPrinterType,
                            assignments: assignments,
                            isDefault: isDefaultPrinterInput.checked,
                            dateModified: new Date().toISOString()
                        };

                        // Add type-specific properties
                        if (currentPrinterType === 'wired') {
                            updates.address = wiredAddressInput.value.trim();
                            // Remove bluetooth-specific properties if switching from bluetooth to wired
                            if (printerType === 'bluetooth') {
                                updates.deviceId = null;
                                updates.deviceName = null;
                            }
                        } else if (currentPrinterType === 'bluetooth') {
                            // Keep existing Bluetooth device info
                            if (printerType === 'wired') {
                                // If switching from wired to bluetooth without a device, show error
                                if (!printer.deviceId) {
                                    errorContainer.textContent = t('cannotSwitchBluetooth');
                                    errorContainer.classList.remove('hidden');
                                    return;
                                }
                            }
                            // Remove wired-specific properties if switching from wired to bluetooth
                            if (printerType === 'wired') {
                                updates.address = null;
                            }
                        }

                        // Update the printer
                        bluetoothPrinting.updatePrinter(printerId, updates);

                        // Show success message
                        ModalManager.showToast(t('printerUpdatedSuccess'));

                        // Close the modal
                        modalControl.close();

                        // Refresh the parent modal
                        parentModalControl.close();
                        handlePrinterManagement();
                    } catch (error) {
                        console.error('Error updating printer:', error);
                        errorContainer.textContent = `Error: ${error.message}`;
                        errorContainer.classList.remove('hidden');
                    }
                });
            }
        });
    };

    // Remove a printer
    const removePrinter = (printerId, parentModalControl) => {
        // Get the printer service
        const bluetoothPrinting = BluetoothPrinting;
        if (!bluetoothPrinting) {
            ModalManager.showToast(t('bluetoothServiceNotAvailable'), { type: 'error' });
            return;
        }

        // Get the printer details
        const printers = bluetoothPrinting.getSavedPrinters();
        const printer = printers.find(p => p.id === printerId);

        if (!printer) {
            ModalManager.showToast(t('printerNotFound'), { type: 'error' });
            return;
        }

        // Confirm deletion with a modal
        ModalManager.createCenterModal({
            id: 'confirm-delete-printer-modal',
            title: t('removePrinter'),
            content: `
                <div class="p-5">
                    <div class="flex items-center justify-center mb-5">
                        <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                            <i class="ph ph-warning-circle text-red-500 text-3xl"></i>
                        </div>
                    </div>
                    
                    <h3 class="text-lg font-medium text-gray-800 mb-2 text-center">${t('removePrinterConfirmation')}</h3>
                    
                    <p class="text-gray-600 text-center mb-4">
                        ${t('removePrinterWarning')} <span class="font-medium text-gray-800">${printer.name || t('unnamedPrinter')}</span>.
                        ${printer.isDefault ? '<span class="text-red-500">' + t('defaultPrinterWarning') + '</span>' : ''}
                    </p>
                    
                    <div class="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100 rounded-lg p-4 mb-4">
                        <div class="flex items-start">
                            <div class="flex-shrink-0 mt-0.5">
                                <i class="ph ph-info text-amber-500 text-lg"></i>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-amber-700">
                                    ${t('removePrinterInfo')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            actions: `
                <div class="flex justify-end px-5 py-4 space-x-3 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
                    <button id="cancel-delete-printer-btn" class="px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-600">
                        <i class="ph ph-x"></i>
                        ${t('cancel')}
                    </button>
                    <button id="confirm-delete-printer-btn" class="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-md hover:from-red-600 hover:to-red-700 transition-colors flex items-center gap-2 shadow-sm">
                        <i class="ph ph-trash"></i>
                        ${t('removePrinter')}
                    </button>
                </div>
            `,
            size: 'sm',
            onShown: (modalControl) => {
                const cancelButton = document.getElementById('cancel-delete-printer-btn');
                const confirmButton = document.getElementById('confirm-delete-printer-btn');

                // Cancel button event handler
                cancelButton.addEventListener('click', () => {
                    modalControl.close();
                });

                // Confirm button event handler
                confirmButton.addEventListener('click', () => {
                    try {
                        // Remove the printer
                        const result = bluetoothPrinting.removePrinter(printerId);

                        if (result) {
                            ModalManager.showToast(t('printerRemovedSuccess'));

                            // Close modals
                            modalControl.close();

                            // Refresh the parent modal
                            parentModalControl.close();
                            handlePrinterManagement();
                        } else {
                            ModalManager.showToast(t('failedToRemovePrinter'), 'error');
                        }
                    } catch (error) {
                        console.error('Error removing printer:', error);
                        ModalManager.showToast(`${t('error')}: ${error.message}`, 'error');
                    }
                });
            }
        });
    };

    // Render the dashboard
    return (
        <div className="pb-24 md:pb-4 px-4 mt-4">
            {/* View Toggle */}
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-gray-800 flex items-center" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
                    {activeView === 'dashboard' ? (
                        <>
                            <i className="ph ph-storefront text-red-500 mr-2"></i>
                            {t('dashboard')}
                        </>
                    ) : (
                        <>
                            <i className="ph ph-gear text-red-500 mr-2"></i>
                            {t('settings')}
                        </>
                    )}
                </h2>
                <div className="flex bg-gray-100 rounded-lg p-1 shadow-sm">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${activeView === 'dashboard'
                            ? 'bg-white text-red-500 shadow-sm'
                            : 'text-gray-600 hover:text-gray-800'
                            }`}
                    >
                        <i className="ph ph-chart-pie"></i>
                        <span className="hidden sm:inline" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('dashboard')}</span>
                    </button>
                    <button
                        onClick={() => setActiveView('settings')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${activeView === 'settings'
                            ? 'bg-white text-red-500 shadow-sm'
                            : 'text-gray-600 hover:text-gray-800'
                            }`}
                    >
                        <i className="ph ph-gear"></i>
                        <span className="hidden sm:inline" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('settings')}</span>
                    </button>
                </div>
            </div>

            {/* Dashboard View */}
            {activeView === 'dashboard' && (
                <>
                    {/* Orders Dashboard */}
                    <div className="mb-6">
                        <div className="mb-5">
                            <h3 className="text-lg font-semibold text-gray-700" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('todaySummary')}</h3>
                        </div>

                        <div className="overflow-x-auto overflow-visible pb-2 -mx-4 px-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 min-w-[300px]">
                                <DashboardCard
                                    icon="ph-chart-line-up"
                                    title={t('todayOrders')}
                                    value={formatNumber(dashboardMetrics.todayOrders)}
                                    trend={`${dashboardMetrics.todayOrdersTrend >= 0 ? '+' : ''}${dashboardMetrics.todayOrdersTrend.toFixed(1)}%`}
                                    color={dashboardMetrics.todayOrdersTrend >= 0 ? "primary" : "warning"}
                                    compact={true}
                                    language={language}
                                />
                                <DashboardCard
                                    icon="ph-currency-dollar"
                                    title={t('todayRevenue')}
                                    value={formatCurrency(dashboardMetrics.todayRevenue)}
                                    trend={`${dashboardMetrics.todayRevenueTrend >= 0 ? '+' : ''}${dashboardMetrics.todayRevenueTrend.toFixed(1)}%`}
                                    color={dashboardMetrics.todayRevenueTrend >= 0 ? "success" : "warning"}
                                    compact={true}
                                    language={language}
                                />
                                <DashboardCard
                                    icon="ph-users"
                                    title={t('newCustomers')}
                                    value={formatNumber(dashboardMetrics.newCustomers)}
                                    trend={`${dashboardMetrics.newCustomersTrend >= 0 ? '+' : ''}${dashboardMetrics.newCustomersTrend.toFixed(1)}%`}
                                    color={dashboardMetrics.newCustomersTrend >= 0 ? "primary" : "warning"}
                                    compact={true}
                                    language={language}
                                />
                                <DashboardCard
                                    icon="ph-shopping-cart"
                                    title={t('avgOrderValue')}
                                    value={formatCurrency(dashboardMetrics.avgOrderValue)}
                                    trend={`${dashboardMetrics.avgOrderValueTrend >= 0 ? '+' : ''}${dashboardMetrics.avgOrderValueTrend.toFixed(1)}%`}
                                    color={dashboardMetrics.avgOrderValueTrend >= 0 ? "info" : "warning"}
                                    compact={true}
                                    className="hidden md:flex"
                                    language={language}
                                />
                                <DashboardCard
                                    icon="ph-clock"
                                    title={t('avgServiceTime')}
                                    value={`${Math.round(dashboardMetrics.avgServiceTime)} min`}
                                    trend={`${dashboardMetrics.avgServiceTimeTrend >= 0 ? '+' : ''}${dashboardMetrics.avgServiceTimeTrend.toFixed(1)}%`}
                                    color={dashboardMetrics.avgServiceTimeTrend >= 0 ? "success" : "warning"}
                                    compact={true}
                                    className="hidden lg:flex"
                                    language={language}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Order Channels Section */}
                    <div className="mb-6 bg-section-bg rounded-xl shadow-section overflow-hidden border border-gray-200">
                        <div className="px-3 py-3 border-b border-gray-200 flex items-center">
                            <i className="ph ph-globe text-red-500 text-xl mr-2"></i>
                            <h2 className="text-lg font-semibold text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('orderChannels')}</h2>
                        </div>
                        <div className="p-3">
                            {isLoading ? (
                                <div className="text-center py-10">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500 mx-auto"></div>
                                    <p className="mt-3 text-gray-600" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('loadingOrders')}</p>
                                </div>
                            ) : error ? (
                                <div className="text-center py-10">
                                    <div className="rounded-full h-10 w-10 bg-red-100 flex items-center justify-center mx-auto">
                                        <i className="ph ph-x text-red-500 text-xl"></i>
                                    </div>
                                    <p className="mt-3 text-gray-600" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{error}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {channels
                                        .filter(channel => channel.isChannel)
                                        .map(channel => (
                                            <div
                                                key={channel.id}
                                                className="mb-2"
                                                onClick={() => handleRoomClick(null, channel.id)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    showRenameRoomModal(null, channel.id);
                                                }}
                                            >
                                                <TableCard
                                                    title={channel.title}
                                                    orders={channel.orders || []}
                                                    duration={channel.duration}
                                                    onTap={() => handleRoomClick(null, channel.id)}
                                                    onLongPress={() => showRenameRoomModal(null, channel.id)}
                                                    compact={true}
                                                />
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tables Section */}
                    <div className="mb-6 bg-section-bg rounded-xl shadow-section overflow-hidden border border-gray-200">
                        <div className="px-3 py-3 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center">
                                <i className="ph ph-table text-red-500 text-xl mr-2"></i>
                                <h2 className="text-lg font-semibold text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('diningTables')}</h2>
                            </div>
                            <button
                                onClick={showAddTableModal}
                                className="px-2 py-1 bg-gradient-to-r from-white to-gray-50 border border-gray-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5 text-sm shadow-sm"
                            >
                                <i className="ph ph-plus"></i>
                                <span style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('addTable')}</span>
                            </button>
                        </div>
                        <div className="p-3">
                            {isLoading ? (
                                <div className="text-center py-10">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500 mx-auto"></div>
                                    <p className="mt-3 text-gray-600" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('loadingTables')}</p>
                                </div>
                            ) : error ? (
                                <div className="text-center py-10">
                                    <div className="rounded-full h-10 w-10 bg-red-100 flex items-center justify-center mx-auto">
                                        <i className="ph ph-x text-red-500 text-xl"></i>
                                    </div>
                                    <p className="mt-3 text-gray-600" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{error}</p>
                                </div>
                            ) : tables.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                                    <i className="ph ph-table text-5xl text-red-800 mb-4"></i>
                                    <p className="text-xl font-bold text-red-800 text-center">
                                        {t('noTablesAdded')}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {tables
                                        .filter(table => table.isTable)
                                        .map(table => (
                                            <div
                                                key={table.id}
                                                className="mb-2"
                                                onClick={() => handleRoomClick(table.id, null)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    showRenameRoomModal(table.id, null);
                                                }}
                                            >
                                                <TableCard
                                                    title={table.title}
                                                    orders={table.orders || []}
                                                    duration={table.duration}
                                                    onTap={() => handleRoomClick(table.id, null)}
                                                    onLongPress={() => showRenameRoomModal(table.id, null)}
                                                    compact={true}
                                                />
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Orders Section */}
                    <div className="mb-6 bg-section-bg rounded-xl shadow-section overflow-hidden border border-gray-200">
                        <div className="px-3 py-3 border-b border-gray-200 flex items-center">
                            <i className="ph ph-qr-code text-red-500 text-xl mr-2"></i>
                            <h2 className="text-lg font-semibold text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('recentOrders')}</h2>
                        </div>

                        {/* Order Tabs */}
                        <div className="flex border-b border-gray-200">
                            <button
                                className={`flex-1 py-2 px-4 text-sm font-medium ${!showCompletedOrders ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setShowCompletedOrders(false)}
                            >
                                <i className={`ph ph-timer ${!showCompletedOrders ? 'text-red-500' : 'text-gray-400'} mr-1.5`}></i>
                                <span style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('qrOrders')}</span>
                            </button>
                            <button
                                className={`flex-1 py-2 px-4 text-sm font-medium ${showCompletedOrders ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setShowCompletedOrders(true)}
                            >
                                <i className={`ph ph-check-circle ${showCompletedOrders ? 'text-red-500' : 'text-gray-400'} mr-1.5`}></i>
                                <span style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('completedOrders')}</span>
                            </button>
                        </div>

                        {/* Desktop Summary Row - Only for Active Orders tab */}
                        {!showCompletedOrders && (
                            <div className="hidden md:flex border-b border-gray-100 bg-gradient-to-r from-warm-bg to-white">
                                <div className="grid grid-cols-4 gap-4 p-4 w-full">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-50 to-white flex items-center justify-center shadow-sm flex-shrink-0">
                                            <i className="ph ph-timer text-red-500 text-lg"></i>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('pendingOrders')}</div>
                                            <div className="text-lg font-bold text-gray-800">{todaysOrdersData.placed.length}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-50 to-white flex items-center justify-center shadow-sm flex-shrink-0">
                                            <i className="ph ph-check-circle text-green-500 text-lg"></i>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('kitchenOrdersToday')}</div>
                                            <div className="text-lg font-bold text-gray-800">
                                                {(() => {
                                                    // Filter orders accepted today
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    const acceptedToday = orders.filter(order => {
                                                        // Check if order has 'KITCHEN' status
                                                        if (!order.status || !Array.isArray(order.status)) return false;

                                                        // Find the kitchen status entry
                                                        const kitchenStatus = order.status.find(
                                                            s => s.label && s.label.toUpperCase() === 'KITCHEN'
                                                        );

                                                        if (!kitchenStatus || !kitchenStatus.date) return false;

                                                        // Check if it was accepted today
                                                        const statusDate = parseDate(kitchenStatus.date);
                                                        return statusDate && statusDate >= today;
                                                    });

                                                    return acceptedToday.length;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-50 to-white flex items-center justify-center shadow-sm flex-shrink-0">
                                            <i className="ph ph-clock-countdown text-orange-500 text-lg"></i>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('avgAcceptTime')}</div>
                                            <div className="text-lg font-bold text-gray-800">
                                                {(() => {
                                                    // Calculate average acceptance time for orders today
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);

                                                    let totalAcceptTimeMinutes = 0;
                                                    let acceptedOrderCount = 0;

                                                    orders.forEach(order => {
                                                        if (!order.status || !Array.isArray(order.status)) return;

                                                        // Find the placed and kitchen status entries
                                                        const placedStatus = order.status.find(
                                                            s => s.label && s.label.toUpperCase() === 'PLACED'
                                                        );

                                                        const kitchenStatus = order.status.find(
                                                            s => s.label && s.label.toUpperCase() === 'KITCHEN'
                                                        );

                                                        if (!placedStatus || !kitchenStatus) return;

                                                        const placedDate = parseDate(placedStatus.date);
                                                        const kitchenDate = parseDate(kitchenStatus.date);

                                                        if (!placedDate || !kitchenDate) return;

                                                        // Only consider orders accepted today
                                                        if (kitchenDate < today) return;

                                                        // Calculate time difference in minutes
                                                        const acceptTimeMinutes = (kitchenDate - placedDate) / (1000 * 60);

                                                        // Only consider valid times (greater than 0 and less than 1 day)
                                                        if (acceptTimeMinutes > 0 && acceptTimeMinutes < 1440) {
                                                            totalAcceptTimeMinutes += acceptTimeMinutes;
                                                            acceptedOrderCount++;
                                                        }
                                                    });

                                                    if (acceptedOrderCount === 0) return t('na');

                                                    const avgAcceptTime = Math.round(totalAcceptTimeMinutes / acceptedOrderCount);
                                                    return `${avgAcceptTime} ${t('min')}`;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-50 to-white flex items-center justify-center shadow-sm flex-shrink-0">
                                            <i className="ph ph-money text-blue-500 text-lg"></i>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('avgOrderValue')}</div>
                                            <div className="text-lg font-bold text-gray-800">
                                                {(() => {
                                                    // Calculate average order value for placed orders using unified data
                                                    if (todaysOrdersData.placed.length === 0) return `${UserSession?.getCurrency()}0`;

                                                    const totalValue = todaysOrdersData.placed.reduce((sum, order) => {
                                                        return sum + calculateOrderTotal(order);
                                                    }, 0);

                                                    const avgValue = Math.round(totalValue / todaysOrdersData.placed.length);
                                                    return `${UserSession?.getCurrency()}${avgValue}`;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Date Filter - Only for Completed Orders tab */}
                        {showCompletedOrders && (
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-warm-bg to-white">
                                <div className="relative">
                                    <select
                                        value={dateFilter}
                                        onChange={(e) => setDateFilter(e.target.value)}
                                        className="appearance-none bg-gradient-to-r from-white to-gray-50 border border-gray-200 text-gray-700 py-1.5 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:border-red-500 text-sm"
                                    >
                                        <option value="today">{t('dateToday')}</option>
                                        <option value="yesterday">{t('dateYesterday')}</option>
                                        <option value="7days">{t('dateLast7Days')}</option>
                                        <option value="30days">{t('dateLast30Days')}</option>
                                        <option value="custom">{t('dateCustomRange')}</option>
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                        <i className="ph ph-caret-down"></i>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-4" ref={qrOrdersScrollRef} onScroll={handleScroll}>
                            {/* Active Orders Tab Content */}
                            {!showCompletedOrders && (
                                <>
                                    {loadingQrOrders ? (
                                        <div className="text-center py-10">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500 mx-auto"></div>
                                            <p className="mt-3 text-gray-600" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('loadingQrOrders')}</p>
                                        </div>
                                    ) : errorQrOrders ? (
                                        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                                            <p>{errorQrOrders}</p>
                                        </div>
                                    ) : todaysOrdersData.placed.length === 0 ? (
                                        <div className="text-center py-10">
                                            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <i className="ph ph-qr-code text-2xl text-red-500"></i>
                                            </div>
                                            <h3 className="text-lg font-medium text-gray-700 mb-1" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('noQrOrdersFound')}</h3>
                                            <p className="text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('qrOrdersHint')}</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="overflow-x-auto md:overflow-visible">
                                                <div className="space-y-3 min-w-[100%] md:min-w-0">
                                                    {todaysOrdersData.placed.map((order, index) => (
                                                        <OrderGroupTile
                                                            key={`qr-${order.id}-${index}`}
                                                            order={order}
                                                            onAccept={() => handleAcceptOrder(order.id)}
                                                            onReject={() => handleRejectOrder(order.id)}
                                                            onPrintBill={() => handlePrintBill(order.id)}
                                                        />
                                                    ))}

                                                    {isLoadingMore && (
                                                        <div className="text-center py-4">
                                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500 mx-auto"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="md:hidden text-center text-xs text-gray-400 mt-3 flex items-center justify-center">
                                                <i className="ph ph-arrows-horizontal mr-1 text-gray-300"></i>
                                                <span style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('swipeHint')}</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Completed Orders Tab Content */}
                            {showCompletedOrders && (
                                <>
                                    {loadingCompletedOrders ? (
                                        <div className="text-center py-10">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500 mx-auto"></div>
                                            <p className="mt-3 text-gray-600" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('loadingCompletedOrders')}</p>
                                        </div>
                                    ) : errorCompletedOrders ? (
                                        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                                            <p>{errorCompletedOrders}</p>
                                        </div>
                                    ) : orders.length === 0 ? (
                                        <div className="text-center py-10">
                                            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <i className="ph ph-check-circle text-2xl text-red-500"></i>
                                            </div>
                                            <h3 className="text-lg font-medium text-gray-700 mb-1" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('noCompletedOrders')}</h3>
                                            <p className="text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('completedOrdersHint')}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {orders
                                                .filter(order => order.currentStatus?.label === "COMPLETED" || order.paid === true || order.settled === true)
                                                .map((order, index) => (
                                                    <OrderGroupTile
                                                        key={`completed-${order.id}-${index}`}
                                                        order={order}
                                                        onAccept={() => handleAcceptOrder(order.id)}
                                                        onReject={() => handleRejectOrder(order.id)}
                                                        onPrintBill={() => handlePrintBill(order.id)}
                                                    />
                                                ))
                                            }
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Settings View */}
            {activeView === 'settings' && (
                <div className="space-y-6">
                    {/* Store Settings */}
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center">
                            <i className="ph ph-storefront text-red-500 text-xl mr-2"></i>
                            <h2 className="text-lg font-semibold text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('storeSettings')}</h2>
                        </div>
                        <div className="p-4 space-y-4">
                            {!seller ? (
                                <div className="text-center py-10">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500 mx-auto"></div>
                                    <p className="mt-3 text-gray-600">{t('loadingStoreDetails')}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-gray-100">
                                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-50 to-white flex items-center justify-center border border-gray-200 shadow-sm">
                                            {seller.logo ? (
                                                <img src={seller.logo} alt={seller.name} className="w-10 h-10 object-contain" />
                                            ) : (
                                                <i className="ph ph-storefront text-red-500 text-2xl"></i>
                                            )}
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h3 className="text-lg font-semibold text-gray-800" >{seller.businessName || t('yourStore')}</h3>
                                            <p className="text-gray-500" >{seller.phone || t('retailStore')}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                ModalManager.createCenterModal({
                                                    id: 'edit-profile-modal',
                                                    title: t('editReceiptTemplate'),
                                                    content: `
                                                    <div class="p-4">
                                                        <div id="profile-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                            <div>
                                                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                                                    ${t('businessName')}
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    id="business-name-input"
                                                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                    value="${seller.businessName || ''}"
                                                                    required
                                                                />
                                                            </div>
                                                            <div>
                                                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                                                    ${t('phone')}
                                                                </label>
                                                                <input
                                                                    type="tel"
                                                                    id="phone-input"
                                                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                    value="${seller.phone || ''}"
                                                                />
                                                            </div>
                                                            <div class="md:col-span-2">
                                                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                                                    ${t('address')}
                                                                </label>
                                                                <textarea
                                                                    id="address-input"
                                                                    rows="3"
                                                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                >${seller.address || ''}</textarea>
                                                            </div>
                                                            <div>
                                                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                                                    ${t('gstNumber')}
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    id="gst-input"
                                                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                    value="${seller.gstNo || ''}"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                                                    ${t('upiId')}
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    id="upi-input"
                                                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                    value="${seller.upiId || ''}"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                                                    ${t('currency')}
                                                                </label>
                                                                <select
                                                                    id="currency-input"
                                                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                >
                                                                    ${CurrencyData?.currencies.map(currency =>
                                                        `<option value="${currency.code}" ${(seller.currencyCode || 'INR') === currency.code ? 'selected' : ''}>
                                                                            ${currency.name} (${currency.symbol})
                                                                        </option>`
                                                    ).join('')}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label class="flex items-center">
                                                                    <input
                                                                        type="checkbox"
                                                                        id="kot-enabled-input"
                                                                        class="w-5 h-5 text-red-600 rounded focus:ring-red-500"
                                                                        ${seller.kotEnabled !== false ? 'checked' : ''}
                                                                    />
                                                                    <span class="ml-2 text-gray-700">${t('enableKOT')}</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    `,
                                                    actions: `
                                                    <div class="flex justify-end p-4 space-x-3">
                                                        <button id="cancel-profile-btn" class="px-4 py-2 border rounded-md hover:bg-gray-50">${t('cancel')}</button>
                                                        <button id="save-profile-btn" class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">${t('saveChanges')}</button>
                                                    </div>
                                                    `,
                                                    size: 'lg',
                                                    onShown: (modalControl) => {
                                                        const businessNameInput = document.getElementById('business-name-input');
                                                        const phoneInput = document.getElementById('phone-input');
                                                        const addressInput = document.getElementById('address-input');
                                                        const gstInput = document.getElementById('gst-input');
                                                        const upiInput = document.getElementById('upi-input');
                                                        const kotEnabledInput = document.getElementById('kot-enabled-input');
                                                        const errorContainer = document.getElementById('profile-error-container');
                                                        const cancelButton = document.getElementById('cancel-profile-btn');
                                                        const saveButton = document.getElementById('save-profile-btn');

                                                        // Basic validation
                                                        const validateForm = () => {
                                                            if (!businessNameInput.value.trim()) {
                                                                errorContainer.textContent = t('businessNameRequired');
                                                                errorContainer.classList.remove('hidden');
                                                                return false;
                                                            }

                                                            if (gstInput.value.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstInput.value.trim())) {
                                                                errorContainer.textContent = t('enterValidGST');
                                                                errorContainer.classList.remove('hidden');
                                                                return false;
                                                            }

                                                            return true;
                                                        };

                                                        // Event handlers
                                                        cancelButton.addEventListener('click', () => {
                                                            modalControl.close();
                                                        });

                                                        saveButton.addEventListener('click', async () => {
                                                            if (!validateForm()) return;

                                                            try {
                                                                // Prepare update data
                                                                const updateData = {
                                                                    businessName: businessNameInput.value.trim(),
                                                                    phone: phoneInput.value.trim(),
                                                                    address: addressInput.value.trim(),
                                                                    gstNo: gstInput.value.trim(),
                                                                    upiId: upiInput.value.trim(),
                                                                    kotEnabled: kotEnabledInput.checked,
                                                                    currencyCode: document.getElementById('currency-input').value
                                                                };

                                                                // Update Firestore
                                                                await sdk.profile.update(updateData);

                                                                // Update UserSession with new currency code
                                                                if (UserSession) {
                                                                    UserSession.setCurrencyCode(updateData.currencyCode);
                                                                }

                                                                ModalManager.showToast(t('storeProfileUpdated'));
                                                                modalControl.close();

                                                                // Profile context will handle the UI refresh via real-time listener
                                                            } catch (error) {
                                                                console.error('Error updating store profile:', error);
                                                                errorContainer.textContent = t('updateProfileFailed');
                                                                errorContainer.classList.remove('hidden');
                                                            }
                                                        });
                                                    }
                                                });
                                            }}
                                            className="px-3 py-1.5 bg-gradient-to-r from-white to-gray-50 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-sm shadow-sm self-start sm:self-center"
                                        >
                                            <i className="ph ph-pencil"></i>
                                            <span>{t('edit')}</span>
                                        </button>
                                    </div>

                                    <div className="space-y-0">
                                            {/* Choose Language */}
                                            <div
                                                className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 px-4 rounded-lg transition-colors"
                                                onClick={() => {
                                                    // Simple language chooser modal
                                                    ModalManager.createCenterModal({
                                                        id: 'language-chooser',
                                                        title: t('chooseLanguage'),
                                                        content: `<div class="p-4 space-y-3">
                                                            <button id="lang-en" class="w-full px-4 py-2 border rounded-md flex items-center justify-between focus:outline-none focus:ring-0 ${language === 'en' ? 'border-red-500 bg-red-50' : ''}">
                                                                <span>English</span>
                                                                ${language === 'en' ? '<i class="ph ph-check text-red-500"></i>' : '<i class="ph ph-check text-transparent"></i>'}
                                                            </button>
                                                            <button id="lang-ar" class="w-full px-4 py-2 border rounded-md flex items-center justify-between focus:outline-none focus:ring-0 ${language === 'ar' ? 'border-red-500 bg-red-50' : ''}">
                                                                <span>العربية</span>
                                                                ${language === 'ar' ? '<i class="ph ph-check text-red-500"></i>' : '<i class="ph ph-check text-transparent"></i>'}
                                                            </button>
                                                        </div>`,
                                                        actions: '',
                                                        size: 'sm',
                                                        onShown: () => {
                                                            const enBtn = document.getElementById('lang-en');
                                                            const arBtn = document.getElementById('lang-ar');
                                                            enBtn?.addEventListener('click', () => {
                                                                try { window.LanguageContext?.changeLanguage('en'); } catch {}
                                                                ModalManager.close('language-chooser');
                                                            });
                                                            arBtn?.addEventListener('click', () => {
                                                                try { window.LanguageContext?.changeLanguage('ar'); } catch {}
                                                                ModalManager.close('language-chooser');
                                                            });
                                                        }
                                                    });
                                                }}>
                                                <div className="flex items-center">
                                                    <div className="w-12 h-12 bg-red-50 rounded-lg mr-4 flex-shrink-0 flex items-center justify-center">
                                                        <i className="ph ph-translate text-red-500 text-xl"></i>
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('chooseLanguage')}</h4>
                                                        <p className="text-sm text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{language === 'ar' ? t('arabic') : t('english')}</p>
                                                    </div>
                                                </div>
                                                <button className="mt-2 sm:mt-0 text-gray-400 self-start">
                                                    <i className="ph ph-caret-right text-lg"></i>
                                                </button>
                                            </div>
                                        {/* Edit Receipt Template */}
                                        <div
                                            className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 px-4 rounded-lg transition-colors"
                                            onClick={() => {
                                                // Open Receipt Template management
                                                handlePrintTemplateManagement();
                                            }}>
                                            <div className="flex items-center">
                                                <div className="w-12 h-12 bg-red-50 rounded-lg mr-4 flex-shrink-0 flex items-center justify-center">
                                                    <i className="ph ph-file-text text-red-500 text-xl"></i>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('editReceiptTemplate')}</h4>
                                                    <p className="text-sm text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('manageKOTBillTemplate')}</p>
                                                </div>
                                            </div>
                                            <button className="mt-2 sm:mt-0 text-gray-400 self-start">
                                                <i className="ph ph-caret-right text-lg"></i>
                                            </button>
                                        </div>

                                        {/* Printer Management */}
                                        <div
                                            className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 px-4 rounded-lg transition-colors"
                                            onClick={() => {
                                                // Open Printer Management
                                                handlePrinterManagement();
                                            }}>
                                            <div className="flex items-center">
                                                <div className="w-12 h-12 bg-red-50 rounded-lg mr-4 flex-shrink-0 flex items-center justify-center">
                                                    <i className="ph ph-printer text-red-500 text-xl"></i>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('printerManagement')}</h4>
                                                    <p className="text-sm text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('configurePrinters')}</p>
                                                </div>
                                            </div>
                                            <button className="mt-2 sm:mt-0 text-gray-400 self-start">
                                                <i className="ph ph-caret-right text-lg"></i>
                                            </button>
                                        </div>

                                        {/* Bulk Tax Update */}
                                        <div
                                            className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 px-4 rounded-lg transition-colors"
                                            onClick={() => {
                                                // Open Bulk Tax Update management
                                                handleBulkTaxUpdate();
                                            }}>
                                            <div className="flex items-center">
                                                <div className="w-12 h-12 bg-red-50 rounded-lg mr-4 flex-shrink-0 flex items-center justify-center">
                                                    <i className="ph ph-currency-dollar text-red-500 text-xl"></i>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('bulkTaxUpdate')}</h4>
                                                    <p className="text-sm text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('updateTaxForProducts')}</p>
                                                </div>
                                            </div>
                                            <button className="mt-2 sm:mt-0 text-gray-400 self-start">
                                                <i className="ph ph-caret-right text-lg"></i>
                                            </button>
                                        </div>

                                        {/* Store Hours */}
                                        <div
                                            className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 px-4 rounded-lg transition-colors"
                                            onClick={() => {
                                                // Open Store Hours management
                                                ModalManager.createCenterModal({
                                                    id: 'store-hours-modal',
                                                    title: t('storeHours'),
                                                    content: `<div class="p-4">
                                                        <div class="space-y-4">
                                                            <div>
                                                                <h3 class="font-medium mb-2">${t('businessDays')}</h3>
                                                                <div class="flex flex-wrap gap-2">
                                                                    <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('mon')}</button>
                                                                    <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('tue')}</button>
                                                                    <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('wed')}</button>
                                                                    <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('thu')}</button>
                                                                    <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('fri')}</button>
                                                                    <button class="px-3 py-1 border border-gray-300 text-gray-600 rounded-md">${t('sat')}</button>
                                                                    <button class="px-3 py-1 border border-gray-300 text-gray-600 rounded-md">${t('sun')}</button>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <h3 class="font-medium mb-2">${t('openingHours')}</h3>
                                                                <div class="grid grid-cols-2 gap-4">
                                                                    <div>
                                                                        <label class="block text-sm text-gray-600 mb-1">${t('openingTime')}</label>
                                                                        <input type="time" class="w-full px-3 py-2 border rounded-md" value="09:00">
                                                                    </div>
                                                                    <div>
                                                                        <label class="block text-sm text-gray-600 mb-1">${t('closingTime')}</label>
                                                                        <input type="time" class="w-full px-3 py-2 border rounded-md" value="21:00">
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>`,
                                                    actions: `
                                                        <div class="flex justify-end p-4">
                                                            <button id="save-hours-btn" class="px-4 py-2 bg-red-500 text-white rounded-md">${t('save')}</button>
                                                        </div>
                                                    `,
                                                    size: 'md',
                                                    onShown: (modalControl) => {
                                                        // Add language change listener to refresh modal content
                                                        const handleLanguageChange = () => {
                                                            // Update modal title
                                                            modalControl.setTitle(t('storeHours'));
                                                            
                                                            // Update modal content
                                                            modalControl.setContent(`<div class="p-4">
                                                                <div class="space-y-4">
                                                                    <div>
                                                                        <h3 class="font-medium mb-2">${t('businessDays')}</h3>
                                                                        <div class="flex flex-wrap gap-2">
                                                                            <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('mon')}</button>
                                                                            <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('tue')}</button>
                                                                            <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('wed')}</button>
                                                                            <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('thu')}</button>
                                                                            <button class="px-3 py-1 bg-red-500 text-white rounded-md">${t('fri')}</button>
                                                                            <button class="px-3 py-1 border border-gray-300 text-gray-600 rounded-md">${t('sat')}</button>
                                                                            <button class="px-3 py-1 border border-gray-300 text-gray-600 rounded-md">${t('sun')}</button>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <h3 class="font-medium mb-2">${t('openingHours')}</h3>
                                                                        <div class="grid grid-cols-2 gap-4">
                                                                            <div>
                                                                                <label class="block text-sm text-gray-600 mb-1">${t('openingTime')}</label>
                                                                                <input type="time" class="w-full px-3 py-2 border rounded-md" value="09:00">
                                                                            </div>
                                                                            <div>
                                                                                <label class="block text-sm text-gray-600 mb-1">${t('closingTime')}</label>
                                                                                <input type="time" class="w-full px-3 py-2 border rounded-md" value="21:00">
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>`);
                                                            
                                                            // Update modal actions
                                                            modalControl.setActions(`
                                                                <div class="flex justify-end p-4">
                                                                    <button id="save-hours-btn" class="px-4 py-2 bg-red-500 text-white rounded-md">${t('save')}</button>
                                                                </div>
                                                            `);
                                                        };
                                                        
                                                        // Listen for language changes
                                                        const languageChangeListener = () => {
                                                            setTimeout(handleLanguageChange, 100);
                                                        };
                                                        
                                                        window.addEventListener('languageChange', languageChangeListener);
                                                        
                                                        // Clean up listener when modal is closed
                                                        const originalClose = modalControl.close;
                                                        modalControl.close = () => {
                                                            window.removeEventListener('languageChange', languageChangeListener);
                                                            originalClose();
                                                        };
                                                    }
                                                });
                                            }}>
                                            <div className="flex items-center">
                                                <div className="w-12 h-12 bg-red-50 rounded-lg mr-4 flex-shrink-0 flex items-center justify-center">
                                                    <i className="ph ph-clock text-red-500 text-xl"></i>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('storeHours')}</h4>
                                                    <p className="text-sm text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('setBusinessHours')}</p>
                                                </div>
                                            </div>
                                            <button className="mt-2 sm:mt-0 text-gray-400 self-start">
                                                <i className="ph ph-caret-right text-lg"></i>
                                            </button>
                                        </div>

                                        {/* Payment Methods */}
                                        <div
                                            className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 px-4 rounded-lg transition-colors"
                                            onClick={() => {
                                                // Open Payment Methods management
                                                ModalManager.createCenterModal({
                                                    id: 'payment-methods-modal',
                                                    title: t('paymentMethods'),
                                                    content: `<div class="p-4">
                                                        <div class="space-y-4">
                                                            <div class="flex items-center justify-between p-3 border rounded-md">
                                                                <div class="flex items-center">
                                                                    <i class="ph ph-money text-red-500 text-xl mr-3"></i>
                                                                    <span>${t('cashPayment')}</span>
                                                                </div>
                                                                <label class="relative inline-flex items-center cursor-pointer">
                                                                    <input type="checkbox" checked class="sr-only peer">
                                                                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                                                </label>
                                                            </div>
                                                            <div class="flex items-center justify-between p-3 border rounded-md">
                                                                <div class="flex items-center">
                                                                    <i class="ph ph-credit-card text-red-500 text-xl mr-3"></i>
                                                                    <span>${t('digitalPayment')}</span>
                                                                </div>
                                                                <label class="relative inline-flex items-center cursor-pointer">
                                                                    <input type="checkbox" checked class="sr-only peer">
                                                                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                                                </label>
                                                            </div>
                                                            <div class="flex items-center justify-between p-3 border rounded-md">
                                                                <div class="flex items-center">
                                                                    <i class="ph ph-qr-code text-red-500 text-xl mr-3"></i>
                                                                    <span>${t('upiId')}</span>
                                                                </div>
                                                                <label class="relative inline-flex items-center cursor-pointer">
                                                                    <input type="checkbox" checked class="sr-only peer">
                                                                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>`,
                                                    actions: `
                                                        <div class="flex justify-end p-4">
                                                            <button id="save-payment-methods-btn" class="px-4 py-2 bg-red-500 text-white rounded-md">${t('save')}</button>
                                                        </div>
                                                    `,
                                                    size: 'md',
                                                    onShown: (modalControl) => {
                                                        // Add language change listener to refresh modal content
                                                        const handleLanguageChange = () => {
                                                            // Update modal title
                                                            modalControl.setTitle(t('paymentMethods'));
                                                            
                                                            // Update modal content
                                                            modalControl.setContent(`<div class="p-4">
                                                                <div class="space-y-4">
                                                                    <div class="flex items-center justify-between p-3 border rounded-md">
                                                                        <div class="flex items-center">
                                                                            <i class="ph ph-money text-red-500 text-xl mr-3"></i>
                                                                            <span>${t('cashPayment')}</span>
                                                                        </div>
                                                                        <label class="relative inline-flex items-center cursor-pointer">
                                                                            <input type="checkbox" checked class="sr-only peer">
                                                                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                                                        </label>
                                                                    </div>
                                                                    <div class="flex items-center justify-between p-3 border rounded-md">
                                                                        <div class="flex items-center">
                                                                            <i class="ph ph-credit-card text-red-500 text-xl mr-3"></i>
                                                                            <span>${t('digitalPayment')}</span>
                                                                        </div>
                                                                        <label class="relative inline-flex items-center cursor-pointer">
                                                                            <input type="checkbox" checked class="sr-only peer">
                                                                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                                                        </label>
                                                                    </div>
                                                                    <div class="flex items-center justify-between p-3 border rounded-md">
                                                                        <div class="flex items-center">
                                                                            <i class="ph ph-qr-code text-red-500 text-xl mr-3"></i>
                                                                            <span>${t('upiId')}</span>
                                                                        </div>
                                                                        <label class="relative inline-flex items-center cursor-pointer">
                                                                            <input type="checkbox" checked class="sr-only peer">
                                                                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            </div>`);
                                                            
                                                            // Update modal actions
                                                            modalControl.setActions(`
                                                                <div class="flex justify-end p-4">
                                                                    <button id="save-payment-methods-btn" class="px-4 py-2 bg-red-500 text-white rounded-md">${t('save')}</button>
                                                                </div>
                                                            `);
                                                        };
                                                        
                                                        // Listen for language changes
                                                        const languageChangeListener = () => {
                                                            setTimeout(handleLanguageChange, 100);
                                                        };
                                                        
                                                        window.addEventListener('languageChange', languageChangeListener);
                                                        
                                                        // Clean up listener when modal is closed
                                                        const originalClose = modalControl.close;
                                                        modalControl.close = () => {
                                                            window.removeEventListener('languageChange', languageChangeListener);
                                                            originalClose();
                                                        };
                                                    }
                                                });
                                            }}>
                                            <div className="flex items-center">
                                                <div className="w-12 h-12 bg-red-50 rounded-lg mr-4 flex-shrink-0 flex items-center justify-center">
                                                    <i className="ph ph-credit-card text-red-500 text-xl"></i>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-800" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('paymentMethods')}</h4>
                                                    <p className="text-sm text-gray-500" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>{t('managePaymentOptions')}</p>
                                                </div>
                                            </div>
                                            <button className="mt-2 sm:mt-0 text-gray-400 self-start">
                                                <i className="ph ph-caret-right text-lg"></i>
                                            </button>
                                        </div>

                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <AddTableModal
                isOpen={isAddTableModalOpen}
                onClose={() => setIsAddTableModalOpen(false)}
                seller={seller}
            />

            <RenameRoomModal
                isOpen={isRenameRoomModalOpen}
                onClose={() => setIsRenameRoomModalOpen(false)}
                tableId={selectedTableId}
                variant={selectedVariant}
                seller={seller}
            />

            <OrderRoom
                isOpen={isOrderRoomOpen}
                onClose={() => setIsOrderRoomOpen(false)}
                tableId={selectedRoomTableId}
                variant={selectedRoomVariant}
                orderStatus="KITCHEN"
                seller={seller}
            />

            {/* QR Order Assignment Modal */}
            {showQrAssignmentModal && selectedQrOrder && (
                <QrOrderAssignmentModal
                    order={selectedQrOrder}
                    availableTables={availableTables}
                    onAssignToTable={handleAssignToTable}
                    onConfirmAsParcel={handleConfirmAsParcel}
                    onClose={() => {
                        setShowQrAssignmentModal(false);
                        setSelectedQrOrder(null);
                        setAvailableTables([]);
                    }}
                />
            )}
        </div>
    );
}
