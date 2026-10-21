/** "Sat 14 Mar 2027" in NZ time; `fallback` when missing or invalid. */
export function formatNzDate(d: string | Date | null | undefined, fallback = 'TBC'): string {
  if (!d) return fallback
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Pacific/Auckland',
  })
}

/** Today's date in NZ as YYYY-MM-DD, offset by `days`. For date inputs. */
export function nzDateInput(days = 0): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(d)
}

/** An ISO instant as a YYYY-MM-DD date in NZ. For date inputs. */
export function isoToNzDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(iso))
}
