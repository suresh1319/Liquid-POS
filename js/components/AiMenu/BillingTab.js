import { useState, useEffect } from 'react';
import { useRazorpay } from '../../hooks/useRazorpay.js';
import { useProfile } from '../../contexts/ProfileContext.js';
import { sdk } from '../../sdk.js';
import { useLanguage } from '../../contexts/LanguageContext.js';

export default function BillingTab() {
  const { t } = useLanguage();
  const { profile, loading: profileLoading } = useProfile();
  const { Razorpay, isLoading: razorpayLoading, error: razorpayError } = useRazorpay();
  const [billingInfo, setBillingInfo] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (razorpayError) {
      setError('Failed to load Razorpay SDK. Please check your internet connection.');
      console.error('Razorpay loading error:', razorpayError);
    }
  }, [razorpayError]);

  useEffect(() => {
    if (profileLoading) {
      setIsLoading(true);
      return;
    }

    if (!profile) {
      setError('Failed to load profile information.');
      setIsLoading(false);
      return;
    }

    const getBillingData = () => {
      try {
        const feeSlabs = profile.activeSubs?.menu?.charges || [];

        // Calculate the next billing date dynamically.
        const today = new Date();
        const dayOfWeek = today.getDay(); // Sunday = 0
        const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
        
        const nextSunday = new Date();
        nextSunday.setDate(today.getDate() + daysUntilSunday);

        const nextBillingDate = nextSunday.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        const data = {
            nextBillingDate,
            feeSlabs,
            duePayment: profile.menuFee || 0,
        };
        
        setBillingInfo(data);
      } catch (err) {
        console.log("Failed to process billing information:", err);
        setError('Failed to process billing information.');
      } finally {
        setIsLoading(false);
      }
    };

    const getBillingHistory = async () => {
      if (!profile?.id) return;
      try {
        const paymentsSnapshot = await sdk.db.collection("Payments")
          .where("sid", "==", profile.id)
          .where("status", "==", "SUCCESS")
          .orderBy("createdAt", "desc")
          .get();

        const history = (paymentsSnapshot?.docs || []).map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBillingHistory(history);
      } catch (err) {
        console.error("Failed to fetch billing history:", err);
      }
    };

    getBillingData();
    getBillingHistory();
  }, [profile, profileLoading]);

  const handlePayDue = () => {
    if (!billingInfo || billingInfo.duePayment <= 0) {
      return;
    }
    setIsPaying(true);
    setError(null);

    try {
      // Create a new document in the 'payments' collection
      const paymentRef = sdk.db.collection("Payments").doc();
      
      if (!profile?.id || !billingInfo?.duePayment) {
        setError('Invalid billing information. Cannot process payment.');
        setIsPaying(false);
        return;
      }

      paymentRef.set({
        amount: billingInfo.duePayment,
        currency: 'INR',
        sid: profile.id,
        name: profile.businessName || 'Customer',
        email: profile.email || '',
        description: "Payment for outstanding due on AI Menu.",
        status: 'PENDING',
        type: 'due_payment',
        createdAt: new Date(),
      });

      // Listen for updates on the payment document
      const unsubscribe = paymentRef.onSnapshot(doc => {
        const data = doc?.data();
        if (data?.rpayOrder?.id) {
          unsubscribe(); // Stop listening for updates

          // Debug log the data structure
          console.log('Payment data received:', data);

          const options = {
            key: "rzp_live_RR4RFlLl4fA3gv",
            amount: Number(data.amount) * 100,
            currency: data.currency || 'INR',
            name: 'Shopto AI Menu',
            description: 'Payment for Outstanding Due',
            order_id: data.rpayOrder?.id,
            handler: function (response) {
              console.log('Payment successful:', response);
              paymentRef.update({
                status: 'SUCCESS',
                rpayResponse: response,
                updatedAt: new Date()
              }).then(() => {
                alert('Payment Successful! Your payment is being verified.');
                setBillingInfo(prev => ({ ...prev, duePayment: 0 }));
                setIsPaying(false);
              });
            },
            prefill: {
              name: profile?.businessName || profile?.name || 'Customer',
              email: profile?.email || '',
              contact: profile?.phone || '',
            },
            theme: {
              color: '#000000',
            },
            modal: {
                ondismiss: function() {
                    paymentRef.update({ status: 'CANCELLED', updatedAt: new Date() });
                    setIsPaying(false);
                }
            }
          };

          // Validate Razorpay availability
          if (!Razorpay) {
            console.error('Razorpay SDK not available:', { Razorpay, options });
            setError('Payment system is not ready. Please wait a moment and try again.');
            setIsPaying(false);
            return;
          }

          // Additional validation for amount
          if (options.amount <= 0) {
            console.error('Invalid amount:', { amount: options.amount, originalAmount: data.amount });
            setError('Invalid payment amount. Please contact support.');
            setIsPaying(false);
            return;
          }

          // Add debug logging
          console.log('Creating Razorpay instance with options:', options);

          try {
            const rzp = new Razorpay(options);
            rzp.open();
          } catch (error) {
            console.error('Razorpay instantiation error:', error);
            setError('Failed to initialize payment. Please try again.');
            setIsPaying(false);
          }
        }
      }, err => {
        console.error("onSnapshot error:", err);
        setError('Failed to listen for payment updates. Please try again.');
        setIsPaying(false);
        unsubscribe();
      });

    } catch (err) {
      console.error('Error processing Razorpay payment:', err);
      setError('Failed to process payment. Please try again.');
      setIsPaying(false);
    }
  };

  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  if (isLoading) {
    return <div className="p-6 text-center">Loading billing details...</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-600">{error}</div>;
  }

  if (!billingInfo) {
    return <div className="p-6 text-center">Could not load billing information.</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-4">{t('aiMenuBillingTitle')}</h1>
        <p className="text-lg text-gray-600 mb-8">{t('aiMenuBillingDescription')}</p>

        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">{t('aiMenuOutstandingBalance')}</h2>
          <p className="text-4xl font-bold text-red-600">{formatCurrency(billingInfo.duePayment)}</p>
          <p className="text-sm text-gray-500 mt-2">{t('aiMenuDueBy')} {billingInfo.nextBillingDate}</p>
          {billingInfo.duePayment > 0 && (
            <button
              onClick={handlePayDue}
              disabled={isPaying || razorpayLoading || !Razorpay}
              className="mt-4 w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition duration-300 ease-in-out disabled:bg-gray-400"
            >
              {isPaying || razorpayLoading ? t('aiMenuProcessing') : `${t('aiMenuPayNow')} ${formatCurrency(billingInfo.duePayment)}`}
            </button>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">{t('aiMenuSubscriptionDetails')}</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">{t('aiMenuFeeStructure')}</p>
                <p className="text-lg font-semibold text-gray-900">{t('aiMenuPerOrderCharge')}</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-500">{t('aiMenuConvenienceFee')}</p>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      profile.activeSubs?.menu?.inclusive 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {profile.activeSubs?.menu?.inclusive ? t('aiMenuInclusive') : t('aiMenuExclusive')}
                  </span>
                </div>
                <div className="mt-2 space-y-2 text-gray-700 border-t pt-2">
                  {billingInfo.feeSlabs.map((slab, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>
                        {slab.upto
                          ? `${t('aiMenuOrderTotalUpTo')} ₹${slab.upto}`
                          : index > 0
                            ? `${t('aiMenuOrderTotalAbove')} ₹${billingInfo.feeSlabs[index - 1]?.upto}`
                            : `${t('aiMenuOrderTotalAbove')} ₹0`
                        }
                      </span>
                      <span className="font-semibold">₹{slab.charge}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  {profile.activeSubs?.menu?.inclusive
                    ? t('aiMenuInclusiveDescription')
                    : t('aiMenuExclusiveDescription')}
                </p>
              </div>
            </div>
        </div>

        <div className="mt-12 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">{t('aiMenuBillingHistory')}</h2>
          {billingHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('aiMenuDate')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('aiMenuDescription')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('aiMenuAmount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {billingHistory.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payment.createdAt?.seconds
                          ? new Date(payment.createdAt.seconds * 1000).toLocaleString()
                          : payment.createdAt
                            ? new Date(payment.createdAt).toLocaleString()
                            : 'Unknown date'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600">{t('aiMenuPastTransactions')}</p>
          )}
        </div>
      </div>
    </div>
  );
}