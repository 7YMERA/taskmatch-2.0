'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { startDemo } from '../lib/demo'
import { AuthBuffer, AuthShell } from '../components/AuthShell'
import { Button } from '../components/ui'

const MSGS = ['Opening the demo…', 'Loading the demo team…', 'Almost there…']

// /demo signs you straight into the demo team, no account needed. Linked from the landing page
// and the login page, and safe to share as a link.
export default function Demo() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, MSGS.length - 1)), 600)
    startDemo()
      .then(() => router.replace('/dashboard'))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
    return () => clearInterval(id)
  }, [router, attempt])

  if (error) {
    return (
      <AuthShell title="The demo didn't open" sub={error}
        footer={<>Have an account? <Link href="/login" className="font-medium text-primary-text hover:underline">Sign in</Link></>}>
        <Button className="w-full" onClick={() => { setError(''); setStep(0); setAttempt(a => a + 1) }}>Try again</Button>
      </AuthShell>
    )
  }
  return <AuthBuffer title="Welcome to the TaskMatch demo" message={MSGS[step]} progress={(step + 1) / MSGS.length} />
}
