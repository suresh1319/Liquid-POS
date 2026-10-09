import { useEffect, useState } from 'react';
import { sdk } from '../sdk.js';
import { Product } from '../models/Product.js';
import Tabs from '../components/AiMenu/Tabs.js';
import DashboardTab from '../components/AiMenu/DashboardTab.js';
import MenuTab from '../components/AiMenu/MenuTab.js';
import StrategyTab from '../components/AiMenu/StrategyTab.js';
import BillingTab from '../components/AiMenu/BillingTab.js';
import OnboardingDialog from '../components/AiMenu/OnboardingDialog.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { useLanguage } from '../contexts/LanguageContext.js';

export default function AiMenuPage() {
    const { t } = useLanguage();
    const [products, setProducts] = useState([]);
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [showOnboarding, setShowOnboarding] = useState(false);
    const { profile, fetchProfile, loading } = useProfile();

      useEffect(() => {
        console.log('Slabs:', profile.activeSubs);

        // Show onboarding if profile is loaded and charges are not set
        if (!loading && profile && !profile.activeSubs?.menu?.charges) {
            setShowOnboarding(true);
        }

        // Set up real-time listener for products
        const unsubscribe = sdk.db.collection("Product").onSnapshot((snapshot) => {
            const productsList = snapshot.docs.map(doc => Product.fromDoc(doc)).filter(Boolean);
            setProducts(productsList);
        }, (err) => {
            console.log('Error listening to product updates:', err);
        });

        // Cleanup listener on component unmount
        return () => unsubscribe();
    }, [profile]);

    const handleOnboardingComplete = async ({ slabs, inclusive }) => {
        try {
            const menuSubscription = {
                ...profile.activeSubs?.menu,
                charges: slabs,
                inclusive: inclusive,
            };
            
            const activeSubs = {
                ...profile.activeSubs,
                menu: menuSubscription,
            };

            await sdk.profile.update({ activeSubs });
            
            setShowOnboarding(false);
            // Refresh profile data to reflect the changes
            fetchProfile();
        } catch (error) {
            console.error("Failed to save AI menu subscription details:", error);
        }
    };

    const tabs = [
        { name: 'Dashboard', label: t('aiMenuDashboard') },
        { name: 'Menu', label: t('aiMenuMenu') },
        { name: 'Strategy', label: t('aiMenuStrategy') },
        { name: 'Billing', label: t('aiMenuBilling') },
    ];

    return (
        <>
            <OnboardingDialog show={showOnboarding} onComplete={handleOnboardingComplete} />
            <div className="p-6 space-y-6">
                <Tabs tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} />
                <div className="mt-6">
                    {activeTab === 'Dashboard' && <DashboardTab />}
                    {activeTab === 'Menu' && <MenuTab products={products} />}
                    {activeTab === 'Strategy' && <StrategyTab />}
                    {activeTab === 'Billing' && <BillingTab />}
                </div>
            </div>
        </>
    );
}