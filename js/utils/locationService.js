import { sdk } from '../sdk.js';

// Location Service - manages locations across the application
export class LocationService {
    constructor() {
        this.locations = [];
        this.listeners = [];
        this.loading = false;
    }

    // Subscribe to location changes
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        };
    }

    // Notify all listeners of location changes
    notify() {
        this.listeners.forEach(callback => callback(this.locations));
    }

    // Load locations from Firestore
    async loadLocations() {
        if (this.loading) return;
        
        this.loading = true;
        try {
            const locationsSnapshot = await sdk.db.collection("Locations").get();
            this.locations = locationsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt || new Date().toISOString(),
                    updatedAt: data.updatedAt || new Date().toISOString()
                };
            });
            
            // Sort locations by name
            this.locations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            this.notify();
            return this.locations;
        } catch (error) {
            console.error('Error loading locations:', error);
            throw error;
        } finally {
            this.loading = false;
        }
    }

    // Add a new location
    async addLocation(locationData) {
        try {
            if (!locationData.name || !locationData.name.trim()) {
                throw new Error('Location name is required');
            }

            const locationRef = sdk.db.collection("Locations").doc();
            await locationRef.set({
                name: locationData.name.trim(),
                description: locationData.description || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const newLocation = {
                id: locationRef.id,
                name: locationData.name.trim(),
                description: locationData.description || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this.locations.push(newLocation);
            this.locations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            this.notify();

            return newLocation;
        } catch (error) {
            console.error('Error adding location:', error);
            throw error;
        }
    }

    // Delete a location
    async deleteLocation(locationId) {
        try {
            // Check if there's stock in this location
            const stockSnapshot = await sdk.db.collection("Inventory")
                .where("location", "==", locationId)
                .get();

            if (stockSnapshot.docs.length > 0) {
                throw new Error(`Cannot delete location: It contains ${stockSnapshot.docs.length} items. Please transfer stock first.`);
            }

            await sdk.db.collection("Locations").doc(locationId).delete();
            
            this.locations = this.locations.filter(loc => loc.id !== locationId);
            this.notify();

            return true;
        } catch (error) {
            console.error('Error deleting location:', error);
            throw error;
        }
    }

    // Transfer stock from one location to another
    async transferStock(fromLocationId, toLocationId) {
        try {
            const itemsSnapshot = await sdk.db.collection("Inventory")
                .where("location", "==", fromLocationId)
                .get();

            const transferPromises = itemsSnapshot.docs.map(doc => {
                return sdk.db.collection("Inventory").doc(doc.id).update({
                    location: toLocationId,
                    updatedAt: new Date().toISOString()
                });
            });

            await Promise.all(transferPromises);

            // Now delete the location
            await this.deleteLocation(fromLocationId);

            return transferPromises.length;
        } catch (error) {
            console.error('Error transferring stock:', error);
            throw error;
        }
    }

    // Get all locations as options for dropdowns
    getLocationOptions() {
        return [
            { value: 'all', label: 'All Locations' },
            ...this.locations.map(location => ({
                value: location.id,
                label: location.name
            }))
        ];
    }

    // Get location by ID
    getLocationById(locationId) {
        return this.locations.find(location => location.id === locationId);
    }

    // Get location by ID
    getLocationById(locationId) {
        return this.locations.find(loc => loc.id === locationId);
    }

    // Get location name by ID
    getLocationName(locationId) {
        const location = this.getLocationById(locationId);
        return location ? location.name : 'Unknown Location';
    }
}

// Create a singleton instance
export const locationService = new LocationService();

// Initialize locations on app load
locationService.loadLocations().catch(console.error);