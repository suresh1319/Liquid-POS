// Integration test for PrintTemplate.toPrinterCommands()
// This stubs a minimal DOM and rendering pipeline so the test can run in Node.

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

// ---- Minimal DOM and rendering stubs ----
function createReceiptStub({ width = 384, height = 600 } = {}) {
  const stub = {
    style: { margin: '0', padding: '0' },
    offsetWidth: width,
    offsetHeight: height,
    querySelectorAll: () => ({ length: 0, forEach: () => {} }),
    innerHTML: '<div>stub</div>'
  };
  return stub;
}

function installDomStubs({ width = 384, height = 600 } = {}) {
  const receiptNode = createReceiptStub({ width, height });

  global.window = global;
  // simple scheduler
  global.setTimeout = global.setTimeout || ((fn) => fn());

  const contentDocument = {
    open: () => {},
    write: () => {},
    close: () => {},
    querySelector: (sel) => {
      if (sel === '.printer-container') return receiptNode;
      return null;
    },
    createElement: (tag) => ({ tagName: tag.toUpperCase(), style: {}, appendChild: () => {} })
  };

  const body = {
    _children: [],
    appendChild: (el) => body._children.push(el),
    removeChild: (el) => {
      const i = body._children.indexOf(el);
      if (i >= 0) body._children.splice(i, 1);
    },
    contains: (el) => body._children.includes(el)
  };

  global.document = {
    body,
    createElement: (tag) => {
      if (tag === 'iframe') {
        return { style: {}, contentDocument, onload: null };
      }
      if (tag === 'canvas') {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => {
          const ctx = {
            fillStyle: '#fff',
            fillRect: () => {},
            drawImage: () => {},
            getImageData: (x, y, w, h) => ({
              data: new Uint8ClampedArray(w * h * 4)
            }),
            putImageData: () => {}
          };
          return ctx;
        };
        return canvas;
      }
      return { tagName: tag.toUpperCase(), style: {}, appendChild: () => {} };
    }
  };

  // Image stub triggers onload asynchronously when src is set
  global.Image = class ImageStub {
    constructor() { this.onload = null; this.onerror = null; }
    set src(v) {
      this._src = v;
      setTimeout(() => { if (this.onload) this.onload(); }, 0);
    }
  };

  // modern-screenshot stub returns a tiny PNG data URL
  global.modernScreenshot = {
    domToPng: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42mP8/5+hHgMDAwMAAJwBB5x1iQ5JAAAAAElFTkSuQmCC'
  };
}

async function importPrintTemplate() {
  const filePath = path.resolve(__dirname, 'js', 'utils', 'PrintTemplate.js');
  const fileUrl = pathToFileURL(filePath).href;
  const mod = await import(fileUrl);
  return mod;
}

function countOccurrences(buffer, pattern) {
  let count = 0;
  for (let i = 0; i <= buffer.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (buffer[i + j] !== pattern[j]) { ok = false; break; }
    }
    if (ok) count++;
  }
  return count;
}

(async () => {
  // Arrange: install stubs with a tall receipt so banding > 1
  installDomStubs({ width: 384, height: 600 }); // 600px -> 3 bands at 256px per band

  const { PrintTemplate } = await importPrintTemplate();

  const template = new PrintTemplate({
    type: 'bill',
    orderData: {
      items: [ { title: 'Coffee', price: 50, quantity: 1 } ],
      date: new Date(),
      payMode: 'CASH'
    },
    seller: { businessName: 'Test Cafe' }
  });

  // Act
  const bytes = await template.toPrinterCommands();

  // Assert basic structure
  assert.ok(bytes instanceof Uint8Array, 'Expected a Uint8Array from toPrinterCommands');

  // Expect: ESC @ initialize present
  assert.ok(bytes[0] === 0x1B && bytes[1] === 0x40, 'ESC @ initialize missing at start');

  // Expect: GS ( K density and GS | density present at least once
  const hasDensityA = countOccurrences(bytes, Uint8Array.from([0x1D, 0x28, 0x4B, 0x02, 0x00, 0x32, 0x04])) >= 1;
  const hasDensityB = countOccurrences(bytes, Uint8Array.from([0x1D, 0x7C, 0x08])) >= 1;
  assert.ok(hasDensityA && hasDensityB, 'Expected density commands to be present');

  // Expect: multiple GS v 0 raster blocks (one per band)
  const bandHeader = Uint8Array.from([0x1D, 0x76, 0x30, 0x00]);
  const bands = countOccurrences(bytes, bandHeader);
  assert.ok(bands >= 2, `Expected at least 2 raster bands, got ${bands}`);

  // Expect: each band header followed by width bytes 48,0 (384px -> 48 bytes)
  const expectedWidthBytes = Uint8Array.from([0x30, 0x00]); // 48,0 in hex is 0x30,0x00
  let foundWidthFields = 0;
  for (let i = 0; i < bytes.length - 6; i++) {
    if (bytes[i] === 0x1D && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30 && bytes[i + 3] === 0x00) {
      if (bytes[i + 4] === 48 && bytes[i + 5] === 0) foundWidthFields++;
    }
  }
  assert.ok(foundWidthFields === bands, 'Each raster band should declare width correctly');

  // Expect: Feed and cut commands present and cut is the final 4 bytes
  const feedCount = countOccurrences(bytes, Uint8Array.from([0x1B, 0x64, 0x02]));
  const cutCount = countOccurrences(bytes, Uint8Array.from([0x1D, 0x56, 0x41, 0x10]));
  assert.ok(feedCount >= 1, 'Feed command missing');
  assert.ok(cutCount >= 1, 'Cut command missing');
  const last4 = Array.from(bytes.slice(-4));
  assert.deepStrictEqual(last4, [0x1D, 0x56, 0x41, 0x10], 'Cut command should be the final bytes');

  console.log('PrintTemplate.toPrinterCommands banding test: PASS');
})().catch((err) => {
  console.error('PrintTemplate.toPrinterCommands banding test: FAIL');
  console.error(err);
  process.exit(1);
});
