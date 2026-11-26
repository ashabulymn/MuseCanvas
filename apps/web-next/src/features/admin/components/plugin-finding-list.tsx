'use client'

import type { AdminPluginScanFinding } from '@/shared/types'
import { Badge } from '@/shared/components/ui'
import { formatFindingLocation, groupFindingsByPath } from '../lib/plugin-upload'

/** One scan finding row: severity as text + Badge, never colour alone; location as `path:line:column`. */
function FindingItem({ finding, showPath }: { finding: AdminPluginScanFinding; showPath: boolean }) {
  const location = formatFindingLocation(showPath ? finding : { ...finding, path: undefined })
  return (
    <li
      className={`flex flex-wrap items-start gap-2 rounded-control p-2 text-xs ${
        finding.severity === 'error' ? 'bg-danger-soft text-danger' : 'bg-tonal text-muted-foreground'
      }`}
    >
      {/* 严重级别以文字呈现，不依赖颜色区分 */}
      <Badge tone={finding.severity === 'error' ? 'danger' : 'warning'} className="shrink-0">
        {finding.severity === 'error' ? 'Error' : 'Warning'}
      </Badge>
      <span className="font-mono">{finding.rule}</span>
      {location && <span className="break-all font-mono tabular-nums">{location}</span>}
      <span>{finding.message}</span>
    </li>
  )
}

interface PluginFindingListProps {
  findings: AdminPluginScanFinding[]
  emptyText?: string
  /**
   * Group findings under a per-file heading (zip packages report the package-relative
   * `path`). Path-less findings are listed under 「包级」. When false, each row carries
   * its own `path:line:column` label instead.
   */
  groupByPath?: boolean
}

export function PluginFindingList({ findings, emptyText, groupByPath = false }: PluginFindingListProps) {
  if (findings.length === 0) {
    return emptyText ? <p className="text-xs text-muted-foreground">{emptyText}</p> : null
  }

  const groups = groupFindingsByPath(findings)
  // A single path-less group (legacy single-file packages) needs no heading.
  if (!groupByPath || (groups.length === 1 && groups[0].path === null)) {
    return (
      <ul className="flex flex-col gap-2">
        {findings.map((f, i) => (
          <FindingItem key={`${f.path ?? ''}-${f.rule}-${f.line ?? 'x'}-${i}`} finding={f} showPath />
        ))}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.path ?? '__package__'} className="flex flex-col gap-1" aria-label={group.path ? `Scan findings for file ${group.path}` : 'Package-level scan findings'}>
          <p className="text-xs font-medium text-foreground">
            {group.path ? <span className="break-all font-mono">{group.path}</span> : 'Package-level'}
            <span className="ml-1 text-muted-foreground">
               (<span className="font-mono tabular-nums">{group.findings.length}</span> items)
            </span>
          </p>
          <ul className="flex flex-col gap-2">
            {group.findings.map((f, i) => (
              <FindingItem key={`${f.rule}-${f.line ?? 'x'}-${i}`} finding={f} showPath={false} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
