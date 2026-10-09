import { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (!context) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
};

export const CurrencyProvider = ({ children }) => {
    const [displayCurrency, setDisplayCurrency] = useState('INR');

    // Listen for global currency changes
    useEffect(() => {
        const handleCurrencyChange = (event) => {
            if (event.detail && event.detail.newCurrency) {
                setDisplayCurrency(event.detail.newCurrency);
            }
        };

        window.addEventListener('currencyChanged', handleCurrencyChange);
        
        return () => {
            window.removeEventListener('currencyChanged', handleCurrencyChange);
        };
    }, []);

    const changeCurrency = (newCurrency) => {
        setDisplayCurrency(newCurrency);
        
        // Dispatch event for other components
        const event = new CustomEvent('employeeCurrencyChanged', {
            detail: { 
                oldCurrency: displayCurrency, 
                newCurrency: newCurrency 
            }
        });
        window.dispatchEvent(event);
    };

    return (
        <CurrencyContext.Provider value={{
            displayCurrency,
            setDisplayCurrency: changeCurrency
        }}>
            {children}
        </CurrencyContext.Provider>
    );
};