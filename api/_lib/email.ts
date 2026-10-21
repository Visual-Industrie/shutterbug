import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { Resend } from 'resend'
import { getPool } from './db.js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = 'Wairarapa Camera Club <noreply@wairarapacameraclub.org>'

const DEFAULT_FOOTER_TEXT = `<p>Do not reply to this email. To contact the Competition Secretary, use <a href="mailto:compsecwaicamc@gmail.com">compsecwaicamc@gmail.com</a>. All other committee email addresses are on our website.</p>`

function buildFooterHtml(html: string): string {
  return `<div style="margin-top:24px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;">${html}</div>`
}

// Inline the club amber onto plain links (e.g. authored in the editor).
// Links that already carry their own inline style — like the CTA buttons — are left untouched.
function styleLinks(html: string): string {
  return html.replace(
    /<a\b(?![^>]*\bstyle=)([^>]*)>/gi,
    '<a$1 style="color:#b45309;text-decoration:underline;">',
  )
}

// Footer, reply-to and template lookups are the same for every message in a
// bulk run, so withSendCache() memoises them for the duration of that run only
// (never across requests — an edited template must apply to the very next send).
const sendCache = new AsyncLocalStorage<Map<string, Promise<unknown>>>()

export function withSendCache<T>(fn: () => Promise<T>): Promise<T> {
  return sendCache.run(new Map(), fn)
}

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const store = sendCache.getStore()
  if (!store) return load()
  let hit = store.get(key) as Promise<T> | undefined
  if (!hit) {
    hit = load()
    store.set(key, hit)
  }
  return hit
}

function getFooterHtml(): Promise<string> {
  return cached('footer', loadFooterHtml)
}

async function loadFooterHtml(): Promise<string> {
  try {
    const res = await getPool().query(`SELECT value, default_value FROM settings WHERE key = 'email_footer'`)
    const row = res.rows[0]
    const text = row?.value ?? row?.default_value ?? DEFAULT_FOOTER_TEXT
    return buildFooterHtml(text)
  } catch {
    return buildFooterHtml(DEFAULT_FOOTER_TEXT)
  }
}

// Fallbacks for when the settings row is missing or the lookup fails — the club
// address is a safer landing spot for replies than the unattended noreply box.
const DEFAULT_CLUB_EMAIL = 'compsecwaicamc@gmail.com'

function getAddressSetting(key: string): Promise<string> {
  return cached(`setting:${key}`, () => loadAddressSetting(key))
}

async function loadAddressSetting(key: string): Promise<string> {
  try {
    const res = await getPool().query(`SELECT value, default_value FROM settings WHERE key = $1`, [key])
    const row = res.rows[0]
    const addr = (row?.value ?? row?.default_value ?? '').trim()
    return addr || DEFAULT_CLUB_EMAIL
  } catch {
    return DEFAULT_CLUB_EMAIL
  }
}

export const getBulkToAddress = () => getAddressSetting('email_bulk_to')
export const getReplyToAddress = () => getAddressSetting('email_reply_to')

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
  /** Overrides the configured reply-to for this send. */
  replyTo?: string | null
  /** A bulk run's pending email_log row to fill in, instead of inserting a new one. */
  logId?: string | null
}

/**
 * Sends an email via Resend (or logs to console in dev when no API key is set),
 * then writes the result to email_log regardless of success/failure.
 *
 * Returns the provider's rejection message (null on success) so bulk loops can
 * count it as a failure. A thrown send error is logged too, then rethrown.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<string | null> {
  let error: string | null = null
  let thrown: unknown = null

  const html = styleLinks(opts.html + await getFooterHtml())
  const replyTo = opts.replyTo?.trim() || await getReplyToAddress()

  if (resend) {
    try {
      const result = await resend.emails.send({
        from: FROM,
        to: opts.toName ? `${opts.toName} <${opts.to}>` : opts.to,
        replyTo,
        subject: opts.subject,
        html,
      })
      if (result.error) {
        error = result.error.message
      }
    } catch (err) {
      thrown = err
      error = err instanceof Error ? err.message : String(err)
    }
  } else {
    // Dev mode: print to console instead of sending
    console.log(`\n[EMAIL – no RESEND_API_KEY set]`)
    console.log(`To:       ${opts.toName ? `${opts.toName} <${opts.to}>` : opts.to}`)
    console.log(`Reply-To: ${replyTo}`)
    console.log(`Subject:  ${opts.subject}`)
    console.log(`Body:\n${html}\n`)
  }

  if (opts.logId) {
    await getPool().query(
      `UPDATE email_log
       SET recipient_email = $2, recipient_name = $3, token_id = $4, subject = $5, body = $6, error = $7, sent_at = NOW()
       WHERE id = $1`,
      [opts.logId, opts.to, opts.toName ?? null, opts.tokenId ?? null, opts.subject, opts.html, error],
    )
  } else {
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

  if (thrown) throw thrown
  return error
}

// ─── Bulk runs ────────────────────────────────────────────────────────────────

/**
 * Error on a bulk run's member row until that member's message actually goes.
 * If the run is cut short, the rows still carrying it show exactly who was missed.
 */
export const NOT_SENT_ERROR = 'Not sent — the send stopped before reaching this member'

/**
 * Logs a bulk run up front: one summary row (recipient_count = the full
 * audience) plus a pending child row per recipient, linked by batch_id.
 * Returns the batch id and each recipient's row id, in recipient order.
 */
async function startBulkRun(opts: {
  type: string
  subject: string
  recipients: BulkRecipient[]
  competitionId?: string | null
  /** Shown as the summary's To — the club copy address for group sends. */
  summaryTo?: string
  body?: string | null
}): Promise<{ batchId: string; logIds: string[] }> {
  const pool = getPool()
  const total = opts.recipients.length
  const batchId = randomUUID()
  const logIds = opts.recipients.map(() => randomUUID())

  await pool.query(
    `INSERT INTO email_log (id, type, recipient_email, recipient_name, competition_id, subject, body, recipient_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      batchId,
      opts.type,
      opts.summaryTo ?? '',
      `${total} recipient${total === 1 ? '' : 's'}`,
      opts.competitionId ?? null,
      opts.subject,
      opts.body ?? null,
      total,
    ],
  )

  if (total > 0) {
    await pool.query(
      `INSERT INTO email_log (id, type, recipient_email, recipient_name, member_id, judge_id, competition_id, subject, error, batch_id)
       SELECT t.id, $1, t.email, t.name, t.member_id, t.judge_id, $2, $3, $4, $5
       FROM unnest($6::uuid[], $7::text[], $8::text[], $9::uuid[], $10::uuid[]) AS t(id, email, name, member_id, judge_id)`,
      [
        opts.type,
        opts.competitionId ?? null,
        opts.subject,
        NOT_SENT_ERROR,
        batchId,
        logIds,
        opts.recipients.map(r => r.email),
        opts.recipients.map(r => r.name ?? null),
        opts.recipients.map(r => r.id ?? null),
        opts.recipients.map(r => r.judgeId ?? null),
      ],
    )
  }

  return { batchId, logIds }
}

async function finishBulkRun(batchId: string, total: number, skipped: number, errors: Iterable<string>, extra?: string) {
  const parts: string[] = []
  if (skipped > 0) parts.push(`${skipped} of ${total} failed: ${[...new Set(errors)].join('; ')}`)
  if (extra) parts.push(extra)
  if (parts.length) {
    await getPool().query(`UPDATE email_log SET error = $1 WHERE id = $2`, [parts.join(' · '), batchId])
  }
}

async function markLogFailed(logId: string, error: string) {
  await getPool().query(`UPDATE email_log SET error = $1, sent_at = NOW() WHERE id = $2`, [error, logId])
}

export interface RunMember {
  id: string
  first_name: string
  last_name: string
  email: string
}

export interface RunResult {
  sent: number
  skipped: number
  errors: string[]
}

/**
 * Sends one personalised email per member, one at a time, as a logged bulk
 * run. A rejected or thrown send counts as a failure and is recorded on that
 * member's row; it never stops the rest of the run.
 */
export async function sendPersonalisedRun(opts: {
  type: string
  /** Summary title for the log, e.g. "Deadline reminder — Astrophotography". */
  subject: string
  competitionId?: string | null
  members: RunMember[]
  build: (m: RunMember) => Promise<{ subject: string; html: string; tokenId?: string | null }>
}): Promise<RunResult> {
  let sent = 0, skipped = 0
  const errors: string[] = []
  if (opts.members.length === 0) return { sent, skipped, errors }

  const name = (m: RunMember) => `${m.first_name} ${m.last_name}`
  const { batchId, logIds } = await startBulkRun({
    type: opts.type,
    subject: opts.subject,
    competitionId: opts.competitionId,
    recipients: opts.members.map(m => ({ id: m.id, email: m.email, name: name(m) })),
  })

  await withSendCache(async () => {
    for (const [i, m] of opts.members.entries()) {
      try {
        const { subject, html, tokenId } = await opts.build(m)
        const error = await sendEmail({
          type: opts.type,
          to: m.email,
          toName: name(m),
          subject,
          html,
          memberId: m.id,
          competitionId: opts.competitionId,
          tokenId,
          logId: logIds[i],
        })
        if (error) {
          errors.push(`${m.email}: ${error}`)
          skipped++
        } else {
          sent++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${m.email}: ${msg}`)
        skipped++
        // sendEmail has already recorded a thrown send; this covers failures before it.
        await markLogFailed(logIds[i], msg).catch(() => {})
      }
    }
  })

  await finishBulkRun(batchId, opts.members.length, skipped, errors.map(e => e.slice(e.indexOf(': ') + 2)))
  return { sent, skipped, errors }
}

export interface RunJudge {
  id: string
  name: string
  email: string
}

/**
 * Judge equivalent of sendPersonalisedRun: one personalised email per judge,
 * logged as a single bulk run (summary row + a child row per judge, linked
 * by judge_id rather than member_id).
 */
export async function sendPersonalisedJudgeRun(opts: {
  type: string
  /** Summary title for the log, e.g. "Judge availability — 2027". */
  subject: string
  judges: RunJudge[]
  build: (j: RunJudge) => Promise<{ subject: string; html: string; tokenId?: string | null }>
}): Promise<RunResult> {
  let sent = 0, skipped = 0
  const errors: string[] = []
  if (opts.judges.length === 0) return { sent, skipped, errors }

  const { batchId, logIds } = await startBulkRun({
    type: opts.type,
    subject: opts.subject,
    recipients: opts.judges.map(j => ({ judgeId: j.id, email: j.email, name: j.name })),
  })

  await withSendCache(async () => {
    for (const [i, j] of opts.judges.entries()) {
      try {
        const { subject, html, tokenId } = await opts.build(j)
        const error = await sendEmail({
          type: opts.type,
          to: j.email,
          toName: j.name,
          subject,
          html,
          judgeId: j.id,
          tokenId,
          logId: logIds[i],
        })
        if (error) {
          errors.push(`${j.email}: ${error}`)
          skipped++
        } else {
          sent++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${j.email}: ${msg}`)
        skipped++
        await markLogFailed(logIds[i], msg).catch(() => {})
      }
    }
  })

  await finishBulkRun(batchId, opts.judges.length, skipped, errors.map(e => e.slice(e.indexOf(': ') + 2)))
  return { sent, skipped, errors }
}

// ─── Bulk send ────────────────────────────────────────────────────────────────

export interface BulkRecipient {
  /** Member id (email_log.member_id). */
  id?: string | null
  /** Judge id (email_log.judge_id), for runs sent to judges rather than members. */
  judgeId?: string | null
  email: string
  name?: string | null
}

export interface SendBulkEmailOptions {
  type: string
  recipients: BulkRecipient[]
  subject: string
  html: string
  competitionId?: string | null
  /** Club address that also receives its own copy; defaults to the bulk-to setting. */
  toAddress?: string | null
  /** Overrides the configured reply-to for this send. */
  replyTo?: string | null
}

export interface SendBulkEmailResult {
  sent: number
  skipped: number
  /** Distinct provider errors, so a failed send explains itself to the caller. */
  errors: string[]
}

/**
 * Sends the same body to a group as one separate message per member, each
 * addressed only to that member. Slower than a single BCC'd message, but Gmail
 * rate-limits the club's sending domain when it sees one identical message
 * fanned out to the whole membership at once (421-4.7.28), and this way no
 * member's address is exposed to any other member.
 *
 * Only safe for bodies with no per-member personalisation — personalised mail
 * must still go via sendEmail().
 *
 * Logged as a bulk run (see startBulkRun): one summary row for the group plus
 * a child row per recipient, so the per-member audit trail and search work and
 * anyone the run never reached stays marked as not sent.
 */
export async function sendBulkEmail(opts: SendBulkEmailOptions): Promise<SendBulkEmailResult> {
  const html = styleLinks(opts.html + await getFooterHtml())
  const toAddress = opts.toAddress?.trim() || await getBulkToAddress()
  const replyTo = opts.replyTo?.trim() || await getReplyToAddress()
  const pool = getPool()

  if (!resend) {
    // Dev mode: print the body once, then a line per recipient below.
    console.log(`\n[BULK EMAIL – no RESEND_API_KEY set]`)
    console.log(`Reply-To: ${replyTo}`)
    console.log(`Subject:  ${opts.subject}`)
    console.log(`Body:\n${html}\n`)
  }

  /** Delivers one message, returning the provider error (or null on success). */
  async function deliver(to: string, name?: string | null): Promise<string | null> {
    const addressee = name ? `${name} <${to}>` : to
    if (!resend) {
      console.log(`To:       ${addressee}`)
      return null
    }
    try {
      const result = await resend.emails.send({
        from: FROM,
        to: addressee,
        replyTo,
        subject: opts.subject,
        html,
      })
      return result.error ? result.error.message : null
    } catch (err) {
      return (err as Error).message
    }
  }

  const total = opts.recipients.length
  const { batchId, logIds } = await startBulkRun({
    type: opts.type,
    subject: opts.subject,
    recipients: opts.recipients,
    competitionId: opts.competitionId,
    summaryTo: toAddress,
    body: opts.html,
  })

  const errors = new Set<string>()
  let sent = 0, skipped = 0

  // Sequential rather than parallel: awaiting each send in turn keeps the club
  // domain trickling mail out instead of bursting it at the receiving servers.
  for (const [i, r] of opts.recipients.entries()) {
    const error = await deliver(r.email, r.name)
    if (error) { skipped++; errors.add(error) } else sent++
    await pool.query(
      `UPDATE email_log SET body = $2, error = $3, sent_at = NOW() WHERE id = $1`,
      [logIds[i], opts.html, error],
    )
  }

  // The club mailbox still keeps its own copy of every group send, as it did
  // when it was the visible To address on the BCC'd message.
  const clubError = await deliver(toAddress)
  if (clubError) errors.add(clubError)

  await finishBulkRun(batchId, total, skipped, errors, clubError ? `Club copy failed: ${clubError}` : undefined)

  return { sent, skipped, errors: [...errors] }
}

// ─── Template engine ──────────────────────────────────────────────────────────

// Keys whose values are pre-built HTML (not escaped)
const HTML_RAW_KEYS = new Set([
  'submission_link', 'judging_link', 'history_link', 'review_link',
  'results_table', 'entry_summary', 'submitted_entries',
  'competition_description', 'judged_by_line',
  'competition_list', 'response_link', 'response_summary', 'judges_link',
])

export function htmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\[([a-z_]+)\]/gi, (match, key: string) => {
    if (!(key in vars)) return match
    return HTML_RAW_KEYS.has(key) ? vars[key] : htmlEsc(vars[key])
  })
}

export function getEmailTemplate(
  key: string,
): Promise<{ subject_template: string; body_html: string } | null> {
  return cached(`template:${key}`, () => loadEmailTemplate(key))
}

async function loadEmailTemplate(
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

export function makeButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:10px 20px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">${label}</a>`
}

// ─── Email templates ──────────────────────────────────────────────────────────

const appUrl = process.env.APP_URL ?? 'http://localhost:5173'

export async function submissionInviteEmail(opts: {
  memberName: string
  competitionName: string
  closesAt: string | null
  token: string
  description?: string | null
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/submit/${opts.token}`
  const closes = opts.closesAt
    ? new Date(opts.closesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBA'

  const descriptionHtml = opts.description && opts.description.replace(/<[^>]+>/g, '').trim()
    ? `<div style="margin:12px 0;padding:12px 16px;background:#fef3c7;border-left:3px solid #b45309;border-radius:4px">${opts.description}</div>`
    : ''

  const tmpl = await getEmailTemplate('submission_invite')
  if (tmpl) {
    const vars = {
      member_name: opts.memberName,
      competition_name: opts.competitionName,
      closes_date: closes,
      submission_link: makeButton(link, 'Submit your entries'),
      submission_url: link,
      competition_description: descriptionHtml,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `Submit your entries – ${opts.competitionName}`
  const html = `
<p>Hi ${opts.memberName},</p>
<p>Entries are now open for <strong>${opts.competitionName}</strong>.</p>
${descriptionHtml}
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
  const link = `${appUrl}/portal/${opts.token}`

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

export async function deadlineReminderEmail(opts: {
  memberName: string
  competitionName: string
  closesAt: string | null
  token: string
  status: 'none' | 'partial' | 'full'
  projimCount: number
  printimCount: number
  maxProjim: number
  maxPrintim: number
  entries: Array<{ title: string; type: string }>
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/submit/${opts.token}`
  const closes = opts.closesAt
    ? new Date(opts.closesAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'soon'

  let templateKey: string
  let defaultSubject: string
  let defaultIntro: string

  if (opts.status === 'none') {
    templateKey = 'deadline_reminder_none'
    defaultSubject = `Don't forget to enter – ${opts.competitionName}`
    defaultIntro = `<p>We noticed you haven't submitted any entries yet for <strong>${opts.competitionName}</strong>. There's still time!</p>`
  } else if (opts.status === 'partial') {
    templateKey = 'deadline_reminder_partial'
    defaultSubject = `You still have entry slots available – ${opts.competitionName}`
    const submittedList = opts.entries.map(e => `<li>${e.title} (${e.type.toUpperCase()})</li>`).join('')
    const remaining: string[] = []
    const projimLeft = opts.maxProjim - opts.projimCount
    const printimLeft = opts.maxPrintim - opts.printimCount
    if (projimLeft > 0) remaining.push(`${projimLeft} PROJIM`)
    if (printimLeft > 0) remaining.push(`${printimLeft} PRINTIM`)
    defaultIntro = `<p>You've submitted the following entries for <strong>${opts.competitionName}</strong>:</p>
<ul>${submittedList}</ul>
<p>You still have <strong>${remaining.join(' and ')}</strong> slot${remaining.length > 1 ? 's' : ''} remaining. Why not make the most of it?</p>`
  } else {
    templateKey = 'deadline_reminder_full'
    defaultSubject = `Final check – ${opts.competitionName} closes ${closes}`
    defaultIntro = `<p>You've submitted the maximum number of images allowed for <strong>${opts.competitionName}</strong> — great work!</p>
<p>Don't forget you can review, remove and resubmit images up until the competition close deadline on <strong>${closes}</strong>.</p>`
  }

  const tmpl = await getEmailTemplate(templateKey)
  if (tmpl) {
    const submittedList = opts.entries.length > 0
      ? `<ul>${opts.entries.map(e => `<li>${e.title} (${e.type.toUpperCase()})</li>`).join('')}</ul>`
      : ''
    const projimLeft = opts.maxProjim - opts.projimCount
    const printimLeft = opts.maxPrintim - opts.printimCount
    const slotsRemaining = [
      projimLeft > 0 ? `${projimLeft} PROJIM` : '',
      printimLeft > 0 ? `${printimLeft} PRINTIM` : '',
    ].filter(Boolean).join(', ')
    const vars = {
      member_name: opts.memberName,
      competition_name: opts.competitionName,
      closes_date: closes,
      submission_link: makeButton(link, 'Manage your entries'),
      submission_url: link,
      submitted_entries: submittedList,
      slots_remaining: slotsRemaining,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const html = `
<p>Hi ${opts.memberName},</p>
${defaultIntro}
<p>Entries close on <strong>${closes}</strong>.</p>
<p>${makeButton(link, 'Manage your entries')}</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject: defaultSubject, html }
}

export async function resultsNotificationEmail(opts: {
  memberName: string
  competitionName: string
  entries: Array<{ title: string; type: string; award: string | null; points: number | null; comment?: string | null; judgeName?: string | null }>
  token: string
  /** Judge(s) for the competition, used for [judge_name] and as a per-entry fallback. */
  judgeName?: string | null
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/portal/${opts.token}`

  const rows = opts.entries.map(e => {
    const award = e.award ? e.award.replace(/_/g, ' ') : 'Not placed'
    const pts = e.points != null ? ` (${e.points} pts)` : ''
    const judge = e.judgeName ?? opts.judgeName ?? null
    const attribution = judge
      ? `<div style="margin-top:4px;font-style:normal;color:#9ca3af;font-size:12px">— ${htmlEsc(judge)}</div>`
      : ''
    const comment = (e.comment || attribution)
      ? `<tr><td colspan="3" style="padding:4px 8px 10px 8px;color:#6b7280;font-style:italic;font-size:13px;border-bottom:1px solid #f0f0f0">${e.comment ?? ''}${attribution}</td></tr>`
      : ''
    return `<tr>
      <td style="padding:6px 8px 4px 8px">${e.title}</td>
      <td style="padding:6px 8px 4px 8px;text-transform:uppercase;font-size:12px">${e.type}</td>
      <td style="padding:6px 8px 4px 8px;text-transform:capitalize;font-weight:bold">${award}${pts}</td>
    </tr>${comment}`
  }).join('')

  // Distinct judge names across this member's entries, falling back to the
  // competition's assigned judge(s). Drives the [judge_name] placeholder.
  const judgeNames = Array.from(
    new Set(opts.entries.map(e => e.judgeName).filter((n): n is string => !!n)),
  )
  const judgedBy = judgeNames.length > 0 ? judgeNames.join(' & ') : (opts.judgeName ?? '')
  const judgedByLine = judgedBy
    ? `<p>This competition was judged by <strong>${htmlEsc(judgedBy)}</strong>.</p>`
    : ''

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
      judge_name: judgedBy,
      judged_by_line: judgedByLine,
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
${judgedByLine}
${resultsTable}
<p>${makeButton(link, 'View full history')}</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

function fmtDate(d: string | null): string {
  if (!d) return 'TBA'
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function applicationReceivedEmail(opts: {
  firstName: string
  membershipNumber: string
  subsYear: string
  subsAmount: string
  payByDate: string | null
  bankAccount: string
}): Promise<{ subject: string; html: string }> {
  const amount = `$${parseFloat(opts.subsAmount || '0').toFixed(2)}`
  const payBy = fmtDate(opts.payByDate)
  const bank = opts.bankAccount?.trim() || 'available from the club treasurer'

  const tmpl = await getEmailTemplate('application_received')
  if (tmpl) {
    const vars = {
      first_name: opts.firstName,
      membership_number: opts.membershipNumber,
      subs_year: opts.subsYear,
      subs_amount: amount,
      pay_by_date: payBy,
      bank_account: bank,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `Wairarapa Camera Club: Membership Application`
  const html = `
<p>Hi ${opts.firstName},</p>
<p>Thank you for submitting a request to become a member of the Wairarapa Camera Club. We look forward to learning about photography with you!</p>
<p>Your <strong>Membership Number is ${opts.membershipNumber}</strong>. Please take a note of this as you will need it to enter Club competitions.</p>
<p>You indicated you would pay your ${opts.subsYear} membership subscription of <strong>${amount}</strong> by <strong>${payBy}</strong>. Note that your membership will only become active after we have received your payment. If paying online, the Club's bank account number is <strong>${bank}</strong>.</p>
<p>If any of your details are incorrect, just reply to this email to let us know.</p>
<p>Thanks again for applying to become a member.</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}

export async function newApplicationEmail(opts: {
  applicantName: string
  firstName: string
  receivedAt: Date
  payByDate: string | null
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl}/applicants`
  const received = opts.receivedAt.toLocaleString('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland',
  })
  const payBy = fmtDate(opts.payByDate)

  const tmpl = await getEmailTemplate('new_application')
  if (tmpl) {
    const vars = {
      applicant_name: opts.applicantName,
      first_name: opts.firstName,
      received_at: received,
      pay_by_date: payBy,
      review_link: makeButton(link, 'Review application'),
      review_url: link,
    }
    return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  }

  const subject = `New Membership Application Received for ${opts.applicantName}`
  const html = `
<p>A new membership application was received at ${received} from ${opts.firstName}.</p>
<p><strong>${opts.firstName} has indicated they will pay their membership subscription by ${payBy}.</strong></p>
<p>${makeButton(link, 'Review application')}</p>
<p>When their payment has been received, record it through the Shutterbug Subscription Payments page to update their membership Status, Type and Paid Year.</p>
<p>—<br>Wairarapa Camera Club</p>
`
  return { subject, html }
}
