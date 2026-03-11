# Steam转库存V1.0.exe 逆向摘要

## 结论
- 目标程序不是 PyInstaller / UPX / 传统原生黑盒，而是 **.NET 8 single-file bundle**。
- 主逻辑位于 **`SteamInventoryManager.dll`**。
- 通过 **`Microsoft.NET.HostModel.Bundle.Extractor`** 已可把内嵌程序集和依赖从 exe 中提取出来。

## 已确认的关键文件
- `SteamInventoryManager.dll`
- `SteamInventoryManager.deps.json`
- `SteamInventoryManager.runtimeconfig.json`
- `SteamAuth.dll`
- `SteamKit2.dll`
- `Newtonsoft.Json.dll`
- 一整套 WPF / .NET 依赖

## 已确认的核心模块
- `SteamInventoryManager.Program` — 程序入口
- `SteamAutoLogin.TransferInventoryForm` — 主界面 / 主流程入口
- `SteamInventoryManager.Model.Setting` — 配置中心（对应 Setting.json）
- `OutlookUpdateEmail.LoadAccount` — 账号导入 / maFile 匹配
- `SteamInventoryManager.Form.LoginForm` — 登录界面
- `SteamInventoryManager.Model.Account` — 账号状态聚合模型
- `SteamInventoryManager.Model.DataController` — 核心调度总控
- `SteamInventoryManager.Actions.TradeOfferAction` — 交易动作
- `SteamInventoryManager.Model.UserController` — 登录与用户会话复用
- `SteamInventoryManager.Model.SteamGuardController` — maFile / 2FA 验证码

## 核心流程结论
真正的业务总控在 **`DataController`**。

已确认的流程骨架：
1. 并发登录待转号
2. 拉库存并按规则筛选物品
3. 按主库号剩余额度分配并发报价
4. 根据 `Transfer_Type` 决定：
   - `0`：边发起边接受
   - `1`：全部发起后统一接受

## 交易逻辑关键点
- 真正发货更接近通过 `user.ArchiWebHandler.SendInventory(...)` 进入。
- `TradeOfferAction.SendTradeOffer(...)` 已确认存在。
- 单个 trade offer 默认最多 **255 项**。
- 发送逻辑会做拆单。

## 登录 / maFile 结论
- 程序主路径优先使用 **maFile 登录**，不是每次都纯账号密码硬登。
- `SteamGuardController` 会读取 `account.MafilesPath` 并生成验证码。
- 本地登录记忆使用 `Setting.Instance`，并带 **AES-CBC** 加密保存。

## 修改优先级建议
### 第一层：最容易改
1. `Setting`
2. `TransferInventoryForm`
3. `LoadAccount`

适合修改：
- UI 文案
- 默认配置
- 导入逻辑
- maFile 目录逻辑
- 备份 / 文件路径逻辑

### 第二层：核心业务
4. `DataController`
5. `TradeOfferAction`
6. `SteamGuardController`
7. `UserController`

适合修改：
- 转移流程
- 接受 / 确认流程
- Steam 通信方式
- 并发逻辑
- 上传 / 备份时机

### 第三层：账号 / 授权系统
8. `LoginForm`
9. `AccountAction`

适合修改：
- 登录界面
- 授权逻辑
- 本地记忆密码逻辑
- 对接自定义服务器

## 当前最值得继续深挖
如果目标是后面真正改程序内容，**优先深挖 `DataController`**。

原因：
- 它是流程总控
- 改自动备份 / 上传服务器 / 转移规则 / 接受时机 / UI 按钮行为，都要经过它

## 备注
完整长版学习笔记保存在本地工作区：
- `steam_xfer_reverse_study.md`
- `steam_xfer_all_48_with_misc.txt`
