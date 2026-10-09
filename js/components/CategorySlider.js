import { useRef, useState, useEffect } from 'react';

export function CategorySlider({ 
    categories, 
    selectedCategory, 
    onCategorySelect, 
    variant = 'default' // 'default' for Products page, 'pos' for POS page
}) {
    const scrollRef = useRef(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);

    // Check scroll position and update arrow visibility
    const updateArrowVisibility = () => {
        const element = scrollRef.current;
        if (!element) return;

        const { scrollLeft, scrollWidth, clientWidth } = element;
        setShowLeftArrow(scrollLeft > 5); // Add small buffer
        setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
    };

    // Initial check and setup scroll listener
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;

        // Initial check with delay to ensure rendering is complete
        setTimeout(updateArrowVisibility, 100);

        // Add scroll listener
        const handleScroll = () => {
            updateArrowVisibility();
            setIsScrolling(true);
            
            // Clear scrolling state after scroll ends
            clearTimeout(window.scrollTimer);
            window.scrollTimer = setTimeout(() => {
                setIsScrolling(false);
            }, 150);
        };

        element.addEventListener('scroll', handleScroll);
        
        // Add resize listener to handle window resize
        const handleResize = () => {
            setTimeout(updateArrowVisibility, 100);
        };
        
        window.addEventListener('resize', handleResize);

        return () => {
            element.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            clearTimeout(window.scrollTimer);
        };
    }, [categories]);

    // Scroll functions
    const scrollLeft = () => {
        const element = scrollRef.current;
        if (element) {
            const scrollAmount = Math.min(200, element.clientWidth * 0.8);
            element.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        }
    };

    const scrollRight = () => {
        const element = scrollRef.current;
        if (element) {
            const scrollAmount = Math.min(200, element.clientWidth * 0.8);
            element.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    // Handle category click and auto-scroll to center
    const handleCategoryClick = (category) => {
        onCategorySelect(category);
        
        // Auto-scroll to center the selected category
        setTimeout(() => {
            const element = scrollRef.current;
            if (!element) return;

            const categoryButton = element.querySelector(`[data-category="${category}"]`);
            if (categoryButton) {
                const buttonRect = categoryButton.getBoundingClientRect();
                const containerRect = element.getBoundingClientRect();
                const scrollOffset = buttonRect.left - containerRect.left - (containerRect.width / 2) + (buttonRect.width / 2);
                
                element.scrollBy({ left: scrollOffset, behavior: 'smooth' });
            }
        }, 100);
    };

    if (variant === 'pos') {
        // POS page variant
        return (
            <div className="px-4 py-3 border-b" style={{ backgroundColor: "#ffefef" }}>
                <div className="relative">
                    {/* Left Arrow - Only show on devices where hover is possible */}
                    {showLeftArrow && (
                        <button
                            onClick={scrollLeft}
                            className="category-slider-arrow absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-white shadow-lg rounded-full flex items-center justify-center hover:bg-gray-50 transition-all duration-200 hidden sm:flex"
                            style={{ marginLeft: '-12px' }}
                            aria-label="Scroll categories left"
                        >
                            <i className="ph ph-caret-left text-gray-600"></i>
                        </button>
                    )}

                    {/* Right Arrow - Only show on devices where hover is possible */}
                    {showRightArrow && (
                        <button
                            onClick={scrollRight}
                            className="category-slider-arrow absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-white shadow-lg rounded-full flex items-center justify-center hover:bg-gray-50 transition-all duration-200 hidden sm:flex"
                            style={{ marginRight: '-12px' }}
                            aria-label="Scroll categories right"
                        >
                            <i className="ph ph-caret-right text-gray-600"></i>
                        </button>
                    )}

                    {/* Categories Container */}
                    <div 
                        ref={scrollRef}
                        className="flex items-center overflow-x-auto py-1 scroll-tabs gap-2"
                        style={{ 
                            scrollbarWidth: 'none', 
                            msOverflowStyle: 'none',
                            paddingLeft: showLeftArrow ? '24px' : '4px',
                            paddingRight: showRightArrow ? '24px' : '4px'
                        }}
                    >
                        {categories.map(category => (
                            <button
                                key={category}
                                data-category={category}
                                className={`px-4 py-2.5 whitespace-nowrap rounded-full transition-colors ${selectedCategory === category
                                    ? 'bg-red-500 text-white font-medium shadow-sm'
                                    : 'bg-white text-gray-700 hover:bg-pink-50 shadow-sm'
                                    }`}
                                onClick={() => handleCategoryClick(category)}
                            >
                                {category === 'all' ? 'All Items' : category}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Products page variant (default)
    return (
        <div className="relative border-b border-gray-200 mb-2 md:mb-3">
            {/* Left Arrow - Only show on larger screens */}
            {showLeftArrow && (
                <button
                    onClick={scrollLeft}
                    className="category-slider-arrow absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-white shadow-lg rounded-full flex items-center justify-center hover:bg-gray-50 transition-all duration-200 hidden md:flex"
                    style={{ marginLeft: '8px' }}
                    aria-label="Scroll categories left"
                >
                    <i className="ph ph-caret-left text-gray-600"></i>
                </button>
            )}

            {/* Right Arrow - Only show on larger screens */}
            {showRightArrow && (
                <button
                    onClick={scrollRight}
                    className="category-slider-arrow absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-white shadow-lg rounded-full flex items-center justify-center hover:bg-gray-50 transition-all duration-200 hidden md:flex"
                    style={{ marginRight: '8px' }}
                    aria-label="Scroll categories right"
                >
                    <i className="ph ph-caret-right text-gray-600"></i>
                </button>
            )}

            {/* Categories Container */}
            {/* Categories Container */}
            <div 
                ref={scrollRef}
                className="scroll-tabs flex items-center gap-3 md:gap-6 overflow-x-auto py-1 md:py-2 px-1 md:px-4"
                style={{ 
                    scrollbarWidth: 'none', 
                    msOverflowStyle: 'none',
                    paddingLeft: showLeftArrow ? '48px' : '16px',
                    paddingRight: showRightArrow ? '48px' : '16px'
                }}
            >
                {categories.map(category => (
                    <CategoryTab
                        key={category.id}
                        category={category}
                        isActive={selectedCategory === category.name}
                        onClick={() => handleCategoryClick(category.name)}
                        data-category={category.name}
                    />
                ))}
            </div>
        </div>
    );
}

// CategoryTab component for Products page
function CategoryTab({ category, isActive, onClick, ...props }) {
    return (
        <button
            {...props}
            className={`
                px-4 py-2 text-sm font-medium rounded-lg border whitespace-nowrap
                transition-all duration-200 relative min-w-fit
                ${isActive 
                    ? 'bg-red-500 text-white border-red-500 shadow-sm' 
                    : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:text-red-600'
                }
            `}
            onClick={onClick}
        >
            <span className="flex items-center gap-2">
                {category.name}
                <span className={`
                    text-xs px-2 py-0.5 rounded-full 
                    ${isActive 
                        ? 'bg-red-400 text-white' 
                        : 'bg-gray-100 text-gray-600'
                    }
                `}>
                    {category.count}
                </span>
            </span>
        </button>
    );
}
