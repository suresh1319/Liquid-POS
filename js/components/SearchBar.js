import React, { useState, useEffect, useRef, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const SearchBar = ({ searchQuery, setSearchQuery, filterType, setFilterType, startDate, endDate, setDateRange }) => {
    const [localInput, setLocalInput] = useState(searchQuery || '');
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    // ✅ Only update local input if parent searchQuery is cleared
    useEffect(() => {
        if (!searchQuery) {
            setLocalInput('');
        }
    }, [searchQuery]);

    // Debounced search function
    const debouncedSearch = useCallback((value) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        
        debounceRef.current = setTimeout(() => {
            setSearchQuery((value || '').trim());
        }, 100); // 300ms debounce delay
    }, [setSearchQuery]);

    const commitSearch = () => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        setSearchQuery((localInput || '').trim());
    };

    const clearSearch = () => {
        setLocalInput('');
        setSearchQuery('');
    };

    return (
        <div className="flex items-center bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            <div className="flex-1 relative">
                <i className="ph ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={localInput}
                    onChange={(e) => {
                        const value = e.target.value;
                        setLocalInput(value);
                        debouncedSearch(value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commitSearch();
                        }
                    }}
                    placeholder="Search customers..."
                    className="w-full pl-12 pr-4 py-3.5 border-none focus:outline-none text-gray-700"
                />
            </div>
            <div className="border-l border-gray-100 px-4 flex items-center">
                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="border-none bg-transparent outline-none text-gray-700 py-2 pr-6 appearance-none"
                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23718096\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', paddingRight: '1.5rem' }}
                >
                    <option value="all">All</option>
                    <option value="creditors">Creditors</option>
                </select>
            </div>
            <div className="border-l border-gray-100 px-4 flex items-center">
                <DatePicker
                    selectsRange
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(update) => setDateRange(update)}
                    isClearable={true}
                    placeholderText="Filter by date range"
                    className="py-2 px-3 border-none outline-none text-gray-700 bg-transparent"
                    calendarClassName="z-50"
                />
            </div>
            <div className="border-l border-gray-100 px-2 flex items-center">
                <button
                    type="button"
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                    onMouseDown={(e) => e.preventDefault()} // ✅ keep input focused
                    onClick={() => {
                        commitSearch();
                        try { inputRef.current && inputRef.current.focus(); } catch (e) {}
                    }}
                    aria-label="Apply search"
                >
                    <i className="ph ph-magnifying-glass" />
                </button>
            </div>

            {(localInput || searchQuery) && (
                <button
                    className="pr-4 pl-2 hover:text-gray-700 transition-colors"
                    onClick={clearSearch}
                    aria-label="Clear search"
                >
                    <i className="ph ph-x text-gray-500" />
                </button>
            )}
        </div>
    );
};

export default SearchBar;