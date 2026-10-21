/**
 * Judge availability round — an annual email to every judge on the list,
 * asking whether they want to stay on it and which of a season's unjudged
 * competitions they'd like to judge, in order of preference.
 *
 * Token type: judge_availability (per judge, per season), expiring at the
 * response deadline. After the deadline the page stays readable but writes
 * are refused.
 */
import { getPool } from './db.js'
import {
  sendEmail,
  sendPersonalisedJudgeRun,
  getEmailTemplate,
  applyTemplate,
  makeButton,
  htmlEsc,
  withSendCache,
  type RunJudge,
  type RunResult,
} from './email.js'
import type {
  AvailabilityCompetition,
  AvailabilityOverview,
  AvailabilityPageData,
  AvailabilitySubmitBody,
  JudgeAvailabilityResponse,
} from '../../src/types/judge-availability.js'

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173'
const RESPONSES: JudgeAvailabilityResponse[] = ['keen', 'not_this_year', 'remove']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Dates ───────────────────────────────────────────────────────────────────

/** "Sat 14 Mar 2027" in NZ time; "TBC" when missing. */
export function formatNzDate(d: string | Date | null | undefined): string {
  if (!d) return 'TBC'
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return 'TBC'
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Pacific/Auckland',
  })
}

/**
 * A deadline given as a date (YYYY-MM-DD) means the end of that day in NZ.
 * A full ISO datetime is used as-is.
 */
export function parseDeadline(val: unknown): Date | null {
  if (typeof val !== 'string' || !val.trim()) return null
  const v = val.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    // NZ offset on that date: midnight UTC reads as 12:00 (NZST) or 13:00 (NZDT) in Auckland.
    const probe = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
    const offsetHours = parseInt(
      new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: false }).format(probe),
      10,
    )
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - offsetHours * 3600_000)
  }
  const parsed = new Date(v)
  return isNaN(parsed.getTime()) ? null : parsed
}

// ── Lookups ─────────────────────────────────────────────────────────────────

interface SeasonRow { id: string; year: number }
interface JudgeRow { id: string; name: string; email: string; is_available: boolean; archived_at: string | null }
interface TokenRow { id: string; token: string; judge_id: string; season_id: string; expires_at: string | null; created_at: string }

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

async function getSeason(seasonId: string): Promise<SeasonRow | null> {
  if (!UUID_RE.test(seasonId)) return null
  const res = await getPool().query<SeasonRow>(`SELECT id, year FROM seasons WHERE id = $1`, [seasonId])
  return res.rows[0] ?? null
}

async function getJudge(judgeId: string): Promise<JudgeRow | null> {
  if (!UUID_RE.test(judgeId)) return null
  const res = await getPool().query<JudgeRow>(
    `SELECT id, name, email, is_available, archived_at FROM judges WHERE id = $1`, [judgeId],
  )
  return res.rows[0] ?? null
}

const COMP_ORDER = `COALESCE(c.closes_at, c.judging_closes_at, c.opens_at) ASC NULLS LAST, c.name`

interface CompRow {
  id: string; name: string; description: string | null; event_type: string
  closes_at: Date | null; judging_closes_at: Date | null; filled: boolean
}

function toCompetition(r: CompRow): AvailabilityCompetition {
  return {
    id: r.id,
    name: r.name,
    description: r.description && r.description.replace(/<[^>]+>/g, '').trim() ? r.description : null,
    eventType: r.event_type,
    closesAt: r.closes_at ? new Date(r.closes_at).toISOString() : null,
    judgingClosesAt: r.judging_closes_at ? new Date(r.judging_closes_at).toISOString() : null,
    filled: r.filled,
  }
}

/**
 * Competitions in the season with no judge assigned, plus any extra ids
 * (a judge's earlier picks that have since been filled, so they show greyed
 * out rather than vanishing).
 */
export async function getEligibleCompetitions(seasonId: string, includeIds: string[] = []): Promise<AvailabilityCompetition[]> {
  const res = await getPool().query<CompRow>(
    `SELECT c.id, c.name, c.description, c.event_type, c.closes_at, c.judging_closes_at,
            EXISTS (SELECT 1 FROM competition_judges cj WHERE cj.competition_id = c.id) AS filled
     FROM competitions c
     WHERE c.season_id = $1
       AND (NOT EXISTS (SELECT 1 FROM competition_judges cj WHERE cj.competition_id = c.id)
            OR c.id = ANY($2::uuid[]))
     ORDER BY ${COMP_ORDER}`,
    [seasonId, includeIds],
  )
  return res.rows.map(toCompetition)
}

/** Everyone on the judges list: not archived, available or not. */
async function getRecipientJudges(): Promise<JudgeRow[]> {
  const res = await getPool().query<JudgeRow>(
    `SELECT id, name, email, is_available, archived_at FROM judges WHERE archived_at IS NULL ORDER BY name`,
  )
  return res.rows
}

async function getSeasonTokens(seasonId: string): Promise<TokenRow[]> {
  const res = await getPool().query<TokenRow>(
    `SELECT id, token, judge_id, season_id, expires_at, created_at FROM tokens
     WHERE type = 'judge_availability' AND season_id = $1 AND revoked_at IS NULL`,
    [seasonId],
  )
  return res.rows
}

/** Reuses the judge's existing link for the season (so old emails keep working) and moves its expiry to the deadline. */
export async function upsertAvailabilityToken(judgeId: string, seasonId: string, deadline: Date): Promise<TokenRow> {
  const pool = getPool()
  const existing = await pool.query<TokenRow>(
    `UPDATE tokens SET expires_at = $3
     WHERE type = 'judge_availability' AND judge_id = $1 AND season_id = $2 AND revoked_at IS NULL
     RETURNING id, token, judge_id, season_id, expires_at, created_at`,
    [judgeId, seasonId, deadline],
  )
  if (existing.rows[0]) return existing.rows[0]
  const res = await pool.query<TokenRow>(
    `INSERT INTO tokens (type, judge_id, season_id, expires_at)
     VALUES ('judge_availability', $1, $2, $3)
     RETURNING id, token, judge_id, season_id, expires_at, created_at`,
    [judgeId, seasonId, deadline],
  )
  return res.rows[0]
}

/** Finds a link by its value. Expired links are still returned (read-only); revoked ones aren't. */
async function findToken(tokenValue: string): Promise<(TokenRow & { expired: boolean }) | null> {
  if (!UUID_RE.test(tokenValue)) return null
  const res = await getPool().query<TokenRow & { expired: boolean }>(
    `SELECT id, token, judge_id, season_id, expires_at, created_at,
            (expires_at IS NOT NULL AND expires_at <= NOW()) AS expired
     FROM tokens
     WHERE token = $1 AND type = 'judge_availability' AND revoked_at IS NULL
     LIMIT 1`,
    [tokenValue],
  )
  return res.rows[0] ?? null
}

async function getResponse(judgeId: string, seasonId: string) {
  const res = await getPool().query<{ id: string; response: JudgeAvailabilityResponse; updated_at: string }>(
    `SELECT id, response, updated_at FROM judge_availability_responses WHERE judge_id = $1 AND season_id = $2`,
    [judgeId, seasonId],
  )
  const row = res.rows[0]
  if (!row) return null
  const prefs = await getPool().query<{ competition_id: string }>(
    `SELECT competition_id FROM judge_competition_preferences WHERE response_id = $1 ORDER BY rank`,
    [row.id],
  )
  return { ...row, preferences: prefs.rows.map(p => p.competition_id) }
}

// ── Public page ─────────────────────────────────────────────────────────────

export async function getAvailabilityPageData(tokenValue: string): Promise<AvailabilityPageData | null> {
  const token = await findToken(tokenValue)
  if (!token) return null

  const [judge, season, current] = await Promise.all([
    getJudge(token.judge_id),
    getSeason(token.season_id),
    getResponse(token.judge_id, token.season_id),
  ])
  if (!judge || !season) return null

  const competitions = await getEligibleCompetitions(season.id, current?.preferences ?? [])

  return {
    judge: { firstName: firstName(judge.name), name: judge.name, isAvailable: judge.is_available, archived: !!judge.archived_at },
    season: { id: season.id, year: season.year },
    deadline: token.expires_at ? new Date(token.expires_at).toISOString() : null,
    readOnly: token.expired,
    competitions,
    current: {
      response: current?.response ?? null,
      preferences: current?.preferences ?? [],
      respondedAt: current?.updated_at ? new Date(current.updated_at).toISOString() : null,
    },
  }
}

export type SaveResult =
  | { ok: true; data: AvailabilityPageData }
  | { ok: false; status: number; error: string }

export async function saveAvailabilityResponse(tokenValue: string, body: unknown): Promise<SaveResult> {
  const token = await findToken(tokenValue)
  if (!token) return { ok: false, status: 404, error: 'This link isn’t valid.' }
  if (token.expired) return { ok: false, status: 410, error: 'Responses have closed.' }

  // ── Validate body ──
  const b = (body ?? {}) as Partial<AvailabilitySubmitBody>
  const response = b.response
  if (!response || !RESPONSES.includes(response)) return { ok: false, status: 400, error: 'Choose one of the three options.' }
  const requested = Array.isArray(b.preferences) ? b.preferences.filter((x): x is string => typeof x === 'string') : []
  if (new Set(requested).size !== requested.length) return { ok: false, status: 400, error: 'Each competition can only be picked once.' }
  if (response !== 'keen' && requested.length > 0) return { ok: false, status: 400, error: 'Preferences only apply when you’d like to judge.' }
  if (response === 'keen' && requested.length === 0) return { ok: false, status: 400, error: 'Select at least one competition.' }

  const pool = getPool()
  const season = await getSeason(token.season_id)
  if (!season) return { ok: false, status: 404, error: 'Season not found.' }

  // Only competitions in this season that still have no judge. Anything filled
  // since the judge loaded the page is silently dropped.
  let preferences: string[] = []
  if (response === 'keen') {
    const open = await pool.query<{ id: string }>(
      `SELECT c.id FROM competitions c
       WHERE c.id = ANY($1::uuid[]) AND c.season_id = $2
         AND NOT EXISTS (SELECT 1 FROM competition_judges cj WHERE cj.competition_id = c.id)`,
      [requested.filter(id => UUID_RE.test(id)), season.id],
    )
    const openIds = new Set(open.rows.map(r => r.id))
    preferences = requested.filter(id => openIds.has(id))
    if (preferences.length === 0) return { ok: false, status: 409, error: 'all_selected_filled' }
  }

  // ── Save (one transaction) ──
  const client = await pool.connect()
  let previous: JudgeAvailabilityResponse | null = null
  try {
    await client.query('BEGIN')
    const prev = await client.query<{ response: JudgeAvailabilityResponse }>(
      `SELECT response FROM judge_availability_responses WHERE judge_id = $1 AND season_id = $2 FOR UPDATE`,
      [token.judge_id, season.id],
    )
    previous = prev.rows[0]?.response ?? null

    const saved = await client.query<{ id: string }>(
      `INSERT INTO judge_availability_responses (judge_id, season_id, response)
       VALUES ($1, $2, $3)
       ON CONFLICT (judge_id, season_id)
       DO UPDATE SET response = EXCLUDED.response, updated_at = NOW()
       RETURNING id`,
      [token.judge_id, season.id, response],
    )
    const responseId = saved.rows[0].id

    await client.query(`DELETE FROM judge_competition_preferences WHERE response_id = $1`, [responseId])
    if (preferences.length > 0) {
      await client.query(
        `INSERT INTO judge_competition_preferences (response_id, competition_id, rank)
         SELECT $1, t.competition_id, t.rank::int
         FROM unnest($2::uuid[]) WITH ORDINALITY AS t(competition_id, rank)`,
        [responseId, preferences],
      )
    }

    if (response === 'remove') {
      await client.query(
        `UPDATE judges SET archived_at = COALESCE(archived_at, NOW()), archived_reason = $2 WHERE id = $1`,
        [token.judge_id, `Asked to be removed via the ${season.year} availability form`],
      )
    } else {
      // Staying on the list (this year or future years) → available, and un-archived.
      await client.query(
        `UPDATE judges SET is_available = TRUE, archived_at = NULL, archived_reason = NULL WHERE id = $1`,
        [token.judge_id],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  const data = await getAvailabilityPageData(tokenValue)
  const judge = await getJudge(token.judge_id)
  if (!data || !judge) return { ok: false, status: 404, error: 'This link isn’t valid.' }

  // ── Emails (after commit; a failed send never undoes the save) ──
  try {
    const { subject, html } = await confirmationEmail({ judge, season, data, token: token.token })
    await sendEmail({
      type: 'judge_availability_confirmation',
      to: judge.email,
      toName: judge.name,
      subject,
      html,
      judgeId: judge.id,
      tokenId: token.id,
    })
  } catch (err) {
    console.error('judge availability confirmation failed', err)
  }

  if (response === 'remove' && previous !== 'remove') {
    try {
      await sendAdminRemovalNotice({ judge, season, deadline: data.deadline })
    } catch (err) {
      console.error('judge availability admin notice failed', err)
    }
  }

  return { ok: true, data }
}

// ── Emails ──────────────────────────────────────────────────────────────────

function competitionListHtml(comps: AvailabilityCompetition[]): string {
  if (comps.length === 0) return '<p><em>All of this season’s competitions currently have a judge.</em></p>'
  const blocks = comps.map(c => {
    const dates = [
      c.closesAt ? `Entries close <strong>${formatNzDate(c.closesAt)}</strong>` : null,
      `Judging / club night <strong>${formatNzDate(c.judgingClosesAt)}</strong>`,
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')
    const desc = c.description
      ? `<div style="margin-top:6px;font-size:13px;color:#4b5563">${c.description}</div>`
      : ''
    return `<div style="margin:0 0 12px;padding:12px 14px;border:1px solid #e5e7eb;border-left:3px solid #b45309;border-radius:6px">
<div style="font-weight:bold;color:#111827">${htmlEsc(c.name)}</div>
<div style="margin-top:4px;font-size:13px;color:#6b7280">${dates}</div>
${desc}
</div>`
  }).join('\n')
  return `<div style="margin:16px 0">${blocks}</div>`
}

async function inviteEmail(opts: {
  kind: 'invite' | 'reminder'
  judge: JudgeRow
  season: SeasonRow
  deadline: Date
  token: string
  comps: AvailabilityCompetition[]
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl()}/judge-availability/${opts.token}`
  const vars = {
    judge_name: opts.judge.name,
    first_name: firstName(opts.judge.name),
    season_year: String(opts.season.year),
    current_status: opts.judge.is_available ? 'Available' : 'Unavailable',
    deadline_date: formatNzDate(opts.deadline),
    response_link: makeButton(link, 'Respond here'),
    response_url: link,
    competition_list: competitionListHtml(opts.comps),
  }
  const key = opts.kind === 'invite' ? 'judge_availability_invite' : 'judge_availability_reminder'
  const tmpl = await getEmailTemplate(key)
  if (tmpl) return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }

  const opener = opts.kind === 'reminder'
    ? `<p>Just a quick reminder – we haven't heard back from you yet about judging for our ${vars.season_year} season.</p>`
    : `<p>You're on the Wairarapa Camera Club's list of judges – thank you for being part of it.</p>`
  return {
    subject: opts.kind === 'invite'
      ? `Wairarapa Camera Club – judging for the ${vars.season_year} season`
      : `Reminder: judging for the ${vars.season_year} season`,
    html: `<p>Kia ora ${htmlEsc(vars.first_name)},</p>
${opener}
<p>We currently have you listed as <strong>${vars.current_status}</strong>.</p>
<p>This email is twofold:</p>
<ol>
<li><strong>Would you like to stay on our judges list?</strong></li>
<li><strong>Which, if any, of our ${vars.season_year} competitions would you be interested in judging?</strong></li>
</ol>
<p>Please let us know by <strong>${vars.deadline_date}</strong> using your personal link:</p>
<p>${vars.response_link}</p>
${vars.competition_list}
<p>You can come back to the link and change your response any time before ${vars.deadline_date}.</p>
<p>Ngā mihi,<br>Wairarapa Camera Club</p>`,
  }
}

async function confirmationEmail(opts: {
  judge: JudgeRow
  season: SeasonRow
  data: AvailabilityPageData
  token: string
}): Promise<{ subject: string; html: string }> {
  const link = `${appUrl()}/judge-availability/${opts.token}`
  const { response, preferences } = opts.data.current
  const byId = new Map(opts.data.competitions.map(c => [c.id, c]))

  let summary: string
  if (response === 'keen') {
    const items = preferences
      .map(id => byId.get(id))
      .filter((c): c is AvailabilityCompetition => !!c)
      .map(c => `<li><strong>${htmlEsc(c.name)}</strong> – ${c.closesAt ? `entries close ${formatNzDate(c.closesAt)}, ` : ''}judging / club night ${formatNzDate(c.judgingClosesAt)}</li>`)
      .join('')
    summary = `<p>Thanks! You'd like to judge the following, in order of preference:</p><ol>${items}</ol><p>We'll be in touch to confirm.</p>`
  } else if (response === 'not_this_year') {
    summary = `<p>Thanks for letting us know. We'll keep you on our judges list and be in touch next year.</p>`
  } else {
    summary = `<p>We've removed you from our judges list. Thank you for everything you've done for the club.</p>`
  }

  const vars = {
    judge_name: opts.judge.name,
    first_name: firstName(opts.judge.name),
    season_year: String(opts.season.year),
    deadline_date: formatNzDate(opts.data.deadline),
    response_summary: summary,
    response_link: makeButton(link, 'Update my response'),
    response_url: link,
  }
  const tmpl = await getEmailTemplate('judge_availability_confirmation')
  if (tmpl) return { subject: applyTemplate(tmpl.subject_template, vars), html: applyTemplate(tmpl.body_html, vars) }
  return {
    subject: `Thanks – your judging response for ${vars.season_year}`,
    html: `<p>Kia ora ${htmlEsc(vars.first_name)},</p>
${summary}
<p>Changed your mind? You can update your response any time before <strong>${vars.deadline_date}</strong>:</p>
<p>${vars.response_link}</p>
<p>Ngā mihi,<br>Wairarapa Camera Club</p>`,
  }
}

async function sendAdminRemovalNotice(opts: { judge: JudgeRow; season: SeasonRow; deadline: string | null }) {
  const admins = await getPool().query<{ email: string; name: string }>(
    `SELECT email, name FROM admin_users WHERE role IN ('super_admin', 'competition_secretary') ORDER BY name`,
  )
  if (admins.rows.length === 0) return

  const vars = {
    judge_name: opts.judge.name,
    judge_email: opts.judge.email,
    season_year: String(opts.season.year),
    deadline_date: formatNzDate(opts.deadline),
    judges_link: makeButton(`${appUrl()}/judges`, 'Open Judges'),
  }
  const tmpl = await getEmailTemplate('judge_availability_admin_notice')
  const subject = tmpl ? applyTemplate(tmpl.subject_template, vars) : `Judge removed themselves: ${vars.judge_name}`
  const html = tmpl
    ? applyTemplate(tmpl.body_html, vars)
    : `<p><strong>${htmlEsc(vars.judge_name)}</strong> (${htmlEsc(vars.judge_email)}) has asked to be removed from the judges list in response to the ${vars.season_year} availability request.</p>
<p>They've been archived in Shutterbug. They can undo this using their link until ${vars.deadline_date}.</p>
<p>${vars.judges_link}</p>`

  await withSendCache(async () => {
    for (const a of admins.rows) {
      await sendEmail({ type: 'judge_availability_admin_notice', to: a.email, toName: a.name, subject, html, judgeId: opts.judge.id })
    }
  })
}

// ── Admin actions ───────────────────────────────────────────────────────────

export class AvailabilityError extends Error {
  status: number
  extra?: Record<string, unknown>
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export async function getAvailabilityOverview(seasonId: string): Promise<AvailabilityOverview> {
  const season = await getSeason(seasonId)
  if (!season) throw new AvailabilityError(404, 'Season not found')
  const pool = getPool()

  const [compRes, judgeRes, tokens, respRes] = await Promise.all([
    pool.query<CompRow & { assigned: Array<{ id: string; name: string }> }>(
      `SELECT c.id, c.name, c.description, c.event_type, c.closes_at, c.judging_closes_at,
              EXISTS (SELECT 1 FROM competition_judges cj WHERE cj.competition_id = c.id) AS filled,
              COALESCE((
                SELECT json_agg(json_build_object('id', j.id, 'name', j.name) ORDER BY j.name)
                FROM competition_judges cj JOIN judges j ON j.id = cj.judge_id
                WHERE cj.competition_id = c.id
              ), '[]'::json) AS assigned
       FROM competitions c WHERE c.season_id = $1
       ORDER BY ${COMP_ORDER}`,
      [seasonId],
    ),
    // Everyone on the list, plus archived judges who responded this season (so removals show up).
    pool.query<JudgeRow>(
      `SELECT j.id, j.name, j.email, j.is_available, j.archived_at FROM judges j
       WHERE j.archived_at IS NULL
          OR EXISTS (SELECT 1 FROM judge_availability_responses r WHERE r.judge_id = j.id AND r.season_id = $1)
       ORDER BY j.name`,
      [seasonId],
    ),
    getSeasonTokens(seasonId),
    pool.query<{ id: string; judge_id: string; response: JudgeAvailabilityResponse; updated_at: string; prefs: string[] | null }>(
      `SELECT r.id, r.judge_id, r.response, r.updated_at,
              (SELECT array_agg(p.competition_id ORDER BY p.rank) FROM judge_competition_preferences p WHERE p.response_id = r.id) AS prefs
       FROM judge_availability_responses r WHERE r.season_id = $1`,
      [seasonId],
    ),
  ])

  const tokenByJudge = new Map(tokens.map(t => [t.judge_id, t]))
  const respByJudge = new Map(respRes.rows.map(r => [r.judge_id, r]))
  const sentAt = tokens.length ? Math.min(...tokens.map(t => new Date(t.created_at).getTime())) : null
  const deadline = tokens.length ? Math.max(...tokens.map(t => (t.expires_at ? new Date(t.expires_at).getTime() : 0))) : null

  const competitions = compRes.rows.map(r => ({ ...toCompetition(r), assignedJudges: r.assigned }))

  return {
    season,
    sentAt: sentAt ? new Date(sentAt).toISOString() : null,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    eligibleCount: competitions.filter(c => !c.filled).length,
    competitions,
    judges: judgeRes.rows.map(j => {
      const r = respByJudge.get(j.id)
      return {
        id: j.id,
        name: j.name,
        email: j.email,
        isAvailable: j.is_available,
        archivedAt: j.archived_at ? new Date(j.archived_at).toISOString() : null,
        token: tokenByJudge.get(j.id)?.token ?? null,
        response: r?.response ?? null,
        respondedAt: r ? new Date(r.updated_at).toISOString() : null,
        preferences: r?.prefs ?? [],
      }
    }),
  }
}

/**
 * Sends the invite to the chosen judges on the list (archived judges are never sent to).
 * Refuses a second send for the season unless forced.
 */
export async function sendAvailabilityInvites(seasonId: string, deadlineInput: unknown, force: boolean, judgeIdsInput: unknown): Promise<RunResult> {
  const season = await getSeason(seasonId)
  if (!season) throw new AvailabilityError(404, 'Season not found')
  const deadline = parseDeadline(deadlineInput)
  if (!deadline) throw new AvailabilityError(400, 'A response deadline is required')
  if (deadline.getTime() <= Date.now()) throw new AvailabilityError(400, 'The deadline must be in the future')
  if (!Array.isArray(judgeIdsInput) || !judgeIdsInput.every(id => typeof id === 'string')) {
    throw new AvailabilityError(400, 'judgeIds must be a list of judge ids')
  }
  const selected = new Set(judgeIdsInput as string[])
  if (selected.size === 0) throw new AvailabilityError(400, 'Select at least one judge')

  const existing = await getSeasonTokens(seasonId)
  if (existing.length > 0 && !force) {
    const sentAt = new Date(Math.min(...existing.map(t => new Date(t.created_at).getTime()))).toISOString()
    throw new AvailabilityError(409, 'already_sent', { sentAt })
  }

  const comps = await getEligibleCompetitions(seasonId)
  if (comps.length === 0) throw new AvailabilityError(400, `Every ${season.year} competition already has a judge`)

  const judges = (await getRecipientJudges()).filter(j => selected.has(j.id))
  if (judges.length === 0) throw new AvailabilityError(400, 'None of the selected judges are on the list')
  const byId = new Map(judges.map(j => [j.id, j]))
  return sendPersonalisedJudgeRun({
    type: 'judge_availability_invite',
    subject: `Judge availability — ${season.year}`,
    judges: judges.map(toRunJudge),
    build: async (rj) => {
      const token = await upsertAvailabilityToken(rj.id, seasonId, deadline)
      const email = await inviteEmail({ kind: 'invite', judge: byId.get(rj.id)!, season, deadline, token: token.token, comps })
      return { ...email, tokenId: token.id }
    },
  })
}

/** Reminds judges on the list who were sent a link and haven't responded. */
export async function sendAvailabilityReminders(seasonId: string): Promise<RunResult> {
  const season = await getSeason(seasonId)
  if (!season) throw new AvailabilityError(404, 'Season not found')

  const tokens = await getSeasonTokens(seasonId)
  if (tokens.length === 0) throw new AvailabilityError(400, 'No availability request has been sent for this season yet')
  const live = tokens.filter(t => !t.expires_at || new Date(t.expires_at).getTime() > Date.now())
  if (live.length === 0) throw new AvailabilityError(400, 'The response deadline has passed — extend it first')

  const res = await getPool().query<JudgeRow>(
    `SELECT j.id, j.name, j.email, j.is_available, j.archived_at FROM judges j
     WHERE j.archived_at IS NULL
       AND j.id = ANY($2::uuid[])
       AND NOT EXISTS (SELECT 1 FROM judge_availability_responses r WHERE r.judge_id = j.id AND r.season_id = $1)
     ORDER BY j.name`,
    [seasonId, live.map(t => t.judge_id)],
  )
  if (res.rows.length === 0) return { sent: 0, skipped: 0, errors: [] }

  const comps = await getEligibleCompetitions(seasonId)
  const tokenByJudge = new Map(live.map(t => [t.judge_id, t]))
  const byId = new Map(res.rows.map(j => [j.id, j]))
  return sendPersonalisedJudgeRun({
    type: 'judge_availability_reminder',
    subject: `Judge availability reminder — ${season.year}`,
    judges: res.rows.map(toRunJudge),
    build: async (rj) => {
      const token = tokenByJudge.get(rj.id)!
      const deadline = token.expires_at ? new Date(token.expires_at) : new Date()
      const email = await inviteEmail({ kind: 'reminder', judge: byId.get(rj.id)!, season, deadline, token: token.token, comps })
      return { ...email, tokenId: token.id }
    },
  })
}

/** Resends the invite to one judge (e.g. one added after the round went out). Logged individually. */
export async function resendAvailabilityInvite(seasonId: string, judgeId: string, deadlineInput?: unknown): Promise<{ ok: true; error: string | null }> {
  const season = await getSeason(seasonId)
  if (!season) throw new AvailabilityError(404, 'Season not found')
  const judge = await getJudge(judgeId)
  if (!judge) throw new AvailabilityError(404, 'Judge not found')

  const tokens = await getSeasonTokens(seasonId)
  const own = tokens.find(t => t.judge_id === judgeId)
  // Keep the round's deadline unless a new one is given.
  const roundDeadline = tokens.length
    ? new Date(Math.max(...tokens.map(t => (t.expires_at ? new Date(t.expires_at).getTime() : 0))))
    : null
  const deadline = parseDeadline(deadlineInput) ?? (own?.expires_at ? new Date(own.expires_at) : roundDeadline)
  if (!deadline) throw new AvailabilityError(400, 'A response deadline is required')
  if (deadline.getTime() <= Date.now()) throw new AvailabilityError(400, 'The deadline has passed — extend it first')

  const token = await upsertAvailabilityToken(judgeId, seasonId, deadline)
  const comps = await getEligibleCompetitions(seasonId)
  const { subject, html } = await inviteEmail({ kind: 'invite', judge, season, deadline, token: token.token, comps })
  const error = await sendEmail({
    type: 'judge_availability_invite',
    to: judge.email,
    toName: judge.name,
    subject,
    html,
    judgeId: judge.id,
    tokenId: token.id,
  })
  return { ok: true, error }
}

/** Moves every link for the season to a new deadline. */
export async function updateAvailabilityDeadline(seasonId: string, deadlineInput: unknown): Promise<{ deadline: string; updated: number }> {
  if (!UUID_RE.test(seasonId)) throw new AvailabilityError(404, 'Season not found')
  const deadline = parseDeadline(deadlineInput)
  if (!deadline) throw new AvailabilityError(400, 'A valid deadline is required')
  const res = await getPool().query(
    `UPDATE tokens SET expires_at = $2
     WHERE type = 'judge_availability' AND season_id = $1 AND revoked_at IS NULL`,
    [seasonId, deadline],
  )
  return { deadline: deadline.toISOString(), updated: res.rowCount ?? 0 }
}

function toRunJudge(j: JudgeRow): RunJudge {
  return { id: j.id, name: j.name, email: j.email }
}
