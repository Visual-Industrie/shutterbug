/**
 * Single Vercel serverless function — handles all /api/* routes via Express.
 * Consolidates individual route files to stay within Vercel Hobby plan's 12-function limit.
 */
import express from 'express'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  sendSubmissionInvites,
  sendSubmissionReminders,
  sendSubmissionInviteSingle,
  sendJudgingInvite,
  sendMemberHistoryLink,
  sendResults,
} from './_lib/competition-actions.js'
import { getSubmissionData, createEntry, deleteEntry } from './_lib/submission.js'
import { getJudgingData, scoreEntry, completeJudging } from './_lib/judging.js'
import { getMemberHistory } from './_lib/history.js'
import { uploadToDrive, deleteFromDrive } from './_lib/drive.js'
import { parseUpload } from './_lib/parse-upload.js'
import { processImage, buildEntryFilename } from './_lib/image.js'
import { getPool } from './_lib/db.js'

const app = express()
app.use(express.json())

const JWT_SECRET = () => {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET not set')
  return s
}

// ── Auth middleware ────────────────────────────────────────────────────────────

function requireAuth(req: express.Request, res: express.Response): boolean {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return false }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET())
    return true
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return false
  }
}

// ── Auth routes ────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return void res.status(400).json({ error: 'Email and password required' })

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, password_hash FROM admin_users WHERE email = $1',
      [email],
    )
    const admin = result.rows[0]
    if (!admin) return void res.status(401).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, admin.password_hash)
    if (!valid) return void res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign(
      { sub: admin.id, email: admin.email, name: admin.name, role: admin.role },
      JWT_SECRET(),
      { expiresIn: '7d' },
    )
    await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [admin.id])
    res.json({ token, user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } })
  } finally {
    await pool.end()
  }
})

app.post('/api/auth/change-password', async (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return void res.status(401).json({ error: 'Unauthorized' })
  let userId: string
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET()) as { sub: string }
    userId = payload.sub
  } catch {
    return void res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { currentPassword, newPassword } = req.body ?? {}
  if (!currentPassword || !newPassword) return void res.status(400).json({ error: 'currentPassword and newPassword are required' })
  if (newPassword.length < 8) return void res.status(400).json({ error: 'New password must be at least 8 characters' })

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const result = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [userId])
    const admin = result.rows[0]
    if (!admin) return void res.status(404).json({ error: 'User not found' })

    const valid = await bcrypt.compare(currentPassword, admin.password_hash)
    if (!valid) return void res.status(401).json({ error: 'Current password is incorrect' })

    const hash = await bcrypt.hash(newPassword, 12)
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, userId])
    res.json({ ok: true })
  } finally {
    await pool.end()
  }
})

app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return void res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET()) as {
      sub: string; email: string; name: string; role: string
    }
    res.json({ user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role } })
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
})

// ── Competition routes ─────────────────────────────────────────────────────────

app.post('/api/competitions', async (req, res) => {
  if (!requireAuth(req, res)) return
  const {
    name, event_type = 'competition',
    opens_at, closes_at, judging_opens_at, judging_closes_at,
    max_projim_entries = 1, max_printim_entries = 2,
    points_honours = 4, points_highly_commended = 3, points_commended = 2, points_accepted = 1,
  } = req.body ?? {}
  if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })

  // Derive season from opens_at year, falling back to current year
  const year = opens_at ? new Date(opens_at).getFullYear() : new Date().getFullYear()
  const seasonRes = await getPool().query(
    `INSERT INTO seasons (year, starts_at, ends_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (year) DO UPDATE SET year = EXCLUDED.year
     RETURNING id`,
    [year, `${year}-01-01`, `${year}-12-31`],
  )
  const season_id = seasonRes.rows[0].id

  const result = await getPool().query(
    `INSERT INTO competitions (
       name, event_type, season_id, status,
       opens_at, closes_at, judging_opens_at, judging_closes_at,
       max_projim_entries, max_printim_entries,
       points_honours, points_highly_commended, points_commended, points_accepted
     ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [name.trim(), event_type, season_id, opens_at || null, closes_at || null,
     judging_opens_at || null, judging_closes_at || null,
     max_projim_entries, max_printim_entries,
     points_honours, points_highly_commended, points_commended, points_accepted],
  )
  res.status(201).json({ id: result.rows[0].id })
})

app.patch('/api/competitions/:id', async (req, res) => {
  if (!requireAuth(req, res)) return
  const {
    name, event_type, opens_at, closes_at, judging_opens_at, judging_closes_at,
    max_projim_entries, max_printim_entries,
    points_honours, points_highly_commended, points_commended, points_accepted,
  } = req.body ?? {}
  if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
  const result = await getPool().query(
    `UPDATE competitions SET name=$1,event_type=$2,opens_at=$3,closes_at=$4,
     judging_opens_at=$5,judging_closes_at=$6,max_projim_entries=$7,max_printim_entries=$8,
     points_honours=$9,points_highly_commended=$10,points_commended=$11,points_accepted=$12,
     updated_at=NOW() WHERE id=$13 RETURNING id`,
    [name.trim(), event_type || 'competition', opens_at || null, closes_at || null,
     judging_opens_at || null, judging_closes_at || null,
     max_projim_entries ?? 1, max_printim_entries ?? 2,
     points_honours ?? 4, points_highly_commended ?? 3, points_commended ?? 2, points_accepted ?? 1,
     req.params.id],
  )
  if (!result.rows.length) return void res.status(404).json({ error: 'Competition not found' })
  res.json({ ok: true })
})

app.put('/api/competitions/:id/judge', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { judge_id } = req.body ?? {}
  await getPool().query('DELETE FROM competition_judges WHERE competition_id=$1', [req.params.id])
  if (judge_id) {
    await getPool().query(
      'INSERT INTO competition_judges (competition_id,judge_id) VALUES ($1,$2)',
      [req.params.id, judge_id],
    )
  }
  res.json({ ok: true })
})

app.post('/api/competitions/:id/send-submission-invites', async (req, res) => {
  if (!requireAuth(req, res)) return
  try { res.json(await sendSubmissionInvites(req.params.id)) }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Error' }) }
})

app.post('/api/competitions/:id/send-submission-invite-single', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { memberId } = req.body ?? {}
  if (!memberId) return void res.status(400).json({ error: 'memberId is required' })
  try {
    await sendSubmissionInviteSingle(req.params.id, memberId)
    res.json({ ok: true })
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Error' }) }
})

app.post('/api/competitions/:id/send-submission-reminders', async (req, res) => {
  if (!requireAuth(req, res)) return
  try { res.json(await sendSubmissionReminders(req.params.id)) }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Error' }) }
})

app.post('/api/competitions/:id/send-results', async (req, res) => {
  if (!requireAuth(req, res)) return
  try { res.json(await sendResults(req.params.id)) }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Error' }) }
})

app.post('/api/competitions/:id/send-judging-invite', async (req, res) => {
  if (!requireAuth(req, res)) return
  try { res.json(await sendJudgingInvite(req.params.id)) }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Error' }) }
})

// ── Member routes ─────────────────────────────────────────────────────────────

app.post('/api/members', async (req, res) => {
  if (!requireAuth(req, res)) return
  const {
    first_name, last_name, email, phone, membership_number, status = 'active',
    membership_type = 'full', experience_level, subs_paid = false, subs_due_date,
    joined_date, annual_sub_amount, privacy_act_ok = false, image_use_ok = false, club_rules_ok = false,
  } = req.body ?? {}
  if (!first_name?.trim()) return void res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return void res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  const result = await getPool().query(
    `INSERT INTO members (first_name,last_name,email,phone,membership_number,status,membership_type,
     experience_level,subs_paid,subs_due_date,annual_sub_amount,joined_date,
     privacy_act_ok,image_use_ok,club_rules_ok)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), phone?.trim() || null,
     membership_number?.trim() || null, status, membership_type, experience_level || null,
     subs_paid, subs_due_date || null, annual_sub_amount || null, joined_date || null,
     privacy_act_ok, image_use_ok, club_rules_ok],
  )
  res.status(201).json({ id: result.rows[0].id })
})

app.patch('/api/members/:id', async (req, res) => {
  if (!requireAuth(req, res)) return
  const {
    first_name, last_name, email, phone, membership_number, status, membership_type,
    experience_level, subs_paid, subs_due_date, joined_date, annual_sub_amount,
  } = req.body ?? {}
  if (!first_name?.trim()) return void res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return void res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  const result = await getPool().query(
    `UPDATE members SET first_name=$1,last_name=$2,email=$3,phone=$4,membership_number=$5,
     status=$6,membership_type=$7,experience_level=$8,subs_paid=$9,subs_due_date=$10,
     joined_date=$11,annual_sub_amount=$12,updated_at=NOW() WHERE id=$13 RETURNING id`,
    [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), phone?.trim() || null,
     membership_number?.trim() || null, status, membership_type, experience_level || null,
     subs_paid ?? false, subs_due_date || null, joined_date || null, annual_sub_amount || null,
     req.params.id],
  )
  if (!result.rows.length) return void res.status(404).json({ error: 'Member not found' })
  res.json({ ok: true })
})

app.post('/api/members/:id/send-history-link', async (req, res) => {
  if (!requireAuth(req, res)) return
  try { await sendMemberHistoryLink(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Error' }) }
})

// ── Judge routes ─────────────────────────────────────────────────────────────

app.post('/api/judges', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { name, email, bio, address, rating, is_available = true } = req.body ?? {}
  if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  const result = await getPool().query(
    `INSERT INTO judges (name,email,bio,address,rating,is_available) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [name.trim(), email.trim().toLowerCase(), bio?.trim() || null, address?.trim() || null,
     rating != null && rating !== '' ? parseFloat(rating) : null, is_available],
  )
  res.status(201).json({ id: result.rows[0].id })
})

app.patch('/api/judges/:id', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { name, email, bio, address, rating, is_available } = req.body ?? {}
  if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  const result = await getPool().query(
    `UPDATE judges SET name=$1,email=$2,bio=$3,address=$4,rating=$5,is_available=$6,updated_at=NOW()
     WHERE id=$7 RETURNING id`,
    [name.trim(), email.trim().toLowerCase(), bio?.trim() || null, address?.trim() || null,
     rating != null && rating !== '' ? parseFloat(rating) : null, is_available ?? true, req.params.id],
  )
  if (!result.rows.length) return void res.status(404).json({ error: 'Judge not found' })
  res.json({ ok: true })
})

// ── Applicant routes ──────────────────────────────────────────────────────────

app.post('/api/applicants', async (req, res) => {
  const { first_name, last_name, email, phone, privacy_act_ok, image_use_ok, club_rules_ok } = req.body ?? {}
  if (!first_name?.trim()) return void res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return void res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  if (!privacy_act_ok) return void res.status(400).json({ error: 'Privacy Act consent is required' })
  if (!image_use_ok) return void res.status(400).json({ error: 'Image use consent is required' })
  if (!club_rules_ok) return void res.status(400).json({ error: 'Club rules agreement is required' })
  const existing = await getPool().query(
    `SELECT id FROM applicants WHERE email = $1 AND status = 'pending'`,
    [email.trim().toLowerCase()],
  )
  if (existing.rows.length > 0) return void res.status(409).json({ error: 'An application with this email is already pending' })
  const result = await getPool().query(
    `INSERT INTO applicants (first_name,last_name,email,phone,privacy_act_ok,image_use_ok,club_rules_ok,status,application_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',CURRENT_DATE) RETURNING id`,
    [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), phone?.trim() || null, true, true, true],
  )
  res.status(201).json({ id: result.rows[0].id })
})

app.patch('/api/applicants/:id', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { first_name, last_name, email, phone, annual_sub_amount, pay_by_date, status } = req.body ?? {}
  if (!first_name?.trim()) return void res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return void res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  const result = await getPool().query(
    `UPDATE applicants SET first_name=$1,last_name=$2,email=$3,phone=$4,
     annual_sub_amount=$5,pay_by_date=$6,status=$7,updated_at=NOW() WHERE id=$8 RETURNING id`,
    [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), phone?.trim() || null,
     annual_sub_amount || null, pay_by_date || null, status || 'pending', req.params.id],
  )
  if (!result.rows.length) return void res.status(404).json({ error: 'Applicant not found' })
  res.json({ ok: true })
})

app.post('/api/applicants/:id/record-payment', async (req, res) => {
  if (!requireAuth(req, res)) return
  const appRes = await getPool().query(
    `SELECT * FROM applicants WHERE id = $1 AND status = 'pending'`,
    [req.params.id],
  )
  const ap = appRes.rows[0]
  if (!ap) return void res.status(404).json({ error: 'Applicant not found or already processed' })
  const memberRes = await getPool().query(
    `INSERT INTO members (
       first_name,last_name,email,phone,status,membership_type,
       annual_sub_amount,subs_paid,subs_paid_date,subs_paid_amount,
       privacy_act_ok,image_use_ok,club_rules_ok,joined_date
     ) VALUES ($1,$2,$3,$4,'active','full',$5,true,CURRENT_DATE,$5,$6,$7,$8,CURRENT_DATE)
     RETURNING id`,
    [ap.first_name, ap.last_name, ap.email, ap.phone, ap.annual_sub_amount,
     ap.privacy_act_ok, ap.image_use_ok, ap.club_rules_ok],
  )
  await getPool().query(
    `UPDATE applicants SET status='approved',updated_at=NOW() WHERE id=$1`,
    [req.params.id],
  )
  res.json({ memberId: memberRes.rows[0].id })
})

// ── Submission portal (public, token-gated) ───────────────────────────────────

app.get('/api/submit/:token', async (req, res) => {
  const data = await getSubmissionData(req.params.token)
  if (!data) return void res.status(404).json({ error: 'Invalid or expired link' })
  res.json(data)
})

app.post('/api/submit/:token/entries', async (req, res) => {
  const { fields, file } = await parseUpload(req)
  const type = fields.type as 'projim' | 'printim'
  const title = fields.title ?? ''
  if (!type || !['projim', 'printim'].includes(type)) return void res.status(400).json({ error: 'type must be projim or printim' })
  if (!title.trim()) return void res.status(400).json({ error: 'Title is required' })

  let driveResult = null
  if (file && file.buffer.length > 0) {
    const compRes = await getPool().query(
      `SELECT c.id, c.name, c.judging_closes_at, m.membership_number
       FROM competitions c
       JOIN tokens t ON t.competition_id = c.id
       JOIN members m ON m.id = t.member_id
       WHERE t.token = $1`,
      [req.params.token],
    )
    const comp = compRes.rows[0]
    if (comp) {
      const processedBuffer = await processImage(file.buffer)
      const filename = buildEntryFilename({
        type,
        title,
        membershipNumber: comp.membership_number,
        originalFilename: file.filename || `${title}.jpg`,
      })
      driveResult = await uploadToDrive({
        buffer: processedBuffer,
        filename,
        mimeType: 'image/jpeg',
        competitionId: comp.id,
        competitionName: comp.name,
        judgingClosesAt: comp.judging_closes_at,
      })
    }
  }

  const result = await createEntry({
    tokenValue: req.params.token,
    type,
    title,
    driveFileId: driveResult?.driveFileId,
    driveFileUrl: driveResult?.driveFileUrl,
    driveThumbnailUrl: driveResult?.driveThumbnailUrl,
  })
  if ('error' in result) return void res.status(400).json(result)
  res.status(201).json(result)
})

app.delete('/api/submit/:token/entries', async (req, res) => {
  const entryId = req.query.entryId as string
  if (!entryId) return void res.status(400).json({ error: 'entryId required' })
  const result = await deleteEntry({ tokenValue: req.params.token, entryId })
  if ('error' in result) return void res.status(400).json(result)
  if (result.driveFileId) await deleteFromDrive(result.driveFileId)
  res.json({ ok: true })
})

// ── Judge portal (public, token-gated) ────────────────────────────────────────

app.get('/api/judge/:token', async (req, res) => {
  const data = await getJudgingData(req.params.token)
  if (!data) return void res.status(404).json({ error: 'Invalid or expired judging link' })
  res.json(data)
})

app.patch('/api/judge/:token/score', async (req, res) => {
  const { entryId, award, comment } = req.body ?? {}
  if (!entryId) return void res.status(400).json({ error: 'entryId required' })
  const result = await scoreEntry({ tokenValue: req.params.token, entryId, award: award ?? null, comment: comment ?? null })
  if ('error' in result) return void res.status(400).json(result)
  res.json(result)
})

app.post('/api/judge/:token/complete', async (req, res) => {
  const result = await completeJudging(req.params.token)
  if ('error' in result) return void res.status(400).json(result)
  res.json(result)
})

// ── Member history portal (public, token-gated) ───────────────────────────────

app.get('/api/history/:token', async (req, res) => {
  const data = await getMemberHistory(req.params.token)
  if (!data) return void res.status(404).json({ error: 'Invalid or expired link' })
  res.json(data)
})

export default app
