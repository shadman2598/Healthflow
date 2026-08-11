import "./globals.built.css";
import { Providers } from "../components/Providers";

export const metadata = {
  title: "HealthFlow",
  description: "Connected care platform for patients and clinic teams"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
