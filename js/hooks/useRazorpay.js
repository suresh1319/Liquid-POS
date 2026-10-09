import { useEffect, useState } from 'react';

export function useRazorpay() {
  const [Razorpay, setRazorpay] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.Razorpay) {
      setRazorpay(() => window.Razorpay);
      setIsLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;

    script.onload = () => {
      if (window.Razorpay) {
        setRazorpay(() => window.Razorpay);
      }
      setIsLoading(false);
    };

    script.onerror = () => {
      setError('Failed to load Razorpay SDK. Please check your internet connection.');
      setIsLoading(false);
    };

    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return { Razorpay, isLoading, error };
}
