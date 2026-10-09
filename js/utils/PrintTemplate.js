import { ChargesCalculator } from './ChargesCalculator.js';
import { formatProductTitle } from '../utils.js';
import { UserSession } from './UserSession.js';



/**
 * PrintSection represents a section of content in a receipt template
 * with its own formatting options
 */
export class PrintSection {
    constructor(options = {}) {
        this.template = options.template || '';
        this.alignment = options.alignment || 'TextAlign.left';
        this.fontSize = options.fontSize || 20;
        this.isBold = options.isBold || false;
        this.variables = {};
    }

    /**
     * Process content variables and replace with actual values
     * @returns {string} Processed content with variables replaced
     */
    resolveVariables() {
        if (!this.template) return '';

        let result = this.template;

        // Sort variables by key length (descending) to handle longer names first
        // This prevents partial replacements like #cgst being replaced by #cg first
        const sortedVariables = Object.entries(this.variables)
            .sort(([a], [b]) => b.length - a.length);

        // Replace all variable placeholders with their values
        sortedVariables.forEach(([key, value]) => {
            const placeholder = `#${key}`;
            if (result.includes(placeholder)) {
                // If the value is undefined, empty string or just whitespace, replace with empty string
                const replacement = (value === undefined || value === null || String(value).trim() === '') ? '' : value;
                result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
            }
        });

        // Clean up any lines that only contain an empty placeholder or whitespace
        result = result.split('\n')
            .filter(line => line.trim() !== '' && !line.trim().startsWith('#'))
            .join('\n');

        return result;
    }

    /**
     * Generate HTML representation of this section for preview or printing
     * @returns {string} HTML content
     */
    toHTML() {
        const content = this.resolveVariables();
        if (!content.trim()) return '';

        // Map alignment to Tailwind classes
        let alignClass;
        switch (this.alignment) {
            case 'TextAlign.center': alignClass = 'text-center'; break;
            case 'TextAlign.right': alignClass = 'text-right'; break;
            default: alignClass = 'text-left'; break;
        }

        // Map font size and bold to Tailwind classes with more granular sizing
        // Using inline styles for precise font size control to ensure visual differences
        let fontSizeStyle = '';
        switch(this.fontSize) {
            case 30: fontSizeStyle = 'font-size: 20px;'; break;
            case 28: fontSizeStyle = 'font-size: 19px;'; break;
            case 26: fontSizeStyle = 'font-size: 18px;'; break;
            case 24: fontSizeStyle = 'font-size: 17px;'; break;
            case 22: fontSizeStyle = 'font-size: 16px;'; break;
            case 20: fontSizeStyle = 'font-size: 14px;'; break;
            case 18: fontSizeStyle = 'font-size: 13px;'; break;
            case 16: fontSizeStyle = 'font-size: 12px;'; break;
            case 14: fontSizeStyle = 'font-size: 11px;'; break;
            case 12: fontSizeStyle = 'font-size: 10px;'; break;
            default: 
                // Fallback to relative sizing for other values
                if (this.fontSize > 30) {
                    fontSizeStyle = 'font-size: 20px;';
                } else if (this.fontSize > 26) {
                    fontSizeStyle = 'font-size: 19px;';
                } else if (this.fontSize > 24) {
                    fontSizeStyle = 'font-size: 18px;';
                } else if (this.fontSize > 22) {
                    fontSizeStyle = 'font-size: 17px;';
                } else if (this.fontSize > 20) {
                    fontSizeStyle = 'font-size: 16px;';
                } else if (this.fontSize > 18) {
                    fontSizeStyle = 'font-size: 13px;';
                } else if (this.fontSize > 16) {
                    fontSizeStyle = 'font-size: 12px;';
                } else if (this.fontSize > 14) {
                    fontSizeStyle = 'font-size: 11px;';
                } else {
                    fontSizeStyle = 'font-size: 10px;';
                }
        }
        
        const boldClass = this.isBold ? 'font-bold' : '';

        let html = `<div class="${alignClass} ${boldClass} w-full whitespace-pre-wrap overflow-hidden my-1" style="${fontSizeStyle}">`;

        // Process each line individually
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            if (line.trim()) {
                html += `${line}${index < lines.length - 1 ? '<br>' : ''}`;
            }
        });

        html += `</div>`;

        return html;
    }
}

export class PrintTemplate {
    /**
     * Create a new PrintTemplate
     * @param {Object} options - Options for template creation
     * @param {string} options.type - 'bill' or 'kot'
     * @param {number} options.printerWidth - The printer width in characters
     * @param {Array} options.sections - Array of section configurations
     * @param {Object} options.orderData - Order data for context-specific templates
     * @param {Object} options.seller - Seller data with business information
     * @param {Object} options.templateData - Custom template data (optional)
     */
    constructor(options = {}) {
        const {
            type = 'bill',
            printerWidth = 48,
            sections = [],
            orderData = {},
            seller = {},
            templateData = null
        } = options;

        this.type = type;
        this.printerWidth = printerWidth;
        this.encoder = new TextEncoder();
        this.variables = {};

        // Initialize sections based on provided template data, sections, or defaults
        if (templateData) {
            this.type = templateData.type || type;
            this.sections = (templateData.sections || []).map(section => new PrintSection(section));
        } else if (sections && sections.length > 0) {
            this.sections = sections.map(section => new PrintSection(section));
        } else {
            // Create default template based on type
            this.sections = this.type.toLowerCase() === 'kot'
                ? this._createDefaultKOTSections(orderData)
                : this._createDefaultBillSections(orderData);
        }

        // Ensure loyalty placeholders are present in the template.
        // Some sellers may have custom templates that omit loyalty placeholders;
        // append a small loyalty section so "Loyalty Points Used" and
        // "Loyalty Discount" always appear on printed bills (even if 0).
        try {
            const hasLoyaltyPlaceholder = this.sections.some(sec => {
                try {
                    return typeof sec.template === 'string' && (
                        sec.template.includes('#loyaltyPointsUsed') || sec.template.includes('#loyaltyDiscountAmount')
                    );
                } catch (e) {
                    return false;
                }
            });

            if (!hasLoyaltyPlaceholder && this.type.toLowerCase() === 'bill') {
                const loyaltySection = new PrintSection({
                    template: `Loyalty Points Used: #loyaltyPointsUsed`,
                    alignment: 'TextAlign.left',
                    fontSize: 16,
                    isBold: false
                });
                this.sections.push(loyaltySection);
            }
        } catch (e) {
            // Non-fatal: if anything goes wrong, don't prevent printing
            console.warn('Failed to ensure loyalty section on template', e);
        }

        // Process order data if provided
        if (orderData && Object.keys(orderData).length > 0) {
            this.processOrderData(orderData, { seller });
        }
    }

    /**
     * Process order data and prepare template variables
     * @param {Object} orderData - The order data
     * @param {Object} options - Additional options (seller info)
     */
    processOrderData(orderData, options = {}) {
        const { seller = {} } = options;

        // Generate variables from order data
        this.variables = this._prepareVariablesFromOrder(orderData, seller);

        // Apply variables to all sections
        this.sections.forEach(section => {
            section.variables = this.variables;
        });

        // If the template doesn't contain explicit CGST/SGST placeholders
        // but the order contains cgst/sgst values, inject a small tax
        // section so the printed bill always shows those lines.
        try {
            const hasTaxPlaceholder = this.sections.some(sec => {
                try {
                    const t = typeof sec.template === 'string' ? sec.template : '';
                    return t.includes('#cgst') || t.includes('#cgstLine') || t.includes('#sgst') || t.includes('#sgstLine');
                } catch (e) {
                    return false;
                }
            });

            // Only inject when tax values exist and no placeholder found, but not for KOT templates
            if (this.type.toLowerCase() !== 'kot' && !hasTaxPlaceholder && (this.variables.cgstLine || this.variables.sgstLine)) {
                const taxSection = new PrintSection({
                    template: `#cgstLine\n#sgstLine`,
                    alignment: 'TextAlign.right',
                    fontSize: 18,
                    isBold: false
                });

                // Try to insert before a footer-like section ("Thank You"), otherwise append
                let insertIndex = this.sections.findIndex(sec => typeof sec.template === 'string' && sec.template.includes('Thank You'));
                if (insertIndex === -1) insertIndex = this.sections.length; // append
                this.sections.splice(insertIndex, 0, taxSection);

                // Ensure the variables are applied to the new section
                taxSection.variables = this.variables;
            }
        } catch (e) {
            // Non-fatal: don't block printing if this fails
            console.warn('Failed to inject tax section for CGST/SGST', e);
        }
    }

    /**
     * Generate HTML for the template as a complete HTML document
     * @returns {string} Complete HTML document ready for preview or printing
     */
    toHTML() {
        // Generate the content HTML
        let contentHtml = `<div class="printer-container w-full max-w-[58mm] mx-auto p-0 text-black">`;

        this.sections.forEach(section => {
            const sectionHtml = section.toHTML();
            if (sectionHtml) {
                contentHtml += sectionHtml;
                contentHtml += `<div class="border-b border-dashed border-gray-300"></div>`;
            }
        });

        contentHtml += `</div>`;

        // Return a complete HTML document; include Inter font for consistency in iframe/printing
        return `
            <html>
                <head>
                    <title>${this.type === 'kot' ? 'KOT Preview' : 'Bill Preview'}</title>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        body { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
                        .printer-container { font-family: inherit; font-size: 12px; }
                    </style>
                </head>
                <body>${contentHtml}</body>
            </html>
        `;
    }

    /**
     * Generate complete ESC/POS commands for all sections
     * @returns {Promise<Uint8Array>} Complete command bytes
     */
    async toPrinterCommands() {
        // Get HTML content from toHTML method
        const htmlContent = this.toHTML();

        // Create an iframe to render the HTML
        const iframe = document.createElement('iframe');
        iframe.style.visibility = 'hidden';
        iframe.style.position = 'absolute';
        document.body.appendChild(iframe);

        // Attach onload before writing to avoid missing the event
        const waitForLoad = new Promise(resolve => {
            iframe.onload = () => resolve();
            // Fallback timeout in case onload never fires (rare)
            setTimeout(resolve, 1000);
        });

        // Write HTML content to iframe with additional styles to remove margins
        iframe.contentDocument.open();
        iframe.contentDocument.write(htmlContent);
        iframe.contentDocument.close();

        // Wait for iframe content to load any images
        await waitForLoad;

        // Get the printer container element directly
        const receiptContent = iframe.contentDocument.querySelector('.printer-container');

        // Render any QR placeholders (.lp-qr) into canvases before measuring/screenshotting
        try {
            const qrNodes = receiptContent.querySelectorAll('.lp-qr');
            if (qrNodes && qrNodes.length) {
                qrNodes.forEach(node => {
                    const text = node.getAttribute('data-qr-text');
                    const size = parseInt(node.getAttribute('data-size') || '128', 10);
                    if (!text) return;
                    // Use QRCode library from parent window if available
                    if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
                        node.innerHTML = '';
                        const canvas = iframe.contentDocument.createElement('canvas');
                        node.appendChild(canvas);
                        try {
                            window.QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, (err) => {
                                if (err) console.warn('QR render error during printing:', err);
                            });
                        } catch (err) {
                            console.warn('Failed to render QR during printing:', err);
                        }
                    } else {
                        // Fallback: remote QR image
                        node.innerHTML = '';
                        const img = iframe.contentDocument.createElement('img');
                        img.width = size; img.height = size; img.alt = 'QR';
                        const enc = encodeURIComponent(text);
                        const src1 = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&data=${enc}`;
                        const src2 = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chld=L|1&chl=${enc}`;
                        img.src = src1;
                        img.onerror = () => { img.onerror = null; img.src = src2; };
                        node.appendChild(img);
                    }
                });
            }
        } catch (e) {
            console.warn('QR post-processing in print iframe failed:', e);
        }

        // Force a layout calculation to ensure accurate dimensions
        receiptContent.style.margin = '0';
        receiptContent.style.padding = '0';

        // Wait a bit for layout to stabilize and ensure styles are applied
        await new Promise(resolve => setTimeout(resolve, 100));
        // Additional frame to flush layout
        if (iframe.contentWindow && typeof iframe.contentWindow.requestAnimationFrame === 'function') {
            await new Promise(r => iframe.contentWindow.requestAnimationFrame(() => r()));
        }

        // Get the content dimensions after layout is stable
        const width = receiptContent.offsetWidth;
        const height = receiptContent.offsetHeight;

        console.log(`Receipt content dimensions: ${width}x${height}`);

        // Check if modern-screenshot is available
        if (typeof modernScreenshot === 'undefined') {
            console.error('modern-screenshot library is required but not loaded');
            throw new Error('modern-screenshot library is required');
        }

        // Capture the receipt content as PNG - capture only the container, not the body
        const pngDataUrl = await modernScreenshot.domToPng(receiptContent, {
            width: width,
            height: height,
            backgroundColor: '#FFFFFF',
        });

        // // Open preview window
        // this._openPreviewWindow(pngDataUrl, receiptContent);

        // Clean up
        if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }

        // Generate ESC/POS commands for printing the image
        const commands = [];

        // Initialize printer
        commands.push(0x1B, 0x40); // ESC @ - Initialize printer

        // Set print density and print speed to maximum density
        commands.push(0x1D, 0x28, 0x4B, 0x02, 0x00, 0x32, 0x04); // GS ( K pL pH fn m (density=4, highest)

        // Set print density to highest level for darker print
        commands.push(0x1D, 0x7C, 0x08); // GS | n - Set print density to maximum (8)

        // Create a temporary canvas to process the image
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = pngDataUrl;
        });

        // Calculate optimal printer width in pixels (standard thermal printer is 384px)
        const printerWidthPx = 384;

        // Create canvas with full printer width
        const canvas = document.createElement('canvas');

        // Use the content width we already have for scaling calculation
        const scaleFactor = printerWidthPx / width;

        canvas.width = printerWidthPx;
        canvas.height = Math.round(height * scaleFactor);

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw image scaled to fill width
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Apply contrast enhancement
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Enhance contrast for better printing
        for (let i = 0; i < pixels.length; i += 4) {
            // Get grayscale value
            const avg = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;

            // Apply extreme contrast for very dark prints
            const newVal = avg < 200 ? 0 : 255; // Binary threshold for maximum contrast

            pixels[i] = pixels[i + 1] = pixels[i + 2] = newVal;
        }

        ctx.putImageData(imageData, 0, 0);

        // Calculate bytes per line for the printer
        const widthBytes = Math.ceil(canvas.width / 8);

        // Pre-allocate the buffer for better performance
        const monochromeData = new Uint8Array(widthBytes * canvas.height);

        // Convert RGBA to 1-bit monochrome with improved contrast
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const pixelIndex = (y * canvas.width + x) * 4;
                // Calculate grayscale value with better weighting for human perception
                const grayscale =
                    0.299 * pixels[pixelIndex] +
                    0.587 * pixels[pixelIndex + 1] +
                    0.114 * pixels[pixelIndex + 2];

                // Use a much higher threshold for significantly darker print
                if (grayscale < 220) { // Much higher threshold = much darker print
                    const byteIndex = y * widthBytes + Math.floor(x / 8);
                    const bitIndex = 7 - (x % 8); // MSB first
                    monochromeData[byteIndex] |= (1 << bitIndex);
                }
            }
        }

        // Many BLE printers can't handle very tall single raster images.
        // Slice the image into bands and send multiple GS v 0 raster commands.
        const BAND_HEIGHT = 256; // pixels per band (tuned for stability)
        for (let bandStart = 0; bandStart < canvas.height; bandStart += BAND_HEIGHT) {
            const bandHeight = Math.min(BAND_HEIGHT, canvas.height - bandStart);

            // GS v 0 - Print raster bit image (m = 0)
            commands.push(0x1D, 0x76, 0x30, 0);

            // xL, xH (width in bytes), yL, yH (height in pixels for this band)
            commands.push(widthBytes & 0xFF, (widthBytes >> 8) & 0xFF);
            commands.push(bandHeight & 0xFF, (bandHeight >> 8) & 0xFF);

            // Append the band data row by row
            for (let row = 0; row < bandHeight; row++) {
                const srcOffset = (bandStart + row) * widthBytes;
                for (let col = 0; col < widthBytes; col++) {
                    commands.push(monochromeData[srcOffset + col]);
                }
            }

            // Optional: small line feed between bands helps some printers
            // commands.push(0x1B, 0x64, 0x00);
        }

    // Feed paper and cut
    commands.push(0x1B, 0x64, 0x02); // Feed a couple of lines
        commands.push(0x1D, 0x56, 0x41, 0x10); // Paper cut

        // Log command length for debugging
        console.log(`Generated ESC/POS commands: ${commands.length} bytes`);

        return new Uint8Array(commands);
    }

    /**
     * Prepare variables from order data (private method)
     * @param {Object} orderData - The order data
     * @param {Object} seller - Seller data
     * @returns {Object} Variables for template
     * @private
     */
    _prepareVariablesFromOrder(orderData, seller) {
    // Determine currency symbol (fallback to INR symbol)
        const currencySymbol = (typeof UserSession !== 'undefined' && UserSession?.getCurrency) ? UserSession.getCurrency() : '₹';

        // Normalize loyalty fields from order data
        const loyaltyPointsNum = Number(orderData.loyaltyPointsUsed || orderData.redeemedPoints || 0) || 0;
        const loyaltyDiscountNum = Number(orderData.loyaltyDiscountAmount || orderData.loyaltyDiscount || 0) || 0;

        // Detect cancellation/removal markers (several possible field names across the app)
        const isCancelled = Boolean(orderData.cancelled || orderData.removed || orderData.isCancelled || orderData.status === 'CANCELLED' || orderData.status === 'CANCELLED_BY_USER');

        // Detect finalized/printed/completed markers (several possible field names)
        const isFinalized = Boolean(
            orderData.status === 'COMPLETED' || orderData.isCompleted || orderData.completed || orderData.printed || orderData.isPrinted || orderData.isFinalized || orderData.printedAt
        );

    // Loyalty deduction should be applied when there is a loyalty discount amount present and the order
    // is not cancelled. Previously this was gated behind an "isFinalized" check which meant preview
    // prints (or save-and-print flows) would not show the redeemed discount on the receipt. Apply
    // the deduction whenever a loyalty discount amount exists so printed receipts accurately reflect
    // the reduced grand total.
    const applyLoyaltyDeduction = !isCancelled && loyaltyDiscountNum > 0;

    const variables = {
            // Basic business info
            businessName: `${seller.businessName || 'Your Business'}`,
            logo: seller.logo || seller.avatar ?
                `<div class="text-center"><img src="${seller.logo || seller.avatar}" alt="Logo" class="max-w-[200px] max-h-[60px] mx-auto object-contain"></div>` :
                '<div class="text-center"><i class="ph ph-storefront text-2xl"></i></div>',
            phone: seller.phone ? `${seller.phone}` : '',
            address: seller.address ? `${seller.address}` : '',
            storeLink: seller.website ? `${seller.website}` : '',
            gstIN: seller.gstIN ? `${seller.gstIN}` : '',

            // Order details
          // Prefer an explicit displayBillNo when provided (used for previews or overrides)
            billNo: `${orderData.displayBillNo || orderData.billNo || orderData.id?.substring(0, 8) || 'N/A'}`,
            orderSource: orderData.orderSource || (orderData.tableId ? `Table ${orderData.tableId}` : (orderData.priceVariant || 'Default')),
            payMode: `${orderData.payMode || 'CASH'}`,
            timestamp: `${(() => {
                try {
                    const date = orderData.date?.toDate ? orderData.date.toDate() : (orderData.date || new Date());
                    const parsedDate = new Date(date);
                    return isNaN(parsedDate.getTime()) ? new Date().toLocaleString('en-GB') : parsedDate.toLocaleString('en-GB');
                } catch (e) {
                    return new Date().toLocaleString('en-GB');
                }
            })()}`,
            cut: '<div class="border-t border-dashed my-1 border-gray-400"></div>',
            // upiQR is prepared later once total is known; legacy icon remains if orderData.upiQR is true
            upiQR: orderData.upiQR ? `<div class="text-center"><i class="ph ph-qr-code text-4xl"></i></div>` : '',
            instructions: orderData.instructions ? `Instructions:\n${orderData.instructions}` : '',
            customerName: orderData.customer?.name || orderData.custName || '',
            customerPhone: orderData.customer?.phone || orderData.custPhone || '',

            // Loyalty usage (always provided for display on bill; defaults to 0)
            // Provide numeric and display-friendly loyalty variables
            loyaltyPointsUsed: String(loyaltyPointsNum),
            loyaltyDiscountAmount: loyaltyDiscountNum.toFixed(2),
            loyaltyDiscountDisplay: loyaltyDiscountNum > 0 ? `${currencySymbol}${loyaltyDiscountNum.toFixed(2)}` : '',
            loyaltyPointsNumeric: loyaltyPointsNum,
            loyaltyDiscountNumeric: loyaltyDiscountNum,
            applyLoyaltyDeduction: applyLoyaltyDeduction,
            // Credits / wallet usage (show credits used count and amount if present)
            creditsAmount: (Number(orderData.creditsUsedAmount || orderData.creditsAmount || orderData.walletAmount || 0) > 0) ? (Number(orderData.creditsUsedAmount || orderData.creditsAmount || orderData.walletAmount || 0).toFixed(2)) : '',
            creditsCount: (Number(orderData.creditsUsedCount || orderData.creditsUsed || 0) > 0) ? String(Number(orderData.creditsUsedCount || orderData.creditsUsed || 0)) : '',

            // Add settlement status for unsettled bills
            settlementStatus: orderData.payMode === 'UNSETTLED' ?
                (orderData.settled ? 'SETTLED' : 'UNSETTLED') : '',
            settledAmount: orderData.settledAmount || 0,
            pendingAmount: orderData.payMode === 'UNSETTLED' ?
                ((orderData.total || 0) - (orderData.settledAmount || 0)) : 0,
            paymentCount: (orderData.partialPayments || []).length,

            // Add bulk tax update hashtag if present
            bulkTaxHashtag: orderData.taxUpdateInfo?.hashtag || ''
        };

        // Derive table display values to ensure we don't print 'Default' as a table
        try {
            const rawTable = (orderData.tableId !== undefined && orderData.tableId !== null) ? String(orderData.tableId) : '';
            let derivedTable = '';

            if (rawTable && rawTable.trim() !== '' && rawTable.trim().toLowerCase() !== 'default') {
                derivedTable = rawTable.trim();
            } else {
                // Try to extract from orderSource or priceVariant if it contains 'Table'
                const possibleSource = (orderData.orderSource || orderData.priceVariant || '').toString();
                const match = possibleSource.match(/table\s*[:\-]?\s*(.+)/i);
                if (match && match[1]) {
                    derivedTable = match[1].trim();
                } else {
                    // Check for patterns like 'Table12' without space
                    const match2 = possibleSource.match(/table\s*(\d+)/i);
                    if (match2 && match2[1]) derivedTable = match2[1];
                }
            }

            variables.table = derivedTable || '';
            variables.tableLine = variables.table ? `Table: ${variables.table}` : '';
            variables.tableLineUpper = variables.table ? `TABLE ${variables.table}` : '';

            // If orderSource is empty but we have table info, show just the table (e.g., 'Table T3')
            // This keeps the bill header concise: 'Order from: Table T3'
            if ((!variables.orderSource || String(variables.orderSource).trim() === '') && variables.table) {
                variables.orderSource = `Table ${variables.table}`;
            }
        } catch (e) {
            variables.table = '';
            variables.tableLine = '';
            variables.tableLineUpper = '';
        }

        // Compute a friendly payment mode display. If loyalty points were used
        // along with another payment method, show "LOYALTY + <Other>" on the bill.
        const humanizePayMode = (pm) => {
            if (!pm) return 'Cash';
            const p = String(pm).toLowerCase();
            if (p === 'cash' || p === 'cash_payment' || p === 'cashonly') return 'Cash';
            if (p === 'upi' || p === 'card' || p === 'upi/card' || p === 'upi_card') return 'UPI/Card';
            if (p === 'wallet') return 'Wallet';
            if (p === 'unsettled' || p === 'UNSETTLED') return 'UNSETTLED';
            if (p === 'loyalty') return 'LOYALTY';
            // Default: capitalize first letter
            return String(pm).charAt(0).toUpperCase() + String(pm).slice(1).toLowerCase();
        };

        const basePayModeRaw = orderData.payMode || (orderData.partialPayments && orderData.partialPayments.length === 1 ? orderData.partialPayments[0].paymentMode : 'CASH');
        const basePayMode = humanizePayMode(basePayModeRaw);
        let payModeDisplay = basePayMode;
        if (loyaltyPointsNum > 0) {
            // If loyalty was used and the base mode isn't LOYALTY alone, prepend LOYALTY
            if (!String(basePayMode).toUpperCase().includes('LOYALTY')) {
                payModeDisplay = 'LOYALTY' + ' + ' + basePayMode;
            } else {
                payModeDisplay = 'LOYALTY';
            }
        }

        variables.payModeDisplay = payModeDisplay;

        // Prepare items list for both templates if items exist
        if (orderData.items && orderData.items.length > 0) {
            // For bill template
            variables.itemsList = this._generateBillItemsList(orderData.items);

            // For KOT template
            variables.kotItemsList = this._generateKOTItemsList(orderData.items);

            // Calculate subtotal for bill
            // Always use ChargesCalculator for all calculations
           // Calculate subtotal
// Calculate subtotal
const subtotal = orderData.items.reduce((total, item) => {
  const quantity = parseFloat(item.quantity || item.qnt || 1);
  const price = parseFloat(item.price || 0);
  return total + (quantity * price);
}, 0);

const discount = Number(orderData.discount || 0);
const charges = Array.isArray(orderData.charges) ? orderData.charges : [];

// Let ChargesCalculator do ALL calculations
const chargesCalculation = ChargesCalculator.calculateCharges(
  subtotal,
  charges,
  discount
);


           variables.subtotal = subtotal.toFixed(2);
variables.discount = discount > 0 ? discount.toFixed(2) : '';
variables.total = chargesCalculation.finalAmount.toFixed(2);
variables.grandTotal = variables.total;


            // Charges breakdown - exclude CGST/SGST from #charges variable
            let chargesHtml = '';
            let inclusiveChargesHtml = '';
            let hasBulkTaxUpdate = false;
            let bulkTaxHashtag = null;
            
            if (chargesCalculation && chargesCalculation.calculatedCharges) {
                chargesCalculation.calculatedCharges.forEach(charge => {
                    // Skip CGST and SGST from the charges display - they have their own variables
                    const chargeName = charge.name.toLowerCase();
                    const isGSTCharge = chargeName.includes('cgst') || chargeName.includes('sgst') || 
                                       chargeName.includes('gst');
                    
                    if (!isGSTCharge) {
                        // Only include non-GST charges in the charges variable
                        const chargeDisplay = `${charge.displayName}: ${charge.calculatedAmount.toFixed(2)}\n`;
                        
                        if (charge.isInclusive) {
                            inclusiveChargesHtml += chargeDisplay;
                        } else {
                            chargesHtml += chargeDisplay;
                        }
                    }
                    
                    if (charge.bulkTaxHashtag) {
                        hasBulkTaxUpdate = true;
                        bulkTaxHashtag = charge.bulkTaxHashtag;
                    }
                });
                if (hasBulkTaxUpdate && bulkTaxHashtag) {
                    chargesHtml += `\n${bulkTaxHashtag}\n`;
                }
            }
            
            // Combine charges with inclusive breakdown if any
            let allChargesDisplay = '';
            if (inclusiveChargesHtml) {
                allChargesDisplay += `--- TAX BREAKDOWN ---\n${inclusiveChargesHtml}`;
            }
            if (chargesHtml) {
                allChargesDisplay += chargesHtml;
            }
            
            variables.charges = allChargesDisplay;

            // Prepare individual CGST and SGST variables for template use
            let cgstAmount = 0;
            let sgstAmount = 0;
            let cgstPercentage = '';
            let sgstPercentage = '';
            
            // First, try to extract from calculatedCharges (for orders where charges are defined with value/type)
            if (chargesCalculation && chargesCalculation.calculatedCharges) {
                chargesCalculation.calculatedCharges.forEach(charge => {
                    const chargeName = charge.name.toLowerCase();
                    
                    if (chargeName.includes('cgst')) {
                        cgstAmount = charge.calculatedAmount;
                        const percentMatch = charge.displayName.match(/\((\d+(?:\.\d+)?)%\)/);
                        cgstPercentage = percentMatch ? percentMatch[1] + '%' : '';
                    } else if (chargeName.includes('sgst')) {
                        sgstAmount = charge.calculatedAmount;
                        const percentMatch = charge.displayName.match(/\((\d+(?:\.\d+)?)%\)/);
                        sgstPercentage = percentMatch ? percentMatch[1] + '%' : '';
                    } else if (chargeName.includes('gst') && !chargeName.includes('igst') && 
                              !chargeName.includes('cgst') && !chargeName.includes('sgst')) {
                        // If it's a general GST charge, split it into CGST and SGST
                        cgstAmount = charge.calculatedAmount / 2;
                        sgstAmount = charge.calculatedAmount / 2;
                        const percentMatch = charge.displayName.match(/\((\d+(?:\.\d+)?)%\)/);
                        if (percentMatch) {
                            const halfPercent = (parseFloat(percentMatch[1]) / 2).toFixed(1);
                            cgstPercentage = halfPercent + '%';
                            sgstPercentage = halfPercent + '%';
                        }
                    }
                });
            }
            
            // Fallback: if not found in calculatedCharges, check raw orderData.charges for pre-calculated amounts
            if ((cgstAmount === 0 && sgstAmount === 0) && Array.isArray(orderData.charges)) {
                const cleanName = (s='') => s.toString().replace(/[^a-z]/gi,'').toUpperCase();
                orderData.charges.forEach(charge => {
                    const name = cleanName(charge.name);
                    if (name === 'CGST') {
                        cgstAmount = parseFloat(charge.amount || charge.value || 0);
                        if (charge.percent != null) {
                            cgstPercentage = charge.percent + '%';
                        } else if (charge.value && typeof charge.value === 'string' && charge.value.includes('%')) {
                            const perc = parseFloat(charge.value.replace('%',''));
                            if (!isNaN(perc)) cgstPercentage = perc + '%';
                        }
                    } else if (name === 'SGST') {
                        sgstAmount = parseFloat(charge.amount || charge.value || 0);
                        if (charge.percent != null) {
                            sgstPercentage = charge.percent + '%';
                        } else if (charge.value && typeof charge.value === 'string' && charge.value.includes('%')) {
                            const perc = parseFloat(charge.value.replace('%',''));
                            if (!isNaN(perc)) sgstPercentage = perc + '%';
                        }
                    }
                });
            }
            
            variables.cgst = cgstAmount > 0 ? cgstAmount.toFixed(2) : '';
            variables.sgst = sgstAmount > 0 ? sgstAmount.toFixed(2) : '';
            variables.cgstPercent = cgstPercentage;
            variables.sgstPercent = sgstPercentage;

            // Provide ready-to-render lines so templates can include tax only when present
            variables.cgstLine = cgstAmount > 0 ? `CGST${cgstPercentage ? ' (' + cgstPercentage + ')' : ''}: ${cgstAmount.toFixed(2)}\n` : '';
            variables.sgstLine = sgstAmount > 0 ? `SGST${sgstPercentage ? ' (' + sgstPercentage + ')' : ''}: ${sgstAmount.toFixed(2)}\n` : '';

            // Extract CGST and SGST totals from calculated charges when present.
            // Some charge names may be like 'CGST', 'SGST', 'Central GST', 'State GST'.
            let cgstTotal = 0;
            let sgstTotal = 0;
            if (chargesCalculation && Array.isArray(chargesCalculation.calculatedCharges)) {
                chargesCalculation.calculatedCharges.forEach(c => {
                    const lookup = (c.name || c.displayName || '').toString().toLowerCase();
                    const amt = Number(c.calculatedAmount || c.amount || c.value || 0);
                    if (lookup.includes('cgst') || lookup.includes('central')) {
                        cgstTotal += amt;
                    }
                    if (lookup.includes('sgst') || lookup.includes('state')) {
                        sgstTotal += amt;
                    }
                });
            }

            // Some saved orders include a pre-computed `calculatedCharges` array on the order
            // (instead of `charges`). If present, use it as a fallback to extract taxes.
            if ((cgstTotal === 0 && sgstTotal === 0) && Array.isArray(orderData.calculatedCharges) && orderData.calculatedCharges.length > 0) {
                orderData.calculatedCharges.forEach(c => {
                    const lookup = (c.name || c.displayName || '').toString().toLowerCase();
                    const amt = Number(c.calculatedAmount || c.amount || c.value || 0);
                    if (lookup.includes('cgst') || lookup.includes('central')) {
                        cgstTotal += amt;
                    }
                    if (lookup.includes('sgst') || lookup.includes('state')) {
                        sgstTotal += amt;
                    }
                });
            }

            // If explicit CGST/SGST entries weren't found, attempt a broader detection:
            // - scan `chargesCalculation.calculatedCharges` (preferred, has calculatedAmount)
            // - then `orderData.calculatedCharges` and `orderData.charges` for any 'gst'/'tax'/'vat' entries
            // If we find a combined GST/tax amount, split it equally between CGST and SGST.
            if (cgstTotal === 0 && sgstTotal === 0) {
                const scanSources = [];
                if (chargesCalculation && Array.isArray(chargesCalculation.calculatedCharges)) scanSources.push(...chargesCalculation.calculatedCharges);
                if (Array.isArray(orderData.calculatedCharges)) scanSources.push(...orderData.calculatedCharges);
                if (Array.isArray(orderData.charges)) scanSources.push(...orderData.charges);

                // Find entries that look like combined GST/tax entries
                let combinedTaxTotal = 0;
                // Debug: show the scanSources (charges candidates) to help diagnosis (limited slice)
                try { console.debug('PrintTemplate - scanSources preview for tax detection', scanSources.slice(0, 8)); } catch (e) {}

                scanSources.forEach(c => {
                    const name = (c.name || c.displayName || c.label || '').toString().toLowerCase();
                    const amt = Number(c.calculatedAmount ?? c.amount ?? c.value ?? 0) || 0;

                    // Skip explicit CGST/SGST/IGST entries
                    if (name.includes('cgst') || name.includes('sgst') || name.includes('igst') || name.includes('central') || name.includes('state')) return;

                    // Accept entries that mention gst/tax/vat
                    if (name.includes('gst') || name.includes('tax') || name.includes('vat')) {
                        // Prefer an explicit calculated amount
                        if (amt > 0) {
                            combinedTaxTotal += amt;
                            return;
                        }

                        // If value looks like a percentage string (contains '%'), parse and compute
                        if (typeof c.value === 'string' && c.value.includes('%')) {
                            const pct = parseFloat(c.value.replace('%', '').trim()) || 0;
                            if (pct > 0 && typeof subtotal === 'number' && !isNaN(subtotal)) {
                                const computed = (subtotal * pct) / 100;
                                combinedTaxTotal += computed;
                                return;
                            }
                        }

                        // Heuristic: numeric values stored as numbers and <=100 are likely percentages
                        if (typeof c.value === 'number' && c.value > 0 && c.value <= 100) {
                            try {
                                const pct = Number(c.value);
                                if (pct > 0 && typeof subtotal === 'number' && !isNaN(subtotal)) {
                                    const computed = (subtotal * pct) / 100;
                                    combinedTaxTotal += computed;
                                    console.debug('PrintTemplate: inferred percentage-based tax from numeric value', { name: c.name || c.displayName, value: c.value, inferredAmount: computed });
                                    return;
                                }
                            } catch (e) { /* ignore inference failures */ }
                        }

                        // Heuristic: numeric strings (e.g., '2.5') without '%' likely represent percentages
                        if (typeof c.value === 'string') {
                            const parsed = parseFloat(c.value.trim());
                            if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                                try {
                                    const computed = (subtotal * parsed) / 100;
                                    combinedTaxTotal += computed;
                                    console.debug('PrintTemplate: inferred percentage-based tax from numeric-string value', { name: c.name || c.displayName, value: c.value, inferredAmount: computed });
                                    return;
                                } catch (e) { /* ignore */ }
                            }
                        }
                    }
                });

                if (combinedTaxTotal > 0) {
                    cgstTotal = combinedTaxTotal / 2;
                    sgstTotal = combinedTaxTotal / 2;
                }
                else {
                    // Debug info to help identify why taxes weren't detected
                    try {
                        console.debug('PrintTemplate: No CGST/SGST detected for order', {
                            billNo: variables.billNo || orderData.billNo || orderData.id,
                            subtotal,
                            chargesCalculation: (chargesCalculation && chargesCalculation.calculatedCharges) ? chargesCalculation.calculatedCharges : null,
                            orderCharges: Array.isArray(orderData.charges) ? orderData.charges : null,
                            orderCalculatedCharges: Array.isArray(orderData.calculatedCharges) ? orderData.calculatedCharges : null,
                            scanSourcesPreview: scanSources.slice(0, 10) // limit to first 10 to avoid huge logs
                        });
                    } catch (e) { /* non-fatal */ }

                    // Extra, more visible diagnostic to help in environments where debug logs are filtered
                    try {
                        console.warn('PrintTemplate TAX DETECTION FAILED:', {
                            billNo: variables.billNo || orderData.billNo || orderData.id,
                            hasChargesCalculation: Boolean(chargesCalculation && Array.isArray(chargesCalculation.calculatedCharges) && chargesCalculation.calculatedCharges.length > 0),
                            orderCalculatedChargesCount: Array.isArray(orderData.calculatedCharges) ? orderData.calculatedCharges.length : 0,
                            orderChargesCount: Array.isArray(orderData.charges) ? orderData.charges.length : 0,
                            totalTaxFields: { totalTax: Number(orderData.taxAmount || orderData.totalTax || orderData.totalTaxAmount || 0) || 0 },
                        });
                    } catch (ee) { /* non-fatal */ }
                }
            }

            // EXTRA FALLBACKS: Some older saved orders or generated order payloads
            // may store tax totals in other fields. Check those before finishing.
            try {
                // Direct total tax fields
                const possibleTotalTax = Number(orderData.taxAmount || orderData.totalTaxAmount || orderData.totalTax || 0) || 0;
                if ((cgstTotal === 0 && sgstTotal === 0) && possibleTotalTax > 0) {
                    // If there's a total tax available, split equally between CGST and SGST
                    cgstTotal = possibleTotalTax / 2;
                    sgstTotal = possibleTotalTax / 2;
                }

                // If the order stores a taxBreakdown array, attempt to pick CGST/SGST specifically
                if (Array.isArray(orderData.taxBreakdown) && orderData.taxBreakdown.length > 0) {
                    orderData.taxBreakdown.forEach(tb => {
                        try {
                            const name = (tb.name || tb.label || tb.displayName || '').toString().toLowerCase();
                            const amt = Number(tb.amount ?? tb.value ?? tb.calculatedAmount ?? 0) || 0;
                            if (name.includes('cgst') || name.includes('central')) cgstTotal += amt;
                            else if (name.includes('sgst') || name.includes('state')) sgstTotal += amt;
                            else if ((name.includes('gst') || name.includes('tax')) && (cgstTotal === 0 && sgstTotal === 0)) {
                                // If only a combined GST line exists, split it
                                cgstTotal += amt / 2;
                                sgstTotal += amt / 2;
                            }
                        } catch (e) { /* ignore per-entry errors */ }
                    });
                }
            } catch (e) {
                // Non-fatal
            }

            // If taxes were detected compute formatted amounts, otherwise keep empty string
            variables.cgstAmount = cgstTotal ? cgstTotal.toFixed(2) : '';
            variables.sgstAmount = sgstTotal ? sgstTotal.toFixed(2) : '';
            const currencySymbol = (typeof UserSession !== 'undefined' && UserSession?.getCurrency) ? UserSession.getCurrency() : '₹';
            variables.cgstDisplay = cgstTotal ? `${currencySymbol}${cgstTotal.toFixed(2)}` : '';
            variables.sgstDisplay = sgstTotal ? `${currencySymbol}${sgstTotal.toFixed(2)}` : '';

            // Show CGST/SGST lines only when positive amounts detected. Avoid printing 0.00 lines
            // for orders that contain placeholder/zero-value charges (common in persisted data).
            if (cgstTotal > 0 || sgstTotal > 0) {
                variables.cgstLine = cgstTotal ? `CGST: ${variables.cgstDisplay}` : '';
                variables.sgstLine = sgstTotal ? `SGST: ${variables.sgstDisplay}` : '';
            } else {
                variables.cgstLine = '';
                variables.sgstLine = '';
                // Debug: if GST-like entries were present but all zero, log this for diagnostics
                try {
                    const foundGstLike = (Array.isArray(orderData.charges) && orderData.charges.some(c => {
                        const n = (c && (c.name || c.displayName || c.label) || '').toString().toLowerCase();
                        return n.includes('cgst') || n.includes('sgst') || n.includes('gst') || n.includes('central') || n.includes('state');
                    })) || (Array.isArray(orderData.calculatedCharges) && orderData.calculatedCharges.some(c => {
                        const n = (c && (c.name || c.displayName || c.label) || '').toString().toLowerCase();
                        return n.includes('cgst') || n.includes('sgst') || n.includes('gst') || n.includes('central') || n.includes('state');
                    }));
                    if (foundGstLike) console.debug('PrintTemplate: GST-like entries present but evaluated to zero; hiding zero lines for cleaner receipts', { billNo: variables.billNo || orderData.billNo || orderData.id });
                } catch (e) { /* ignore */ }
            }
            // Backwards-compatible placeholders used by some templates
            // (templates/images showed '#cgst' and '#sgst' placeholders).
            variables.cgst = variables.cgstDisplay;
            variables.sgst = variables.sgstDisplay;

            // Unified total (before loyalty deduction)
            const total = chargesCalculation.finalAmount;
            variables.total = `${typeof total === 'number' ? total.toFixed(2) : total || '0.00'}`;

            // Compute grandTotal depending on whether loyalty deduction applies
            const grandTotalNum = (typeof total === 'number' ? total : Number(total) || 0) - (applyLoyaltyDeduction ? loyaltyDiscountNum : 0);
            variables.grandTotal = `${grandTotalNum.toFixed(2)}`;

            // Expose explicit "total after redeeming loyalty points" variable
            // This mirrors grandTotal when loyalty deduction applies, but is provided
            // as a dedicated variable for templates that want an explicit label.
            const totalAfterRedeemNum = grandTotalNum;
            variables.totalAfterRedeem = `${totalAfterRedeemNum.toFixed(2)}`;
            variables.totalAfterRedeemDisplay = `${currencySymbol}${totalAfterRedeemNum.toFixed(2)}`;

            // Handle partial payment details for unsettled bills
            if (orderData.payMode === 'UNSETTLED') {
                const settledAmount = parseFloat(orderData.settledAmount || 0);
                const pendingAmount = total - settledAmount;

                variables.settledAmount = settledAmount.toFixed(2);
                variables.pendingAmount = pendingAmount.toFixed(2);
                variables.settlementStatus = orderData.settled ? 'FULLY SETTLED' : 'PARTIALLY SETTLED';
                variables.paymentCount = orderData.partialPayments ? orderData.partialPayments.length : 0;

                // Generate partial payment details
                let partialPaymentDetails = '';
                if (orderData.partialPayments && orderData.partialPayments.length > 0) {
                    partialPaymentDetails = orderData.partialPayments.map((payment, index) => {
                        const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
                        return `${index + 1}. ${payment.paymentMode}: ${parseFloat(payment.amount || 0).toFixed(2)} (${paymentDate.toLocaleDateString()})`;
                    }).join('\n');
                }
                variables.partialPaymentDetails = partialPaymentDetails;
            } else {
                variables.settledAmount = '';
                variables.pendingAmount = '';
                variables.settlementStatus = '';
                variables.paymentCount = '';
                variables.partialPaymentDetails = '';
            }
        }

        // Prepare UPI QR placeholder if seller has a UPI ID (outside items block so it always works)
        try {
            const upiId = seller?.upiId || orderData?.upiId;
            if (upiId) {
                const payee = seller?.businessName || 'Merchant';
                // Determine amount: prefer computed variables.total, fallback to orderData.total
                const amtStr = variables.total || (typeof orderData.total === 'number' ? orderData.total.toFixed(2) : (orderData.total || ''));
                const amtNum = parseFloat(amtStr);
                const amountParam = (!isNaN(amtNum) && amtNum > 0) ? `&am=${amtNum.toFixed(2)}` : '';
                const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}${amountParam}&cu=INR`;
                // Place a placeholder that preview/printing code will convert into an actual QR code image
                variables.upiQR = `
                    <div class="my-0.5">
                        <div class="lp-qr mx-auto" data-qr-text="${upiUrl}" data-size="128" style="display: block; width: 128px; height: 128px;"></div>
                    </div>
                `;
            }
        } catch (e) {
            console.warn('Failed to prepare UPI QR placeholder:', e);
        }

    // Make sure there's a displayBillNo variable available for templates that may check it
    variables.displayBillNo = orderData.displayBillNo || variables.billNo;

    // Include split bill information if available
        console.log('PrintTemplate - Processing split bill data:', orderData.splitBill);
        if (orderData.splitBill && orderData.splitBill.enabled) {
            variables.split_bill_enabled = 'true';
            variables.split_bill_people = orderData.splitBill.numberOfPeople.toString();
            variables.split_bill_type = orderData.splitBill.type;
            
            if (orderData.splitBill.type === 'equal') {
                const formattedAmount = `₹${orderData.splitBill.amountPerPerson.toFixed(2)}`;
                variables.split_bill_amount_per_person = formattedAmount;
                variables.split_bill_details = `
--- SPLIT BILL ---
Split among ${orderData.splitBill.numberOfPeople} people
Each person pays: ${formattedAmount}
--- --- --- ---`;
            } else if (orderData.splitBill.customSplits) {
                let splitDetails = `\n--- SPLIT BILL ---\nSplit among ${orderData.splitBill.numberOfPeople} people:\n`;
                orderData.splitBill.customSplits.forEach((split, index) => {
                    splitDetails += `${split.name || `Person ${index + 1}`}: ₹${split.amount.toFixed(2)}\n`;
                });
                splitDetails += `--- --- --- ---`;
                variables.split_bill_details = splitDetails;
            }
            console.log('PrintTemplate - Split bill variables created:', {
                split_bill_enabled: variables.split_bill_enabled,
                split_bill_people: variables.split_bill_people,
                split_bill_details: variables.split_bill_details
            });
        } else {
            variables.split_bill_enabled = 'false';
            variables.split_bill_people = '';
            variables.split_bill_type = '';
            variables.split_bill_amount_per_person = '';
            variables.split_bill_details = '';
            console.log('PrintTemplate - No split bill data found');
        }

        return variables;
    }

    /**
     * Generate HTML for bill items list
     * @param {Array} items - Order items
     * @returns {string} HTML for items list
     * @private
     */
    _generateBillItemsList(items) {
        let html = `<div class="flex w-full font-bold border-b border-dashed border-gray-400 text-xs m-0 p-0">
            <div class="w-[10%]">Qty</div>
            <div class="w-[70%]">Item</div>
            <div class="w-[20%] text-right">Amt</div>
        </div>`;

        // Add items
        items.forEach(item => {
            const quantity = parseFloat(item.quantity || item.qnt || 1);
            // Use basePrice for the main item display (exclude add-ons)
            const basePrice = parseFloat(item.basePrice || item.price || 0);
            const baseAmount = quantity * basePrice;

            // Use displayTitle if available, otherwise use title
            // This ensures variants are displayed as "Product (Variation)"
            let itemNameRaw = (item.displayTitle || item.title || 'Unknown Item');
            let itemName = itemNameRaw;
            // If this is a split bill preview/print, append a visual marker
            try {
                const isSplit = this.variables && this.variables.split_bill_enabled === 'true';
                const marker = ' (split)';
                if (isSplit) {
                    if (!/\(split\)/i.test(itemName)) itemName = `${itemName}${marker}`;
                    // Preserve the marker even after truncation
                    const maxLen = 24;
                    if (itemName.length > maxLen) {
                        const baseMax = Math.max(0, maxLen - marker.length);
                        const truncatedBase = (itemNameRaw || '').substring(0, baseMax);
                        itemName = `${truncatedBase}${marker}`;
                    }
                } else {
                    itemName = itemName.substring(0, 24);
                }
            } catch (e) { itemName = itemName.substring(0, 24); }

            // If this is a free item (marked by freeItem flag), show 'FREE' instead of amount and mark clearly
            if (item.freeItem) {
                html += `<div class="flex w-full text-xs">
                    <div class="w-[10%]">${quantity}</div>
                    <div class="w-[70%]">${itemName} <span class=\"text-xs text-green-600 font-semibold\">(FREE)</span></div>
                    <div class="w-[20%] text-right">FREE</div>
                </div>`;
            } else {
                html += `<div class="flex w-full text-xs">
                    <div class="w-[10%]">${quantity}</div>
                    <div class="w-[70%]">${itemName}</div>
                    <div class="w-[20%] text-right">${baseAmount.toFixed(2)}</div>
                </div>`;
            }

            // If we have a display title but still want to show the variant separately
            // or if there's no display title but there is a variant
            if (!item.displayTitle && item.variantName) {
                html += `<div class="flex w-full text-xs pl-[10%]">
                    <div class="w-[70%] text-gray-600">+ ${item.variantName}</div>
                    <div class="w-[20%] text-right text-gray-600">${item.basePrice ? `${item.basePrice.toFixed(2)}` : ''}</div>
                </div>`;
            }

            // Show unit pricing details if available
            if (item.unitPricing && item.unitPricing.enabled && item.unitPricing.displayUnit && Number(item.unitPricing.pricePerUnit) > 0) {
                const currencySymbol = (typeof UserSession !== 'undefined' && UserSession?.getCurrency) ? UserSession.getCurrency() : '₹';
                const ppuNum = Number(item.unitPricing.pricePerUnit);
                const ppu = `${currencySymbol}${ppuNum.toFixed(2)}`;
                const du = item.unitPricing.displayUnit;
                const unitQty = Number(item.unitQuantity);
                // If we know the unit quantity used for this line, show the full breakdown
                if (!isNaN(unitQty) && unitQty > 0) {
                    // Prefer explicit basePrice if present, else compute from ppu * units
                    const base = (typeof item.basePrice === 'number' && !isNaN(item.basePrice))
                        ? Number(item.basePrice)
                        : (ppuNum * unitQty);
                    html += `<div class="flex w-full text-[10px] pl-[10%] text-blue-700">
                        <div class="w-[70%]">Units: ${unitQty} ${du} @ ${ppu}/${du}</div>
                        <div class="w-[20%] text-right">${base.toFixed(2)}</div>
                    </div>`;
                } else {
                    // Fallback: show only the per-unit rate
                    html += `<div class="flex w-full text-[10px] pl-[10%] text-blue-700">
                        <div class="w-[70%]">@ ${ppu} / ${du}</div>
                        <div class="w-[20%] text-right"></div>
                    </div>`;
                }
            }

            // Add add-ons if present
            if (item.addons && item.addons.length > 0) {
                item.addons.forEach(addon => {
                    html += `<div class="flex w-full text-xs pl-[10%]">
                        <div class="w-[70%] text-gray-600">+ ${addon.name}</div>
                        <div class="w-[20%] text-right text-gray-600">+${(addon.price || 0).toFixed(2)}</div>
                    </div>`;
                });
            }
        });

        html += '<div class="border-t border-dashed border-gray-400 mt-0.5"></div>';
        return html;
    }

    /**
     * Generate HTML for KOT items list
     * @param {Array} items - Order items
     * @returns {string} HTML for KOT items list
     * @private
     */
    _generateKOTItemsList(items) {
        let html = ``;

        items.forEach(item => {
            const quantity = parseFloat(item.quantity || item.qnt || 1);

            // Use displayTitle if available, otherwise use title
            let itemName = item.displayTitle || item.title || 'Unknown Item';
            // Append (split) marker when printing split bills and preserve marker during truncation
            try {
                const isSplit = this.variables && this.variables.split_bill_enabled === 'true';
                const marker = ' (split)';
                if (isSplit) {
                    if (!/\(split\)/i.test(itemName)) itemName = `${itemName}${marker}`;
                }
            } catch (e) { /* ignore */ }

            html += `<div class="flex text-xs">
                <div class="w-[10%] font-bold">${quantity}x</div>
                <div class="w-[90%] font-bold">${itemName}</div>
            </div>`;

            // Only add variant info if not already part of the displayTitle
            if (!item.displayTitle && item.variantName) {
                html += `<div class="pl-5 text-xs text-gray-600">
                    Variant: ${item.variantName}
                </div>`;
            }

            // Add add-ons if present
            if (item.addons && item.addons.length > 0) {
                html += `<div class="pl-5 text-xs text-gray-600">
                    Add-ons: ${item.addons.map(addon => addon.name).join(', ')}
                </div>`;
            }

            if (item.instructions) {
                html += `<div class="pl-5 italic text-xs">
                    Note: ${item.instructions.trim()}
                </div>`;
            }
        });

        return html;
    }

    /**
     * Create default sections for bills
     * @param {Object} orderData - Order data for context-specific templates 
     * @returns {Array} Array of PrintSection instances
     * @private
     */
    _createDefaultBillSections(orderData = {}) {
        const sections = [];

        // Logo section
        sections.push(new PrintSection({
            template: '#logo',
            alignment: 'TextAlign.center',
            fontSize: 28,  // Larger for logo
            isBold: false
        }));

        // Header section
        sections.push(new PrintSection({
            template: `${orderData.isPreview ? '** PREVIEW BILL **\n' : ''}${orderData.gstEnabled ? 'TAX INVOICE' : 'BILL/RECEIPT'}\n#businessName\n#address\nPhone: #phone\nWeb: #storeLink\nGST: #gstIN`,
            alignment: 'TextAlign.center',
            fontSize: 30,  // Extra large for header
            isBold: true
        }));

        // Order details section
        // Only prefix with PREVIEW- when this is a preview AND no explicit displayBillNo was provided
        const previewPrefix = (orderData.isPreview && !orderData.displayBillNo) ? 'PREVIEW-' : '';
        sections.push(new PrintSection({
        template: `Bill #: ${previewPrefix}#billNo
Date: #timestamp
Customer: #customerName
Phone: #customerPhone
${orderData.tableId ? `Table: ${orderData.tableId}` : ''}
Order from: #orderSource`,
            alignment: 'TextAlign.left',
            fontSize: 22,  // Medium for details
            isBold: false
        }));

        // Items section - use itemsListText for printer commands
        sections.push(new PrintSection({
            template: '#itemsList',
            alignment: 'TextAlign.left',
            fontSize: 20,
            isBold: false
        }));

        // Totals section
        // When loyalty is used, don't show a separate 'Discount' label. Show 'Redeemed Points' and display Grand Total.
       sections.push(new PrintSection({
    template: `Sub Total: #subtotal
Discount: -#discount
#charges
#cgstLine
#sgstLine
TOTAL: #grandTotal`,
    alignment: 'TextAlign.right',
    fontSize: 20,
    isBold: true
}));


        // Payment section with partial payment details
        sections.push(new PrintSection({
            template: `Payment Mode: #payMode${orderData.payMode === 'UNSETTLED' ? `
Status: #settlementStatus${orderData.partialPayments && orderData.partialPayments.length > 0 ? `
Payments Made: #paymentCount
#partialPaymentDetails` : ''}` : ''}
${orderData.notes ? orderData.notes : ''}`,
            alignment: 'TextAlign.left',
            fontSize: 20,
            isBold: false
        }));

        // Split bill section (if enabled)
        sections.push(new PrintSection({
            template: `#split_bill_details`,
            alignment: 'TextAlign.center',
            fontSize: 22,  // Medium for split bill info
            isBold: true
        }));

        // Footer
        sections.push(new PrintSection({
            template: `${orderData.isPreview ? '** THIS IS A PREVIEW **\n** ORDER NOT COMPLETED **\n\n' : ''}Thank You!\nVisit Again\n#storeLink`,
            alignment: 'TextAlign.center',
            fontSize: 20,
            isBold: false
        }));

        return sections;
    }

    /**
     * Create default sections for KOT (Kitchen Order Ticket)
     * @param {Object} orderData - Order data for context-specific templates
     * @returns {Array} Array of PrintSection instances
     * @private
     */
    _createDefaultKOTSections(orderData = {}) {
        const sections = [];

        // Check if any items have originalQnt property (indicating quantity additions)
        const hasQuantityAdditions = orderData.items && orderData.items.some(item => item.originalQnt !== undefined);
        const kotTitle = orderData.isPartialKOT
            ? (hasQuantityAdditions ? 'KOT (ADDITIONS)' : 'KOT (NEW ITEMS)')
            : 'KOT';

        // Header section with indication if this is a partial KOT
        sections.push(new PrintSection({
            template: `${kotTitle}\n#tableLineUpper`,
            alignment: 'TextAlign.center',
            fontSize: 32,  // Extra large for header
            isBold: true
        }));

        // Order details section with item count indication if this is a partial KOT
        sections.push(new PrintSection({
            template: `KOT #: #billNo
Date: #timestamp
${orderData.isPartialKOT ? `ADDED ITEMS: ${orderData.newItemsCount} (Total: ${orderData.totalItemsCount})
` : ''}Customer: #customerName
Phone: #customerPhone
${orderData.tableId ? `Table: ${orderData.tableId}` : ''}`,
            alignment: 'TextAlign.left',
            fontSize: 22,  // Medium size for details
            isBold: false
        }));

        // Items section - use kotItemsListText for printer commands
        sections.push(new PrintSection({
            template: '#kotItemsList',
            alignment: 'TextAlign.left',
            fontSize: 20,  // Standard size for items
            isBold: false
        }));

        // Special Instructions section (only if there are instructions)
        sections.push(new PrintSection({
            template: `#instructions`,
            alignment: 'TextAlign.left',
            fontSize: 20,
            isBold: false
        }));

        return sections;
    }

    /**
     * Opens a preview window showing both PNG and HTML renders of the receipt
     * @param {string} pngDataUrl - The PNG data URL of the rendered receipt
     * @param {HTMLElement} receiptContent - The HTML content of the receipt
     * @private
     */
    async _openPreviewWindow(pngDataUrl, receiptContent) {
        const previewWindow = window.open();
        previewWindow.document.write(`
            <html>
            <head>
                <title>Receipt Preview</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    body { display: flex; flex-direction: column; align-items: center; }
                    .preview-container { display: flex; gap: 20px; margin-top: 20px; }
                    .preview-section { border: 1px solid #ccc; padding: 10px; }
                </style>
            </head>
            <body>
                <h2>Receipt Preview</h2>
                <div class="preview-container">
                    <div class="preview-section">
                        <h3>PNG Render (Used for Printing)</h3>
                        <img src="${pngDataUrl}" alt="Receipt Preview">
                    </div>
                    <div class="preview-section">
                        <h3>HTML Render</h3>
                        <div style="border: 1px dashed #ccc;">
                            ${receiptContent.innerHTML}
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    }
}

// Default Template Functions
export function getDefaultBillTemplate() {
    return {
        type: 'bill',
        sections: [
            {
                template: '#logo',
                fontSize: 28,
                alignment: 'TextAlign.center',
                isBold: false,
                isUnderlined: false
            },
            {
                template: 'BILL/RECEIPT\n#businessName\n#address\nPhone: #phone\nWeb: #storeLink\nGST: #gstIN',
                fontSize: 30,
                alignment: 'TextAlign.center',
                isBold: true,
                isUnderlined: false
            },
            {
                template: 'Bill #: #billNo\nDate: #timestamp\nCustomer: #customerName\nPhone: #customerPhone\nOrder from: #orderSource',
                fontSize: 22,
                alignment: 'TextAlign.left',
                isBold: false,
                isUnderlined: false
            },
            {
                template: '#itemsList',
                fontSize: 20,
                alignment: 'TextAlign.left',
                isBold: false,
                isUnderlined: false
            },
            {
                template: 'Sub Total: #subtotal\n#charges\n#cgstLine\n#sgstLine\n#creditsUsed\n#loyaltyPointsUsed\n#loyaltyDiscountAmount\nTOTAL: #grandTotal',
                fontSize: 20,
                alignment: 'TextAlign.right',
                isBold: true,
                isUnderlined: false
            },
            {
                template: 'Payment Mode: #payModeDisplay',
                fontSize: 20,
                alignment: 'TextAlign.left',
                isBold: false,
                isUnderlined: false
            },
            // Default UPI QR section (renders only when seller.upiId exists)
            {
                template: '#upiQR',
                fontSize: 20,
                alignment: 'TextAlign.center',
                isBold: false,
                isUnderlined: false
            },
            {
                template: 'Thank You!\nVisit Again\n#storeLink',
                fontSize: 20,
                alignment: 'TextAlign.center',
                isBold: false,
                isUnderlined: false
            }
        ]
    };
}

export function getDefaultKOTTemplate() {
    return {
        type: 'kot',
        sections: [
            {
                template: '#logo',
                fontSize: 28,
                alignment: 'TextAlign.center',
                isBold: false,
                isUnderlined: false
            },
            {
                template: 'KOT',
                fontSize: 32,
                alignment: 'TextAlign.center',
                isBold: true,
                isUnderlined: false
            },
            {
                template: 'KOT #: #billNo\nDate: #timestamp\nCustomer: #customerName\nPhone: #customerPhone',
                fontSize: 22,
                alignment: 'TextAlign.left',
                isBold: false,
                isUnderlined: false
            },
            {
                template: '#kotItemsList',
                fontSize: 20,
                alignment: 'TextAlign.left',
                isBold: false,
                isUnderlined: false
            },
            {
                template: '#instructions',
                fontSize: 20,
                alignment: 'TextAlign.left',
                isBold: false,
                isUnderlined: false
            }
        ]
    };
}
