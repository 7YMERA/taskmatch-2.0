'use client'

// The activity log moved to the audit trail. Old links and bookmarks land there.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Logs() {
  const router = useRouter()
  useEffect(() => { router.replace('/audit' + window.location.search) }, [router])
  return null
}
