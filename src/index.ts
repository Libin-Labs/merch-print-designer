export interface MerchPlacementInput {
  readonly id: string;
  readonly kind: 'image' | 'text' | 'shape';
  readonly label: string;
  readonly xIn: number;
  readonly yIn: number;
  readonly widthIn: number;
  readonly heightIn: number;
  readonly color: string;
  readonly sourcePixels?: Readonly<{ width: number; height: number }>;
}

export interface MerchPrintInput {
  readonly widthIn: number;
  readonly heightIn: number;
  readonly targetDpi: number;
  readonly bleedIn: number;
  readonly safeInsetIn: number;
  readonly placements: readonly MerchPlacementInput[];
}

export interface MerchPlacement extends MerchPlacementInput {}
export interface MerchPrintDesign extends MerchPrintInput {}

export interface MerchPrintLimits {
  readonly maxPlacements?: number;
  readonly maxTextLength?: number;
}

export interface MerchPrintDiagnostic {
  readonly code: 'low-resolution' | 'outside-safe-area';
  readonly placementId: string;
  readonly effectiveDpi?: number;
  readonly message: string;
}

export class MerchPrintError extends Error {
  constructor(
    readonly code: 'invalid' | 'capacity',
    message: string,
  ) {
    super(message);
    this.name = 'MerchPrintError';
  }
}

const DEFAULT_LIMITS = { maxPlacements: 10_000, maxTextLength: 4_096 };
type DataRecord = Record<string, unknown>;

function record(value: unknown, name: string, fields: readonly string[]): DataRecord {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new MerchPrintError('invalid', `${name} must be a plain record.`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      !fields.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      throw new MerchPrintError('invalid', `${name} has an unsupported field or accessor.`);
  }
  return value as DataRecord;
}

function validXmlText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      code === 0xfffe ||
      code === 0xffff ||
      (code >= 0xd800 &&
        code <= 0xdbff &&
        (index + 1 >= value.length ||
          value.charCodeAt(index + 1) < 0xdc00 ||
          value.charCodeAt(index + 1) > 0xdfff)) ||
      (code >= 0xdc00 &&
        code <= 0xdfff &&
        (index === 0 ||
          value.charCodeAt(index - 1) < 0xd800 ||
          value.charCodeAt(index - 1) > 0xdbff))
    )
      return false;
  }
  return true;
}

function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new MerchPrintError('invalid', `${name} must be an array.`);
  for (let index = 0; index < value.length; index += 1)
    if (!Object.hasOwn(value, index))
      throw new MerchPrintError('invalid', `${name} cannot have holes.`);
  return value;
}

function finite(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new MerchPrintError('invalid', `${name} must be finite in ${min}..${max}.`);
  return value;
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value))
    throw new MerchPrintError('invalid', `${name} must be a safe identifier.`);
  return value;
}

function limitsOf(input: MerchPrintLimits): typeof DEFAULT_LIMITS {
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(input) as (keyof MerchPrintLimits)[]) {
    const value = input[key];
    const ceiling = DEFAULT_LIMITS[key];
    if (!Number.isSafeInteger(value) || value! < 1 || value! > ceiling)
      throw new MerchPrintError('invalid', `${key} must be an integer in 1..${ceiling}.`);
    limits[key] = value! as never;
  }
  return limits;
}

export function createMerchPrintDesign(
  input: MerchPrintInput,
  options: MerchPrintLimits = {},
): MerchPrintDesign {
  record(input, 'Print design', [
    'widthIn',
    'heightIn',
    'targetDpi',
    'bleedIn',
    'safeInsetIn',
    'placements',
  ]);
  record(options, 'Limits', ['maxPlacements', 'maxTextLength']);
  const limits = limitsOf(options);
  const widthIn = finite(input.widthIn, 'Width (inches)', 0.01, 1_000);
  const heightIn = finite(input.heightIn, 'Height (inches)', 0.01, 1_000);
  const targetDpi = finite(input.targetDpi, 'Target DPI', 1, 2_400);
  if (widthIn * targetDpi > 100_000 || heightIn * targetDpi > 100_000)
    throw new MerchPrintError(
      'capacity',
      'Target pixel dimensions exceed the 100000-pixel edge limit.',
    );
  if (widthIn * heightIn * targetDpi * targetDpi > 200_000_000)
    throw new MerchPrintError(
      'capacity',
      'Target raster area exceeds the 200-million-pixel limit.',
    );
  const bleedIn = finite(input.bleedIn, 'Bleed (inches)', 0, 10);
  const safeInsetIn = finite(
    input.safeInsetIn,
    'Safe inset (inches)',
    0,
    Math.min(widthIn, heightIn) / 2,
  );
  if (safeInsetIn * 2 >= Math.min(widthIn, heightIn))
    throw new MerchPrintError('invalid', 'Safe inset leaves no printable area.');
  const sourcePlacements = array(input.placements, 'Placements');
  if (sourcePlacements.length > limits.maxPlacements)
    throw new MerchPrintError('capacity', 'Placement capacity exceeded.');
  const ids = new Set<string>();
  const placements = sourcePlacements.map((item, index) => {
    const source = record(item, `Placement ${index}`, [
      'id',
      'kind',
      'label',
      'xIn',
      'yIn',
      'widthIn',
      'heightIn',
      'color',
      'sourcePixels',
    ]);
    const id = identifier(source.id, 'Placement ID');
    if (ids.has(id)) throw new MerchPrintError('invalid', `Duplicate placement ID ${id}.`);
    ids.add(id);
    if (source.kind !== 'image' && source.kind !== 'text' && source.kind !== 'shape')
      throw new MerchPrintError('invalid', `Placement ${id} kind is invalid.`);
    if (
      typeof source.label !== 'string' ||
      source.label.length > limits.maxTextLength ||
      !validXmlText(source.label)
    )
      throw new MerchPrintError(
        'invalid',
        `Placement ${id} label must be XML-safe and within the configured limit.`,
      );
    if (typeof source.color !== 'string' || !/^#[0-9a-fA-F]{6}$/u.test(source.color))
      throw new MerchPrintError('invalid', `Placement ${id} color must be a six-digit hex value.`);
    const xIn = finite(source.xIn, `${id}.xIn`, -bleedIn, widthIn + bleedIn);
    const yIn = finite(source.yIn, `${id}.yIn`, -bleedIn, heightIn + bleedIn);
    const placementWidth = finite(source.widthIn, `${id}.widthIn`, 0.001, widthIn + 2 * bleedIn);
    const placementHeight = finite(
      source.heightIn,
      `${id}.heightIn`,
      0.001,
      heightIn + 2 * bleedIn,
    );
    if (xIn + placementWidth > widthIn + bleedIn || yIn + placementHeight > heightIn + bleedIn)
      throw new MerchPrintError('invalid', `Placement ${id} extends beyond the bleed canvas.`);
    let sourcePixels: Readonly<{ width: number; height: number }> | undefined;
    if (source.sourcePixels !== undefined) {
      const pixels = record(source.sourcePixels, `${id}.sourcePixels`, ['width', 'height']);
      const pixelWidth = finite(pixels.width, `${id} source pixel width`, 1, 100_000_000);
      const pixelHeight = finite(pixels.height, `${id} source pixel height`, 1, 100_000_000);
      if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight))
        throw new MerchPrintError(
          'invalid',
          `Placement ${id} source pixel dimensions must be integers.`,
        );
      sourcePixels = Object.freeze({ width: pixelWidth, height: pixelHeight });
    }
    if (source.kind === 'image' && sourcePixels === undefined)
      throw new MerchPrintError(
        'invalid',
        `Image placement ${id} requires source pixel dimensions.`,
      );
    if (source.kind !== 'image' && sourcePixels !== undefined)
      throw new MerchPrintError(
        'invalid',
        `Only image placement ${id} can have source pixel dimensions.`,
      );
    return Object.freeze({
      id,
      kind: source.kind,
      label: source.label,
      xIn,
      yIn,
      widthIn: placementWidth,
      heightIn: placementHeight,
      color: source.color.toLowerCase(),
      ...(sourcePixels === undefined ? {} : { sourcePixels }),
    });
  });
  return Object.freeze({
    widthIn,
    heightIn,
    targetDpi,
    bleedIn,
    safeInsetIn,
    placements: Object.freeze(placements),
  });
}

export function effectivePlacementDpi(placement: MerchPlacement): number | undefined {
  if (placement.kind !== 'image' || !placement.sourcePixels) return undefined;
  const dpi = Math.min(
    placement.sourcePixels.width / placement.widthIn,
    placement.sourcePixels.height / placement.heightIn,
  );
  if (!Number.isFinite(dpi))
    throw new MerchPrintError('invalid', 'Effective placement DPI is out of range.');
  return dpi;
}

export function analyzeMerchPrintDesign(design: MerchPrintDesign): readonly MerchPrintDiagnostic[] {
  const snapshot = createMerchPrintDesign(design);
  const diagnostics: MerchPrintDiagnostic[] = [];
  for (const placement of snapshot.placements) {
    const dpi = effectivePlacementDpi(placement);
    if (dpi !== undefined && dpi < snapshot.targetDpi)
      diagnostics.push(
        Object.freeze({
          code: 'low-resolution',
          placementId: placement.id,
          effectiveDpi: dpi,
          message: `Placement ${placement.id} resolves to ${dpi.toFixed(1)} DPI, below ${snapshot.targetDpi} DPI.`,
        }),
      );
    if (
      placement.xIn < snapshot.safeInsetIn ||
      placement.yIn < snapshot.safeInsetIn ||
      placement.xIn + placement.widthIn > snapshot.widthIn - snapshot.safeInsetIn ||
      placement.yIn + placement.heightIn > snapshot.heightIn - snapshot.safeInsetIn
    )
      diagnostics.push(
        Object.freeze({
          code: 'outside-safe-area',
          placementId: placement.id,
          message: `Placement ${placement.id} extends outside the configured safe area.`,
        }),
      );
  }
  return Object.freeze(diagnostics);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character]!;
  });
}

export function renderMerchPrintSvg(design: MerchPrintDesign): string {
  const snapshot = createMerchPrintDesign(design);
  const contents = snapshot.placements
    .map(
      (placement) =>
        `<g data-placement="${escapeXml(placement.id)}"><rect x="${placement.xIn}" y="${placement.yIn}" width="${placement.widthIn}" height="${placement.heightIn}" fill="${placement.color}" stroke="#111827"/><text x="${placement.xIn + placement.widthIn / 2}" y="${placement.yIn + placement.heightIn / 2}" text-anchor="middle" fill="#ffffff">${escapeXml(placement.label)}</text></g>`,
    )
    .join('');
  const bleed = snapshot.bleedIn;
  const safeX = snapshot.safeInsetIn;
  const safeY = snapshot.safeInsetIn;
  const safeWidth = snapshot.widthIn - snapshot.safeInsetIn * 2;
  const safeHeight = snapshot.heightIn - snapshot.safeInsetIn * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${snapshot.widthIn}in" height="${snapshot.heightIn}in" viewBox="${-bleed} ${-bleed} ${snapshot.widthIn + bleed * 2} ${snapshot.heightIn + bleed * 2}" role="img"><rect x="0" y="0" width="${snapshot.widthIn}" height="${snapshot.heightIn}" fill="#ffffff" stroke="#dc2626" stroke-dasharray="0.04 0.04" data-guide="trim"/><rect x="${safeX}" y="${safeY}" width="${safeWidth}" height="${safeHeight}" fill="none" stroke="#2563eb" stroke-dasharray="0.04 0.04" data-guide="safe"/>${contents}</svg>`;
}
