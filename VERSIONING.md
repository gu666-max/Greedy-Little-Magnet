# 版本管理与恢复

仓库：https://github.com/gu666-max/Greedy-Little-Magnet

## 发布约定

- `main` 保存已验证的交付代码；每次交付建立独立提交。
- 每次上传使用唯一版本号，并建立带说明的标签和对应 GitHub Release。
- 首版固定为 `v1.0.0`，玩法能力改版计划使用 `v1.1.0`；修复使用补丁版本如 `v1.0.1`。
- 同步更新 `package.json` 版本和 `CHANGELOG.md`，记录功能、验证和限制。
- 发布标签保持不变。旧版不覆盖，不移动旧标签，不强制推送。
- 新玩法在独立功能分支开发，通过验证后再发布；每版可从 Release 单独下载。
- 临时截图、依赖、本机配置和本机记忆入口不纳入发布。

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
