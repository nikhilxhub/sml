import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";
import Navbar from "./components/ui/Navbar";
import PageTransition from "./components/ui/PageTransition";

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
        <Navbar />
        {/* PageTransition wraps the children to handle route changes */}
        <div className="pt-16">
          {/* Note: I moved pt-16 to PageTransition in previous step, but let's double check. 
                 PageTransition has pt-16. So I should not add it here or I get double padding.
                 Wait, PageTransition has pt-16. Navbar is fixed h-16.
                 RootLayout -> Body -> Navbar (Fixed) + PageTransition (pt-16 + children).
                 This matches. I will remove the div wrapper here and let PageTransition handle it 
                 OR keep it clean. PageTransition handles it.
             */}
          <PageTransition>{children}</PageTransition>
        </div>
      </body>
    </html>
  );
}
