import localFont from 'next/font/local';

// Self-hosted (spec §7), OFL-licensed; license files live next to the font files.
export const spaceGrotesk = localFont({ src: '../fonts/space-grotesk-latin-wght-normal.woff2', variable: '--font-space-grotesk', display: 'swap', weight: '300 700' });
export const inter = localFont({ src: '../fonts/inter-latin-wght-normal.woff2', variable: '--font-inter', display: 'swap', weight: '100 900' });
export const jetbrains = localFont({ src: '../fonts/jetbrains-mono-latin-wght-normal.woff2', variable: '--font-jetbrains', display: 'swap', weight: '100 800' });
