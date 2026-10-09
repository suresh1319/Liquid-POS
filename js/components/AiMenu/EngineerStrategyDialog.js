import { useState } from 'react';
import { sdk } from '../../sdk.js';
import { showToast } from '../../utils.js';
import { useProfile } from '../../contexts/ProfileContext.js';
import ProductReviewDialog from './ProductReviewDialog.js';

// Default instructions template for menu engineering
const DEFAULT_INSTRUCTIONS = `For each item, consider the following:
- Cheese slice add-ons: Only for sandwich items
- Skip combo meals entirely
- Exclude salad items (not available)
- Standard pricing:
    - Extra Chicken Pieces (100g): ₹50
    - Extra Gravy: ₹30
    - Extra Sauce: ₹20`;

export default function EngineerStrategyDialog({ open, onClose, onGenerationComplete }) {
    const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedData, setGeneratedData] = useState(null);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const { profile } = useProfile();

    const handleSubmit = async () => {
        if (!instructions || !instructions.trim()) {
            showToast('Please provide specific instructions for menu engineering.', 'warning');
            return;
        }

        if (!profile?.id) {
            showToast('Profile information not available. Please try again.', 'error');
            return;
        }

        setIsGenerating(true);
        try {
            // Call the menu engineering function with seller ID
            const functionUrl = 'https://us-central1-frihbi-app.cloudfunctions.net/menu-generateMenuEngineering';
            
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sellerId: profile.id,
                    instructions: instructions.trim()
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Menu engineering result:', data);
            
            // Store the generated data and open review dialog
            setGeneratedData(data);
            setIsReviewDialogOpen(true);
            
            showToast('Menu engineering completed! Review the generated products.', 'success');
        } catch (error) {
            console.error('Error calling menu engineering:', error);
            showToast('Failed to generate menu engineering. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleReviewComplete = () => {
        setIsReviewDialogOpen(false);
        setGeneratedData(null);
        setInstructions('');
        onGenerationComplete();
        onClose();
    };

    const handleReviewCancel = () => {
        setIsReviewDialogOpen(false);
        // Keep the main dialog open so user can regenerate or modify instructions
    };

    if (!open) return null;

    return (
        <>
            <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
                <div
                    className={`fixed top-0 right-0 h-full bg-white shadow-xl w-full max-w-md flex flex-col transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6 flex-grow flex flex-col">
                        <h2 className="text-xl font-semibold mb-4">Engineer Menu Options</h2>
                        <div className="flex-grow flex flex-col">
                            <label htmlFor="instructions" className="block text-sm font-medium text-gray-700 mb-2">
                                Specific Instructions
                            </label>
                            <textarea
                                id="instructions"
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-sm flex-grow resize-none"
                                placeholder="Enter your specific instructions for menu generation..."
                                value={instructions}
                                onChange={e => setInstructions(e.target.value)}
                                rows={8}
                            ></textarea>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button 
                                onClick={onClose} 
                                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700"
                                disabled={isGenerating}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 flex items-center disabled:bg-red-300 disabled:cursor-not-allowed"
                                disabled={!instructions.trim() || isGenerating}
                            >
                                {isGenerating && <div className="animate-spin mr-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                                {isGenerating ? 'Processing...' : 'Generate Menu'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <ProductReviewDialog
                open={isReviewDialogOpen}
                onClose={handleReviewCancel}
                generatedData={generatedData}
                onImportComplete={handleReviewComplete}
            />
        </>
    );
}