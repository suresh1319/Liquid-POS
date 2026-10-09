import { useState } from 'react';
import { sdk } from '../../sdk.js';
import { showToast } from '../../utils.js';

const PREFILLED_STRATEGY = 
`1. Variations & Add-ons First (Top Priority)
   - Your number one priority is to suggest add-ons and variations of the same product.
   - First check if suitable add-ons exist in the menu dataset.
   - If no perfect add-ons exist, create new sensible ones (extra cheese, special sauces, combo upgrades, etc.).
   - Variations include different sizes, toppings, or preparations.
   - Add-ons include drinks, sides, sauces, dips, bread, fries, desserts, etc.
   - These are low-friction items that enhance the main product.

2. Price Sensitivity
   - Prefer items cheaper than the input product (commonly ≤ 40% of input price).
   - If fewer than 5 exist, gradually relax to ≤ 70% of input price.

3. Complementarity
   - Match by taste, temperature, texture, or role in the meal.
   - Examples: a spicy dish → cooling drink; heavy entrée → light salad; savory main → dessert.

4. Diversity
   - Aim for category variety when possible (e.g., 1 drink, 1 side, 1 dessert).
   - Do not repeat the same category unless unavoidable.

5. Business-Friendly Choices
   - If tie, prefer items that drive higher margins (desserts, sides, combos).
   - Never break the "Variations & Add-ons first" principle.

6. Fallback: Sensible Upsell/Cross-sell
   - Only as a fallback, if no suitable variations or add-ons are found, suggest other sensible upsell or cross-sell items.
   - Always ensure 5 distinct, reasonable items.
`;

export default function SuggestionStrategyDialog({ open, onClose, selectedProducts, onGenerationComplete }) {
    const [strategy, setStrategy] = useState(PREFILLED_STRATEGY);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleSubmit = async () => {
        if (!strategy || !strategy.trim()) {
            showToast('Please provide a suggestion strategy.', 'warning');
            return;
        }

        setIsGenerating(true);
        try {
            const batch = sdk.db.firestore.batch();

            selectedProducts.forEach(productId => {
                const productRef = sdk.db.collection("Product").doc(productId);
                batch.update(productRef, {
                    'suggestion.requested': new Date(),
                    'suggestion.strategy': strategy.trim()
                });
            });

            await batch.commit();

            showToast(`Successfully generated suggestions for ${selectedProducts.length} products.`, 'success');
            onGenerationComplete();
        } catch (error) {
            console.log("Error generating suggestions:", error);
            showToast('Failed to generate suggestions.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
            <div
                className={`fixed top-0 right-0 h-full bg-white shadow-xl w-full max-w-md flex flex-col transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 flex-grow flex flex-col">
                    <h2 className="text-xl font-semibold mb-4">Generate Suggestion</h2>
                    <div className="flex-grow flex flex-col">
                        <label htmlFor="strategy" className="block text-sm font-medium text-gray-700 mb-2">
                            Suggestion Strategy
                        </label>
                        <textarea
                            id="strategy"
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-sm flex-grow"
                            placeholder="e.g., 'Promote as a combo with our best-selling drink.'"
                            value={strategy}
                            onChange={e => setStrategy(e.target.value)}
                        ></textarea>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300">
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 flex items-center disabled:bg-red-300 disabled:cursor-not-allowed"
                            disabled={!strategy.trim() || isGenerating}
                        >
                            {isGenerating && <div className="animate-spin mr-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                            Generate ({selectedProducts.length})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}