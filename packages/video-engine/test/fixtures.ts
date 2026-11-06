import sharp from 'sharp';

/** Generated fixture logos (no third-party artwork): transparent PNG, opaque JPG on white, tiny, CMYK JPEG. */
const svg = (bg: string | null, w = 800, h = 400) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}
<circle cx="${h / 2}" cy="${h / 2}" r="${h / 2.6}" fill="#7B3FFF"/><rect x="${h / 2 - 20}" y="${h / 2 - 70}" width="40" height="140" rx="8" fill="#00E5FF"/>
<text x="${h + 20}" y="${h / 2 + 30}" font-family="sans-serif" font-size="${h / 4}" font-weight="700" fill="#FF2D95">ACME</text></svg>`);

export const transparentPng = () => sharp(svg(null)).png().toBuffer();
export const opaqueJpg = () => sharp(svg('#ffffff')).jpeg({ quality: 92 }).toBuffer();
export const tinyPng = () => sharp(svg(null, 120, 60)).png().toBuffer();
export const cmykJpg = () => sharp(svg('#ffffff')).toColourspace('cmyk').jpeg().toBuffer();
export const hugePng = () => sharp({ create: { width: 6000, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer();
