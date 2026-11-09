import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';

// Both root layouts (the site root and `/[lang]`) put these variables on
// <html>; `app/global.css` maps them onto the theme's font families.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-bricolage',
  display: 'swap'
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap'
});

export const fontVariables = [
  display.variable,
  sans.variable,
  mono.variable
].join(' ');
