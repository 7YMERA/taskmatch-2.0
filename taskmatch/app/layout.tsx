import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { UiHost } from './lib/ui'
import { noFlashScript } from './lib/theme'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'TaskMatch — Skill-based task allocation',
  description: 'Match the right people to the right work. TaskMatch ranks your team by skill and workload, pairs strong members with learners, and keeps an auditable record of who did what.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body style={{ minHeight: '100vh', margin: 0 }}>
        {children}
        <UiHost />
      </body>
    </html>
  )
}
