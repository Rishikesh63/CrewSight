import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "CrewSight — OSS Maintainer's Command Center",
  description:
    'Query GitHub, Discord, Slack, and Gmail in one SQL query. Know exactly what needs your attention right now.',
  keywords: ['OSS', 'maintainer', 'GitHub', 'Discord', 'Slack', 'Gmail', 'Coral', 'dashboard'],
  openGraph: {
    title: "CrewSight — OSS Maintainer's Command Center",
    description: 'One SQL query across GitHub, Discord, Slack, and Gmail.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
