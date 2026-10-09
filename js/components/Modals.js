import { useState, useEffect, useRef, useCallback, useMemo, createElement } from 'react';
import { useOrders } from '../contexts/OrderContext.js';
import { BluetoothPrinting } from '../utils/BluetoothPrinting.js';
import { getModalClasses, getModalOverlayClasses, showToast, ChargesCalculator, formatProductTitle } from '../utils.js';
import { validateMultipleStockDeductions, safeBulkStockDeduction, validatePositiveQuantity } from '../utils/stockValidation.js';
import { POS } from '../pages/POS.js';
import ReactDOM from 'react-dom/client';
import { UserSession } from '../utils/UserSession.js';
import { CheckoutSheet } from './CheckoutSheet.js';
import { InventoryItem } from '../models/Product.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { ModalManager } from './ModalManager.js'
import { sdk } from '../sdk.js';
import { appendCustomerPayment } from '../utils/CustomerSync.js';
import { useLanguage, LanguageProvider } from '../contexts/LanguageContext.js';

// Helper for FieldValue - ensures compatibility across different SDK configurations
const getFieldValue = () => {
    try {
        if (sdk?.FieldValue) return sdk.FieldValue;
        if (sdk?.db?.FieldValue) return sdk.db.FieldValue;
        if (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue) {
            return firebase.firestore.FieldValue;
        }
    } catch (e) {
        console.warn('FieldValue not available:', e);
    }
    return { increment: (val) => ({ __increment: val }) }; // Fallback
};

// Add Table Modal Component
export function AddTableModal({ isOpen, onClose, seller }) {
    const { t } = useLanguage();
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [error, setError] = useState(null);
    const [usingModalManager, setUsingModalManager] = useState(false);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setTitle('');
            setDesc('');
            setError(null);

            // Use ModalManager if available
            if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
                setUsingModalManager(true);
                showAddTableModal();
            } else {
                setUsingModalManager(false);
            }
        }
    }, [isOpen]);

    const handleAddTable = async (newTitle, newDesc) => {
        try {
            // Get current tables
            const currentTables = seller?.tables || [];

            // Check if table already exists
            if (currentTables.some(t => t.title === newTitle)) {
                throw new Error('Table already exists');
            }

            // Add new table
            await sdk.profile.update({
                tables: [...currentTables, { title: newTitle, desc: newDesc }]
            });

            // Track analytics if available
            if (sdk.analytics) {
                sdk.analytics.logEvent('add_table', {
                    table_id: newTitle,
                    seller_id: seller?.id
                });
            }

            ModalManager?.showToast('Table added successfully');

            // Trigger UI refresh
            if (refreshTables && typeof refreshTables === 'function') {
                refreshTables();
            }

            return true;
        } catch (err) {
            console.error('Error adding table:', err);
            throw err;
        }
    };

    const showAddTableModal = () => {
        const content = `
            <div id="add-table-form">
                <div id="error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                <div class="mb-4">
                    <label class="block text-gray-700 mb-2" for="table-title">
                        ${window.LanguageContext?.t('title')}
                    </label>
                    <input
                        type="text"
                        id="table-title"
                        maxlength="4"
                        class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="${window.LanguageContext?.t('egT1')}"
                    />
                    <p class="text-xs text-gray-500 mt-1">${window.LanguageContext?.t('max4Characters')}</p>
                </div>

                <div class="mb-6">
                    <label class="block text-gray-700 mb-2" for="table-desc">
                        ${window.LanguageContext?.t('description')}
                    </label>
                    <input
                        type="text"
                        id="table-desc"
                        class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="${window.LanguageContext?.t('egTableInTheCorner')}"
                    />
                </div>
            </div>
        `;

        const actions = `
            <div class="flex justify-end gap-3">
                <button
                    id="cancel-add-table"
                    type="button"
                    class="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                    ${window.LanguageContext?.t('cancel')}
                </button>
                <button
                    id="save-add-table"
                    type="button"
                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    ${window.LanguageContext?.t('saveTable')}
                </button>
            </div>
        `;

        ModalManager.createCenterModal({
            id: 'add-table-modal',
            title: window.LanguageContext?.t('addTable'),
            content: content,
            actions: actions,
            onShown: (modalControl) => {
                // Add language change listener to refresh modal content
                const handleLanguageChange = () => {
                    // Update modal title
                    modalControl.setTitle(window.LanguageContext?.t('addTable'));

                    // Update modal content
                    modalControl.setContent(`
                        <div id="add-table-form">
                            <div id="error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2" for="table-title">
                                    ${window.LanguageContext?.t('title')}
                                </label>
                                <input
                                    type="text"
                                    id="table-title"
                                    maxlength="4"
                                    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="${window.LanguageContext?.t('egT1')}"
                                />
                                <p class="text-xs text-gray-500 mt-1">${window.LanguageContext?.t('max4Characters')}</p>
                            </div>

                            <div class="mb-6">
                                <label class="block text-gray-700 mb-2" for="table-desc">
                                    ${window.LanguageContext?.t('description')}
                                </label>
                                <input
                                    type="text"
                                    id="table-desc"
                                    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="${window.LanguageContext?.t('egTableInTheCorner')}"
                                />
                            </div>
                        </div>
                    `);

                    // Update modal actions
                    modalControl.setActions(`
                        <div class="flex justify-end gap-3">
                            <button
                                id="cancel-add-table"
                                type="button"
                                class="px-4 py-2 border rounded-md hover:bg-gray-50"
                            >
                                ${window.LanguageContext?.t('cancel')}
                            </button>
                            <button
                                id="save-add-table"
                                type="button"
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                                ${window.LanguageContext?.t('saveTable')}
                            </button>
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

                const titleInput = document.getElementById('table-title');
                const descInput = document.getElementById('table-desc');
                const errorContainer = document.getElementById('error-container');
                const cancelButton = document.getElementById('cancel-add-table');
                const saveButton = document.getElementById('save-add-table');

                if (titleInput && descInput && cancelButton && saveButton) {
                    titleInput.focus();

                    cancelButton.addEventListener('click', () => {
                        modalControl.close();
                        onClose();
                    });

                    saveButton.addEventListener('click', async () => {
                        const newTitle = titleInput.value.trim();
                        const newDesc = descInput.value.trim();

                        // Validate form
                        if (!newTitle) {
                            errorContainer.textContent = window.LanguageContext?.t('pleaseEnterTitle');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        if (!newDesc) {
                            errorContainer.textContent = window.LanguageContext?.t('pleaseEnterDescription');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        try {
                            await handleAddTable(newTitle, newDesc);
                            modalControl.close();
                            onClose();
                        } catch (err) {
                            errorContainer.textContent = err.message || window.LanguageContext?.t('failedToAddTable');
                            errorContainer.classList.remove('hidden');
                        }
                    });
                }
            }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate form
        if (!title) {
            setError(t('pleaseEnterTitle'));
            return;
        }

        if (!desc) {
            setError(t('pleaseEnterDescription'));
            return;
        }

        try {
            await handleAddTable(title, desc);
            onClose();
        } catch (err) {
            setError(err.message || t('failedToAddTable'));
        }
    };

    // If using ModalManager, don't render the default modal
    if (usingModalManager || !isOpen) return null;

    // Fallback to original implementation
    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isOpen ? 'visible' : 'invisible'}`}
            onClick={onClose}
        >
            <div className="fixed inset-0 bg-black bg-opacity-50"></div>
            <div className="bg-section-bg w-full max-w-md rounded-lg shadow-section overflow-hidden relative z-10" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800">{t('addTable')}</h3>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
                            {error}
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-gray-700 mb-2" htmlFor="title">
                            {t('title')}
                        </label>
                        <input
                            type="text"
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={4}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t('egT1')}
                        />
                        <p className="text-xs text-gray-500 mt-1">{t('max4Characters')}</p>
                    </div>

                    <div className="mb-6">
                        <label className="block text-gray-700 mb-2" htmlFor="desc">
                            {t('description')}
                        </label>
                        <input
                            type="text"
                            id="desc"
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t('egTableInTheCorner')}
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border rounded-md hover:bg-gray-50"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            {t('saveTable')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Rename Room Modal Component
export function RenameRoomModal({ isOpen, onClose, tableId, variant, seller }) {
    const [title, setTitle] = useState('');
    const [error, setError] = useState(null);
    const [usingModalManager, setUsingModalManager] = useState(false);

    // Set initial title when modal opens
    useEffect(() => {
        if (isOpen) {
            setTitle(tableId || variant || '');
            setError(null);

            // Use ModalManager if available
            if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
                setUsingModalManager(true);
                showRenameRoomModal();
            } else {
                setUsingModalManager(false);
            }
        }
    }, [isOpen, tableId, variant]);

    // Function to show modal using ModalManager
    const showRenameRoomModal = () => {
        const initialTitle = tableId || variant || '';
        const modalTitle = tableId ? window.LanguageContext?.t('renameTable') : window.LanguageContext?.t('renameChannel');

        const content = `
            <div id="rename-room-form">
                <div id="rename-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                <div class="mb-6">
                    <label class="block text-gray-700 mb-2" for="room-title">
                        ${window.LanguageContext?.t('title')}
                    </label>
                    <input
                        type="text"
                        id="room-title"
                        value="${initialTitle}"
                        class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="${window.LanguageContext?.t('egT1')}"
                    />
                </div>
            </div>
        `;

        const actions = `
            <div class="flex justify-end gap-3">
                <button
                    id="cancel-rename"
                    type="button"
                    class="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                    ${window.LanguageContext?.t('cancel')}
                </button>
                <button
                    id="save-rename"
                    type="button"
                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    ${window.LanguageContext?.t('save')}
                </button>
            </div>
        `;

        const modal = ModalManager.createCenterModal({
            id: 'rename-room-modal',
            title: modalTitle,
            content: content,
            actions: actions,
            onShown: (modalControl) => {
                // Add language change listener to refresh modal content
                const handleLanguageChange = () => {
                    // Update modal title
                    const newModalTitle = tableId ? window.LanguageContext?.t('renameTable') : window.LanguageContext?.t('renameChannel');
                    modalControl.setTitle(newModalTitle);

                    // Update modal content
                    modalControl.setContent(`
                        <div id="rename-room-form">
                            <div id="rename-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                            <div class="mb-6">
                                <label class="block text-gray-700 mb-2" for="room-title">
                                    ${window.LanguageContext?.t('title')}
                                </label>
                                <input
                                    type="text"
                                    id="room-title"
                                    value="${initialTitle}"
                                    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="${window.LanguageContext?.t('egT1')}"
                                />
                            </div>
                        </div>
                    `);

                    // Update modal actions
                    modalControl.setActions(`
                        <div class="flex justify-end gap-3">
                            <button
                                id="cancel-rename"
                                type="button"
                                class="px-4 py-2 border rounded-md hover:bg-gray-50"
                            >
                                ${window.LanguageContext?.t('cancel')}
                            </button>
                            <button
                                id="save-rename"
                                type="button"
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                                ${window.LanguageContext?.t('save')}
                            </button>
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

                const titleInput = document.getElementById('room-title');
                const errorContainer = document.getElementById('rename-error-container');
                const cancelButton = document.getElementById('cancel-rename');
                const saveButton = document.getElementById('save-rename');

                if (titleInput && cancelButton && saveButton) {
                    titleInput.focus();
                    titleInput.select();

                    cancelButton.addEventListener('click', () => {
                        modalControl.close();
                        onClose();
                    });

                    saveButton.addEventListener('click', async () => {
                        const newTitle = titleInput.value.trim();

                        // Validate form
                        if (!newTitle) {
                            errorContainer.textContent = window.LanguageContext?.t('pleaseEnterTitle');
                            errorContainer.classList.remove('hidden');
                            return;
                        }

                        try {
                            if (variant) {
                                // Rename variant
                                const vars = seller?.variants || [];
                                const index = vars.findIndex(v => v.title === variant);

                                if (index === -1) {
                                    errorContainer.textContent = "Can't rename this default room";
                                    errorContainer.classList.remove('hidden');
                                    return;
                                }

                                const updatedVars = [...vars];
                                updatedVars[index] = { title: newTitle };

                                await sdk.profile.update({ variants: updatedVars });
                            } else if (tableId) {
                                // Rename table
                                const tables = seller?.tables || [];
                                const index = tables.findIndex(t => t.title === tableId);

                                if (index === -1) {
                                    errorContainer.textContent = "Can't rename this table";
                                    errorContainer.classList.remove('hidden');
                                    return;
                                }

                                const updatedTables = [...tables];
                                updatedTables[index] = { ...updatedTables[index], title: newTitle };

                                await sdk.profile.update({ tables: updatedTables });
                            } else {
                                errorContainer.textContent = "Can't rename room";
                                errorContainer.classList.remove('hidden');
                                return;
                            }

                            // Trigger UI refresh
                            if (refreshTables && typeof refreshTables === 'function') {
                                refreshTables();
                            }

                            ModalManager.showToast('Renamed successfully');
                            modalControl.close();
                            onClose();
                        } catch (err) {
                            console.error('Error renaming:', err);
                            errorContainer.textContent = err.message || window.LanguageContext?.t('failedToAddTable');
                            errorContainer.classList.remove('hidden');
                        }
                    });
                }
            }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate form
        if (!title) {
            setError('Please enter a title');
            return;
        }

        try {
            if (variant) {
                // Rename price variant
                const vars = seller?.variants || [];
                const index = vars.findIndex(v => v.title === variant);

                if (index === -1) {
                    setError("Can't rename this default room");
                    return;
                }

                const updatedVars = [...vars];
                updatedVars[index] = { title };

                await sdk.profile.update({ variants: updatedVars });
            } else if (tableId) {
                // Rename table
                const tables = seller?.tables || [];
                const index = tables.findIndex(t => t.title === tableId);

                if (index === -1) {
                    setError("Can't rename this table");
                    return;
                }

                const updatedTables = [...tables];
                updatedTables[index] = { ...updatedTables[index], title: newTitle };

                await sdk.profile.update({ tables: updatedTables });
            } else {
                setError("Can't rename room");
                return;
            }

            // Trigger UI refresh
            if (Tables && typeof refreshTables === 'function') {
                refreshTables();
            }

            showToast('Renamed successfully');
            onClose();
        } catch (err) {
            console.error('Error renaming:', err);
            setError('Failed to rename. Please try again.');
        }
    };

    // If using ModalManager, don't render the default modal
    if (usingModalManager || !isOpen) return null;

    // Fallback to original implementation
    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isOpen ? 'visible' : 'invisible'}`}
            onClick={onClose}
        >
            <div className="fixed inset-0 bg-black bg-opacity-50"></div>
            <div className="bg-section-bg w-full max-w-md rounded-lg shadow-section overflow-hidden relative z-10" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800">{t('renameTable')}</h3>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
                            {error}
                        </div>
                    )}

                    <div className="mb-6">
                        <label className="block text-gray-700 mb-2" htmlFor="title">
                            {t('title')}
                        </label>
                        <input
                            type="text"
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t('egT1')}
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border rounded-md hover:bg-gray-50"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            {t('save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Profile Menu Component
export function ProfileMenu({ isOpen, onClose, seller }) {
    const { downloadQr } = useProfile ? useProfile() : { downloadQr: () => { } };
    const [showProfileEditor, setShowProfileEditor] = useState(false);

    if (!isOpen) return null;

    // If profile editor is shown, render the ProfilePage component
    if (showProfileEditor) {
        return (
            <div className="fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowProfileEditor(false)}>
                <div className="absolute right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white shadow-lg overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <div className="p-4">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">Edit Profile</h2>
                            <button
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
                                onClick={() => setShowProfileEditor(false)}
                            >
                                <i className="ph ph-x text-lg text-gray-600" />
                            </button>
                        </div>
                        <ProfilePage inModal={true} onClose={() => setShowProfileEditor(false)} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50" onClick={onClose}>
            <div className="fixed inset-0 bg-black bg-opacity-50"></div>
            <div className="absolute top-16 right-4 mt-2 w-64 bg-section-bg rounded-lg shadow-section overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    {/* Modern Header with just close button */}
                    <div className="flex justify-end mb-6">
                        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors" onClick={onClose}>
                            <i className="ph ph-x text-lg text-gray-600" />
                        </button>
                    </div>

                    {/* Content Container with gradient background */}
                    <div className="space-y-8">
                        {/* Avatar and Basic Info with gradient background */}
                        <div className="relative text-center px-4 py-6 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
                            <div className="inline-block relative mb-4">
                                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-white ring-4 ring-white/50 shadow-lg">
                                    {seller?.avatar ? (
                                        <img src={seller.avatar} alt={seller?.businessName} className="w-full h-full object-cover" />
                                    ) : (
                                        <i className="ph ph-storefront text-3xl text-gray-400" />
                                    )}
                                </div>
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900">
                                {seller?.businessName || 'Loading...'}
                            </h4>
                            {seller?.phone && (
                                <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
                                    <i className="ph ph-phone text-base" />
                                    {seller.phone}
                                </p>
                            )}
                        </div>

                        {/* Info Cards */}
                        <div className="space-y-4">
                            {seller?.address && (
                                <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-4 rounded-xl border border-emerald-100/20">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center flex-shrink-0 shadow-sm">
                                            <i className="ph ph-map-pin text-emerald-600" />
                                        </div>
                                        <div>
                                            <h5 className="text-sm font-medium text-gray-900 mb-1">Store Address</h5>
                                            <p className="text-sm text-gray-600 leading-relaxed">{seller.address}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 rounded-xl border border-blue-100/20">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center flex-shrink-0 shadow-sm">
                                        <i className="ph ph-globe text-blue-600" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <h5 className="text-sm font-medium text-gray-900">Store URL</h5>
                                            <button
                                                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                                onClick={() => {
                                                    const url = `https://${seller?.username}.shopto.store`;
                                                    navigator.clipboard.writeText(url);
                                                    showToast('URL copied to clipboard', 'success');
                                                }}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-600 font-mono break-all">
                                            {`https://${seller?.username}.shopto.store`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3 pt-2">
                            <button
                                className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all flex items-center justify-center gap-2 font-medium shadow-sm"
                                onClick={() => downloadQr()}
                            >
                                <i className="ph ph-qr-code text-lg" />
                                Get Store QR Code
                            </button>
                            <button
                                className="w-full px-4 py-2.5 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 rounded-xl hover:from-gray-200 hover:to-gray-100 transition-all flex items-center justify-center gap-2 font-medium"
                                onClick={() => setShowProfileEditor(true)}
                            >
                                <i className="ph ph-user-circle text-lg" />
                                Edit Profile
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Add Inventory Modal Component
export function AddInventoryModal({ isOpen, onClose, onSave, editItem = null }) {
    const { t } = useLanguage();
    const [page, setPage] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        quantity: '',
        unit: 'kg',
        minQuantity: '',
        vendorName: '',
        vendorCompany: '',
        vendorGst: '',
        vendorContact: '',
        vendorAddress: '',
        perKgCost: ''
    });

    // Initialize form data when editItem changes
    useEffect(() => {
        if (isOpen) {
            setPage(1); // Reset to first page when modal opens
            if (editItem) {
                setFormData({
                    name: editItem.name || '',
                    quantity: editItem.quantity || '',
                    unit: editItem.unit || 'kg',
                    minQuantity: editItem.minQuantity || '',
                    vendorName: editItem.vendorName || '',
                    vendorCompany: editItem.vendorCompany || '',
                    vendorGst: editItem.vendorGst || '',
                    vendorContact: editItem.vendorContact || '',
                    vendorAddress: editItem.vendorAddress || '',
                    perKgCost: editItem.perKgCost || ''
                });
            } else {
                setFormData({
                    name: '',
                    quantity: '',
                    unit: 'kg',
                    minQuantity: '',
                    vendorName: '',
                    vendorCompany: '',
                    vendorGst: '',
                    vendorContact: '',
                    vendorAddress: '',
                    perKgCost: ''
                });
            }
        }
    }, [editItem, isOpen]);

    const units = ['kg', 'gm', 'ltr', 'ml', 'pc'];

    const handleNext = () => {
        if (!formData.name || formData.quantity === '' || formData.minQuantity === '' || formData.perKgCost === '') {
            alert('Please fill all required fields on this page.');
            return;
        }
        setPage(2);
    };

    const handleBack = () => {
        setPage(1);
    };

    const handleSubmit = () => {
        if (!formData.vendorName || !formData.vendorCompany || !formData.vendorGst || !formData.vendorContact || !formData.vendorAddress) {
            alert('Please fill all required vendor details.');
            return;
        }
        onSave({
            ...formData,
            quantity: Number(formData.quantity),
            minQuantity: Number(formData.minQuantity),
            perKgCost: Number(formData.perKgCost),
            lastUpdated: new Date().toISOString()
        });
    };

    if (!isOpen) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isOpen ? 'visible' : 'invisible'}`}
            onClick={onClose}
        >
            <div className="fixed inset-0 bg-black bg-opacity-50"></div>
            <div className="bg-section-bg w-full max-w-md rounded-lg shadow-section overflow-hidden relative z-10 p-6" onClick={e => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-gray-800">
                        {editItem ? 'Edit Inventory Item' : 'Add New Item'}
                    </h3>
                    <button className="p-2 hover:bg-gray-100 rounded-full" onClick={onClose}>
                        <i className="ph ph-x text-gray-600" />
                    </button>
                </div>
                {/* Form */}
                {page === 1 && (
                    <div className="space-y-4">
                        {/* Name Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Item Name
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                placeholder="Enter item name"
                            />
                        </div>
                        {/* Quantity and Unit */}
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Quantity
                                </label>
                                <input
                                    type="number"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Enter quantity"
                                    min="0"
                                />
                            </div>
                            <div className="w-32">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Unit
                                </label>
                                <select
                                    value={formData.unit}
                                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                >
                                    {units.map(unit => (
                                        <option key={unit} value={unit}>{unit}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {/* Min Quantity */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Minimum Quantity
                            </label>
                            <input
                                type="number"
                                value={formData.minQuantity}
                                onChange={(e) => setFormData({ ...formData, minQuantity: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                placeholder="Enter minimum quantity"
                                min="0"
                            />
                        </div>
                        {/* Per unit cost */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Price per Unit
                            </label>
                            <input
                                type="number"
                                value={formData.perKgCost}
                                onChange={(e) => setFormData({ ...formData, perKgCost: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                placeholder="Enter cost per unit"
                                min="0"
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                onClick={onClose}
                            >
                                {t('cancel')}
                            </button>
                            <button
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                onClick={handleNext}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {page === 2 && (
                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-gray-800">Vendor Details</h4>
                        <div className="flex gap-4">
                            {/* Vendor Name */}
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Vendor Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.vendorName}
                                    onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Enter vendor name"
                                />
                            </div>
                            {/* Company Name */}
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Company Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.vendorCompany}
                                    onChange={(e) => setFormData({ ...formData, vendorCompany: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Enter company name"
                                />
                            </div>
                        </div>
                        <div className="flex gap-4">
                            {/* GST Invoice */}
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    GST Invoice
                                </label>
                                <input
                                    type="text"
                                    value={formData.vendorGst}
                                    onChange={(e) => setFormData({ ...formData, vendorGst: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Enter GST invoice number"
                                />
                            </div>
                            {/* Contact No. */}
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Contact No.
                                </label>
                                <input
                                    type="text"
                                    value={formData.vendorContact}
                                    onChange={(e) => setFormData({ ...formData, vendorContact: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Enter contact number"
                                />
                            </div>
                        </div>
                        {/* Address */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Address
                            </label>
                            <input
                                type="text"
                                value={formData.vendorAddress}
                                onChange={(e) => setFormData({ ...formData, vendorAddress: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                placeholder="Enter address"
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                onClick={handleBack}
                            >
                                Back
                            </button>
                            <button
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                onClick={handleSubmit}
                            >
                                {editItem ? 'Update' : 'Add'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// OrderRoom Modal Component
export function OrderRoom({ isOpen, onClose, tableId, variant, orderStatus = "KITCHEN", seller }) {
    const { t } = useLanguage();
    // Get order data and methods directly from OrderContext
    const {
        getOrdersForSource,
        isLoading: ordersLoading,
        refreshCompletedOrders
    } = useOrders ? useOrders() : {
        getOrdersForSource: () => [],
        isLoading: true,
        refreshCompletedOrders: () => { }
    };

    // Get orders directly from context without maintaining separate state
    const orders = getOrdersForSource(tableId, variant, orderStatus);

    // State to track printer connection status
    const [printerConnected, setPrinterConnected] = useState(
        BluetoothPrinting ? BluetoothPrinting.connected : false
    );
    const [connectingPrinter, setConnectingPrinter] = useState(false);
    const [managedPrinters, setManagedPrinters] = useState([]);
    const [selectedPrinter, setSelectedPrinter] = useState(null);
    const [showPrinterDropdown, setShowPrinterDropdown] = useState(false);
    const printerDropdownRef = useRef(null);

    // Load managed printers
    useEffect(() => {
        if (BluetoothPrinting) {
            const printers = BluetoothPrinting.getSavedPrinters() || [];
            setManagedPrinters(printers);

            // Set the active printer (connected, default, or first available)
            const connectedPrinter = BluetoothPrinting.device ?
                printers.find(p => p.deviceId === BluetoothPrinting.device.id) : null;

            const activeId = BluetoothPrinting.getActivePrinterId();
            const activePrinter = printers.find(p => p.id === activeId);

            const defaultPrinter = printers.find(p => p.isDefault);

            setSelectedPrinter(connectedPrinter || activePrinter || defaultPrinter || (printers.length > 0 ? printers[0] : null));

            // Try to reconnect to the saved printer if we have one and we're not already connected
            if (isOpen && !BluetoothPrinting.connected && BluetoothPrinting.lastConnectedDevice) {
                tryReconnectToPrinter();
            }
        }
    }, [isOpen]);

    // Attempt to reconnect to the last used printer when the modal opens
    const tryReconnectToPrinter = useCallback(async () => {
        if (!BluetoothPrinting || BluetoothPrinting.connected) return;

        try {
            setConnectingPrinter(true);
            console.log('OrderRoom: Attempting to reconnect to saved printer...');

            // First try silent reconnect without showing any message to avoid UI clutter
            const reconnected = await BluetoothPrinting.attemptSilentReconnect();

            if (reconnected) {
                setPrinterConnected(true);
                // Show success message only when reconnection is successful
                if (ModalManager && typeof ModalManager.showToast === 'function') {
                    ModalManager.showToast(`Printer ready`, { type: "success" });
                } else {
                    showToast(`Printer ready`, "success");
                }
            }
        } catch (error) {
            console.error('Error reconnecting to printer:', error);
            // Don't show error toast for reconnection attempts to reduce notification spam
        } finally {
            setConnectingPrinter(false);
        }
    }, []);

    // Debug logging
    useEffect(() => {
        console.log(`[OrderRoom] Component mounted/updated for ${tableId ? `Table ${tableId}` : variant || 'Default'}`);
        console.log(`[OrderRoom] Received ${orders.length} orders with status "${orderStatus}"`);

        if (orders.length > 0) {
            console.log(`[OrderRoom] First few orders:`, orders.slice(0, 3).map(o => ({
                id: o.id,
                tableId: o.tableId || null,
                priceVariant: o.priceVariant || null,
                status: o.currentStatus?.label
            })));
        } else {
            console.log(`[OrderRoom] No orders found. This might indicate a problem with filtering or data.`);
        }
    }, [orders, tableId, variant, orderStatus]);

    // Update printer connection status when BluetoothPrinting state changes
    useEffect(() => {
        if (BluetoothPrinting) {
            const checkConnectionStatus = () => {
                setPrinterConnected(BluetoothPrinting.connected);
            };

            // Initial check
            checkConnectionStatus();

            // Set up an interval to periodically check printer connection status
            const interval = setInterval(checkConnectionStatus, 2000);

            return () => clearInterval(interval);
        }
    }, [isOpen]);

    // Handle clicks outside of printer dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (printerDropdownRef.current && !printerDropdownRef.current.contains(event.target)) {
                setShowPrinterDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Keep the disconnect function when closing the room
    useEffect(() => {
        if (!isOpen && printerConnected && BluetoothPrinting) {
            // We don't need to actually disconnect the printer, as we want to maintain
            // the connection for future use. Just update the UI state.
            setPrinterConnected(BluetoothPrinting.connected);
        }
    }, [isOpen, printerConnected]);

    // Calculate totals for progress bar
    const totalItems = useMemo(() => {
        return orders.reduce((sum, order) => {
            const itemCount = order.items?.reduce((itemSum, item) => itemSum + (item.quantity || item.qnt || 1), 0) || 0;
            return sum + itemCount;
        }, 0);
    }, [orders]);

    const servedItems = useMemo(() => {
        return orders.reduce((sum, order) => {
            const servedCount = order.items?.filter(item => item.served)
                .reduce((itemSum, item) => itemSum + (item.quantity || item.qnt || 1), 0) || 0;
            return sum + servedCount;
        }, 0);
    }, [orders]);

    const progressPercent = useMemo(() => {
        const progress = totalItems > 0 ? servedItems / totalItems : 0;
        return Math.round(progress * 100);
    }, [totalItems, servedItems]);

    const [error, setError] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const menuRef = useRef(null);
    const dialogRef = useRef(null);
    const [isClosing, setIsClosing] = useState(false);

    // QR Code modal state
    const [showQRModal, setShowQRModal] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState('');

    // Debug: Check QRCode library availability on component mount
    useEffect(() => {
        if (isOpen) {
            console.log('OrderRoom opened, checking QRCode library...');
            console.log('window.QRCode:', typeof window.QRCode);
            if (window.QRCode) {
                console.log('QRCode methods:', Object.keys(window.QRCode));
            }
        }
    }, [isOpen]);

    // Check for mobile/desktop on resize
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Add click event listener to close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Add swipe gesture for mobile
    useEffect(() => {
        if (!isOpen || !dialogRef.current) return;

        let startX, startY;
        const handleTouchStart = (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        };

        const handleTouchMove = (e) => {
            if (!startX || !startY) return;

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = startX - currentX;
            const diffY = startY - currentY;

            // Detect horizontal swipe (for desktop)
            if (Math.abs(diffX) > Math.abs(diffY) && diffX < -50 && !isMobile) {
                handleClose();
            }

            // Detect vertical swipe down (for mobile)
            if (Math.abs(diffY) > Math.abs(diffX) && diffY < -50 && isMobile) {
                handleClose();
            }
        };

        const element = dialogRef.current;
        element.addEventListener('touchstart', handleTouchStart);
        element.addEventListener('touchmove', handleTouchMove);

        return () => {
            element.removeEventListener('touchstart', handleTouchStart);
            element.removeEventListener('touchmove', handleTouchMove);
        };
    }, [isOpen, isMobile]);

    // Handle printer selection
    const handlePrinterSelect = (printer) => {
        if (!printer) return;

        setSelectedPrinter(printer);
        setShowPrinterDropdown(false);

        if (BluetoothPrinting) {
            // Set as active printer for printing operations
            BluetoothPrinting.setActivePrinterId(printer.id);

            // If we need to connect to the selected printer
            if (!printerConnected && printer.deviceId) {
                setConnectingPrinter(true);

                // Try to connect to this specific printer using its deviceId
                BluetoothPrinting.lastConnectedDevice = {
                    id: printer.deviceId,
                    name: printer.name || printer.deviceName
                };

                BluetoothPrinting.connect()
                    .then(() => {
                        setPrinterConnected(true);
                        if (ModalManager && typeof ModalManager.showToast === 'function') {
                            ModalManager.showToast(`Connected to ${printer.name}`, { type: "success" });
                        } else {
                            showToast(`Connected to ${printer.name}`, "success");
                        }
                    })
                    .catch(error => {
                        console.error("Error connecting to printer:", error);
                        // Only show error messages for non-cancellation errors
                        if (error.name !== "NotFoundError" &&
                            !error.message.includes("Device selection cancelled") &&
                            !error.message.includes("cancelled by user") &&
                            !error.message.includes("No printer selected")) {
                            if (ModalManager && typeof ModalManager.showToast === 'function') {
                                ModalManager.showToast("Error connecting to printer", { type: "error" });
                            } else {
                                showToast("Error connecting to printer", "error");
                            }
                        }
                    })
                    .finally(() => {
                        setConnectingPrinter(false);
                    });
            }
        }
    };

    // Handle smooth closing animation
    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 300); // Match this with the CSS transition duration
    };

    // We've removed the loadOrders function since we're now directly using data from context
    // The context will automatically update when orders change

    const handleAddNewOrder = () => {
        // Check if POS component is available
        if (!POS) {
            console.error("POS component is not defined");
            showToast("Cannot open POS: component not available", "error");
            return;
        }

        // Create a container for the POS component
        const posContainer = document.createElement('div');
        posContainer.id = 'pos-container';
        posContainer.className = 'fixed inset-0 z-50';
        document.body.appendChild(posContainer);

        try {
            // Create a root element for React 18
            const root = ReactDOM.createRoot(posContainer);

            // Render the POS component wrapped with LanguageProvider
            root.render(
                createElement(LanguageProvider, null,
                    createElement(POS, {
                        title: t('newOrder'),
                        tableId: tableId,
                        variant: variant,
                        onClose: () => {
                            // Unmount and clean up
                            root.unmount();
                            if (document.body.contains(posContainer)) {
                                document.body.removeChild(posContainer);
                            }
                            // No need to explicitly refresh orders, context will update automatically
                        }
                    })
                )
            );
        } catch (error) {
            console.error("Error rendering POS:", error);
            if (document.body.contains(posContainer)) {
                document.body.removeChild(posContainer);
            }
            showToast("Failed to open POS", "error");
        }
    };

    const handleShowQR = async () => {
        setIsMenuOpen(false);

        // Create a single target URL and use it everywhere
        const targetUrl = `https://${seller?.username}.shopto.store${tableId ? `?t=${tableId}` : ''}`;
        console.log('Generating QR code for URL:', targetUrl);

        // Generate QR image via reliable service
        const encoded = encodeURIComponent(targetUrl);
        const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encoded}`;

        setQrCodeUrl(qrImage);
        setShowQRModal(true);
    };

    const confirmDelete = () => {
        // Confirm before deleting (equivalent to confirmDialog in Flutter)
        confirmDialog({
            title: "Confirm Delete",
            content: `Are you sure you want to delete ${tableId ? `table ${tableId}` : variant}?`,
            confirmText: "DELETE",
            onConfirm: async () => {
                try {
                    if (tableId && seller && typeof seller.removeTable === 'function') {
                        await seller.removeTable(tableId);
                        showToast('Table deleted successfully');
                        handleClose(); // Use handleClose instead of onClose directly
                    } else {
                        showToast('Delete functionality not available');
                    }
                } catch (err) {
                    console.error('Error deleting table:', err);
                    showToast('Failed to delete table');
                }
            }
        });
        setIsMenuOpen(false);
    };

    // Render the no orders widget (equivalent to noOrderWidget in Flutter)
    const renderNoOrdersWidget = () => {
        console.log(`[OrderRoom] No orders for ${tableId ? `Table ${tableId}` : variant || 'Default'}`);
        console.log(`[OrderRoom] Current orderStatus filter: "${orderStatus}"`);

        return (
            <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-5">
                    <i className="ph ph-shopping-bag text-4xl text-red-400"></i>
                </div>
                <h3 className="text-2xl font-medium text-gray-700 mb-2">{t('noOrdersYet')}</h3>
                <p className="text-gray-500 max-w-sm mb-8">{t('addNewOrders')}</p>
            </div>
        );
    };

    // Render the context menu (equivalent to contextMenu in Flutter)
    const renderContextMenu = () => {
        if (!isMenuOpen) return null;

        return (
            <div
                ref={menuRef}
                className="absolute right-0 top-12 w-52 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50"
            >
                <div className="py-1">
                    {/* Removed printer management/disconnect button */}
                    <button
                        className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => {
                            setIsMenuOpen(false);
                            handleShowQR();
                        }}
                    >
                        <i className="ph ph-qr-code text-red-500"></i>
                        <span>{t('showQrCode')}</span>
                    </button>

                    <button
                        className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => {
                            if (confirm(`Are you sure you want to delete all orders for ${tableId || variant}?`)) {
                                confirmDelete();
                            }
                            setIsMenuOpen(false);
                        }}
                    >
                        <i className="ph ph-trash text-red-500"></i>
                        <span>{t('clearAllOrders')}</span>
                    </button>

                    <button
                        className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => {
                            setIsMenuOpen(false);
                            showRenameRoomModal(tableId, variant);
                        }}
                    >
                        <i className="ph ph-pencil-simple text-red-500"></i>
                        <span>{t('rename')} {tableId ? t('table') : t('channel')}</span>
                    </button>

                    {tableId && (
                        <button
                            className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                            onClick={() => {
                                if (confirm(`Are you sure you want to delete table ${tableId}?`)) {
                                    deleteTable(tableId);
                                    handleClose();
                                }
                                setIsMenuOpen(false);
                            }}
                        >
                            <i className="ph ph-trash text-red-500"></i>
                            <span>{t('deleteTable')}</span>
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const deleteTable = async (tableId) => {
        try {
            // Get current tables from seller
            const currentTables = seller?.tables || [];

            // Remove the table
            const updatedTables = currentTables.filter(table => table.title !== tableId);

            // Update seller document in Firestore
            await sdk.profile.update({
                tables: updatedTables
            });

            showToast('Table removed successfully');
            handleClose();
        } catch (err) {
            console.error('Error removing table:', err);
            showToast('Failed to remove table. Please try again.');
        }
    };

    const showRenameRoomModal = (tableId, variant) => {
        if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
            const modalId = 'rename-room-modal-' + Date.now();
            const initialTitle = tableId || variant || '';
            const modalTitle = tableId ? `${t('renameTable')}` : `${t('renameChannel')}`;

            const content = `
                <div id="rename-room-form">
                    <div id="rename-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                    <div class="mb-6">
                        <label class="block text-gray-700 mb-2" for="room-title">
                            {t('title')}
                        </label>
                        <input
                            type="text"
                            id="room-title"
                            value="${initialTitle}"
                            class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t('egT1')}
                        />
                    </div>
                </div>
            `;

            const actions = `
                <div class="flex justify-end gap-3">
                    <button
                        id="cancel-rename"
                        type="button"
                        class="px-4 py-2 border rounded-md hover:bg-gray-50"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        id="save-rename"
                        type="button"
                        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        {t('save')}
                    </button>
                </div>
            `;

            const modal = ModalManager.createCenterModal({
                id: modalId,
                title: modalTitle,
                content: content,
                actions: actions,
                onShown: (modalControl) => {
                    const titleInput = document.getElementById('room-title');
                    const errorContainer = document.getElementById('rename-error-container');
                    const cancelButton = document.getElementById('cancel-rename');
                    const saveButton = document.getElementById('save-rename');

                    if (titleInput && cancelButton && saveButton) {
                        titleInput.focus();
                        titleInput.select();

                        cancelButton.addEventListener('click', () => {
                            modalControl.close();
                        });

                        saveButton.addEventListener('click', async () => {
                            const newTitle = titleInput.value.trim();

                            if (!newTitle) {
                                errorContainer.textContent = 'Please enter a title';
                                errorContainer.classList.remove('hidden');
                                return;
                            }

                            try {
                                if (variant) {
                                    const vars = seller?.variants || [];
                                    const index = vars.findIndex(v => v.title === variant);

                                    if (index === -1) {
                                        errorContainer.textContent = "Can't rename this default room";
                                        errorContainer.classList.remove('hidden');
                                        return;
                                    }

                                    const updatedVars = [...vars];
                                    updatedVars[index] = { title: newTitle };

                                    await sdk.profile.update({ variants: updatedVars });
                                } else if (tableId) {
                                    const tables = seller?.tables || [];
                                    const index = tables.findIndex(t => t.title === tableId);

                                    if (index === -1) {
                                        errorContainer.textContent = "Can't rename this table";
                                        errorContainer.classList.remove('hidden');
                                        return;
                                    }

                                    const updatedTables = [...tables];
                                    updatedTables[index] = { ...updatedTables[index], title: newTitle };

                                    await sdk.profile.update({ tables: updatedTables });
                                }

                                // Trigger UI refresh
                                if (refreshTables && typeof refreshTables === 'function') {
                                    refreshTables();
                                }

                                ModalManager.showToast('Renamed successfully');
                                modalControl.close();
                            } catch (err) {
                                console.error('Error renaming:', err);
                                errorContainer.textContent = 'Failed to rename. Please try again.';
                                errorContainer.classList.remove('hidden');
                            }
                        });
                    }
                }
            });
        } else {
            // Fallback to original React component modal
            setSelectedTableId(tableId);
            setSelectedVariant(variant);
            setIsRenameRoomModalOpen(true);
        }
    };

    if (!isOpen) return null;

    // Use the utility function for modal classes
    const dialogClasses = getModalClasses({
        isMobile,
        isClosing
    });

    // Use utility function for overlay classes
    const overlayClasses = getModalOverlayClasses(isClosing);

    return (
        <>
            <div
                className={`fixed inset-0 z-50 ${isOpen ? 'visible' : 'invisible'}`}
                onClick={onClose}
            >
                <div className="fixed inset-0 bg-black bg-opacity-50"></div>
                <div className="absolute right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-section-bg shadow-section overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <div className="sticky top-0 bg-white border-b z-10">
                        <div className="p-4 flex items-center justify-between">
                            <h2 className="text-xl font-semibold">{variant || `${t('table')} ${tableId}`}</h2>
                            <div className="flex items-center gap-3">
                                {BluetoothPrinting && BluetoothPrinting.isSupported() && (
                                    <div className="relative" ref={printerDropdownRef}>
                                        <div
                                            className={`flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer ${printerConnected ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-600'} hover:bg-opacity-80 transition-colors`}
                                            onClick={() => setShowPrinterDropdown(!showPrinterDropdown)}
                                            title={printerConnected ? (selectedPrinter?.name || t('printerConnected')) : t('selectPrinter')}
                                        >
                                            <i className="ph ph-printer text-xl"></i>
                                            {/* Show selected printer name or fallback */}
                                            <span className="max-w-[120px] truncate text-sm font-medium">
                                                {selectedPrinter?.name || (printerConnected ? t('connected') : t('noPrinter'))}
                                            </span>
                                            {connectingPrinter ? (
                                                <div className="w-3 h-3 border-2 border-t-transparent border-current rounded-full animate-spin"></div>
                                            ) : (
                                                <i className={`ph ph-caret-${showPrinterDropdown ? 'up' : 'down'} text-xs`}></i>
                                            )}
                                        </div>

                                        {/* Printer Dropdown */}
                                        {showPrinterDropdown && (
                                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-20 w-56">
                                                <div className="p-2 border-b border-gray-100">
                                                    <div className="text-sm font-medium text-gray-800">{t('selectPrinter')}</div>
                                                </div>
                                                <div className="max-h-56 overflow-y-auto">
                                                    {managedPrinters.length > 0 ? (
                                                        <>
                                                            {managedPrinters.map(printer => (
                                                                <div
                                                                    key={printer.id}
                                                                    className={`px-3 py-2 flex items-center cursor-pointer ${selectedPrinter?.id === printer.id ? 'bg-red-50 text-red-500' : 'hover:bg-gray-50'}`}
                                                                    onClick={() => handlePrinterSelect(printer)}
                                                                >
                                                                    <i className={`ph ph-printer mr-2 ${printer.isDefault ? 'text-red-500' : 'text-gray-500'}`}></i>
                                                                    <div className="flex-1 overflow-hidden">
                                                                        <div className="text-sm font-medium truncate">{printer.name}</div>
                                                                        {printer.isDefault && <div className="text-xs text-gray-500">{t('default')}</div>}
                                                                    </div>
                                                                    {selectedPrinter?.id === printer.id && <i className="ph ph-check text-red-500"></i>}
                                                                </div>
                                                            ))}
                                                            <div className="border-t border-gray-100 p-2">
                                                                <button
                                                                    className="w-full text-xs text-left px-3 py-2 text-red-500 hover:bg-gray-50 rounded flex items-center gap-2"
                                                                    onClick={() => {
                                                                        setShowPrinterDropdown(false);
                                                                        BluetoothPrinting.connect()
                                                                            .then(() => {
                                                                                setPrinterConnected(true);
                                                                                // Refresh printers list
                                                                                const printers = BluetoothPrinting.getSavedPrinters() || [];
                                                                                setManagedPrinters(printers);
                                                                            });
                                                                    }}
                                                                >
                                                                    <i className="ph ph-plus-circle"></i>
                                                                    <span>{t('addNewPrinter')}</span>
                                                                </button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div>
                                                            <div className="px-3 py-3 text-center text-gray-500 text-sm">{t('noPrintersConfigured')}</div>
                                                            <div className="border-t border-gray-100 p-2">
                                                                <button
                                                                    className="w-full text-xs text-left px-3 py-2 text-red-500 hover:bg-gray-50 rounded flex items-center gap-2"
                                                                    onClick={() => {
                                                                        setShowPrinterDropdown(false);
                                                                        BluetoothPrinting.connect()
                                                                            .then(() => {
                                                                                setPrinterConnected(true);
                                                                                // Refresh printers list
                                                                                const printers = BluetoothPrinting.getSavedPrinters() || [];
                                                                                setManagedPrinters(printers);
                                                                            });
                                                                    }}
                                                                >
                                                                    <i className="ph ph-plus-circle"></i>
                                                                    <span>{t('connectPrinter')}</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="relative" ref={menuRef}>
                                    <button
                                        className="p-2 hover:bg-gray-100 rounded-full"
                                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                                        title="Menu"
                                    >
                                        <i className="ph ph-dots-three-vertical text-xl text-gray-600"></i>
                                    </button>
                                    {renderContextMenu()}
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="p-2 hover:bg-gray-100 rounded-full"
                                    title="Close"
                                >
                                    <i className="ph ph-x text-xl text-gray-600"></i>
                                </button>
                            </div>
                        </div>

                        {/* Progress bar for all orders */}
                        {orders.length > 0 && (
                            <div className="px-4 pb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span>{servedItems}/{totalItems} {t('itemsServed')}</span>
                                </div>
                                <div className="text-sm font-medium text-gray-700">
                                    {progressPercent}% {t('complete')}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col h-[calc(100%-70px)]">
                        {ordersLoading ? (
                            <div className="p-4 text-center flex-1 flex flex-col items-center justify-center">
                                <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                                <p className="mt-2 text-gray-600">{t('loadingOrders')}</p>
                            </div>
                        ) : error ? (
                            <div className="p-4 text-center flex-1 flex flex-col items-center justify-center">
                                <div className="bg-red-50 text-red-600 p-4 rounded-lg max-w-md">
                                    <i className="ph ph-warning-circle text-2xl mb-2"></i>
                                    <p>{error}</p>
                                </div>
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="flex-1 flex flex-col">
                                <div className="flex-1 flex items-center justify-center">
                                    {renderNoOrdersWidget()}
                                </div>
                                <div className="p-4 mt-auto">
                                    <button
                                        className="w-full py-3 px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                                        onClick={handleAddNewOrder}
                                    >
                                        <i className="ph ph-plus-circle text-xl"></i>
                                        <span>{t('addNewOrder')}</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                <div className="space-y-6 flex-1 overflow-y-auto p-4">
                                    {orders.map(order => {
                                        // Create an MOrder-like object with the necessary methods
                                        const mOrder = {
                                            ...order,
                                            id: order.id,
                                            billNo: order.billNo,
                                            items: order.items || [],
                                            date: order.date,
                                            servedItems: order.items?.filter(item => item.served).length || 0,
                                            totalItems: order.items?.length || 0,
                                            subTotal: order.items?.reduce((sum, item) => sum + ((item.price || 0) * (item.qnt || 1)), 0) || 0,
                                            // Add methods that OrderView component expects
                                            serveItem: async (item, served) => {
                                                try {
                                                    const orderRef = sdk.db.collection("Orders").doc(order.id);
                                                    const orderDoc = await orderRef.get();
                                                    if (!orderDoc.exists) throw new Error('Order not found');

                                                    const orderData = orderDoc.data();
                                                    const updatedItems = orderData.items.map(i => {
                                                        if (i.pid === item.pid) {
                                                            return { ...i, served: served };
                                                        }
                                                        return i;
                                                    });

                                                    const sanitize = (val) => {
                                                        // Convert undefined/null to null to satisfy Firestore
                                                        if (typeof val === 'undefined' || val === null) return null;
                                                        if (Array.isArray(val)) return val.map(sanitize);
                                                        if (typeof val === 'object') {
                                                            const out = {};
                                                            for (const k of Object.keys(val)) {
                                                                try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                                                            }
                                                            return out;
                                                        }
                                                        return val;
                                                    };
                                                    await orderRef.update({ items: sanitize(updatedItems) });
                                                    return true;
                                                } catch (error) {
                                                    console.error("Error updating serve status:", error);
                                                    throw error;
                                                }
                                            },
                                            addItem: async (item) => {
                                                try {
                                                    const orderRef = sdk.db.collection("Orders").doc(order.id);
                                                    const orderDoc = await orderRef.get();
                                                    if (!orderDoc.exists) throw new Error('Order not found');

                                                    const orderData = orderDoc.data();
                                                    const updatedItems = orderData.items.map(i => {
                                                        if (i.pid === item.pid) {
                                                            const currentQty = parseInt(i.qnt || 1);
                                                            const completedCount = i.completed || 0;
                                                            const newQnt = currentQty + 1;
                                                            // Ensure completed count doesn't exceed new quantity
                                                            const adjustedCompleted = Math.min(completedCount, newQnt);
                                                            return { ...i, qnt: newQnt, completed: adjustedCompleted };
                                                        }
                                                        return i;
                                                    });

                                                    const sanitize = (val) => {
                                                        if (typeof val === 'undefined' || val === null) return null;
                                                        if (Array.isArray(val)) return val.map(sanitize);
                                                        if (typeof val === 'object') {
                                                            const out = {};
                                                            for (const k of Object.keys(val)) {
                                                                try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                                                            }
                                                            return out;
                                                        }
                                                        return val;
                                                    };
                                                    await orderRef.update({ items: sanitize(updatedItems) });
                                                    return true;
                                                } catch (error) {
                                                    console.error("Error adding item:", error);
                                                    throw error;
                                                }
                                            },
                                            removeItem: async (item) => {
                                                try {
                                                    const orderRef = sdk.db.collection("Orders").doc(order.id);
                                                    const orderDoc = await orderRef.get();
                                                    if (!orderDoc.exists) throw new Error('Order not found');

                                                    const orderData = orderDoc.data();

                                                    // Find the item in the current items array
                                                    const itemIndex = orderData.items.findIndex(i => i.pid === item.pid);
                                                    if (itemIndex === -1) {
                                                        throw new Error('Item not found in order');
                                                    }

                                                    // Get current quantity - standardize on qnt property
                                                    const currentQty = parseInt(orderData.items[itemIndex].qnt || 1);

                                                    // If quantity is 1, remove the item completely
                                                    if (currentQty <= 1) {
                                                        // Remove the item from the items array
                                                        const updatedItems = orderData.items.filter(i => i.pid !== item.pid);
                                                        // Update the order with the modified items array
                                                        const sanitize = (val) => {
                                                            if (typeof val === 'undefined' || val === null) return null;
                                                            if (Array.isArray(val)) return val.map(sanitize);
                                                            if (typeof val === 'object') {
                                                                const out = {};
                                                                for (const k of Object.keys(val)) {
                                                                    try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                                                                }
                                                                return out;
                                                            }
                                                            return val;
                                                        };
                                                        await orderRef.update({ items: sanitize(updatedItems) });
                                                        showToast(`${formatProductTitle(item)} removed from order`);
                                                    } else {
                                                        // Decrease quantity by 1
                                                        const updatedItems = [...orderData.items];
                                                        updatedItems[itemIndex] = {
                                                            ...updatedItems[itemIndex],
                                                            qnt: currentQty - 1
                                                        };
                                                        // Update the order with the modified items array
                                                        const sanitize = (val) => {
                                                            if (typeof val === 'undefined' || val === null) return null;
                                                            if (Array.isArray(val)) return val.map(sanitize);
                                                            if (typeof val === 'object') {
                                                                const out = {};
                                                                for (const k of Object.keys(val)) {
                                                                    try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                                                                }
                                                                return out;
                                                            }
                                                            return val;
                                                        };
                                                        await orderRef.update({ items: sanitize(updatedItems) });
                                                        showToast(`Decreased ${formatProductTitle(item)} quantity by 1`);
                                                    }
                                                } catch (err) {
                                                    console.error('Error updating item quantity:', err);
                                                    showToast('Failed to update item quantity', 'error');
                                                }
                                            }
                                        };

                                        return (
                                            <OrderView
                                                key={order.id}
                                                order={mOrder}
                                                tableId={tableId}
                                                variant={variant}
                                                refreshOrders={refreshCompletedOrders}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="p-4 mt-auto border-t sticky bottom-0 bg-white">
                                    <button
                                        className="w-full py-3 px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                                        onClick={handleAddNewOrder}
                                    >
                                        <i className="ph ph-plus-circle text-xl"></i>
                                        <span>{t('addNewOrder')}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* QR Code Modal */}
            {showQRModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" onClick={() => setShowQRModal(false)}>
                    <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center p-6 border-b">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {t('acceptOrderOnline')}
                            </h3>
                        </div>

                        <div className="p-6 text-center">
                            {/* Business Name Above QR Code */}
                            {seller?.businessName && (
                                <div className="mb-4">
                                    <h4 className="text-xl font-semibold text-gray-800 mb-1">
                                        {seller.businessName}
                                    </h4>
                                    <p className="text-sm text-gray-500">
                                        Order online {tableId ? `for Table ${tableId}` : ''}
                                    </p>
                                </div>
                            )}

                            <div className="mb-4">
                                {qrCodeUrl && (
                                    <img
                                        src={qrCodeUrl}
                                        alt="QR Code"
                                        className="mx-auto rounded-lg shadow-sm"
                                        style={{ maxWidth: '300px', width: '100%' }}
                                    />
                                )}
                            </div>

                            {seller?.username && (
                                <div className="mb-4">
                                    <a
                                        href={`https://${seller.username}.shopto.store${tableId ? `?t=${tableId}` : ''}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 underline text-sm font-mono break-all"
                                    >
                                        https://{seller.username}.shopto.store{tableId ? `?t=${tableId}` : ''}
                                    </a>
                                </div>
                            )}

                            <p className="text-gray-600 text-sm mb-4">
                                {t('scanQrToOrder')}
                            </p>

                            <div className="flex justify-center">
                                <button
                                    onClick={() => {
                                        if (qrCodeUrl) {
                                            const link = document.createElement('a');
                                            link.href = qrCodeUrl;
                                            link.download = `qr-code-${tableId || 'online'}.png`;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                            showToast('QR code downloaded', 'success');
                                        }
                                    }}
                                    className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                                >
                                    <i className="ph ph-download text-sm"></i>
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// OrderView Component
export function OrderView({ order, tableId, variant, refreshOrders }) {
    const { t } = useLanguage();
    // Calculate served items
    const servedItems = order.items?.filter(item => item.served).length || 0;
    const totalItems = order.items?.length || 0;
    const progressPercent = totalItems > 0 ? (servedItems / totalItems) * 100 : 0;
    const [showContextMenu, setShowContextMenu] = useState(false);
    // Unit entry mode toggle (affects Checkout default)
    const [unitEntryMode, setUnitEntryMode] = useState(() => {
        try {
            return localStorage.getItem('unitEntryMode') || 'amount';
        } catch {
            return 'amount';
        }
    });

    const updateUnitEntryMode = (mode) => {
        setUnitEntryMode(mode);
        try { localStorage.setItem('unitEntryMode', mode); } catch { }
    };
    const menuRef = useRef(null);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowContextMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // --- Per-item unit pricing overrides state ---
    const getItemKey = (item) => item.variantId ? `${item.pid}::${item.variantId}` : String(item.pid);

    const [itemModes, setItemModes] = useState({}); // key -> 'units' | 'amount'
    const [itemUnits, setItemUnits] = useState({}); // key -> number | ''
    const [itemAmounts, setItemAmounts] = useState({}); // key -> number | ''

    // Initialize from order on mount/update
    useEffect(() => {
        const modes = {};
        const units = {};
        const amounts = {};
        (order.items || []).forEach((it) => {
            const key = getItemKey(it);
            const ov = it.unitOverride || {};
            const ppu = Number(it?.unitPricing?.pricePerUnit);
            const hasUP = it?.unitPricing?.enabled && !isNaN(ppu) && ppu > 0;
            // Mode: override > default 'amount' (user must choose Units explicitly)
            if (!modes[key]) modes[key] = ov.mode || 'amount';
            // Units: override > unitQuantity; do NOT derive from base/ppu
            if (ov.units != null) {
                units[key] = ov.units;
            } else if (hasUP && it.unitQuantity != null) {
                units[key] = it.unitQuantity;
            } else if (units[key] === undefined) {
                units[key] = '';
            }
            // Amount: override > derive from units * ppu > basePrice fallback
            if (ov.amount != null) {
                amounts[key] = ov.amount;
            } else if (hasUP) {
                const u = units[key];
                if (u !== '' && !isNaN(Number(u))) {
                    amounts[key] = Number(u) * ppu;
                } else {
                    const base = (typeof it.basePrice === 'number') ? it.basePrice : Math.max(0, (it.price || 0) - (it.addonsTotal || 0));
                    amounts[key] = base || '';
                }
            } else if (amounts[key] === undefined) {
                amounts[key] = '';
            }
        });
        setItemModes(modes);
        setItemUnits(units);
        setItemAmounts(amounts);
    }, [order?.id, order?.items]);

    const persistItemOverride = async (targetItem, newOverride) => {
        try {
            const orderRef = sdk.db.collection("Orders").doc(order.id);
            const orderDoc = await orderRef.get();
            if (!orderDoc.exists) throw new Error('Order not found');
            const data = orderDoc.data();
            const updatedItems = (data.items || []).map((i) => {
                if (i.pid === targetItem.pid && (i.variantId || null) === (targetItem.variantId || null)) {
                    const prev = i.unitOverride || {};
                    const unitOverride = { ...prev, ...newOverride };
                    // Do NOT mutate basePrice/price here; keep base amount immutable on toggle.
                    return { ...i, unitOverride };
                }
                return i;
            });
            const sanitize = (val) => {
                if (typeof val === 'undefined' || val === null) return null;
                if (Array.isArray(val)) return val.map(sanitize);
                if (typeof val === 'object') {
                    const out = {};
                    for (const k of Object.keys(val)) {
                        try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                    }
                    return out;
                }
                return val;
            };
            await orderRef.update({ items: sanitize(updatedItems) });
        } catch (err) {
            console.error('Failed to update unit override:', err);
            showToast('Failed to save unit override', 'error');
        }
    };

    const onToggleMode = (item, mode) => {
        const key = getItemKey(item);
        setItemModes((p) => ({ ...p, [key]: mode }));
        if (mode === 'units') {
            const ovUnits = item?.unitOverride?.units;
            // If there is no explicit override units, seed to 1 (ignore any derived units)
            if (ovUnits == null || isNaN(Number(ovUnits))) {
                setItemUnits((p) => ({ ...p, [key]: 1 }));
                persistItemOverride(item, { mode, units: 1 });
                return;
            }
        }
        persistItemOverride(item, { mode });
    };

    const onUnitsChange = (item, value) => {
        const key = getItemKey(item);
        // Allow empty string while typing
        setItemUnits((p) => ({ ...p, [key]: value }));
    };

    const onAmountChange = (item, value) => {
        const key = getItemKey(item);
        setItemAmounts((p) => ({ ...p, [key]: value }));
    };

    const onUnitsBlur = (item) => {
        const key = getItemKey(item);
        const num = itemUnits[key] === '' ? null : Number(itemUnits[key]);
        persistItemOverride(item, { units: (num != null && !isNaN(num) && num >= 0) ? num : null });
    };

    const onAmountBlur = (item) => {
        const key = getItemKey(item);
        const num = itemAmounts[key] === '' ? null : Number(itemAmounts[key]);
        persistItemOverride(item, { amount: (num != null && !isNaN(num) && num >= 0) ? num : null });
    };

    const getPPU = (item) => {
        const p = Number(item?.unitPricing?.pricePerUnit);
        return isNaN(p) ? null : p;
    };

    const getAddonsTotal = (item) => {
        if (typeof item.addonsTotal === 'number') return item.addonsTotal;
        if (Array.isArray(item.addons)) return item.addons.reduce((s, a) => s + (a.price || 0), 0);
        return 0;
    };

    const getEffectiveBase = (item) => {
        // Prefer overrides
        const key = getItemKey(item);
        const mode = itemModes[key] || 'amount';
        const ppu = getPPU(item);
        // Use only explicit amount override from persisted item data
        const amount = (() => {
            const v = item && item.unitOverride && item.unitOverride.amount;
            return (v === '' || v == null) ? null : Number(v);
        })();
        const units = (() => { const v = itemUnits[key]; return (v === '' || v == null) ? null : Number(v); })();

        // Base from non-unit context (basePrice or price - addons)
        const addons = getAddonsTotal(item);
        const baseNonUnit = (typeof item.basePrice === 'number') ? item.basePrice : Math.max(0, (item.price || 0) - addons);

        if (!item?.unitPricing?.enabled || !ppu || ppu <= 0) {
            return baseNonUnit;
        }
        if (mode === 'amount') {
            return (amount != null && !isNaN(amount) && amount >= 0) ? amount : baseNonUnit;
        }
        // mode === 'units'
        if (units != null && !isNaN(units) && units >= 0) return ppu * units;
        const uq = Number(item.unitQuantity);
        if (!isNaN(uq) && uq >= 0) return ppu * uq;
        return ppu * 1;
    };

    const getLineTotal = (item) => {
        const base = getEffectiveBase(item);
        const addons = getAddonsTotal(item);
        const q = parseInt(item.qnt || 1) || 1;
        return (base + addons) * q;
    };

    // Handle customer info update
    const handleUpdateCustomerInfo = async () => {
        const modal = ModalManager.createCenterModal({
            id: 'update-customer-info-modal',
            title: 'Update Customer Information',
            content: `
                <div class="p-4">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{t('customerName')}</label>
                            <input
                                type="text"
                                id="customer-name-input"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                placeholder="Enter customer name"
                                value="${order.custName || ''}"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{t('phoneNumber')}</label>
                            <input
                                type="tel"
                                id="customer-phone-input"
                                maxlength="10"
                                inputmode="numeric"
                                pattern="[0-9]{10}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                placeholder="Enter phone number"
                                value="${order.custPhone || ''}"
                            />
                        </div>
                    </div>
                </div>
            `,
            actions: `
                <div class="flex justify-end gap-3">
                    <button
                        id="cancel-customer-update"
                        type="button"
                        class="px-4 py-2 border rounded-md hover:bg-gray-50"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        id="save-customer-update"
                        type="button"
                        class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                        {t('updateCustomerInfo')}
                    </button>
                </div>
            `,
            onShown: (modalControl) => {
                const nameInput = document.getElementById('customer-name-input');
                const phoneInput = document.getElementById('customer-phone-input');
                const cancelBtn = document.getElementById('cancel-customer-update');
                const saveBtn = document.getElementById('save-customer-update');

                cancelBtn.addEventListener('click', () => modalControl.close());

                saveBtn.addEventListener('click', async () => {
                    const newName = nameInput.value.trim();
                    const newPhone = phoneInput.value.trim().replace(/\D/g, '').slice(0, 10);

                    // If phone provided, validate 10 digits
                    if (newPhone && !/^[0-9]{10}$/.test(newPhone)) {
                        showToast('Please enter a valid 10-digit phone number (numbers only)', 'error');
                        phoneInput.focus();
                        return;
                    }

                    try {
                        const updateData = {};
                        if (newName) updateData.custName = newName;
                        if (newPhone) updateData.custPhone = newPhone;

                        // Build or merge embedded customer snapshot for the order
                        const existingCustomer = order.customer || { id: order.custId || null, name: order.custName || '', phone: order.custPhone || '' };
                        const mergedCustomer = {
                            id: existingCustomer.id || (order.custId || null),
                            name: newName || existingCustomer.name,
                            phone: newPhone || existingCustomer.phone
                        };
                        updateData.customer = mergedCustomer;

                        if (Object.keys(updateData).length > 0) {
                            await sdk.db.collection("Orders").doc(order.id).update(updateData);
                            showToast("Customer information updated successfully", "success");

                            // Update local order object
                            if (newName) order.custName = newName;
                            if (newPhone) order.custPhone = newPhone;
                            order.customer = mergedCustomer;

                            modalControl.close();
                            if (refreshOrders) refreshOrders();
                        } else {
                            showToast("Please enter at least name or phone number", "warning");
                        }
                    } catch (error) {
                        console.error("Error updating customer info:", error);
                        showToast("Failed to update customer information", "error");
                    }
                });

                // Focus on name input if empty, otherwise phone input
                if (!nameInput.value.trim()) {
                    nameInput.focus();
                } else {
                    phoneInput.focus();
                }
            }
        });

        setShowContextMenu(false);
    };

    // Handle instructions change
    const handleInstructionsChange = async (value) => {
        try {
            // Update the order in Firestore
            await sdk.db.collection("Orders").doc(order.id).update({
                instructions: value
            });
        } catch (error) {
            console.error("Error updating instructions:", error);
        }
    };

    // Format date using the patterns from DateModifiers extension
    const formatTinyDateTime = (date) => {
        if (!date) return t('justNow');

        try {
            const orderDate = new Date(date);

            // Check if date is valid
            if (isNaN(orderDate.getTime())) {
                return t('justNow');
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const orderDay = new Date(orderDate);
            orderDay.setHours(0, 0, 0, 0);

            const timeStr = orderDate.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            if (orderDay.getTime() === today.getTime()) {
                return `Today, ${timeStr}`;
            } else if (orderDay.getTime() === yesterday.getTime()) {
                return `Yesterday, ${timeStr}`;
            } else if (orderDay.getTime() === tomorrow.getTime()) {
                return `Tomorrow, ${timeStr}`;
            } else {
                return orderDate.toLocaleDateString('en-GB', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (error) {
            console.error("Date formatting error:", error);
            return t('justNow');
        }
    };

    // Function to shift order to a different table
    const handleShiftTable = () => {
        setShowContextMenu(false);

        // Check if ModalManager is available
        if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
            // Fetch available tables from UserSession
            const availableTables = UserSession?.seller?.tables || [];

            const modalId = 'shift-table-modal-' + Date.now();
            let content = `
                <div id="shift-table-form">
                    <div id="shift-table-error-container" class="mb-4 hidden p-3 bg-red-50 text-red-700 rounded-md"></div>
                    <div class="mb-4">
                        <div class="text-gray-700 mb-2">
                            Current Source: <span class="font-medium">${tableId || variant || 'Direct'}</span>
                        </div>
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 mb-2" for="target-table">
                            Select Target Table
                        </label>
                        <select
                            id="target-table"
                            class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
            `;

            // Add options for available tables
            if (availableTables.length > 0) {
                availableTables.forEach(table => {
                    // Don't include the current table
                    if (table.id !== tableId && table.title !== tableId) {
                        content += `<option value="${table.id || table.title}">${table.title}</option>`;
                    }
                });
            } else {
                // If no tables are available, add some default options
                for (let i = 1; i <= 10; i++) {
                    if (`T${i}` !== tableId) {
                        content += `<option value="T${i}">T${i}</option>`;
                    }
                }
            }

            content += `
                        </select>
                    </div>
                </div>
            `;

            const actions = `
                <div class="flex justify-end gap-3">
                    <button
                        id="cancel-shift-table"
                        type="button"
                        class="px-4 py-2 border rounded-md hover:bg-gray-50"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        id="save-shift-table"
                        type="button"
                        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Shift Order
                    </button>
                </div>
            `;

            const modal = ModalManager.createCenterModal({
                id: modalId,
                title: `Shift Order #${order.billNo || order.id?.slice(-6)} to Another Table`,
                content: content,
                actions: actions,
                onShown: (modalControl) => {
                    const targetTableSelect = document.getElementById('target-table');
                    const errorContainer = document.getElementById('shift-table-error-container');
                    const cancelButton = document.getElementById('cancel-shift-table');
                    const saveButton = document.getElementById('save-shift-table');

                    if (targetTableSelect && cancelButton && saveButton) {
                        cancelButton.addEventListener('click', () => {
                            modalControl.close();
                        });

                        saveButton.addEventListener('click', async () => {
                            try {
                                const targetTableId = targetTableSelect.value;

                                if (!targetTableId) {
                                    errorContainer.textContent = "Please select a target table";
                                    errorContainer.classList.remove('hidden');
                                    return;
                                }

                                // Prepare update object
                                const updateData = {
                                    tableId: targetTableId
                                };

                                // If this is a variant order (like Swiggy, Zomato), clear the priceVariant field
                                if (variant && !tableId) {
                                    updateData.priceVariant = null;
                                }

                                // Update the order in Firestore
                                await sdk.db.collection("Orders").doc(order.id).update(updateData);

                                modalControl.close();

                                if (ModalManager && typeof ModalManager.showToast === 'function') {
                                    ModalManager.showToast(`Order shifted to table ${targetTableId}`);
                                } else {
                                    showToast(`Order shifted to table ${targetTableId}`);
                                }

                                // Comprehensive UI refresh approach
                                // 1. Refresh tables data
                                if (refreshTables && typeof refreshTables === 'function') {
                                    refreshTables();
                                }

                                // 2. Force reload of kitchen orders to update the dining section
                                if (setupKitchenOrdersListener && typeof setupKitchenOrdersListener === 'function') {
                                    setupKitchenOrdersListener();
                                }

                                // 3. Trigger any order context refresh if available
                                if (refreshOrders && typeof refreshOrders === 'function') {
                                    refreshOrders();
                                }

                                // 4. Add a marker to the dining tables section to detect if it's empty after update
                                const diningTablesSection = document.querySelector('.grid.grid-cols-2.md\\:grid-cols-3.lg\\:grid-cols-4.xl\\:grid-cols-5.gap-3');
                                if (diningTablesSection) {
                                    // Mark the section for detection
                                    diningTablesSection.classList.add('dining-tables-refreshed');

                                    // Check if the section becomes empty after the update
                                    setTimeout(() => {
                                        const refreshedSection = document.querySelector('.dining-tables-refreshed');
                                        if (refreshedSection && (!refreshedSection.children || refreshedSection.children.length === 0)) {
                                            // Only reload if on the tables page (add your own condition here)
                                            if (window.location.hash === '#tables' || window.location.pathname.includes('tables')) {
                                                console.log("Dining tables section is empty after update, reloading page");
                                                window.location.reload();
                                            } else {
                                                console.log("Dining tables section is empty, but not on tables page. No reload.");
                                            }
                                        } else {
                                            // Remove the marker class
                                            if (refreshedSection) {
                                                refreshedSection.classList.remove('dining-tables-refreshed');
                                            }
                                        }
                                    }, 1500);
                                }

                            } catch (error) {
                                console.error("Error shifting order:", error);
                                errorContainer.textContent = "Failed to shift order: " + (error.message || "Unknown error");
                                errorContainer.classList.remove('hidden');
                            }
                        });
                    }
                }
            });
        } else {
            console.error("ModalManager not available for shift table operation");
            showToast("Cannot shift table: Modal manager not available", "error");
        }
    };

    const handlePrintKOT = async () => {
        try {
            // Try Bluetooth printing first if available
            if (BluetoothPrinting && BluetoothPrinting.isSupported()) {
                try {
                    // Get order channel for proper printer selection
                    const channel = order.priceVariant || 'Default';
                    await BluetoothPrinting.printKOT(order.id, channel);
                    showToast("KOT printed successfully", "success");
                    return; // Exit if Bluetooth printing succeeds
                } catch (btError) {
                    console.error("Bluetooth printing failed:", btError);

                    // Handle user cancellation errors
                    if (btError.message.includes("Device selection cancelled") ||
                        btError.message.includes("No printer selected") ||
                        btError.message.includes("cancelled by user") ||
                        btError.name === "NotFoundError") {
                        showToast("Printing cancelled", "info");
                        return;
                    }

                    // If it's a connection error or unsupported device, show helpful message
                    if (btError.message.includes("No suitable service") ||
                        btError.message.includes("No services found") ||
                        btError.message.includes("not supported as a printer") ||
                        btError.message.includes("cannot be used for printing") ||
                        (btError.name === 'NetworkError' && btError.message.includes("Unsupported device"))) {
                        showToast("Could not connect to printer. Please select a compatible thermal printer.", "error");
                        return;
                    }

                    // Generic error case
                    showToast(`Printing error: ${btError.message}`, "error");

                    // Fall through to traditional printing for other errors
                    showToast("Bluetooth printing failed, falling back to standard printing", "warning");
                }
            }

            // Traditional KOT printing (fallback)
            if (UserSession?.seller?.kotEnabled) {
                try {
                    if (process.env.NODE_ENV === 'development') {
                        console.log("Attempting fallback KOT printing for order:", order.id);
                    }
                    const orderRef = sdk.db.collection("Orders").doc(order.id);
                    const orderDoc = await orderRef.get();
                    if (!orderDoc.exists) {
                        throw new Error("Order not found for fallback printing.");
                    }
                    const orderData = orderDoc.data();

                    // Check if there are newly added items
                    const newlyAddedItems = orderData.items?.filter(item => item.newlyAdded === true);
                    const hasNewItems = newlyAddedItems && newlyAddedItems.length > 0;

                    // Process the newly added items to show only the newly added quantities
                    const processedItems = hasNewItems ? newlyAddedItems.map(item => {
                        // If we have a specific newly added quantity, use that
                        if (item.newlyAddedQty && item.newlyAddedQty > 0) {
                            if (process.env.NODE_ENV === 'development') {
                                console.log(`Browser KOT: Item ${item.title} has newlyAddedQty=${item.newlyAddedQty}, original qnt=${item.qnt}`);
                            }
                            return {
                                ...item,
                                qnt: item.newlyAddedQty, // Use only the newly added quantity for KOT
                                originalQnt: item.qnt // Keep track of the original quantity
                            };
                        }
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`Browser KOT: Item ${item.title} has no newlyAddedQty, using full quantity ${item.qnt}`);
                        }
                        return item; // Otherwise keep the item as is
                    }) : [];

                    // Check if any items have originalQnt property (indicating quantity additions)
                    const hasQuantityAdditions = processedItems.some(item => item.originalQnt !== undefined);
                    const kotTitle = hasNewItems
                        ? (hasQuantityAdditions ? 'KITCHEN ORDER TICKET (ADDITIONS)' : 'KITCHEN ORDER TICKET (NEW ITEMS)')
                        : 'KITCHEN ORDER TICKET';

                    let kotHtml = `
                        <div style="font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px;">
                            <h2 style="text-align: center; margin: 0 0 5px 0;">${kotTitle}</h2>
                            <p style="text-align: center; margin: 0 0 10px 0; border-bottom: 1px dashed #000; padding-bottom: 5px;">
                                ${UserSession?.seller?.businessName || 'Your Business'}
                            </p>
                            <p><strong>Order #:</strong> ${orderData.billNo || orderData.id?.substring(0, 6) || 'N/A'}</p>
                            ${orderData.tableId ? `<p><strong>Table:</strong> ${orderData.tableId}</p>` : ''}
                            <p><strong>Time:</strong> ${(() => {
                            try {
                                const date = orderData.date?.toDate ? orderData.date.toDate() : (orderData.date || new Date());
                                const parsedDate = new Date(date);
                                return isNaN(parsedDate.getTime()) ? new Date().toLocaleTimeString('en-GB') : parsedDate.toLocaleTimeString('en-GB');
                            } catch (e) {
                                return new Date().toLocaleTimeString('en-GB');
                            }
                        })()}</p>
                            ${orderData.custName ? `<p><strong>Customer:</strong> ${orderData.custName}</p>` : ''}
                            ${orderData.custPhone ? `<p><strong>Phone:</strong> ${orderData.custPhone}</p>` : ''}
                            ${hasNewItems ? `<p><strong>Added Items:</strong> ${newlyAddedItems.length} of ${orderData.items.length}</p>` : ''}
                            ${orderData.sourceName ? `<p><strong>Source:</strong> ${orderData.sourceName}</p>` : ''}
                            <hr style="border: none; border-top: 1px dashed #000; margin: 10px 0;" />
                            <p style="font-weight: bold; margin-bottom: 5px;">ITEMS:</p>
                    `;

                    // If there are newly added items, only print those with correct quantities
                    const itemsToPrint = hasNewItems ? processedItems : orderData.items;

                    if (itemsToPrint && itemsToPrint.length > 0) {
                        itemsToPrint.forEach(item => {
                            const quantity = item.quantity || item.qnt || 1;
                            const title = formatProductTitle(item) || 'Unknown Item';
                            kotHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                            <span>${quantity}x ${title}</span>
                                        </div>`;
                            if (item.instructions) {
                                kotHtml += `<div style="font-size: 10px; padding-left: 15px; margin-bottom: 3px;"><em>Notes: ${item.instructions}</em></div>`;
                            }
                        });

                        // After printing newly added items, clear their flags to avoid duplicate printing
                        if (hasNewItems) {
                            try {
                                // Update the items to clear the newlyAdded flag and quantity
                                const updatedItems = orderData.items.map(item => ({
                                    ...item,
                                    newlyAdded: false,
                                    newlyAddedQty: 0  // Reset the newly added quantity as well
                                }));

                                // Schedule the update to run after printing is complete
                                setTimeout(async () => {
                                    try {
                                        const orderRef = sdk.db.collection("Orders").doc(orderData.id);
                                        const sanitize = (val) => {
                                            if (typeof val === 'undefined' || val === null) return null;
                                            if (Array.isArray(val)) return val.map(sanitize);
                                            if (typeof val === 'object') {
                                                const out = {};
                                                for (const k of Object.keys(val)) {
                                                    try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                                                }
                                                return out;
                                            }
                                            return val;
                                        };
                                        await orderRef.update({ items: sanitize(updatedItems) });
                                        console.log("Cleared newlyAdded flags and quantities after fallback KOT printing");
                                    } catch (err) {
                                        console.error("Error clearing newlyAdded flags:", err);
                                    }
                                }, 500);
                            } catch (error) {
                                console.error("Error preparing flag update:", error);
                            }
                        }
                    } else {
                        kotHtml += `<p>${t('noItems')}</p>`;
                    }

                    if (orderData.instructions) {
                        kotHtml += `<hr style="border: none; border-top: 1px dashed #000; margin: 10px 0;" />`;
                        kotHtml += `<p style="font-weight: bold; margin-bottom: 5px;">SPECIAL INSTRUCTIONS:</p>`;
                        kotHtml += `<p>${orderData.instructions}</p>`;
                    }

                    kotHtml += `<hr style="border: none; border-top: 1px dashed #000; margin: 10px 0;" />`;
                    kotHtml += `<p style="text-align: center; margin-top: 10px;">* End of KOT *</p>`;
                    kotHtml += `</div>`;

                    const printFrame = document.createElement('iframe');
                    printFrame.style.position = 'fixed';
                    printFrame.style.top = '-9999px'; // Position off-screen
                    printFrame.style.left = '-9999px';
                    printFrame.style.width = '0'; // Minimize impact
                    printFrame.style.height = '0';
                    printFrame.style.border = '0';
                    document.body.appendChild(printFrame);

                    printFrame.contentDocument.open();
                    printFrame.contentDocument.write('<html><head><title>Print KOT</title>');
                    printFrame.contentDocument.write('<style> body { margin: 0; padding: 0; color: #000; background: #fff; } @media print { @page { size: 80mm auto; margin: 3mm; } html, body { width: 74mm; } h2, p { margin: 0 0 3px 0; } hr { margin: 5px 0; } } </style>');
                    printFrame.contentDocument.write('</head><body>');
                    printFrame.contentDocument.write(kotHtml);
                    printFrame.contentDocument.write('</body></html>');
                    printFrame.contentDocument.close();

                    // Ensure content is loaded before printing
                    printFrame.onload = () => {
                        printFrame.contentWindow.focus();
                        printFrame.contentWindow.print();
                        // More robust cleanup
                        setTimeout(() => {
                            if (document.body.contains(printFrame)) {
                                document.body.removeChild(printFrame);
                            }
                        }, 1000); // Delay to ensure print dialog is processed
                    };
                    // For browsers that might not fire onload for dynamically written iframes promptly
                    if (printFrame.contentWindow.document.readyState === 'complete') {
                        printFrame.onload();
                    }


                    showToast('KOT sent to browser print dialog', 'success');

                } catch (fallbackError) {
                    console.error('Error during fallback KOT printing:', fallbackError);
                    showToast(`Fallback KOT printing failed: ${fallbackError.message}`, 'error');
                }
            } else {
                console.log('Print KOT for order (simulation - KOTs not enabled or no fallback defined):', order.id);
                showToast('KOT Printed successfully (simulation)', 'success');
            }
        } catch (err) {
            console.error('Error printing KOT:', err);
            showToast(`Failed to print KOT: ${err.message}`, 'error');
        }
    };

    const handlePrintBill = async () => {
        let billPrintedSuccessfully = false;
        let userCancelledBluetooth = false;

        try {
            // Try Bluetooth printing first if available
            if (BluetoothPrinting && BluetoothPrinting.isSupported()) {
                try {
                    const printerAlreadyConnected = BluetoothPrinting.connected && BluetoothPrinting.characteristic;
                    if (printerAlreadyConnected) {
                        showToast("Printing bill using connected printer...", "info");
                    } else if (BluetoothPrinting.lastConnectedDevice) {
                        showToast(`Connecting to printer ${BluetoothPrinting.lastConnectedDevice.name}...`, "info");
                    } else {
                        showToast("Select a printer to print bill", "info");
                    }

                    // Get order channel and payment mode for proper template variables
                    const paymentMode = order.payMode || 'CASH';
                    const channel = order.priceVariant || 'Default';
                    await BluetoothPrinting.printBill(order.id, paymentMode, false, channel);
                    showToast("Bill printed successfully via Bluetooth", "success");
                    billPrintedSuccessfully = true;
                } catch (btError) {
                    console.error("Bluetooth bill printing failed:", btError);
                    if (btError.message.includes("Device selection cancelled") ||
                        btError.message.includes("No printer selected") ||
                        btError.message.includes("cancelled by user") ||
                        btError.name === "NotFoundError") {
                        showToast("Bluetooth printing cancelled by user.", "info");
                        userCancelledBluetooth = true; // Mark that user actively cancelled.
                        // Do not automatically fall back if user explicitly cancelled.
                        // UI should ideally give option to print later or complete without printing.
                    } else {
                        showToast(`Bluetooth printing error: ${btError.message}. Falling back to browser print.`, "warning");
                    }
                }
            }

            // Fallback to browser print if Bluetooth didn't succeed AND user didn't cancel Bluetooth
            if (!billPrintedSuccessfully && !userCancelledBluetooth && (UserSession?.seller?.billEnabled !== false)) {
                if (process.env.NODE_ENV === 'development') {
                    console.log("Attempting fallback browser print for bill:", order.id);
                }
                try {
                    const orderRef = sdk.db.collection("Orders").doc(order.id);
                    const orderDoc = await orderRef.get();
                    if (!orderDoc.exists) throw new Error("Order not found for bill printing.");
                    const orderData = orderDoc.data();

                    // Debug: Check if split bill data exists
                    console.log('Print Bill - Order Data:', orderData);
                    console.log('Print Bill - Split Bill Data:', orderData.splitBill);

                    // --- Bill HTML Formatting ---
                    let billHtml = `<div style="font-family: 'Courier New', monospace; font-size: 11px; width: 280px; margin: 0 auto; padding: 5px;">
                        <h2 style="text-align: center; margin: 0 0 5px 0; font-size: 14px;">${UserSession?.seller?.gstEnabled ? 'TAX INVOICE' : 'BILL/RECEIPT'}</h2>
                        <p style="text-align: center; margin:0; font-size: 12px;"><strong>${UserSession?.seller?.businessName || 'Your Business'}</strong></p>
                        ${UserSession?.seller?.address ? `<p style="text-align: center; font-size: 9px; margin:0;">${UserSession.seller.address}</p>` : ''}
                        ${UserSession?.seller?.phone ? `<p style="text-align: center; font-size: 9px; margin:0;">Ph: ${UserSession.seller.phone}</p>` : ''}
                        ${UserSession?.seller?.gstEnabled && UserSession?.seller?.gstIN ? `<p style="text-align: center; font-size: 9px; margin:0;">GSTIN: ${UserSession.seller.gstIN}</p>` : ''}
                        <hr style="border:none; border-top: 1px dashed #000; margin: 4px 0;" />
                        <div style="display:flex; justify-content:space-between; font-size:10px;"><span>Bill: ${orderData.billNo || orderData.id?.substring(0, 8) || 'N/A'}</span><span>${new Date(orderData.date?.toDate ? orderData.date.toDate() : orderData.date || new Date()).toLocaleDateString()}</span></div>
                        <div style="font-size:10px;">Time: ${new Date(orderData.date?.toDate ? orderData.date.toDate() : orderData.date || new Date()).toLocaleTimeString('en-GB')}</div>
                        ${orderData.customer?.name ? `<p style="font-size:10px;">Cust: ${orderData.customer.name}</p>` : ''}
                        ${orderData.custName ? `<p style="font-size:10px;">Customer: ${orderData.custName}</p>` : ''}
                        ${orderData.custPhone ? `<p style="font-size:10px;">Phone: ${orderData.custPhone}</p>` : ''}
                        ${orderData.tableId ? `<p style="font-size:10px;">Table: ${orderData.tableId}</p>` : ''}
                        <hr style="border:none; border-top: 1px dashed #000; margin: 4px 0;" />
                        <table style="width: 100%; font-size: 10px; border-collapse: collapse;">
                            <thead><tr style="border-bottom: 1px dashed #000;"><th style="text-align:left; padding-bottom:2px;">Item</th><th style="text-align:right; padding-bottom:2px;">Qty</th><th style="text-align:right; padding-bottom:2px;">Rate</th><th style="text-align:right; padding-bottom:2px;">Amount</th></tr></thead><tbody>`;

                    let calculatedSubTotal = 0;
                    if (orderData.items && orderData.items.length > 0) {
                        orderData.items.forEach(item => {
                            const q = parseFloat(item.qnt || item.quantity || 1) || 1;
                            const addons = Array.isArray(item.addons) ? item.addons.reduce((s, a) => s + (a.price || 0), 0) : (item.addonsTotal || 0);
                            // Compute effective base: prefer unitOverride.amount, else unitOverride.units*ppu, else basePrice fallback
                            let base = (typeof item.basePrice === 'number') ? item.basePrice : ((item.price || 0) - addons);
                            const ppu = Number(item?.unitPricing?.pricePerUnit);
                            if (item?.unitPricing?.enabled && !isNaN(ppu) && ppu > 0) {
                                const ov = item.unitOverride || {};
                                if (ov.amount != null && !isNaN(Number(ov.amount)) && Number(ov.amount) > 0) {
                                    base = Number(ov.amount);
                                } else if (ov.units != null && !isNaN(Number(ov.units)) && Number(ov.units) > 0) {
                                    base = ppu * Number(ov.units);
                                }
                            }
                            const price = base + addons;
                            const amount = q * price;
                            calculatedSubTotal += amount;
                            // Show main item with base price (exclude add-ons)
                            billHtml += `<tr style="vertical-align:top;">
                                            <td style="padding:2px 0;">${formatProductTitle(item) || 'Unknown Item'}</td>
                                            <td style="text-align:right; padding:2px 0;">${q}</td>
                                            <td style="text-align:right; padding:2px 0;">${base.toFixed(2)}</td>
                                            <td style="text-align:right; padding:2px 0;">${(q * base).toFixed(2)}</td>
                                         </tr>`;

                            // Add add-ons if present
                            if (item.addons && item.addons.length > 0) {
                                item.addons.forEach(addon => {
                                    billHtml += `<tr style="vertical-align:top;">
                                        <td style="padding:2px 0; padding-left: 20px; font-size: 9px; color: #666;">+ ${addon.name}</td>
                                        <td style="text-align:right; padding:2px 0; font-size: 9px; color: #666;">-</td>
                                        <td style="text-align:right; padding:2px 0; font-size: 9px; color: #666;">+${(addon.price || 0).toFixed(2)}</td>
                                        <td style="text-align:right; padding:2px 0; font-size: 9px; color: #666;">+${(q * (addon.price || 0)).toFixed(2)}</td>
                                    </tr>`;
                                });
                            }
                        });
                    }
                    billHtml += `</tbody></table><hr style="border:none; border-top: 1px dashed #000; margin: 4px 0;" />`;

                    const subTotalForDisplay = orderData.subTotal?.toFixed(2) || calculatedSubTotal.toFixed(2);
                    billHtml += `<div style="display:flex; justify-content:space-between; font-size:10px;"><span>Subtotal:</span><span>${subTotalForDisplay}</span></div>`;

                    let totalAmount = parseFloat(orderData.subTotal || calculatedSubTotal);
                    if (orderData.discount && parseFloat(orderData.discount) > 0) {
                        const discountVal = parseFloat(orderData.discount);
                        billHtml += `<div style="display:flex; justify-content:space-between; font-size:10px;"><span>Discount:</span><span>-${discountVal.toFixed(2)}</span></div>`;
                        // totalAmount -= discountVal; // Assuming discount is already applied in orderData.total
                    }

                    if (orderData.charges && Array.isArray(orderData.charges)) {
                        // Use ChargesCalculator for consistent charge calculations
                        const chargesCalculation = ChargesCalculator?.calculateCharges(
                            totalAmount,
                            orderData.charges
                        );

                        if (chargesCalculation && chargesCalculation.calculatedCharges) {
                            chargesCalculation.calculatedCharges.forEach(charge => {
                                billHtml += `<div style="display:flex; justify-content:space-between; font-size:10px;"><span>${charge.displayName}:</span><span>${charge.calculatedAmount.toFixed(2)}</span></div>`;
                            });

                            // Update total amount for display
                            totalAmount = chargesCalculation.finalAmount;
                        }
                    }

                    billHtml += `<hr style="border:none; border-top: 1px solid #000; margin: 4px 0;" />`;
                    billHtml += `<div style="display:flex; justify-content:space-between; font-weight:bold; font-size: 12px;"><span>TOTAL:</span><span>${totalAmount.toFixed(2)}</span></div>`;
                    billHtml += `<hr style="border:none; border-top: 1px solid #000; margin: 4px 0;" />`;
                    billHtml += `<p style="font-size:10px;"><strong>Mode:</strong> ${orderData.payMode || 'N/A'}</p>`;

                    // Add split bill information if available
                    if (orderData.splitBill && orderData.splitBill.enabled) {
                        billHtml += `<hr style="border:none; border-top: 1px dashed #000; margin: 8px 0;" />`;
                        billHtml += `<div style="text-align: center; margin: 8px 0;">`;
                        billHtml += `<p style="font-size:11px; margin: 0 0 4px 0;"><strong>🧾 BILL SPLIT DETAILS</strong></p>`;
                        billHtml += `<p style="font-size:10px; margin: 0 0 6px 0; color: #666;">Split among ${orderData.splitBill.numberOfPeople} people</p>`;
                        billHtml += `</div>`;

                        if (orderData.splitBill.type === 'equal') {
                            billHtml += `<div style="background: #f8f9fa; padding: 8px; margin: 4px 0; border-radius: 4px; text-align: center;">`;
                            billHtml += `<p style="font-size:10px; margin: 0; font-weight: bold;">Each person pays: ${UserSession?.getCurrency() || '₹'}${orderData.splitBill.amountPerPerson.toFixed(2)}</p>`;
                            billHtml += `</div>`;
                        } else if (orderData.splitBill.customSplits) {
                            billHtml += `<div style="background: #f8f9fa; padding: 8px; margin: 4px 0; border-radius: 4px;">`;
                            billHtml += `<p style="font-size:9px; margin: 0 0 4px 0; font-weight: bold; text-align: center;">Individual Amounts:</p>`;
                            orderData.splitBill.customSplits.forEach((split, index) => {
                                billHtml += `<div style="display:flex; justify-content:space-between; font-size:9px; margin: 2px 0; padding: 2px 0; border-bottom: 1px dotted #ccc;">`;
                                billHtml += `<span style="font-weight: 500;">${split.name || `Person ${index + 1}`}</span>`;
                                billHtml += `<span style="font-weight: bold;">${UserSession?.getCurrency() || '₹'}${split.amount.toFixed(2)}</span>`;
                                billHtml += `</div>`;
                            });
                            billHtml += `</div>`;
                        }
                        billHtml += `<hr style="border:none; border-top: 1px dashed #000; margin: 8px 0;" />`;
                    }

                    if (orderData.notes) billHtml += `<p style="font-size:9px;">Notes: ${orderData.notes}</p>`;
                    billHtml += `<p style="text-align:center; font-size:9px; margin-top:8px;">Thank you! Visit Again!</p></div>`;
                    // --- End Bill HTML Formatting ---

                    const printFrame = document.createElement('iframe');
                    Object.assign(printFrame.style, { position: 'fixed', top: '-9999px', left: '-9999px', width: '0', height: '0', border: '0' });
                    document.body.appendChild(printFrame);
                    printFrame.contentDocument.open();
                    printFrame.contentDocument.write('<html><head><title>Print Bill</title><style>body{margin:0;padding:0;color:#000;background:#fff} @media print{@page{size:80mm auto;margin:3mm} html,body{width:74mm; font-size: 10px;} h2,p,div,span,th,td{margin:0 0 2px 0; padding:0;} table{width:100%;} hr{margin:3px 0;}}</style></head><body>' + billHtml + '</body></html>');
                    printFrame.contentDocument.close();

                    const doPrint = () => {
                        try {
                            printFrame.contentWindow.focus();
                            printFrame.contentWindow.print();
                            billPrintedSuccessfully = true;
                            showToast("Bill sent to browser print dialog", "success");
                        } catch (printError) {
                            console.error("Error triggering browser print:", printError);
                            showToast("Could not open print dialog. Please check browser pop-up settings.", "error");
                        }
                        setTimeout(() => document.body.contains(printFrame) && document.body.removeChild(printFrame), 1500);
                    };

                    if (printFrame.contentWindow.document.readyState === 'complete') {
                        doPrint();
                    } else {
                        printFrame.onload = doPrint;
                    }
                } catch (fallbackErr) {
                    console.error("Error during fallback bill printing:", fallbackErr);
                    showToast(`Fallback bill printing failed: ${fallbackErr.message}`, "error");
                }
            }

            // Only complete order if it wasn't a user cancellation of Bluetooth and print was attempted or bill printing is disabled
            if (!userCancelledBluetooth) {
                const orderRef = sdk.db.collection("Orders").doc(order.id);
                await orderRef.update({
                    status: sdk.FieldValue.arrayUnion({
                        label: "COMPLETED",
                        date: new Date()
                    }),
                    currentStatus: {
                        label: "COMPLETED",
                        date: new Date()
                    },
                    printed: billPrintedSuccessfully // Optionally track if bill was printed
                });
                showToast("Order marked as COMPLETED", "info");

                // Post-completion: update customer aggregates and notify listeners
                (async () => {
                    try {
                        const updatedDoc = await orderRef.get();
                        if (!updatedDoc.exists) return;
                        const updatedOrder = updatedDoc.data();

                        // Determine customer id (support embedded customer snapshot)
                        const custId = updatedOrder.custId || (updatedOrder.customer && updatedOrder.customer.id) || null;

                        if (custId && custId !== 'guest') {
                            // Compute amount: prefer settledAmount or finalAmount, fallback to items sum
                            let amount = Number(updatedOrder.settledAmount ?? updatedOrder.finalAmount ?? 0) || 0;
                            if (!amount && Array.isArray(updatedOrder.items)) {
                                amount = updatedOrder.items.reduce((s, it) => {
                                    const q = Number(it.qnt || it.quantity || 1) || 1;
                                    const base = (typeof it.basePrice === 'number') ? it.basePrice : (Number(it.price) || 0);
                                    const addons = Array.isArray(it.addons) ? it.addons.reduce((a, b) => a + (Number(b.price) || 0), 0) : (Number(it.addonsTotal) || 0);
                                    return s + (q * (base + addons));
                                }, 0);
                            }

                            const paymentEntry = {
                                orderId: updatedOrder.id || order.id,
                                amount: Number(amount) || 0,
                                payMode: updatedOrder.payMode || 'CASH',
                                date: updatedOrder.date || new Date(),
                                // Propagate loyalty metadata so appendCustomerPayment can correctly exclude redeemed amount
                                loyaltyDiscountAmount: Number(updatedOrder.loyaltyDiscountAmount || updatedOrder.loyaltyDiscount || 0) || 0,
                                loyaltyPointsUsed: Number(updatedOrder.loyaltyPointsUsed || 0) || 0,
                                // Mark as settled/paid for award logic (avoid awarding for pending COD/UNSETTLED)
                                settled: Boolean(updatedOrder.paid || updatedOrder.settled || (Number(updatedOrder.settledAmount || 0) > 0) || /COMPLETED|PAID/i.test(((updatedOrder.currentStatus && updatedOrder.currentStatus.label) || updatedOrder.status || '')))
                            };

                            appendCustomerPayment(custId, paymentEntry).catch(e => console.warn('[Modals] appendCustomerPayment failed', e));
                        }

                        // Dispatch a standardized orderCompleted event so open UIs can refresh
                        try {
                            window.dispatchEvent(new CustomEvent('orderCompleted', {
                                detail: {
                                    orderId: order.id,
                                    customerId: custId || null,
                                    paid: true,
                                    status: 'COMPLETED'
                                }
                            }));
                        } catch (evErr) {
                            console.warn('[Modals] orderCompleted dispatch failed', evErr);
                        }
                    } catch (postErr) {
                        console.warn('[Modals] post-completion customer update failed', postErr);
                    }
                })();

                if (refreshOrders) refreshOrders();
                else if (refreshData) refreshData();
                return billPrintedSuccessfully;
            } else {
                // User cancelled Bluetooth, don't complete order automatically
                return false;
            }

        } catch (err) {
            console.error('Error in handlePrintBill process:', err);
            showToast(`Operation failed: ${err.message}`, 'error');
            return false;
        }
    };

    const handleBluetoothPrint = async () => {
        try {
            // This function is no longer needed as we've integrated Bluetooth printing into handlePrintKOT
            // Keeping it for backward compatibility, but just forwarding to handlePrintKOT
            await handlePrintKOT();
        } catch (error) {
            console.error("Error printing:", error);
        }
    };

    const handleCheckout = async () => {
        // Prevent checkout with 0 items
        if (!order || !order.items || order.items.length === 0) {
            showToast("Cannot checkout with 0 items. Please add items to the order.", "error");
            return;
        }

        try {
            // Create a container for the CheckoutSheet
            const checkoutContainer = document.createElement('div');
            checkoutContainer.id = 'checkout-container';
            checkoutContainer.className = 'fixed inset-0 z-50';
            document.body.appendChild(checkoutContainer);

            try {
                // Convert order items to cart format expected by CheckoutSheet
                const cart = {};

                // Make sure order and order.items exist before trying to loop
                if (order && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        // Make sure item has required properties
                        if (item && item.pid) {
                            cart[item.pid] = {
                                product: {
                                    id: item.pid,
                                    title: formatProductTitle(item) || 'Unknown Item',
                                    // Use basePrice as the product's base (exclude addons), fallback to price
                                    price: (typeof item.basePrice === 'number' ? item.basePrice : (item.price || 0)),
                                    mrp: item.mrp || item.price || 0,
                                    imgs: item.thumb ? [item.thumb] : [],
                                    charges: item.charges || [], // Use item's charges if available
                                    cat: item.cat || 'Other',
                                    veg: item.veg || false,
                                    // Ensure unitPricing is available for CheckoutSheet's Units/Amount UI
                                    unitPricing: item.unitPricing || undefined
                                },
                                quantity: item.quantity || item.qnt || 1,
                                // Preserve addons so totals match
                                addons: Array.isArray(item.addons) ? item.addons : []
                            };
                        }
                    });
                }

                // Create a root element for React 18
                const root = ReactDOM.createRoot(checkoutContainer);

                // Render the CheckoutSheet component wrapped with LanguageProvider
                root.render(
                    createElement(LanguageProvider, null,
                        createElement(CheckoutSheet, {
                            cart: cart,
                            clearCallback: async () => {
                                // Cleanup and close
                                root.unmount();
                                if (document.body.contains(checkoutContainer)) {
                                    document.body.removeChild(checkoutContainer);
                                }
                                // Refresh orders list or page
                                if (refreshOrders && typeof refreshOrders === 'function') {
                                    refreshOrders();
                                } else if (refreshData && typeof refreshData === 'function') {
                                    refreshData();
                                }
                            },
                            tableId: tableId,
                            checkout: true,
                            orderId: order ? order.id : null,
                            priceVariant: variant,
                            initialUnitEntryMode: unitEntryMode,
                            charges: order?.charges || [],
                            onClose: () => {
                                // Cleanup
                                root.unmount();
                                if (document.body.contains(checkoutContainer)) {
                                    document.body.removeChild(checkoutContainer);
                                }
                            }
                        })
                    )
                );
            } catch (error) {
                console.error("Error rendering CheckoutSheet:", error);
                if (document.body.contains(checkoutContainer)) {
                    document.body.removeChild(checkoutContainer);
                }
                throw error;
            }
        } catch (error) {
            console.error("Error opening checkout:", error);
            showToast("Failed to open checkout", "error");
        }
    };

    const handleAddNewItem = () => {
        // Check if POS component is available
        if (!POS) {
            console.error("POS component is not defined");
            showToast("Cannot open POS: component not available", "error");
            return;
        }

        // Create a container for the POS component
        const posContainer = document.createElement('div');
        posContainer.id = 'pos-items-container';
        posContainer.className = 'fixed inset-0 z-50';
        document.body.appendChild(posContainer);

        try {
            // Create a root element for React 18
            const root = ReactDOM.createRoot(posContainer);

            // Convert order to the format expected by POS component
            const orderForPOS = {
                ...order,
                ref: sdk.db.collection("Orders").doc(order.id)
            };

            // Render the POS component wrapped with LanguageProvider
            root.render(
                createElement(LanguageProvider, null,
                    createElement(POS, {
                        title: `${t('addToOrder')} #${order.billNo || order.id?.slice(-6)}`,
                        tableId: tableId,
                        variant: variant,
                        order: orderForPOS,
                        includeAllProducts: true, // Add this flag to force showing all products
                        onClose: () => {
                            // Unmount and clean up
                            root.unmount();
                            if (document.body.contains(posContainer)) {
                                document.body.removeChild(posContainer);
                            }
                        }
                    })
                )
            );
        } catch (error) {
            console.error("Error rendering POS:", error);
            if (document.body.contains(posContainer)) {
                document.body.removeChild(posContainer);
            }
            showToast("Failed to open POS", "error");
        }
    };

    const toggleItemServed = async (item, served) => {
        try {
            // Get a reference to the order document
            const orderRef = sdk.db.collection("Orders").doc(order.id);

            // Get the current order data
            const orderDoc = await orderRef.get();
            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }

            const orderData = orderDoc.data();

            // Update the served status of the specific item
            const updatedItems = orderData.items.map(i => {
                if (i.pid === item.pid) {
                    return { ...i, served: served };
                }
                return i;
            });

            // Update the order with the modified items array (sanitize undefined -> null)
            const sanitize = (val) => {
                if (typeof val === 'undefined' || val === null) return null;
                if (Array.isArray(val)) return val.map(sanitize);
                if (typeof val === 'object') {
                    const out = {};
                    for (const k of Object.keys(val)) {
                        try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                    }
                    return out;
                }
                return val;
            };
            await orderRef.update({ items: sanitize(updatedItems) });

            showToast(`Item ${served ? 'served' : 'unserved'}`);
        } catch (err) {
            console.error('Error updating item served status:', err);
            showToast('Failed to update item status', 'error');
        }
    };

    const itemsEqual = (a, b) => {
        if (!a || !b) return false;
        const pidA = a.pid != null ? String(a.pid) : '';
        const pidB = b.pid != null ? String(b.pid) : '';
        const vA = a.variantId || null;
        const vB = b.variantId || null;
        return pidA === pidB && vA === vB;
    };

    const handleRemoveItem = async (item) => {
        try {
            // Get a reference to the order document
            const orderRef = sdk.db.collection("Orders").doc(order.id);

            // Get the current order data
            const orderDoc = await orderRef.get();
            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }

            const orderData = orderDoc.data();

            // Find the item in the current items array (match by pid and variantId)
            let itemIndex = orderData.items.findIndex(i => itemsEqual(i, item));
            if (itemIndex === -1) {
                // Fallback: match by pid only
                itemIndex = orderData.items.findIndex(i => String(i.pid) === String(item.pid));
            }
            if (itemIndex === -1) {
                showToast('Item not found in order. Please refresh.', 'error');
                return;
            }

            // Get current quantity - standardize on qnt property
            const currentQty = parseInt(orderData.items[itemIndex].qnt || 1);
            const completedCount = orderData.items[itemIndex].completed || 0;

            // If quantity is 1, remove the item completely
            if (currentQty <= 1) {
                // Remove the item from the items array
                const updatedItems = orderData.items.filter(i => !itemsEqual(i, item));
                // Update the order with the modified items array (sanitize undefined -> null)
                const sanitize = (val) => {
                    if (typeof val === 'undefined' || val === null) return null;
                    if (Array.isArray(val)) return val.map(sanitize);
                    if (typeof val === 'object') {
                        const out = {};
                        for (const k of Object.keys(val)) {
                            try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                        }
                        return out;
                    }
                    return val;
                };
                await orderRef.update({ items: sanitize(updatedItems) });
                showToast(`${formatProductTitle(item)} removed from order`);
            } else {
                // Decrease quantity by 1
                const newQuantity = currentQty - 1;
                // If the new quantity is less than the completed count, 
                // reduce the completed count as well
                const newCompleted = newQuantity < completedCount ? newQuantity : completedCount;

                const updatedItems = [...orderData.items];
                updatedItems[itemIndex] = {
                    ...updatedItems[itemIndex],
                    qnt: newQuantity,
                    completed: newCompleted
                };
                // Update the order with the modified items array (sanitize undefined -> null)
                const sanitize = (val) => {
                    if (typeof val === 'undefined' || val === null) return null;
                    if (Array.isArray(val)) return val.map(sanitize);
                    if (typeof val === 'object') {
                        const out = {};
                        for (const k of Object.keys(val)) {
                            try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                        }
                        return out;
                    }
                    return val;
                };
                await orderRef.update({ items: sanitize(updatedItems) });
                showToast(`Decreased ${formatProductTitle(item)} quantity by 1`);
            }
        } catch (err) {
            console.error('Error updating item quantity:', err);
            showToast('Failed to update item quantity', 'error');
        }
    };

    const handleAddItem = async (item) => {
        try {
            // Get a reference to the order document
            const orderRef = sdk.db.collection("Orders").doc(order.id);

            // Get the current order data
            const orderDoc = await orderRef.get();
            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }

            const orderData = orderDoc.data();

            // Find the item in the current items array (match by pid and variantId)
            let itemIndex = orderData.items.findIndex(i => itemsEqual(i, item));
            if (itemIndex === -1) {
                // Fallback: match by pid only
                itemIndex = orderData.items.findIndex(i => String(i.pid) === String(item.pid));
            }
            if (itemIndex === -1) {
                showToast('Item not found in order. Please refresh.', 'error');
                return;
            }

            // Get current quantity and increase by 1
            const currentQty = parseInt(orderData.items[itemIndex].qnt || 1);
            const completedCount = orderData.items[itemIndex].completed || 0;
            const newQuantity = currentQty + 1;

            // Ensure completed count doesn't exceed new quantity
            const adjustedCompleted = Math.min(completedCount, newQuantity);

            const updatedItems = [...orderData.items];
            updatedItems[itemIndex] = {
                ...updatedItems[itemIndex],
                qnt: newQuantity,
                completed: adjustedCompleted
            };

            // Update the order with the modified items array (sanitize undefined -> null)
            const sanitize = (val) => {
                if (typeof val === 'undefined' || val === null) return null;
                if (Array.isArray(val)) return val.map(sanitize);
                if (typeof val === 'object') {
                    const out = {};
                    for (const k of Object.keys(val)) {
                        try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                    }
                    return out;
                }
                return val;
            };
            await orderRef.update({ items: sanitize(updatedItems) });
            showToast(`Added ${formatProductTitle(item)} quantity by 1`);
        } catch (err) {
            console.error('Error updating item quantity:', err);
            showToast('Failed to update item quantity', 'error');
        }
    };

    // Helper function to get the item image URL
    const getItemImage = (item) => {
        // Check for thumb first (as in the Flutter model)
        return item.thumb || item.image || item.thumbnail || item.imageUrl || item.img || null;
    };

    // Helper function to get a category-appropriate icon
    const getCategoryIcon = (item) => {
        if (item.cat) {
            const cat = item.cat.toLowerCase();
            if (cat.includes('drink') || cat.includes('beverage')) return 'ph-coffee text-brown-500';
            if (cat.includes('dessert') || cat.includes('sweet')) return 'ph-cake text-yellow-600';
            if (cat.includes('pizza') || cat.includes('pie')) return 'ph-pizza text-orange-500';
            if (cat.includes('burger')) return 'ph-hamburger text-orange-700';
            if (cat.includes('salad') || cat.includes('veg')) return 'ph-plant text-green-500';
            if (cat.includes('chicken') || cat.includes('meat')) return 'ph-drumstick text-red-600';
            if (cat.includes('soup')) return 'ph-bowl-food text-yellow-700';
        }
        return 'ph-fork-knife text-gray-500';
    };

    // Calculate subtotal
    // Subtotal using overrides
    const subtotal = (order.items || []).reduce((sum, item) => sum + getLineTotal(item), 0);

    return (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6" style={{ backgroundColor: "#fff8f8", borderRadius: "16px" }}>
            {/* Order Header */}
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-medium text-gray-800 text-lg">
                            {t('billNo')}: <span className="text-red-500">#{order.billNo || order.id?.slice(-6)}</span>
                        </h3>
                        <div className="flex items-center mt-1">
                            <p className="text-sm text-gray-600">
                                {formatTinyDateTime(order.date || order.placeDate)}
                            </p>
                            <span className="mx-2 text-gray-300">•</span>
                            <p className="text-sm text-gray-600 flex items-center">
                                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${progressPercent === 100 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                {servedItems}/{totalItems} {t('items')}
                            </p>
                        </div>
                        {order?.payMode === 'UNSETTLED' && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span
                                    className={`px-2 py-0.5 text-xs font-medium rounded-full inline-flex items-center border ${order?.settled
                                        ? 'bg-green-50 text-green-600 border-green-100'
                                        : (order?.settledAmount || 0) > 0
                                            ? 'bg-yellow-50 text-yellow-600 border-yellow-100'
                                            : 'bg-orange-50 text-orange-600 border-orange-100'
                                        }`}
                                >
                                    <i
                                        className={`text-xs mr-1 ${order?.settled
                                            ? 'ph ph-check-circle'
                                            : (order?.settledAmount || 0) > 0
                                                ? 'ph ph-clock-clockwise'
                                                : 'ph ph-credit-card'
                                            }`}
                                    ></i>
                                    {order?.settled ? 'Settled' : (order?.settledAmount || 0) > 0 ? 'Partial' : 'Unsettled'}
                                </span>
                            </div>
                        )}
                        {/* Customer Information */}
                        {(order.custName || order.custPhone) && (
                            <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                                <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                                    <i className="ph ph-user-circle mr-1"></i>
                                    {t('customerInformation')}
                                </h4>
                                {order.custName && (
                                    <p className="text-sm text-gray-600 flex items-center">
                                        <i className="ph ph-user mr-2"></i>
                                        {order.custName}
                                    </p>
                                )}
                                {order.custPhone ? (
                                    <button
                                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline mt-1 flex items-center gap-1"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            window.location.href = `tel:${order.custPhone}`;
                                        }}
                                        title={window.LanguageContext?.t('callCustomer')}
                                    >
                                        <i className="ph ph-phone"></i>
                                        {order.custPhone}
                                    </button>
                                ) : order.custName && (
                                    <p className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                                        <i className="ph ph-phone-slash"></i>
                                        {t('phoneNotAvailable')}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            className="p-2.5 text-red-500 hover:bg-red-50 rounded-full transition-colors flex items-center justify-center w-10 h-10"
                            onClick={handleAddNewItem}
                            aria-label={t('addNewItem')}
                        >
                            <i className="ph ph-plus-circle text-2xl"></i>
                        </button>
                        <div className="relative">
                            <button
                                className="p-2.5 text-gray-600 hover:bg-gray-50 rounded-full transition-colors flex items-center justify-center w-10 h-10"
                                onClick={() => setShowContextMenu(!showContextMenu)}
                                aria-label={t('moreOptions')}
                            >
                                <i className="ph ph-dots-three-vertical text-xl"></i>
                            </button>
                            {showContextMenu && (
                                <div
                                    ref={menuRef}
                                    className="absolute right-0 top-12 w-52 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50"
                                >
                                    <div className="py-1">
                                        <button
                                            className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                            onClick={handleUpdateCustomerInfo}
                                        >
                                            <i className="ph ph-user-circle text-blue-500"></i>
                                            <span>{t('updateCustomerInfo')}</span>
                                        </button>
                                        <button
                                            className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                            onClick={handleShiftTable}
                                        >
                                            <i className="ph ph-arrows-left-right text-red-500"></i>
                                            <span>{t('shiftToTable')}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-gray-100">
                <div
                    className="h-full bg-red-500 transition-all duration-300 ease-out rounded-r-full"
                    style={{ width: `${progressPercent}%` }}
                ></div>
            </div>

            {/* Order Items */}
            <div className="divide-y divide-pink-50">
                {order.items?.map((item, index) => (
                    <div key={index} className="p-4 hover:bg-pink-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={item.served || false}
                                onChange={(e) => toggleItemServed(item, e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 text-red-500 focus:ring-red-500 focus:ring-offset-0"
                                id={`item-${order.id}-${index}`}
                            />
                            <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                {getItemImage(item) ? (
                                    <img
                                        src={getItemImage(item)}
                                        alt={item.title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
                                        }}
                                    />
                                ) : (
                                    <i className={`ph ${getCategoryIcon(item)} text-gray-400 text-xl`}></i>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-800 truncate">{formatProductTitle(item)}</h4>
                                <div className="flex items-center mt-1">
                                    {(() => {
                                        const lineTotal = getLineTotal(item);
                                        return <span className="text-sm font-medium text-red-500">{UserSession?.getCurrency()}{Number(lineTotal || 0).toFixed(2)}</span>;
                                    })()}
                                    {item.cat && (
                                        <>
                                            <span className="mx-1 text-gray-300">•</span>
                                            <span className="text-sm text-gray-600">{item.cat}</span>
                                        </>
                                    )}
                                </div>
                                {item?.unitPricing?.enabled && item?.unitPricing?.displayUnit && Number(item?.unitPricing?.pricePerUnit) > 0 && (
                                    <div className="mt-1">
                                        <div className="text-[10px] text-blue-600 mb-1">
                                            @ {UserSession?.getCurrency()}{Number(item.unitPricing.pricePerUnit).toFixed(2)} / {item.unitPricing.displayUnit}
                                        </div>
                                        {/* Per-item Units/Amount toggle only */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-[10px]">
                                                <button
                                                    type="button"
                                                    className={`px-2 py-0.5 rounded-full ${(itemModes[getItemKey(item)] || 'amount') === 'units' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
                                                    onClick={() => onToggleMode(item, 'units')}
                                                >Units</button>
                                                <button
                                                    type="button"
                                                    className={`px-2 py-0.5 rounded-full ${(itemModes[getItemKey(item)] || 'amount') === 'amount' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
                                                    onClick={() => onToggleMode(item, 'amount')}
                                                >Amount</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {item.veg !== undefined && (
                                    <div className="mt-1">
                                        <span className={`inline-block w-4 h-4 border ${item.veg ? 'border-green-500' : 'border-red-500'} p-0.5 rounded-sm`}>
                                            <span className={`block w-full h-full rounded-sm ${item.veg ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center">
                                <div className="bg-gray-100 rounded-full px-1 py-0.5 flex items-center gap-1">
                                    <button
                                        className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full"
                                        onClick={() => handleRemoveItem(item)}
                                        aria-label={t('removeItem')}
                                    >
                                        <i className="ph ph-minus"></i>
                                    </button>
                                    <span className="w-8 text-center font-medium">
                                        {item.qnt || 1}
                                    </span>
                                    <button
                                        className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full"
                                        onClick={() => handleAddItem(item)}
                                        aria-label={t('addItem')}
                                    >
                                        <i className="ph ph-plus"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Special Instructions */}
            <div className="p-4 border-t border-pink-100">
                <div className="space-y-2">
                    <label htmlFor="special-instructions" className="block font-medium text-gray-700 flex items-center">
                        <i className="ph ph-note-pencil text-red-500 mr-1.5"></i>
                        {t('specialInstructions')}
                    </label>
                    <textarea
                        id="special-instructions"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-red-500 focus:border-red-500 text-sm"
                        placeholder={t('addAnySpecialInstructions')}
                        rows="2"
                        value={order.instructions || ''}
                        onChange={(e) => handleInstructionsChange(e.target.value)}
                    ></textarea>
                </div>
            </div>

            {/* Subtotal */}
            <div className="p-4 border-t border-pink-100">
                <div className="flex justify-between items-center">
                    <h3 className="font-medium text-gray-700">{t('subTotal')}:</h3>
                    <span className="font-medium text-red-500 text-lg">{UserSession?.getCurrency()}{subtotal.toFixed(2)}</span>
                </div>

                {/* Use ChargesCalculator for consistent charge calculations */}
                {(() => {
                    // Calculate charges using the utility - ensure charges is always an array
                    const chargesCalculation = ChargesCalculator?.calculateCharges(
                        subtotal,
                        order.charges || []
                    );

                    const { calculatedCharges, finalAmount } = chargesCalculation;

                    return (
                        <>
                            {/* Display charges */}
                            {calculatedCharges && calculatedCharges.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {calculatedCharges.map((charge, index) => (
                                        <div key={index} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{charge.displayName}:</span>
                                            <span className="text-gray-800">{UserSession?.getCurrency()}{charge.calculatedAmount.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Display discount if any */}
                            {order.discount && parseFloat(order.discount) > 0 && (
                                <div className="mt-2 flex justify-between items-center text-sm">
                                    <span className="text-green-600">Discount:</span>
                                    <span className="text-green-600">- {UserSession?.getCurrency()}{parseFloat(order.discount).toFixed(2)}</span>
                                </div>
                            )}

                            {/* Display total */}
                            {(calculatedCharges && calculatedCharges.length > 0) || (order.discount && parseFloat(order.discount) > 0) ? (
                                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800">Total:</h3>
                                    <span className="font-bold text-red-500 text-lg">{UserSession?.getCurrency()}{finalAmount.toFixed(2)}</span>
                                </div>
                            ) : null}

                            {order?.payMode === 'UNSETTLED' && !order?.settled && (
                                <div className="mt-2 space-y-1">
                                    {(order?.settledAmount || 0) > 0 && (
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-green-600">Paid:</span>
                                            <span className="text-green-600">{UserSession?.getCurrency()}{Number(order?.settledAmount || 0).toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-orange-600">Due:</span>
                                        <span className="text-orange-600">{UserSession?.getCurrency()}{(Number(finalAmount || 0) - Number(order?.settledAmount || 0)).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}
            </div>

            {/* Action Buttons */}
            <div className="p-4 pt-0">
                <div className="flex gap-3">
                    <button
                        className="flex-1 py-2.5 border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center"
                        onClick={handlePrintKOT}
                    >
                        <i className="ph ph-printer mr-2"></i>
                        {t('printKOT')}
                    </button>
                    <button
                        className="flex-1 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                        onClick={handleCheckout}
                    >
                        <i className="ph ph-credit-card mr-2"></i>
                        {t('checkout')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// CustomerSearch Component
export function CustomerSearch({ isOpen, onClose, onSelectCustomer }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newCustomer, setNewCustomer] = useState({
        name: '',
        phone: ''
    });

    // Search for customers when the search term changes
    useEffect(() => {
        if (!searchTerm || searchTerm.length < 2) {
            setCustomers([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            try {
                setLoading(true);
                setError(null);

                // Search for customers
                const results = await sdk.db.collection("Customers")
                    .where("phone", "==", searchTerm)
                    .limit(10)
                    .get()
                    .then(snapshot => snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })));

                setCustomers(results);
            } catch (err) {
                console.error('Error searching customers:', err);
                setError('Failed to search customers');
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    // Handle selecting a customer
    const handleSelectCustomer = (customer) => {
        onSelectCustomer(customer);
        onClose();
    };

    // Handle creating a new customer
    const handleCreateCustomer = async () => {
        try {
            if (!newCustomer.name || !newCustomer.phone) {
                setError('Please enter both name and phone number');
                return;
            }

            setLoading(true);
            setError(null);

            // Create the customer
            const customerData = {
                ...newCustomer,
                date: new Date(),
                orderCount: 0,
                totalSpent: 0,
                balance: 0
            };

            // Add to Firestore
            const newCustomerRef = sdk.db.collection("Customers").doc();
            await newCustomerRef.set(customerData);

            const customer = {
                id: newCustomerRef.id,
                ...customerData
            };

            // Select the new customer
            handleSelectCustomer(customer);
            // Notify other parts of the app that a customer was added
            try { window.dispatchEvent(new CustomEvent('customerAdded', { detail: customer })); } catch (e) { console.warn('customerAdded dispatch failed', e); }
        } catch (err) {
            console.error('Error creating customer:', err);
            setError('Failed to create customer');
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isOpen ? 'visible' : 'invisible'}`}
            onClick={onClose}
        >
            <div className="fixed inset-0 bg-black bg-opacity-50"></div>
            <div className="bg-section-bg w-full max-w-md rounded-lg shadow-section overflow-hidden relative z-10" onClick={e => e.stopPropagation()}>
                <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold">Select Customer</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <i className="ph ph-x text-xl"></i>
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-2 bg-red-50 text-red-600 rounded">
                            {error}
                        </div>
                    )}

                    {!showAddForm ? (
                        <>
                            <div className="mb-4">
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        placeholder="Search by name or phone"
                                        className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <i className="ph ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                                </div>
                            </div>

                            <div className="max-h-60 overflow-y-auto mb-4">
                                {loading ? (
                                    <div className="p-4 text-center">
                                        <div className="animate-spin inline-block w-6 h-6 border-3 border-primary border-t-transparent rounded-full"></div>
                                    </div>
                                ) : customers.length > 0 ? (
                                    <div className="space-y-2">
                                        {customers.map(customer => (
                                            <div
                                                key={customer.id}
                                                className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                                                onClick={() => handleSelectCustomer(customer)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                        <i className="ph ph-user text-blue-600"></i>
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium">{customer.name}</h4>
                                                        <p className="text-sm text-gray-600">{customer.phone}</p>
                                                    </div>
                                                    {customer.orderCount > 0 && (
                                                        <div className="ml-auto text-right">
                                                            <span className="text-sm text-gray-600">{customer.orderCount} orders</span>
                                                            <p className="text-sm font-medium">{UserSession?.getCurrency()}{customer.totalSpent}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : searchTerm.length >= 2 ? (
                                    <div className="p-4 text-center text-gray-500">
                                        No customers found
                                    </div>
                                ) : (
                                    <div className="p-4 text-center text-gray-500">
                                        Type at least 2 characters to search
                                    </div>
                                )}
                            </div>

                            <button
                                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                onClick={() => setShowAddForm(true)}
                            >
                                Add New Customer
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="space-y-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Name
                                    </label>
                                    <input
                                        type="text"
                                        value={newCustomer.name}
                                        onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter customer name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Phone
                                    </label>
                                    <input
                                        type="tel"
                                        value={newCustomer.phone}
                                        onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter phone number"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                    onClick={() => setShowAddForm(false)}
                                    disabled={loading}
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    onClick={handleCreateCustomer}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <div className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                                    ) : (
                                        'Create Customer'
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ProductFormModal updated with consistent layout and slide-in behavior
export function ProductFormModal({ isOpen, onClose, product = null, refreshProducts }) {
    // Add addons state
    const [formData, setFormData] = useState({
        id: '',
        title: '',
        desc: '',
        cat: 'Food',
        imgs: [],
        price: '',
        mrp: '',
        active: true,
        veg: true,
        stock: 0,
        barcode: '',
        variants: [],
        addons: [], // Add this line for addons
        unitPricing: { enabled: false, unitType: 'Gram', displayUnit: 'gm', pricePerUnit: '' }
    });

    const [recipeItems, setRecipeItems] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [charges, setCharges] = useState([
        { name: 'CGST', value: '2.5%', type: 'percentage', inclusive: true },
        { name: 'SGST', value: '2.5%', type: 'percentage', inclusive: true }
    ]);
    const [categories, setCategories] = useState([
        'Food', 'Beverages', 'Appetizers', 'Main Course', 'Desserts', 'Snacks'
    ]);
    const [previewImage, setPreviewImage] = useState('');
    const [showStockManagement, setShowStockManagement] = useState(false);
    const [deleteConfirmed, setDeleteConfirmed] = useState(false);
    const [customCategory, setCustomCategory] = useState('');
    const modalRef = useRef(null);

    // Detect if mobile
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Handle outside click to dismiss
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (modalRef.current && !modalRef.current.contains(event.target)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                id: product?.id || '',
                title: product?.title || '',
                desc: product?.desc || '',
                cat: product?.cat || 'Food',
                imgs: product?.imgs || [],
                price: product?.price || '',
                mrp: product?.mrp || '',
                active: product?.active !== undefined ? product?.active : true,
                veg: product?.veg !== undefined ? product?.veg : true,
                stock: product?.stock || 0,
                barcode: product?.barcode || '',
                variants: product?.variants || [],
                addons: product?.addons || [], // Add this line for addons
                unitPricing: product?.unitPricing || { enabled: false, unitType: 'Gram', displayUnit: 'gm', pricePerUnit: '' }
            });

            setRecipeItems(product?.recipeList || []);

            // If product has charges, use them; otherwise set default GST rates
            if (product?.charges && product.charges.length > 0) {
                // Convert existing charges to the format expected by the form
                const existingCharges = product.charges.map(c => ({
                    name: c.name,
                    value: c.type === 'percentage' ? `${c.value}%` : String(c.value),
                    type: c.type || (String(c.value || '').includes('%') ? 'percentage' : 'fixed'),
                    inclusive: c.inclusive
                }));

                // Check if we have both CGST and SGST
                const hasCGST = existingCharges.some(c => c.name === 'CGST');
                const hasSGST = existingCharges.some(c => c.name === 'SGST');

                if (hasCGST && hasSGST) {
                    // Use existing charges as-is
                    setCharges(existingCharges);
                } else {
                    // Add standard GST if missing
                    const updatedCharges = [...existingCharges];

                    if (!hasCGST) {
                        updatedCharges.push({ name: 'CGST', value: '2.5%', type: 'percentage', inclusive: true });
                    }

                    if (!hasSGST) {
                        updatedCharges.push({ name: 'SGST', value: '2.5%', type: 'percentage', inclusive: true });
                    }

                    setCharges(updatedCharges);
                }
            } else {
                // Default GST rates for food items (5% total - split as 2.5% CGST and 2.5% SGST)
                setCharges([
                    { name: 'CGST', value: '2.5%', type: 'percentage', inclusive: true },
                    { name: 'SGST', value: '2.5%', type: 'percentage', inclusive: true }
                ]);
            }

            setShowStockManagement(
                product?.inventoryDeductionMode === 'pre-prepared' ||
                (product?.stock !== undefined && product?.inventoryDeductionMode !== 'on-demand')
            );

            // Debug product loading
            if (product) {
                console.log('📊 Product loaded for editing:', {
                    title: product.title,
                    inventoryDeductionMode: product.inventoryDeductionMode,
                    stock: product.stock,
                    showStockManagement: product?.inventoryDeductionMode === 'pre-prepared' ||
                        (product?.stock !== undefined && product?.inventoryDeductionMode !== 'on-demand')
                });
            }
            setUploading(false);
            setError('');
            setDeleteConfirmed(false);

            if (product?.imgs && product?.imgs.length > 0) {
                setPreviewImage(product.imgs[0]);
            } else {
                setPreviewImage('');
            }
        }
    }, [isOpen, product]);

    // Fetch categories from existing products
    useEffect(() => {
        async function fetchCategories() {
            try {
                const snapshot = await sdk.db.collection("Product").get();
                // Start with default categories plus popular food categories
                const cats = new Set([
                    'Appetizers', 'Main Course', 'Breakfast', 'Desserts', 'Beverages',
                    'Soups', 'Salads', 'Rice', 'Noodles', 'Pizza', 'Burgers', 'Sandwiches',
                    'Wraps', 'Pasta', 'Biryani', 'Snacks', 'Combos', 'Thalis'
                ]);

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.cat) {
                        cats.add(data.cat);
                    }
                });

                setCategories(Array.from(cats).sort());
            } catch (error) {
                console.error("Error fetching categories:", error);
            }
        }

        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    const handleFormChange = (field, value) => {
        setFormData(prevData => ({
            ...prevData,
            [field]: value
        }));
    };

    // Handle input change for text fields
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;

        // Handle different input types
        if (type === 'checkbox') {
            handleFormChange(name, checked);
        } else if (name === 'cat' && value === '__custom__') {
            // When user selects "__custom__", set the form data to "__custom__"
            handleFormChange(name, '__custom__');
        } else {
            handleFormChange(name, value);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);
            setError(null);

            // Preview image immediately for better UX
            const reader = new FileReader();
            reader.onload = async (e) => {
                const result = e.target.result;
                setPreviewImage(result);

                try {
                    // Generate a temporary ID if this is a new product
                    const productId = formData.id || `temp_${Date.now()}`;

                    // Create a unique filename with timestamp to avoid conflicts
                    const timestamp = Date.now();
                    const fileName = `main_${timestamp}.jpg`;
                    const filePath = `products/${productId}/${fileName}`;

                    // Upload the file to Firebase Storage
                    await sdk.storage.uploadFile(filePath, file);

                    // Get the download URL
                    const imageUrl = await sdk.storage.getDownloadURL(filePath);

                    // Update form data with the new image URL
                    setFormData(prev => ({
                        ...prev,
                        imgs: [...prev.imgs, imageUrl]
                    }));

                    setUploading(false);
                    showToast('Image uploaded successfully', 'success');
                } catch (error) {
                    console.error('Error uploading image:', error);
                    setError('Failed to upload image to storage');
                    setUploading(false);
                }
            };

            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Error uploading image:', error);
            setError('Failed to upload image');
            setUploading(false);
        }
    };

    const handleBarcodeScanner = async () => {
        // In a real implementation, you would integrate with a barcode scanner library
        // For this example, we'll simulate a scanned barcode
        try {
            // Simulate a barcode scanning delay
            const simulatedBarcode = "PROD" + Math.floor(1000000 + Math.random() * 9000000);

            setFormData(prev => ({
                ...prev,
                barcode: simulatedBarcode
            }));

            showToast("Barcode scanned successfully");
        } catch (error) {
            setError('Failed to scan barcode');
        }
    };

    const updateCharge = (index, updatedCharge) => {
        console.log("Updating charge at index", index, "with", updatedCharge);
        const updatedCharges = [...charges];

        if (index < updatedCharges.length) {
            updatedCharges[index] = updatedCharge;
        } else {
            updatedCharges.push(updatedCharge);
        }

        // Only filter charges when actually saving the form, not during editing
        // This allows users to work with empty or zero-value charges during editing
        setCharges(updatedCharges);

        console.log("Updated charges:", updatedCharges);
    };

    const removeImage = async (index) => {
        try {
            // Get the image URL that's being removed
            const imageToRemove = formData.imgs[index];

            // If it's a Firebase Storage URL, try to delete the file
            if (imageToRemove && imageToRemove.includes('firebasestorage.googleapis.com')) {
                // Extract the path from the URL
                const urlParts = imageToRemove.split('/o/')[1];
                if (urlParts) {
                    const path = decodeURIComponent(urlParts.split('?')[0]);
                    try {
                        await sdk.storage.deleteFile(path);
                        showToast('Image deleted from storage', 'success');
                    } catch (deleteError) {
                        console.warn('Could not delete image from storage:', deleteError);
                        // Continue with UI update even if delete fails
                    }
                }
            }

            // Update the form data
            setFormData(prev => {
                const updatedImgs = [...prev.imgs];
                updatedImgs.splice(index, 1);
                return { ...prev, imgs: updatedImgs };
            });

            // Update preview image
            if (index === 0 && formData.imgs.length > 1) {
                setPreviewImage(formData.imgs[1]);
            } else if (formData.imgs.length <= 1) {
                setPreviewImage('');
            }
        } catch (error) {
            console.error('Error removing image:', error);
            showToast('Failed to remove image', 'error');
        }
    };

    // Function to deduct inventory for recipe items - IMPLEMENTS CORRECT QUANTITY DEDUCTION
    const deductInventoryForRecipe = async (recipeItems, currentStock) => {
        console.log('Starting recipe inventory deduction with validation...');

        // Validate SDK availability
        if (!sdk || !sdk.db || !sdk.db.collection) {
            return { success: false, message: 'Database SDK not properly initialized. Please refresh the page and try again.' };
        }

        // If no recipe items or no stock, do nothing
        if (!recipeItems || recipeItems.length === 0 || !currentStock || currentStock <= 0) {
            console.log('No recipe items or stock to process');
            return { success: true };
        }

        // Prepare deductions for validation
        const deductions = recipeItems
            .filter(item => item && item.name && item.quantity && item.quantity > 0)
            .map(recipeItem => ({
                itemName: recipeItem.name.trim(),
                quantity: (Number(recipeItem.quantity) || 0) * (Number(currentStock) || 1),
                reason: `Recipe deduction for product save (stock: ${currentStock})`
            }));

        if (deductions.length === 0) {
            console.log('No valid recipe items to process');
            return { success: true };
        }

        try {
            // Use safe bulk deduction with validation
            const result = await safeBulkStockDeduction(deductions);

            // Check if the result has the expected structure
            if (!result) {
                return { success: false, message: 'Failed to deduct recipe items from inventory. Please check your inventory levels.' };
            }

            if (result.success) {
                // Log successful deductions
                if (result.results && Array.isArray(result.results)) {
                    result.results.forEach(res => {
                        if (res.success) {
                            console.log(`Successfully deducted ${res.requested} units of ${res.item}. New stock: ${res.newQuantity}`);
                        }
                    });
                }

                console.log('Recipe inventory deduction completed successfully');
                return { success: true };
            } else {
                console.error('Recipe inventory deduction failed:', result.message || result);

                // Create user-friendly error message with specific details
                let userFriendlyMessage = 'Failed to deduct recipe items from inventory. Please check your inventory levels.';

                // Handle different result structures
                if (result.message && typeof result.message === 'string') {
                    userFriendlyMessage = result.message;
                } else if (result.results && Array.isArray(result.results)) {
                    const failureMessages = result.results
                        .filter(res => !res.success)
                        .map(res => {
                            // Handle different result item structures
                            if (res.message) {
                                return res.message;
                            } else if (res.item) {
                                return `"${res.item}": Available: ${res.currentStock || res.newQuantity || 0}, Required: ${res.requestedQuantity || res.requested || 0}`;
                            } else {
                                return 'Unknown item';
                            }
                        });

                    if (failureMessages.length > 0) {
                        userFriendlyMessage = "Sorry, inventory is low for the following items:\n" +
                            failureMessages.join("\n") + "\n\nPlease restock inventory first.";
                    }
                }

                return { success: false, message: userFriendlyMessage };
            }

        } catch (error) {
            console.error('Error in recipe inventory deduction:', error);
            // Provide a more user-friendly error message
            let errorMessage = 'An unexpected error occurred while deducting recipe inventory.';

            if (error && error.message) {
                errorMessage = error.message;
            }

            if (errorMessage.includes('not found')) {
                errorMessage = 'Sorry, some recipe ingredients are not available in your inventory. Please stock them first.';
            } else if (errorMessage.includes('Insufficient stock')) {
                errorMessage = 'Sorry, inventory is low. Please stock the required ingredients first.';
            }

            return { success: false, message: errorMessage };
        }
    };

    // Handle form submission - COMPLETELY REWRITTEN FOR ERROR-FREE OPERATION
    const handleSubmit = async () => {
        // Clear any previous errors
        setError('');

        // Basic validation
        if (!formData.title?.trim()) {
            setError('Product title is required.');
            return;
        }

        if (!formData.price || isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
            setError('Please enter a valid selling price.');
            return;
        }

        if (!formData.mrp || isNaN(Number(formData.mrp)) || Number(formData.mrp) <= 0) {
            setError('Please enter a valid MRP.');
            return;
        }

        if (!formData.cat) {
            setError('Please select a category.');
            return;
        }

        // Validate addons if they exist
        if (formData.addons && Array.isArray(formData.addons)) {
            for (const addon of formData.addons) {
                if (addon?.name?.trim() && (isNaN(Number(addon.price)) || Number(addon.price) < 0)) {
                    setError('Please enter valid prices for all add-ons.');
                    return;
                }
            }
        }

        setUploading(true);
        // Check if stock management is enabled and recipe items exist
        if (showStockManagement && recipeItems && recipeItems.length > 0) {
            try {
                console.log('Pre-prepared product: Attempting to deduct inventory for recipe items:', recipeItems);
                console.log('Current stock value:', formData.stock);

                // Validate recipe items before processing
                const validRecipeItems = recipeItems.filter(item =>
                    item && item.name && item.quantity && item.quantity > 0
                );

                if (validRecipeItems.length === 0) {
                    console.warn('No valid recipe items found for inventory deduction');
                } else {
                    const deductionResult = await deductInventoryForRecipe(validRecipeItems, formData.stock || 1);
                    if (!deductionResult.success) {
                        // Handle the error case
                        let userFriendlyMessage = 'Failed to deduct inventory for recipe items';
                        let shouldBlockSave = true;

                        if (deductionResult.message.includes('not found') || deductionResult.message.includes('Not found')) {
                            userFriendlyMessage = 'Some recipe ingredients are not available in your inventory. The product will be saved, but inventory was not deducted.';
                            shouldBlockSave = false; // Allow saving product even if ingredients are missing
                        } else if (deductionResult.message.includes('Insufficient stock')) {
                            userFriendlyMessage = 'Insufficient stock for some recipe ingredients. Please check your inventory levels.';
                        } else if (deductionResult.message.includes('SDK not properly initialized')) {
                            userFriendlyMessage = 'Database connection issue. Please refresh the page and try again.';
                        } else if (deductionResult.message) {
                            userFriendlyMessage = deductionResult.message;
                        }

                        // Show warning but continue if it's just missing ingredients
                        if (!shouldBlockSave) {
                            console.warn('Inventory deduction failed but continuing with product save:', userFriendlyMessage);
                            showToast(userFriendlyMessage, 'warning');
                        } else {
                            setError(`Recipe Management: ${userFriendlyMessage}`);
                            setUploading(false);
                            return;
                        }
                    } else {
                        console.log('Inventory deduction completed successfully for pre-prepared product');
                    }
                }
            } catch (inventoryError) {
                console.error('Error deducting inventory:', inventoryError);
                console.error('Inventory error details:', inventoryError.message);

                // Provide more user-friendly error messages
                let userFriendlyMessage = 'Failed to deduct inventory for recipe items';
                let shouldBlockSave = true;

                if (inventoryError.message.includes('not found') || inventoryError.message.includes('Not found')) {
                    userFriendlyMessage = 'Some recipe ingredients are not available in your inventory. The product will be saved, but inventory was not deducted.';
                    shouldBlockSave = false; // Allow saving product even if ingredients are missing
                } else if (inventoryError.message.includes('Insufficient stock')) {
                    userFriendlyMessage = 'Insufficient stock for some recipe ingredients. Please check your inventory levels.';
                } else if (inventoryError.message.includes('SDK not properly initialized')) {
                    userFriendlyMessage = 'Database connection issue. Please refresh the page and try again.';
                } else if (inventoryError.message) {
                    userFriendlyMessage = inventoryError.message;
                }

                // Show warning but continue if it's just missing ingredients
                if (!shouldBlockSave) {
                    console.warn('Inventory deduction failed but continuing with product save:', userFriendlyMessage);
                    showToast(userFriendlyMessage, 'warning');
                } else {
                    setError(`Recipe Management: ${userFriendlyMessage}`);
                    setUploading(false);
                    return;
                }
            }
        } else if (!showStockManagement && recipeItems && recipeItems.length > 0) {
            console.log('On-demand product: Recipe items will be deducted at checkout, not during product save');
        }


        try {
            // Basic SDK validation
            if (!sdk?.db?.collection) {
                throw new Error('Database connection not available. Please refresh the page.');
            }

            // Prepare clean product data
            const productData = {
                title: formData.title.trim(),
                desc: (formData.desc || '').trim(),
                cat: formData.cat,
                price: Number(formData.price),
                mrp: Number(formData.mrp),
                active: Boolean(formData.active),
                veg: Boolean(formData.veg),
                imgs: Array.isArray(formData.imgs) ? formData.imgs : [],
                barcode: (formData.barcode || '').trim(),

                // Price variants
                variants: Array.isArray(formData.variants)
                    ? formData.variants
                        .filter(v => v?.name?.trim())
                        .map(variant => ({
                            id: variant.id || `variant_${Date.now()}_${Math.random()}`,
                            name: variant.name.trim(),
                            price: Number(variant.price) || 0,
                            isDefault: Boolean(variant.isDefault)
                        }))
                    : [],

                // Addons
                addons: Array.isArray(formData.addons)
                    ? formData.addons
                        .filter(addon => addon?.name?.trim())
                        .map(addon => ({
                            id: addon.id || `addon_${Date.now()}_${Math.random()}`,
                            name: addon.name.trim(),
                            price: Number(addon.price) || 0,
                            inStock: Boolean(addon.inStock)
                        }))
                    : [],

                // Charges (taxes)
                charges: Array.isArray(charges)
                    ? charges
                        .filter(charge => charge?.name?.trim())
                        .map(charge => {
                            const value = String(charge.value || '').replace('%', '');
                            const numValue = Number(value);
                            return {
                                name: charge.name.trim(),
                                value: isNaN(numValue) ? 0 : numValue,
                                type: String(charge.value || '').includes('%') ? 'percentage' : 'fixed',
                                inclusive: Boolean(charge.inclusive)
                            };
                        })
                    : [],

                // Recipe items
                recipe: Array.isArray(recipeItems)
                    ? recipeItems
                        .filter(item => item?.name?.trim())
                        .map(item => ({
                            id: item.id || `recipe_${Date.now()}_${Math.random()}`,
                            name: item.name.trim(),
                            quantity: Number(item.quantity) || 0,
                            unit: item.unit || ''
                        }))
                    : [],

                // Unit pricing
                unitPricing: {
                    enabled: Boolean(formData.unitPricing?.enabled),
                    unitType: formData.unitPricing?.unitType || '',
                    displayUnit: formData.unitPricing?.displayUnit || '',
                    pricePerUnit: Number(formData.unitPricing?.pricePerUnit) || 0
                },

                date: new Date(),
                updatedAt: new Date()
            };

            // Add stock management and inventory deduction mode
            if (showStockManagement) {
                productData.stock = Number(formData.stock) || 0;
                productData.inventoryDeductionMode = 'pre-prepared'; // Deduct inventory when saving product
                console.log('✅ Product being saved as PRE-PREPARED mode (inventory deducted when saving)');
            } else {
                productData.inventoryDeductionMode = 'on-demand'; // Deduct inventory at checkout
                console.log('✅ Product being saved as ON-DEMAND mode (inventory deducted at checkout)');
            }

            console.log('📊 Product data being saved:', {
                title: productData.title,
                inventoryDeductionMode: productData.inventoryDeductionMode,
                showStockManagement: showStockManagement
            });

            // Try to add user profile data (optional)
            try {
                if (sdk.profile?.get) {
                    const profileDoc = await sdk.profile.get();
                    const userProfile = profileDoc?.data();
                    if (userProfile) {
                        productData.sellerId = userProfile.uid || '';
                        productData.sellerBusinessName = userProfile.businessName || '';
                        productData.sellerAvatar = userProfile.photoURL || '';
                    }
                }
            } catch (profileError) {
                // Profile error is not critical, continue without it
            }

            // Save the product
            let productId;
            if (product?.id) {
                // Update existing product
                productId = product.id;
                await sdk.db.collection("Product").doc(productId).update(productData);

                // Only show success toast after both inventory deduction and product update succeed
                showToast('Product updated successfully');
            } else {
                // Create new product
                const docRef = await sdk.db.collection("Product").add(productData);
                productId = docRef.id;
                showToast('Product created successfully');
            }

            // Track analytics (optional)
            try {
                if (sdk.analytics?.logEvent) {
                    sdk.analytics.logEvent(product ? 'product_updated' : 'product_created', {
                        product_id: productId,
                        product_name: productData.title,
                        category: productData.cat
                    });
                }
            } catch (analyticsError) {
                // Analytics error is not critical
            }

            // Success - close modal and refresh
            setUploading(false);
            onClose();

            // Refresh products list (multiple approaches)
            try {
                // Try the prop function first
                if (refreshProducts && typeof refreshProducts === 'function') {
                    refreshProducts();
                }
                // Also try the global refresh function
                if (window.refreshProducts && typeof window.refreshProducts === 'function') {
                    window.refreshProducts();
                }
            } catch (refreshError) {
                // Refresh error is not critical
            }

        } catch (error) {
            // Handle any errors
            setUploading(false);

            let errorMessage = 'Failed to save product. Please try again.';
            if (error?.message) {
                errorMessage = error.message;
            } else if (error?.code) {
                errorMessage = `Error: ${error.code}`;
            }

            setError(errorMessage);
        }
    };

    // Handle product deletion
    const handleDelete = async () => {
        // Only allow deletion of existing products
        if (!product || !product.id) {
            setError('Cannot delete a product that has not been saved yet.');
            return;
        }

        // If not confirmed via checkbox, remind user
        if (!deleteConfirmed) {
            setError('Please check the confirmation box before deleting.');
            return;
        }

        // Final confirmation
        if (!confirm(`Are you absolutely sure you want to delete "${product.title}"? This action cannot be undone and the product will be permanently removed from your inventory.`)) {
            return;
        }

        // Proceed with deletion
        try {
            setUploading(true);
            setError('');

            // First delete all product images from storage if they exist
            if (formData.imgs && formData.imgs.length > 0) {
                try {
                    const files = await sdk.storage.listFiles(`products/${product.id}`);

                    // Delete each file
                    for (const item of files.items) {
                        try {
                            await sdk.storage.deleteFile(item.fullPath);
                            console.log(`Deleted image: ${item.fullPath}`);
                        } catch (deleteError) {
                            console.warn(`Could not delete image: ${item.fullPath}`, deleteError);
                            // Continue with deletion of other files
                        }
                    }
                } catch (listError) {
                    console.warn('Could not list images for deletion:', listError);
                    // Continue with document deletion regardless
                }
            }

            // Then delete the product document
            await sdk.db.collection("Product").doc(product.id).delete();

            // Track product deletion with analytics
            if (sdk.analytics) {
                sdk.analytics.logEvent('product_deleted', {
                    product_id: product.id,
                    product_name: product.title,
                    category: product.category || 'uncategorized'
                });
            }

            showToast('Product deleted successfully');
            setUploading(false);
            onClose();

            // Refresh products list if the function exists
            if (refreshProducts && typeof refreshProducts === 'function') {
                refreshProducts();
            }
        } catch (error) {
            console.error('Error deleting product:', error);
            setError('Failed to delete product. Please try again.');
            setUploading(false);
        }
    };

    // Handle addon operations
    const handleAddAddon = () => {
        setFormData(prev => ({
            ...prev,
            addons: [...prev.addons, {
                id: Date.now().toString(),
                name: '',
                price: '',
                inStock: true
            }]
        }));
    };

    const handleUpdateAddon = (index, field, value) => {
        setFormData(prev => {
            const newAddons = [...prev.addons];
            newAddons[index] = {
                ...newAddons[index],
                [field]: field === 'price' ? (value === '' ? '' : Number(value)) : value
            };
            return {
                ...prev,
                addons: newAddons
            };
        });
    };

    const handleRemoveAddon = (index) => {
        setFormData(prev => ({
            ...prev,
            addons: prev.addons.filter((_, i) => i !== index)
        }));
    };

    if (!isOpen) return null;

    // Get modal classes based on device type
    const modalClasses = isMobile
        ? "fixed inset-x-0 bottom-0 z-50 rounded-t-xl bg-white shadow-xl animate-slideUp max-h-[90vh] overflow-auto"
        : "fixed top-0 right-0 bottom-0 z-50 bg-white shadow-xl animate-slideInRight w-full max-w-2xl overflow-auto";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-end md:items-center justify-end transition-opacity">
            <div ref={modalRef} className={modalClasses}>
                {/* Mobile drag handle - only show on mobile */}
                {isMobile && (
                    <div className="flex justify-center pt-2 pb-1">
                        <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
                    </div>
                )}

                {/* Header */}
                <div className="sticky top-0 z-10 px-4 py-3 bg-red-50 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {product ? window.LanguageContext?.t('editProduct') : window.LanguageContext?.t('addNewProduct')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-red-100 transition-colors"
                    >
                        <i className="ph ph-x text-gray-600 text-lg"></i>
                    </button>
                </div>

                {/* Form Content - Scrollable */}
                <div className="p-4 overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
                            {error}
                        </div>
                    )}

                    <form className="space-y-5">
                        {/* Product Image Upload */}
                        <div>
                            <div className="mb-1 flex justify-between items-center">
                                <label className="block text-sm font-medium text-gray-700">
                                    {window.LanguageContext?.t('productImages')}
                                </label>
                                <label className="cursor-pointer inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors">
                                    <i className="ph ph-plus mr-1"></i>
                                    <span>{uploading ? window.LanguageContext?.t('uploading') + '...' : window.LanguageContext?.t('addImage')}</span>
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        accept="image/*"
                                        disabled={uploading}
                                    />
                                </label>
                            </div>

                            {formData.imgs.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2 mt-2 mb-2">
                                    {formData.imgs.map((img, index) => (
                                        <div key={index} className="relative rounded-lg border border-gray-200 overflow-hidden aspect-square">
                                            <img
                                                src={img}
                                                alt={`Product ${index + 1}`}
                                                className="w-full h-full object-cover"
                                                onClick={() => setPreviewImage(img)}
                                            />
                                            {img === previewImage && (
                                                <div className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center">
                                                    <span className="px-2 py-1 bg-red-500 text-white text-xs rounded">Main</span>
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => removeImage(index)}
                                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"
                                            >
                                                <i className="ph ph-x text-sm"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                                    <div className="flex flex-col items-center justify-center py-6">
                                        <i className="ph ph-image text-4xl text-gray-400 mb-2"></i>
                                        <p className="text-gray-500">{window.LanguageContext?.t('noProductImages')}</p>
                                        <p className="text-xs text-gray-400 mt-1">{window.LanguageContext?.t('clickAddImageToUpload')}</p>
                                    </div>
                                </div>
                            )}

                            {previewImage && (
                                <div className="mt-3 bg-gray-50 p-3 rounded-lg">
                                    <div className="text-sm font-medium text-gray-700 mb-2">{window.LanguageContext?.t('previewImage')}</div>
                                    <img
                                        src={previewImage}
                                        alt="Product preview"
                                        className="mx-auto max-h-48 object-contain"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Category Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {window.LanguageContext?.t('category')} <span className="text-red-500">*</span>
                            </label>
                            <select
                                name="cat"
                                value={formData.cat === '__custom__' ? '__custom__' : formData.cat}
                                onChange={handleChange}
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                disabled={formData.cat === '__custom__'}
                            >
                                {categories.map((category, index) => (
                                    <option key={index} value={category}>
                                        {category}
                                    </option>
                                ))}
                                {formData.cat === '__custom__' && (
                                    <option value="__custom__">Custom</option>
                                )}
                            </select>
                        </div>

                        {/* Custom Category Option */}
                        <div className="flex items-center mt-2">
                            <input
                                type="radio"
                                id="customCategoryRadio"
                                name="categoryType"
                                checked={formData.cat === '__custom__'}
                                onChange={() => {
                                    setFormData(prev => ({
                                        ...prev,
                                        cat: '__custom__'
                                    }));
                                }}
                                className="h-4 w-4 text-red-500 focus:ring-red-500 border-gray-300"
                            />
                            <label htmlFor="customCategoryRadio" className="ml-2 block text-sm text-gray-700">
                                Add Custom Category
                            </label>
                        </div>

                        {/* Custom Category Input - shown when custom category is selected */}
                        {formData.cat === '__custom__' && (
                            <div className="mt-3">
                                <input
                                    type="text"
                                    value={customCategory}
                                    onChange={(e) => setCustomCategory(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    placeholder="Enter custom category name"
                                />
                                <div className="flex gap-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (customCategory.trim()) {
                                                // Update form data with custom category
                                                setFormData(prev => ({
                                                    ...prev,
                                                    cat: customCategory.trim()
                                                }));
                                                // Add to categories list if it doesn't exist
                                                if (!categories.includes(customCategory.trim())) {
                                                    setCategories(prev => [...prev, customCategory.trim()]);
                                                }
                                                // Reset custom category input
                                                setCustomCategory('');
                                            }
                                        }}
                                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                                    >
                                        Save Category
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Reset to previous category or default
                                            setFormData(prev => ({
                                                ...prev,
                                                cat: categories[0] || 'Food'
                                            }));
                                            setCustomCategory('');
                                        }}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Product Title */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {window.LanguageContext?.t('productTitle')} <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                placeholder={window.LanguageContext?.t('enterItemName')}
                            />
                        </div>

                        {/* Barcode */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {window.LanguageContext?.t('barcodeID')}
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    name="barcode"
                                    value={formData.barcode}
                                    onChange={handleChange}
                                    className="w-full p-2.5 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    placeholder={window.LanguageContext?.t('enterBarcode')}
                                />
                                <button
                                    type="button"
                                    onClick={handleBarcodeScanner}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-red-500"
                                >
                                    <i className="ph ph-barcode text-xl"></i>
                                </button>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {window.LanguageContext?.t('description')}
                            </label>
                            <textarea
                                name="desc"
                                value={formData.desc}
                                onChange={handleChange}
                                className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                placeholder={window.LanguageContext?.t('enterProductDescription')}
                                rows="3"
                            ></textarea>
                            <div className="mt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        // Generate product description based on product details
                                        const productName = formData.title || '';
                                        const category = formData.cat || '';
                                        const price = formData.price || '';

                                        if (!productName) {
                                            showToast('Please enter a product name first', 'error');
                                            return;
                                        }

                                        try {
                                            // Show loading state
                                            setUploading(true);

                                            // Generate a description based on product details
                                            // In a real implementation, this could call an AI service
                                            // For now, we'll generate a simple template-based description
                                            let generatedDesc = '';

                                            if (category.toLowerCase().includes('food') || category.toLowerCase().includes('beverage')) {
                                                generatedDesc = `Delicious ${productName} served fresh. `;
                                                if (price) {
                                                    generatedDesc += `Priced at ${UserSession?.getCurrency() || '₹'}${price}. `;
                                                }
                                                generatedDesc += `A perfect choice for food lovers!`;
                                            } else if (category.toLowerCase().includes('appetizer')) {
                                                generatedDesc = `Start your meal with our delicious ${productName}. `;
                                                if (price) {
                                                    generatedDesc += `Only ${UserSession?.getCurrency() || '₹'}${price}. `;
                                                }
                                                generatedDesc += `Freshly prepared and served hot.`;
                                            } else {
                                                generatedDesc = `High-quality ${productName} in the ${category} category. `;
                                                if (price) {
                                                    generatedDesc += `Available for ${UserSession?.getCurrency() || '₹'}${price}. `;
                                                }
                                                generatedDesc += `Perfect for your needs.`;
                                            }

                                            // Update form data with generated description
                                            setFormData(prev => ({
                                                ...prev,
                                                desc: generatedDesc
                                            }));

                                            showToast('Description generated successfully', 'success');
                                        } catch (error) {
                                            console.error('Error generating description:', error);
                                            showToast('Failed to generate description', 'error');
                                        } finally {
                                            setUploading(false);
                                        }
                                    }}
                                    disabled={uploading}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {uploading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            <span>Generating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <i className="ph ph-sparkle text-lg"></i>
                                            <span>Generate Description</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Pricing Section */}
                        <div>
                            <h3 className="text-md font-medium text-gray-700 mb-3">{window.LanguageContext?.t('pricing')}</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {/* MRP */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {window.LanguageContext?.t('mrp')} ({UserSession?.getCurrency()}) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-gray-500 sm:text-sm">{UserSession?.getCurrency()}</span>
                                        </div>
                                        <input
                                            type="text"
                                            name="mrp"
                                            value={formData.mrp}
                                            onChange={handleChange}
                                            className="w-full pl-8 p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                {/* Selling Price */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {window.LanguageContext?.t('sellingPrice')} ({UserSession?.getCurrency()}) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-gray-500 sm:text-sm">{UserSession?.getCurrency()}</span>
                                        </div>
                                        <input
                                            type="text"
                                            name="price"
                                            value={formData.price}
                                            onChange={handleChange}
                                            className="w-full pl-8 p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Unit Pricing */}
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="text-sm font-medium text-gray-800 flex items-center">
                                            <i className="ph ph-scales mr-2"></i>
                                            {window.LanguageContext?.t('unitPricing')}
                                        </div>
                                        <div className="text-2xs text-gray-500 mt-0.5">{window.LanguageContext?.t('perGramKgPricing')}</div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(formData.unitPricing?.enabled)}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                unitPricing: {
                                                    ...(prev.unitPricing || {}),
                                                    enabled: e.target.checked,
                                                    // Set sensible defaults when enabling, preserve existing values otherwise
                                                    unitType: e.target.checked ? (prev.unitPricing?.unitType || 'Gram') : (prev.unitPricing?.unitType || ''),
                                                    displayUnit: e.target.checked ? (prev.unitPricing?.displayUnit || 'gm') : (prev.unitPricing?.displayUnit || ''),
                                                }
                                            }))}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-red-500 after:content-[''] after:absolute after:w-5 after:h-5 after:bg-white after:rounded-full after:top-[2px] after:left-[2px] after:transition-all peer-checked:after:translate-x-full"></div>
                                    </label>
                                </div>

                                {formData.unitPricing?.enabled && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">{window.LanguageContext?.t('unitType')}</label>
                                            <select
                                                value={formData.unitPricing?.unitType || ''}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    unitPricing: { ...(prev.unitPricing || {}), unitType: e.target.value }
                                                }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                            >
                                                <option value="">{window.LanguageContext?.t('selectUnit')}</option>
                                                <option value="Gram">{window.LanguageContext?.t('gram')}</option>
                                                <option value="Kilogram">{window.LanguageContext?.t('kilogram')}</option>
                                                <option value="ML">{window.LanguageContext?.t('ml')}</option>
                                                <option value="Litre">{window.LanguageContext?.t('litre')}</option>
                                                <option value="Unit">{window.LanguageContext?.t('unit')}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">{window.LanguageContext?.t('displayUnit')}</label>
                                            <input
                                                type="text"
                                                placeholder={window.LanguageContext?.t('eg') + ' gm / kg / ml / L / pc'}
                                                value={formData.unitPricing?.displayUnit || ''}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    unitPricing: { ...(prev.unitPricing || {}), displayUnit: e.target.value }
                                                }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                            />
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">{window.LanguageContext?.t('pricePerUnit')} {formData.unitPricing?.displayUnit || 'gm'}</label>
                                            <div className="mt-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.unitPricing?.pricePerUnit ?? ''}
                                                    onChange={(e) => setFormData(prev => ({
                                                        ...prev,
                                                        unitPricing: {
                                                            ...(prev.unitPricing || {}),
                                                            // Allow empty string so users can clear the field before typing
                                                            pricePerUnit: e.target.value === '' ? '' : e.target.value
                                                        }
                                                    }))}
                                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>

                                        <div className="col-span-2 mt-1 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                            {window.LanguageContext?.t('whenUnitPricingEnabled')}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Price Calculation Display */}
                            {formData.mrp && formData.price && (
                                <div className="flex items-center mt-2 text-sm">
                                    <span className="mr-2">{window.LanguageContext?.t('price')}:</span>
                                    {Number(formData.mrp) > Number(formData.price) && (
                                        <span className="line-through text-gray-500 mr-2">{UserSession?.getCurrency()}{formData.mrp}</span>
                                    )}
                                    <span className="font-medium">{UserSession?.getCurrency()}{formData.price}</span>
                                    {Number(formData.mrp) > Number(formData.price) && (
                                        <span className="ml-2 text-green-600">
                                            ({Math.round(((Number(formData.mrp) - Number(formData.price)) / Number(formData.mrp)) * 100)}% OFF)
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Price Variants */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="text-sm font-medium text-gray-700">{window.LanguageContext?.t('additionalPriceVariants')}</h3>
                            </div>
                            <PriceVariants
                                variants={formData.variants || []}
                                setVariants={(variants) => handleFormChange('variants', variants)}
                            />
                        </div>

                        {/* Add-ons Section */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-medium text-gray-700">{window.LanguageContext?.t('addOns')}</h3>
                                <button
                                    type="button"
                                    onClick={handleAddAddon}
                                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                                >
                                    <i className="ph ph-plus mr-1"></i>
                                    {window.LanguageContext?.t('addOption')}
                                </button>
                            </div>

                            {formData.addons.length === 0 ? (
                                <div className="text-center py-4 bg-gray-50 rounded-lg">
                                    <i className="ph ph-puzzle-piece text-2xl text-gray-400"></i>
                                    <p className="text-sm text-gray-500 mt-1">{window.LanguageContext?.t('noAddonsAdded')}</p>
                                    <p className="text-xs text-gray-400">{window.LanguageContext?.t('addOptionsLike')}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {formData.addons.map((addon, index) => (
                                        <div key={addon.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={addon.name}
                                                    onChange={(e) => handleUpdateAddon(index, 'name', e.target.value)}
                                                    placeholder={window.LanguageContext?.t('addOnName')}
                                                    className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                        <span className="text-gray-500 sm:text-sm">{UserSession?.getCurrency()}</span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        value={addon.price}
                                                        onChange={(e) => handleUpdateAddon(index, 'price', e.target.value)}
                                                        placeholder="0"
                                                        className="w-full pl-7 p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateAddon(index, 'inStock', !addon.inStock)}
                                                    className={`p-2 rounded-lg transition-colors ${addon.inStock ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                                                    title={addon.inStock ? window.LanguageContext?.t('inStock') : window.LanguageContext?.t('outOfStock')}
                                                >
                                                    <i className="ph ph-check"></i>
                                                </button>
                                            </div>
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveAddon(index)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <i className="ph ph-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Veg/Non-veg Toggle */}
                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                            <div className="flex items-center space-x-2">
                                <div className={`h-6 w-6 border-2 p-0.5 ${formData.veg ? 'border-green-500' : 'border-red-500'}`}>
                                    <div className={`h-full w-full rounded-sm ${formData.veg ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                                <span className="text-sm font-medium text-gray-800">
                                    {formData.veg ? window.LanguageContext?.t('vegetarian') : window.LanguageContext?.t('nonVegetarian')}
                                </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="veg"
                                    checked={formData.veg}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                            </label>
                        </div>

                        {/* Stock Management Toggle */}
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex items-center mb-2">
                                <input
                                    type="checkbox"
                                    id="enableStock"
                                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                                    checked={showStockManagement}
                                    onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        console.log('🔄 Stock Management checkbox changed:', isChecked ? 'CHECKED (Pre-prepared)' : 'UNCHECKED (On-demand)');
                                        setShowStockManagement(isChecked);
                                        handleFormChange('stock', isChecked ? 0 : undefined);
                                    }}
                                />
                                <label htmlFor="enableStock" className="ml-2 text-sm font-medium text-gray-700">
                                    {window.LanguageContext?.t('enableStockManagement')}
                                </label>
                            </div>

                            <div className="mt-2 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                                <p className="font-medium text-blue-700 mb-2 flex items-center">
                                    <i className="ph ph-info-circle mr-1"></i>
                                    Inventory Deduction Modes:
                                </p>
                                <div className="space-y-2">
                                    <p className="flex items-start">
                                        <i className="ph ph-check-circle text-green-600 mr-2 mt-0.5 text-sm"></i>
                                        <span><strong>Ticked (Pre-prepared):</strong> Items prepared in advance (e.g., Pie) - Inventory deducted when saving product</span>
                                    </p>
                                    <p className="flex items-start">
                                        <i className="ph ph-cooking-pot text-orange-600 mr-2 mt-0.5 text-sm"></i>
                                        <span><strong>Not Ticked (On-demand):</strong> Items made to order (e.g., Biryani) - Inventory deducted at checkout</span>
                                    </p>
                                    <p className="mt-2 text-green-600 flex items-start">
                                        <i className="ph ph-trend-up mr-2 mt-0.5 text-sm"></i>
                                        <span><strong>Benefit:</strong> Better inventory control and accurate stock levels</span>
                                    </p>
                                </div>
                            </div>

                            {showStockManagement && (
                                <div className="mt-2 space-y-4">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-1/2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                {window.LanguageContext?.t('currentStock')}
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.stock}
                                                min="0"
                                                onChange={(e) => handleFormChange('stock', Math.max(0, Number(e.target.value)))}
                                                className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Recipe Items Component - Always show for both modes */}
                            <div className="mt-4">
                                <h5 className="text-sm font-medium text-gray-700 mb-2">Recipe Ingredients</h5>
                                <RecipeItems
                                    items={recipeItems}
                                    setItems={setRecipeItems}
                                />
                            </div>
                        </div>

                        {/* Tax & Charges */}
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-700 mb-3">{window.LanguageContext?.t('taxCharges')}</h4>

                            <div className="mb-3 text-xs text-gray-600 p-2 bg-blue-50 rounded-lg">
                                <p className="font-medium text-blue-700 mb-1">{window.LanguageContext?.t('gstInformation')}</p>
                                <p>• {window.LanguageContext?.t('forFoodItems')}</p>
                                <p>• {window.LanguageContext?.t('forOtherCategories')}</p>
                                <p className="mt-1">
                                    <strong className="text-green-600">{window.LanguageContext?.t('inclusive')}:</strong> {window.LanguageContext?.t('priceAlreadyIncludesTax')}
                                    <span className="block text-xs ml-4 mt-0.5">{window.LanguageContext?.t('eg')} ₹100 {window.LanguageContext?.t('item')} {window.LanguageContext?.t('with')} 5% {window.LanguageContext?.t('inclusive')} {window.LanguageContext?.t('gst')} = ₹95.24 {window.LanguageContext?.t('base')} + ₹4.76 {window.LanguageContext?.t('tax')}</span>
                                    <span className="block text-xs ml-4 mt-0.5 text-green-600">✓ {window.LanguageContext?.t('customerPaysExactly')} ₹100 ({window.LanguageContext?.t('taxIsHidden')})</span>
                                </p>
                                <p className="mt-1">
                                    <strong className="text-red-600">{window.LanguageContext?.t('exclusive')}:</strong> {window.LanguageContext?.t('taxWillBeAdded')}
                                    <span className="block text-xs ml-4 mt-0.5">{window.LanguageContext?.t('eg')} ₹100 {window.LanguageContext?.t('item')} {window.LanguageContext?.t('with')} 5% {window.LanguageContext?.t('exclusive')} {window.LanguageContext?.t('gst')} = ₹100 {window.LanguageContext?.t('base')} + ₹5 {window.LanguageContext?.t('tax')} = ₹105 {window.LanguageContext?.t('total')}</span>
                                    <span className="block text-xs ml-4 mt-0.5 text-red-600">⚠ {window.LanguageContext?.t('customerPays')} ₹105 ({window.LanguageContext?.t('taxIsAddedOnTop')})</span>
                                </p>
                            </div>

                            {charges.map((charge, index) => (
                                <div key={index} className="mb-3 last:mb-0">
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={charge.name}
                                            onChange={(e) => {
                                                const updatedCharge = { ...charge, name: e.target.value };
                                                updateCharge(index, updatedCharge);
                                            }}
                                            placeholder={window.LanguageContext?.t('chargeName')}
                                            className="flex-1 p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                        />
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={String(charge.value).replace('%', '')}
                                                onChange={(e) => {
                                                    const value = e.target.value.replace(/[^0-9.]/g, '');
                                                    const updatedCharge = {
                                                        ...charge,
                                                        value: String(charge.value).includes('%') ? `${value}%` : value
                                                    };
                                                    updateCharge(index, updatedCharge);
                                                }}
                                                placeholder={window.LanguageContext?.t('value')}
                                                className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const isPercentage = String(charge.value).includes('%');
                                                    const value = String(charge.value).replace('%', '');
                                                    const updatedCharge = {
                                                        ...charge,
                                                        value: isPercentage ? value : `${value}%`
                                                    };
                                                    updateCharge(index, updatedCharge);
                                                }}
                                                className={`absolute right-0 top-0 bottom-0 px-3 rounded-r-lg flex items-center justify-center ${String(charge.value).includes('%')
                                                    ? 'bg-red-100 text-red-600'
                                                    : 'bg-green-100 text-green-600'
                                                    }`}
                                            >
                                                {String(charge.value).includes('%') ? '%' : UserSession?.getCurrency()}
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updatedCharges = charges.filter((_, i) => i !== index);
                                                setCharges(updatedCharges);
                                            }}
                                            className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                            title={window.LanguageContext?.t('delete') + ' ' + window.LanguageContext?.t('charge').toLowerCase()}
                                        >
                                            <i className="ph ph-trash"></i>
                                        </button>
                                    </div>
                                    <div className="flex items-center">
                                        <label className="flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={charge.inclusive}
                                                onChange={(e) => {
                                                    const updatedCharge = { ...charge, inclusive: e.target.checked };
                                                    updateCharge(index, updatedCharge);
                                                }}
                                                className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                                            />
                                            <span className="ml-2 text-xs font-medium text-gray-700">{window.LanguageContext?.t('inclusive')}</span>
                                            <span className="ml-1 text-xs text-gray-500">({window.LanguageContext?.t('priceIncludesThisTax')})</span>
                                        </label>
                                    </div>
                                </div>
                            ))}

                            {/* Add new charge */}
                            <div className="flex gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        updateCharge(charges.length, {
                                            name: '',
                                            value: '0%', // Initialize as string with % for consistency
                                            type: 'percentage', // Initialize as percentage type
                                            inclusive: true
                                        });
                                    }}
                                    className="flex-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-2 rounded flex items-center justify-center"
                                >
                                    <i className="ph ph-plus mr-1"></i> {window.LanguageContext?.t('addCustomCharge')}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        // Reset to standard GST rates
                                        setCharges([
                                            { name: 'CGST', value: '2.5%', type: 'percentage', inclusive: true },
                                            { name: 'SGST', value: '2.5%', type: 'percentage', inclusive: true }
                                        ]);
                                    }}
                                    className="flex-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 py-2 px-2 rounded flex items-center justify-center"
                                >
                                    <i className="ph ph-arrows-clockwise mr-1"></i> {window.LanguageContext?.t('resetToStandardGST')}
                                </button>
                            </div>
                        </div>

                        {/* Active Status */}
                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                            <span className="text-sm font-medium text-gray-700">{window.LanguageContext?.t('productStatus')}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="active"
                                    checked={formData.active}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                <span className="ml-2 text-sm font-medium text-gray-700">
                                    {formData.active ? window.LanguageContext?.t('active') : window.LanguageContext?.t('inactive')}
                                </span>
                            </label>
                        </div>
                    </form>
                </div>

                {/* Danger Zone - Only show when editing an existing product */}
                {product && product.id && (
                    <div className="px-4 py-3 bg-red-50 border-t border-b border-red-100">
                        <div className="mb-2">
                            <h3 className="text-sm font-bold text-red-700 flex items-center">
                                <i className="ph ph-warning-circle mr-1.5"></i>
                                {window.LanguageContext?.t('dangerZone')}
                            </h3>
                            <p className="text-xs text-red-600 mt-1">
                                {window.LanguageContext?.t('permanentlyRemove')}
                            </p>
                        </div>

                        <div className="flex items-center mt-3">
                            <input
                                type="checkbox"
                                id="confirm-delete"
                                className="h-4 w-4 text-red-600 border-red-300 rounded mr-2"
                                checked={deleteConfirmed}
                                onChange={(e) => setDeleteConfirmed(e.target.checked)}
                            />
                            <label htmlFor="confirm-delete" className="text-xs text-red-700">
                                {window.LanguageContext?.t('iUnderstand')}
                            </label>
                        </div>

                        <button
                            id="delete-product-btn"
                            type="button"
                            onClick={handleDelete}
                            disabled={!deleteConfirmed || uploading}
                            className="mt-3 px-3 py-1.5 text-xs text-red-700 border border-red-300 bg-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-100 flex items-center"
                        >
                            {uploading ? (
                                <span className="mr-2 h-3 w-3 rounded-full border-2 border-red-700 border-t-transparent animate-spin"></span>
                            ) : (
                                <i className="ph ph-trash mr-1.5"></i>
                            )}
                            {window.LanguageContext?.t('deleteThisProduct')}
                        </button>
                    </div>
                )}

                {/* Form Actions - Sticky Footer */}
                <div className="sticky bottom-0 px-4 py-3 bg-white border-t flex justify-between gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        {window.LanguageContext?.t('cancel')}
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={uploading}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center"
                    >
                        {uploading ? (
                            <>
                                <span className="mr-2 h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                                {product ? window.LanguageContext?.t('updating') : window.LanguageContext?.t('saving')}
                            </>
                        ) : (
                            <>
                                <i className="ph ph-floppy-disk mr-1"></i>
                                {product ? window.LanguageContext?.t('updateProduct') : window.LanguageContext?.t('saveProduct')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Recipe Items Component for the Product Form
export function RecipeItems({ items, setItems }) {
    const [inventoryItems, setInventoryItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch available inventory items when component mounts
    useEffect(() => {
        async function fetchInventoryItems() {
            try {
                setLoading(true);
                const inventorySnapshot = await sdk.db.collection("Inventory")
                    .orderBy("updatedAt", "desc")
                    .limit(100)
                    .get();

                // Process inventory items the same way as in Products.js
                const inventoryList = [];
                for (const doc of inventorySnapshot.docs) {
                    try {
                        const data = doc.data();
                        // Handle date conversions for Firestore Timestamps
                        const processedData = {
                            id: doc.id,
                            name: data.name || '',
                            quantity: Number(data.quantity || 0),
                            unit: data.unit || '',
                            minQuantity: Number(data.minQuantity || 0),
                            date: data.date?.toDate ? data.date.toDate() : new Date(),
                            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
                            lastUpdated: data.lastUpdated || (data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString())
                        };

                        const item = new InventoryItem(processedData);
                        if (item) {
                            inventoryList.push(item);
                        }
                    } catch (error) {
                        console.error(`Error creating inventory item from doc ${doc.id}:`, error);
                        // Continue with other inventory items
                    }
                }

                // Filter out duplicates based on name (just to be extra safe)
                const uniqueItems = [];
                const nameSet = new Set();

                // Log the total number of inventory items before deduplication
                console.log(`Total inventory items before deduplication: ${inventoryList.length}`);

                // Log each inventory item for debugging
                inventoryList.forEach((item, index) => {
                    console.log(`Inventory item ${index}:`, item.name, item.id);
                });

                // For now, use all items without deduplication
                setInventoryItems(inventoryList);

                // Log the final result
                console.log(`Set ${inventoryList.length} inventory items for the recipe dropdown`);

                setLoading(false);
            } catch (error) {
                console.error("Error fetching inventory items:", error);
                setLoading(false);
            }
        }

        fetchInventoryItems();
    }, []);

    const handleAddItem = () => {
        if (inventoryItems.length === 0) {
            showToast('No inventory items available. Please add items to inventory first.', 'error');
            return;
        }

        // Access properties correctly from InventoryItem object
        const firstItem = inventoryItems[0];
        const newItem = {
            id: Date.now().toString(), // Temporary ID for UI purposes
            name: firstItem.name,
            quantity: 1,
            unit: firstItem.unit
        };

        setItems([...items, newItem]);
    };

    const handleUpdateItem = (index, field, value) => {
        const updatedItems = [...items];

        if (field === 'name') {
            // When name changes, update the unit as well
            const selectedItem = inventoryItems.find(item => item.name === value);
            if (selectedItem) {
                updatedItems[index] = {
                    ...updatedItems[index],
                    name: value,
                    unit: selectedItem.unit
                };
            } else {
                updatedItems[index] = {
                    ...updatedItems[index],
                    name: value
                };
            }
        } else if (field === 'quantity') {
            // Ensure quantity is a positive number
            const quantity = Math.max(0, Number(value) || 0);
            updatedItems[index] = {
                ...updatedItems[index],
                quantity
            };
        }

        setItems(updatedItems);
    };

    const handleRemoveItem = (index) => {
        const updatedItems = [...items];
        updatedItems.splice(index, 1);
        setItems(updatedItems);
    };

    if (loading) {
        return (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">{window.LanguageContext?.t('recipeItems')}</h4>
                <div className="flex items-center gap-2">
                    {/* Removed reload button */}
                    <button
                        type="button"
                        onClick={handleAddItem}
                        className="text-xs bg-red-100 text-red-600 py-1 px-2 rounded flex items-center"
                    >
                        <i className="ph ph-plus mr-1"></i> {window.LanguageContext?.t('addItem')}
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <p className="text-sm text-gray-500">{window.LanguageContext?.t('noRecipeItems')}</p>
            ) : (
                <div className="space-y-3">
                    {items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <div className="flex-grow">
                                <select
                                    value={item.name}
                                    onChange={(e) => handleUpdateItem(index, 'name', e.target.value)}
                                    className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                    {inventoryItems.map((invItem) => (
                                        <option key={invItem.id} value={invItem.name}>
                                            {invItem.name} ({invItem.quantity} {invItem.unit})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-28">
                                <div className="flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const currentValue = Number(item.quantity) || 0;
                                            if (currentValue > 0) {
                                                handleUpdateItem(index, 'quantity', currentValue - 1);
                                            }
                                        }}
                                        className="p-2 bg-red-500 text-white rounded-l-lg"
                                    >
                                        <i className="ph ph-minus"></i>
                                    </button>
                                    <input
                                        type="text"
                                        value={item.quantity}
                                        onChange={(e) => handleUpdateItem(index, 'quantity', e.target.value)}
                                        className="w-10 p-2 text-center border-y border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const currentValue = Number(item.quantity) || 0;
                                            handleUpdateItem(index, 'quantity', currentValue + 1);
                                        }}
                                        className="p-2 bg-red-500 text-white rounded-r-lg"
                                    >
                                        <i className="ph ph-plus"></i>
                                    </button>
                                </div>
                            </div>
                            <div className="w-16 text-sm text-gray-600 text-center">
                                {item.unit}
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                            >
                                <i className="ph ph-trash"></i>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Price Variants Component for the Product Form
export function PriceVariants({ variants, setVariants }) {
    // Ensure variants is always an array
    const safeVariants = Array.isArray(variants) ? variants : [];

    // Predefined variation types
    const commonVariations = [
        { name: window.LanguageContext?.t('half'), key: 'half', icon: 'ph-circle-half' },
        { name: window.LanguageContext?.t('full'), key: 'full', icon: 'ph-circle' },
        { name: window.LanguageContext?.t('regular'), key: 'regular', icon: 'ph-square' },
        { name: window.LanguageContext?.t('large'), key: 'large', icon: 'ph-square-logo' },
        { name: window.LanguageContext?.t('small'), key: 'small', icon: 'ph-square-half' }
    ];

    const handleAddVariant = (predefinedName = '') => {
        setVariants([
            ...safeVariants,
            {
                id: Date.now().toString(),
                name: predefinedName || '',
                price: '',
                isDefault: safeVariants.length === 0 // First variant is default
            }
        ]);
    };

    const handleUpdateVariant = (index, field, value) => {
        const updatedVariants = [...safeVariants];

        if (field === 'price') {
            // Ensure price is a number
            value = value.replace(/[^0-9]/g, '');
        }

        // If updating isDefault, unset default for all other variants
        if (field === 'isDefault' && value === true) {
            updatedVariants.forEach(variant => variant.isDefault = false);
        }

        updatedVariants[index] = {
            ...updatedVariants[index],
            [field]: value
        };

        setVariants(updatedVariants);
    };

    const handleRemoveVariant = (index) => {
        const updatedVariants = [...safeVariants];
        const removedVariant = updatedVariants[index];

        // If removing the default variant, set the first remaining variant as default
        if (removedVariant.isDefault && updatedVariants.length > 1) {
            const newDefaultIndex = index === 0 ? 1 : 0;
            updatedVariants[newDefaultIndex].isDefault = true;
        }

        updatedVariants.splice(index, 1);
        setVariants(updatedVariants);
    };

    return (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">{window.LanguageContext?.t('priceVariants')}</h4>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleAddVariant()}
                        className="text-xs bg-red-100 text-red-600 py-1 px-2 rounded flex items-center"
                    >
                        <i className="ph ph-plus mr-1"></i> {window.LanguageContext?.t('customVariant')}
                    </button>
                </div>
            </div>

            {/* Quick add common variations */}
            {safeVariants.length === 0 && (
                <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">{window.LanguageContext?.t('quickAddCommonVariations')}:</p>
                    <div className="flex flex-wrap gap-2">
                        {commonVariations.map((variation) => (
                            <button
                                key={variation.name}
                                onClick={() => handleAddVariant(variation.name)}
                                className="inline-flex items-center px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors"
                            >
                                <i className={`ph ${variation.icon} mr-1 text-gray-600`}></i>
                                {variation.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {safeVariants.length === 0 ? (
                <p className="text-sm text-gray-500">{window.LanguageContext?.t('noPriceVariantsAdded')}</p>
            ) : (
                <div className="space-y-3">
                    {safeVariants.map((variant, index) => (
                        <div key={index} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200">
                            <div className="flex-grow">
                                <input
                                    type="text"
                                    placeholder={window.LanguageContext?.t('variantName') + ' (e.g. Half, Full)'}
                                    value={variant.name}
                                    onChange={(e) => handleUpdateVariant(index, 'name', e.target.value)}
                                    className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                            <div className="w-28">
                                <div className="flex items-center">
                                    <span className="p-2 bg-gray-100 border border-gray-300 rounded-l-lg">{UserSession?.getCurrency()}</span>
                                    <input
                                        type="text"
                                        placeholder={window.LanguageContext?.t('price')}
                                        value={variant.price}
                                        onChange={(e) => handleUpdateVariant(index, 'price', e.target.value)}
                                        className="w-full p-2 text-center border-y border-r border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleUpdateVariant(index, 'isDefault', true)}
                                    className={`p-1.5 rounded-lg transition-colors ${variant.isDefault ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:bg-gray-100'}`}
                                    title={variant.isDefault ? window.LanguageContext?.t('defaultVariant') : window.LanguageContext?.t('setAsDefaultVariant')}
                                >
                                    <i className="ph ph-star"></i>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveVariant(index)}
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                                    title={window.LanguageContext?.t('remove') + ' ' + window.LanguageContext?.t('variant').toLowerCase()}
                                >
                                    <i className="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {safeVariants.length > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                    <p className="flex items-center">
                        <i className="ph ph-info mr-1"></i>
                        {window.LanguageContext?.t('clickThe')} <i className="ph ph-star mx-1 text-gray-400"></i> {window.LanguageContext?.t('iconToSetVariantAsDefault')}
                    </p>
                </div>
            )}
        </div>
    );
}

// Context Menu Component
export function ContextMenu() {
    return (
        <div className="relative" ref={menuRef}>
            <button
                className="p-2 hover:bg-gray-100 rounded-full"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
                <i className="ph ph-dots-three-vertical text-xl"></i>
            </button>
            {isMenuOpen && renderContextMenu()}
        </div>
    );
}

export const renderContextMenu = () => {
    return (
        <div
            ref={menuRef}
            className="absolute right-0 top-12 w-52 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50"
        >
            <div className="py-1">
                {/* Removed printer management/disconnect button */}
                <button
                    className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                    onClick={() => {
                        setIsMenuOpen(false);
                        handleShowQR();
                    }}
                >
                    <i className="ph ph-qr-code text-red-500"></i>
                    <span>Show QR Code</span>
                </button>

                <button
                    className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                    onClick={() => {
                        if (confirm(`Are you sure you want to delete all orders for ${tableId || variant}?`)) {
                            confirmDelete();
                        }
                        setIsMenuOpen(false);
                    }}
                >
                    <i className="ph ph-trash text-red-500"></i>
                    <span>Clear All Orders</span>
                </button>

                <button
                    className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                    onClick={() => {
                        setIsMenuOpen(false);
                        showRenameRoomModal(tableId, variant);
                    }}
                >
                    <i className="ph ph-pencil-simple text-red-500"></i>
                    <span>Rename {tableId ? 'Table' : 'Channel'}</span>
                </button>

                {tableId && (
                    <button
                        className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => {
                            if (confirm(`Are you sure you want to delete table ${tableId}?`)) {
                                deleteTable(tableId);
                                handleClose();
                            }
                            setIsMenuOpen(false);
                        }}
                    >
                        <i className="ph ph-trash text-red-500"></i>
                        <span>Delete Table</span>
                    </button>
                )}
            </div>
        </div>
    );
};

// Bulk Edit Modal for products with GST Inclusive/Exclusive toggle
export function BulkEditModal({ isOpen, onClose, selectedProducts = [], refreshProducts }) {
    const [gstMode, setGstMode] = useState('inclusive');
    const [loading, setLoading] = useState(false);

    // Get the current GST rate from existing product charges
    const getCurrentGSTRate = (product) => {
        if (!product.charges || !Array.isArray(product.charges)) return 18; // Default 18%

        const gstCharges = product.charges.filter(charge =>
            charge.name === 'CGST' || charge.name === 'SGST'
        );

        const totalGSTRate = gstCharges.reduce((total, charge) => total + (parseFloat(charge.value) || 0), 0);

        // If no GST charges found, default to 18%
        return totalGSTRate > 0 ? totalGSTRate : 18;
    };

    // Check if product currently has inclusive or exclusive GST
    const getCurrentGSTMode = (product) => {
        if (!product.charges || !Array.isArray(product.charges)) return 'exclusive';

        const gstCharge = product.charges.find(charge =>
            charge.name === 'CGST' || charge.name === 'SGST'
        );

        return gstCharge?.inclusive ? 'inclusive' : 'exclusive';
    };

    // Get initial GST mode based on selected products
    const getInitialGSTMode = () => {
        if (selectedProducts.length === 0) return 'inclusive';

        const modes = selectedProducts.map(getCurrentGSTMode);
        const inclusiveCount = modes.filter(mode => mode === 'inclusive').length;
        const exclusiveCount = modes.filter(mode => mode === 'exclusive').length;

        // Return the most common mode, default to inclusive if tied
        return inclusiveCount >= exclusiveCount ? 'inclusive' : 'exclusive';
    };

    // Reset state when modal opens with different products
    useEffect(() => {
        if (isOpen) {
            setGstMode(getInitialGSTMode());
        }
    }, [isOpen, selectedProducts]);

    const handleBulkUpdate = async () => {
        if (selectedProducts.length === 0) {
            showToast('No products selected for bulk update', 'error');
            return;
        }

        setLoading(true);
        try {
            const batch = sdk.db.firestore.batch();

            selectedProducts.forEach(product => {
                const productRef = sdk.db.collection('Product').doc(product.id);

                const currentMode = getCurrentGSTMode(product);
                const currentGSTRate = getCurrentGSTRate(product);

                // Only update if mode is actually changing
                if (currentMode !== gstMode) {
                    // Calculate correct price based on mode change to maintain customer cost
                    let newPrice = product.price;
                    const gstMultiplier = 1 + (currentGSTRate / 100);

                    if (currentMode === 'inclusive' && gstMode === 'exclusive') {
                        // Converting from inclusive to exclusive: remove GST from price
                        // Customer cost stays same: if price was ₹118 inclusive, make it ₹100 exclusive
                        newPrice = product.price / gstMultiplier;
                    } else if (currentMode === 'exclusive' && gstMode === 'inclusive') {
                        // Converting from exclusive to inclusive: add GST to price  
                        // Customer cost stays same: if price was ₹100 exclusive, make it ₹118 inclusive
                        newPrice = product.price * gstMultiplier;
                    }

                    // Preserve existing charges array and only update GST charges
                    const updatedCharges = product.charges ? [...product.charges] : [];

                    // Update existing GST charges or add them if they don't exist
                    const cgstIndex = updatedCharges.findIndex(charge => charge.name === 'CGST');
                    const sgstIndex = updatedCharges.findIndex(charge => charge.name === 'SGST');

                    const halfRate = currentGSTRate / 2;
                    const isInclusive = gstMode === 'inclusive';

                    const cgstCharge = {
                        name: 'CGST',
                        type: 'percentage',
                        value: halfRate,
                        inclusive: isInclusive
                    };

                    const sgstCharge = {
                        name: 'SGST',
                        type: 'percentage',
                        value: halfRate,
                        inclusive: isInclusive
                    };

                    if (cgstIndex >= 0) {
                        updatedCharges[cgstIndex] = cgstCharge;
                    } else {
                        updatedCharges.push(cgstCharge);
                    }

                    if (sgstIndex >= 0) {
                        updatedCharges[sgstIndex] = sgstCharge;
                    } else {
                        updatedCharges.push(sgstCharge);
                    }

                    batch.update(productRef, {
                        price: Math.round(newPrice * 100) / 100, // Round to 2 decimal places
                        charges: updatedCharges,
                        gstMode: gstMode,
                        updatedAt: new Date()
                    });
                }
            });

            await batch.commit();
            showToast(`Successfully updated GST mode for ${selectedProducts.length} products`, 'success');

            if (refreshProducts) {
                refreshProducts();
            }

            onClose();
        } catch (error) {
            console.error('Error updating products:', error);
            showToast('Failed to update products. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Check if all selected products have the same GST mode
    const currentModes = selectedProducts.map(getCurrentGSTMode);
    const hasConsistentMode = currentModes.every(mode => mode === currentModes[0]);
    const currentMode = hasConsistentMode ? currentModes[0] : 'mixed';
    const noChangesNeeded = hasConsistentMode && currentMode === gstMode;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{window.LanguageContext?.t('gstModeSettings')}</h2>
                            <p className="text-sm text-gray-600 mt-1">
                                {selectedProducts.length} products selected
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <i className="ph ph-x text-xl"></i>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Current Status Alert */}
                    {!hasConsistentMode && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-start">
                                <i className="ph ph-warning text-yellow-500 text-lg mr-2 mt-0.5"></i>
                                <div className="text-sm text-yellow-800">
                                    <strong>Mixed GST Modes:</strong> Selected products have different GST modes.
                                    Updating will set all products to the same mode.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* GST Mode Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-4">
                            {window.LanguageContext?.t('chooseGstCalculationMode')}
                        </label>

                        <div className="space-y-3">
                            <label className={`flex items-start cursor-pointer p-3 border-2 rounded-lg transition-all hover:bg-gray-50 ${gstMode === 'inclusive' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                <input
                                    type="radio"
                                    name="gstMode"
                                    value="inclusive"
                                    checked={gstMode === 'inclusive'}
                                    onChange={(e) => setGstMode(e.target.value)}
                                    className="mt-1 mr-3 text-blue-600"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center">
                                        <i className="ph ph-check-circle text-lg mr-2 text-blue-600"></i>
                                        <div className="font-medium text-gray-800">{window.LanguageContext?.t('gstInclusive')}</div>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        {window.LanguageContext?.t('productPriceIncludesGst')}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {window.LanguageContext?.t('exampleInclusiveGst')}
                                    </div>
                                </div>
                            </label>

                            <label className={`flex items-start cursor-pointer p-3 border-2 rounded-lg transition-all hover:bg-gray-50 ${gstMode === 'exclusive' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                <input
                                    type="radio"
                                    name="gstMode"
                                    value="exclusive"
                                    checked={gstMode === 'exclusive'}
                                    onChange={(e) => setGstMode(e.target.value)}
                                    className="mt-1 mr-3 text-blue-600"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center">
                                        <i className="ph ph-plus-circle text-lg mr-2 text-green-600"></i>
                                        <div className="font-medium text-gray-800">{window.LanguageContext?.t('gstExclusive')}</div>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        {window.LanguageContext?.t('gstCalculatedAtCheckout')}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {window.LanguageContext?.t('exampleExclusiveGst')}
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Status Messages */}
                    {noChangesNeeded && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-start">
                                <i className="ph ph-info text-blue-500 text-lg mr-2 mt-0.5"></i>
                                <div className="text-sm text-blue-800">
                                    {window.LanguageContext?.t('allSelectedProductsAlreadyUse')} <strong>{gstMode} {window.LanguageContext?.t('gstMode')}</strong>.
                                    {window.LanguageContext?.t('noChangesWillBeMade')}.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Important Note */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start">
                            <i className="ph ph-lightbulb text-amber-500 text-lg mr-2 mt-0.5"></i>
                            <div className="text-sm text-gray-700">
                                <strong>{window.LanguageContext?.t('important')}:</strong> {window.LanguageContext?.t('productPricesWillBeAdjusted')}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 bg-gray-50">
                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            onClick={handleBulkUpdate}
                            disabled={loading || selectedProducts.length === 0 || noChangesNeeded}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                        >
                            {loading && <i className="ph ph-spinner-gap animate-spin mr-2"></i>}
                            {noChangesNeeded ? window.LanguageContext?.t('noChangesNeeded') : `${window.LanguageContext?.t('update')} ${selectedProducts.length} ${window.LanguageContext?.t('products')}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// QR Order Assignment Modal Component
export function QrOrderAssignmentModal({ order, availableTables, onAssignToTable, onConfirmAsParcel, onClose }) {
    const { t } = useLanguage();
    const [selectedTableId, setSelectedTableId] = useState(null);
    const [selectedTab, setSelectedTab] = useState('table'); // 'table' or 'parcel'
    const [isProcessing, setIsProcessing] = useState(false);

    // Calculate order total for display
    const orderTotal = order.items?.reduce((sum, item) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity || item.qnt || 1);
        return sum + (price * quantity);
    }, 0) || 0;

    const handleAssignToTable = async () => {
        if (!selectedTableId) {
            showToast("Please select a table", "error");
            return;
        }

        setIsProcessing(true);
        try {
            await onAssignToTable(order.id, selectedTableId);
            onClose();
        } catch (error) {
            console.error('Error assigning to table:', error);
            showToast(`Failed to assign to table: ${error.message}`, "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirmAsParcel = async () => {
        setIsProcessing(true);
        try {
            await onConfirmAsParcel(order.id);
            onClose();
        } catch (error) {
            console.error('Error confirming as parcel:', error);
            showToast(`Failed to confirm as parcel: ${error.message}`, "error");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 text-white p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                                <i className="ph ph-qr-code text-2xl"></i>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">{window.LanguageContext?.t('assignQrOrder')}</h2>
                                <p className="text-red-100 text-sm">Order #{order.billNo || order.id?.slice(-6)}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center hover:bg-opacity-30 transition-colors"
                        >
                            <i className="ph ph-x text-lg"></i>
                        </button>
                    </div>
                </div>

                {/* Order Summary */}
                <div className="p-4 bg-red-50 border-b border-red-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-red-100 to-red-50 rounded-lg flex items-center justify-center">
                                <i className="ph ph-shopping-cart text-red-600"></i>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800">{order.items?.length || 0} items</p>
                                <p className="text-sm text-gray-600">Customer: {order.custName || 'Walk-in'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-gray-800">{UserSession?.getCurrency()}{orderTotal}</p>
                            <p className="text-xs text-gray-500">{order.payMode || 'Cash'}</p>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setSelectedTab('table')}
                        className={`flex-1 py-4 px-6 text-sm font-medium transition-colors ${selectedTab === 'table'
                            ? 'text-red-600 border-b-2 border-red-600 bg-red-50'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <i className="ph ph-table mr-2"></i>
                        Assign to Table
                    </button>
                    <button
                        onClick={() => setSelectedTab('parcel')}
                        className={`flex-1 py-4 px-6 text-sm font-medium transition-colors ${selectedTab === 'parcel'
                            ? 'text-red-600 border-b-2 border-red-600 bg-red-50'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <i className="ph ph-package mr-2"></i>
                        Parcel Order
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-96 overflow-y-auto">
                    {selectedTab === 'table' ? (
                        <div>
                            <h3 className="text-lg font-semibold mb-4 text-gray-800">Available Tables</h3>

                            {availableTables.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <i className="ph ph-table text-2xl text-gray-400"></i>
                                    </div>
                                    <h4 className="text-lg font-medium text-gray-600 mb-2">{window.LanguageContext?.t('noAvailableTables')}</h4>
                                    <p className="text-gray-500">{window.LanguageContext?.t('allTablesOccupied')}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {availableTables.map((table) => (
                                        <button
                                            key={table.id}
                                            onClick={() => setSelectedTableId(table.id)}
                                            className={`p-4 rounded-xl border-2 transition-all ${selectedTableId === table.id
                                                ? 'border-red-500 bg-red-50 shadow-md'
                                                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                                                }`}
                                        >
                                            <div className="flex flex-col items-center gap-2">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedTableId === table.id
                                                    ? 'bg-red-500 text-white'
                                                    : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    <i className="ph ph-table"></i>
                                                </div>
                                                <div className="text-center">
                                                    <p className="font-semibold text-sm text-gray-800">{table.title}</p>
                                                    {table.desc && (
                                                        <p className="text-xs text-gray-500">{table.desc}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i className="ph ph-package text-2xl text-red-600"></i>
                            </div>
                            <h3 className="text-lg font-semibold mb-2 text-gray-800">{window.LanguageContext?.t('confirmAsParcelOrder')}</h3>
                            <p className="text-gray-600 mb-6">{window.LanguageContext?.t('thisOrderWillBeMarked')}</p>

                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <div className="flex items-center gap-3 text-red-700">
                                    <i className="ph ph-check-circle text-xl"></i>
                                    <div className="text-left">
                                        <p className="font-medium">{window.LanguageContext?.t('orderWillBeCompleted')}</p>
                                        <p className="text-sm text-red-600">{window.LanguageContext?.t('customerCanCollect')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            disabled={isProcessing}
                        >
                            {t('cancel')}
                        </button>

                        {selectedTab === 'table' ? (
                            <button
                                onClick={handleAssignToTable}
                                disabled={!selectedTableId || isProcessing}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg hover:from-red-700 hover:to-red-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Assigning...
                                    </>
                                ) : (
                                    <>
                                        <i className="ph ph-table"></i>
                                        {window.LanguageContext?.t('assignToTable')}
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleConfirmAsParcel}
                                disabled={isProcessing}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg hover:from-red-700 hover:to-red-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Confirming...
                                    </>
                                ) : (
                                    <>
                                        <i className="ph ph-check-circle"></i>
                                        {window.LanguageContext?.t('confirmAsParcel')}
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
