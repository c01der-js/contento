'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from '@/i18n/navigation'
import { useState } from 'react'
import { useWorkspace } from '@/lib/workspace'

type Step = 'company' | 'portrait' | 'avatar' | 'generate-avatar'

interface CompanyForm {
  companyName: string
  niche: string
  website: string
  description: string
  usp: string
  targetAudience: string
  competitors: string
}

interface AvatarForm {
  description: string
  style: 'professional' | 'casual' | 'energetic' | 'authoritative' | 'friendly'
  gender: 'male' | 'female' | 'neutral'
}

interface Portrait {
  niche: string
  description: string
  usp: string
  targetAudience: string
  competitors: string[]
  contentAngles: string[]
}

const STEPS = [
  { key: 'company' as Step, label: 'Company Data' },
  { key: 'portrait' as Step, label: 'AI Portrait' },
  { key: 'avatar' as Step, label: 'Avatar Setup' },
  { key: 'generate-avatar' as Step, label: 'Generate Avatar' },
]

export default function OnboardingPage() {
  const { getToken } = useAuth()
  const { activeId: workspaceId } = useWorkspace()
  const router = useRouter()
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [step, setStep] = useState<Step>('company')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [portrait, setPortrait] = useState<Portrait | null>(null)
  const [companyForm, setCompanyForm] = useState<CompanyForm>({
    companyName: '', niche: '', website: '', description: '', usp: '', targetAudience: '', competitors: '',
  })
  const [avatarForm, setAvatarForm] = useState<AvatarForm>({
    description: '', style: 'professional', gender: 'neutral',
  })

  const stepIndex = STEPS.findIndex(s => s.key === step)

  async function handleGeneratePortrait() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/company-portrait/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...companyForm,
          competitors: companyForm.competitors.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setPortrait(await res.json() as Portrait)
      setStep('portrait')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  async function handleSaveAvatar() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/avatar-persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(avatarForm),
      })
      if (!res.ok) throw new Error(await res.text())
      setStep('generate-avatar')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  async function handleGenerateAvatarImage() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/avatar-persona/generate-image`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      router.push('/studio')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Company Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Set up your brand profile for AI content generation</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors
              ${step === s.key ? 'bg-indigo-600 text-white' :
                stepIndex > i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {stepIndex > i ? '✓' : i + 1}
            </div>
            <span className="text-xs text-gray-500 hidden sm:block">{s.label}</span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Step 1: Company data */}
      {step === 'company' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Tell us about your company</h2>
          {[
            { key: 'companyName', label: 'Company name', placeholder: 'Acme Corp' },
            { key: 'niche', label: 'Niche / industry', placeholder: 'B2B SaaS for HR teams' },
            { key: 'website', label: 'Website (optional)', placeholder: 'https://acme.com' },
            { key: 'usp', label: 'Unique selling proposition', placeholder: 'We automate employee onboarding in 1 day' },
            { key: 'targetAudience', label: 'Target audience', placeholder: 'HR managers at 50-500 person companies' },
            { key: 'competitors', label: 'Competitors (comma-separated)', placeholder: 'BambooHR, Workday' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder={field.placeholder}
                value={companyForm[field.key as keyof CompanyForm]}
                onChange={e => setCompanyForm(f => ({ ...f, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              rows={3}
              placeholder="Briefly describe what your company does and why it matters..."
              value={companyForm.description}
              onChange={e => setCompanyForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button
            onClick={handleGeneratePortrait}
            disabled={loading || !companyForm.companyName || !companyForm.niche || !companyForm.description || !companyForm.usp || !companyForm.targetAudience}
            className="w-full py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Analyzing...' : 'Analyze with AI ->'}
          </button>
        </div>
      )}

      {/* Step 2: Portrait review */}
      {step === 'portrait' && portrait && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Your Brand Portrait</h2>
          <p className="text-sm text-gray-500">AI has analyzed your company. Review and continue.</p>
          <div className="space-y-3 bg-gray-50 rounded-lg p-4">
            {[
              { label: 'Niche', value: portrait.niche },
              { label: 'Description', value: portrait.description },
              { label: 'USP', value: portrait.usp },
              { label: 'Target audience', value: portrait.targetAudience },
            ].map(item => (
              <div key={item.label}>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{item.label}</span>
                <p className="text-sm mt-0.5 text-gray-800">{item.value}</p>
              </div>
            ))}
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Content angles</span>
              <ul className="mt-1 space-y-1">
                {portrait.contentAngles.map((a, i) => (
                  <li key={i} className="text-sm flex gap-2 text-gray-800"><span className="text-indigo-500">-&gt;</span>{a}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('company')} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Back
            </button>
            <button onClick={() => setStep('avatar')} className="flex-1 py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              Looks good -&gt;
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Avatar setup */}
      {step === 'avatar' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Brand Avatar</h2>
          <p className="text-sm text-gray-500">Define the AI persona that will appear in your videos.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Appearance description</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              rows={3}
              placeholder="e.g. Mid-30s, short dark hair, confident look, wearing a smart casual blazer"
              value={avatarForm.description}
              onChange={e => setAvatarForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={avatarForm.style}
                onChange={e => setAvatarForm(f => ({ ...f, style: e.target.value as AvatarForm['style'] }))}
              >
                {(['professional', 'casual', 'energetic', 'authoritative', 'friendly'] as const).map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={avatarForm.gender}
                onChange={e => setAvatarForm(f => ({ ...f, gender: e.target.value as AvatarForm['gender'] }))}
              >
                {(['neutral', 'male', 'female'] as const).map(g => (
                  <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('portrait')} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={handleSaveAvatar}
              disabled={loading || !avatarForm.description}
              className="flex-1 py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save avatar ->'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Generate avatar image */}
      {step === 'generate-avatar' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-4">
          <div className="text-4xl">*</div>
          <h2 className="font-medium text-gray-900">Generate avatar image</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            We will create a reference portrait for your brand avatar using AI. This takes about 1-2 minutes.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/studio')}
              className="flex-1 py-2 px-4 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Skip for now
            </button>
            <button
              onClick={handleGenerateAvatarImage}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate image'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
