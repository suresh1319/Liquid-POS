// Lightweight script to inspect loyalty state for a single customer
const path = require('path');

(async () => {
  try {
    // Attempt to require the project's SDK and LoyaltyEngine; these modules assume a browser environment,
    // so require may fail in Node. We guard and print instructions if that happens.
    const sdkPath = path.join(__dirname, '..', 'js', 'sdk.js');
    const enginePath = path.join(__dirname, '..', 'js', 'utils', 'LoyaltyEngine.js');
    console.log('SDK path:', sdkPath);
    console.log('Engine path:', enginePath);
    console.log('This script is a helper for running in a browser console or electron environment.');
    console.log('If you want to run this script in Node, you need to provide a Node-compatible SDK instance and firestore credentials.');
    console.log('\nInstead, open the browser console on the running app and paste the following commands to inspect the customer:');
    console.log('--- COPY/PASTE START ---');
    console.log("(async function(){\n  const cid = '1HuTYclW3yEvE3mfvO7c';\n  try {\n    const snap = await window.__sdkForDebug.db.collection('Customers').doc(cid).get();\n    console.log('Customer doc:', snap && snap.exists ? (snap.data ? snap.data() : snap._data) : null);\n  } catch(e){ console.error('Failed to fetch customer doc', e); }\n  try {\n    const hist = await window.__sdkForDebug.db.collection('LoyaltyHistory').where('customerId','==',cid).orderBy('createdAt','desc').limit(20).get();\n    console.log('Recent LoyaltyHistory entries (latest 20):', hist && hist.docs ? hist.docs.map(d => (d.data ? d.data() : d._data)) : []);\n  } catch(e){ console.error('Failed to fetch LoyaltyHistory', e); }\n  try {\n    const pts = await window.__computeAvailablePoints(cid);\n    console.log('Computed points:', pts);\n  } catch(e){ console.error('Failed to run computeAvailablePoints', e); }\n})();");
    console.log('--- COPY/PASTE END ---');
    console.log('\nIf you prefer, run this in Node after wiring up a Node-compatible SDK: create a small script that initializes the SDK and calls the same queries.');
  } catch (err) {
    console.error('Error preparing inspect helper:', err);
  }
})();
