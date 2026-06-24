import { SignUp } from '@clerk/nextjs'
import { API_BASE } from '@/lib/api'

interface Props {
  searchParams: Promise<{ token?: string }>
}

interface InvitationPreview {
  email: string
  workspaceId: string
  role: string
  expiresAt: string
}

type ValidationResult =
  | { ok: true; data: InvitationPreview }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' | 'network' }

async function validateInvitation(token: string | undefined): Promise<ValidationResult> {
  if (!token) return { ok: false, reason: 'missing' }

  try {
    const res = await fetch(
      `${API_BASE}/workspaces/invitations/${encodeURIComponent(token)}/preview`,
      { cache: 'no-store' },
    )
    if (res.status === 404) return { ok: false, reason: 'invalid' }
    if (res.status === 410) return { ok: false, reason: 'expired' }
    if (!res.ok) return { ok: false, reason: 'network' }
    const data = (await res.json()) as InvitationPreview
    return { ok: true, data }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

function InvitationNotice({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <div className="text-center max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{title}</h1>
      <p className="text-gray-500">{message}</p>
    </div>
  )
}

export default async function SignUpPage({ searchParams }: Props) {
  const { token } = await searchParams
  const result = await validateInvitation(token)

  if (!result.ok) {
    switch (result.reason) {
      case 'missing':
        return (
          <InvitationNotice
            title="Invitation Required"
            message="You need a valid invitation link to create an account."
          />
        )
      case 'invalid':
        return (
          <InvitationNotice
            title="Invalid Invitation"
            message="This invitation link is not recognized. Please ask your workspace admin for a new one."
          />
        )
      case 'expired':
        return (
          <InvitationNotice
            title="Invitation Expired"
            message="This invitation is no longer valid. Ask your workspace admin to resend it."
          />
        )
      case 'network':
        return (
          <InvitationNotice
            title="Cannot Verify Invitation"
            message="We can't reach the server right now. Please try again in a moment."
          />
        )
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-500">
        Invited as <span className="font-medium text-gray-800">{result.data.email}</span>
      </p>
      <SignUp initialValues={{ emailAddress: result.data.email }} />
    </div>
  )
}
