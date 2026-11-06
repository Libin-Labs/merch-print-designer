import {
  analyzeMerchPrintDesign,
  createMerchPrintDesign,
  effectivePlacementDpi,
  renderMerchPrintSvg,
  type MerchPrintInput,
} from '@lp-labs/merch-print-designer';

const design: MerchPrintInput = {
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
      color: '#123456',
      sourcePixels: { width: 1200, height: 600 },
    },
  ],
};
console.log(
  createMerchPrintDesign(design),
  analyzeMerchPrintDesign(design),
  effectivePlacementDpi(design.placements[0]!),
  renderMerchPrintSvg(design),
);
