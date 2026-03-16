import { Resend } from 'resend'
import { getPool } from './db.js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = 'Wairarapa Camera Club <noreply@wairarapacameraclub.org>'

export interface SendEmailOptions {
  type: string
  to: string
  toName?: string | null
  subject: string
  html: string
  memberId?: string | null
  judgeId?: string | null
  competitionId?: string | null
  tokenId?: string | null
}

/**
 * Sends an email via Resend (or logs to console in dev when no API key is set),
 * then writes the result to email_log regardless of success/failure.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  let error: string | null = null

  if (resend) {
    const result = await resend.emails.send({
      from: FROM,
      to: opts.toName ? `${opts.toName} <${opts.to}>` : opts.to,
      subject: opts.subject,
      html: opts.html,
    })
    if (result.error) {
      error = result.error.message
    }
  } else {
    // Dev mode: print to console instead of sending
    console.log(`\n[EMAIL – no RESEND_API_KEY set]`)
    console.log(`To:      ${opts.toName ? `${opts.toName} <${opts.to}>` : opts.to}`)
    console.log(`Subject: ${opts.subject}`)
    console.log(`Body:\n${opts.html}\n`)
  }

  await getPool().query(
    `INSERT INTO email_log (type, recipient_email, recipient_name, member_id, judge_id, competition_id, token_id, subject, body, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      opts.type,
      opts.to,
      opts.toName ?? null,
      opts.memberId ?? null,
      opts.judgeId ?? null,
      opts.competitionId ?? null,
      opts.tokenId ?? null,
      opts.subject,
      opts.html,
      error,
    ],
  )
}

// ─── Email templates ──────────────────────────────────────────────────────────

const appUrl = process.env.APP_URL ?? 'http://localhost:5173'

export function submissionInviteEmail(opts: {
  memberName: string
  competitionName: string
  closesAt: string | null
  token: string
}): { subject: string; html: string } {
  const link = `${appUrl}/submit/${opts.token}`
  const closes = opts.closesAt
    ? new Date(opts.closesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBA'

  const subject = `Submit your entries – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Entries are now open for <strong>${opts.competitionName}</strong>.</p>
<p>Submissions close on <strong>${closes}</strong>.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">Submit your entries</a></p>
<p>Or copy this link: ${link}</p>
<p>You can submit up to 1 projected image (PROJIM) and up to 2 printed images (PRINTIM).</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export function submissionReminderEmail(opts: {
  memberName: string
  competitionName: string
  closesAt: string | null
  token: string
  entryCount: number
}): { subject: string; html: string } {
  const link = `${appUrl}/submit/${opts.token}`
  const closes = opts.closesAt
    ? new Date(opts.closesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'soon'

  const subject = `Reminder: entries close ${closes} – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Just a reminder that entries for <strong>${opts.competitionName}</strong> close on <strong>${closes}</strong>.</p>
${opts.entryCount > 0
    ? `<p>You've already submitted ${opts.entryCount} entr${opts.entryCount === 1 ? 'y' : 'ies'}. You can still add more or make changes.</p>`
    : `<p>You haven't submitted any entries yet.</p>`}
<p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">Manage your entries</a></p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export function judgingInviteEmail(opts: {
  judgeName: string
  competitionName: string
  judgingClosesAt: string | null
  projimCount: number
  printimCount: number
  token: string
}): { subject: string; html: string } {
  const link = `${appUrl}/judge/${opts.token}`
  const closes = opts.judgingClosesAt
    ? new Date(opts.judgingClosesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBA'

  const subject = `Judge invitation – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.judgeName},</p>
<p>You've been invited to judge <strong>${opts.competitionName}</strong>.</p>
<p>There are <strong>${opts.projimCount} projected</strong> and <strong>${opts.printimCount} printed</strong> images to judge.</p>
<p>Please complete your judging by <strong>${closes}</strong>.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">Start judging</a></p>
<p>Or copy this link: ${link}</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export function memberHistoryEmail(opts: {
  memberName: string
  token: string
}): { subject: string; html: string } {
  const link = `${appUrl}/history/${opts.token}`
  const subject = `Your Wairarapa Camera Club photo history`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Here's your personal link to view all your competition entries and scores.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">View my photo history</a></p>
<p>Or copy this link: ${link}</p>
<p>This link is unique to you — please don't share it.</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export function resultsNotificationEmail(opts: {
  memberName: string
  competitionName: string
  entries: Array<{ title: string; type: string; award: string | null; points: number | null }>
  token: string
}): { subject: string; html: string } {
  const link = `${appUrl}/history/${opts.token}`
  const subject = `Results – ${opts.competitionName}`

  const rows = opts.entries.map(e => {
    const award = e.award ? e.award.replace(/_/g, ' ') : 'Not placed'
    const pts = e.points != null ? ` (${e.points} pts)` : ''
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${e.title}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-transform:uppercase;font-size:12px">${e.type}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-transform:capitalize">${award}${pts}</td>
    </tr>`
  }).join('')

  const html = `
<p>Hi ${opts.memberName},</p>
<p>Results are in for <strong>${opts.competitionName}</strong>!</p>
<table style="border-collapse:collapse;width:100%;max-width:500px">
  <thead>
    <tr style="background:#fef3c7">
      <th style="padding:6px 8px;text-align:left">Title</th>
      <th style="padding:6px 8px;text-align:left">Type</th>
      <th style="padding:6px 8px;text-align:left">Result</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p><a href="${link}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">View full history</a></p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}
