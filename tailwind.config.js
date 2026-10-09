module.exports = {
    content: [
        "./index.html",
        "./js/**/*.{js,ts,jsx,tsx}",
        "!./js/components/CheckoutSheet.js",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#FF5A5F',
                'primary-dark': '#E04B50',
                secondary: '#00A699',
                dark: '#484848',
                light: '#767676',
                'warm-bg': '#fff8f8',
                'warm-accent': '#ffefef',
                'warm-surface': '#fffcfc',
                'page-bg': '#f9f7f7',
                'section-bg': '#ffffff',
                'card-bg': '#fffafa'
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            gradientColorStops: {
                'warm-start': '#fff8f8',
                'warm-mid': '#fff0f0',
                'warm-end': '#ffffff',
                'success-start': '#f0fff5',
                'warning-start': '#fffaf0',
                'info-start': '#f0f8ff',
                'page-start': '#f5f5f7',
                'section-start': '#ffffff',
                'card-start': '#fffafa'
            },
            boxShadow: {
                'card': '0 2px 8px rgba(0, 0, 0, 0.05)',
                'card-hover': '0 4px 12px rgba(0, 0, 0, 0.08)',
                'section': '0 2px 8px rgba(0, 0, 0, 0.04)'
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: 0 },
                    '100%': { opacity: 1 },
                },
                scaleIn: {
                    '0%': { transform: 'scale(0.8)' },
                    '70%': { transform: 'scale(1.05)' },
                    '100%': { transform: 'scale(1)' },
                },
                slideInRight: {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(100%)' },
                    '100%': { transform: 'translateY(0)' },
                }
            },
            animation: {
                fadeIn: 'fadeIn 0.3s ease-in-out',
                scaleIn: 'scaleIn 0.3s ease-in-out',
                slideInRight: 'slideInRight 0.3s ease-out',
                slideUp: 'slideUp 0.3s ease-out',
            }
        }
    },
    safelist: [
        'bg-gradient-to-br',
        'bg-gradient-to-r',
        'bg-primary',
        'bg-primary-dark',
        'from-warm-bg',
        'from-warm-accent',
        'from-warm-surface',
        'from-red-50',
        'from-red-100',
        'from-green-50',
        'from-green-100',
        'from-blue-50',
        'from-blue-100',
        'from-orange-50',
        'from-orange-100',
        'from-gray-50',
        'from-gray-100',
        'from-page-bg',
        'from-section-bg',
        'from-card-bg',
        'bg-page-bg',
        'bg-section-bg',
        'bg-card-bg',
        'to-white',
        'to-warm-end',
        'to-gray-50',
        'shadow-sm',
        'shadow-card',
        'shadow-section',
        'shadow-card-hover',
        'h-full',
        'w-full',
        'flex-1',
        'flex',
        'flex-col',
        'text-red-500',
        'text-green-500',
        'text-orange-500',
        'text-gray-500',
        'animate-fadeIn',
        'animate-scaleIn',
        'line-clamp-1',
        'line-clamp-2',
        'text-2xs',
        'overflow-visible',
        // Keep common utility prefixes used heavily in CheckoutSheet
        { pattern: /^(sm:|md:|lg:|xl:|2xl:)?(bg|text|border|ring|from|to|via|shadow|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|grid|col|row|gap|flex|items|justify|content|self|w|h|min-w|min-h|max-w|max-h|rounded|overflow|truncate|whitespace|break|z|top|bottom|left|right|inset|translate|scale|rotate|skew|opacity|cursor|select|pointer-events|transition|duration|ease|animate|place|object|aspect|sr)-.*/ },
    ],
    plugins: [],
} 