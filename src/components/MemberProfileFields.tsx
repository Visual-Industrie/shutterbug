import {
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  type MemberProfileFormValues,
} from '@/shared/memberProfile'

/**
 * The editable personal details, shared by the admin Applicants and Members
 * slide-overs and the member portal's My details tab. The field list itself
 * lives in src/shared/memberProfile.ts alongside the server-side schema.
 */

const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-1 border-t border-gray-100 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-2">{title}</p>
      {children}
    </div>
  )
}

function Check({ checked, onChange, children }: {
  checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
      />
      <span>{children}</span>
    </label>
  )
}

type V = MemberProfileFormValues

export default function MemberProfileFields({ value, onChange, emailError }: {
  value: V
  /** Receives just the changed field — merge it into the caller's form state. */
  onChange: (patch: Partial<V>) => void
  /** Shown under the email input, e.g. a 409 "already in use". */
  emailError?: string | null
}) {
  const set = <K extends keyof V>(field: K, v: V[K]) => onChange({ [field]: v } as Partial<V>)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name *">
          <input type="text" required value={value.first_name} onChange={e => set('first_name', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Last name *">
          <input type="text" required value={value.last_name} onChange={e => set('last_name', e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label="Email *">
        <input type="email" required value={value.email} onChange={e => set('email', e.target.value)} className={inputCls} />
        {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile">
          <input type="tel" value={value.phone} onChange={e => set('phone', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Landline">
          <input type="tel" value={value.landline} onChange={e => set('landline', e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Section title="Address">
        <input
          type="text"
          value={value.address}
          onChange={e => set('address', e.target.value)}
          className={inputCls}
          placeholder="Street, town, postcode"
          aria-label="Address"
        />
      </Section>

      <Section title="Photography">
        <Field label="Experience level">
          <select value={value.experience_level} onChange={e => set('experience_level', e.target.value)} className={inputCls}>
            <option value="">— not set —</option>
            {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{EXPERIENCE_LABELS[l]}</option>)}
          </select>
        </Field>
        <Field label="Photographic interests">
          <textarea rows={3} value={value.photographic_interests} onChange={e => set('photographic_interests', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Software">
          <input type="text" value={value.software} onChange={e => set('software', e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <Section title="Consents">
        <Check checked={value.privacy_act_ok} onChange={v => set('privacy_act_ok', v)}>
          Privacy rights acknowledged
        </Check>
        <Check checked={value.image_use_ok} onChange={v => set('image_use_ok', v)}>
          Competition images may be used for Club promotional material
        </Check>
      </Section>
    </div>
  )
}
