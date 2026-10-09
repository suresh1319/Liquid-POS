import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';

export function OCRImportModal({ isOpen, onClose, onImport }) {
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [extractedText, setExtractedText] = useState('');
    const [products, setProducts] = useState([]);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        setSelectedFiles(files);
        setError('');
        setExtractedText('');
        setProducts([]);
    };

    const processFilesWithOCR = async () => {
        if (selectedFiles.length === 0) {
            setError('Please select at least one file');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setError('');

        try {
            let allText = '';

            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                setProgress(Math.round((i / selectedFiles.length) * 100));

                // For PDF files, we would need to convert to images first
                // For simplicity, we'll handle images directly
                if (file.type.startsWith('image/')) {
                    const result = await Tesseract.recognize(file, 'eng', {
                        logger: (m) => {
                            if (m.status === 'recognizing text') {
                                setProgress(Math.round(((i + m.progress) / selectedFiles.length) * 100));
                            }
                        }
                    });
                    allText += result.data.text + '\n\n';
                } else if (file.type === 'application/pdf') {
                    // For PDF, we would need additional libraries like pdfjs-dist
                    // For now, we'll show a message
                    allText += `[PDF file detected: ${file.name} - Would be processed with PDF extraction library]\n\n`;
                } else {
                    throw new Error(`Unsupported file type: ${file.type}`);
                }
            }

            setProgress(100);
            setExtractedText(allText);
            parseProductsFromText(allText);
        } catch (err) {
            setError(`Error processing files: ${err.message}`);
            console.error('OCR Error:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    const parseProductsFromText = (text) => {
        // Simple parsing logic - in a real implementation, this would be more sophisticated
        // This is a basic example that looks for patterns like "Product Name - Price"
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const parsedProducts = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Simple regex to match product name and price (e.g., "Burger - $5.99")
            const priceRegex = /(.+?)\s*[-–—]\s*[$₹€£]?\s*(\d+(?:\.\d+)?)/i;
            const match = line.match(priceRegex);

            if (match) {
                parsedProducts.push({
                    name: match[1].trim(),
                    price: parseFloat(match[2]),
                    category: 'Uncategorized',
                    description: ''
                });
            }
        }

        setProducts(parsedProducts);
    };

    const handleImportProducts = () => {
        if (products.length > 0) {
            onImport(products);
            onClose();
        } else {
            setError('No products found. Please try another image or adjust the parsing.');
        }
    };

    const resetModal = () => {
        setSelectedFiles([]);
        setExtractedText('');
        setProducts([]);
        setError('');
        setProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleClose = () => {
        resetModal();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Import Products via OCR</h2>
                        <button
                            onClick={handleClose}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <i className="ph ph-x text-2xl"></i>
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center">
                                <i className="ph ph-warning text-red-500 text-xl mr-2"></i>
                                <span className="text-red-700">{error}</span>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column - File Upload and OCR Processing */}
                        <div>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Upload Menu Images or PDFs
                                </label>
                                <div
                                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-red-400 transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <i className="ph ph-file-image text-4xl text-gray-400 mb-3"></i>
                                    <p className="text-gray-600 mb-2">
                                        {selectedFiles.length > 0
                                            ? `${selectedFiles.length} file(s) selected`
                                            : 'Click to upload images or PDFs'}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        Supported formats: JPG, PNG, PDF
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,.pdf"
                                        multiple
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </div>
                            </div>

                            {selectedFiles.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-medium text-gray-800 mb-2">Selected Files:</h3>
                                    <div className="space-y-2 max-h-32 overflow-y-auto">
                                        {selectedFiles.map((file, index) => (
                                            <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                                                <span className="text-sm text-gray-700 truncate">{file.name}</span>
                                                <span className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={processFilesWithOCR}
                                disabled={isProcessing || selectedFiles.length === 0}
                                className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center ${isProcessing || selectedFiles.length === 0
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-red-500 text-white hover:bg-red-600'
                                    }`}
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                                        Processing... {progress}%
                                    </>
                                ) : (
                                    <>
                                        <i className="ph ph-magic-wand mr-2"></i>
                                        Extract Products with OCR
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Right Column - Results */}
                        <div>
                            {extractedText && (
                                <div className="mb-6">
                                    <h3 className="font-medium text-gray-800 mb-2">Extracted Text:</h3>
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                                        <pre className="text-xs text-gray-600 whitespace-pre-wrap">{extractedText}</pre>
                                    </div>
                                </div>
                            )}

                            {products.length > 0 && (
                                <div>
                                    <h3 className="font-medium text-gray-800 mb-2">
                                        Found {products.length} Product{products.length !== 1 ? 's' : ''}
                                    </h3>
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                                        <div className="space-y-2">
                                            {products.map((product, index) => (
                                                <div key={index} className="flex justify-between items-center p-2 bg-white rounded border">
                                                    <div>
                                                        <div className="font-medium text-gray-800">{product.name}</div>
                                                        <div className="text-sm text-gray-600">₹{product.price.toFixed(2)}</div>
                                                    </div>
                                                    <div className="text-xs bg-gray-100 px-2 py-1 rounded">
                                                        {product.category}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {products.length > 0 && (
                                <button
                                    onClick={handleImportProducts}
                                    className="w-full mt-4 py-3 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 flex items-center justify-center"
                                >
                                    <i className="ph ph-check mr-2"></i>
                                    Import {products.length} Product{products.length !== 1 ? 's' : ''}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="text-sm text-gray-600">
                            <p className="mb-2"><strong>How it works:</strong></p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Upload clear images or PDFs of your menu cards</li>
                                <li>Our OCR technology will extract text from the images</li>
                                <li>Products with prices will be automatically detected</li>
                                <li>Review and import the extracted products</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}