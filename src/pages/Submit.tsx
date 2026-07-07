import { useParams } from 'react-router-dom'
import MemberSubmissionForm from '@/components/portal/MemberSubmissionForm'

export default function Submit() {
  const { token } = useParams<{ token: string }>()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Wairarapa Camera Club</div>
          <h1 className="text-xl font-bold text-gray-900">Competition submission</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {token && <MemberSubmissionForm token={token} showWelcome />}
      </div>
    </div>
  )
}
