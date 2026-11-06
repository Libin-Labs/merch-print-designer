# @lp-labs/merch-print-designer

A bounded physical-unit print layout core for merch artwork placements, trim/bleed/safe-area
guides, effective image-DPI diagnostics, and SVG review output. Widths, heights and coordinates
are explicitly measured in inches; pixel dimensions are kept separate from physical size.

## Install and quickstart

```sh
npm install @lp-labs/merch-print-designer
```

```js
import assert from 'node:assert/strict';
import {
  analyzeMerchPrintDesign,
  createMerchPrintDesign,
  effectivePlacementDpi,
  renderMerchPrintSvg,
} from '@lp-labs/merch-print-designer';

const design = createMerchPrintDesign({
  widthIn: 12,
  heightIn: 10,
  targetDpi: 300,
  bleedIn: 0.125,
  safeInsetIn: 0.25,
  placements: [
    {
      id: 'logo',
      kind: 'image',
      label: 'Logo',
      xIn: 1,
      yIn: 1,
      widthIn: 2,
      heightIn: 1,
      color: '#336699',
      sourcePixels: { width: 1200, height: 600 },
    },
  ],
});
assert.equal(effectivePlacementDpi(design.placements[0]), 600);
console.log(analyzeMerchPrintDesign(design), renderMerchPrintSvg(design));
```

## API and types

- `createMerchPrintDesign(input, limits?)` validates and snapshots an inch-based canvas and
  placements.
- `effectivePlacementDpi(placement)` returns the limiting source pixels-per-inch for a raster
  placement, or `undefined` when source pixel dimensions are absent.
- `analyzeMerchPrintDesign(design)` reports `low-resolution` when a raster placement's limiting
  effective DPI is below `targetDpi`, and `outside-safe-area` when a placement crosses the requested
  inset.
- `renderMerchPrintSvg(design)` returns an SVG with physical inch size, trim and safe guides, and
  labeled placement rectangles.
- `MerchPrintInput` contains physical `widthIn`/`heightIn`, `targetDpi`, `bleedIn`, `safeInsetIn`,
  and `placements`. Each `MerchPlacementInput` specifies a unique ID, `image`/`text`/`shape` kind,
  label, inch-based x/y/width/height, and six-digit hex color. Image placements require
  `sourcePixels: { width, height }`.
- `MerchPrintLimits` defaults to 10,000 placements and 4,096 characters per label.
  `MerchPrintError.code` is `invalid` or `capacity`. The configured count and text limits can be
  lowered from their defaults.
- Exported types: `MerchPlacementInput`, `MerchPlacement`, `MerchPrintInput`, `MerchPrintDesign`,
  `MerchPrintLimits`, and `MerchPrintDiagnostic`.

Geometry may extend into the declared bleed, but not beyond it. Raster effective DPI is the smaller
of source-pixel-width/placement-width and source-pixel-height/placement-height. Vector/text
placements have no source DPI diagnostic. Safe-area and resolution findings are warnings; they
never modify the layout.

## Customize, errors, and limits

Choose `targetDpi` from the receiving vendor's current specification and match the actual export
scale to the supplied inch dimensions. Supply the pixel dimensions of the source image, not its
displayed pixel size after arbitrary CSS transforms. Set bleed and safe inset explicitly and use
the diagnostics to review artwork positions. The SVG is a geometry preview, not production output.

Dimensions are limited to 1,000 inches per edge; target density is 1..2,400 DPI; computed raster
edges are at most 100,000 pixels and target raster area at most 200 million pixels. Bleed is at most
10 inches. Counts and XML-safe text length are bounded by `MerchPrintLimits`. Invalid or unsafe values throw
`MerchPrintError`; capacity exhaustion is `code === 'capacity'`.

This package does not provide color management, CMYK/spot-color conversion, ICC profiles, font
outlining, transparency flattening, halftoning, rasterization, garment templates, printer marks
beyond trim/safe guides, vendor upload, or proof approval. DPI warnings are simple geometric ratios,
not a print-quality guarantee or production-readiness certification. Consult your printer's current
specification before manufacture.

Validation and diagnostics are O(placements); SVG output is O(placements + label text). The output
is a single bounded string. ESM/CommonJS are independent builds with TypeScript declarations and
zero runtime/peer dependencies.

## Modules and development

TypeScript `^5.9.3` and Prettier `^3.6.2` are development-only.

```sh
npm ci --offline
npm run build
npm run typecheck
npm test
npm run format:check
```

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
