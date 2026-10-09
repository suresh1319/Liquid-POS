export const ModalManager = {
    // Add a flag to indicate the manager is fully initialized
    isReady: true,

    // Track shared overlay for windowed modals
    _windowedOverlayCount: 0,
    _getOrCreateWindowedOverlay(zIndex) {
        let overlay = document.getElementById('modal-windowed-overlay');
        const overlayZ = Math.max(1, (typeof zIndex === 'number' ? zIndex : 60) - 1);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-windowed-overlay';
            overlay.className = 'fixed inset-0 bg-gray-900 bg-opacity-50';
            overlay.style.zIndex = String(overlayZ);
            // Important: don't block clicks so multiple windowed panels remain usable
            overlay.style.pointerEvents = 'none';
            document.body.appendChild(overlay);
        } else {
            // Keep it below the smallest window z-index
            const currentZ = parseInt(overlay.style.zIndex || '0', 10) || 0;
            overlay.style.zIndex = String(Math.min(currentZ || overlayZ, overlayZ));
        }
        this._windowedOverlayCount += 1;
        return overlay;
    },
    _maybeRemoveWindowedOverlay() {
        this._windowedOverlayCount = Math.max(0, this._windowedOverlayCount - 1);
        if (this._windowedOverlayCount === 0) {
            const overlay = document.getElementById('modal-windowed-overlay');
            if (overlay) overlay.remove();
        }
    },

    // Keep track of open modals in order of opening
    openModals: [],

    // Create or show a side drawer modal
    createSideDrawerModal: function (options) {
        const {
            id,                       // Required: Unique ID for the modal
            title,                    // Required: Modal title
            content,                  // Required: HTML content for the body
            onClose = () => { },       // Optional: Function to call when modal closes
            onShown = () => { },       // Optional: Function to call when modal is shown
            actions = null,           // Optional: Footer actions HTML
            customClass = '',         // Optional: Additional classes for the modal content
            closeOnBackdropClick = true, // Optional: Whether clicking outside closes the modal
            zIndex = 50,             // Optional: z-index for the modal (default: 50)
            windowed = false         // Optional: Whether this is a windowed modal (allows multiple modals to be interactive)
        } = options;

        // Create or find modal container
        let container = document.getElementById(id);
        const isExisting = !!container;

        if (!container) {
            container = document.createElement('div');
            container.id = id;
            document.body.appendChild(container);
        }

        // Clear any existing content
        container.innerHTML = '';

        // Build the modal HTML
        if (windowed) {
            this._getOrCreateWindowedOverlay(zIndex);
            container.innerHTML = `
                <div class="w-screen max-w-full lg:max-w-[600px] transform transition-all ease-in-out duration-300
                    bg-white h-full flex flex-col shadow-xl font-sans ${customClass}"
                    style="position: fixed; right: 0; top: 0; bottom: 0; z-index: ${zIndex}; pointer-events: auto;">
                        <!-- Header -->
                        <div class="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-white">
                            <h1 class="text-xl font-medium">${title}</h1>
                            <div class="flex items-center">
                                <button id="${id}-close-btn" class="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                                    <i class="ph ph-x"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Content -->
                        <div class="flex-1 overflow-auto">
                            ${content}
                        </div>

                        ${actions ? `
                        <!-- Footer -->
                        <div class="p-4 border-t border-gray-200">
                            ${actions}
                        </div>
                        ` : ''}
                    </div>
            `;
        } else {
            container.innerHTML = `
                <div class="fixed inset-0 overflow-hidden" style="z-index: ${zIndex}; background-color: rgba(17, 24, 39, 0.5);" data-modal-id="${id}">
                    <!-- Mobile: Full Screen, Desktop: Right Side Drawer -->
                    <div class="fixed inset-y-0 right-0 flex max-w-full">
                        <div class="w-screen max-w-full lg:max-w-[600px] transform transition-all ease-in-out duration-300
                            bg-white h-full flex flex-col shadow-xl ${customClass}">
                            <!-- Header -->
                            <div class="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-white">
                                <h1 class="text-xl font-medium">${title}</h1>
                                <div class="flex items-center">
                                    <button id="${id}-close-btn" class="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                                        <i class="ph ph-x"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Content -->
                            <div class="flex-1 overflow-auto">
                                ${content}
                            </div>

                            ${actions ? `
                            <!-- Footer -->
                            <div class="p-4 border-t border-gray-200">
                                ${actions}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        // Add to open modals array (maintaining order)
        if (!this.openModals.includes(id)) {
            this.openModals.push(id);
        }

        // Function to close the modal
        const closeModal = () => {
            // Remove from open modals array
            const index = this.openModals.indexOf(id);
            if (index > -1) {
                this.openModals.splice(index, 1);
            }
            container.remove();
            onClose();
            if (windowed) this._maybeRemoveWindowedOverlay();
        };

        // Add close button event listener
        document.getElementById(`${id}-close-btn`).addEventListener('click', closeModal);

        // Add backdrop click handler if enabled
        if (closeOnBackdropClick && !windowed) {
            const handleOutsideClick = (event) => {
                // Find the innermost modal container
                const modalContent = container.querySelector('.flex-col');

                // Check if click is outside the modal content
                if (modalContent && !modalContent.contains(event.target)) {
                    // Only close if this is the topmost modal
                    const topmostModal = this.openModals.length > 0 ? this.openModals[this.openModals.length - 1] : null;
                    if (topmostModal === id) {
                        closeModal();
                    }
                }
            };

            // Use mousedown instead of click for better UX
            container.addEventListener('mousedown', handleOutsideClick);
        }

        // Return control object
        const modalControl = {
            close: closeModal,
            container: container,
            setContent: (newContent) => {
                const contentContainer = container.querySelector('.flex-1.overflow-auto');
                if (contentContainer) {
                    contentContainer.innerHTML = newContent;
                }
            },
            setTitle: (newTitle) => {
                const titleEl = container.querySelector('h1.text-xl');
                if (titleEl) {
                    titleEl.textContent = newTitle;
                }
            },
            setActions: (newActions) => {
                let footerEl = container.querySelector('.border-t.border-gray-200');
                if (footerEl) {
                    footerEl.innerHTML = newActions;
                } else if (newActions) {
                    // Create footer if it doesn't exist
                    const modalContent = container.querySelector('.flex-col');
                    const footer = document.createElement('div');
                    footer.className = 'p-4 border-t border-gray-200';
                    footer.innerHTML = newActions;
                    modalContent.appendChild(footer);
                }
            }
        };

        // Call the onShown callback with the control object
        setTimeout(() => onShown(modalControl), 100);

        return modalControl;
    },

    // Create or show a center modal (for small forms, alerts, etc.)
    createCenterModal: function (options) {
        const {
            id,                       // Required: Unique ID for the modal
            title,                    // Required: Modal title
            content,                  // Required: HTML content for the body
            size = 'md',              // Optional: 'sm', 'md', 'lg', 'xl' or custom width
            onClose = () => { },       // Optional: Function to call when modal closes
            onShown = () => { },       // Optional: Function to call when modal is shown
            actions = null,           // Optional: Footer actions HTML
            customClass = '',         // Optional: Additional classes for the modal content
            closeOnBackdropClick = true, // Optional: Whether clicking outside closes the modal
            zIndex = 50,             // Optional: z-index for the modal (default: 50)
            windowed = false         // Optional: Whether this is a windowed modal (allows multiple modals to be interactive)
        } = options;

        // Map size to width class
        const sizeMap = {
            sm: 'max-w-sm',
            md: 'max-w-md',
            lg: 'max-w-lg',
            xl: 'max-w-xl',
            '2xl': 'max-w-2xl',
            '3xl': 'max-w-3xl',
            '4xl': 'max-w-4xl',
            '5xl': 'max-w-5xl',
            '6xl': 'max-w-6xl',
            '7xl': 'max-w-7xl',
            'full': 'max-w-full'
        };

        const widthClass = sizeMap[size] || size;

        // Create or find modal container
        let container = document.getElementById(id);
        const isExisting = !!container;

        if (!container) {
            container = document.createElement('div');
            container.id = id;
            document.body.appendChild(container);
        }

        // Clear any existing content
        container.innerHTML = '';

        // Build the modal HTML
        if (windowed) {
            // Ensure shared non-blocking dark overlay exists
            this._getOrCreateWindowedOverlay(zIndex);
            // True windowed mode: no full-screen overlay; render a floating fixed panel
            container.innerHTML = `
                <div class="bg-white w-full ${widthClass} rounded-lg shadow-xl font-sans ${customClass} flex flex-col max-h-[90vh]"
                     style="position: fixed; top: 50px; left: 50px; z-index: ${zIndex}; pointer-events: auto;">
                    <!-- Header -->
                    <div class="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-white rounded-t-lg">
                        <h1 class="text-xl font-medium">${title}</h1>
                        <button id="${id}-close-btn" class="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                            <i class="ph ph-x"></i>
                        </button>
                    </div>

                    <!-- Content -->
                    <div class="flex-1 overflow-auto p-4">
                        ${content}
                    </div>

                    ${actions ? `
                    <!-- Footer -->
                    <div class="p-4 border-t border-gray-200 rounded-b-lg">
                        ${actions}
                    </div>
                    ` : ''}
                    <!-- Resize handle -->
                    <div class="window-resize-handle" style="position: absolute; width: 14px; height: 14px; right: 6px; bottom: 6px; cursor: nwse-resize; opacity: 0.6;">
                        <div style="width: 100%; height: 100%; border-right: 2px solid #d1d5db; border-bottom: 2px solid #d1d5db; border-radius: 2px;"></div>
                    </div>
                </div>
            `;

            // Enable dragging by header and resizing by corner handle
            const panel = container.firstElementChild;
            const header = panel.querySelector('.sticky.top-0');
            const resizeHandle = panel.querySelector('.window-resize-handle');

            // Dragging
            let dragging = false; let startX = 0; let startY = 0; let startLeft = 0; let startTop = 0;
            const onMouseMove = (e) => {
                if (!dragging) return;
                const dx = e.clientX - startX; const dy = e.clientY - startY;
                let newLeft = startLeft + dx; let newTop = startTop + dy;
                const rect = panel.getBoundingClientRect();
                // Clamp within viewport with 10px margin
                const margin = 10;
                newLeft = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, newLeft));
                newTop = Math.max(margin, Math.min(window.innerHeight - Math.min(rect.height, window.innerHeight) - margin, newTop));
                panel.style.left = `${newLeft}px`;
                panel.style.top = `${newTop}px`;
            };
            const stopDrag = () => {
                if (!dragging) return;
                dragging = false; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', stopDrag); document.body.style.userSelect = '';
            };
            header.addEventListener('mousedown', (e) => {
                // Start drag only if not clicking close button
                if (e.target.closest(`#${id}-close-btn`)) return;
                dragging = true; startX = e.clientX; startY = e.clientY;
                const rect = panel.getBoundingClientRect(); startLeft = rect.left; startTop = rect.top; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', stopDrag); document.body.style.userSelect = 'none';
            });

            // Resizing (bottom-right)
            let resizing = false; let startW = 0; let startH = 0;
            const onResizeMove = (e) => {
                if (!resizing) return;
                const dx = e.clientX - startX; const dy = e.clientY - startY;
                const newW = Math.max(420, startW + dx);
                const newH = Math.max(300, startH + dy);
                panel.style.width = `${newW}px`;
                panel.style.height = `${newH}px`;
            };
            const stopResize = () => {
                if (!resizing) return;
                resizing = false; document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('mouseup', stopResize); document.body.style.userSelect = '';
            };
            resizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                resizing = true; startX = e.clientX; startY = e.clientY;
                const rect = panel.getBoundingClientRect(); startW = rect.width; startH = rect.height;
                // Ensure the panel has explicit width/height to resize from
                panel.style.width = `${startW}px`; panel.style.height = `${startH}px`;
                document.addEventListener('mousemove', onResizeMove); document.addEventListener('mouseup', stopResize); document.body.style.userSelect = 'none';
            });
        } else {
            container.innerHTML = `
                <div class="fixed inset-0 overflow-hidden" style="z-index: ${zIndex}; background-color: rgba(17, 24, 39, 0.5);" data-modal-id="${id}">
                    <div class="fixed inset-0 overflow-auto bg-gray-900 bg-opacity-50 flex items-center justify-center p-4">
                        <div class="bg-white w-full ${widthClass} rounded-lg shadow-xl ${customClass} flex flex-col max-h-[90vh] lg:max-w-[600px] lg:fixed lg:top-0 lg:right-0 lg:h-full lg:max-h-full lg:rounded-none">
                            <!-- Header -->
                            <div class="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-white rounded-t-lg">
                                <h1 class="text-xl font-medium">${title}</h1>
                                <button id="${id}-close-btn" class="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                                    <i class="ph ph-x"></i>
                                </button>
                            </div>

                            <!-- Content -->
                            <div class="flex-1 overflow-auto p-4">
                                ${content}
                            </div>

                            ${actions ? `
                            <!-- Footer -->
                            <div class="p-4 border-t border-gray-200 rounded-b-lg">
                                ${actions}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        // Add to open modals array (maintaining order)
        if (!this.openModals.includes(id)) {
            this.openModals.push(id);
        }

        // Function to close the modal
        const closeModal = () => {
            // Remove from open modals array
            const index = this.openModals.indexOf(id);
            if (index > -1) {
                this.openModals.splice(index, 1);
            }
            container.remove();
            onClose();
            if (windowed) this._maybeRemoveWindowedOverlay();
        };

        // Add close button event listener
        document.getElementById(`${id}-close-btn`).addEventListener('click', closeModal);

    // Add backdrop click handler if enabled (not in windowed mode)
    if (closeOnBackdropClick && !windowed) {
            const handleOutsideClick = (event) => {
                // Find the innermost modal container
                const modalContent = container.querySelector('.rounded-lg');

                // Check if click is outside the modal content
                if (modalContent && !modalContent.contains(event.target)) {
                    // Only close if this is the topmost modal
                    const topmostModal = this.openModals.length > 0 ? this.openModals[this.openModals.length - 1] : null;
                    if (topmostModal === id) {
                        closeModal();
                    }
                }
            };

            // Use mousedown instead of click for better UX
            container.addEventListener('mousedown', handleOutsideClick);
        }

        // Return control object
        const modalControl = {
            close: closeModal,
            container: container,
            setContent: (newContent) => {
                const contentContainer = container.querySelector('.flex-1.overflow-auto');
                if (contentContainer) {
                    contentContainer.innerHTML = newContent;
                }
            },
            setTitle: (newTitle) => {
                const titleEl = container.querySelector('h1.text-xl');
                if (titleEl) {
                    titleEl.textContent = newTitle;
                }
            },
            setActions: (newActions) => {
                let footerEl = container.querySelector('.border-t.border-gray-200');
                if (footerEl) {
                    footerEl.innerHTML = newActions;
                } else if (newActions) {
                    // Create footer if it doesn't exist
                    const modalContent = container.querySelector('.rounded-lg');
                    const footer = document.createElement('div');
                    footer.className = 'p-4 border-t border-gray-200 rounded-b-lg';
                    footer.innerHTML = newActions;
                    modalContent.appendChild(footer);
                }
            }
        };

        // Call the onShown callback with the control object
        setTimeout(() => onShown(modalControl), 100);

        return modalControl;
    },

    // Simple toast notification
    showToast: function (message, options = {}) {
        const {
            type = "success",           // 'success' or 'error'
            duration = 3000,            // Duration in ms
            position = "bottom-right"   // Position: 'bottom-right', 'bottom-left', 'top-right', 'top-left', 'top-center', 'bottom-center'
        } = options;

        // Position classes
        const positionClasses = {
            "bottom-right": "fixed bottom-4 right-4",
            "bottom-left": "fixed bottom-4 left-4",
            "top-right": "fixed top-4 right-4",
            "top-left": "fixed top-4 left-4",
            "top-center": "fixed top-4 left-1/2 transform -translate-x-1/2",
            "bottom-center": "fixed bottom-4 left-1/2 transform -translate-x-1/2"
        };

        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = `z-[9999] ${positionClasses[position]}`;
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `p-3 rounded-lg shadow-lg mb-2 flex items-center ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`;
        toast.innerHTML = `
            <i class="ph ${type === 'success' ? 'ph-check-circle' : 'ph-x-circle'} mr-2"></i>
            <span>${message}</span>
        `;

        // Add to container and set timeout to remove
        toastContainer.appendChild(toast);

        // Animate in
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'opacity 0.3s, transform 0.3s';

        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);

        // Set timeout to remove
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';

            setTimeout(() => {
                toast.remove();
                if (toastContainer.children.length === 0) {
                    toastContainer.remove();
                }
            }, 300);
        }, duration);

        // Return the toast element for possible manual control
        return toast;
    },

    // Confirm dialog - returns a Promise
    confirm: function (options) {
        const {
            title = "Confirm",
            message = "Are you sure?",
            confirmText = "Confirm",
            cancelText = "Cancel",
            confirmButtonClass = "bg-red-500 hover:bg-red-600 text-white",
            cancelButtonClass = "bg-gray-200 hover:bg-gray-300 text-gray-800",
            zIndex = 60
        } = options;

        return new Promise((resolve) => {
            const modalId = 'confirm-dialog-' + Date.now();

            const modal = this.createCenterModal({
                id: modalId,
                title: title,
                content: `<p class="text-gray-700">${message}</p>`,
                size: 'sm',
                zIndex: zIndex,
                actions: `
                <div class="flex justify-end space-x-2">
                    <button id="${modalId}-cancel" class="px-4 py-2 rounded-md ${cancelButtonClass}">
                        ${cancelText}
                    </button>
                    <button id="${modalId}-confirm" class="px-4 py-2 rounded-md ${confirmButtonClass}">
                        ${confirmText}
                    </button>
                </div>
            `,
                onShown: (control) => {
                    document.getElementById(`${modalId}-cancel`).addEventListener('click', () => {
                        control.close();
                        resolve(false);
                    });

                    document.getElementById(`${modalId}-confirm`).addEventListener('click', () => {
                        control.close();
                        resolve(true);
                    });
                }
            });
        });
    }
};

// Convenience close helper by modal id to support external callers
// Tries to click the dedicated close button so the registered handler runs
// Falls back to removing the container element if the button isn't found
ModalManager.close = function(id) {
    try {
        const closeBtn = document.getElementById(`${id}-close-btn`);
        if (closeBtn) {
            closeBtn.click();
            return true;
        }
        const container = document.getElementById(id);
        if (container) {
            container.remove();
            return true;
        }
    } catch (_) {}
    return false;
};