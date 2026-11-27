# monitor-hub

[monitor](https://github.com/monitor-probe/monitor) 的 hub：后台、API、公开页宿主。

这是上游 hub 的代码，加上 **macOS agent 支持**，以及把这套 hub 部署到 VPS 的 CI。

上游不做 macOS agent（[issue #129](https://github.com/monitor-probe/monitor/issues/129)：*「社区正好是一个很好的解决方案，欢迎第三方 agent 实现，像 win agent 那样」*）。
所以 macOS 的活分在两个仓库：

| 仓库 | 说明 |
|---|---|
| [monitor-hub](https://github.com/plutolujh/monitor-hub) | hub：上游代码 + macOS 安装器与转发 + 部署 CI（本仓库） |
| [monitor-macOS](https://github.com/plutolujh/monitor-macOS) | macOS agent：第三方实现，自己发版、自己签名 |
| [monitor](https://github.com/monitor-probe/monitor) | 上游 hub |
| [agent](https://github.com/monitor-probe/agent) | 上游 Linux agent |

分开的原因只有一个：**同步上游时不会误伤 agent**。上游的改动落到 hub 仓库里，agent 的代码在另一个仓库，
两边各自发版、各自演进，hub 不再背着 agent 的源码。

## 与上游的差异

上游代码原样保留在 git 历史里，本仓库是在上游 `main` 之上追加提交，`upstream` remote 指向
`monitor-probe/monitor`。同步上游：

```bash
git fetch upstream && git merge upstream/main
```

上游的改动会落在提交之间，我们的改动集中在下面几处，冲突面很小。

**安装器认得 macOS。** `install.sh` 判断 `uname -s`，在 Darwin 上给**跑脚本的那个人**装 agent，
而不是给 root 装系统服务：文件进 `~/monitor-agent/`，作业注册在
`~/Library/LaunchAgents/com.monitor.agent.plist`，用 `launchctl bootstrap` 在那个用户自己的域里拉起。
所以 macOS 安装**不需要 sudo**——也不该给，给了会把 agent 装成 root 的，面板上会变成另一台机器。

launchd 用最小环境跑作业，所以作业里的路径在安装时写死成绝对路径，不靠运行时的 `$HOME`。

**hub 会转发 macOS agent。** 上游没有 macOS agent 的 release 可取，所以这是第三方自己发的版，
签在自己的密钥下。hub 照样按上游那套办法转发：从 release 取二进制与签名，二进制验签通过、
且 Mach-O 头里的架构与请求的一致，才发出去。镜像可以扣住或替换文件，但签不出能验过的签名。
密钥编译在 hub 二进制里（`MACOS_AGENT_SIGNING_KEY`），所以 agent 发新版本不需要重发 hub。

**安装器是编译进 hub 二进制的**（`src/main.rs` 里的 `include_str!("../install.sh")`），
所以 `https://monitor.hao123456.cn/install.sh` 的内容只在 hub 重建、重部署之后才会变。

## 改动落在哪些文件

- `install.sh` — 安装器，多了 Darwin 分支
- `src/main.rs` — hub，多了 macOS agent 的转发
- `.github/workflows/deploy.yml` — 构建 hub 并部署到 VPS

## 部署

`deploy.yml` 把 hub 构建成 `x86_64-unknown-linux-musl`——线上跑的就是这个静态目标，
宿主的 glibc 什么样它都能起——然后 rsync 到位、重启 `monitor-hub`，
最后按节点的方式拉一遍安装器和 agent 二进制自检。

它需要仓库里的 `env` 环境，带变量 `VPS_HOST`、`VPS_USER`，带密钥 `DEPLOY_SSH_KEY`、`SSH_KNOWN_HOSTS`。

## 在 macOS 上安装

```sh
curl -fsSL https://monitor.hao123456.cn/install.sh | sh -s -- \
  --server https://monitor.hao123456.cn --token YOUR_TOKEN
```

安装器认得 macOS，跳过 root 检查，把 agent 装进 `~/monitor-agent/`，
在 `~/Library/LaunchAgents/com.monitor.agent.plist` 注册 launchd 作业。

## 许可

上游的许可原样保留，见 `LICENSE`。
