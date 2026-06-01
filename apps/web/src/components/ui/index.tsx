import React from 'react'

// ── Button ─────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 border border-transparent',
  secondary: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1.5 h-7',
  md: 'text-sm px-3.5 py-2 h-9',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: boolean
}

export function Card({ children, padding = true, className = '', ...props }: CardProps) {
  return (
    <div
      {...props}
      className={`bg-white border border-gray-200 rounded-xl shadow-sm ${padding ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────────

type BadgeColor = 'default' | 'indigo' | 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'purple'

const BADGE_COLOR: Record<BadgeColor, string> = {
  default: 'bg-gray-100 text-gray-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  green: 'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  red: 'bg-red-50 text-red-700',
  orange: 'bg-orange-50 text-orange-700',
  blue: 'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
}

interface BadgeProps {
  color?: BadgeColor
  children: React.ReactNode
  className?: string
}

export function Badge({ color = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${BADGE_COLOR[color]} ${className}`}>
      {children}
    </span>
  )
}

// Status badge helper — maps content/script statuses to colors
const STATUS_COLOR: Record<string, BadgeColor> = {
  DRAFT: 'default',
  IN_REVIEW: 'yellow',
  BRAND_CHECKED: 'blue',
  APPROVED: 'green',
  REJECTED: 'red',
  PUBLISHED: 'indigo',
  FAILED: 'red',
  PENDING: 'yellow',
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? 'default'
  return <Badge color={color}>{status.replace(/_/g, ' ')}</Badge>
}

// ── Spinner ────────────────────────────────────────────────────────────────────

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <div
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}

// ── Input ──────────────────────────────────────────────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      className={`h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm
        placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2
        focus:ring-indigo-100 disabled:opacity-50 ${className}`}
    />
  ),
)
Input.displayName = 'Input'

// ── Select ─────────────────────────────────────────────────────────────────────

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...props }, ref) => (
    <select
      ref={ref}
      {...props}
      className={`h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-sm
        focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100
        disabled:opacity-50 ${className}`}
    />
  ),
)
Select.displayName = 'Select'

// ── EmptyState ─────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: string
}

export function EmptyState({ title, description, action, icon = '📭' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center max-w-sm mx-auto">
      <span className="text-4xl mb-4 opacity-70">{icon}</span>
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
      {description && <p className="text-xs text-gray-400 mb-4">{description}</p>}
      {action}
    </div>
  )
}

// ── ErrorBanner ────────────────────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}
