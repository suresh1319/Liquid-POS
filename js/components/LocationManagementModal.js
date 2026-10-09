
import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { locationService } from '../utils/locationService.js';
import { StockTransferModal } from './StockTransferModal.js';

export function LocationManagementModal({ isOpen, onClose }) {
    const [locations, setLocations] = useState([]);
    const [newLocation, setNewLocation] = useState({
        name: '',
        description: ''
    });
    const [loading, setLoading] = useState(false);
    const [deletingLocation, setDeletingLocation] = useState(null);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [selectedTransferLocation, setSelectedTransferLocation] = useState('');
    const [locationStock, setLocationStock] = useState({});
    const [transferItem, setTransferItem] = useState(null);
    const [availableItems, setAvailableItems] = useState([]);

    useEffect(() => {
        if (isOpen) {
            // Subscribe to location changes
            const unsubscribe = locationService.subscribe((updatedLocations) => {
                setLocations(updatedLocations);
                loadLocationStock(updatedLocations);
            });
            
            // Load current locations
            locationService.loadLocations();
            
            return unsubscribe;
        }
    }, [isOpen]);

    const loadLocationStock = async (locationsList) => {
        try {
            const stockData = {};
            for (const location of locationsList) {
                if (location.id) {
                    const stockSnapshot = await sdk.db.collection("Inventory")
                        .where("location", "==", location.id)
                        .get();
                    stockData[location.id] = stockSnapshot.docs.length;
                }
            }
            setLocationStock(stockData);
        } catch (error) {
            console.error('Error loading location stock:', error);
        }
    };

    const handleAddLocation = async () => {
        try {
            if (!newLocation.name.trim()) {
                showToast('Location name is required', 'error');
                return;
            }

            await locationService.addLocation(newLocation);
            showToast('Location added successfully', 'success');
            setNewLocation({ name: '', description: '' });
            
            // Reload location stock after adding new location
            setTimeout(() => {
                loadLocationStock(locations);
            }, 100);
        } catch (error) {
            console.error('Error adding location:', error);
            showToast('Failed to add location', 'error');
        }
    };

    const handleDeleteLocation = async (locationId) => {
        try {
            setLoading(true);
            
            // Check if there's stock in this location
            const stockSnapshot = await sdk.db.collection("Inventory")
                .where("location", "==", locationId)
                .get();
            
            if (stockSnapshot.docs.length > 0) {
                // Show transfer modal
                setDeletingLocation(locationId);
                setShowTransferModal(true);
                return;
            }

            // No stock, can delete directly
            await locationService.deleteLocation(locationId);
            showToast('Location deleted successfully', 'success');
            
            // Reload location stock after deletion
            setTimeout(() => {
                loadLocationStock(locations.filter(loc => loc.id !== locationId));
            }, 100);
        } catch (error) {
            console.error('Error deleting location:', error);
            showToast(error.message || 'Failed to delete location', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleTransferStock = async () => {
        if (!deletingLocation || !selectedTransferLocation) return;

        try {
            setLoading(true);
            
            const transferredItems = await locationService.transferStock(deletingLocation, selectedTransferLocation);
            
            showToast(`Transferred ${transferredItems} items and deleted location successfully`, 'success');
            
            // Reset state and reload location stock
            setDeletingLocation(null);
            setShowTransferModal(false);
            setSelectedTransferLocation('');
            
            setTimeout(() => {
                loadLocationStock(locations.filter(loc => loc.id !== deletingLocation));
            }, 100);
        } catch (error) {
            console.error('Error transferring stock:', error);
            showToast('Failed to transfer stock', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenTransferModal = async (locationId) => {
        try {
            // Get items from the location
            const itemsSnapshot = await sdk.db.collection("Inventory")
                .where("location", "==", locationId)
                .get();

            if (itemsSnapshot.docs.length === 0) {
                showToast('No items to transfer', 'error');
                return;
            }

            // Process all items from the location
            const itemsList = itemsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name,
                    quantity: data.quantity || 0,
                    unit: data.unit,
                    minQuantity: data.minQuantity || 0,
                    location: data.location,
                    vendorName: data.vendorName,
                    perKgCost: data.perKgCost || 0
                };
            });

            setAvailableItems(itemsList);
            setTransferItem({
                id: locationId,
                name: `Transfer from ${locations.find(loc => loc.id === locationId)?.name || 'Unknown Location'}`,
                quantity: itemsList.reduce((total, item) => total + item.quantity, 0),
                unit: 'items',
                location: locationId
            });
            setShowTransferModal(true);
        } catch (error) {
            console.error('Error opening transfer modal:', error);
            showToast('Failed to open transfer modal', 'error');
        }
    };

    const getAvailableTransferLocations = () => {
        return locations.filter(loc => loc.id !== deletingLocation);
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Main Location Management Modal */}
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-gray-200">
                        <h2 className="text-xl font-semibold text-gray-800">
                            Location Management
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <i className="ph ph-x text-xl"></i>
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                        {/* Add Location Form */}
                        <div className="bg-gray-50 rounded-lg p-4 mb-6">
                            <h3 className="font-medium text-gray-800 mb-4">Add New Location</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Location Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={newLocation.name}
                                        onChange={(e) => setNewLocation(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                        placeholder="Enter location name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={newLocation.description}
                                        onChange={(e) => setNewLocation(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                        rows={3}
                                        placeholder="Enter location description (optional)"
                                    />
                                </div>
                                <button
                                    onClick={handleAddLocation}
                                    className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                                >
                                    Add Location
                                </button>
                            </div>
                        </div>

                        {/* Locations List */}
                        <div>
                            <h3 className="font-medium text-gray-800 mb-4">Existing Locations</h3>
                            <div className="space-y-3">
                                {locations.map(location => (
                                    <div key={location.id} className="bg-white border border-gray-200 rounded-lg p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-gray-800">{location.name}</h4>
                                                {location.description && (
                                                    <p className="text-sm text-gray-600 mt-1">{location.description}</p>
                                                )}
                                                <div className="mt-2 flex items-center gap-4 text-sm">
                                                    <span className={`px-2 py-1 rounded-full ${
                                                        locationStock[location.id] > 0 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                        {locationStock[location.id] || 0} items
                                                    </span>
                                                    <span className="text-gray-500">
                                                        Created: {new Date(location.createdAt || Date.now()).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleOpenTransferModal(location.id)}
                                                    className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
                                                >
                                                    <i className="ph ph-arrows-left-right"></i> Transfer
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLocation(location.id)}
                                                    disabled={loading}
                                                    className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm disabled:opacity-50"
                                                >
                                                    {loading ? 'Processing...' : 'Delete'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {locations.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        No locations found. Add your first location above.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stock Transfer Modal */}
            {showTransferModal && transferItem && (
                <StockTransferModal
                    isOpen={showTransferModal}
                    onClose={() => {
                        setShowTransferModal(false);
                        setTransferItem(null);
                        setAvailableItems([]);
                    }}
                    sourceLocation={transferItem.location}
                    availableItems={availableItems}
                    onTransferComplete={() => {
                        // Reload location stock after transfer
                        setTimeout(() => {
                            loadLocationStock(locations.filter(loc => loc.id !== deletingLocation));
                        }, 100);
                    }}
                />
            )}
        </>
    );
}