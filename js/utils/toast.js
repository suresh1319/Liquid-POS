// Toast utility for showing notifications
export function showToast(message, type = 'info', duration = 3000) {
    // Check if toast container exists, if not create it
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');

    // Determine toast color based on type
    let colorClasses = '';
    let icon = '';

    switch (type) {
        case 'success':
            colorClasses = 'bg-green-500 text-white';
            icon = '<i class="ph ph-check-circle mr-2"></i>';
            break;
        case 'error':
            colorClasses = 'bg-red-500 text-white';
            icon = '<i class="ph ph-x-circle mr-2"></i>';
            break;
        case 'warning':
            colorClasses = 'bg-yellow-500 text-white';
            icon = '<i class="ph ph-warning-circle mr-2"></i>';
            break;
        case 'info':
        default:
            colorClasses = 'bg-blue-500 text-white';
            icon = '<i class="ph ph-info mr-2"></i>';
            break;
    }

    // Add classes and content to toast element
    toast.className = `py-2 px-4 rounded-lg shadow-lg flex items-center transform transition-transform duration-300 ${colorClasses} translate-x-full`;
    toast.innerHTML = `${icon}${message}`;

    // Add toast to container
    container.appendChild(toast);

    // Trigger entrance animation after a small delay (for the transition to work)
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 10);

    // Remove toast after duration
    setTimeout(() => {
        // Add exit animation
        toast.classList.add('translate-x-full');

        // Remove element after animation completes
        setTimeout(() => {
            container.removeChild(toast);

            // Clean up container if empty
            if (container.children.length === 0) {
                document.body.removeChild(container);
            }
        }, 300);
    }, duration);
}
