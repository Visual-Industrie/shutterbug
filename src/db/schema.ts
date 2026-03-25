import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const membershipTypeEnum = pgEnum('membership_type', ['full', 'life', 'complimentary'])
export const experienceLevelEnum = pgEnum('experience_level', ['beginner', 'intermediate', 'advanced'])
export const applicantStatusEnum = pgEnum('applicant_status', ['pending', 'approved', 'rejected'])
export const eventTypeEnum = pgEnum('event_type', ['competition', 'award', 'other'])
export const entryTypeEnum = pgEnum('entry_type', ['projim', 'printim'])
// not_placed is implicit (NULL award); winner/shortlisted for non-points events
export const awardLevelEnum = pgEnum('award_level', ['honours', 'highly_commended', 'commended', 'accepted', 'winner', 'shortlisted'])
export const tokenTypeEnum = pgEnum('token_type', ['submission', 'judging', 'member_history'])
export const adminRoleEnum = pgEnum('admin_role', ['president', 'competition_secretary', 'treasurer', 'committee', 'super_admin'])
export const emailTypeEnum = pgEnum('email_type', [
  'submission_invite',
  'submission_reminder',
  'submission_confirmation',
  'judging_invite',
  'results_notification',
  'member_history_link',
  'subs_reminder',
  'one_off',
  'deadline_reminder',
])

// ─── Members ──────────────────────────────────────────────────────────────────

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  membershipNumber: text('membership_number').unique(),
  status: text('status').notNull().default('active'), // active | inactive | suspended
  membershipType: membershipTypeEnum('membership_type').notNull().default('full'),
  subStatus: text('sub_status').notNull().default('active'), // active | on_hold | cancelled
  experienceLevel: experienceLevelEnum('experience_level'),
  annualSubAmount: numeric('annual_sub_amount', { precision: 8, scale: 2 }),
  subsPaid: boolean('subs_paid').notNull().default(false),
  subsPaidDate: date('subs_paid_date'),
  subsPaidAmount: numeric('subs_paid_amount', { precision: 8, scale: 2 }),
  subsDueDate: date('subs_due_date'),
  paymentMethod: text('payment_method'),
  joinedDate: date('joined_date'),
  privacyActOk: boolean('privacy_act_ok').notNull().default(false),
  imageUseOk: boolean('image_use_ok').notNull().default(false),
  clubRulesOk: boolean('club_rules_ok').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Applicants ───────────────────────────────────────────────────────────────

export const applicants = pgTable('applicants', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  applicationDate: date('application_date').notNull().default(sql`CURRENT_DATE`),
  annualSubAmount: numeric('annual_sub_amount', { precision: 8, scale: 2 }),
  payByDate: date('pay_by_date'),
  status: applicantStatusEnum('status').notNull().default('pending'),
  privacyActOk: boolean('privacy_act_ok').notNull().default(false),
  imageUseOk: boolean('image_use_ok').notNull().default(false),
  clubRulesOk: boolean('club_rules_ok').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_applicants_status').on(t.status),
])

// ─── Seasons ──────────────────────────────────────────────────────────────────

export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  year: integer('year').notNull().unique(),
  startsAt: date('starts_at').notNull(),
  endsAt: date('ends_at').notNull(),
  isCurrentEventYear: boolean('is_current_event_year').notNull().default(false),
  isCurrentMembershipYear: boolean('is_current_membership_year').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Competitions / Events ────────────────────────────────────────────────────

export const competitions = pgTable('competitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: uuid('season_id').notNull().references(() => seasons.id),
  eventType: eventTypeEnum('event_type').notNull().default('competition'),
  name: text('name').notNull(),
  description: text('description'),
  opensAt: timestamp('opens_at', { withTimezone: true }),   // NULL for award/other events
  closesAt: timestamp('closes_at', { withTimezone: true }), // NULL for award/other events
  judgingOpensAt: timestamp('judging_opens_at', { withTimezone: true }),
  judgingClosesAt: timestamp('judging_closes_at', { withTimezone: true }),
  status: text('status').notNull().default('draft'), // draft|open|closed|judging|complete
  maxProjimEntries: integer('max_projim_entries').notNull().default(1),
  maxPrintimEntries: integer('max_printim_entries').notNull().default(2),
  pointsHonours: integer('points_honours').notNull().default(6),
  pointsHighlyCommended: integer('points_highly_commended').notNull().default(4),
  pointsCommended: integer('points_commended').notNull().default(2),
  pointsAccepted: integer('points_accepted').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Judges ───────────────────────────────────────────────────────────────────

export const judges = pgTable('judges', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  bio: text('bio'),
  address: text('address'),
  photoDriveUrl: text('photo_drive_url'),
  rating: numeric('rating', { precision: 2, scale: 1 }), // 1.0–5.0
  isAvailable: boolean('is_available').notNull().default(true),
  website: text('website'),
  facebook: text('facebook'),
  instagram: text('instagram'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const competitionJudges = pgTable('competition_judges', {
  id: uuid('id').primaryKey().defaultRandom(),
  competitionId: uuid('competition_id').notNull().references(() => competitions.id),
  judgeId: uuid('judge_id').notNull().references(() => judges.id),
}, (t) => [
  unique().on(t.competitionId, t.judgeId),
])

// ─── Tokens ───────────────────────────────────────────────────────────────────

export const tokens = pgTable('tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique().default(sql`gen_random_uuid()::text`),
  type: tokenTypeEnum('type').notNull(),
  memberId: uuid('member_id').references(() => members.id),
  judgeId: uuid('judge_id').references(() => judges.id),
  competitionId: uuid('competition_id').references(() => competitions.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tokens_token').on(t.token),
  index('idx_tokens_member').on(t.memberId),
  index('idx_tokens_judge').on(t.judgeId),
  check('token_has_valid_owner', sql`
    (type = 'submission' AND member_id IS NOT NULL AND competition_id IS NOT NULL) OR
    (type = 'judging'    AND judge_id  IS NOT NULL AND competition_id IS NOT NULL) OR
    (type = 'member_history' AND member_id IS NOT NULL)
  `),
])

// ─── Entries ──────────────────────────────────────────────────────────────────

export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  competitionId: uuid('competition_id').notNull().references(() => competitions.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  type: entryTypeEnum('type').notNull(),
  title: text('title').notNull(),
  driveFileId: text('drive_file_id'),
  driveFileUrl: text('drive_file_url'),
  driveThumbnailUrl: text('drive_thumbnail_url'),
  award: awardLevelEnum('award'), // NULL = not placed
  judgeComment: text('judge_comment'), // HTML from TipTap
  judgedAt: timestamp('judged_at', { withTimezone: true }),
  judgedBy: uuid('judged_by').references(() => judges.id),
  pointsAwarded: integer('points_awarded'), // snapshot at time of judging
  sortOrder: integer('sort_order'), // for judge reference view ordering
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_entries_competition').on(t.competitionId),
  index('idx_entries_member').on(t.memberId),
])

// ─── Points Ledger ────────────────────────────────────────────────────────────

export const memberPoints = pgTable('member_points', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id),
  seasonId: uuid('season_id').notNull().references(() => seasons.id),
  competitionId: uuid('competition_id').notNull().references(() => competitions.id),
  entryId: uuid('entry_id').notNull().references(() => entries.id),
  entryType: entryTypeEnum('entry_type').notNull(), // for PRINTIM/PROJIM leaderboard splits
  points: integer('points').notNull().default(0),
  awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.entryId),
  index('idx_member_points_member_season').on(t.memberId, t.seasonId),
])

// ─── Admin Users ──────────────────────────────────────────────────────────────

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: adminRoleEnum('role').notNull(),
  passwordHash: text('password_hash'),
  memberId: uuid('member_id').references(() => members.id),
  inviteToken: text('invite_token'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Payments ─────────────────────────────────────────────────────────────────

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  amount: numeric('amount', { precision: 8, scale: 2 }),
  paymentDate: date('payment_date').notNull().default(sql`CURRENT_DATE`),
  notes: text('notes'),
  recordedBy: uuid('recorded_by').references(() => adminUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_payments_member').on(t.memberId),
])

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  section: text('section').notNull(), // COMP | SUBS | CONFIG | EMAILROLE | ADMIN
  label: text('label').notNull(),
  value: text('value'),
  defaultValue: text('default_value'),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Email Templates ──────────────────────────────────────────────────────────

export const emailTemplates = pgTable('email_templates', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  subjectTemplate: text('subject_template').notNull(),
  bodyHtml: text('body_html').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedById: uuid('updated_by_id').references(() => adminUsers.id),
})

// ─── Email Log ────────────────────────────────────────────────────────────────

export const emailLog = pgTable('email_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: emailTypeEnum('type').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  recipientName: text('recipient_name'),
  memberId: uuid('member_id').references(() => members.id),
  judgeId: uuid('judge_id').references(() => judges.id),
  competitionId: uuid('competition_id').references(() => competitions.id),
  tokenId: uuid('token_id').references(() => tokens.id),
  subject: text('subject').notNull(),
  body: text('body'), // store body for admin email log UI
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  error: text('error'),
}, (t) => [
  index('idx_email_log_member').on(t.memberId),
])
