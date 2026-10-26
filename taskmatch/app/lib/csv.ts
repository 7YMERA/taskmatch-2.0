// CSV export helper. One definition, used by the command palette and any page that
// wants a "download as CSV" button. Produces a BOM + CRLF file so Excel opens it cleanly.

type Row = Record<string, unknown>

function cell(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) v = v.join('; ')
  const s = String(v)
  // Quote if the value contains a comma, quote, or newline; double embedded quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Turn an array of flat objects into CSV text. Columns come from `headers` (keeps order). */
export function toCsv(rows: Row[], headers: { key: string; label: string }[]): string {
  const head = headers.map(h => cell(h.label)).join(',')
  const body = rows.map(r => headers.map(h => cell(r[h.key])).join(',')).join('\r\n')
  return '\uFEFF' + head + '\r\n' + body
}

/** Trigger a browser download of `text` as `filename`. */
export function downloadCsv(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const stamp = () => new Date().toISOString().slice(0, 10)
