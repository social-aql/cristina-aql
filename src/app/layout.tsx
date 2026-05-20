import type { Metadata } from 'next';
import { League_Spartan, Inter, JetBrains_Mono } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { RootLayoutClient } from '@/app/layout-client';
import { activeTheme } from '@/config/theme.config';
import './globals.css';

const leagueSpartan = League_Spartan({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-league-spartan',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI LICHIDITATE',
  description: 'Smart money positioning for content.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cssVars = activeTheme.cssVariables;

  return (
    <html
      lang="ro"
      className={`${leagueSpartan.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      style={cssVars as React.CSSProperties}
    >
      <body>
        <AntdRegistry>
          <RootLayoutClient>{children}</RootLayoutClient>
        </AntdRegistry>
      </body>
    </html>
  );
}
