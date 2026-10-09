import { createContext, useContext, useState, useEffect } from 'react';
import { UserSession } from '../utils/UserSession.js';
import { sdk } from '../sdk.js';
import { ProfileInfo } from '../models/ProfileInfo.js';
import { Role } from '../models/Role.js';

// ProfileContext.js - Manages seller profile data and related functions
const ProfileContext = createContext();

// Custom hook to use the profile context
export function useProfile() {
    const context = useContext(ProfileContext);
    if (!context) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }
    return context;
}

// Provider component
export function ProfileProvider({ children }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tables, setTables] = useState([]);
    const [billNo, setBillNo] = useState(0);
    const [roles, setRoles] = useState([]);

    // Fetch profile data on mount
    useEffect(() => {
        fetchProfile();
        // No need to set up a separate listener here as we have the dedicated useEffect below
    }, []);

    // Listen to profile changes
    useEffect(() => {
        if (!profile?.id) return;

        const unsubscribe = sdk.profile.onSnapshot(
            (doc) => {
                if (doc.exists) {
                    const updatedData = new ProfileInfo({
                        id: doc.id,
                        ...doc.data()
                    });

                    // Check if currency changed
                    const currencyChanged = profile?.currencyCode !== updatedData.currencyCode;

                    setProfile(updatedData);
                    setTables(updatedData.tables || []);

                    // Update roles
                    if (updatedData.roles) {
                        setRoles(updatedData.roles.map(role => Role.fromJson(role)));
                    }

                    // Update UserSession
                    UserSession.seller = updatedData;

                    // Update currency code in UserSession if it exists in profile
                    if (updatedData.currencyCode) {
                        UserSession.setCurrencyCode(updatedData.currencyCode);
                        
                        // If currency changed, trigger a more comprehensive refresh
                        if (currencyChanged) {
                            // Dispatch custom event for currency change
                            const currencyChangeEvent = new CustomEvent('currencyChanged', {
                                detail: {
                                    oldCurrency: profile?.currencyCode,
                                    newCurrency: updatedData.currencyCode
                                }
                            });
                            window.dispatchEvent(currencyChangeEvent);
                        }
                    }

                    // Trigger UI refresh
                    if (window.refreshTables && typeof window.refreshTables === 'function') {
                        window.refreshTables();
                    }
                }
            },
            (err) => {
                console.error('Error listening to profile changes:', err);
            }
        );

        return () => unsubscribe();
    }, [profile?.id]);

    // Fetch profile data
    const fetchProfile = async () => {
        try {
            setLoading(true);

            // Check if we already have profile data in UserSession
            if (UserSession.seller) {
                setProfile(UserSession.seller);
                setTables(UserSession.seller.tables || []);

                if (UserSession.seller.roles) {
                    setRoles(UserSession.seller.roles.map(role => Role.fromJson(role)));
                }

                fetchBillNo();
                setLoading(false);
                return;
            }

            // Otherwise fetch from SDK
            // Wait briefly for the Shopto SDK to appear on the window (injected script may be async)
            const waitForGlobalSdk = (timeout = 5000) => new Promise((resolve) => {
                const start = Date.now();
                (function check() {
                    try {
                        const g = window;
                        if (g?.ShoptoSDK || g?.Shopto || g?.shopto || g?.SHOPTO_SDK) return resolve(true);
                    } catch (e) {}
                    if (Date.now() - start > timeout) return resolve(false);
                    setTimeout(check, 250);
                })();
            });

            const sdkAvailable = await waitForGlobalSdk(5000);
            if (!sdkAvailable) {
                console.warn('Shopto SDK not detected on window after wait; attempting SDK call anyway');
            }

            let profileDoc;
            try {
                profileDoc = await sdk.profile.get();
            } catch (sdkErr) {
                // Surface a more helpful error if SDK is not ready
                console.error('SDK call failed when fetching profile. SDK available?', sdkAvailable, sdkErr);
                throw sdkErr;
            }

            if (!profileDoc.exists) {
                setError('Profile not found');
                setLoading(false);
                return;
            }

            const profileData = new ProfileInfo({
                id: profileDoc.id,
                ...profileDoc.data()
            });

            // Store seller ID in localStorage (equivalent to _setSession in Flutter)
            localStorage.setItem('SELLER_ID', profileData.id);

            // Set profile data
            setProfile(profileData);

            // Set tables
            setTables(profileData.tables || []);

            // Set roles
            if (profileData.roles) {
                setRoles(profileData.roles.map(role => Role.fromJson(role)));
            }

            // Update UserSession
            UserSession.seller = profileData;

            // Update currency code in UserSession if it exists in profile
            if (profileData.currencyCode) {
                UserSession.setCurrencyCode(profileData.currencyCode);
            }

            // Fetch bill number
            fetchBillNo();

            setLoading(false);
        } catch (err) {
            console.error('Error fetching profile:', err);
            setError('Failed to load profile');
            setLoading(false);
        }
    };

    // Fetch bill number
    const fetchBillNo = async (forceRenew = false) => {
        if (!forceRenew && localStorage.getItem('BILL_NO')) {
            setBillNo(parseInt(localStorage.getItem('BILL_NO')));
            return;
        }

        try {
            let newBillNo = 0;

            // Get the current seller document
            const sellerRef = sdk.profile;
            const sellerDoc = await sellerRef.get();

            if (!sellerDoc.exists) return;

            const sellerData = sellerDoc.data();
            const lastBillDate = sellerData.lastBillDate?.toDate ?
                sellerData.lastBillDate.toDate() :
                new Date(sellerData.lastBillDate || 0);
            const now = new Date();

            // Check if last bill date is today
            if (lastBillDate && lastBillDate.getDate() === now.getDate() &&
                lastBillDate.getMonth() === now.getMonth() &&
                lastBillDate.getFullYear() === now.getFullYear()) {
                newBillNo = (sellerData.currentBillNo || 0);
            }

            // Increment bill number
            newBillNo++;

            // Update seller doc
            await sellerRef.update({
                currentBillNo: newBillNo,
                lastBillDate: now
            });

            // Update local storage
            localStorage.setItem('BILL_NO', newBillNo.toString());
            setBillNo(newBillNo);

            console.log(`Generated new bill no: ${newBillNo}`);
        } catch (err) {
            console.error('Error fetching bill number:', err);
            // If there's an error, use a fallback approach
            const fallbackBillNo = Math.floor(Date.now() / 1000) % 10000; // Use timestamp as fallback
            localStorage.setItem('BILL_NO', fallbackBillNo.toString());
            setBillNo(fallbackBillNo);
            console.log(`Using fallback bill no: ${fallbackBillNo}`);
        }
    };

    // Get bill number with support for store opening/closing
    const getBillNo = (options = {}) => {
        // First, make sure we have a bill number in localStorage
        const storedBillNo = localStorage.getItem('BILL_NO');
        
        // If we don't have a bill number or we need to force renew, fetch a new one
        if (!storedBillNo || options.forceRenew) {
            fetchBillNo(true);
        }
        
        // Get the current bill number from localStorage
        const currentBillNo = parseInt(localStorage.getItem('BILL_NO') || '0');
        
        // Log for debugging
        console.log(`ProfileContext.getBillNo returning: ${currentBillNo} (options: ${JSON.stringify(options)})`);
        
        return currentBillNo;
    };

    // Get store link
    const getStoreLink = () => {
        if (profile?.domains?.length > 0) {
            return `https://${profile.domains[0]}`;
        }
        return `https://${profile?.username || 'store'}.shopto.store`;
    };

    // Download QR code
    const downloadQr = (tableId) => {
        const url = tableId ?
            `${getStoreLink()}/getQR?id=${tableId}` :
            `${getStoreLink()}/getQR`;

        open(url, '_blank');

        // Track analytics
        if (sdk.analytics) {
            sdk.analytics.logEvent('download_qr', {
                table_id: tableId || 'store_qr',
                store_url: getStoreLink()
            });
        }
    };

    // Check permissions
    const checkPermission = async (module, action, silent = true) => {
        try {
            // Map our module:action format to SDK's permission IDs
            const permissionId = `${module.toLowerCase()}_${action.toLowerCase()}`;

            // Check permission directly with the SDK
            const hasPermission = await sdk.permissions.hasPermission(permissionId);

            if (!hasPermission && !silent) {
                showToast(`You don't have ${action} permission for ${module}`);
                console.log(`User does not have permission: ${permissionId}`);
            }

            return hasPermission;
        } catch (error) {
            console.error('Error checking permission:', error);
            return false;
        }
    };

    // Check if user is super admin
    const isSuperAdmin = async () => {
        const currentEmail = firebase.auth().currentUser?.email;

        // First check if user is profile owner
        if (profile?.email === currentEmail) {
            return true;
        }

        // Get all permissions for current user
        try {
            const userPermissions = await sdk.permissions.getUserPermissions();
            // If user has all permissions, consider them a super admin
            const allPermissionIds = (await sdk.permissions.getPermissionSchema())
                .map(p => p.id);

            return allPermissionIds.every(id => userPermissions.includes(id));
        } catch (error) {
            console.error('Error checking super admin status:', error);
            return false;
        }
    };

    // Check if user is admin (has most permissions but maybe not all)
    const isAdmin = async () => {
        const currentEmail = firebase.auth().currentUser?.email;

        // If user is profile owner, they are admin
        if (profile?.email === currentEmail) {
            return true;
        }

        // Get all permissions for current user
        try {
            const userPermissions = await sdk.permissions.getUserPermissions();
            // Admin should have edit permissions
            const adminPermissionIds = ["products_edit", "orders_edit", "customers_edit"];
            return adminPermissionIds.every(id => userPermissions.includes(id));
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    };

    // Send notification
    const sendNotification = async (title, msg, { img, fcmToken } = {}) => {
        try {
            await sdk.profile.collection('notification').add({
                title,
                msg,
                img,
                tokens: fcmToken ? [fcmToken] : [],
                date: new Date()
            });

            return true;
        } catch (err) {
            console.error('Error sending notification:', err);
            return false;
        }
    };

    // Remove table
    const removeTable = async (tableId) => {
        if (!tables.some(t => t.title === tableId)) return false;

        try {
            const updatedTables = tables.filter(t => t.title !== tableId);

            await sdk.profile.update({ tables: updatedTables });

            setTables(updatedTables);

            // Track analytics
            if (sdk.analytics) {
                sdk.analytics.logEvent('remove_table', {
                    table_id: tableId
                });
            }

            return true;
        } catch (err) {
            console.error('Error removing table:', err);
            return false;
        }
    };

    // Calculate account age
    const accountAge = () => {
        const now = new Date();
        const created = profile?.date?.toDate ?
            profile.date.toDate() :
            new Date(profile?.date || now);

        return now - created; // Returns milliseconds
    };

    // Expose context values
    const contextValue = {
        profile,
        tables,
        roles,
        loading,
        error,
        fetchProfile,
        fetchBillNo,
        getBillNo,
        getStoreLink,
        downloadQr,
        checkPermission,
        isSuperAdmin,
        isAdmin,
        sendNotification,
        removeTable,
        accountAge,
        // Getters for profile properties
        get username() { return profile?.username; },
        get email() { return profile?.email; },
        get phone() { return profile?.phone; },
        get businessName() { return profile?.businessName; },
        get address() { return profile?.address; },
        get avatar() { return profile?.avatar; },
        get gstIN() { return profile?.gstNo; },
        get upiId() { return profile?.upiId; },
        get isOnboarded() { return profile?.onboarded || false; },
        get gstEnabled() { return profile?.gstNo && profile.gstNo.length > 0; },
        get upiEnabled() { return profile?.upiId && profile.upiId.length > 0; },
        get kotEnabled() { return profile?.kotEnabled !== false; },
        get currencyCode() { return profile?.currencyCode || 'INR'; },
        get variants() { return profile?.variants || []; },
        get access() { return profile?.access || [profile?.email].filter(Boolean); },
        get paymentInfo() { return profile?.paymentInfo; },
        get printTemplate() { return profile?.printTemplate; },
        get activeSubs() { return profile?.activeSubs || {}; }
    };
    
    // Expose the context to the window object for global access
    if (typeof window !== 'undefined') {
        window.ProfileContext = contextValue;
    }

    return (
        <ProfileContext.Provider value={contextValue}>
            {children}
        </ProfileContext.Provider>
    );
} 