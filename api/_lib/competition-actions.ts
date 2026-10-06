import { getPool } from './db.js'
import { upsertSubmissionToken, upsertJudgingToken, upsertHistoryToken } from './tokens.js'
import {
  sendEmail,
  sendPersonalisedRun,
  type RunMember,
  submissionInviteEmail,
  submissionReminderEmail,
  judgingInviteEmail,
  memberHistoryEmail,
  resultsNotificationEmail,
  deadlineReminderEmail,
} from './email.js'

interface BulkSendResult {
  sent: number
  skipped: number
  /** Members passed over because a re-run found they'd already been sent this email. */
  alreadySent: number
  errors: string[]
}

// A re-run within this window skips members who already got the email, so a
// send that was cut short can simply be run again to reach everyone it missed.
// Kept short so a deliberate later re-send (e.g. a second reminder) still goes
// to everyone.
const RESUME_WINDOW = '1 hour'

const RUN_LABELS: Record<string, string> = {
  submission_invite: 'Submission invite',
  submission_reminder: 'Reminder',
  deadline_reminder: 'Deadline reminder',
  results_notification: 'Results',
}

type BuiltEmail = { subject: string; html: string; tokenId?: string | null }

/**
 * Sends a competition email to each member as one logged bulk run (see
 * sendPersonalisedRun), first passing over anyone already sent it within the
 * resume window.
 */
async function sendToEach(
  comp: { id: string; name: string },
  type: string,
  members: RunMember[],
  build: (m: RunMember) => Promise<BuiltEmail>,
): Promise<BulkSendResult> {
  const recentRes = await getPool().query(
    `SELECT DISTINCT member_id FROM email_log
     WHERE competition_id = $1 AND type = $2 AND error IS NULL AND member_id IS NOT NULL
       AND sent_at > NOW() - $3::interval`,
    [comp.id, type, RESUME_WINDOW],
  )
  const recent = new Set<string>(recentRes.rows.map((r: { member_id: string }) => r.member_id))
  const toSend = members.filter(m => !recent.has(m.id))

  const result = await sendPersonalisedRun({
    type,
    subject: `${RUN_LABELS[type] ?? type} — ${comp.name}`,
    competitionId: comp.id,
    members: toSend,
    build,
  })
  return { ...result, alreadySent: members.length - toSend.length }
}

export async function sendSubmissionInvites(competitionId: string): Promise<BulkSendResult> {
  const compRes = await getPool().query(
    `SELECT id, name, closes_at, status, description FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) throw new Error('Competition not found')
  if (comp.status !== 'open') throw new Error(`Competition is not open (status: ${comp.status})`)

  // Active members with real emails only
  const membersRes = await getPool().query(
    `SELECT id, first_name, last_name, email FROM members
     WHERE status = 'active' AND email NOT LIKE '%@privacy.wcc.local'
     ORDER BY last_name, first_name`,
  )

  return sendToEach(comp, 'submission_invite', membersRes.rows, async m => {
    const tok = await upsertSubmissionToken(m.id, competitionId, comp.closes_at)
    const { subject, html } = await submissionInviteEmail({
      memberName: `${m.first_name} ${m.last_name}`,
      competitionName: comp.name,
      closesAt: comp.closes_at,
      token: tok.token,
      description: comp.description,
    })
    return { subject, html, tokenId: tok.id }
  })
}

export async function sendSubmissionReminders(competitionId: string): Promise<BulkSendResult> {
  const compRes = await getPool().query(
    `SELECT id, name, closes_at, status FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) throw new Error('Competition not found')
  if (!['open', 'closed'].includes(comp.status)) throw new Error(`Competition is not open or closed (status: ${comp.status})`)

  const membersRes = await getPool().query(
    `SELECT id, first_name, last_name, email FROM members
     WHERE status = 'active' AND email NOT LIKE '%@privacy.wcc.local'
     ORDER BY last_name, first_name`,
  )

  return sendToEach(comp, 'submission_reminder', membersRes.rows, async m => {
    const tok = await upsertSubmissionToken(m.id, competitionId, comp.closes_at)
    const entryRes = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM entries WHERE competition_id = $1 AND member_id = $2`,
      [competitionId, m.id],
    )
    const entryCount = parseInt(entryRes.rows[0].cnt, 10)

    const { subject, html } = await submissionReminderEmail({
      memberName: `${m.first_name} ${m.last_name}`,
      competitionName: comp.name,
      closesAt: comp.closes_at,
      token: tok.token,
      entryCount,
    })
    return { subject, html, tokenId: tok.id }
  })
}

async function buildDeadlineReminder(
  comp: { id: string; name: string; closes_at: string | null; max_projim_entries: number; max_printim_entries: number },
  m: RunMember,
): Promise<BuiltEmail> {
  const tok = await upsertSubmissionToken(m.id, comp.id, comp.closes_at ? new Date(comp.closes_at) : null)

  const entriesRes = await getPool().query(
    `SELECT type, title FROM entries WHERE competition_id = $1 AND member_id = $2 ORDER BY submitted_at ASC`,
    [comp.id, m.id],
  )
  const entries = entriesRes.rows as { type: string; title: string }[]
  const projimCount = entries.filter(e => e.type === 'projim').length
  const printimCount = entries.filter(e => e.type === 'printim').length
  let status: 'none' | 'partial' | 'full'
  if (entries.length === 0) status = 'none'
  else if (projimCount >= comp.max_projim_entries && printimCount >= comp.max_printim_entries) status = 'full'
  else status = 'partial'

  const { subject, html } = await deadlineReminderEmail({
    memberName: `${m.first_name} ${m.last_name}`,
    competitionName: comp.name,
    closesAt: comp.closes_at,
    token: tok.token,
    status,
    projimCount,
    printimCount,
    maxProjim: comp.max_projim_entries,
    maxPrintim: comp.max_printim_entries,
    entries,
  })
  return { subject, html, tokenId: tok.id }
}

export async function sendDeadlineReminderToMember(competitionId: string, memberId: string): Promise<{ memberName: string; status: string }> {
  const compRes = await getPool().query(
    `SELECT id, name, closes_at, status, max_projim_entries, max_printim_entries FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) throw new Error('Competition not found')
  if (!['open', 'closed'].includes(comp.status)) throw new Error(`Competition is not open or closed (status: ${comp.status})`)

  const memberRes = await getPool().query(
    `SELECT id, first_name, last_name, email FROM members WHERE id = $1`,
    [memberId],
  )
  const m = memberRes.rows[0]
  if (!m) throw new Error('Member not found')

  const { subject, html, tokenId } = await buildDeadlineReminder(comp, m)
  await sendEmail({
    type: 'deadline_reminder',
    to: m.email,
    toName: `${m.first_name} ${m.last_name}`,
    subject,
    html,
    memberId: m.id,
    competitionId: comp.id,
    tokenId,
  })
  return { memberName: `${m.first_name} ${m.last_name}`, status: comp.status }
}

export async function sendDeadlineReminders(competitionId: string): Promise<BulkSendResult> {
  const compRes = await getPool().query(
    `SELECT id, name, closes_at, status, max_projim_entries, max_printim_entries FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) throw new Error('Competition not found')
  if (!['open', 'closed'].includes(comp.status)) throw new Error(`Competition is not open or closed (status: ${comp.status})`)

  const membersRes = await getPool().query(
    `SELECT id, first_name, last_name, email FROM members
     WHERE status = 'active' AND email NOT LIKE '%@privacy.wcc.local'
     ORDER BY last_name, first_name`,
  )

  return sendToEach(comp, 'deadline_reminder', membersRes.rows, m => buildDeadlineReminder(comp, m))
}

export async function sendJudgingInvite(competitionId: string): Promise<{ judgeName: string }> {
  const compRes = await getPool().query(
    `SELECT c.id, c.name, c.judging_closes_at, c.status,
            j.id AS judge_id, j.name AS judge_name, j.email AS judge_email
     FROM competitions c
     JOIN competition_judges cj ON cj.competition_id = c.id
     JOIN judges j ON j.id = cj.judge_id
     WHERE c.id = $1
     LIMIT 1`,
    [competitionId],
  )
  const row = compRes.rows[0]
  if (!row) throw new Error('Competition not found or no judge assigned')
  if (row.status !== 'judging') throw new Error(`Competition is not in judging status (status: ${row.status})`)

  // Entry counts
  const counts = await getPool().query(
    `SELECT type, COUNT(*) AS cnt FROM entries WHERE competition_id = $1 GROUP BY type`,
    [competitionId],
  )
  const projimCount = parseInt(counts.rows.find((r: { type: string }) => r.type === 'projim')?.cnt ?? '0', 10)
  const printimCount = parseInt(counts.rows.find((r: { type: string }) => r.type === 'printim')?.cnt ?? '0', 10)

  const tok = await upsertJudgingToken(row.judge_id, competitionId, row.judging_closes_at)
  const { subject, html } = await judgingInviteEmail({
    judgeName: row.judge_name,
    competitionName: row.name,
    judgingClosesAt: row.judging_closes_at,
    projimCount,
    printimCount,
    token: tok.token,
  })

  await sendEmail({
    type: 'judging_invite',
    to: row.judge_email,
    toName: row.judge_name,
    subject,
    html,
    judgeId: row.judge_id,
    competitionId,
    tokenId: tok.id,
  })

  return { judgeName: row.judge_name }
}

export async function sendSubmissionInviteSingle(
  competitionId: string,
  memberId: string,
): Promise<void> {
  const compRes = await getPool().query(
    `SELECT id, name, closes_at, status, description FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) throw new Error('Competition not found')
  if (comp.status !== 'open') throw new Error(`Competition is not open (status: ${comp.status})`)

  const memberRes = await getPool().query(
    `SELECT id, first_name, last_name, email FROM members WHERE id = $1`,
    [memberId],
  )
  const m = memberRes.rows[0]
  if (!m) throw new Error('Member not found')
  if (m.email.includes('@privacy.wcc.local')) throw new Error('Member has no email address on record')

  const tok = await upsertSubmissionToken(m.id, competitionId, comp.closes_at)
  const { subject, html } = await submissionInviteEmail({
    memberName: `${m.first_name} ${m.last_name}`,
    competitionName: comp.name,
    closesAt: comp.closes_at,
    token: tok.token,
    description: comp.description,
  })
  await sendEmail({
    type: 'submission_invite',
    to: m.email,
    toName: `${m.first_name} ${m.last_name}`,
    subject,
    html,
    memberId: m.id,
    competitionId,
    tokenId: tok.id,
  })
}

export async function sendMemberHistoryLink(memberId: string): Promise<void> {
  const memberRes = await getPool().query(
    `SELECT id, first_name, last_name, email FROM members WHERE id = $1`,
    [memberId],
  )
  const m = memberRes.rows[0]
  if (!m) throw new Error('Member not found')
  if (m.email.includes('@privacy.wcc.local')) throw new Error('Member email not available')

  const tok = await upsertHistoryToken(m.id)
  const { subject, html } = await memberHistoryEmail({
    memberName: `${m.first_name} ${m.last_name}`,
    token: tok.token,
  })

  await sendEmail({
    type: 'member_history_link',
    to: m.email,
    toName: `${m.first_name} ${m.last_name}`,
    subject,
    html,
    memberId: m.id,
    tokenId: tok.id,
  })
}

export async function sendResults(competitionId: string): Promise<BulkSendResult> {
  const pool = getPool()

  const compRes = await pool.query(
    `SELECT id, name, status FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) throw new Error('Competition not found')
  if (comp.status !== 'complete') throw new Error('Competition is not complete yet')

  // Judge(s) assigned to the competition — used where an entry has no
  // judged_by recorded (e.g. entries imported from the old system).
  const compJudgesRes = await pool.query(
    `SELECT j.name FROM competition_judges cj
     JOIN judges j ON j.id = cj.judge_id
     WHERE cj.competition_id = $1
     ORDER BY j.name`,
    [competitionId],
  )
  const compJudgeName = compJudgesRes.rows.map((r: { name: string }) => r.name).join(' & ') || null

  const membersRes = await pool.query(
    `SELECT DISTINCT m.id, m.first_name, m.last_name, m.email
     FROM members m
     JOIN entries e ON e.member_id = m.id
     WHERE e.competition_id = $1
       AND m.email NOT LIKE '%@privacy.wcc.local'`,
    [competitionId],
  )

  return sendToEach(comp, 'results_notification', membersRes.rows, async m => {
    const entriesRes = await pool.query(
      `SELECT e.type, e.title, e.award, e.points_awarded, e.judge_comment, j.name AS judge_name
       FROM entries e
       LEFT JOIN judges j ON j.id = e.judged_by
       WHERE e.competition_id = $1 AND e.member_id = $2`,
      [competitionId, m.id],
    )
    const historyTok = await upsertHistoryToken(m.id)
    const { subject, html } = await resultsNotificationEmail({
      memberName: `${m.first_name} ${m.last_name}`,
      competitionName: comp.name,
      entries: entriesRes.rows.map((e: { type: string; title: string; award: string | null; points_awarded: number | null; judge_comment: string | null; judge_name: string | null }) => ({
        title: e.title, type: e.type, award: e.award, points: e.points_awarded, comment: e.judge_comment,
        judgeName: e.judge_name ?? compJudgeName,
      })),
      token: historyTok.token,
      judgeName: compJudgeName,
    })
    return { subject, html, tokenId: historyTok.id }
  })
}
