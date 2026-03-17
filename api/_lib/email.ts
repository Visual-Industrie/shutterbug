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

// ─── Template engine ──────────────────────────────────────────────────────────

// Keys whose values are pre-built HTML (not escaped)
const HTML_RAW_KEYS = new Set([
  'submission_link', 'judging_link', 'history_link',
  'results_table', 'entry_summary',
])

function htmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\[([a-z_]+)\]/gi, (match, key: string) => {
    if (!(key in vars)) return match
    return HTML_RAW_KEYS.has(key) ? vars[key] : htmlEsc(vars[key])
  })
}

export async function getEmailTemplate(
  key: string,
): Promise<{ subject_template: string; body_html: string } | null> {
  try {
    const res = await getPool().query(
      `SELECT subject_template, body_html FROM email_templates WHERE key = $1`,
      [key],
    )
    return res.rows[0] ?? null
  } catch {
    return null
  }
}

function makeButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:10px 20px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">${label}</a>`
}

// ─── Email templates ──────────────────────────────────────────────────────────

const appUrl = process.env.APP_URL ?? 'http://localhost:5173'

export async function submissionInviteEmail(opts: {
  memberName: string
  competitionName: string
  closesAt: string | null
  token: string
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/submit/${opts.token}`
  const closes = opts.closesAt
    ? new Date(opts.closesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBA'

  const tmpl = await getEmailTemplate('submission_invite')
  if (tmpl) {
    const vars = {
      member_name: opts.memberName,
      competition_name: opts.competitionName,
      closes_date: closes,
      submission_link: makeButton(link, 'Submit your entries'),
      submission_url: link,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `Submit your entries – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Entries are now open for <strong>${opts.competitionName}</strong>.</p>
<p>Submissions close on <strong>${closes}</strong>.</p>
<p>${makeButton(link, 'Submit your entries')}</p>
<p>Or copy this link: ${link}</p>
<p>You can submit up to 1 projected image (PROJIM) and up to 2 printed images (PRINTIM).</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export async function submissionReminderEmail(opts: {
  memberName: string
  competitionName: string
  closesAt: string | null
  token: string
  entryCount: number
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/submit/${opts.token}`
  const closes = opts.closesAt
    ? new Date(opts.closesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'soon'
  const entrySummary = opts.entryCount > 0
    ? `<p>You've already submitted ${opts.entryCount} entr${opts.entryCount === 1 ? 'y' : 'ies'}. You can still add more or make changes.</p>`
    : `<p>You haven't submitted any entries yet.</p>`

  const tmpl = await getEmailTemplate('submission_reminder')
  if (tmpl) {
    const vars = {
      member_name: opts.memberName,
      competition_name: opts.competitionName,
      closes_date: closes,
      submission_link: makeButton(link, 'Manage your entries'),
      submission_url: link,
      entry_summary: entrySummary,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `Reminder: entries close ${closes} – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Just a reminder that entries for <strong>${opts.competitionName}</strong> close on <strong>${closes}</strong>.</p>
${entrySummary}
<p>${makeButton(link, 'Manage your entries')}</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export async function judgingInviteEmail(opts: {
  judgeName: string
  competitionName: string
  judgingClosesAt: string | null
  projimCount: number
  printimCount: number
  token: string
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/judge/${opts.token}`
  const closes = opts.judgingClosesAt
    ? new Date(opts.judgingClosesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBA'

  const tmpl = await getEmailTemplate('judging_invite')
  if (tmpl) {
    const vars = {
      judge_name: opts.judgeName,
      competition_name: opts.competitionName,
      judging_closes_date: closes,
      projim_count: String(opts.projimCount),
      printim_count: String(opts.printimCount),
      judging_link: makeButton(link, 'Start judging'),
      judging_url: link,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `Judge invitation – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.judgeName},</p>
<p>You've been invited to judge <strong>${opts.competitionName}</strong>.</p>
<p>There are <strong>${opts.projimCount} projected</strong> and <strong>${opts.printimCount} printed</strong> images to judge.</p>
<p>Please complete your judging by <strong>${closes}</strong>.</p>
<p>${makeButton(link, 'Start judging')}</p>
<p>Or copy this link: ${link}</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export async function memberHistoryEmail(opts: {
  memberName: string
  token: string
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/history/${opts.token}`

  const tmpl = await getEmailTemplate('member_history_link')
  if (tmpl) {
    const vars = {
      member_name: opts.memberName,
      history_link: makeButton(link, 'View my photo history'),
      history_url: link,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `Your Wairarapa Camera Club photo history`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Here's your personal link to view all your competition entries and scores.</p>
<p>${makeButton(link, 'View my photo history')}</p>
<p>Or copy this link: ${link}</p>
<p>This link is unique to you — please don't share it.</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export async function subsReminderEmail(opts: {
  memberName: string
  amountDue: string | null
  reminderNumber: 1 | 2
}): Promise<{ subject: string; html: string }> {
  const amount = opts.amountDue ? `$${parseFloat(opts.amountDue).toFixed(2)}` : 'your annual subscription'
  const templateKey = opts.reminderNumber === 1 ? 'subs_reminder_first' : 'subs_reminder_second'

  const tmpl = await getEmailTemplate(templateKey)
  if (tmpl) {
    const vars = { member_name: opts.memberName, amount }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = opts.reminderNumber === 1
    ? `Subscription renewal reminder – Wairarapa Camera Club`
    : `Final reminder: subscription renewal – Wairarapa Camera Club`
  const urgency = opts.reminderNumber === 2
    ? `<p><strong>This is your final reminder.</strong> Please pay as soon as possible to keep your membership active.</p>`
    : ''
  const html = `
<p>Hi ${opts.memberName},</p>
<p>This is a reminder that your Wairarapa Camera Club membership subscription of <strong>${amount}</strong> is due for renewal.</p>
${urgency}
<p>Please arrange payment at your earliest convenience. If you have any questions, reply to this email or contact the club treasurer.</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export async function resultsNotificationEmail(opts: {
  memberName: string
  competitionName: string
  entries: Array<{ title: string; type: string; award: string | null; points: number | null; comment?: string | null }>
  token: string
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/history/${opts.token}`

  const rows = opts.entries.map(e => {
    const award = e.award ? e.award.replace(/_/g, ' ') : 'Not placed'
    const pts = e.points != null ? ` (${e.points} pts)` : ''
    const comment = e.comment
      ? `<tr><td colspan="3" style="padding:4px 8px 10px 8px;color:#6b7280;font-style:italic;font-size:13px;border-bottom:1px solid #f0f0f0">${e.comment}</td></tr>`
      : ''
    return `<tr>
      <td style="padding:6px 8px 4px 8px">${e.title}</td>
      <td style="padding:6px 8px 4px 8px;text-transform:uppercase;font-size:12px">${e.type}</td>
      <td style="padding:6px 8px 4px 8px;text-transform:capitalize;font-weight:bold">${award}${pts}</td>
    </tr>${comment}`
  }).join('')

  const resultsTable = `<table style="border-collapse:collapse;width:100%;max-width:500px">
  <thead>
    <tr style="background:#fef3c7">
      <th style="padding:6px 8px;text-align:left">Title</th>
      <th style="padding:6px 8px;text-align:left">Type</th>
      <th style="padding:6px 8px;text-align:left">Result</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`

  const tmpl = await getEmailTemplate('results_notification')
  if (tmpl) {
    const vars = {
      member_name: opts.memberName,
      competition_name: opts.competitionName,
      results_table: resultsTable,
      history_link: makeButton(link, 'View full history'),
      history_url: link,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `Results – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Results are in for <strong>${opts.competitionName}</strong>!</p>
${resultsTable}
<p>${makeButton(link, 'View full history')}</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}
