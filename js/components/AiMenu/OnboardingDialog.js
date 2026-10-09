import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfile } from '../../contexts/ProfileContext.js';
import { useLanguage } from '../../contexts/LanguageContext.js';

const OnboardingDialog = ({ show, onComplete }) => {
    const { t } = useLanguage();
    const { profile, loading: profileLoading } = useProfile();
    const [step, setStep] = useState(0);
    const [isInclusive, setIsInclusive] = useState(false); // Default to exclusive
    const feeSlabs = [
        { upto: 100, charge: 0 },
        { upto: 500, charge: 5 },
        { charge: 10 },
    ];

    if (!show) {
        return null;
    }
    
    const handleComplete = () => {
        onComplete({ slabs: feeSlabs, inclusive: isInclusive });
    };

    const slides = [
        {
            // Slide 1: The Big Pitch
            content: () => (
                <div className="text-center">
                    <div className="inline-block bg-red-100 text-red-500 rounded-full p-5 mb-6">
                        <i className="ph ph-rocket-launch text-6xl"></i>
                    </div>
                    <h1 className="text-3xl font-extrabold text-gray-900">{t('aiMenuIncreaseSales')}</h1>
                    <p className="mt-3 text-lg text-gray-600 max-w-md mx-auto">{t('aiMenuBoostRevenue')}</p>
                </div>
            )
        },
        {
            // Slide 2: How it Works (Visual)
            content: () => (
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold text-gray-900">{t('aiMenuIntelligentUpselling')}</h1>
                    <p className="mt-3 text-lg text-gray-600">{t('aiMenuHowItWorks')}</p>
                    <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-3">
                                <i className="ph ph-plus-circle text-2xl text-blue-500"></i>
                            </div>
                            <h3 className="font-semibold text-gray-800">{t('aiMenuSmartUpsells')}</h3>
                            <p className="text-sm text-gray-600 mt-1">{t('aiMenuSuggestsAddons')}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-3">
                                <i className="ph ph-user-focus text-2xl text-green-500"></i>
                            </div>
                            <h3 className="font-semibold text-gray-800">{t('aiMenuPersonalizedPicks')}</h3>
                            <p className="text-sm text-gray-600 mt-1">{t('aiMenuRecommendsItems')}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center justify-center w-12 h-12 bg-yellow-100 rounded-lg mb-3">
                                <i className="ph ph-shopping-cart text-2xl text-yellow-500"></i>
                            </div>
                            <h3 className="font-semibold text-gray-800">{t('aiMenuCheckoutBoost')}</h3>
                            <p className="text-sm text-gray-600 mt-1">{t('aiMenuOffersItems')}</p>
                        </div>
                    </div>
                </div>
            )
        },
        {
            // Slide 3: Pricing
            content: () => (
                <div className="text-center">
                    <div className="inline-block bg-green-100 text-green-500 rounded-full p-5 mb-6">
                        <i className="ph ph-tag text-6xl"></i>
                    </div>
                    <h1 className="text-3xl font-extrabold text-gray-900">{t('aiMenuSimplePricing')}</h1>
                    <p className="mt-3 text-lg text-gray-600">{t('aiMenuSmallFee')}</p>
                    <div className="mt-8 max-w-sm mx-auto">
                        <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-4">
                            {feeSlabs.map((slab, index) => (
                                <div key={index} className="flex justify-between items-center bg-white p-3 rounded-md">
                                    <span className="text-gray-600 text-sm">
                                        {slab.upto
                                            ? `${t('aiMenuOrderUpTo')} ₹${slab.upto}`
                                            : `${t('aiMenuOrderAbove')} ₹${feeSlabs[index - 1]?.upto}`}
                                    </span>
                                    <span className="font-bold text-lg">₹{slab.charge}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex items-center justify-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={isInclusive} onChange={() => setIsInclusive(!isInclusive)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                                <span className="ml-3 font-medium text-sm text-gray-700">{t('aiMenuConvenienceFee')} {t('aiMenuInclusive')}</span>
                            </label>
                        </div>
                         <p className="text-xs text-gray-500 mt-2 text-center">{isInclusive ? t('aiMenuNoExtraCharges') : t('aiMenuWillBeAdded')}</p>
                    </div>
                </div>
            )
        }
    ];

    const currentSlide = slides[step];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl"
            >
                <div className="p-8 md:p-12 min-h-[420px] flex items-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            className="w-full"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                        >
                            {currentSlide.content()}
                        </motion.div>
                    </AnimatePresence>
                </div>
                <div className="px-8 py-4 bg-gray-50/75 border-t border-gray-200 flex justify-between items-center">
                    <div className="flex space-x-2">
                        {slides.map((_, i) => (
                            <div 
                                key={i} 
                                className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'bg-red-500 w-6' : 'bg-gray-300 w-2'}`}
                            ></div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <button onClick={() => setStep(step - 1)} className="text-gray-700 font-medium hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">
                                {t('aiMenuBack')}
                            </button>
                        )}
                        {step < slides.length - 1 ? (
                            <button onClick={() => setStep(step + 1)} className="bg-red-500 text-white font-bold px-6 py-2 rounded-lg hover:bg-red-600 transition-colors shadow-sm">
                                {t('aiMenuNext')}
                            </button>
                        ) : (
                            <button onClick={handleComplete} className="bg-green-500 text-white font-bold px-6 py-2 rounded-lg hover:bg-green-600 transition-colors shadow-sm">
                                {t('aiMenuGetStarted')}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default OnboardingDialog;