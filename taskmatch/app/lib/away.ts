import { supabase } from './supabase'
import { logActivity } from './log'
import { promptDialog, toast } from './ui'

// "Away" status: someone on leave is skipped by the matcher and every auto-assign mode
// until the day after their away_until date.

const today = () => new Date().toISOString().slice(0, 10)
export const isAway = (s: { away_until?: string | null } | null | undefined) => !!s?.away_until && s.away_until >= today()
export const fmtDay = (d?: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''

/** Set or clear (until = null) someone's away date. Returns true when saved. */
export async function setAway(s: { id: string; name: string }, until: string | null, self = false) {
  const { error } = await supabase.from('students').update({ away_until: until }).eq('id', s.id)
  if (error) { toast(error.message, 'error'); return false }
  await logActivity({
    action: until ? 'student.away_set' : 'student.away_cleared', entity_type: 'student', entity_id: s.id,
    summary: until ? `${s.name} is away until ${until}` : `${s.name} is back`,
    details: { away_until: until, self },
  })
  toast(until ? `${self ? 'You are' : s.name + ' is'} away until ${fmtDay(until)}.` : `${self ? 'Welcome back' : s.name + ' is back'}.`, 'success')
  return true
}

/** Ask for the last day away, then save it. */
export async function markAway(s: { id: string; name: string }, self = false) {
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const until = await promptDialog({
    title: self ? 'Set yourself as away' : `Mark ${s.name} as away`,
    message: `${self ? 'You' : 'They'} won't be suggested or auto-assigned new tasks until the day after this date. Current tasks stay as they are.`,
    label: 'Away until (last day off)', type: 'date', defaultValue: week, min: today(), confirmLabel: 'Set away',
  })
  if (!until) return false
  if (until < today()) { toast('Pick today or a later date.', 'error'); return false }
  return setAway(s, until, self)
}
