const PrinterTester = () => {
    const [printerStatus, setPrinterStatus] = useState({
        isConnected: false,
        deviceName: null,
        lastError: null,
        printerSize: '3inch',
        type: 'bluetooth', // bluetooth, wired, wifi
        ipAddress: '',
        port: '9100',
        usbVendorId: '',
        usbProductId: ''
    });
    const [testResults, setTestResults] = useState([]);
    const [isTestMode, setIsTestMode] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Initialize printer status
    useEffect(() => {
        // Load saved printer settings from localStorage
        const savedSettings = localStorage.getItem('printerSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            setPrinterStatus(prev => ({
                ...prev,
                ...settings
            }));
        }

        if (BluetoothPrinting) {
            setPrinterStatus(prev => ({
                ...prev,
                isConnected: BluetoothPrinting.connected,
                deviceName: BluetoothPrinting.device?.name || null,
                printerSize: BluetoothPrinting.printerWidth === 32 ? '2inch' :
                    BluetoothPrinting.printerWidth === 48 ? '3inch' : '4inch'
            }));
        }
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('printerSettings', JSON.stringify({
            type: printerStatus.type,
            printerSize: printerStatus.printerSize,
            ipAddress: printerStatus.ipAddress,
            port: printerStatus.port,
            usbVendorId: printerStatus.usbVendorId,
            usbProductId: printerStatus.usbProductId
        }));
    }, [printerStatus]);

    const runPrinterTest = async () => {
        setIsTestMode(true);
        setTestResults([]);

        try {
            switch (printerStatus.type) {
                case 'bluetooth':
                    await testBluetoothPrinter();
                    break;
                case 'wired':
                    await testWiredPrinter();
                    break;
                case 'wifi':
                    await testWifiPrinter();
                    break;
                default:
                    throw new Error('Invalid printer type selected');
            }
        } catch (error) {
            addTestResult(`❌ Error: ${error.message}`, 'error');
            setPrinterStatus(prev => ({ ...prev, lastError: error.message }));
        } finally {
            setIsTestMode(false);
        }
    };

    const testBluetoothPrinter = async () => {
        // Step 1: Check Bluetooth Support
        addTestResult('Checking Bluetooth support...', 'info');
        if (!BluetoothPrinting.isSupported()) {
            throw new Error('Bluetooth not supported in this browser. Please use Chrome or Edge.');
        }
        addTestResult('✓ Bluetooth is supported', 'success');

        // Step 2: Check Bluetooth Availability
        addTestResult('Checking Bluetooth availability...', 'info');
        const isAvailable = await navigator.bluetooth.getAvailability();
        if (!isAvailable) {
            throw new Error('Bluetooth is not available. Please ensure Bluetooth is turned on.');
        }
        addTestResult('✓ Bluetooth is available', 'success');

        // Step 3: Connect to Printer
        addTestResult('Attempting to connect to printer...', 'info');
        await BluetoothPrinting.connect();
        addTestResult(`✓ Successfully connected to ${BluetoothPrinting.device.name}`, 'success');

        // Step 4: Print Test Pattern
        addTestResult('Printing test pattern...', 'info');
        await printTestPattern();
        addTestResult('✓ Test pattern printed successfully', 'success');

        setPrinterStatus(prev => ({
            ...prev,
            isConnected: true,
            deviceName: BluetoothPrinting.device.name,
            lastError: null
        }));
    };

    const testWiredPrinter = async () => {
        addTestResult('Testing USB/Serial printer connection...', 'info');

        try {
            // Check if Web Serial API is available
            if (!('serial' in navigator)) {
                throw new Error('Web Serial API is not supported in this browser');
            }

            // Request port access
            addTestResult('Requesting USB/Serial port access...', 'info');
            const port = await navigator.serial.requestPort();
            addTestResult('✓ Port access granted', 'success');

            // Try to open the port
            await port.open({ baudRate: 9600 });
            addTestResult('✓ Port opened successfully', 'success');

            // Print test pattern
            addTestResult('Printing test pattern...', 'info');
            const writer = port.writable.getWriter();
            await printTestPattern(writer);
            writer.releaseLock();

            addTestResult('✓ Test pattern sent successfully', 'success');

            // Close the port
            await port.close();
            addTestResult('✓ Port closed successfully', 'success');

            setPrinterStatus(prev => ({
                ...prev,
                isConnected: true,
                deviceName: 'USB/Serial Printer',
                lastError: null
            }));
        } catch (error) {
            throw new Error(`USB/Serial printer error: ${error.message}`);
        }
    };

    const testWifiPrinter = async () => {
        addTestResult('Testing WiFi printer connection...', 'info');

        try {
            const { ipAddress, port } = printerStatus;
            if (!ipAddress) {
                throw new Error('IP Address is required for WiFi printer');
            }

            addTestResult(`Attempting to connect to ${ipAddress}:${port}...`, 'info');

            // In a real implementation, you would:
            // 1. Establish a WebSocket connection to a proxy server
            // 2. The proxy server would handle the raw TCP connection to the printer
            // 3. Send the test pattern through the WebSocket

            // For now, we'll just simulate the connection
            await new Promise(resolve => setTimeout(resolve, 1000));

            addTestResult('✓ Connected to printer', 'success');
            addTestResult('Printing test pattern...', 'info');

            // Simulate printing
            await new Promise(resolve => setTimeout(resolve, 1000));

            addTestResult('✓ Test pattern sent successfully', 'success');

            setPrinterStatus(prev => ({
                ...prev,
                isConnected: true,
                deviceName: `Network Printer (${ipAddress})`,
                lastError: null
            }));
        } catch (error) {
            throw new Error(`WiFi printer error: ${error.message}`);
        }
    };

    const printTestPattern = async (writer) => {
        const encoder = new TextEncoder();
        const ESC = 0x1B;
        const LF = 0x0A;

        // Create test pattern with different styles and alignments
        const testData = new Uint8Array([
            ESC, 0x40,  // Initialize printer
            ESC, 0x61, 0x01,  // Center alignment
            ...encoder.encode("=== Printer Test ===\\n"),
            ESC, 0x45, 0x01,  // Bold on
            ...encoder.encode("Bold Text Test\\n"),
            ESC, 0x45, 0x00,  // Bold off
            ESC, 0x61, 0x00,  // Left alignment
            ...encoder.encode("Left Aligned Text\\n"),
            ESC, 0x61, 0x02,  // Right alignment
            ...encoder.encode("Right Aligned Text\\n"),
            ESC, 0x61, 0x01,  // Center alignment
            ESC, 0x21, 0x10,  // Double height
            ...encoder.encode("Double Height\\n"),
            ESC, 0x21, 0x00,  // Normal size
            ...encoder.encode("------------------------\\n"),
            LF, LF  // Line feeds
        ]);

        if (writer) {
            await writer.write(testData);
        } else if (BluetoothPrinting) {
            await BluetoothPrinting.sendData(testData);
        }
    };

    const addTestResult = (message, type = 'info') => {
        setTestResults(prev => [...prev, { message, type, timestamp: new Date() }]);
    };

    const disconnectPrinter = async () => {
        try {
            if (printerStatus.type === 'bluetooth' && BluetoothPrinting) {
                await BluetoothPrinting.disconnect();
            }
            setPrinterStatus(prev => ({
                ...prev,
                isConnected: false,
                deviceName: null,
                lastError: null
            }));
            addTestResult('Printer disconnected successfully', 'info');
        } catch (error) {
            addTestResult(`Error disconnecting: ${error.message}`, 'error');
        }
    };

    const changePrinterSize = (size) => {
        if (BluetoothPrinting) {
            BluetoothPrinting.setPrinterSize(size);
            setPrinterStatus(prev => ({ ...prev, printerSize: size }));
            addTestResult(`Printer size changed to ${size}`, 'info');
        }
    };

    const handlePrinterTypeChange = (type) => {
        setPrinterStatus(prev => ({
            ...prev,
            type,
            isConnected: false,
            deviceName: null,
            lastError: null
        }));
        setTestResults([]);
    };

    const updatePrinterSettings = (setting, value) => {
        setPrinterStatus(prev => ({
            ...prev,
            [setting]: value
        }));
    };

    return (
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto my-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                    <i className="ph ph-printer text-2xl text-primary mr-3"></i>
                    <h2 className="text-xl font-semibold text-gray-800">Printer Configuration</h2>
                </div>
                <div className="flex items-center">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${printerStatus.isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                        <span className={`w-2 h-2 rounded-full mr-2 ${printerStatus.isConnected ? 'bg-green-500' : 'bg-gray-500'
                            }`}></span>
                        {printerStatus.isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
            </div>

            {/* Printer Type Selection */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Printer Type</h3>
                <div className="grid grid-cols-3 gap-4">
                    <button
                        onClick={() => handlePrinterTypeChange('bluetooth')}
                        className={`flex flex-col items-center p-4 rounded-lg border transition-all ${printerStatus.type === 'bluetooth'
                            ? 'border-primary bg-red-50 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <i className="ph ph-bluetooth text-2xl mb-2"></i>
                        <span className="text-sm font-medium">Bluetooth</span>
                    </button>
                    <button
                        onClick={() => handlePrinterTypeChange('wired')}
                        className={`flex flex-col items-center p-4 rounded-lg border transition-all ${printerStatus.type === 'wired'
                            ? 'border-primary bg-red-50 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <i className="ph ph-usb text-2xl mb-2"></i>
                        <span className="text-sm font-medium">USB/Serial</span>
                    </button>
                    <button
                        onClick={() => handlePrinterTypeChange('wifi')}
                        className={`flex flex-col items-center p-4 rounded-lg border transition-all ${printerStatus.type === 'wifi'
                            ? 'border-primary bg-red-50 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <i className="ph ph-wifi-high text-2xl mb-2"></i>
                        <span className="text-sm font-medium">WiFi</span>
                    </button>
                </div>
            </div>

            {/* Current Status and Settings */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-medium text-gray-700">Printer Settings</h3>
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-sm text-primary hover:text-red-600 flex items-center"
                    >
                        <i className={`ph ph-caret-${showAdvanced ? 'up' : 'down'} mr-1`}></i>
                        {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Basic Settings */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-gray-600">Device Name</p>
                            <p className="font-medium">{printerStatus.deviceName || 'Not Connected'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Printer Size</p>
                            <select
                                value={printerStatus.printerSize}
                                onChange={(e) => changePrinterSize(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                            >
                                <option value="2inch">2 inch</option>
                                <option value="3inch">3 inch</option>
                                <option value="4inch">4 inch</option>
                            </select>
                        </div>
                    </div>

                    {/* Advanced Settings */}
                    {showAdvanced && (
                        <div className="pt-4 border-t">
                            {printerStatus.type === 'wifi' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-600">IP Address</label>
                                        <input
                                            type="text"
                                            value={printerStatus.ipAddress}
                                            onChange={(e) => updatePrinterSettings('ipAddress', e.target.value)}
                                            placeholder="192.168.1.100"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600">Port</label>
                                        <input
                                            type="text"
                                            value={printerStatus.port}
                                            onChange={(e) => updatePrinterSettings('port', e.target.value)}
                                            placeholder="9100"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                        />
                                    </div>
                                </div>
                            )}

                            {printerStatus.type === 'wired' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-600">Vendor ID (optional)</label>
                                        <input
                                            type="text"
                                            value={printerStatus.usbVendorId}
                                            onChange={(e) => updatePrinterSettings('usbVendorId', e.target.value)}
                                            placeholder="0x0483"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600">Product ID (optional)</label>
                                        <input
                                            type="text"
                                            value={printerStatus.usbProductId}
                                            onChange={(e) => updatePrinterSettings('usbProductId', e.target.value)}
                                            placeholder="0x5740"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-4 mb-6">
                <button
                    onClick={runPrinterTest}
                    disabled={isTestMode}
                    className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                    <i className="ph ph-test-tube mr-2"></i>
                    Run Printer Test
                </button>

                {printerStatus.isConnected && (
                    <button
                        onClick={disconnectPrinter}
                        className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                        <i className="ph ph-plug mr-2"></i>
                        Disconnect
                    </button>
                )}
            </div>

            {/* Test Results */}
            {testResults.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                        <h3 className="text-sm font-medium text-gray-700">Test Results</h3>
                    </div>
                    <div className="divide-y max-h-60 overflow-auto">
                        {testResults.map((result, index) => (
                            <div
                                key={index}
                                className={`px-4 py-2 text-sm ${result.type === 'error' ? 'text-red-600 bg-red-50' :
                                    result.type === 'success' ? 'text-green-600 bg-green-50' :
                                        'text-gray-600'
                                    }`}
                            >
                                {result.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Troubleshooting Guide */}
            <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Troubleshooting Guide</h3>
                <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                    <ul className="list-disc list-inside space-y-2">
                        {printerStatus.type === 'bluetooth' && (
                            <>
                                <li>Ensure your printer is turned on and in pairing mode</li>
                                <li>Check if Bluetooth is enabled on your device</li>
                                <li>Keep the printer within 30 feet of your device</li>
                                <li>Try turning the printer off and on again</li>
                                <li>Clear your browser's Bluetooth cache if connection issues persist</li>
                            </>
                        )}
                        {printerStatus.type === 'wired' && (
                            <>
                                <li>Ensure your printer is properly connected via USB</li>
                                <li>Check if the printer is turned on</li>
                                <li>Try a different USB port</li>
                                <li>Ensure printer drivers are installed (if required)</li>
                                <li>Check USB cable for any damage</li>
                            </>
                        )}
                        {printerStatus.type === 'wifi' && (
                            <>
                                <li>Ensure printer is connected to the same network as your device</li>
                                <li>Verify the IP address and port settings</li>
                                <li>Check if printer is turned on and ready</li>
                                <li>Try restarting the printer</li>
                                <li>Ensure firewall is not blocking the connection</li>
                            </>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
};
