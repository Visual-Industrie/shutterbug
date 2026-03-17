import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const TYPE_LABELS: Record<string, string> = {
  submission_invite: 'Submission invite',
  submission_reminder: 'Reminder',
  submission_confirmation: 'Confirmation',
  judging_invite: 'Judge invite',
  results_notification: 'Results',
  member_history_link: 'History link',
  subs_reminder: 'Subs reminder',
  one_off: 'One-off',
}

type Recipients = 'all_active' | 'subs_unpaid' | 'member'

interface MemberOption {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface EmailTemplate {
  key: string
  name: string
  description: string | null
  subject_template: string
  body_html: string
  updated_at: string
}

// Placeholders for each template key
const TEMPLATE_PLACEHOLDERS: Record<string, Array<{ key: string; description: string }>> = {
  submission_invite: [
    { key: '[member_name]', description: 'Full name of the member' },
    { key: '[competition_name]', description: 'Competition title' },
    { key: '[closes_date]', description: 'Closing date (e.g. "15 March 2026")' },
    { key: '[submission_link]', description: 'Button: "Submit your entries"' },
    { key: '[submission_url]', description: 'Plain text submission URL' },
  ],
  submission_reminder: [
    { key: '[member_name]', description: 'Full name of the member' },
    { key: '[competition_name]', description: 'Competition title' },
    { key: '[closes_date]', description: 'Closing date' },
    { key: '[submission_link]', description: 'Button: "Manage your entries"' },
    { key: '[submission_url]', description: 'Plain text submission URL' },
    { key: '[entry_summary]', description: 'Paragraph: how many entries submitted (or none yet)' },
  ],
  judging_invite: [
    { key: '[judge_name]', description: 'Judge\'s name' },
    { key: '[competition_name]', description: 'Competition title' },
    { key: '[judging_closes_date]', description: 'Judging deadline' },
    { key: '[projim_count]', description: 'Number of projected images' },
    { key: '[printim_count]', description: 'Number of printed images' },
    { key: '[judging_link]', description: 'Button: "Start judging"' },
    { key: '[judging_url]', description: 'Plain text judging URL' },
  ],
  member_history_link: [
    { key: '[member_name]', description: 'Full name of the member' },
    { key: '[history_link]', description: 'Button: "View my photo history"' },
    { key: '[history_url]', description: 'Plain text history URL' },
  ],
  results_notification: [
    { key: '[member_name]', description: 'Full name of the member' },
    { key: '[competition_name]', description: 'Competition title' },
    { key: '[results_table]', description: 'HTML table of entries with awards and scores' },
    { key: '[history_link]', description: 'Button: "View full history"' },
    { key: '[history_url]', description: 'Plain text history URL' },
  ],
  subs_reminder_first: [
    { key: '[member_name]', description: 'Full name of the member' },
    { key: '[amount]', description: 'Subscription amount (e.g. "$85.00") or "your annual subscription"' },
  ],
  subs_reminder_second: [
    { key: '[member_name]', description: 'Full name of the member' },
    { key: '[amount]', description: 'Subscription amount (e.g. "$85.00") or "your annual subscription"' },
  ],
}

const TEMPLATE_EDITOR_ROLES = new Set(['super_admin', 'president', 'competition_secretary'])

function TemplateEditor({
  template,
  canEdit,
  onSaved,
}: {
  template: EmailTemplate
  canEdit: boolean
  onSaved: () => void
}) {
  const [subject, setSubject] = useState(template.subject_template)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: template.body_html,
    editable: canEdit,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] focus:outline-none px-4 py-3 text-sm text-gray-700',
      },
    },
    onUpdate: () => setDirty(true),
  })

  // Reset when template changes
  useEffect(() => {
    setSubject(template.subject_template)
    setDirty(false)
    setSaveError(null)
    if (editor && editor.getHTML() !== template.body_html) {
      editor.commands.setContent(template.body_html, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.key])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<EmailTemplate>(`/api/email-templates/${template.key}`, {
        method: 'PATCH',
        body: JSON.stringify({
          subject_template: subject,
          body_html: editor!.getHTML(),
        }),
      }),
    onSuccess: () => {
      setDirty(false)
      setSaveError(null)
      onSaved()
    },
    onError: (err) => setSaveError(err instanceof Error ? err.message : 'Save failed'),
  })

  const placeholders = TEMPLATE_PLACEHOLDERS[template.key] ?? []

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">{template.name}</h3>
          {template.updated_at && (
            <span className="text-xs text-gray-400">
              Last saved {new Date(template.updated_at).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-gray-500 mb-3">{template.description}</p>
        )}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={e => { setSubject(e.target.value); setDirty(true) }}
          disabled={!canEdit}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
        {canEdit && (
          <div className="flex gap-1 flex-wrap border border-gray-200 rounded-t-lg px-2 py-1.5 bg-gray-50">
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`px-2 py-0.5 text-xs rounded font-bold ${editor?.isActive('bold') ? 'bg-amber-200' : 'hover:bg-gray-200'}`}
            >B</button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`px-2 py-0.5 text-xs rounded italic ${editor?.isActive('italic') ? 'bg-amber-200' : 'hover:bg-gray-200'}`}
            >I</button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`px-2 py-0.5 text-xs rounded ${editor?.isActive('bulletList') ? 'bg-amber-200' : 'hover:bg-gray-200'}`}
            >• List</button>
          </div>
        )}
        <div className={`border border-gray-300 ${canEdit ? 'rounded-b-lg border-t-0' : 'rounded-lg'} bg-white`}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Placeholders reference */}
      {placeholders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">Available placeholders</p>
          <div className="space-y-1">
            {placeholders.map(p => (
              <div key={p.key} className="flex items-start gap-2 text-xs">
                <code
                  className="font-mono text-amber-900 bg-amber-100 px-1 rounded shrink-0 cursor-pointer hover:bg-amber-200"
                  title="Click to copy"
                  onClick={() => navigator.clipboard.writeText(p.key)}
                >{p.key}</code>
                <span className="text-amber-700">{p.description}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2">Click a placeholder to copy it to the clipboard.</p>
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-gray-500 italic">
          Only super admins, the president, and the competition secretary can edit email templates.
        </p>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save template'}
          </button>
          {dirty && !saveMutation.isPending && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}
          {!dirty && !saveMutation.isPending && saveMutation.isSuccess && (
            <span className="text-xs text-green-600">Saved</span>
          )}
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
        </div>
      )}
    </div>
  )
}

export default function EmailLog() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'log' | 'templates'>('log')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null)

  // Compose modal
  const [showCompose, setShowCompose] = useState(false)
  const [recipients, setRecipients] = useState<Recipients>('all_active')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; skipped: number } | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const { data: allEmails = [], isLoading: logLoading } = useQuery({
    queryKey: ['emails'],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_log')
        .select('id,type,recipient_email,recipient_name,subject,body,sent_at,error')
        .order('sent_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
  })

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => apiFetch<EmailTemplate[]>('/api/email-templates'),
    enabled: tab === 'templates',
  })

  // Auto-select first template when list loads
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateKey) {
      setSelectedTemplateKey(templates[0].key)
    }
  }, [templates, selectedTemplateKey])

  const emails = search
    ? allEmails.filter(e => {
        const q = search.toLowerCase()
        return (
          e.subject.toLowerCase().includes(q) ||
          e.recipient_email.toLowerCase().includes(q) ||
          (e.recipient_name ?? '').toLowerCase().includes(q)
        )
      })
    : allEmails

  function fmt(d: string) {
    return new Date(d).toLocaleString('en-NZ', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function searchMembers(q: string) {
    if (!q.trim()) { setMemberOptions([]); return }
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, email')
      .eq('status', 'active')
      .ilike('last_name', `%${q}%`)
      .not('email', 'like', '%@privacy.wcc.local')
      .order('last_name')
      .limit(20)
    setMemberOptions((data ?? []) as MemberOption[])
  }

  function openCompose() {
    setRecipients('all_active')
    setMemberSearch('')
    setMemberOptions([])
    setSelectedMember(null)
    setSubject('')
    setBody('')
    setSendResult(null)
    setSendError(null)
    setShowCompose(true)
  }

  async function handleSend() {
    setSendError(null)
    setSendResult(null)
    if (!subject.trim()) { setSendError('Subject is required'); return }
    if (!body.trim()) { setSendError('Body is required'); return }
    if (recipients === 'member' && !selectedMember) { setSendError('Please select a member'); return }

    setSending(true)
    try {
      const result = await apiFetch<{ sent: number; skipped: number }>('/api/email/send-bulk', {
        method: 'POST',
        body: JSON.stringify({
          recipients,
          member_id: recipients === 'member' ? selectedMember?.id : undefined,
          subject: subject.trim(),
          body: body.trim(),
        }),
      })
      setSendResult(result)
      queryClient.invalidateQueries({ queryKey: ['emails'] })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
  const canEdit = user ? TEMPLATE_EDITOR_ROLES.has(user.role) : false
  const selectedTemplate = templates.find(t => t.key === selectedTemplateKey) ?? null

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email</h1>
          <p className="text-sm text-gray-500 mt-0.5">Send and review club emails</p>
        </div>
        {tab === 'log' && (
          <button
            onClick={openCompose}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            + Send email
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['log', 'templates'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'log' ? 'Log' : 'Templates'}
          </button>
        ))}
      </div>

      {/* ── Log tab ── */}
      {tab === 'log' && (
        <>
          <input
            type="search"
            placeholder="Search subject, recipient…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
          />

          {logLoading ? (
            <div className="text-center text-gray-400 py-8">Loading…</div>
          ) : emails.length === 0 ? (
            <div className="text-center text-gray-400 py-8">No emails logged yet</div>
          ) : (
            <div className="space-y-1">
              {emails.map(e => (
                <div key={e.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 truncate">{e.subject}</span>
                        {e.error && <span className="text-xs text-red-500">⚠ Failed</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {e.recipient_name ?? e.recipient_email}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-400">{fmt(e.sent_at)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{TYPE_LABELS[e.type] ?? e.type}</div>
                    </div>
                    <span className="text-gray-400 text-xs">{expanded === e.id ? '▲' : '▼'}</span>
                  </button>

                  {expanded === e.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 text-sm space-y-2 pt-3">
                      <div className="text-xs text-gray-500">
                        <span className="font-medium">To:</span> {e.recipient_email}
                      </div>
                      {e.error && (
                        <div className="text-xs text-red-600 bg-red-50 rounded p-2">{e.error}</div>
                      )}
                      {e.body && (
                        <div
                          className="text-gray-700 text-sm prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: e.body }}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Templates tab ── */}
      {tab === 'templates' && (
        <div className="flex gap-6">
          {/* Template list */}
          <div className="w-48 shrink-0">
            {templatesLoading ? (
              <div className="text-xs text-gray-400 py-4">Loading…</div>
            ) : (
              <nav className="space-y-0.5">
                {templates.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setSelectedTemplateKey(t.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedTemplateKey === t.key
                        ? 'bg-amber-100 text-amber-900 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </nav>
            )}
          </div>

          {/* Editor panel */}
          <div className="flex-1 min-w-0">
            {selectedTemplate ? (
              <TemplateEditor
                key={selectedTemplate.key}
                template={selectedTemplate}
                canEdit={canEdit}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ['email-templates'] })}
              />
            ) : (
              <div className="text-sm text-gray-400 py-8 text-center">Select a template</div>
            )}
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => !sending && setShowCompose(false)} />
          <div className="relative bg-white h-full w-full max-w-lg shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Send email</h2>
              <button onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Recipients */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Recipients</label>
                <div className="space-y-2">
                  {(([
                    ['all_active', 'All active members'],
                    ['subs_unpaid', 'Active members with unpaid subs'],
                    ['member', 'Specific member…'],
                  ] as [Recipients, string][]).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="recipients"
                        value={val}
                        checked={recipients === val}
                        onChange={() => { setRecipients(val); setSelectedMember(null); setMemberSearch(''); setMemberOptions([]) }}
                        className="accent-amber-600"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  )))}
                </div>

                {recipients === 'member' && (
                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="Search by last name…"
                      value={memberSearch}
                      onChange={e => { setMemberSearch(e.target.value); setSelectedMember(null); searchMembers(e.target.value) }}
                      className={inputCls}
                    />
                    {memberOptions.length > 0 && !selectedMember && (
                      <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                        {memberOptions.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setSelectedMember(m); setMemberSearch(`${m.first_name} ${m.last_name}`); setMemberOptions([]) }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            <span className="font-medium">{m.first_name} {m.last_name}</span>
                            <span className="text-gray-400 ml-2 text-xs">{m.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedMember && (
                      <p className="mt-1 text-xs text-green-600">✓ {selectedMember.first_name} {selectedMember.last_name} — {selectedMember.email}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className={inputCls}
                  placeholder="Email subject…"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={12}
                  className={`${inputCls} resize-y font-sans`}
                  placeholder={'Write your message here…\n\nSeparate paragraphs with a blank line.'}
                />
                <p className="text-xs text-gray-400 mt-1">Plain text. Separate paragraphs with a blank line. A club signature will be added automatically.</p>
              </div>

              {sendError && <p className="text-sm text-red-600">{sendError}</p>}

              {sendResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                  Sent to {sendResult.sent} member{sendResult.sent !== 1 ? 's' : ''}.
                  {sendResult.skipped > 0 && ` ${sendResult.skipped} skipped.`}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                {sendResult ? 'Close' : 'Cancel'}
              </button>
              {!sendResult && (
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
