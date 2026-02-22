import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { getPool } from '../../_lib/db.js'
import { upsertHistoryToken } from '../../_lib/tokens.js'
import { sendEmail, resultsNotificationEmail } from '../../_lib/email.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const competitionId = req.query.id as string
  const pool = getPool()

  const compRes = await pool.query(
    `SELECT id, name, status FROM competitions WHERE id = $1`,
    [competitionId],
  )
  const comp = compRes.rows[0]
  if (!comp) return res.status(404).json({ error: 'Competition not found' })
  if (comp.status !== 'complete') return res.status(400).json({ error: 'Competition is not complete yet' })

  // Members who entered, with their entries
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
        `SELECT type, title, award, points_awarded FROM entries
         WHERE competition_id = $1 AND member_id = $2`,
        [competitionId, m.id],
      )

      const historyTok = await upsertHistoryToken(m.id)
      const { subject, html } = resultsNotificationEmail({
        memberName: `${m.first_name} ${m.last_name}`,
        competitionName: comp.name,
        entries: entriesRes.rows.map((e: { type: string; title: string; award: string | null; points_awarded: number | null }) => ({
          title: e.title,
          type: e.type,
          award: e.award,
          points: e.points_awarded,
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

  res.status(200).json({ sent, skipped, errors })
}
