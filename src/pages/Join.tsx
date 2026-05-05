import { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  // Page 1 — contact
  first_name: string
  last_name: string
  email: string
  phone: string
  landline: string
  address: string
  already_member: boolean
  // Page 2 — privacy
  privacy_act_ok: boolean
  image_use_ok: boolean
  // Page 3 — about you
  photographic_interests: string
  software: string
  experience_level: string
  known_members: boolean
  hear_about_us: string
  // Page 4 — membership fee
  payment_method: string
  pay_by_date: string
}

const INITIAL: FormState = {
  first_name: '', last_name: '', email: '', phone: '', landline: '', address: '',
  already_member: false,
  privacy_act_ok: true, image_use_ok: true,
  photographic_interests: '', software: '', experience_level: '', known_members: false, hear_about_us: '',
  payment_method: '', pay_by_date: '',
}

const HEAR_OPTIONS = [
  'Word of mouth', 'Facebook', 'Website', 'Newspaper / magazine', 'Poster / flyer', 'Other',
]

// ── Shared UI ────────────────────────────────────────────────────────────────

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-800 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-1.5">{hint}</p>}
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
    />
  )
}

function RadioGroup({ options, value, onChange }: {
  options: { label: string; value: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map(opt => (
        <label key={opt.value} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${value === opt.value ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input type="radio" className="accent-amber-600" checked={value === opt.value} onChange={() => onChange(opt.value)} />
          <span className="text-sm text-gray-800">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <RadioGroup
      options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]}
      value={value ? 'yes' : 'no'}
      onChange={v => onChange(v === 'yes')}
    />
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <div className="bg-blue-50 text-blue-800 text-sm font-semibold px-4 py-2.5 rounded-lg">{children}</div>
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">{children}</div>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Join() {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function validateStep1() {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.first_name.trim()) e.first_name = 'Required'
    if (!form.last_name.trim()) e.last_name = 'Required'
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required'
    if (!form.phone.trim()) e.phone = 'Mobile phone is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateStep2() {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.privacy_act_ok) e.privacy_act_ok = 'You must acknowledge your privacy rights'
    if (!form.image_use_ok) e.image_use_ok = 'You must confirm image use consent'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateStep3() {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.experience_level) e.experience_level = 'Please select your experience level'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateStep4() {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.payment_method) e.payment_method = 'Please select a payment method'
    if (!form.pay_by_date) e.pay_by_date = 'Please enter a date'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    const valid = step === 1 ? validateStep1()
      : step === 2 ? validateStep2()
      : step === 3 ? validateStep3()
      : true
    if (valid) setStep(s => s + 1)
  }

  async function submit() {
    if (!validateStep4()) return
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch('/api/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          landline: form.landline.trim(),
          address: form.address.trim(),
          privacy_act_ok: form.privacy_act_ok,
          image_use_ok: form.image_use_ok,
          experience_level: form.experience_level,
          photographic_interests: form.photographic_interests.trim(),
          software: form.software.trim(),
          hear_about_us: form.hear_about_us,
          known_members: form.known_members,
          facebook_invite: false,
          payment_method: form.payment_method,
          pay_by_date: form.pay_by_date,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setServerError(json.error ?? 'Something went wrong'); return }
      setDone(true)
    } catch {
      setServerError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Done screen ──────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl font-bold text-gray-900 mb-3">Application received!</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Thanks for applying to join the Wairarapa Camera Club. We'll be in touch shortly
            with payment details and next steps.
          </p>
        </div>
      </div>
    )
  }

  const totalSteps = 4
  const progress = ((step - 1) / totalSteps) * 100

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="h-28 bg-slate-700 overflow-hidden relative">
          <img
            src="https://wairarapacameraclub.org/wp-content/uploads/2021/04/cropped-WCC-Logo-v2-1.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="relative flex items-center justify-center h-full">
            <p className="text-white font-semibold tracking-wide text-sm uppercase opacity-90">Wairarapa Camera Club</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-amber-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-6 space-y-5">

          <div>
            <h1 className="text-xl font-bold text-gray-900">Membership application</h1>
            <p className="text-xs text-gray-500 mt-1">
              Questions marked <span className="text-red-500 font-medium">*</span> are required.
              All other responses are optional but useful.
            </p>
          </div>

          {/* ── Step 1: Contact details ──────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-800">Already a member?</p>
                  <p className="text-xs text-gray-500 mt-0.5">Just want to pay this year's subs?</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('already_member', !form.already_member)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${form.already_member ? 'bg-amber-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${form.already_member ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {form.already_member ? (
                <InfoBox>
                  Please contact the Club Treasurer directly to arrange your subs payment —
                  this form is for new member applications only.
                </InfoBox>
              ) : (
                <>
                  <SectionHeading>Contact details</SectionHeading>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" required error={errors.first_name}>
                      <Input value={form.first_name} onChange={v => set('first_name', v)} placeholder="Jane" />
                    </Field>
                    <Field label="Last name" required error={errors.last_name}>
                      <Input value={form.last_name} onChange={v => set('last_name', v)} placeholder="Smith" />
                    </Field>
                  </div>

                  <Field label="Email" required error={errors.email}>
                    <Input type="email" value={form.email} onChange={v => set('email', v)} placeholder="jane@example.com" />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Mobile phone" required error={errors.phone}>
                      <Input type="tel" value={form.phone} onChange={v => set('phone', v)} placeholder="021 000 0000" />
                    </Field>
                    <Field label="Landline">
                      <Input type="tel" value={form.landline} onChange={v => set('landline', v)} placeholder="06 000 0000" />
                    </Field>
                  </div>

                  <Field label="Street address" hint="Street address, town and postcode">
                    <Input value={form.address} onChange={v => set('address', v)} />
                  </Field>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Privacy ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-3">Privacy rights</h2>
                <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
                  <p><strong>What are your rights and the Club's obligations to you?</strong></p>
                  <p>The Wairarapa Camera Club has safeguards to protect information about you and to prevent it being lost, being accessed, used, changed or released without the Club's permission or being misused in any other way.</p>
                  <p>From time to time, Club officers may share your email and/or phone details with other members. The Club will only do this when it enables the effective running of a Club activity. In other situations the Club will not share your address details with other members without your permission.</p>
                  <p>You have the right to get information from the Club about whether or not it holds information about you, and have access to that information. If you request this information, the Club must respond within 20 working days. You have the right to ask for the information to be corrected.</p>
                  <p>If you think that the Privacy Act has been breached, you should complain to the Club Secretary.</p>
                </div>
                <div className="mt-4">
                  <InfoBox>
                    <strong>Contact information use:</strong> The club sends several emails a month to members,
                    providing information about activities that they may participate in.
                  </InfoBox>
                </div>
              </div>

              <SectionHeading>Privacy questions</SectionHeading>

              <Field label="I understand my privacy rights" required error={errors.privacy_act_ok}>
                <YesNo value={form.privacy_act_ok} onChange={v => set('privacy_act_ok', v)} />
              </Field>

              <Field
                label="My competition images may be used"
                required
                hint="Submitted images will be retained by the Club and may be used for Club promotional material."
                error={errors.image_use_ok}
              >
                <YesNo value={form.image_use_ok} onChange={v => set('image_use_ok', v)} />
              </Field>
            </div>
          )}

          {/* ── Step 3: About you ────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">A bit about you</h2>
                <p className="text-sm text-gray-500 mt-1">We like to know about new members' experience and expectations so we can tailor our services.</p>
              </div>

              <SectionHeading>About you</SectionHeading>

              <Field label="Photographic interests" hint="Tell us about yourself, what equipment you shoot with, your preference/style of what you like to shoot.">
                <textarea
                  value={form.photographic_interests}
                  onChange={e => set('photographic_interests', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </Field>

              <Field label="Software" hint='For processing images, digital asset management. If none, say "None".'>
                <Input value={form.software} onChange={v => set('software', v)} />
              </Field>

              <Field label="Experience" required hint="How would you grade your experience?" error={errors.experience_level}>
                <RadioGroup
                  options={[
                    { label: 'Novice', value: 'beginner' },
                    { label: 'Intermediate', value: 'intermediate' },
                    { label: 'Advanced', value: 'advanced' },
                  ]}
                  value={form.experience_level}
                  onChange={v => set('experience_level', v)}
                />
              </Field>

              <Field label="Our Club members" hint="Do you know any of our Club members?">
                <YesNo value={form.known_members} onChange={v => set('known_members', v)} />
              </Field>

              <Field label="How did you hear about us">
                <select
                  value={form.hear_about_us}
                  onChange={e => set('hear_about_us', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                >
                  <option value="">Select…</option>
                  {HEAR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          )}

          {/* ── Step 4: Membership fee ───────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Annual membership fee</h2>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                  Payment of <strong>$50</strong> can be made direct to the Club bank account, by Credit Card
                  (with a small additional surcharge), or paid in cash to the Club Treasurer.
                  This information will be emailed to you.
                </p>
              </div>

              <InfoBox>
                <strong>Discount — 1 July onwards:</strong> From 1 July onwards, the membership fee is reduced to $25.
              </InfoBox>

              <SectionHeading>Membership fee</SectionHeading>

              <Field label="I plan to pay through" required error={errors.payment_method}>
                <RadioGroup
                  options={[
                    { label: 'Credit Card', value: 'credit_card' },
                    { label: 'Funds Transfer', value: 'funds_transfer' },
                  ]}
                  value={form.payment_method}
                  onChange={v => set('payment_method', v)}
                />
              </Field>

              <Field label="I plan to pay by" required error={errors.pay_by_date}>
                <Input type="date" value={form.pay_by_date} onChange={v => set('pay_by_date', v)} />
              </Field>

              {serverError && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{serverError}</div>
              )}
            </div>
          )}

          {/* ── Navigation ──────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
            )}
            {step < totalSteps && !form.already_member && (
              <button
                type="button"
                onClick={next}
                className="ml-auto px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors"
              >
                Next →
              </button>
            )}
            {step === totalSteps && (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="ml-auto px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            )}
          </div>

          {/* Step indicator */}
          <p className="text-center text-xs text-gray-400">Step {step} of {totalSteps}</p>
        </div>
      </div>
    </div>
  )
}
