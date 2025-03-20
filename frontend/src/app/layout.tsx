import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['200', '300', '400'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'Glycine - Scientific Paper Crawler',
  description: 'A dynamically reconfigurable web crawler for scientific papers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} bg-black min-h-screen antialiased selection:bg-white/10 selection:text-white`}>
        <div className="fixed inset-0 bg-black pointer-events-none" />
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(25,25,25,0.3),transparent_50%)] pointer-events-none" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
