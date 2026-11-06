import merch = require('@lp-labs/merch-print-designer');

const design: merch.MerchPrintInput = {
  widthIn: 4,
  heightIn: 4,
  targetDpi: 300,
  bleedIn: 0.1,
  safeInsetIn: 0.2,
  placements: [],
};
console.log(merch.createMerchPrintDesign(design), merch.analyzeMerchPrintDesign(design));
