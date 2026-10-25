'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, API, authHeaders } from '../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import { logActivity } from '../lib/log'
import Sidebar from '../components/Sidebar'
import SkillPicker from '../components/SkillPicker'
import PersonQuickView from '../components/PersonQuickView'
import { effectiveRole, can, roleLabel } from '../lib/role'
import { isAway, fmtDay, setAway as saveAway, markAway as askAway } from '../lib/away'
import { toast, confirmDialog } from '../lib/ui'
import { Card, Badge, Button, Input, Field, Icon, EmptyState, Skeleton, bandAccent } from '../components/ui'

const PROGRAMMES = ['CS', 'IT', 'IS']  // programmes: Computer Science, Information Technology, Information Systems
// Bright palette that stays readable on the dark background
const GROUP_COLORS = ['#a78bfa', '#34d399', '#38bdf8', '#fbbf24', '#fb7185', '#2dd4bf', '#fb923c', '#f472b6']

// Theme-token text colours, so copy flips correctly between dark and light.
const TEXT = { color: 'var(--tm-text)' }
const MUTED = { color: 'var(--tm-text-muted)' }
const FAINT = { color: 'var(--tm-text-faint)' }
const AVATAR = { background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }
const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced']
// Skills-matrix cell shades: one hue, light → dark by level.
const LEVEL_FILL = ['', 'color-mix(in srgb, var(--tm-chart-1) 40%, var(--tm-surface-1))', 'color-mix(in srgb, var(--tm-chart-1) 62%, var(--tm-surface-1))', 'var(--tm-chart-1)']
type PeopleView = 'roster' | 'cards' | 'matrix'
type Avail = 'all' | 'free' | 'room' | 'limit' | 'away'
type PeopleSort = 'group' | 'name' | 'available' | 'score'

export default function Students() {
  const router = useRouter()
  const [students, setStudents] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editingStudent, setEditingStudent] = useState<string | null>(null)
  const [editSkills, setEditSkills] = useState<{ skill_id: string, proficiency: number }[]>([])
  const [form, setForm] = useState({ name: '', matric: '', programme: '', year: '', email: '', group_label: '' })
  const [accounts, setAccounts] = useState<any[]>([])          // signup (login) accounts, from the admin API
  const [addMode, setAddMode] = useState<'existing' | 'blank'>('existing')
  const [pickedAccountId, setPickedAccountId] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<{ skill_id: string, proficiency: number }[]>([])
  const [stats, setStats] = useState<{ [student_id: string]: any }>({})
  const [wip, setWip] = useState<{ [student_id: string]: any }>({})
  const [wipLimit, setWipLimit] = useState(3)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)   // per-row "⋯" actions menu
  const [groupFilter, setGroupFilter] = useState('all')
  const [groups, setGroups] = useState<any[]>([])
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupForm, setGroupForm] = useState<{ name: string, color: string, members: string[] }>({ name: '', color: GROUP_COLORS[0], members: [] })
  const [view, setView] = useState<PeopleView>('roster')
  const [quickId, setQuickId] = useState<string | null>(null)   // person open in the side panel
  const [query, setQuery] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [minLevel, setMinLevel] = useState(1)
  const [avail, setAvail] = useState<Avail>('all')
  const [sort, setSort] = useState<PeopleSort>('group')
  const urlReady = useRef(false)

  // Search, filters and layout live in the URL so a slice like "React, Intermediate+, free" can be shared.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('q')) setQuery(q.get('q')!)
    if (q.get('skill')) setSkillFilter(q.get('skill')!)
    if (['1', '2', '3'].includes(q.get('level') || '')) setMinLevel(Number(q.get('level')))
    if (['free', 'room', 'limit', 'away'].includes(q.get('avail') || '')) setAvail(q.get('avail') as Avail)
    if (['matrix', 'cards'].includes(q.get('view') || '')) setView(q.get('view') as PeopleView)
    if (q.get('open')) setQuickId(q.get('open'))
    if (['name', 'available', 'score'].includes(q.get('sort') || '')) setSort(q.get('sort') as PeopleSort)
    if (q.get('group')) setGroupFilter(q.get('group')!)
    urlReady.current = true
  }, [])
  useEffect(() => {
    if (!urlReady.current) return
    const u = new URL(window.location.href)
    const set = (k: string, v: string, def: string) => { if (v && v !== def) u.searchParams.set(k, v); else u.searchParams.delete(k) }
    set('q', query.trim(), ''); set('skill', skillFilter, ''); set('level', skillFilter ? String(minLevel) : '', '')
    set('avail', avail, 'all'); set('view', view, 'roster'); set('sort', sort, 'group'); set('group', groupFilter, 'all')
    set('open', quickId || '', '')
    window.history.replaceState(null, '', u)
  }, [query, skillFilter, minLevel, avail, view, sort, groupFilter, quickId])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const role = effectiveRole(session)
      setUserRole(role)
      setUserEmail(session.user.email || '')
      if (can(role, 'people.manage')) fetchAccounts()   // account list is for people managers
    })
    fetchStudents()
    fetchSkills()
    fetchStats()
    fetchGroups()
    fetchWip()
  }, [])

  const fetchWip = async () => {
    try {
      const res = await axios.get(`${API}/wip`, { headers: await authHeaders() })
      const map: { [id: string]: any } = {}
      for (const s of res.data.students) map[s.student_id] = s
      setWip(map)
      setWipLimit(res.data.wip_limit ?? 3)
    } catch { /* backend may be down; WIP just won't show */ }
  }

  const fetchAccounts = async () => {
    try {
      const headers = await authHeaders()
      const res = await axios.get(`${API}/accounts`, { headers })
      setAccounts(res.data.accounts || [])
    } catch {
      // Not a leader, or the server has no admin key configured — the feature just stays hidden.
    }
  }

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/student-stats`, { headers: await authHeaders() })
      const map: { [id: string]: any } = {}
      for (const s of res.data.stats) map[s.student_id] = s
      setStats(map)
    } catch { /* backend may be down; scores just won't show */ }
  }

  const fetchGroups = async () => {
    const { data } = await supabase.from('groups').select('*')
    setGroups(data || [])
  }

  const createGroup = async () => {
    const name = groupForm.name.trim()
    if (!name) return toast('Enter a group name', 'error')
    // Reuse an existing group (incl. one created on the Tasks tab) instead of erroring —
    // this is what lets you ADD members to an existing group.
    const existing = groups.find(g => g.name === name)
    if (!existing) {
      const { error } = await supabase.from('groups').insert({ name, color: groupForm.color, created_by: userEmail })
      if (error && !error.message.toLowerCase().includes('duplicate')) return toast(error.message, 'error')
    }
    if (groupForm.members.length > 0) {
      await supabase.from('students').update({ group_label: name }).in('id', groupForm.members)
    }
    const n = groupForm.members.length
    await logActivity({
      action: existing ? 'group.members_added' : 'group.created', entity_type: 'group',
      summary: existing
        ? `Added ${n} member${n === 1 ? '' : 's'} to group '${name}'`
        : `Created group '${name}' with ${n} member${n === 1 ? '' : 's'}`,
      details: { color: groupForm.color, members: groupForm.members, reused: !!existing },
    })
    setGroupForm({ name: '', color: GROUP_COLORS[0], members: [] })
    setShowGroupForm(false)
    fetchGroups()
    fetchStudents()
  }

  const disbandGroup = async (name: string) => {
    if (!(await confirmDialog({ title: `Disband "${name}"?`, message: 'Its members and tasks will be ungrouped — the students and tasks themselves are kept.', danger: true, confirmLabel: 'Disband' }))) return
    await supabase.from('students').update({ group_label: null }).eq('group_label', name)
    await supabase.from('tasks').update({ group_label: null }).eq('group_label', name)
    await supabase.from('groups').delete().eq('name', name)
    await logActivity({ action: 'group.disbanded', entity_type: 'group', summary: `Disbanded group '${name}'` })
    setGroupFilter('all')
    fetchGroups()
    fetchStudents()
  }

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('*, student_skills(skill_id, proficiency, skills(skill_name))')
      .order('name', { ascending: true })   // stable alphabetical order (was unordered → recently-edited rows sank to the bottom)
    setStudents(data || [])
    setLoading(false)
  }

  const fetchSkills = async () => {
    const { data } = await supabase.from('skills').select('*')
    setSkills(data || [])
  }

  const addStudent = async () => {
    if (!form.name || !form.matric || !form.email) return toast('Fill in name, matric and email', 'error')
    const { data, error } = await supabase.from('students').insert({
      name: form.name,
      matric: form.matric,
      programme: form.programme,
      year: parseInt(form.year),
      email: form.email,
      group_label: form.group_label.trim() || null
    }).select().single()
    if (error) return toast(error.message, 'error')
    if (selectedSkills.length > 0) {
      await supabase.from('student_skills').insert(
        selectedSkills.map(s => ({ student_id: data.id, skill_id: s.skill_id, proficiency: s.proficiency }))
      )
    }
    await logActivity({
      action: 'student.added', entity_type: 'student', entity_id: data.id,
      summary: `Added student ${form.name} (${form.matric}, ${form.programme})${form.group_label ? ` to group ${form.group_label}` : ''}`,
      details: { matric: form.matric, programme: form.programme, email: form.email, group_label: form.group_label, skills: selectedSkills },
    })
    setForm({ name: '', matric: '', programme: '', year: '', email: '', group_label: '' })
    setSelectedSkills([])
    setPickedAccountId('')
    setShowForm(false)
    fetchStudents()
    fetchAccounts()   // the picked account is now on the roster — refresh so it drops out of the picker
    toast(`${form.name} added successfully!`, 'success')
  }

  const startEditing = (student: any) => {
    setEditingStudent(student.id)
    setEditSkills(student.student_skills?.map((ss: any) => ({
      skill_id: ss.skill_id,
      proficiency: ss.proficiency
    })) || [])
  }

  const saveSkills = async (student_id: string) => {
    await supabase.from('student_skills').delete().eq('student_id', student_id)
    if (editSkills.length > 0) {
      await supabase.from('student_skills').insert(
        editSkills.map(s => ({ student_id, skill_id: s.skill_id, proficiency: s.proficiency }))
      )
    }
    const who = students.find(s => s.id === student_id)?.name || student_id
    await logActivity({
      action: 'student.skills_updated', entity_type: 'student', entity_id: student_id,
      summary: `Updated skills for ${who} (${editSkills.length} skill${editSkills.length === 1 ? '' : 's'})`,
      details: { skills: editSkills },
    })
    setEditingStudent(null)
    fetchStudents()
  }

  const uploadStudentAvatar = async (studentId: string, name: string, file?: File) => {
    if (!file) return
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${studentId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' })
    if (error) return toast(`Upload failed: ${error.message}`, 'error')
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('students').update({ avatar_url: pub.publicUrl }).eq('id', studentId)
    await logActivity({ action: 'student.photo_updated', entity_type: 'student', entity_id: studentId, summary: `Updated profile photo for ${name}` })
    fetchStudents()
  }

  const removeFromGroup = async (id: string, name: string, group: string) => {
    if (!(await confirmDialog({
      title: `Remove ${name} from "${group}"?`,
      message: 'They stay in the project — their profile, skills and history are kept. Only their group membership is cleared.',
      confirmLabel: 'Remove from group',
    }))) return
    await supabase.from('students').update({ group_label: null }).eq('id', id)
    await logActivity({
      action: 'student.removed_from_group', entity_type: 'student', entity_id: id,
      summary: `Removed ${name} from group '${group}'`, details: { group },
    })
    fetchStudents()
  }

  const removeStudent = async (id: string, name: string) => {
    if (!(await confirmDialog({
      title: `Remove ${name} from the project?`,
      message: `This permanently deletes ${name} from TaskMatch — their profile, declared skills, and assignment history. This is NOT just removing them from a group, and it can't be undone.`,
      danger: true, confirmLabel: 'Remove from project',
    }))) return
    await supabase.from('students').delete().eq('id', id)
    await logActivity({ action: 'student.removed', entity_type: 'student', entity_id: id, summary: `Removed student ${name} from the project` })
    fetchStudents()
  }

  const initials = (name: string) =>
    name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  const groupColor = (name: string) => groups.find(g => g.name === name)?.color || '#a78bfa'

  // Link roster rows to login accounts by email (the only join between the two).
  const accountByEmail: { [email: string]: any } = {}
  accounts.forEach(a => { if (a.email) accountByEmail[a.email.toLowerCase()] = a })
  const openQuick = (e: React.MouseEvent, id: string) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); setQuickId(id) }
  const availability = (s: any) => {
    const at = wip[s.id]?.active_tasks || []
    if (isAway(s)) return <span className="text-[11px] flex items-center gap-1.5" style={MUTED}><Icon name="clock" size={11} /> Away until {fmtDay(s.away_until)}</span>
    return at.length === 0
      ? <span className="text-[11px] flex items-center gap-1.5" style={FAINT}><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--tm-emerald)' }} /> Available · no active tasks</span>
      : <span className="text-[11px] truncate" style={MUTED}>On: {at.map((t: any) => t.description).filter(Boolean).join(', ')}</span>
  }
  const accountFor = (s: any) => accountByEmail[(s.email || '').toLowerCase()]
  // Accounts that exist but aren't on the roster yet — the pool for "assign existing account".
  const unassignedAccounts = accounts.filter(a => !a.on_roster)

  // WIP as a small slot meter, coloured only when it matters (amber on the last slot, red at limit).
  const wipMeter = (sid: string) => {
    const w = wip[sid]
    if (!w) return <div className="w-14 shrink-0" />
    const atLimit = w.wip >= wipLimit
    const fill = atLimit ? 'var(--tm-rose)' : w.wip >= wipLimit - 1 ? 'var(--tm-amber)' : 'var(--tm-text-muted)'
    return (
      <div className="flex items-center gap-1.5 shrink-0 w-14" title={`${w.wip} of ${wipLimit} active tasks`}>
        <span className="flex gap-0.5">
          {Array.from({ length: wipLimit }).map((_, i) => (
            <span key={i} className="w-1 h-3.5 rounded-sm" style={{ backgroundColor: i < w.wip ? fill : 'var(--tm-surface-3)' }} />
          ))}
        </span>
        <span className="text-xs tabular-nums" style={{ color: atLimit ? 'var(--tm-rose)' : 'var(--tm-text-faint)' }}>{w.wip}/{wipLimit}</span>
      </div>
    )
  }

  // Cluster ordering: rank groups by how recently they were created (newest first),
  // ungrouped students fall to the bottom. Lower rank = higher up.
  const groupCreatedAt: { [name: string]: number } = {}
  groups.forEach(g => { groupCreatedAt[g.name] = new Date(g.created_at).getTime() })
  const groupRank = (label: string | null) =>
    !label ? Number.POSITIVE_INFINITY
      : groupCreatedAt[label] != null ? -groupCreatedAt[label]   // newest created_at → most negative → top
        : Number.MAX_SAFE_INTEGER                                // labelled but no group row → just above ungrouped

  // Groups come from the canonical `groups` table (shared with the Tasks tab) unioned with any
  // labels present on the roster — so a group made on either tab shows here, even with no members yet.
  const existingGroups = (Array.from(new Set([
    ...groups.map(g => g.name),
    ...students.map(s => s.group_label).filter(Boolean),
  ])) as string[]).sort((a, b) => groupRank(a) - groupRank(b))

  const filteredStudents = groupFilter === 'all'
    ? students
    : groupFilter === '__none__'
      ? students.filter(s => !s.group_label)
      : students.filter(s => s.group_label === groupFilter)

  const levelOf = (s: any, skillId: string) => (s.student_skills || []).find((ss: any) => ss.skill_id === skillId)?.proficiency || 0
  const wipOf = (s: any) => wip[s.id]?.wip ?? 0
  const needle = query.trim().toLowerCase()
  const searched = filteredStudents.filter(s => {
    if (needle && !((s.name || '').toLowerCase().includes(needle)
      || (s.matric || '').toLowerCase().includes(needle)
      || (s.email || '').toLowerCase().includes(needle)
      || (s.student_skills || []).some((ss: any) => (ss.skills?.skill_name || '').toLowerCase().includes(needle)))) return false
    if (skillFilter && levelOf(s, skillFilter) < minLevel) return false
    if (avail === 'free' && (wipOf(s) > 0 || isAway(s))) return false
    if (avail === 'room' && (wipOf(s) >= wipLimit || isAway(s))) return false
    if (avail === 'away' && !isAway(s)) return false
    if (avail === 'limit' && wipOf(s) < wipLimit) return false
    return true
  })

  // Default: clustered, newest group block on top, then by name within each group.
  const shownStudents = searched.slice().sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
    if (sort === 'available') return wipOf(a) - wipOf(b) || (skillFilter ? levelOf(b, skillFilter) - levelOf(a, skillFilter) : 0) || (a.name || '').localeCompare(b.name || '')
    if (sort === 'score') return (stats[b.id]?.avg_score ?? -1) - (stats[a.id]?.avg_score ?? -1) || (a.name || '').localeCompare(b.name || '')
    const ra = groupRank(a.group_label), rb = groupRank(b.group_label)
    if (ra !== rb) return ra - rb
    return (a.name || '').localeCompare(b.name || '')
  })
  const peopleFiltersOn = needle !== '' || !!skillFilter || avail !== 'all'
  const freeCount = students.filter(s => wip[s.id] && wipOf(s) === 0 && !isAway(s)).length
  const awayCount = students.filter(isAway).length
  const limitCount = students.filter(s => wipOf(s) >= wipLimit).length
  // Matrix columns: skills anyone holds, most widely held first.
  const heldSkills = skills
    .map(sk => ({ ...sk, holders: students.filter(s => levelOf(s, sk.id) > 0).length }))
    .filter(sk => sk.holders > 0 || sk.id === skillFilter)
    .sort((a, b) => (a.id === skillFilter ? -1 : b.id === skillFilter ? 1 : 0) || b.holders - a.holders || a.skill_name.localeCompare(b.skill_name))

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="tm-page-title">People</h1>
            <p className="text-xs mt-1" style={FAINT}>
              {loading ? 'Your team roster, skills and current workload' : `${students.length} people · ${freeCount} free right now · ${limitCount} at their limit${awayCount ? ` · ${awayCount} away` : ''}`}
            </p>
          </div>
          {can(userRole, 'people.manage') && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setShowGroupForm(!showGroupForm); setShowForm(false) }}>
                <Icon name="users" size={16} /> Create group
              </Button>
              <Button onClick={() => { setShowForm(!showForm); setShowGroupForm(false) }}>
                <Icon name="plus" size={16} /> Add student
              </Button>
            </div>
          )}
        </div>

        {/* Create group form — leader only */}
        {showGroupForm && can(userRole, 'people.manage') && (
          <Card tint="violet" className="p-5 mb-6 tm-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>
                <Icon name="users" size={18} />
              </div>
              {(() => {
                const isExisting = groups.some(g => g.name === groupForm.name.trim())
                return (
                  <div>
                    <p className="text-sm font-medium" style={TEXT}>{isExisting ? `Add students to “${groupForm.name.trim()}”` : 'Create a group'}</p>
                    <p className="text-xs" style={FAINT}>{isExisting ? 'Pick students below — anyone in another group will be moved here' : 'Name it, pick a colour, and add students (typing an existing name adds to that group)'}</p>
                  </div>
                )
              })()}
            </div>
            <Input
              list="existing-group-names"
              placeholder="Group name — type new, or pick an existing one to add members"
              value={groupForm.name}
              onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
              className="mb-4"
            />
            <datalist id="existing-group-names">
              {existingGroups.map(g => <option key={g} value={g} />)}
            </datalist>

            <p className="text-xs mb-2" style={MUTED}>Colour <span style={FAINT}>(only used when creating a new group)</span></p>
            <div className="flex gap-2 mb-4">
              {GROUP_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setGroupForm({ ...groupForm, color: c })}
                  style={{ backgroundColor: c, outline: groupForm.color === c ? '2px solid var(--tm-text)' : 'none', outlineOffset: 2 }}
                  className={`w-7 h-7 rounded-full transition ${groupForm.color === c ? 'scale-110' : ''}`}
                  aria-label={c} />
              ))}
            </div>

            <p className="text-xs mb-1" style={MUTED}>Select students ({groupForm.members.length} selected)</p>
            <p className="text-xs mb-2" style={FAINT}>Anyone already in another group will be moved here.</p>
            <div className="flex flex-col gap-1 mb-4 max-h-56 overflow-y-auto">
              {(() => {
                const target = groupForm.name.trim()
                // Show everyone except those already in the target group; note their current group.
                const list = students.filter(s => !(target && s.group_label === target))
                return list.length === 0 ? (
                  <p className="text-xs" style={FAINT}>
                    {students.length === 0 ? 'No students yet — add students first.' : 'Everyone is already in this group.'}
                  </p>
                ) : list.map(s => {
                  const checked = groupForm.members.includes(s.id)
                  return (
                    <button key={s.id} type="button" aria-pressed={checked}
                      onClick={() => setGroupForm(prev => ({
                        ...prev,
                        members: checked ? prev.members.filter(id => id !== s.id) : [...prev.members, s.id],
                      }))}
                      className="tm-pick">
                      <span className="w-4 h-4 rounded border shrink-0 flex items-center justify-center"
                        style={checked ? { background: 'var(--tm-primary)', borderColor: 'var(--tm-primary)', color: '#fff' } : { borderColor: 'var(--tm-border-strong)' }}>
                        {checked && <Icon name="check" size={11} strokeWidth={3} />}
                      </span>
                      {s.name} <span style={FAINT}>· {s.matric}</span>
                      {s.group_label && s.group_label !== target && <span className="ml-auto" style={FAINT}>in {s.group_label}</span>}
                    </button>
                  )
                })
              })()}
            </div>

            <div className="flex gap-3">
              <Button onClick={createGroup}>
                <Icon name="check" size={16} /> Save group
              </Button>
              <Button variant="ghost" onClick={() => { setShowGroupForm(false); setGroupForm({ name: '', color: GROUP_COLORS[0], members: [] }) }}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Add student form — leader only */}
        {showForm && can(userRole, 'people.manage') && (
          <Card className="p-5 mb-6 tm-fade-up">
            <p className="text-sm font-medium mb-4" style={TEXT}>New student</p>

            {/* Source: attach a roster row to someone who already signed up, or type in someone new. */}
            <div className="flex gap-2 mb-4">
              {([['existing', 'Assign existing account'], ['blank', 'Enter manually']] as const).map(([mode, label]) => (
                <button key={mode} type="button"
                  onClick={() => {
                    setAddMode(mode)
                    if (mode === 'blank') { setPickedAccountId(''); setForm({ ...form, name: '', email: '' }) }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border transition"
                  style={addMode === mode
                    ? { borderColor: 'var(--tm-primary)', background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }
                    : { borderColor: 'var(--tm-border)', color: 'var(--tm-text-muted)' }}>
                  {label}
                </button>
              ))}
            </div>

            {addMode === 'existing' && (
              <div className="mb-4">
                <label className="tm-label">
                  Signed-up accounts not yet on the roster ({unassignedAccounts.length})
                </label>
                {unassignedAccounts.length === 0 ? (
                  <p className="text-xs" style={FAINT}>
                    Everyone who has signed up is already on the roster. Switch to “Enter manually” to add
                    someone who hasn’t created an account yet.
                  </p>
                ) : (
                  <select
                    value={pickedAccountId}
                    onChange={e => {
                      const a = accounts.find(x => x.id === e.target.value)
                      setPickedAccountId(e.target.value)
                      if (a) setForm(f => ({ ...f, name: a.name || f.name, email: a.email || '' }))
                    }}
                    className="tm-input"
                    style={pickedAccountId ? undefined : FAINT}>
                    <option value="">Select an account…</option>
                    {unassignedAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.email}{a.name ? ` — ${a.name}` : ''}{a.role !== 'member' ? ` (${roleLabel(a.role)})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs mt-2" style={FAINT}>
                  Email is taken from the account and locked so the roster row stays linked to their login. Fill in the rest below.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {[
                { key: 'name', label: 'Full name', placeholder: 'e.g. Aisyah Rahman' },
                { key: 'matric', label: 'Matric no.', placeholder: 'e.g. 22001874' },
                { key: 'email', label: 'Email', placeholder: 'name@utp.edu.my' },
                { key: 'year', label: 'Year', placeholder: 'e.g. 3' },
              ].map(f => (
                <Field key={f.key} label={f.label}>
                  <Input
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    readOnly={addMode === 'existing' && f.key === 'email'}
                    className={addMode === 'existing' && f.key === 'email' ? 'opacity-60 cursor-not-allowed' : ''}
                  />
                </Field>
              ))}
              <Field label="Programme">
                <select
                  value={form.programme}
                  onChange={e => setForm({ ...form, programme: e.target.value })}
                  className="tm-input"
                  style={form.programme ? undefined : FAINT}>
                  <option value="" disabled hidden>Programme</option>
                  {PROGRAMMES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-[11px] mb-4 -mt-1" style={FAINT}>Tip: add the student first, then put them in a group from the group filter → “Add students”.</p>

            <p className="text-xs mb-2" style={MUTED}>Assign skills <span style={FAINT}>— click a skill, then set B / I / A</span></p>
            <div className="mb-4">
              <SkillPicker skills={skills} value={selectedSkills} onChange={setSelectedSkills} />
            </div>

            <div className="flex gap-3">
              <Button onClick={addStudent}>Save student</Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setSelectedSkills([]) }}>Cancel</Button>
              <Button variant="ghost" className="ml-auto"
                onClick={() => { setForm({ name: '', matric: '', programme: '', year: '', email: '', group_label: '' }); setSelectedSkills([]) }}>
                Clear all
              </Button>
            </div>
          </Card>
        )}

        {/* Toolbar: search, layout */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="relative flex-1 min-w-[14rem] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={FAINT}><Icon name="search" size={15} /></span>
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, matric, email or skill…" className="!pl-9" aria-label="Search people" />
          </div>
          <div className="tm-seg" aria-label="Layout">
            {([['roster', 'Roster', 'list'], ['cards', 'Cards', 'users'], ['matrix', 'Skills matrix', 'grid']] as const).map(([k, label, icon]) => (
              <button key={k} onClick={() => setView(k)} aria-pressed={view === k}><Icon name={icon} size={14} /> {label}</button>
            ))}
          </div>
        </div>

        {/* "Who knows X and is free?" — skill + level + availability */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={FAINT}>Knows</span>
            <select value={skillFilter} onChange={e => setSkillFilter(e.target.value)} className="tm-select-sm max-w-[12rem]">
              <option value="">Any skill</option>
              {[...skills].sort((a, b) => a.skill_name.localeCompare(b.skill_name)).map(sk => <option key={sk.id} value={sk.id}>{sk.skill_name}</option>)}
            </select>
            {skillFilter && (
              <select value={minLevel} onChange={e => setMinLevel(Number(e.target.value))} className="tm-select-sm" aria-label="Minimum level">
                {[1, 2, 3].map(l => <option key={l} value={l}>{LEVELS[l]}+</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={FAINT}>Availability</span>
            <select value={avail} onChange={e => setAvail(e.target.value as Avail)} className="tm-select-sm">
              <option value="all">Anyone</option>
              <option value="free">Free (no active tasks)</option>
              <option value="room">Has room (under {wipLimit})</option>
              <option value="limit">At limit</option>
              <option value="away">Away</option>
            </select>
          </div>
          {view === 'roster' && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={FAINT}>Sort</span>
              <select value={sort} onChange={e => setSort(e.target.value as PeopleSort)} className="tm-select-sm">
                <option value="group">By group</option>
                <option value="name">Name</option>
                <option value="available">Most available</option>
                {can(userRole, 'insights.view') && <option value="score">Highest score</option>}
              </select>
            </div>
          )}
          {peopleFiltersOn && (
            <button onClick={() => { setQuery(''); setSkillFilter(''); setMinLevel(1); setAvail('all') }} className="text-xs hover:underline ml-auto" style={FAINT}>Clear filters</button>
          )}
        </div>

        {/* Group filter — a compact dropdown so a long group list stays tidy */}
        <div className="flex gap-2 mb-4 items-center">
          <span className="text-xs" style={FAINT}>Group</span>
          {groupFilter !== 'all' && groupFilter !== '__none__' && (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: groupColor(groupFilter) }} />
          )}
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="tm-select-sm max-w-[16rem]">
            <option value="all">All groups ({students.length})</option>
            {existingGroups.map(g => (
              <option key={g} value={g}>{g} ({students.filter(s => s.group_label === g).length})</option>
            ))}
            <option value="__none__">No group ({students.filter(s => !s.group_label).length})</option>
          </select>
        </div>

        {view === 'matrix' && (
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-sm font-medium" style={TEXT}>Skills matrix <span style={FAINT}>({shownStudents.length} {shownStudents.length === 1 ? 'person' : 'people'} × {heldSkills.length} skills)</span></p>
                <p className="text-xs mt-0.5" style={FAINT}>Darker = higher level. Busiest people are marked so you can see who is actually free.</p>
              </div>
              <div className="flex items-center gap-3 text-xs" style={MUTED}>
                {[1, 2, 3].map(l => (
                  <span key={l} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: LEVEL_FILL[l] }} />{LEVELS[l]}</span>
                ))}
              </div>
            </div>
            {loading ? <Skeleton style={{ height: 240 }} />
              : shownStudents.length === 0 ? <EmptyState icon={<Icon name="users" size={28} />} title="Nobody matches these filters" hint="Try a lower level, another skill, or clear the filters." />
              : (
                <div className="overflow-x-auto -mx-1">
                  <table className="border-separate text-xs" style={{ borderSpacing: 3 }}>
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 text-left font-normal pr-3 align-bottom" style={{ background: 'var(--tm-surface-1)', ...FAINT }}>Person</th>
                        <th className="font-normal px-1 align-bottom text-left" style={FAINT}>Load</th>
                        {heldSkills.map(sk => (
                          <th key={sk.id} className="font-normal align-bottom h-28 w-8 p-0">
                            <button onClick={() => setSkillFilter(skillFilter === sk.id ? '' : sk.id)} title={`${sk.skill_name}: ${sk.holders} ${sk.holders === 1 ? 'person' : 'people'} · click to filter`}
                              className="block mx-auto whitespace-nowrap hover:underline"
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: sk.id === skillFilter ? 'var(--tm-primary-text)' : 'var(--tm-text-muted)', fontWeight: sk.id === skillFilter ? 600 : 400 }}>
                              {sk.skill_name}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownStudents.map(s => (
                        <tr key={s.id}>
                          <td className="sticky left-0 z-10 pr-3 whitespace-nowrap" style={{ background: 'var(--tm-surface-1)' }}>
                            <Link href={`/students/${s.id}`} className="hover:underline flex items-center gap-2" style={TEXT}>
                              {s.group_label && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: groupColor(s.group_label) }} title={s.group_label} />}
                              {s.name}
                            </Link>
                          </td>
                          <td className="px-1">{wipMeter(s.id)}</td>
                          {heldSkills.map(sk => {
                            const l = levelOf(s, sk.id)
                            return (
                              <td key={sk.id} title={`${s.name} · ${sk.skill_name}: ${l ? LEVELS[l] : 'none'}`}
                                className="w-8 h-8 rounded-[4px] text-center text-[10px] font-medium"
                                style={{ background: l ? LEVEL_FILL[l] : 'var(--tm-track)', color: l === 3 ? '#fff' : 'var(--tm-text-muted)', outline: sk.id === skillFilter ? '1px solid var(--tm-primary)' : undefined }}>
                                {l ? LEVELS[l][0] : ''}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        )}

        {/* Students list */}
        <Card className={`p-5 ${view === 'matrix' ? 'hidden' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm font-medium" style={TEXT}>
              Team roster <span style={FAINT}>({shownStudents.length}{shownStudents.length !== students.length ? ` of ${students.length}` : ''})</span>
            </p>
            {can(userRole, 'people.manage') && groupFilter !== 'all' && groupFilter !== '__none__' && (
              <div className="flex gap-2">
                <Button variant="ghost" className="tm-btn-sm"
                  onClick={() => { setGroupForm({ name: groupFilter, color: groupColor(groupFilter), members: [] }); setShowGroupForm(true); setShowForm(false) }}>
                  <Icon name="plus" size={14} /> Add students
                </Button>
                <Button variant="ghost" className="tm-btn-sm" style={{ color: 'var(--tm-rose)', borderColor: 'color-mix(in srgb, var(--tm-rose) 40%, transparent)' }}
                  onClick={() => disbandGroup(groupFilter)}>
                  <Icon name="trash" size={14} /> Disband
                </Button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ height: 80 }} />)}
            </div>
          ) : shownStudents.length === 0 ? (
            <EmptyState icon={<Icon name="users" size={28} />}
              title={students.length === 0 ? 'No students yet' : peopleFiltersOn ? 'Nobody matches these filters' : 'No students in this group'}
              hint={students.length === 0 && can(userRole, 'people.manage') ? 'Add your first student to start matching them to tasks.' : undefined} />
          ) : view === 'cards' ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {shownStudents.map(s => {
                const top = [...(s.student_skills || [])].sort((a: any, b: any) =>
                  Number(b.skill_id === skillFilter) - Number(a.skill_id === skillFilter) || b.proficiency - a.proficiency).slice(0, 4)
                const st = stats[s.id]
                return (
                  <div key={s.id} className="rounded-xl border p-4 flex flex-col gap-3 transition hover:border-[var(--tm-border-strong)] hover:bg-[var(--tm-surface-1)]" style={{ borderColor: 'var(--tm-border)' }}>
                    <div className="flex items-center gap-3">
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                        : <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium shrink-0" style={AVATAR}>{initials(s.name)}</div>}
                      <div className="flex-1 min-w-0">
                        <Link href={`/students/${s.id}`} onClick={e => openQuick(e, s.id)} className="text-sm font-medium hover:underline truncate block" style={TEXT}>{s.name}</Link>
                        <p className="text-[11px] truncate flex items-center gap-1.5" style={FAINT}>
                          {s.group_label && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: groupColor(s.group_label) }} />}
                          {s.group_label ? `${s.group_label} · ` : ''}{s.programme}
                        </p>
                      </div>
                      {wipMeter(s.id)}
                    </div>
                    {availability(s)}
                    <div className="flex flex-col gap-1.5">
                      {top.length === 0 ? <span className="text-xs" style={FAINT}>No skills declared</span> : top.map((ss: any) => (
                        <div key={ss.skill_id} className="grid grid-cols-[1fr_3.5rem] items-center gap-3">
                          <span className="text-xs truncate" style={ss.skill_id === skillFilter ? { color: 'var(--tm-primary-text)', fontWeight: 500 } : MUTED}>{ss.skills?.skill_name}</span>
                          <span className="flex gap-0.5" title={LEVELS[ss.proficiency]} aria-label={LEVELS[ss.proficiency]}>
                            {[1, 2, 3].map(l => <span key={l} className="h-1.5 flex-1 rounded-full" style={{ background: l <= ss.proficiency ? 'var(--tm-chart-1)' : 'var(--tm-track)' }} />)}
                          </span>
                        </div>
                      ))}
                      {(s.student_skills || []).length > 4 && <span className="text-[11px]" style={FAINT}>+{(s.student_skills || []).length - 4} more skills</span>}
                    </div>
                    {can(userRole, 'insights.view') && st && (
                      <p className="text-[11px] mt-auto pt-2 flex items-center gap-1.5" style={{ ...FAINT, borderTop: '1px solid var(--tm-border)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.band === 'unrated' ? 'var(--tm-text-faint)' : `var(--tm-${bandAccent(st.band)})` }} />
                        {st.band === 'unrated' ? 'Not rated yet' : `Avg score ${Number(st.avg_score).toFixed(2)} · ${st.completed_count} finished`}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shownStudents.map(s => (
                <div key={s.id} className={`rounded-xl border transition hover:bg-[var(--tm-surface-1)] hover:border-[var(--tm-border-strong)] ${menuOpen === s.id ? 'relative z-30' : ''}`}
                  style={{ borderColor: 'var(--tm-border)' }}>
                  <div className="flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 p-4">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-medium shrink-0" style={AVATAR}>
                        {initials(s.name)}
                      </div>
                    )}
                    <div className="flex-1 md:flex-none md:w-52 shrink-0 min-w-0">
                      <div className="flex items-center gap-2">
                        {s.group_label && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: groupColor(s.group_label) }} title={s.group_label} />}
                        <Link href={`/students/${s.id}`} onClick={e => openQuick(e, s.id)} className="text-sm font-medium hover:underline truncate" style={TEXT} title="Quick view (Ctrl-click to open the full profile)">{s.name}</Link>
                        {can(userRole, 'people.manage') && (() => {
                          const acct = accountFor(s)
                          if (!acct) return <span className="text-[11px] shrink-0" style={FAINT} title="No login account linked to this roster row">no login</span>
                          if (acct.role !== 'member') return <Badge accent="indigo" className="shrink-0 !text-[11px] !py-0">{roleLabel(acct.role)}</Badge>
                          return null
                        })()}
                      </div>
                      <p className="text-xs truncate mt-0.5" style={FAINT}>{s.matric} · {s.programme} · Year {s.year}</p>
                    </div>

                    {/* Middle column — skills + what they're working on now (fills the row) */}
                    <div className="order-last md:order-none basis-full md:basis-auto flex-1 min-w-0 flex flex-col gap-1.5 pl-16 md:pl-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(s.student_skills || []).length === 0 ? (
                          <span className="text-xs" style={FAINT}>No skills declared</span>
                        ) : [...(s.student_skills || [])]
                          // The skill being searched for goes first, highlighted with its level.
                          .sort((a: any, b: any) => Number(b.skill_id === skillFilter) - Number(a.skill_id === skillFilter))
                          .slice(0, 5).map((ss: any) => ss.skill_id === skillFilter
                            ? <span key={ss.skill_id} className="tm-chip" style={{ borderColor: 'var(--tm-primary)', background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>{ss.skills?.skill_name} · {LEVELS[ss.proficiency]}</span>
                            : <span key={ss.skill_id} className="tm-chip">{ss.skills?.skill_name}</span>)}
                        {(s.student_skills || []).length > 5 && <span className="text-[11px]" style={FAINT}>+{(s.student_skills || []).length - 5}</span>}
                      </div>
                      {(() => {
                        const at = wip[s.id]?.active_tasks || []
                        if (isAway(s)) return <span className="text-[11px] flex items-center gap-1.5" style={MUTED}><Icon name="clock" size={11} /> Away until {fmtDay(s.away_until)}</span>
                        return at.length === 0
                          ? <span className="text-[11px] flex items-center gap-1.5" style={FAINT}><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--tm-emerald)' }} /> Available · no active tasks</span>
                          : <span className="text-[11px] truncate" style={MUTED}>On: {at.map((t: any) => t.description).filter(Boolean).join(', ')}</span>
                      })()}
                    </div>

                    {/* Rating + WIP — own line on phones, inline on wider screens */}
                    <div className="order-last md:order-none basis-full md:basis-auto flex items-center gap-4 shrink-0 pl-16 md:pl-0">
                      {can(userRole, 'insights.view') && stats[s.id] && (() => {
                        const st = stats[s.id]
                        const color = st.band === 'unrated' ? 'var(--tm-text-faint)' : `var(--tm-${bandAccent(st.band)})`
                        return (
                          <div className="flex items-center gap-1.5 shrink-0" title={`Rating: ${st.band} · ${st.completed_count} completed`}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-xs tabular-nums w-7" style={MUTED}>{st.band === 'unrated' ? '—' : st.avg_score}</span>
                          </div>
                        )
                      })()}

                      {wipMeter(s.id)}
                    </div>

                    {can(userRole, 'people.manage') && (
                      <div className="relative shrink-0">
                        <button onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)}
                          aria-label="Student actions" className="tm-btn tm-btn-ghost tm-btn-icon !border-transparent">
                          <Icon name="more" size={18} />
                        </button>
                        {menuOpen === s.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="tm-menu absolute right-0 top-full mt-1 z-20 w-48">
                              <Link href={`/students/${s.id}`} className="tm-menu-item"><Icon name="user" size={13} /> See profile</Link>
                              <button onClick={() => { setMenuOpen(null); startEditing(s) }} className="tm-menu-item"><Icon name="star" size={13} /> Edit skills &amp; photo</button>
                              {isAway(s)
                                ? <button onClick={() => { setMenuOpen(null); saveAway(s, null).then(ok => { if (ok) fetchStudents() }) }} className="tm-menu-item"><Icon name="check" size={13} /> Mark as back</button>
                                : <button onClick={() => { setMenuOpen(null); askAway(s).then(ok => { if (ok) fetchStudents() }) }} className="tm-menu-item"><Icon name="clock" size={13} /> Mark as away</button>}
                              {can(userRole, 'team.manage') && accountFor(s) && <Link href="/team" className="tm-menu-item"><Icon name="shield" size={13} /> Change role</Link>}
                              {s.group_label && <button onClick={() => { setMenuOpen(null); removeFromGroup(s.id, s.name, s.group_label) }} className="tm-menu-item" style={{ color: 'var(--tm-amber)' }}><Icon name="users" size={13} /> Remove from group</button>}
                              <div className="my-1 h-px" style={{ background: 'var(--tm-border)' }} />
                              <button onClick={() => { setMenuOpen(null); removeStudent(s.id, s.name) }} className="tm-menu-item" style={{ color: 'var(--tm-rose)' }}><Icon name="trash" size={13} /> Remove from project</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Edit panel — leader only */}
                  {editingStudent === s.id && can(userRole, 'people.manage') && (
                    <div className="mx-4 mb-4 pt-3" style={{ borderTop: '1px solid var(--tm-border)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs" style={MUTED}>Edit skills for {s.name}</p>
                        <label className="tm-btn tm-btn-ghost tm-btn-sm">
                          <Icon name="upload" size={14} /> Upload photo
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => uploadStudentAvatar(s.id, s.name, e.target.files && e.target.files[0] ? e.target.files[0] : undefined)} />
                        </label>
                      </div>
                      <div className="mb-3">
                        <SkillPicker skills={skills} value={editSkills} onChange={setEditSkills} />
                      </div>
                      <div className="flex gap-3">
                        <Button className="tm-btn-sm" onClick={() => saveSkills(s.id)}>Save changes</Button>
                        <Button variant="ghost" className="tm-btn-sm" onClick={() => setEditingStudent(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        <PersonQuickView person={students.find(x => x.id === quickId) || null} wip={quickId ? wip[quickId] : undefined} wipLimit={wipLimit}
          stat={quickId ? stats[quickId] : undefined} showScores={can(userRole, 'insights.view')} groupColor={groupColor} onClose={() => setQuickId(null)} />
      </main>
    </div>
  )
}
