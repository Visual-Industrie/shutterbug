/**
 * Single Vercel serverless function — handles all /api/* routes via Express.
 * Consolidates individual route files to stay within Vercel Hobby plan's 12-function limit.
 */
// Disable Vercel's default 4.5MB body size limit — image uploads can be up to 50MB
export const config = { api: { bodyParser: false, responseLimit: false } }

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
import { sendEmail, subsReminderEmail } from './_lib/email.js'
import { getSubmissionData, createEntry, deleteEntry } from './_lib/submission.js'
import { getJudgingData, scoreEntry, completeJudging } from './_lib/judging.js'
import { getMemberHistory } from './_lib/history.js'
import archiver from 'archiver'
import { uploadToDrive, deleteFromDrive, createDriveUploadSession, downloadFromDrive, processDriveFile } from './_lib/drive.js'
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

    if (!admin.password_hash) return void res.status(401).json({ error: 'Account not yet activated — check your email for a setup link' })

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

app.post('/api/auth/invite', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { member_id, admin_role } = req.body ?? {}
  if (!member_id) return void res.status(400).json({ error: 'member_id is required' })
  if (!admin_role) return void res.status(400).json({ error: 'admin_role is required' })

  try {
    // Look up the member
    const memberRes = await getPool().query(
      `SELECT id, first_name, last_name, email FROM members WHERE id = $1`,
      [member_id],
    )
    const member = memberRes.rows[0]
    if (!member) return void res.status(404).json({ error: 'Member not found' })

    const inviteToken = crypto.randomUUID()
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const name = `${member.first_name} ${member.last_name}`

    // Upsert admin_users row
    await getPool().query(
      `INSERT INTO admin_users (email, name, role, member_id, invite_token, invite_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         role = EXCLUDED.role,
         member_id = EXCLUDED.member_id,
         invite_token = EXCLUDED.invite_token,
         invite_expires_at = EXCLUDED.invite_expires_at`,
      [member.email, name, admin_role, member_id, inviteToken, inviteExpiresAt],
    )

    const appUrl = process.env.APP_URL ?? 'http://localhost:5173'
    const inviteLink = `${appUrl}/set-password?token=${inviteToken}`

    const { sendEmail } = await import('./_lib/email.js')
    await sendEmail({
      type: 'one_off',
      to: member.email,
      toName: name,
      subject: 'Set up your Shutterbug admin account',
      html: `<p>Hi ${member.first_name},</p>
<p>You've been granted access to the Shutterbug admin portal.</p>
<p><a href="${inviteLink}">Click here to set your password</a></p>
<p>This link expires in 7 days.</p>`,
      memberId: member_id,
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/auth/invite', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.post('/api/auth/set-password', async (req, res) => {
  const { token, password } = req.body ?? {}
  if (!token || !password) return void res.status(400).json({ error: 'token and password are required' })
  if (password.length < 8) return void res.status(400).json({ error: 'Password must be at least 8 characters' })

  try {
    const result = await getPool().query(
      `SELECT id FROM admin_users WHERE invite_token = $1 AND invite_expires_at > NOW()`,
      [token],
    )
    if (!result.rows.length) return void res.status(400).json({ error: 'Invalid or expired invite link' })

    const hash = await bcrypt.hash(password, 12)
    await getPool().query(
      `UPDATE admin_users SET password_hash = $1, invite_token = NULL, invite_expires_at = NULL WHERE id = $2`,
      [hash, result.rows[0].id],
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/auth/set-password', err)
    res.status(500).json({ error: (err as Error).message })
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

// ── Email template routes ──────────────────────────────────────────────────────

app.get('/api/email-templates', async (req, res) => {
  if (!requireAuth(req, res)) return
  try {
    const result = await getPool().query(
      `SELECT key, name, description, subject_template, body_html, updated_at FROM email_templates ORDER BY key`,
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

app.patch('/api/email-templates/:key', async (req, res) => {
  if (!requireAuth(req, res)) return
  const auth = req.headers.authorization!
  const payload = jwt.verify(auth.slice(7), JWT_SECRET()) as { sub: string; role: string }
  const allowedRoles = ['super_admin', 'president', 'competition_secretary']
  if (!allowedRoles.includes(payload.role)) {
    return void res.status(403).json({ error: 'Insufficient permissions to edit email templates' })
  }

  const { subject_template, body_html } = req.body ?? {}
  if (!subject_template?.trim()) return void res.status(400).json({ error: 'subject_template is required' })
  if (!body_html?.trim()) return void res.status(400).json({ error: 'body_html is required' })

  try {
    const result = await getPool().query(
      `UPDATE email_templates
       SET subject_template = $1, body_html = $2, updated_at = NOW(), updated_by_id = $3
       WHERE key = $4
       RETURNING key, name, description, subject_template, body_html, updated_at`,
      [subject_template.trim(), body_html.trim(), payload.sub, req.params.key],
    )
    if (result.rows.length === 0) return void res.status(404).json({ error: 'Template not found' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
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

app.delete('/api/competitions/:id', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  const { id } = req.params
  try {
    await getPool().query(`DELETE FROM member_points  WHERE competition_id = $1`, [id])
    await getPool().query(`DELETE FROM entries         WHERE competition_id = $1`, [id])
    await getPool().query(`UPDATE email_log SET token_id = NULL WHERE token_id IN (SELECT id FROM tokens WHERE competition_id = $1)`, [id])
    await getPool().query(`UPDATE email_log SET competition_id = NULL WHERE competition_id = $1`, [id])
    await getPool().query(`DELETE FROM tokens          WHERE competition_id = $1`, [id])
    await getPool().query(`DELETE FROM competition_judges WHERE competition_id = $1`, [id])
    const result = await getPool().query(`DELETE FROM competitions WHERE id = $1 RETURNING id`, [id])
    if (!result.rows.length) return void res.status(404).json({ error: 'Competition not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/competitions/:id', err)
    res.status(500).json({ error: (err as Error).message })
  }
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

// ── Bulk entry download ───────────────────────────────────────────────────────

app.get('/api/competitions/:id/download-entries', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { id } = req.params
  const typeFilter = req.query.type as string | undefined

  try {
    const compRes = await getPool().query(`SELECT name FROM competitions WHERE id = $1`, [id])
    const comp = compRes.rows[0]
    if (!comp) return void res.status(404).json({ error: 'Competition not found' })

    const entriesRes = await getPool().query(
      typeFilter && typeFilter !== 'all'
        ? `SELECT title, type, drive_file_id FROM entries WHERE competition_id = $1 AND drive_file_id IS NOT NULL AND type = $2 ORDER BY type, title`
        : `SELECT title, type, drive_file_id FROM entries WHERE competition_id = $1 AND drive_file_id IS NOT NULL ORDER BY type, title`,
      typeFilter && typeFilter !== 'all' ? [id, typeFilter] : [id],
    )
    if (!entriesRes.rows.length) return void res.status(404).json({ error: 'No entries with images found' })

    // Download all files from Drive in parallel
    const files = await Promise.all(
      entriesRes.rows.map(async (e: { title: string; type: string; drive_file_id: string }, i: number) => {
        const buffer = await downloadFromDrive(e.drive_file_id)
        const safeName = e.title.replace(/[^a-z0-9_\-\.]/gi, '_')
        const filename = `${String(i + 1).padStart(3, '0')}_${e.type}_${safeName}.jpg`
        return { filename, buffer }
      }),
    )

    const zipName = `${comp.name.replace(/[^a-z0-9_\-]/gi, '_')}${typeFilter && typeFilter !== 'all' ? `_${typeFilter}` : ''}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`)

    const archive = archiver('zip', { zlib: { level: 1 } })
    archive.on('error', (err) => { console.error('Zip error', err) })
    archive.pipe(res)
    for (const { filename, buffer } of files) {
      archive.append(buffer, { name: filename })
    }
    await archive.finalize()
  } catch (err) {
    console.error('GET /api/competitions/:id/download-entries', err)
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message })
  }
})

// ── Bulk email ────────────────────────────────────────────────────────────────

app.post('/api/email/send-bulk', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { recipients, member_id, subject, body } = req.body ?? {}
  if (!subject?.trim()) return void res.status(400).json({ error: 'Subject is required' })
  if (!body?.trim()) return void res.status(400).json({ error: 'Body is required' })
  if (!['all_active', 'subs_unpaid', 'member'].includes(recipients)) {
    return void res.status(400).json({ error: 'recipients must be all_active, subs_unpaid, or member' })
  }

  try {
    let memberRows: { id: string; first_name: string; last_name: string; email: string }[] = []
    if (recipients === 'member') {
      if (!member_id) return void res.status(400).json({ error: 'member_id is required for single member send' })
      const r = await getPool().query(
        `SELECT id, first_name, last_name, email FROM members WHERE id = $1 AND email NOT LIKE '%@privacy.wcc.local'`,
        [member_id],
      )
      memberRows = r.rows
    } else {
      const condition = recipients === 'subs_unpaid' ? `AND subs_paid = false` : ``
      const r = await getPool().query(
        `SELECT id, first_name, last_name, email FROM members
         WHERE status = 'active' AND email NOT LIKE '%@privacy.wcc.local' ${condition}
         ORDER BY last_name, first_name`,
      )
      memberRows = r.rows
    }

    if (!memberRows.length) return void res.status(400).json({ error: 'No matching members found' })

    const htmlBody = body.split(/\n\n+/).filter(Boolean)
      .map((p: string) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n')
    const html = `${htmlBody}\n<p>—<br>Wairarapa Camera Club</p>`

    let sent = 0, skipped = 0
    for (const m of memberRows) {
      try {
        await sendEmail({ type: 'one_off', to: m.email, toName: `${m.first_name} ${m.last_name}`, subject: subject.trim(), html, memberId: m.id })
        sent++
      } catch { skipped++ }
    }
    res.json({ sent, skipped })
  } catch (err) {
    console.error('POST /api/email/send-bulk', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── Subs reminder ─────────────────────────────────────────────────────────────

app.post('/api/email/subs-reminder', async (req, res) => {
  // Allow both JWT auth (manual trigger) and cron secret (scheduled trigger)
  const cronSecret = process.env.CRON_SECRET
  const cronHeader = req.headers['x-cron-secret']
  const isCron = cronSecret && cronHeader === cronSecret
  if (!isCron && !requireAuth(req, res)) return

  const reminderNumber: 1 | 2 = req.body?.type === 'second' ? 2 : 1

  try {
    const membersRes = await getPool().query(
      `SELECT id, first_name, last_name, email, annual_sub_amount FROM members
       WHERE status = 'active' AND subs_paid = false AND email NOT LIKE '%@privacy.wcc.local'
       ORDER BY last_name, first_name`,
    )

    let sent = 0, skipped = 0
    for (const m of membersRes.rows) {
      try {
        const { subject, html } = subsReminderEmail({
          memberName: `${m.first_name} ${m.last_name}`,
          amountDue: m.annual_sub_amount,
          reminderNumber,
        })
        await sendEmail({ type: 'subs_reminder', to: m.email, toName: `${m.first_name} ${m.last_name}`, subject, html, memberId: m.id })
        sent++
      } catch { skipped++ }
    }
    res.json({ sent, skipped })
  } catch (err) {
    console.error('POST /api/email/subs-reminder', err)
    res.status(500).json({ error: (err as Error).message })
  }
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
  const { name, email, bio, address, rating, is_available = true, website, facebook, instagram } = req.body ?? {}
  if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  const result = await getPool().query(
    `INSERT INTO judges (name,email,bio,address,rating,is_available,website,facebook,instagram) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [name.trim(), email.trim().toLowerCase(), bio?.trim() || null, address?.trim() || null,
     rating != null && rating !== '' ? parseFloat(rating) : null, is_available,
     website?.trim() || null, facebook?.trim() || null, instagram?.trim() || null],
  )
  res.status(201).json({ id: result.rows[0].id })
})

app.patch('/api/judges/:id', async (req, res) => {
  if (!requireAuth(req, res)) return
  const { name, email, bio, address, rating, is_available, website, facebook, instagram } = req.body ?? {}
  if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
  if (!email?.trim()) return void res.status(400).json({ error: 'Email is required' })
  const result = await getPool().query(
    `UPDATE judges SET name=$1,email=$2,bio=$3,address=$4,rating=$5,is_available=$6,
     website=$7,facebook=$8,instagram=$9 WHERE id=$10 RETURNING id`,
    [name.trim(), email.trim().toLowerCase(), bio?.trim() || null, address?.trim() || null,
     rating != null && rating !== '' ? parseFloat(rating) : null, is_available ?? true,
     website?.trim() || null, facebook?.trim() || null, instagram?.trim() || null,
     req.params.id],
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

// ── Settings routes (super_admin only) ────────────────────────────────────────

function requireSuperAdmin(req: express.Request, res: express.Response): boolean {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return false }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET()) as { role: string }
    if (payload.role !== 'super_admin') { res.status(403).json({ error: 'Forbidden' }); return false }
    return true
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return false
  }
}

app.get('/api/settings', async (req, res) => {
  if (!requireAuth(req, res)) return
  const section = req.query.section as string | undefined
  const result = section
    ? await getPool().query(`SELECT key, section, label, value, default_value, description FROM settings WHERE section = $1 ORDER BY key`, [section])
    : await getPool().query(`SELECT key, section, label, value, default_value, description FROM settings ORDER BY section, key`)
  res.json(result.rows)
})

app.patch('/api/settings', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  const updates = req.body as Record<string, string | null>
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return void res.status(400).json({ error: 'Body must be an object of { key: value }' })
  }
  const entries = Object.entries(updates)
  if (entries.length === 0) return void res.json({ ok: true })
  for (const [key, value] of entries) {
    await getPool().query(
      `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2`,
      [value, key],
    )
  }
  res.json({ ok: true })
})

// ── Committee routes ──────────────────────────────────────────────────────────

app.get('/api/committee/roles', async (req, res) => {
  if (!requireAuth(req, res)) return
  try {
    const result = await getPool().query(
      `SELECT id, name, is_officer, sort_order FROM committee_roles ORDER BY sort_order, name`
    )
    res.json(result.rows)
  } catch (err) {
    console.error('GET /api/committee/roles', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.post('/api/committee/roles', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  try {
    const { name } = req.body ?? {}
    if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
    const result = await getPool().query(
      `INSERT INTO committee_roles (name) VALUES ($1) RETURNING id, name, is_officer, sort_order`,
      [name.trim()],
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('POST /api/committee/roles', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.delete('/api/committee/roles/:id', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  try {
    await getPool().query(`DELETE FROM committee_roles WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/committee/roles/:id', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.get('/api/committee/members', async (req, res) => {
  if (!requireAuth(req, res)) return
  try {
    const result = await getPool().query(`
      SELECT cm.id, cm.starts_at, cm.ends_at, cm.notes, cm.member_id,
             m.first_name, m.last_name, m.email, m.membership_number,
             r.id AS role_id, r.name AS role_name, r.is_officer, r.sort_order,
             (au.id IS NOT NULL) AS has_login
      FROM committee_members cm
      JOIN committee_roles r ON r.id = cm.role_id
      LEFT JOIN members m ON m.id = cm.member_id
      LEFT JOIN admin_users au ON au.member_id = m.id
      ORDER BY cm.ends_at NULLS FIRST, r.sort_order, m.last_name
    `)
    res.json(result.rows)
  } catch (err) {
    console.error('GET /api/committee/members', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.post('/api/committee/members', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  try {
    const { member_id, role_id, starts_at, notes } = req.body ?? {}
    if (!role_id) return void res.status(400).json({ error: 'role_id is required' })
    if (!starts_at) return void res.status(400).json({ error: 'starts_at is required' })
    const result = await getPool().query(
      `INSERT INTO committee_members (member_id, role_id, starts_at, notes) VALUES ($1,$2,$3,$4) RETURNING id`,
      [member_id || null, role_id, starts_at, notes?.trim() || null],
    )
    res.status(201).json({ id: result.rows[0].id })
  } catch (err) {
    console.error('POST /api/committee/members', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.patch('/api/committee/members/:id', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  try {
    const { role_id, starts_at, ends_at, notes } = req.body ?? {}
    const result = await getPool().query(
      `UPDATE committee_members SET role_id=$1, starts_at=$2, ends_at=$3, notes=$4 WHERE id=$5 RETURNING id`,
      [role_id, starts_at, ends_at || null, notes?.trim() || null, req.params.id],
    )
    if (!result.rows.length) return void res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/committee/members/:id', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.delete('/api/committee/members/:id', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  try {
    await getPool().query(`DELETE FROM committee_members WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/committee/members/:id', err)
    res.status(500).json({ error: (err as Error).message })
  }
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

// Step 1: create a Drive resumable upload session; browser uploads directly
app.post('/api/submit/:token/entries/session', async (req, res) => {
  const { type, title } = req.body ?? {}
  if (!type || !['projim', 'printim'].includes(type)) return void res.status(400).json({ error: 'type must be projim or printim' })
  if (!title?.trim()) return void res.status(400).json({ error: 'Title is required' })

  const compRes = await getPool().query(
    `SELECT c.id, c.name, c.status, c.judging_closes_at, c.closes_at,
            c.max_projim_entries, c.max_printim_entries, m.membership_number,
            t.member_id, t.competition_id
     FROM competitions c
     JOIN tokens t ON t.competition_id = c.id
     JOIN members m ON m.id = t.member_id
     WHERE t.token = $1 AND t.type = 'submission' AND t.revoked_at IS NULL AND t.expires_at > NOW()`,
    [req.params.token],
  )
  const comp = compRes.rows[0]
  if (!comp) return void res.status(404).json({ error: 'Invalid or expired link' })
  if (comp.status !== 'open') return void res.status(400).json({ error: 'Competition is not open for submissions' })
  if (comp.closes_at && new Date(comp.closes_at) < new Date()) {
    return void res.status(400).json({ error: 'Competition submission window has closed' })
  }

  // Check entry limits before creating session
  const countRes = await getPool().query(
    `SELECT type, COUNT(*) AS cnt FROM entries WHERE competition_id = $1 AND member_id = $2 GROUP BY type`,
    [comp.competition_id, comp.member_id],
  )
  const counts = Object.fromEntries(countRes.rows.map((r: { type: string; cnt: string }) => [r.type, parseInt(r.cnt, 10)]))
  if (type === 'projim' && (counts.projim ?? 0) >= comp.max_projim_entries) {
    return void res.status(400).json({ error: `You can only submit ${comp.max_projim_entries} PROJIM entry per competition` })
  }
  if (type === 'printim' && (counts.printim ?? 0) >= comp.max_printim_entries) {
    return void res.status(400).json({ error: `You can only submit ${comp.max_printim_entries} PRINTIM entries per competition` })
  }

  try {
    const uploadUrl = await createDriveUploadSession({
      competitionName: comp.name,
      judgingClosesAt: comp.judging_closes_at,
    })
    if (!uploadUrl) return void res.status(503).json({ error: 'Drive not configured' })
    res.json({ uploadUrl })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create upload session' })
  }
})

// Step 3: download from Drive, process with Sharp, update Drive file, save DB entry
app.post('/api/submit/:token/entries/finalize', async (req, res) => {
  const { driveFileId, type, title } = req.body ?? {}
  if (!driveFileId) return void res.status(400).json({ error: 'driveFileId is required' })
  if (!type || !['projim', 'printim'].includes(type)) return void res.status(400).json({ error: 'type must be projim or printim' })
  if (!title?.trim()) return void res.status(400).json({ error: 'Title is required' })

  const compRes = await getPool().query(
    `SELECT c.name, c.judging_closes_at, m.membership_number
     FROM competitions c
     JOIN tokens t ON t.competition_id = c.id
     JOIN members m ON m.id = t.member_id
     WHERE t.token = $1 AND t.type = 'submission' AND t.revoked_at IS NULL AND t.expires_at > NOW()`,
    [req.params.token],
  )
  const comp = compRes.rows[0]
  if (!comp) return void res.status(404).json({ error: 'Invalid or expired link' })

  try {
    const rawBuffer = await downloadFromDrive(driveFileId)
    const processedBuffer = await processImage(rawBuffer)
    const filename = buildEntryFilename({
      type,
      title,
      membershipNumber: comp.membership_number,
      originalFilename: 'upload.jpg',
    })
    const { driveFileUrl, driveThumbnailUrl } = await processDriveFile({ driveFileId, filename, processedBuffer })

    const result = await createEntry({
      tokenValue: req.params.token,
      type,
      title,
      driveFileId,
      driveFileUrl,
      driveThumbnailUrl,
    })
    if ('error' in result) return void res.status(400).json(result)
    res.status(201).json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Finalize failed' })
  }
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

// Global error handler — catches any uncaught async throws from route handlers
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled route error', err)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

export default app
