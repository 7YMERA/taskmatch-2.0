'use client'

// Compact skill selector: wrapping chips instead of a tall one-per-row list.
// Selecting a chip reveals a tiny B/I/A proficiency control inline.
// Works for both student skills (field="proficiency") and task requirements (field="min_proficiency").

export default function SkillPicker({
  skills,
  value,
  onChange,
  field = 'proficiency',
  labels = ['Beginner', 'Intermediate', 'Advanced'],
}: {
  skills: { id: string; skill_name: string }[]
  value: any[]
  onChange: (next: any[]) => void
  field?: string
  labels?: string[]
}) {
  const levelOf = (id: string) => value.find((v: any) => v.skill_id === id)?.[field]
  const toggle = (id: string) =>
    onChange(value.find((v: any) => v.skill_id === id)
      ? value.filter((v: any) => v.skill_id !== id)
      : [...value, { skill_id: id, [field]: 1 }])
  const setLevel = (id: string, lvl: number) =>
    onChange(value.map((v: any) => v.skill_id === id ? { ...v, [field]: lvl } : v))

  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map(sk => {
        const lvl = levelOf(sk.id)
        const selected = lvl != null
        return (
          <div key={sk.id}
            className="flex items-center rounded-lg border transition"
            style={selected
              ? { borderColor: 'var(--tm-primary)', background: 'var(--tm-primary-soft)' }
              : { borderColor: 'var(--tm-border)' }}>
            <button type="button" onClick={() => toggle(sk.id)}
              className="text-xs pl-3 pr-2 py-1.5 whitespace-nowrap transition hover:opacity-80"
              style={{ color: selected ? 'var(--tm-text)' : 'var(--tm-text-muted)' }}>
              {sk.skill_name}
            </button>
            {selected && (
              <div className="flex items-center gap-0.5 pr-1.5">
                {[1, 2, 3].map(n => (
                  <button key={n} type="button" onClick={() => setLevel(sk.id, n)}
                    title={labels[n - 1]}
                    className="w-5 h-5 rounded text-[10px] font-semibold transition"
                    style={lvl >= n
                      ? { background: 'var(--tm-primary)', color: '#fff' }
                      : { background: 'var(--tm-surface-2)', color: 'var(--tm-text-faint)' }}>
                    {['B', 'I', 'A'][n - 1]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
