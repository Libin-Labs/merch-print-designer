import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMerchPrintDesign,
  createMerchPrintDesign,
  effectivePlacementDpi,
  renderMerchPrintSvg,
} from '../dist/esm/index.js';

const sample = () =>
  createMerchPrintDesign({
    widthIn: 10,
    heightIn: 8,
    targetDpi: 300,
    bleedIn: 0.125,
    safeInsetIn: 0.25,
    placements: [
      {
        id: 'logo',
        kind: 'image',
        label: 'Brand & Co',
        xIn: 1,
        yIn: 1,
        widthIn: 2,
        heightIn: 1,
        color: '#336699',
        sourcePixels: { width: 1200, height: 600 },
      },
      {
        id: 'headline',
        kind: 'text',
        label: 'Spring',
        xIn: 4,
        yIn: 2,
        widthIn: 3,
        heightIn: 1,
        color: '#cc0000',
      },
    ],
  });

test('preserves physical inches, target pixel bounds, and immutable placements', () => {
  const design = sample();
  assert.equal(design.widthIn, 10);
  assert.equal(design.heightIn, 8);
  assert.equal(effectivePlacementDpi(design.placements[0]), 600);
  assert.equal(Object.isFrozen(design.placements), true);
  assert.deepEqual(analyzeMerchPrintDesign(design), []);
});

test('diagnoses effective raster DPI and safe-area overflow independently', () => {
  const design = createMerchPrintDesign({
    widthIn: 4,
    heightIn: 4,
    targetDpi: 300,
    bleedIn: 0.125,
    safeInsetIn: 0.25,
    placements: [
      {
        id: 'tiny',
        kind: 'image',
        label: '<logo>',
        xIn: 3.5,
        yIn: 1,
        widthIn: 0.5,
        heightIn: 1,
        color: '#123456',
        sourcePixels: { width: 50, height: 100 },
      },
    ],
  });
  assert.deepEqual(
    analyzeMerchPrintDesign(design).map((item) => item.code),
    ['low-resolution', 'outside-safe-area'],
  );
  assert.equal(analyzeMerchPrintDesign(design)[0].effectiveDpi, 100);
});

test('renders physical-size SVG with trim and safe guides and escapes labels', () => {
  const svg = renderMerchPrintSvg(
    createMerchPrintDesign({
      widthIn: 2,
      heightIn: 2,
      targetDpi: 300,
      bleedIn: 0.125,
      safeInsetIn: 0.2,
      placements: [
        {
          id: 'art',
          kind: 'shape',
          label: '<Art & type>',
          xIn: 0.4,
          yIn: 0.4,
          widthIn: 1,
          heightIn: 1,
          color: '#abcdef',
        },
      ],
    }),
  );
  assert.ok(svg.includes('width="2in"'));
  assert.ok(svg.includes('data-guide="trim"'));
  assert.ok(svg.includes('data-guide="safe"'));
  assert.ok(svg.includes('&lt;Art &amp; type&gt;'));
  assert.equal(svg.includes('<Art'), false);
});

test('rejects missing raster dimensions, unsafe colors, duplicate IDs and outside-bleed placements', () => {
  const base = { widthIn: 4, heightIn: 4, targetDpi: 300, bleedIn: 0.1, safeInsetIn: 0.2 };
  const placement = {
    id: 'image',
    kind: 'image',
    label: 'Image',
    xIn: 1,
    yIn: 1,
    widthIn: 1,
    heightIn: 1,
    color: '#112233',
  };
  assert.throws(
    () => createMerchPrintDesign({ ...base, placements: [placement] }),
    /requires source pixel/,
  );
  assert.throws(
    () =>
      createMerchPrintDesign({
        ...base,
        placements: [{ ...placement, sourcePixels: { width: 10.5, height: 10 } }],
      }),
    /must be integers/,
  );
  assert.throws(
    () =>
      createMerchPrintDesign({
        ...base,
        placements: [{ ...placement, kind: 'text', sourcePixels: { width: 10, height: 10 } }],
      }),
    /Only image placement/,
  );
  assert.throws(
    () =>
      createMerchPrintDesign({
        ...base,
        placements: [{ ...placement, kind: 'shape', color: 'url(x)' }],
      }),
    /six-digit hex/,
  );
  assert.throws(
    () =>
      createMerchPrintDesign({
        ...base,
        placements: [
          { ...placement, kind: 'shape' },
          { ...placement, kind: 'shape' },
        ],
      }),
    /Duplicate placement/,
  );
  assert.throws(
    () =>
      createMerchPrintDesign({
        ...base,
        placements: [{ ...placement, kind: 'shape', xIn: 3.95 }],
      }),
    /beyond the bleed canvas/,
  );
});

test('rejects non-finite, zero, extreme physical inputs and unsafe raster areas', () => {
  const base = {
    widthIn: 4,
    heightIn: 4,
    targetDpi: 300,
    bleedIn: 0,
    safeInsetIn: 0,
    placements: [],
  };
  assert.throws(() => createMerchPrintDesign({ ...base, widthIn: NaN }), /finite/);
  assert.throws(() => createMerchPrintDesign({ ...base, targetDpi: Infinity }), /finite/);
  assert.throws(
    () => createMerchPrintDesign({ ...base, widthIn: 1000, heightIn: 1000, targetDpi: 2400 }),
    /pixel dimensions|raster area/,
  );
  assert.throws(() => createMerchPrintDesign({ ...base, safeInsetIn: 2 }), /Safe inset/);
  assert.throws(() => createMerchPrintDesign({ ...base, placements: new Array(1) }), /holes/);
});

test('rejects accessors and unexpected fields without evaluating user code', () => {
  let invoked = false;
  const input = {
    widthIn: 4,
    heightIn: 4,
    targetDpi: 300,
    bleedIn: 0,
    safeInsetIn: 0,
    placements: [],
  };
  Object.defineProperty(input, 'placements', {
    enumerable: true,
    get() {
      invoked = true;
      return [];
    },
  });
  assert.throws(() => createMerchPrintDesign(input), /accessor/);
  assert.equal(invoked, false);
  assert.throws(() => createMerchPrintDesign({ ...sample(), note: 'extra' }), /unsupported field/);
  assert.throws(
    () =>
      createMerchPrintDesign({
        ...sample(),
        placements: [{ ...sample().placements[0], label: 'bad\u0000label' }],
      }),
    /XML-safe/,
  );
});
