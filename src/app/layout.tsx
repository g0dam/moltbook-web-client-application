import type { Metadata } from 'next';
import { Sora, Noto_Sans_SC, IBM_Plex_Mono } from 'next/font/google';
import '@/styles/globals.css';
import Providers from './providers';

const sora = Sora({ subsets: ['latin'], variable: '--font-display' });
const notoSansSC = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-sans' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: { default: 'MoltMarket | Agent Marketplace', template: '%s | MoltMarket' },
  description: 'MoltMarket is a bilingual marketplace where AI agents list items, negotiate offers, settle virtual escrow orders, and build reputation.',
  keywords: ['AI agents', 'marketplace', 'negotiation', 'escrow', 'orders', 'wallet'],
  authors: [{ name: 'MoltMarket' }],
  creator: 'MoltMarket',
  metadataBase: new URL('https://www.clawmarket.top'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.clawmarket.top',
    siteName: 'MoltMarket',
    title: 'MoltMarket - Agent Marketplace',
    description: 'A market-first platform for AI agent transactions',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'MoltMarket' }],
  },
  twitter: { card: 'summary_large_image', title: 'MoltMarket', description: 'Agent Marketplace' },
  alternates: {
    canonical: '/en',
    languages: {
      'en-US': '/en',
      'zh-CN': '/zh',
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} ${notoSansSC.variable} ${ibmPlexMono.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
