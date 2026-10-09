import { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { useProfile } from '../contexts/ProfileContext.js';

export default function KDSManagement() {
    const { profile, updateProfile } = useProfile();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        notificationSounds: {
            orderReceived: 'default',
            orderCancelled: 'default',
            menuOrderCompleted: 'default'
        },
        showKitchenNotes: true
    });

    // Initialize form data when profile is loaded
    useEffect(() => {
        if (profile?.kdsSettings) {
            setFormData({
                notificationSounds: {
                    orderReceived: profile.kdsSettings.notificationSounds?.orderReceived || 'default',
                    orderCancelled: profile.kdsSettings.notificationSounds?.orderCancelled || 'default',
                    orderCompleted: profile.kdsSettings.notificationSounds?.orderCompleted || 'default'
                },
                showKitchenNotes: profile.kdsSettings.showKitchenNotes !== false
            });
        }
    }, [profile]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({
                ...prev,
                [parent]: {
                    ...prev[parent],
                    [child]: type === 'checkbox' ? checked : value
                }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            const updatedSettings = {
                ...profile.kdsSettings,
                notificationSounds: formData.notificationSounds,
                showKitchenNotes: formData.showKitchenNotes
            };

            await sdk.profile.update({
                kdsSettings: updatedSettings
            });

            setIsEditing(false);
            
            // Show success message
            if (window.showToast) {
                window.showToast('KDS settings updated successfully', 'success');
            } else {
                alert('KDS settings updated successfully');
            }
        } catch (error) {
            console.error('Error updating KDS settings:', error);
            if (window.showToast) {
                window.showToast('Failed to update KDS settings', 'error');
            } else {
                alert('Failed to update KDS settings');
            }
        }
    };

    const testSound = (type) => {
        const audio = new Audio();
        switch (type) {
            case 'orderReceived':
                audio.src = formData.notificationSounds.orderReceived === 'default' 
                    ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT' 
                    : formData.notificationSounds.orderReceived;
                break;
            case 'orderCancelled':
                audio.src = formData.notificationSounds.orderCancelled === 'default' 
                    ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT' 
                    : formData.notificationSounds.orderCancelled;
                break;
            case 'orderCompleted':
                audio.src = formData.notificationSounds.orderCompleted === 'default' 
                    ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT' 
                    : formData.notificationSounds.orderCompleted;
                break;
        }
        audio.play().catch(console.error);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                    <i className="ph ph-cooking-pot text-2xl text-red-500"></i>
                    <h3 className="text-xl font-semibold text-gray-800">KDS Management</h3>
                </div>
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                        isEditing 
                            ? 'bg-gray-500 text-white hover:bg-gray-600' 
                            : 'bg-red-500 text-white hover:bg-red-600'
                    }`}
                >
                    {isEditing ? 'Cancel' : 'Edit Settings'}
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Notification Sounds */}
                <div className="border-b border-gray-200 pb-6">
                    <h4 className="text-lg font-medium text-gray-800 mb-4">Notification Sounds</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { key: 'orderReceived', label: 'Order Received', icon: 'ph-bell' },
                            { key: 'orderCancelled', label: 'Order Cancelled', icon: 'ph-x-circle' },
                            { key: 'orderCompleted', label: 'Order Completed', icon: 'ph-check-circle' }
                        ].map(({ key, label, icon }) => (
                            <div key={key} className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    {label}
                                </label>
                                <div className="flex space-x-2">
                                    <select
                                        name={`notificationSounds.${key}`}
                                        value={formData.notificationSounds[key]}
                                        onChange={handleInputChange}
                                        disabled={!isEditing}
                                        className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-100"
                                    >
                                        <option value="default">Default</option>
                                        <option value="custom1">Custom 1</option>
                                        <option value="custom2">Custom 2</option>
                                        <option value="custom3">Custom 3</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => testSound(key)}
                                        disabled={!isEditing}
                                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                                        title="Test sound"
                                    >
                                        <i className={`${icon} text-lg`}></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Kitchen Notes Display */}
                <div className="pb-6">
                    <h4 className="text-lg font-medium text-gray-800 mb-4">Display Settings</h4>
                    <div className="flex items-center space-x-3">
                        <input
                            type="checkbox"
                            name="showKitchenNotes"
                            checked={formData.showKitchenNotes}
                            onChange={handleInputChange}
                            disabled={!isEditing}
                            className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50"
                        />
                        <label className="text-sm font-medium text-gray-700">
                            Show kitchen notes on KDS display
                        </label>
                    </div>
                </div>

                {/* Save Button */}
                {isEditing && (
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                )}
            </form>
        </div>
    );
}
