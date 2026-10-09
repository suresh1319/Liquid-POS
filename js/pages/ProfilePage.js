import { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { CurrencyData } from '../utils/CurrencyData.js';
import KDSManagement from '../components/KDSManagement.js';

// ProfilePage Component
export default function ProfilePage({ inModal = false, onClose }) {
    const {
        profile,
        loading,
        error,
        businessName,
        phone,
        address,
        avatar,
        email,
        gstIN,
        upiId,
        gstEnabled,
        upiEnabled,
        kotEnabled,
        getStoreLink,
        downloadQr
    } = useProfile ? useProfile() : { profile: null, loading: true, error: null };

    const [isEditing, setIsEditing] = useState(inModal);
    const [formData, setFormData] = useState({
        businessName: '',
        phone: '',
        address: '',
        gstNo: '',
        upiId: '',
        kotEnabled: true,
        currencyCode: 'INR',
        kdsPassword: ''
    });

    // Initialize form data when profile is loaded
    useEffect(() => {
        if (profile) {
            setFormData({
                businessName: profile.businessName || '',
                phone: profile.phone || '',
                address: profile.address || '',
                gstNo: profile.gstNo || '',
                upiId: profile.upiId || '',
                kotEnabled: profile.kotEnabled !== false,
                currencyCode: profile.currencyCode || 'INR'
            });
        }
    }, [profile]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        try {
            await sdk.profile.update({
            ...formData
        });

            // Update UserSession with new currency code
            if (UserSession) {
                UserSession.setCurrencyCode(formData.currencyCode);
            }

            showToast('Profile updated successfully', 'success');
            setIsEditing(false);
            if (inModal && onClose) onClose();
        } catch (err) {
            console.error('Error updating profile:', err);
            showToast('Failed to update profile', 'error');
        }
    };

    if (loading) {
        return (
            <div className="p-4 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-600">
                {error}
            </div>
        );
    }

    return (
        <div className={inModal ? "" : "p-4 max-w-3xl mx-auto"}>
            {!inModal && (
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-semibold">Profile</h1>
                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Save
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <i className="ph ph-pencil"></i>
                                <span>Edit</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Profile Header */}
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                            {avatar ? (
                                <img src={avatar} alt={businessName} className="w-full h-full object-cover" />
                            ) : (
                                <i className="ph ph-user text-4xl"></i>
                            )}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">{businessName}</h2>
                            <p className="opacity-80">{email}</p>
                        </div>
                    </div>
                </div>

                {/* Profile Content */}
                <div className="p-6">
                    {isEditing ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Business Name
                                    </label>
                                    <input
                                        type="text"
                                        name="businessName"
                                        value={formData.businessName}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Phone
                                    </label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Address
                                    </label>
                                    <textarea
                                        name="address"
                                        value={formData.address}
                                        onChange={handleInputChange}
                                        rows="3"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    ></textarea>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        GST Number
                                    </label>
                                    <input
                                        type="text"
                                        name="gstNo"
                                        value={formData.gstNo}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        UPI ID
                                    </label>
                                    <input
                                        type="text"
                                        name="upiId"
                                        value={formData.upiId}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Currency
                                    </label>
                                    <select
                                        name="currencyCode"
                                        value={formData.currencyCode}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        {CurrencyData?.currencies.map(currency => (
                                            <option key={currency.code} value={currency.code}>
                                                {`${currency.name} (${currency.symbol})`}
                                            </option>
                                        )) || (
                                                <option value="INR">Indian Rupee (₹)</option>
                                            )}
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            name="kotEnabled"
                                            checked={formData.kotEnabled}
                                            onChange={handleInputChange}
                                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <span className="ml-2 text-gray-700">Enable KOT (Kitchen Order Ticket)</span>
                                    </label>
                                </div>
                            </div>

                            {inModal && (
                                <div className="flex justify-end gap-2 mt-4">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            )}
                        </form>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InfoItem label="Business Name" value={businessName} icon="storefront" />
                                <InfoItem label="Phone" value={phone} icon="phone" />
                                <InfoItem label="Email" value={email} icon="envelope" />
                                <InfoItem label="Address" value={address} icon="map-pin" />
                                <InfoItem
                                    label="GST Number"
                                    value={gstIN}
                                    icon="file-text"
                                    badge={gstEnabled ? "Enabled" : "Not Set"}
                                    badgeColor={gstEnabled ? "green" : "gray"}
                                />
                                <InfoItem
                                    label="UPI ID"
                                    value={upiId}
                                    icon="currency-inr"
                                    badge={upiEnabled ? "Enabled" : "Not Set"}
                                    badgeColor={upiEnabled ? "green" : "gray"}
                                />
                                <InfoItem
                                    label="Currency"
                                    value={profile?.currencyCode ? `${CurrencyData?.getCurrencyByCode(profile.currencyCode)?.name || 'Indian Rupee'} (${CurrencyData?.getCurrencyByCode(profile.currencyCode)?.symbol || '₹'})` : 'Indian Rupee (₹)'}
                                    icon="currency-dollar"
                                />
                                <InfoItem
                                    label="KOT"
                                    value={kotEnabled ? "Enabled" : "Disabled"}
                                    icon="receipt"
                                    badge={kotEnabled ? "Enabled" : "Disabled"}
                                    badgeColor={kotEnabled ? "green" : "red"}
                                />
                                <InfoItem
                                    label="Store Link"
                                    value={getStoreLink()}
                                    icon="link"
                                    isLink
                                />
                            </div>

                            {!inModal && (
                                <div className="border-t pt-6 mt-6">
                                    <h3 className="text-lg font-medium mb-4">Actions</h3>
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={() => downloadQr()}
                                            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-2"
                                        >
                                            <i className="ph ph-qr-code"></i>
                                            <span>Download QR Code</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* KDS Management Section */}
                            {!inModal && (
                                <div className="mt-8">
                                    <KDSManagement />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper component for displaying profile information
function InfoItem({ label, value, icon, badge, badgeColor, isLink }) {
    if (!value) return null;

    const badgeColors = {
        green: 'bg-green-100 text-green-800',
        red: 'bg-red-100 text-red-800',
        blue: 'bg-blue-100 text-blue-800',
        gray: 'bg-gray-100 text-gray-800'
    };

    return (
        <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-600">
                <i className={`ph ph-${icon}`}></i>
            </div>
            <div>
                <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-500">{label}</p>
                    {badge && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColors[badgeColor] || badgeColors.gray}`}>
                            {badge}
                        </span>
                    )}
                </div>
                {isLink ? (
                    <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                    >
                        {value}
                    </a>
                ) : (
                    <p className="font-medium">{value}</p>
                )}
            </div>
        </div>
    );
} 