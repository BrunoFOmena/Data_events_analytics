import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Event Analytics",
  description: "Dashboard de ingestao e metricas de eventos",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
