import { projectColor, type Project } from '../lib/projects'
import { soft } from './ui'

/** The project's key in its colour, e.g. a small "WEB" tag on a task row. */
export default function ProjectChip({ project, className = '' }: { project?: Project | null; className?: string }) {
  if (!project) return null
  const c = projectColor(project)
  return (
    <span className={`inline-flex items-center shrink-0 rounded px-1.5 py-px text-[10px] font-semibold tracking-wide font-mono ${className}`}
      style={{ color: c, background: soft(c, 14), border: `1px solid ${soft(c, 30)}` }} title={project.name}>
      {project.key || project.name.slice(0, 3).toUpperCase()}
    </span>
  )
}
