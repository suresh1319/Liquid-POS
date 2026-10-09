import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { UserSession } from '../utils/UserSession.js';
import { InventoryItem } from '../models/Product.js';

export function SuppliersOrdersModal({ isOpen, onClose }) {
    const [activeTab, setActiveTab] = useState('suppliers');
    const [suppliers, setSuppliers] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [newSupplier, setNewSupplier] = useState({
        name: '',
        company: '',
        contact: '',
        email: '',
        address: '',
        gst: ''
    });
    const [newOrder, setNewOrder] = useState({
        supplierId: '',
        items: [],
        totalAmount: 0,
        status: 'pending',
        orderDate: new Date().toISOString().split('T')[0],
        expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        try {
            await Promise.all([
                loadSuppliers(),
                loadPurchaseOrders()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    const loadSuppliers = async () => {
        try {
            const suppliersSnapshot = await sdk.db.collection("Suppliers").get();
            const suppliersList = suppliersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSuppliers(suppliersList);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    };

    const loadPurchaseOrders = async () => {
        try {
            const ordersSnapshot = await sdk.db.collection("PurchaseOrders")
                .orderBy("orderDate", "desc")
                .get();
            const ordersList = ordersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setPurchaseOrders(ordersList);
        } catch (error) {
            console.error('Error loading purchase orders:', error);
        }
    };

    const handleAddSupplier = async () => {
        try {
            if (!newSupplier.name || !newSupplier.company) {
                showToast('Please fill in required fields', 'error');
                return;
            }

            const supplierRef = sdk.db.collection("Suppliers").doc();
            await supplierRef.set({
                ...newSupplier,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            showToast('Supplier added successfully', 'success');
            setNewSupplier({
                name: '',
                company: '',
                contact: '',
                email: '',
                address: '',
                gst: ''
            });
            loadSuppliers();
        } catch (error) {
            console.error('Error adding supplier:', error);
            showToast('Failed to add supplier', 'error');
        }
    };

    const handleCreateOrder = async () => {
        try {
            if (!newOrder.supplierId || newOrder.items.length === 0) {
                showToast('Please select supplier and add items', 'error');
                return;
            }

            // Get supplier details
            const supplier = suppliers.find(s => s.id === newOrder.supplierId);
            if (!supplier) {
                showToast('Supplier not found', 'error');
                return;
            }

            const orderRef = sdk.db.collection("PurchaseOrders").doc();
            const orderData = {
                ...newOrder,
                orderId: `PO-${Date.now()}`,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await orderRef.set(orderData);

            showToast('Purchase order created successfully', 'success');
            
            // Send email to supplier if email is provided
            if (supplier.email) {
                // Show a message that email is being sent
                showToast('Preparing purchase order email to supplier...', 'info');
                // Use a longer delay to ensure order is fully saved before sending email
                setTimeout(() => {
                    sendPurchaseOrderEmail(supplier, orderData);
                }, 1500);
            }

            setNewOrder({
                supplierId: '',
                items: [],
                totalAmount: 0,
                status: 'pending',
                orderDate: new Date().toISOString().split('T')[0],
                expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
            loadPurchaseOrders();
        } catch (error) {
            console.error('Error creating purchase order:', error);
            showToast('Failed to create purchase order: ' + error.message, 'error');
        }
    };

    // Function to send purchase order email to supplier
    const sendPurchaseOrderEmail = (supplier, order) => {
        try {
            // Validate inputs
            if (!supplier || !supplier.email || !order) {
                console.warn('Invalid supplier or order data for email');
                return;
            }

            const subject = `Purchase Order ${order.orderId} from ${UserSession?.seller?.businessName || 'Your Business'}`;
            
            // Create a detailed email body with order information
            let body = `Dear ${supplier.name || 'Supplier'},\n\n`;
            body += `You have received a new purchase order from ${UserSession?.seller?.businessName || 'our business'}.\n\n`;
            body += `----------------------------------------\n`;
            body += `ORDER DETAILS\n`;
            body += `----------------------------------------\n`;
            body += `Order ID: ${order.orderId || 'N/A'}\n`;
            
            // Safely format dates
            try {
                body += `Order Date: ${order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'}\n`;
                body += `Expected Delivery: ${order.expectedDelivery ? new Date(order.expectedDelivery).toLocaleDateString() : 'N/A'}\n`;
            } catch (dateError) {
                body += `Order Date: ${order.orderDate || 'N/A'}\n`;
                body += `Expected Delivery: ${order.expectedDelivery || 'N/A'}\n`;
            }
            
            body += `Status: ${order.status || 'pending'}\n`;
            body += `Total Amount: ₹${(order.totalAmount || 0).toFixed(2)}\n\n`;
            
            body += `----------------------------------------\n`;
            body += `ITEMS ORDERED\n`;
            body += `----------------------------------------\n`;
            
            if (order.items && Array.isArray(order.items) && order.items.length > 0) {
                order.items.forEach((item, index) => {
                    body += `${index + 1}. ${item.name || 'Unnamed Item'}\n`;
                    body += `   Quantity: ${item.quantity || 0} ${item.unit || ''}\n`;
                    body += `   Unit Price: ₹${(item.unitPrice || 0).toFixed(2)}\n`;
                    body += `   Total: ₹${(item.totalPrice || 0).toFixed(2)}\n\n`;
                });
            } else {
                body += `No items specified\n\n`;
            }
            
            body += `----------------------------------------\n`;
            body += `SUPPLIER INFORMATION\n`;
            body += `----------------------------------------\n`;
            body += `Supplier Name: ${supplier.name || 'N/A'}\n`;
            body += `Company: ${supplier.company || 'N/A'}\n`;
            if (supplier.contact) body += `Contact: ${supplier.contact}\n`;
            if (supplier.email) body += `Email: ${supplier.email}\n`;
            if (supplier.address) body += `Address: ${supplier.address}\n`;
            if (supplier.gst) body += `GST: ${supplier.gst}\n\n`;
            
            body += `----------------------------------------\n`;
            body += `BUYER INFORMATION\n`;
            body += `----------------------------------------\n`;
            body += `Business: ${UserSession?.seller?.businessName || 'Not specified'}\n`;
            if (UserSession?.seller?.phone) body += `Phone: ${UserSession?.seller?.phone}\n`;
            if (UserSession?.seller?.email) body += `Email: ${UserSession?.seller?.email}\n`;
            if (UserSession?.seller?.address) body += `Address: ${UserSession?.seller?.address}\n`;
            if (UserSession?.seller?.gstIN) body += `GST: ${UserSession?.seller?.gstIN}\n\n`;
            
            body += `Please confirm receipt of this order and let us know your delivery schedule.\n\n`;
            body += `Best regards,\n`;
            body += `${UserSession?.seller?.businessName || 'Our Team'}\n`;
            if (UserSession?.seller?.phone) body += `Phone: ${UserSession?.seller?.phone}\n`;
            
            // Safely encode the subject and body
            let mailtoUrl;
            try {
                mailtoUrl = `mailto:${encodeURIComponent(supplier.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            } catch (encodeError) {
                console.error('Error encoding email URL:', encodeError);
                showToast('Purchase order created, but email could not be sent automatically. Please send manually to: ' + supplier.email, 'warning');
                return;
            }
            
            // Try to open email client
            let newWindow;
            try {
                // Use _self to replace current page instead of opening blank tab
                newWindow = window.open(mailtoUrl, '_self');
            } catch (openError) {
                console.error('Error opening email client:', openError);
                showToast('Purchase order created, but email could not be sent automatically. Please send manually to: ' + supplier.email, 'warning');
                return;
            }
            
            // Check if window was successfully opened
            if (!newWindow) {
                console.log("Email client could not be opened automatically. Please check the supplier's email: " + supplier.email);
                showToast('Purchase order created. Please manually send email to supplier: ' + supplier.email, 'warning');
            } else {
                // If window opened successfully, show success message after a delay
                setTimeout(() => {
                    showToast('Purchase order email sent to supplier', 'success');
                }, 1000);
            }
        } catch (error) {
            console.error('Error sending email:', error);
            showToast('Purchase order created, but email could not be sent automatically. Please send manually to: ' + (supplier?.email || 'supplier'), 'warning');
        }
    };

    const handleAddOrderItem = () => {
        const newItem = {
            id: Date.now(),
            name: '',
            quantity: 0,
            unit: '',
            unitPrice: 0,
            totalPrice: 0
        };
        setNewOrder(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));
    };

    const handleUpdateOrderItem = (index, field, value) => {
        const updatedItems = [...newOrder.items];
        updatedItems[index] = {
            ...updatedItems[index],
            [field]: value
        };

        // Calculate total price if quantity or unit price changes
        if (field === 'quantity' || field === 'unitPrice') {
            updatedItems[index].totalPrice = updatedItems[index].quantity * updatedItems[index].unitPrice;
        }

        const totalAmount = updatedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        
        setNewOrder(prev => ({
            ...prev,
            items: updatedItems,
            totalAmount: totalAmount
        }));
    };

    const handleRemoveOrderItem = (index) => {
        const updatedItems = newOrder.items.filter((_, i) => i !== index);
        const totalAmount = updatedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        
        setNewOrder(prev => ({
            ...prev,
            items: updatedItems,
            totalAmount: totalAmount
        }));
    };

    const handleReceiveOrder = async (orderId) => {
        try {
            setLoading(true);
            await sdk.db.collection("PurchaseOrders").doc(orderId).update({
                status: 'received',
                receivedDate: new Date(),
                updatedAt: new Date()
            });
            
            showToast('Order marked as received', 'success');
            loadPurchaseOrders();
        } catch (error) {
            console.error('Error updating order status:', error);
            showToast('Failed to update order status', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800">
                        Suppliers & Orders
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <i className="ph ph-x text-xl"></i>
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('suppliers')}
                        className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
                            activeTab === 'suppliers'
                                ? 'text-red-600 border-b-2 border-red-600'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        Suppliers
                    </button>
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
                            activeTab === 'orders'
                                ? 'text-red-600 border-b-2 border-red-600'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        Purchase Orders
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                    {activeTab === 'suppliers' && (
                        <div className="space-y-6">
                            {/* Add Supplier Form */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-medium text-gray-800 mb-4">Add New Supplier</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Supplier Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newSupplier.name}
                                            onChange={(e) => setNewSupplier(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            placeholder="Enter supplier name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Company Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newSupplier.company}
                                            onChange={(e) => setNewSupplier(prev => ({ ...prev, company: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            placeholder="Enter company name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Contact Number *
                                        </label>
                                        <input
                                            type="text"
                                            value={newSupplier.contact}
                                            onChange={(e) => setNewSupplier(prev => ({ ...prev, contact: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            placeholder="Enter contact number"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={newSupplier.email}
                                            onChange={(e) => setNewSupplier(prev => ({ ...prev, email: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            placeholder="Enter email address"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            GST Number
                                        </label>
                                        <input
                                            type="text"
                                            value={newSupplier.gst}
                                            onChange={(e) => setNewSupplier(prev => ({ ...prev, gst: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            placeholder="Enter GST number"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Address
                                        </label>
                                        <textarea
                                            value={newSupplier.address}
                                            onChange={(e) => setNewSupplier(prev => ({ ...prev, address: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            rows={3}
                                            placeholder="Enter supplier address"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddSupplier}
                                    className="mt-4 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                                >
                                    Add Supplier
                                </button>
                            </div>

                            {/* Suppliers List */}
                            <div>
                                <h3 className="font-medium text-gray-800 mb-4">Suppliers</h3>
                                <div className="space-y-3">
                                    {suppliers.map(supplier => (
                                        <div key={supplier.id} className="bg-white border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4 className="font-medium text-gray-800">{supplier.name}</h4>
                                                    <p className="text-sm text-gray-600">{supplier.company}</p>
                                                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                                                        <div><i className="ph ph-phone mr-1"></i> {supplier.contact}</div>
                                                        {supplier.email && <div><i className="ph ph-envelope mr-1"></i> {supplier.email}</div>}
                                                        {supplier.gst && <div><i className="ph ph-file-text mr-1"></i> GST: {supplier.gst}</div>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {suppliers.length === 0 && (
                                        <div className="text-center py-8 text-gray-500">
                                            No suppliers found. Add your first supplier above.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'orders' && (
                        <div className="space-y-6">
                            {/* Create Purchase Order */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-medium text-gray-800 mb-4">Create Purchase Order</h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Supplier *
                                            </label>
                                            <select
                                                value={newOrder.supplierId}
                                                onChange={(e) => setNewOrder(prev => ({ ...prev, supplierId: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            >
                                                <option value="">Select supplier</option>
                                                {suppliers.map(supplier => (
                                                    <option key={supplier.id} value={supplier.id}>
                                                        {supplier.name} - {supplier.company}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Order Date
                                            </label>
                                            <input
                                                type="date"
                                                value={newOrder.orderDate}
                                                onChange={(e) => setNewOrder(prev => ({ ...prev, orderDate: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Order Items */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-sm font-medium text-gray-700">
                                                Order Items
                                            </label>
                                            <button
                                                type="button"
                                                onClick={handleAddOrderItem}
                                                className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
                                            >
                                                <i className="ph ph-plus mr-1"></i>
                                                Add Item
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {newOrder.items.map((item, index) => (
                                                <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3">
                                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                                        <div>
                                                            <input
                                                                type="text"
                                                                value={item.name}
                                                                onChange={(e) => handleUpdateOrderItem(index, 'name', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                                placeholder="Item name"
                                                            />
                                                        </div>
                                                        <div>
                                                            <input
                                                                type="number"
                                                                value={item.quantity}
                                                                onChange={(e) => handleUpdateOrderItem(index, 'quantity', Number(e.target.value))}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                                min="0"
                                                                step="0.01"
                                                                placeholder="Qty"
                                                            />
                                                        </div>
                                                        <div>
                                                            <input
                                                                type="text"
                                                                value={item.unit}
                                                                onChange={(e) => handleUpdateOrderItem(index, 'unit', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                                placeholder="Unit"
                                                            />
                                                        </div>
                                                        <div>
                                                            <input
                                                                type="number"
                                                                value={item.unitPrice}
                                                                onChange={(e) => handleUpdateOrderItem(index, 'unitPrice', Number(e.target.value))}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                                min="0"
                                                                step="0.01"
                                                                placeholder="Unit Price"
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-sm font-medium">
                                                                ₹{(item.totalPrice || 0).toFixed(2)}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveOrderItem(index)}
                                                                className="text-red-500 hover:text-red-700"
                                                            >
                                                                <i className="ph ph-trash text-sm"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                                        <div className="text-lg font-medium">
                                            Total: ₹{newOrder.totalAmount.toFixed(2)}
                                        </div>
                                        <button
                                            onClick={handleCreateOrder}
                                            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                                        >
                                            Create Order
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Purchase Orders List */}
                            <div>
                                <h3 className="font-medium text-gray-800 mb-4">Purchase Orders</h3>
                                <div className="space-y-3">
                                    {purchaseOrders.map(order => (
                                        <div key={order.id} className="bg-white border border-gray-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="font-medium text-gray-800">{order.orderId}</h4>
                                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                            order.status === 'received' ? 'bg-green-100 text-green-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {order.status}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        Supplier: {suppliers.find(s => s.id === order.supplierId)?.name || 'Unknown'}
                                                    </p>
                                                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                                                        <div>Order Date: {new Date(order.orderDate).toLocaleDateString()}</div>
                                                        <div>Expected Delivery: {new Date(order.expectedDelivery).toLocaleDateString()}</div>
                                                        {order.receivedDate && <div>Received: {new Date(order.receivedDate).toLocaleDateString()}</div>}
                                                        <div>Total: ₹{order.totalAmount.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                {order.status === 'pending' && (
                                                    <button
                                                        onClick={() => handleReceiveOrder(order.id)}
                                                        className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors text-sm"
                                                        disabled={loading}
                                                    >
                                                        {loading ? 'Processing...' : 'Mark Received'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {purchaseOrders.length === 0 && (
                                        <div className="text-center py-8 text-gray-500">
                                            No purchase orders found. Create your first order above.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}