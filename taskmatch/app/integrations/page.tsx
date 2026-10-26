'use client'

/* Integrations & matcher insight (Level 3):
   - Import GitHub issues from a repo as tasks (preview, pick, import; dedup by issue URL).
   - Matcher calibration: how well the matcher's skill requirements predicted real outcomes. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { supabase, API, authHeaders } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { effectiveRole, can, roleLabel } from '../lib/role'
import { Card, PageHeader, Icon, Field, Input, Button, Skeleton, EmptyState } from '../components/ui'
import { toast } from '../lib/ui'

type Issue = { number: number; title: string; body: string; url: string; labels: string[]; suggested_severity: string }
type Calib = {
  overall: { n: number; correlation: number | null }
  skills: { skill_id: string; skill_name: string; n: number; avg_score: number; correlation: number | null }[]
  verdict: string
}

const sevAccent = (s: string) => s === 'Critical' ? 'var(--tm-rose)' : s === 'High' ? 'var(--tm-amber)' : s === 'Low' ? 'var(--tm-sky)' : 'var(--tm-violet)'

export default function Integrations() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [me, setMe] = useState('')

  // GitHub import
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [token, setToken] = useState('')
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  // Calibration
  const [calib, setCalib] = useState<Calib | null>(null)
  const [calibLoading, setCalibLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setMe(session.user.email || '')
      setRole(effectiveRole(session))
    })
  }, [])

  const leader = role && can(role, 'tasks.manage')

  useEffect(() => {
    if (!leader) { setCalibLoading(false); return }
    ;(async () => {
      try {
        const res = await axios.get(`${API}/matcher/calibration`, { headers: await authHeaders() })
        setCalib(res.data)
      } catch { /* leave empty */ } finally { setCalibLoading(false) }
    })()
  }, [leader])

  async function preview() {
    if (!owner.trim() || !repo.trim()) return
    setLoading(true); setIssues(null); setPicked(new Set())
    try {
      const res = await axios.post(`${API}/import/github/preview`,
        { owner: owner.trim(), repo: repo.trim(), token: token.trim() || undefined },
        { headers: await authHeaders() })
      setIssues(res.data.issues)
      setPicked(new Set(res.data.issues.map((i: Issue) => i.number)))
      if (res.data.issues.length === 0) toast(res.data.already_imported ? 'All issues already imported.' : 'No open issues found.', 'info')
    } catch (e: unknown) {
      toast((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Preview failed.', 'error')
    } finally { setLoading(false) }
  }

  async function commit() {
    if (!issues) return
    const chosen = issues.filter(i => picked.has(i.number))
    if (!chosen.length) return toast('Pick at least one issue.', 'info')
    setImporting(true)
    try {
      const res = await axios.post(`${API}/import/github/commit`, { issues: chosen }, { headers: await authHeaders() })
      toast(`Imported ${res.data.created} task(s)${res.data.skipped ? `, ${res.data.skipped} skipped` : ''}.`, 'success')
      setIssues(issues.filter(i => !picked.has(i.number)))
      setPicked(new Set())
    } catch (e: unknown) {
      toast((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Import failed.', 'error')
    } finally { setImporting(false) }
  }

  const toggle = (n: number) => setPicked(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })

  const corrLabel = (c: number | null) =>
    c === null ? '—' : c >= 0.3 ? 'good' : c <= -0.3 ? 'poor' : 'weak'
  const corrColor = (c: number | null) =>
    c === null ? 'var(--tm-text-faint)' : c >= 0.3 ? 'var(--tm-emerald)' : c <= -0.3 ? 'var(--tm-rose)' : 'var(--tm-amber)'

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Integrations & matcher" sub="Import work from GitHub, and see how well the matcher predicts real outcomes." />

        {role && !leader ? (
          <Card className="max-w-lg">
            <EmptyState icon={<Icon name="lock" size={28} />} title="Admins and team leads only"
              hint={`Integrations are managed by admins and team leads. You're signed in as ${me} (${roleLabel(role)}).`} />
          </Card>
        ) : (
          <div className="max-w-3xl flex flex-col gap-6">
            {/* GitHub import */}
            <Card className="p-5">
              <p className="text-sm font-semibold text-fg mb-1">Import from GitHub Issues</p>
              <p className="text-[12px] text-faint mb-4">Pull open issues from a repo and turn the ones you pick into tasks. Already-imported issues are skipped.</p>
              <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <Field label="Owner"><Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. 7YMERA" /></Field>
                <Field label="Repo"><Input value={repo} onChange={e => setRepo(e.target.value)} placeholder="e.g. taskmatch-2.0" /></Field>
                <Button onClick={preview} disabled={loading || !owner.trim() || !repo.trim()}>{loading ? 'Loading…' : 'Preview'}</Button>
              </div>
              <Field label="Token (optional — for private repos or higher rate limits)">
                <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_… (not stored)" />
              </Field>

              {loading && <div className="mt-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ height: 40 }} />)}</div>}

              {issues && issues.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-faint">{picked.size} of {issues.length} selected</span>
                    <Button onClick={commit} disabled={importing || !picked.size}>{importing ? 'Importing…' : `Import ${picked.size} as task${picked.size === 1 ? '' : 's'}`}</Button>
                  </div>
                  <div className="tm-card divide-y" style={{ borderColor: 'var(--tm-border)' }}>
                    {issues.map(i => (
                      <label key={i.number} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--tm-surface-1)]">
                        <input type="checkbox" checked={picked.has(i.number)} onChange={() => toggle(i.number)} className="mt-1 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-fg truncate">#{i.number} {i.title}</span>
                          <span className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10.5px] px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, ' + sevAccent(i.suggested_severity) + ' 18%, transparent)', color: sevAccent(i.suggested_severity) }}>{i.suggested_severity}</span>
                            {i.labels.slice(0, 3).map(l => <span key={l} className="text-[10.5px] text-faint">{l}</span>)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Matcher calibration — the outcome feedback loop */}
            <Card className="p-5">
              <p className="text-sm font-semibold text-fg mb-1">Matcher calibration</p>
              <p className="text-[12px] text-faint mb-4">Does a higher required skill level actually go with a better outcome? This checks the matcher against finished, scored work.</p>
              {calibLoading ? (
                <Skeleton style={{ height: 60 }} />
              ) : !calib ? (
                <p className="text-[13px] text-faint">Couldn&apos;t load calibration.</p>
              ) : (
                <>
                  <div className="rounded-lg p-3 mb-3 flex items-start gap-3" style={{ background: 'var(--tm-surface-1)' }}>
                    <span className="shrink-0 mt-0.5" style={{ color: corrColor(calib.overall.correlation) }}><Icon name="target" size={18} /></span>
                    <div>
                      <p className="text-[13px] text-fg">{calib.verdict}</p>
                      <p className="text-[11px] text-faint mt-1">Based on {calib.overall.n} completed, scored task{calib.overall.n === 1 ? '' : 's'}. Overall correlation: <span style={{ color: corrColor(calib.overall.correlation) }}>{calib.overall.correlation ?? '—'}</span></p>
                    </div>
                  </div>
                  {calib.skills.length > 0 && (
                    <div className="tm-card divide-y" style={{ borderColor: 'var(--tm-border)' }}>
                      {calib.skills.slice(0, 10).map(s => (
                        <div key={s.skill_id} className="flex items-center gap-3 px-3 py-2">
                          <span className="flex-1 text-[13px] text-fg truncate">{s.skill_name || s.skill_id}</span>
                          <span className="text-[11px] text-faint">{s.n} task{s.n === 1 ? '' : 's'}</span>
                          <span className="text-[11px] text-faint">avg {s.avg_score}</span>
                          <span className="text-[11px] w-10 text-right" style={{ color: corrColor(s.correlation) }}>{corrLabel(s.correlation)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
