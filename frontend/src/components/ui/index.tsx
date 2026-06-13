import { ReactNode, ButtonHTMLAttributes, forwardRef } from 'react'
import { X } from 'lucide-react'

// ─── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize    = 'sm' | 'md' | 'lg'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-forest-500 text-white hover:bg-forest-600 active:bg-forest-700 shadow-sm',
  secondary: 'bg-stone-200 text-forest-800 hover:bg-stone-300 active:bg-stone-400',
  ghost:     'bg-transparent text-forest-600 hover:bg-forest-50 active:bg-forest-100',
  danger:    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-xl gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-5 py-3 text-base rounded-2xl gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-semibold',
        'transition-colors duration-100 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className = '', onClick }: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-2xl shadow-card',
        onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'green' | 'amber' | 'red' | 'blue'

const BADGE_VARIANT: Record<BadgeVariant, string> = {
  default: 'bg-stone-100 text-stone-600',
  green:   'bg-forest-100 text-forest-700',
  amber:   'bg-copper-100 text-copper-500',
  red:     'bg-red-100 text-red-700',
  blue:    'bg-blue-100 text-blue-700',
}

export function Badge({ children, variant = 'default', className = '' }: {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', BADGE_VARIANT[variant], className].join(' ')}>
      {children}
    </span>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">{children}</h2>
      {action}
    </div>
  )
}

// ─── Modal / bottom sheet ─────────────────────────────────────────────────────

export function Modal({ isOpen, onClose, title, children, footer }: {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col shadow-float animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-stone-200 rounded-full" />
        </div>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 pb-3">
            <h2 className="text-lg font-semibold text-forest-900">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400">
              <X size={18} />
            </button>
          </div>
        )}
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div className="px-5 pb-safe-bottom pb-5 pt-3 border-t border-stone-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Loading screen ───────────────────────────────────────────────────────────

export function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-3 border-forest-200 border-t-forest-500 rounded-full animate-spin" />
      <p className="text-sm text-stone-400">{message}</p>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, body, action }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6 gap-3">
      <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center">
        <Icon size={24} className="text-stone-400" />
      </div>
      <div>
        <p className="font-semibold text-forest-900">{title}</p>
        <p className="text-sm text-stone-400 mt-1">{body}</p>
      </div>
      {action}
    </div>
  )
}

// ─── Score chip ───────────────────────────────────────────────────────────────

export function ScoreChip({ label, value, max }: { label: string; value: number | null; max: number }) {
  if (value === null) return null
  const pct = (value / max) * 100

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-2xs text-stone-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="relative w-8 h-8">
        <svg viewBox="0 0 32 32" className="w-8 h-8 -rotate-90">
          <circle cx="16" cy="16" r="13" fill="none" stroke="#E5E1DA" strokeWidth="3" />
          <circle
            cx="16" cy="16" r="13"
            fill="none"
            stroke="#2C5F4A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 81.7} 81.7`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold text-forest-700">
          {value}
        </span>
      </div>
    </div>
  )
}

// ─── Inline text input ────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-forest-800">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={[
          'w-full px-3.5 py-2.5 rounded-xl border text-sm',
          'bg-white placeholder-stone-300 text-forest-900',
          'focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent',
          error ? 'border-red-400' : 'border-stone-200',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  ),
)
Input.displayName = 'Input'

// ─── Textarea ─────────────────────────────────────────────────────────────────

export function Textarea({ label, error, className = '', id, ...props }: {
  label?: string
  error?: string
  className?: string
  id?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-forest-800">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={3}
        className={[
          'w-full px-3.5 py-2.5 rounded-xl border text-sm resize-none',
          'bg-white placeholder-stone-300 text-forest-900',
          'focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent',
          error ? 'border-red-400' : 'border-stone-200',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

export function Fab({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'fixed bottom-[calc(4rem+1rem+env(safe-area-inset-bottom))] right-4',
        'w-14 h-14 rounded-full bg-forest-500 text-white shadow-float',
        'flex items-center justify-center',
        'active:scale-95 transition-transform',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
