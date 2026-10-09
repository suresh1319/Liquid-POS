import React, { useState, useEffect } from 'react';
import StrategyCard from './StrategyCard';
import StrategyEditDialog from './StrategyEditDialog';
import { FaLightbulb, FaShoppingCart } from 'react-icons/fa';
import { useProfile } from '../../contexts/ProfileContext.js';
import { sdk } from '../../sdk';
import { showToast } from '../../utils/toast';
import { useLanguage } from '../../contexts/LanguageContext.js';

export default function StrategyTab() {
  const { t } = useLanguage();
  const { profile } = useProfile();
  const [homeStrategy, setHomeStrategy] = useState(DEFAULT_HOME_STRATEGY);
  const [cartStrategy, setCartStrategy] = useState(DEFAULT_CART_STRATEGY);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentStrategy, setCurrentStrategy] = useState('');
  const [strategyType, setStrategyType] = useState(null);
  const [dialogTitle, setDialogTitle] = useState('');

  useEffect(() => {
    if (profile?.menu?.recommendationStrategy) {
      setHomeStrategy(profile.menu.recommendationStrategy);
    }
    if (profile?.menu?.cartStrategy) {
      setCartStrategy(profile.menu.cartStrategy);
    }
  }, [profile]);

  const openDialog = (type, title) => {
    setStrategyType(type);
    setCurrentStrategy(type === 'home' ? homeStrategy : cartStrategy);
    setDialogTitle(title);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setStrategyType(null);
    setCurrentStrategy('');
  };

  const handleSave = () => {
    const updatedMenu = {
      ...profile.menu,
      recommendationStrategy: strategyType === 'home' ? currentStrategy : homeStrategy,
      cartStrategy: strategyType === 'cart' ? currentStrategy : cartStrategy,
    };

    sdk.profile.update({ menu: updatedMenu }).catch(error => {
      console.error('Error saving strategy:', error);
      showToast('Failed to save strategy.', 'error');
    });

    if (strategyType === 'home') {
      setHomeStrategy(currentStrategy);
    } else {
      setCartStrategy(currentStrategy);
    }
    
    showToast('Strategy saved successfully!', 'success');
    closeDialog();
  };

  return (
    <div className="bg-gray-50 min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('aiMenuStrategyManagement')}</h1>
          <p className="mt-2 text-gray-600">
            {t('aiMenuStrategyDescription')}
          </p>
        </div>
        
        <div className="space-y-8">
          <StrategyCard
            title={t('aiMenuRecommendedForYou')}
            description={homeStrategy}
            onEdit={() => openDialog('home', 'Recommendation Strategy')}
            icon={<FaLightbulb className="h-6 w-6 text-primary" />}
          />
          <StrategyCard
            title={t('aiMenuYouMayLike')}
            description={cartStrategy}
            onEdit={() => openDialog('cart', 'Cart Strategy')}
            icon={<FaShoppingCart className="h-6 w-6 text-primary" />}
          />
        </div>

        <StrategyEditDialog
          isOpen={isDialogOpen}
          onClose={closeDialog}
          onSave={handleSave}
          strategy={currentStrategy}
          setStrategy={setCurrentStrategy}
          title={dialogTitle}
        />
      </div>
    </div>
  );
}

const DEFAULT_HOME_STRATEGY = 
`1. Personalization First  
   - Analyze the customer’s full order history.  
   - Suggest items that pair well with, upgrade, or complement those items.  

2. Upsell Priority  
   - Favor higher-margin categories: desserts, shakes, premium drinks, sides, combos.  
   - Suggest premium or larger upgrades to items they already ordered.  

3. Variety & Discovery  
   - Include some familiar pairings (safe bets).  
   - Add 2–3 items introducing the customer to new categories.  

4. Balance  
   - Do not suggest only heavy mains.  
   - Include a mix: sides, drinks, desserts, mains, snacks.  

5. Fallback  
   - If past orders are very limited, suggest generally popular items or house specials.  
`;

const DEFAULT_CART_STRATEGY = 
`1. Meal Completion  
   - If cart has a main → suggest drink + side + dessert.  
   - If cart has only drinks → suggest snacks or mains.  
   - If cart has desserts → suggest coffee, tea, or light sides.  

2. Add-ons & Companions  
   - Recommend sauces, fries, breads, small snacks, premium drinks.  
   - Suggest popular combos (burger + fries + cola).  

3. Balance  
   - Ensure a mix of categories (not 5 desserts, not 5 drinks).  
   - Include at least one dessert and one drink where possible.  

4. Business Logic  
   - Prioritize high-margin items (desserts, shakes, add-ons).  
   - Never suggest duplicate of an item already in the cart.  

5. Fallback  
   - If limited options, suggest house specials or premium upgrades.  
`;
