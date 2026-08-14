import "./globals.built.css";
import "./a11y.css";
import { Providers } from "../components/Providers";

export const metadata = {
  title: "HealthFlow",
  description: "Connected care platform for patients and clinic teams"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
