import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";
import Navbar from "./components/ui/Navbar";
import PageTransition from "./components/ui/PageTransition";
import { SolanaProvider } from "./components/providers/SolanaProvider";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Shielded Micro-Lotteries",
  description: "High-frequency trading lottery on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${instrumentSerif.variable} bg-background text-foreground antialiased selection:bg-black/10 selection:text-black`}>
        <SolanaProvider>
          <Navbar />
          {/* PageTransition wraps the children to handle route changes */}
          <div className="pt-16">
            <PageTransition>{children}</PageTransition>
          </div>
        </SolanaProvider>
      </body>
    </html>
  );
}
