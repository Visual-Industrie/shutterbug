import { getPool } from './db.js'
import { upsertSubmissionToken, upsertJudgingToken, upsertHistoryToken } from './tokens.js'
import {
  sendEmail,
  submissionInviteEmail,
  submissionReminderEmail,
  judgingInviteEmail,
  memberHistoryEmail,
  resultsNotificationEmail,
} from './email.js'

export async function sendSubmissionInvites(competitionId: string): Promise<{
  sent: number
  skipped: number
  errors: string[]
}> {
  const compRes = await getPool().query(
    `SELECT id, name, closes_at, status FROM competitions WHERE id = $1`,
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

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const m of membersRes.rows) {
    try {
      const tok = await upsertSubmissionToken(m.id, competitionId, comp.closes_at)
      const { subject, html } = submissionInviteEmail({
        memberName: `${m.first_name} ${m.last_name}`,
        competitionName: comp.name,
        closesAt: comp.closes_at,
        token: tok.token,
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
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${m.email}: ${msg}`)
      skipped++
    }
  }

  return { sent, skipped, errors }
}

export async function sendSubmissionReminders(competitionId: string): Promise<{
  sent: number
  skipped: number
  errors: string[]
}> {
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

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const m of membersRes.rows) {
    try {
      const tok = await upsertSubmissionToken(m.id, competitionId, comp.closes_at)
      const entryRes = await getPool().query(
        `SELECT COUNT(*) AS cnt FROM entries WHERE competition_id = $1 AND member_id = $2`,
        [competitionId, m.id],
      )
      const entryCount = parseInt(entryRes.rows[0].cnt, 10)

      const { subject, html } = submissionReminderEmail({
        memberName: `${m.first_name} ${m.last_name}`,
        competitionName: comp.name,
        closesAt: comp.closes_at,
        token: tok.token,
        entryCount,
      })
      await sendEmail({
        type: 'submission_reminder',
        to: m.email,
        toName: `${m.first_name} ${m.last_name}`,
        subject,
        html,
        memberId: m.id,
        competitionId,
        tokenId: tok.id,
      })
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${m.email}: ${msg}`)
      skipped++
    }
  }

  return { sent, skipped, errors }
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
  const { subject, html } = judgingInviteEmail({
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
    `SELECT id, name, closes_at, status FROM competitions WHERE id = $1`,
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
  const { subject, html } = submissionInviteEmail({
    memberName: `${m.first_name} ${m.last_name}`,
    competitionName: comp.name,
    closesAt: comp.closes_at,
    token: tok.token,
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
  const { subject, html } = memberHistoryEmail({
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

export async function sendResults(competitionId: string): Promise<{
  sent: number
  skipped: number
  errors: string[]
}> {
  const pool = getPool()

  const compRes = await pool.query(
    `SELECT id, name, status FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) throw new Error('Competition not found')
  if (comp.status !== 'complete') throw new Error('Competition is not complete yet')

  const membersRes = await pool.query(
    `SELECT DISTINCT m.id, m.first_name, m.last_name, m.email
     FROM members m
     JOIN entries e ON e.member_id = m.id
     WHERE e.competition_id = $1
       AND m.email NOT LIKE '%@privacy.wcc.local'`,
    [competitionId],
  )

  let sent = 0, skipped = 0
  const errors: string[] = []

  for (const m of membersRes.rows) {
    try {
      const entriesRes = await pool.query(
        `SELECT type, title, award, points_awarded, judge_comment FROM entries
         WHERE competition_id = $1 AND member_id = $2`,
        [competitionId, m.id],
      )
      const historyTok = await upsertHistoryToken(m.id)
      const { subject, html } = resultsNotificationEmail({
        memberName: `${m.first_name} ${m.last_name}`,
        competitionName: comp.name,
        entries: entriesRes.rows.map((e: { type: string; title: string; award: string | null; points_awarded: number | null; judge_comment: string | null }) => ({
          title: e.title, type: e.type, award: e.award, points: e.points_awarded, comment: e.judge_comment,
        })),
        token: historyTok.token,
      })
      await sendEmail({
        type: 'results_notification',
        to: m.email,
        toName: `${m.first_name} ${m.last_name}`,
        subject,
        html,
        memberId: m.id,
        competitionId,
        tokenId: historyTok.id,
      })
      sent++
    } catch (err) {
      errors.push(`${m.email}: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  return { sent, skipped, errors }
}
