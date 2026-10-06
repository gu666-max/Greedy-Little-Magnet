# 版本管理与恢复

仓库：https://github.com/gu666-max/Greedy-Little-Magnet

## 发布约定

- `main` 保存已验证的交付代码；每次交付建立独立提交。
- 每次上传使用唯一版本号，并建立带说明的标签和对应 GitHub Release。
- 首版固定为 `v1.0.0`；玩法能力改版先保存为 `v1.1.0-beta.1` 体验版，经试玩验证后再发布 `v1.1.0`。修复使用补丁版本如 `v1.0.1`。
- 同步更新 `package.json` 版本和 `CHANGELOG.md`，记录功能、验证和限制。
- 发布标签保持不变。旧版不覆盖，不移动旧标签，不强制推送。
- 新玩法在独立功能分支开发，通过验证后再发布；每版可从 Release 单独下载。
- 临时截图、依赖、本机配置和本机记忆入口不纳入发布。

## 当前版本

| 版本 | 分支 | 内容 |
|---|---|---|
| v1.0.0 | main | 首个稳定版，60 秒经典回收 |
| v1.1.0-beta.1 | feature/assembly-playground | 组装能力体验版，90 秒废品战车 + 经典回收 |
| v1.1.0-beta.2-local | local/ram-head-preview | 仅本地预览，前置撞击头替换拖行铁球，不上传 GitHub |
| v1.2.0-beta.1-local | codex/game-modes | 三地图闯关、限时与生存；仅本地保存，不上传 GitHub |
| v1.2.0-beta.1 | codex/game-modes | 用户授权上传的网页 Demo，玩法与本地预览一致，独立预发布 Release |

体验版在独立分支发布，首版主线和标签不变。[体验版下载](https://github.com/gu666-max/Greedy-Little-Magnet/releases/tag/v1.1.0-beta.1)。

## 回退这次模式改动

旧版本地分支 `local/ram-head-preview` 与标签 `v1.1.0-beta.2-local` 保留本轮前的撞击头版。在工作区干净时使用 `git switch "local/ram-head-preview"` 恢复旧版，用 `git switch "codex/game-modes"` 返回三模式版。

无需修改当前目录，也可分别解压 `local-backups/Greedy-Little-Magnet-v1.1.0-beta.2-local.zip` 与 `local-backups/Greedy-Little-Magnet-v1.2.0-beta.1-local.zip`，双击各自的 `index.html` 试玩。ZIP 不含本机测试依赖。关卡进度使用独立存储键，旧版不会读取或覆盖关卡进度。

v1.2.0-beta.1-local 是上传前的固定本地回退点；2026-10-06 用户随后授权上传，同一玩法以 v1.2.0-beta.1 独立发布，不移动或覆盖原本地标签。

## 当前网页 Demo 与后续开发

当前 Demo：[v1.2.0-beta.1 下载](https://github.com/gu666-max/Greedy-Little-Magnet/releases/tag/v1.2.0-beta.1)，源码在 codex/game-modes。发布 ZIP 为 Greedy-Little-Magnet-v1.2.0-beta.1.zip，解压后双击 index.html 即可离线游玩。

网页 Demo 当前阶段停止新增玩法，后续根据用户指令继续。重新开始前先读 DEVELOPMENT.md，再检查工作区和项目记忆；发布标签始终固定。后续版本使用新分支与新标签，不覆盖当前 Demo。

比较当前 Demo 而不修改开发目录，可执行：

```powershell
git worktree add --detach "../Greedy-Little-Magnet-demo-v1.2.0-beta.1" "v1.2.0-beta.1"
```

## 回退之前的撞击头改动

旧版标签 `v1.1.0-beta.1` 和本地分支 `feature/assembly-playground` 都保留拖行铁球。确认工作区干净后，可用 `git switch "feature/assembly-playground"` 恢复旧版；再用 `git switch "local/ram-head-preview"` 切回撞击头。

也可在新目录对比，不改动当前目录：

```powershell
git worktree add --detach "../Greedy-Little-Magnet-before-ram" "v1.1.0-beta.1"
```

本次改动不推送、不创建 GitHub Release，本地保存版本标签 `v1.1.0-beta.2-local`。

## 直接下载旧版（推荐）

打开 [v1.0.0 版本页面](https://github.com/gu666-max/Greedy-Little-Magnet/releases/tag/v1.0.0)，下载源码 ZIP，解压到新目录，双击 `index.html`。不会影响当前开发目录。

## 在独立目录检出首版

在仓库目录运行：

```powershell
git worktree add --detach "../Greedy-Little-Magnet-v1.0.0" "v1.0.0"
```

随后打开新目录里的 `index.html`。当前分支和未提交改动不会被覆盖。

## 将主线恢复到首版

由代理执行时需要确认具体恢复范围，先保存未提交改动，再撤销首版之后的目标功能提交，生成新的恢复提交，并记录为新版本。建议使用 `git revert` 保留全部历史。

不要用强制推送、移动标签或 `git reset --hard` 覆盖历史。任何恢复发布都保留此前版本。
