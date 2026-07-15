/** Branded type — only obtainable via parseHexColor() */
export type HexColor = string & { readonly __brand: 'HexColor' };

/** Accepts #RGB and #RRGGBB ASCII hex color strings */
const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/**
 * Validates and narrows a string to HexColor.
 * Returns the branded value on success, or throws on invalid input.
 */
export function parseHexColor(value: string): HexColor {
    if (!HEX_COLOR_REGEX.test(value)) {
        throw new Error(`Invalid hex color: "${value}". Expected #RGB or #RRGGBB format.`);
    }
    return value as HexColor;
}

export type DeviceTag = {
    imei: string;
    tag: string;
    color: HexColor;
    group_id: string;
}