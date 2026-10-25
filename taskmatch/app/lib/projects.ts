import { supabase } from './supabase'
import { accentColor, type Accent } from '../components/ui'

// Projects group a workspace's tasks (like a Jira project). Each has a short key, shown as a chip
// on its tasks, and a colour. The database rules keep them inside the workspace.

export type Project = {
  id: string; name: string; key: string | null; description: string | null
  color: string | null; archived: boolean; created_at?: string
}

export const PROJECT_COLORS: Accent[] = ['indigo', 'emerald', 'sky', 'amber', 'rose']   // violet is too close to indigo in dark mode

export const projectColor = (p?: Pick<Project, 'color'> | null) =>
  accentColor(PROJECT_COLORS.includes(p?.color as Accent) ? p!.color as Accent : 'indigo')

/** A key from the name: "Mobile app" → "MA", "Website" → "WEB". */
export function keyFrom(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const key = words.length > 1 ? words.map(w => w[0]).join('') : (words[0] || '').slice(0, 3)
  return /^[A-Z]/.test(key) ? key.slice(0, 6) : ''
}

/** Every project in this workspace, oldest first. Empty if the database has no projects yet. */
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*').order('created_at')
  return error ? [] : (data || [])
}
