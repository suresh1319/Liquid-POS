import { useState, useEffect, createElement } from 'react';
import { sdk } from '../sdk.js';
import { ModalManager } from './ModalManager.js';
import { CustomerDetails } from './CustomerDetails.js';
import { UserSession } from '../utils/UserSession.js';

// Customer Card Component
export function CustomerCard({ customer }) {
    // Setup state for real-time updates
    const [customerData, setCustomerData] = useState(customer);
    const [listener, setListener] = useState(null);

    // Set up real-time listener when component mounts
    useEffect(() => {
        if (customer?.id) {
            const unsubscribe = sdk.db.collection("Customers").doc(customer.id)
                .onSnapshot(doc => {
                    if (doc.exists) {
                        setCustomerData({
                            id: doc.id,
                            ...doc.data()
                        });
                    }
                }, error => {
                    console.error("Error listening to customer in card:", error);
                });

            setListener(unsubscribe);

            // Clean up listener when component unmounts
            return () => {
                if (unsubscribe) {
                    unsubscribe();
                }
            };
        }
    }, [customer?.id]);

    // Handle null or undefined customer data with defaults
    const name = customerData?.name || "Unknown";
    const phone = customerData?.phone || "No phone";
    const balance = customerData?.balance || 0;
    const totalSpent = customerData?.totalSpent || 0;

    // Format last order date
    const formatLastOrderDate = (date) => {
        if (!date || date === null || isNaN(new Date(date).getTime())) {
            return "N/A";
        }

        try {
            const orderDate = new Date(date);
            const now = new Date();
            const diffTime = Math.abs(now - orderDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return "Today";
            } else if (diffDays === 1) {
                return "Yesterday";
            } else if (diffDays < 30) {
                return `${diffDays} days ago`;
            } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                return `${months} month${months > 1 ? 's' : ''} ago`;
            } else {
                const years = Math.floor(diffDays / 365);
                return `${years} year${years > 1 ? 's' : ''} ago`;
            }
        } catch (error) {
            return "N/A";
        }
    };

    const lastOrderDate = formatLastOrderDate(customerData?.date);

    // Handle phone call
    const handleCall = (e) => {
        e.stopPropagation();
        if (!phone || phone === "No phone") return;
        window.location.href = `tel:${phone}`;
    };

    // Handle WhatsApp
    const handleWhatsApp = (e) => {
        e.stopPropagation();
        if (!phone || phone === "No phone") return;

        let message = "Hello";
        if (balance < 0) {
            const currencySymbol = UserSession?.getCurrency();
            message = `Hello ${name}, this is a reminder about your pending balance of ${currencySymbol}${Math.abs(balance)}`;
        }

        window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
    };

    // Handle card click to open customer details
    const handleCardClick = () => {
        // Use waitForModalManager helper to ensure ModalManager is ready before proceeding
        waitForModalManager().then(() => {
            // Create a modal for customer details
            showCustomerDetails(customerData);
        }).catch(error => {
            console.error("Error opening customer details:", error);
            // Fallback to alert if modal can't be shown
            alert(`Unable to show details for ${customerData.name}. Please try again.`);
        });
    };

    // Helper to wait for ModalManager to be ready
    function waitForModalManager() {
        return new Promise((resolve, reject) => {
            // If ModalManager is already available, resolve immediately
            if (ModalManager && ModalManager.isReady) {
                resolve(ModalManager);
                return;
            }

            // Check if ModalManager script is already in the page
            const existingScript = document.querySelector('script[src*="ModalManager.js"]');
            if (!existingScript) {
                // Load ModalManager if not present
                const script = document.createElement('script');
                script.src = 'js/components/ModalManager.js';
                document.head.appendChild(script);
            }

            // Set a timeout to avoid waiting forever
            const timeout = setTimeout(() => {
                document.removeEventListener('modalmanager:ready', onReady);
                reject(new Error('ModalManager failed to load within timeout'));
            }, 5000);

            // Listen for the ready event
            const onReady = () => {
                clearTimeout(timeout);
                resolve(ModalManager);
            };

            document.addEventListener('modalmanager:ready', onReady);

            // Also check periodically in case we missed the event
            const checkInterval = setInterval(() => {
                if (ModalManager && ModalManager.isReady) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve(ModalManager);
                }
            }, 100);
        });
    }

    // Function to show customer details
    function showCustomerDetails(customer) {
        try {
            // Show loading state
            const modal = ModalManager.createSideDrawerModal({
                id: 'customer-details-modal',
                title: `${customer.name}`,
                content: `<div class="flex items-center justify-center p-8">
                            <i class="ph ph-spinner ph-spin text-3xl text-red-500 mr-3"></i>
                            <p>Loading customer details...</p>
                        </div>`,
                onClose: () => {
                    console.log("Customer details modal closed");
                }
            });

            // Load CustomerDetails component if not already loaded
            if (typeof CustomerDetails === 'undefined') {
                const script = document.createElement('script');
                script.src = 'js/components/CustomerDetails.js';
                script.onload = () => {
                    try {
                        if (typeof CustomerDetails !== 'undefined') {
                            // Wait briefly to ensure complete initialization
                            setTimeout(() => {
                                if (typeof CustomerDetails.showCustomerDetailsModal === 'function') {
                                    CustomerDetails.showCustomerDetailsModal(customer, modal);
                                } else {
                                    console.error("CustomerDetails loaded but showCustomerDetailsModal method not found");
                                    modal.setContent(`<div class="p-4 text-center">
                                        <p class="text-red-500">Unable to load customer details component.</p>
                                        <p class="mt-2">Please refresh the page and try again.</p>
                                    </div>`);
                                }
                            }, 50);
                        } else {
                            throw new Error("CustomerDetails not defined after loading script");
                        }
                    } catch (error) {
                        console.error("Error initializing CustomerDetails:", error);
                        modal.setContent(`<div class="p-4 text-center">
                            <p class="text-red-500">Error loading customer details: ${error.message}</p>
                            <p class="mt-2">Please refresh the page and try again.</p>
                        </div>`);
                    }
                };
                script.onerror = (error) => {
                    console.error("Failed to load CustomerDetails script:", error);
                    modal.setContent(`<div class="p-4 text-center">
                        <p class="text-red-500">Error loading customer details component.</p>
                        <p class="mt-2">Please refresh the page and try again.</p>
                    </div>`);
                };
                document.head.appendChild(script);
            } else {
                try {
                    CustomerDetails.showCustomerDetailsModal(customer, modal);
                } catch (error) {
                    console.error("Error showing customer details:", error);
                    modal.setContent(`<div class="p-4 text-center">
                        <p class="text-red-500">Error showing customer details: ${error.message}</p>
                        <p class="mt-2">Please refresh the page and try again.</p>
                    </div>`);
                }
            }
        } catch (error) {
            console.error("Error creating modal:", error);
            alert(`Unable to show details for ${customer.name}. Please try again.`);
        }
    }

    // Load ReactDOM if needed
    const loadReactDOM = (callback) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/react-dom@17/umd/react-dom.development.js';
        script.onload = callback;
        document.head.appendChild(script);
    };

    // Load CustomerDetails component if not available
    const loadCustomerDetailsComponent = (callback) => {
        // Check if the script already exists
        if (document.querySelector('script[src="js/components/CustomerDetails.js"]')) {
            if (CustomerDetails) {
                callback();
            } else {
                // Wait for script to load
                setTimeout(() => {
                    if (CustomerDetails) {
                        callback();
                    } else {
                        console.error("CustomerDetails component failed to load");
                    }
                }, 500);
            }
            return;
        }

        const script = document.createElement('script');
        script.src = 'js/components/CustomerDetails.js';
        script.type = 'text/babel';
        script.onload = () => {
            // Initialize the component
            const detailsDiv = document.createElement('div');
            detailsDiv.id = 'customer-details-container';
            document.body.appendChild(detailsDiv);

            window.ReactDOM.render(
                createElement(CustomerDetails, {}),
                detailsDiv
            );

            setTimeout(callback, 100); // Give a small delay for initialization
        };
        document.head.appendChild(script);
    };

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3 shadow-sm hover:shadow-md cursor-pointer transition-all" onClick={handleCardClick}>
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-red-50 flex-shrink-0 flex items-center justify-center mr-3 border border-red-100">
                        <i className="ph ph-user text-red-400" />
                    </div>

                    {/* Customer Info */}
                    <div>
                        <h4 className="text-gray-800 font-medium">{name}</h4>
                        <p className="text-gray-500 text-sm">{phone}</p>
                    </div>
                </div>

                {/* Right Side Info */}
                <div className="flex items-center">
                    {/* Balance Info */}
                    <div className="text-right mr-6">
                        <div className="text-sm font-medium text-gray-500">Balance</div>
                        <div className={`font-semibold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {UserSession?.getCurrency()}{balance < 0 ? `-${Math.abs(balance).toLocaleString()}` : balance.toLocaleString()}
                        </div>
                    </div>

                    {/* Spent Amount */}
                    <div className="text-right">
                        <div className="text-sm font-medium text-gray-500">Total Spent</div>
                        <div className="font-medium text-gray-700">{UserSession?.getCurrency()}{totalSpent.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 my-3"></div>

            {/* Actions */}
            <div className="flex">
                <button
                    onClick={handleCall}
                    className="mr-2 w-10 h-10 flex items-center justify-center rounded-full bg-red-50"
                >
                    <i className="ph ph-phone text-red-500" />
                </button>
                <button
                    onClick={handleWhatsApp}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-green-50"
                >
                    <i className="ph ph-whatsapp-logo text-green-500" />
                </button>
            </div>
        </div>
    );
}
