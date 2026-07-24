import "./globals.css";

export const metadata = {
  title: "Cedar Arena",
  description: "Clash Royale tournaments in Lebanon",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rubik:wght@400;500;600;700&family=Cairo:wght@500;700;900&family=JetBrains+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
