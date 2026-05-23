# CloudBase CLI 登录方法

本文档记录当前项目使用 CloudBase CLI 登录腾讯云云开发环境的方法，供后续 Agent 复用。

## 项目信息

- 云开发环境 ID：`cloud1-9gqeut4h5f964174`
- 小程序 AppID：`wx2b8ff48151cc1a2b`
- 项目根目录：`E:\余子豪\在进行的事\银发人才服务平台开发\miniprogame-new-main`
- 当前验证日期：`2026-05-21`

## 当前登录验证结果

已通过 CloudBase CLI 登录验证：

- CLI 版本：`CloudBase CLI 3.4.0`
- 登录命令返回：`You are logged in. No need to log in again.`
- 环境列表可见目标环境：`cloud1-9gqeut4h5f964174`
- 环境状态：`Normal`
- 环境到期时间：`2026-05-31 23:59:59`

> 登录态由 CloudBase CLI 保存在当前 Windows 用户的本地凭据中，不应把任何密钥、Token、SecretId、SecretKey 写入项目文件。

## 推荐执行方式

Windows PowerShell 可能会因为执行策略拦截 `npm.ps1` / `npx.ps1`，因此建议使用 `npx.cmd`。

为了避免 npm 默认缓存目录权限问题，建议把 npm 临时缓存放到项目根目录下的 `.npm-cache`：

```powershell
cd "E:\余子豪\在进行的事\银发人才服务平台开发\miniprogame-new-main"
$env:npm_config_cache = (Join-Path (Get-Location) ".npm-cache")
```

查看 CloudBase CLI 版本：

```powershell
npx.cmd --yes --package=@cloudbase/cli tcb --version
```

执行登录：

```powershell
npx.cmd --yes --package=@cloudbase/cli tcb login
```

如果当前机器已经登录，命令会提示：

```text
You are logged in. No need to log in again.
```

如果未登录，CLI 会进入授权流程；在无头环境或 Agent 环境中，通常会输出授权链接 `verification_uri` 和用户码 `user_code`，按提示在浏览器中打开链接、输入用户码并确认授权即可。

## 验证登录与环境权限

登录后执行：

```powershell
npx.cmd --yes --package=@cloudbase/cli tcb env list
```

确认输出中包含：

```text
cloud1-9gqeut4h5f964174
Environment Status: Normal
```

## 后续 Agent 使用建议

1. 先执行版本命令确认 CLI 可运行。
2. 再执行 `tcb login`，若提示已登录，可直接继续云开发操作。
3. 用 `tcb env list` 验证能看到 `cloud1-9gqeut4h5f964174`。
4. 后续云函数、数据库、存储等操作都应显式指定环境 ID：`cloud1-9gqeut4h5f964174`。
5. 不要在仓库中保存云 API 密钥；如必须使用密钥登录，应只在本机安全输入或通过受保护环境变量传入。

## 参考

- CloudBase 官方 CLI 安装与登录文档：`https://docs.cloudbase.net/cli-v1/install`
