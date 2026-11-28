import { useCallback, useEffect, useState } from "react"
import { ChevronRight, Copy } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

import { Command, copy, OptionRow } from "@/components/common"
import { api, behind, byPlatform, type Node, outdatedAgents, type Versions } from "@/lib/api"
import { upgradeCommand } from "@/lib/commands"

/**
 * What is running and what is published. Read once per panel load: the hub holds
 * the answer for six hours, so this costs a GitHub lookup a few times a day at
 * most, and nothing at all while nobody opens the panel.
 *
 * A hub that cannot reach github.com answers with empty latest fields, which
 * render as no update rather than as an error.
 */
export function useVersions(enabled = true) {
  const [versions, setVersions] = useState<Versions | null>(null)
  const load = useCallback(() => {
    if (!enabled) return
    api<Versions>("/version").then(setVersions).catch(() => {})
  }, [enabled])
  useEffect(() => { load() }, [load])
  return { versions, reload: load }
}

const releaseUrl = (repo: string, version: string) => `https://github.com/${repo}/releases/tag/v${version}`

/** `v1.2.0 → v1.3.0` when something is published, the running version alone otherwise. */
function VersionPair({ current, latest }: { current: string; latest: string }) {
  if (!behind(current, latest)) {
    return <span className="text-xs text-muted-foreground">{latest ? `已是最新 v${current}` : `当前 v${current}`}</span>
  }
  return (
    <span className="text-xs text-muted-foreground">
      v{current} <span className="px-0.5">→</span>
      <span className="ml-0.5 font-medium text-foreground">v{latest}</span>
    </span>
  )
}

/** Outdated nodes grouped by the version they run, oldest first. */
function byVersion(nodes: Node[]): [string, Node[]][] {
  const groups = new Map<string, Node[]>()
  for (const n of nodes) groups.set(n.agent_version, [...(groups.get(n.agent_version) ?? []), n])
  return [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
}

/**
 * What is published for the hub and the agents. Its own route rather than a
 * banner on the node list; the dot in the navigation is what says there is
 * something here.
 *
 * The hub card names the release alone: how to take it depends on how the hub
 * was installed, script or container, which the hub cannot tell.
 */
/**
 * One agent release line: what is published for it, and the nodes behind it.
 *
 * The two lines are numbered apart, so each is compared with its own
 * published version. The upgrade command is the same for both and is shown
 * once, below them.
 */
function AgentCard({ title, latest, nodes, repo }: {
  title: string
  latest: string
  nodes: Node[]
  repo: string
}) {
  const offline = nodes.filter((n) => !n.online).length
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {latest
            ? nodes.length
              ? <>最新 v{latest} · <span className="font-medium text-foreground">{nodes.length} 台待升级</span></>
              : `全部已是最新 v{latest}`
            : "查不到版本"}
        </span>
      </div>
      {nodes.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {latest && (
              <Button size="sm" variant="ghost" asChild>
                <a href={releaseUrl(repo, latest)} target="_blank" rel="noreferrer">
                  发布说明
                </a>
              </Button>
            )}
          </div>
          {/* Collapsed until asked for, grouped by version, and bounded in height
              once open, so any number of nodes stays one line on the page. */}
          <details className="group border-t pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-xs text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-1.5">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                待升级的节点
              </span>
              {offline > 0 && <span>其中 {offline} 台离线</span>}
            </summary>
            <div className="mt-3 max-h-60 space-y-3 overflow-auto">
              {byVersion(nodes).map(([version, group]) => (
                <div key={version} className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">v{version} · {group.length} 台</div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map((n) => (
                      <Badge
                        key={n.id}
                        variant="secondary"
                        className={`font-normal ${n.online ? "" : "opacity-50"}`}
                        title={n.online ? undefined : "离线"}
                      >
                        {n.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </Card>
  )
}

export function Update({ versions, reload, nodes, site, refusal }: {
  versions: Versions | null
  reload: () => void
  nodes: Node[]
  site: string
  refusal: string
}) {
  const [saving, setSaving] = useState(false)
  if (!versions) return null
  // The two agent lines are numbered apart, so each is compared with the
  // version published for its own line.
  const { macos, linux } = byPlatform(nodes)
  const linuxOutdated = outdatedAgents(linux, versions.agent_latest)
  const macosOutdated = outdatedAgents(macos, versions.agent_latest_macos)
  const upgrade = refusal ? "" : upgradeCommand(site)
  const unreachable = !versions.hub_latest && !versions.agent_latest && !versions.agent_latest_macos

  // Applied on the spot: one switch, and the navigation changes with it.
  async function setNotice(on: boolean) {
    setSaving(true)
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({ update_notice: on ? "on" : "off" }) })
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {unreachable && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            查不到最新版本：这台 hub 连不上 api.github.com。GitHub 代理不作用于这一项。
          </p>
        </Card>
      )}

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">hub</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">上游 monitor 最新</span>
            <VersionPair current={versions.hub} latest={versions.hub_latest} />
            {behind(versions.hub, versions.hub_latest) && (
              <Button size="sm" variant="ghost" asChild>
                <a href={releaseUrl("monitor-probe/monitor", versions.hub_latest)} target="_blank" rel="noreferrer">
                  发布说明
                </a>
              </Button>
            )}
          </div>
        </div>
      </Card>

      <AgentCard
        title="agent · Linux"
        latest={versions.agent_latest}
        nodes={linuxOutdated}
        repo="monitor-probe/agent"
      />
      <AgentCard
        title="agent · macOS"
        latest={versions.agent_latest_macos}
        nodes={macosOutdated}
        repo="plutolujh/monitor-macOS"
      />

      {/* The command is the same for both lines -- the installer works out the
          platform itself -- so it is offered once, under them. */}
      {(linuxOutdated.length > 0 || macosOutdated.length > 0 || !versions.agent_latest || !versions.agent_latest_macos) && (
        <Card className="gap-4 p-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            以 root 在每台机器上执行一次。不含凭证，沿用机器上已有的设置，不会新建节点。
          </p>
          {upgrade ? (
            <>
              <Command>{upgrade}</Command>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(upgrade)}>
                  <Copy className="size-4" /> 复制命令
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href="https://monitor-document.pages.dev/install/batch" target="_blank" rel="noreferrer">
                    批量升级的做法
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{refusal}</p>
          )}
        </Card>
      )}

      <OptionRow
        title="更新提醒"
        hint="有新版本时在导航的「更新」旁显示小圆点。关闭只是不再显示圆点，这一页照常检查"
        toggle
      >
        <Switch checked={versions.notice} disabled={saving} onCheckedChange={setNotice} />
      </OptionRow>
    </div>
  )
}
