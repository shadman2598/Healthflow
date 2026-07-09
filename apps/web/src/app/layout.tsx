import "./globals.css";
import { Inter } from "next/font/google";
import { Providers } from "../components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: "HealthFlow",
  description: "Connected care platform for patients and clinic teams"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
