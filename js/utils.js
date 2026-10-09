
export { ChargesCalculator } from './utils/ChargesCalculator.js';
import { UserSession } from './utils/UserSession.js';
import { ModalManager } from './components/ModalManager.js';
import { CurrencyData } from './utils/CurrencyData.js';
import { sdk } from './sdk.js';

// Utility function to safely parse date
export function parseDate(date) {
    if (!date) return null;

    try {
        // If it's a Firebase Timestamp
        if (date.toDate) {
            return date.toDate();
        }

        // If it's already a Date object
        if (date instanceof Date) {
            return isNaN(date.getTime()) ? null : date;
        }

        // If it's a timestamp number
        if (typeof date === 'number') {
            const d = new Date(date);
            return isNaN(d.getTime()) ? null : d;
        }

        // If it's an ISO string or other string format
        if (typeof date === 'string') {
            const d = new Date(date);
            return isNaN(d.getTime()) ? null : d;
        }

        return null;
    } catch (e) {
        console.error('Error parsing date:', e);
        return null;
    }
}

// Utility function to calculate time duration
export function getTimeDuration(date, t = (key) => key) {
    const parsedDate = parseDate(date);
    if (!parsedDate) return null;

    const now = new Date();
    const diffMs = now - parsedDate;

    // If the difference is negative (future date) or invalid
    if (diffMs < 0 || isNaN(diffMs)) return null;

    // Calculate minutes for color-coding
    const minutes = Math.floor(diffMs / (1000 * 60));

    // For very recent times (less than 1 minute)
    if (minutes < 1) {
        return {
            display: t('justNow'),
            minutes: 0
        };
    }

    // For display purposes, we'll show different formats based on duration
    const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
    if (months > 0) {
        return {
            display: `${months} ${months === 1 ? t('month') : t('months')}`,
            minutes: minutes
        };
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days > 0) {
        return {
            display: `${days} ${days === 1 ? t('day') : t('days')}`,
            minutes: minutes
        };
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours > 0) {
        return {
            display: `${hours} ${hours === 1 ? t('hour') : t('hours')}`,
            minutes: minutes
        };
    }

    return {
        display: `${minutes} ${minutes === 1 ? t('minute') : t('minutes')}`,
        minutes: minutes
    };
}

// Utility function for logging
export function pp(message) {
    console.log(message);
}

// Utility function to format currency
export function formatCurrency(amount) {
    if (CurrencyData) {
        const currencyCode = UserSession?.getCurrencyCode() || "INR";
        return CurrencyData.formatAmount(amount, currencyCode);
    }
    // Fallback to default formatting if CurrencyData is not available
    const currencySymbol = UserSession?.getCurrency() || '₹';
    return `${currencySymbol}${Number(amount).toLocaleString('en-IN')}`;
}

// Utility function to format date
export function formatDate(date, format = 'short') {
    const parsedDate = parseDate(date);
    if (!parsedDate) return '';

    try {
        switch (format) {
            case 'short':
                return parsedDate.toLocaleDateString('en-GB');
            case 'long':
                return parsedDate.toLocaleString('en-GB', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
            case 'time':
                return parsedDate.toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
            case 'full':
                return parsedDate.toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
            default:
                return parsedDate.toLocaleString('en-GB');
        }
    } catch (e) {
        console.error('Error formatting date:', e);
        return '';
    }
}

// Utility functions to match Flutter DateModifiers extension
export function prettyTime(date) {
    const parsedDate = parseDate(date);
    if (!parsedDate) return '';

    const now = new Date();
    const diff = now - parsedDate;

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
        return `${seconds} sec ago`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} hours ago`;
    }

    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days} days ago`;
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
        return `${months} months ago`;
    }

    const years = Math.floor(days / 365);
    return `${years} years ago`;
}

export function prettyShortTime(date) {
    const parsedDate = parseDate(date);
    if (!parsedDate) return '';

    const now = new Date();
    const diff = now - parsedDate;

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
        return `${seconds} sec`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} hrs`;
    }

    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days} days`;
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
        return `${months} months`;
    }

    const years = Math.floor(days / 365);
    return `${years} years`;
}

export function tinyDate(date) {
    const parsedDate = parseDate(date);
    if (!parsedDate) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateDay = new Date(parsedDate);
    dateDay.setHours(0, 0, 0, 0);

    if (dateDay.getTime() === today.getTime()) {
        return "Today";
    } else if (dateDay.getTime() === yesterday.getTime()) {
        return "Yesterday";
    } else if (dateDay.getTime() === tomorrow.getTime()) {
        return "Tomorrow";
    } else if (dateDay.getFullYear() === today.getFullYear()) {
        return parsedDate.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: '2-digit',
            month: 'long'
        });
    } else {
        return parsedDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }
}

export function tinyDateTime(date) {
    const parsedDate = parseDate(date);
    if (!parsedDate) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateDay = new Date(parsedDate);
    dateDay.setHours(0, 0, 0, 0);

    const timeStr = parsedDate.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    if (dateDay.getTime() === today.getTime()) {
        return `Today, ${timeStr}`;
    } else if (dateDay.getTime() === yesterday.getTime()) {
        return `Yesterday, ${timeStr}`;
    } else if (dateDay.getTime() === tomorrow.getTime()) {
        return `Tomorrow, ${timeStr}`;
    } else if (dateDay.getFullYear() === today.getFullYear()) {
        return parsedDate.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } else {
        return parsedDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
}

// Format duration as HH:MM
export function formatDurationHM(durationMs) {
    if (!durationMs || isNaN(durationMs)) return '00:00';

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Format duration as HH:MM:SS
export function formatDurationHMS(durationMs) {
    if (!durationMs || isNaN(durationMs)) return '00:00:00';

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Helper function for two-digit formatting
export function toTwoDigits(n) {
    return n.toString().padStart(2, '0');
}

// Utility function to show toast notifications
export function showToast(message, type = 'success') {
    if (ModalManager && typeof ModalManager.showToast === 'function') {
        // Use ModalManager if available
        ModalManager.showToast(message, {
            type: type,
            position: 'top-right'
        });
    } else {
        // Fallback to original implementation
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2';
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `px-4 py-2 rounded-lg shadow-lg text-white flex items-center ${type === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`;

        // Add icon based on type
        const icon = document.createElement('i');
        icon.className = `ph ${type === 'success' ? 'ph-check-circle' : 'ph-x-circle'} mr-2`;
        toast.appendChild(icon);

        // Add message
        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);

        // Add to container
        toastContainer.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('opacity-0', 'transition-opacity');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, 3000);
    }
}

// Confirm dialog
export function confirmDialog({ title, content, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel }) {
    if (ModalManager && typeof ModalManager.confirm === 'function') {
        // Use ModalManager if available
        ModalManager.confirm({
            title: title,
            message: content,
            confirmText: confirmText,
            cancelText: cancelText,
            confirmButtonClass: "bg-blue-600 hover:bg-blue-700 text-white",
            cancelButtonClass: "bg-gray-100 hover:bg-gray-200 text-gray-700"
        }).then(result => {
            if (result && onConfirm) {
                onConfirm();
            } else if (!result && onCancel) {
                onCancel();
            }
        });
    } else {
        // Fallback to original implementation if ModalManager not available
        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden';

        // Create modal header
        const header = document.createElement('div');
        header.className = 'p-4 border-b';
        const titleElement = document.createElement('h2');
        titleElement.className = 'text-xl font-semibold text-gray-900';
        titleElement.textContent = title;
        header.appendChild(titleElement);

        // Create modal body
        const body = document.createElement('div');
        body.className = 'p-4';
        const contentElement = document.createElement('p');
        contentElement.className = 'text-gray-700';
        contentElement.textContent = content;
        body.appendChild(contentElement);

        // Create modal footer
        const footer = document.createElement('div');
        footer.className = 'p-4 border-t flex justify-end gap-3';

        // Create cancel button
        const cancelButton = document.createElement('button');
        cancelButton.className = 'px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors';
        cancelButton.textContent = cancelText;
        cancelButton.onclick = () => {
            document.body.removeChild(modalContainer);
            if (onCancel) onCancel();
        };

        // Create confirm button
        const confirmButton = document.createElement('button');
        confirmButton.className = 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors';
        confirmButton.textContent = confirmText;
        confirmButton.onclick = () => {
            document.body.removeChild(modalContainer);
            if (onConfirm) onConfirm();
        };

        // Add buttons to footer
        footer.appendChild(cancelButton);
        footer.appendChild(confirmButton);

        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        modalContainer.appendChild(modal);

        // Add click outside to cancel
        modalContainer.onclick = (e) => {
            if (e.target === modalContainer) {
                document.body.removeChild(modalContainer);
                if (onCancel) onCancel();
            }
        };

        // Add to document
        document.body.appendChild(modalContainer);
    }
}

// Utility function for modal/dialog classes (to reduce duplication across components)
export function getModalClasses({ isMobile, isClosing, customBaseClasses, customMobileWidthClasses, customDesktopWidthClasses }) {
    // Default base classes if not provided
    const baseClasses = customBaseClasses || "bg-white overflow-y-auto shadow-xl custom-scrollbar";

    // Mobile positioning and sizing
    const mobileWidthClasses = customMobileWidthClasses || "fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[90vh] mobile-bottom-sheet";

    // Desktop positioning and sizing
    const desktopWidthClasses = customDesktopWidthClasses || "fixed top-0 right-0 h-full w-full md:w-2/3 lg:w-1/2 xl:w-2/5";

    if (isMobile) {
        // Mobile classes
        const animationClass = isClosing ? "translate-y-full" : "translate-y-0";
        return `${baseClasses} ${mobileWidthClasses} transition-transform ${animationClass}`;
    } else {
        // Desktop classes
        const animationClass = isClosing ? "translate-x-full" : "translate-x-0";
        return `${baseClasses} ${desktopWidthClasses} transition-transform ${animationClass} desktop-slide-in`;
    }
}

// Get overlay classes for modals
export function getModalOverlayClasses(isClosing, zIndex = "z-50") {
    return `fixed inset-0 bg-black transition-opacity duration-300 ${zIndex} ${isClosing ? 'bg-opacity-0' : 'bg-opacity-50'}`;
}

// Create a modal
export function createModal(content, { title, footer, onClose, baseClasses, headerClasses, bodyClasses, footerClasses, showCloseButton = true, closeOnBackdropClick = true } = {}) {
    if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
        // Use ModalManager if available
        return ModalManager.createCenterModal({
            id: 'modal-' + Date.now(),
            title: title || '',
            content: content,
            actions: footer || '',
            customClass: baseClasses || '',
            closeOnBackdropClick: closeOnBackdropClick,
            onClose: onClose || (() => { }),
            size: 'md'
        });
    } else {
        // Fallback to original implementation
        // Create the modal container
        const modalContainer = document.createElement('div');
        modalContainer.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';

        // Create the backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'fixed inset-0 bg-black bg-opacity-50';
        if (closeOnBackdropClick) {
            backdrop.addEventListener('click', () => {
                closeModal(modalContainer);
                if (onClose) onClose();
            });
        }

        // Create the modal itself
        const modal = document.createElement('div');
        modal.className = baseClasses || 'bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden';
        modal.addEventListener('click', (e) => e.stopPropagation());

        // Add the modal content
        if (title) {
            const header = document.createElement('div');
            header.className = headerClasses || 'p-4 border-b flex items-center justify-between';

            const titleEl = document.createElement('h3');
            titleEl.className = 'font-medium text-lg';
            titleEl.textContent = title;
            header.appendChild(titleEl);

            if (showCloseButton) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'p-1 rounded-full hover:bg-gray-100';
                closeBtn.innerHTML = '<i class="ph ph-x"></i>';
                closeBtn.addEventListener('click', () => {
                    closeModal(modalContainer);
                    if (onClose) onClose();
                });
                header.appendChild(closeBtn);
            }

            modal.appendChild(header);
        }

        const body = document.createElement('div');
        body.className = bodyClasses || 'p-4';
        body.innerHTML = content;
        modal.appendChild(body);

        if (footer) {
            const footerEl = document.createElement('div');
            footerEl.className = footerClasses || 'p-4 border-t';
            footerEl.innerHTML = footer;
            modal.appendChild(footerEl);
        }

        // Assemble the modal
        modalContainer.appendChild(backdrop);
        modalContainer.appendChild(modal);
        document.body.appendChild(modalContainer);

        // Return interface for controlling the modal
        return {
            close: () => {
                closeModal(modalContainer);
                if (onClose) onClose();
            },
            container: modalContainer,
            modalElement: modal
        };
    }
}

// Helper function to close a modal
export function closeModal(modalContainer) {
    if (modalContainer && document.body.contains(modalContainer)) {
        document.body.removeChild(modalContainer);
    }
}

// Create a sliding panel
export function createSlidingPanel(content, { title, position = 'right', onClose, customWidth, customBaseClasses } = {}) {
    if (ModalManager && typeof ModalManager.createSideDrawerModal === 'function' && position === 'right') {
        // Use ModalManager if available (but only for right-side panels, as that's what ModalManager supports)
        return ModalManager.createSideDrawerModal({
            id: 'sliding-panel-' + Date.now(),
            title: title || '',
            content: content,
            width: customWidth || '600px',
            customClass: customBaseClasses || '',
            closeOnBackdropClick: true,
            onClose: onClose || (() => { })
        });
    } else {
        // Fallback to original implementation
        // Create the panel container
        const panelContainer = document.createElement('div');
        panelContainer.className = 'fixed inset-0 z-50';

        // Create the backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'fixed inset-0 bg-black bg-opacity-50';
        backdrop.addEventListener('click', () => {
            closeSlidingPanel(panelContainer);
            if (onClose) onClose();
        });

        // Create the panel itself
        const panel = document.createElement('div');
        const baseClasses = customBaseClasses || "bg-white overflow-y-auto shadow-xl custom-scrollbar";

        if (position === 'right') {
            panel.className = `absolute top-0 right-0 h-full ${customWidth || 'w-full md:w-96'} ${baseClasses}`;
        } else if (position === 'left') {
            panel.className = `absolute top-0 left-0 h-full ${customWidth || 'w-full md:w-96'} ${baseClasses}`;
        } else if (position === 'bottom') {
            panel.className = `absolute bottom-0 left-0 w-full ${customWidth || 'h-2/3'} rounded-t-xl ${baseClasses}`;
        }

        // Add the panel content
        if (title) {
            const header = document.createElement('div');
            header.className = 'p-4 border-b flex items-center justify-between';

            const titleEl = document.createElement('h3');
            titleEl.className = 'font-medium text-lg';
            titleEl.textContent = title;
            header.appendChild(titleEl);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'p-1 rounded-full hover:bg-gray-100';
            closeBtn.innerHTML = '<i class="ph ph-x"></i>';
            closeBtn.addEventListener('click', () => {
                closeSlidingPanel(panelContainer);
                if (onClose) onClose();
            });
            header.appendChild(closeBtn);

            panel.appendChild(header);
        }

        const body = document.createElement('div');
        body.className = 'p-4';
        body.innerHTML = content;
        panel.appendChild(body);

        // Assemble the panel
        panelContainer.appendChild(backdrop);
        panelContainer.appendChild(panel);
        document.body.appendChild(panelContainer);

        // Return interface for controlling the panel
        return {
            close: () => {
                closeSlidingPanel(panelContainer);
                if (onClose) onClose();
            },
            container: panelContainer,
            panelElement: panel
        };
    }
}

// Helper function to close a sliding panel
export function closeSlidingPanel(panelContainer) {
    if (panelContainer && document.body.contains(panelContainer)) {
        document.body.removeChild(panelContainer);
    }
}

// Get orderSource from an order object, matching the Flutter MOrder orderSource getter
export function getOrderSource(order) {
    if (!order) return null;
    return order.priceVariant || order.tableId || null;
}

// Format product title with variant name
export function formatProductTitle(item) {
    if (!item) return '';
    
    // Get the base title - could be from product.title or item.title
    const baseTitle = item.product?.title || item.title || '';
    
    // Check if there's a variant
    const variantName = item.variant?.name || item.variantName;
    
    if (variantName) {
        let title = `${baseTitle} (${variantName})`;
        // Mark birthday benefit free items
        if ((item.freeItem === true && item.freeItemSource === 'birthday') || item.birthdayBenefit === true) {
            title += ' — Birthday benefit';
        }
        return title;
    }
    let title = baseTitle;
    // Detect birthday/free markers in a few shapes (top-level or nested under product)
    const freeItemFlag = item.freeItem === true || (item.product && item.product.freeItem === true);
    const freeSource = (item.freeItemSource || (item.product && item.product.freeItemSource) || '').toString();
    const legacyBirthday = item.birthdayBenefit === true || (item.product && item.product.birthdayBenefit === true);
    if (freeSource === 'birthday' || legacyBirthday === true || freeItemFlag === true) {
        title += ' — Birthday benefit';
    }
    return title;
} 