import type { ReactNode } from 'react'
import { ProhibitIcon as CircleSlash, TrayIcon as Inbox, LockKeyIcon as Lock, MagnifyingGlassIcon as Search, WarningIcon as TriangleAlert } from '@phosphor-icons/react/ssr'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { Button } from './button'
import type { ButtonVariant } from './button'
import { iconSize } from './size'

export type EmptyStateVariant = 'first-use' | 'no-results' | 'no-permission' | 'error' | 'capability-unavailable'

interface Preset {
  icon: PhosphorIcon
  iconClass: string
  /** Copy.md §5 templates; `name` is the object the user is missing. */
  title: (name: string, keyword?: string) => string
  description: (name: string, keyword?: string) => string
  actionLabel: (name: string) => string
  actionVariant: ButtonVariant
}

const presets: Record<EmptyStateVariant, Preset> = {
  'first-use': {
    icon: Inbox,
    iconClass: 'text-muted-foreground',
    title: (name) => `Welcome to ${name}`,
    description: (name) => `Here you can create, edit, and manage ${name}. Click the button below to start.`,
    actionLabel: (name) => `Create your first ${name}`,
    actionVariant: 'primary',
  },
  'no-results': {
    icon: Search,
    iconClass: 'text-muted-foreground',
    title: (name, keyword) => (keyword ? `No ${name} found for "${keyword}"` : `No ${name} match the current filters`),
    description: (_name, keyword) =>
      keyword ? 'Try checking the spelling, or use a broader search term.' : 'Try adjusting or clearing the filters to see more.',
    actionLabel: () => 'Clear filters',
    actionVariant: 'secondary',
  },
  'no-permission': {
    icon: Lock,
    iconClass: 'text-muted-foreground',
    title: () => 'No access yet',
    description: (name) => `You need to ask an administrator to grant access to ${name}.`,
    actionLabel: () => 'Request access',
    actionVariant: 'secondary',
  },
  error: {
    icon: TriangleAlert,
    iconClass: 'text-danger',
    title: () => 'Could not load content',
    description: () => 'Something went wrong while loading the data. Please try again later.',
    actionLabel: () => 'Retry refresh',
    actionVariant: 'secondary',
  },
  /**
   * Nothing failed: the capability is simply not there yet (no model enabled, no
   * preset configured, feature switched off by the deployment). states.md §5 lists
   * four data states and this is the fifth the app needs — a red 加载失败 would
   * blame the user's connection for an instance-side gap, and its 重试 action would
   * not be 与原因匹配. The action that matches is a refresh of what the instance
   * offers, after the setup happens elsewhere.
   */
  'capability-unavailable': {
    icon: CircleSlash,
    iconClass: 'text-muted-foreground',
    title: (name) => `${name} is unavailable for now`,
    description: (name) => `${name} needs the instance to enable the matching model or finish setup first. Refresh after that to continue.`,
    actionLabel: () => 'Refresh',
    actionVariant: 'secondary',
  },
}

export interface EmptyStateProps {
  variant?: EmptyStateVariant
  /**
   * What is missing, used verbatim inside the Chinese templates — pass a noun
   * phrase without a measure word, e.g. `你的画布`、`生成任务`、`该资源`.
   */
  objectName?: string
  /** Search term; switches 无结果 to the keyword wording (copy.md §5). */
  keyword?: string
  /** Override any of the defaults when the preset wording does not fit. */
  title?: ReactNode
  description?: ReactNode
  /** Full control of the action slot; replaces the built-in button. */
  action?: ReactNode
  /** Convenience: renders a `<Button>` with the preset label. */
  onAction?: () => void
  actionLabel?: ReactNode
  /** Extra content under the action (secondary link, shortcut hint). */
  children?: ReactNode
  /** `compact` fits inside a panel or an empty table body. */
  density?: 'comfortable' | 'compact'
  className?: string
}

/**
 * Empty state (states.md §5): illustration/icon + title + short description +
 * exactly one action that matches the reason. A dashed container is reserved for
 * upload / drag-drop semantics, so it never appears here.
 */
export function EmptyState({
  variant = 'first-use',
  objectName = 'this content',
  keyword,
  title,
  description,
  action,
  onAction,
  actionLabel,
  children,
  density = 'comfortable',
  className,
}: EmptyStateProps) {
  const preset = presets[variant]
  const Icon = preset.icon
  const shownTitle = title ?? preset.title(objectName, keyword)
  const shownDescription = description ?? preset.description(objectName, keyword)

  return (
    <div
      className={cn(
        // Colour is set on the container: `text-module` below would be swallowed
        // by a `text-<color>` class on the same element (tailwind-merge groups
        // them together), so headings here inherit instead.
        'flex flex-col items-center gap-3 px-4 text-center text-foreground',
        density === 'comfortable' ? 'py-12' : 'py-6',
        className,
      )}
    >
      {/* icons.md §3: 48px is the page-level empty-state size. */}
      <Icon weight="duotone" aria-hidden="true" className={cn(iconSize['2xl'], preset.iconClass)} />
      <div className="flex flex-col gap-1">
        <p className="text-module">{shownTitle}</p>
        <p className="max-w-reading text-sm text-muted-foreground">{shownDescription}</p>
      </div>

      {action}
      {!action && onAction ? (
        <Button variant={preset.actionVariant} onClick={onAction}>
          {actionLabel ?? preset.actionLabel(objectName)}
        </Button>
      ) : null}

      {children}
    </div>
  )
}
