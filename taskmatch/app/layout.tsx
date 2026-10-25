import type { Metadata } from 'next'
import './globals.css'
import { UiHost } from './lib/ui'
import { noFlashScript } from './lib/theme'

export const metadata: Metadata = {
  title: 'TaskMatch',
  description: 'Skill-based task allocation for teams',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
