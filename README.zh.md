---
description: "在 DSH profile 中读取嵌套 QQ 转发、保留原始媒体，并组合持久投送。"
kind: "package-bundle"
---
# dsh-qq-forward

[English](README.md) | 中文

## 概要

读取嵌套转发及其引用消息，保留逐字节原始媒体，并在原生插件页面预览已保留内容。将 bundle 加入隔离 DSH profile 后明确启用核心。可选 OneBot 与持久任务适配器复用已有传输及任务服务。本插件不创建模型、自动回复、登录或后台定时任务。

## 目录

- [使用本包](#use-this-package)
- [配置与所有者页面](#configuration)
- [实现说明](#implementation)
- [验证](#verification)
- [模型体验](#model-experience)
- [已知限制与待办](#limitations)

-----

<a id="use-this-package"></a>
## 使用本包

使用 DSH 0.2.2-rc.1 与 Cordis 4.1。已发布 Host 要求 Node >=24.9.0。本包没有应用二进制入口；受支持应用通过 dsh profile 启动。使用 `dsh plugin --profile <profile> add <archive> --ignore-scripts`，将已审核归档安装到隔离 profile。原生 SDK 与 Web 测试执行此安装路径。

bundle 插入默认 enabled=false 的 qq-forward，以及独立 qq-forward-control 条目。通过 cordis.patch.yml 或原生所有者页面启用 qq-forward。profile 提供 storageDomain 和 attachments。获取原件需要范围绑定的 imMedia 提供者；核心在操作开始时解析该可选服务。只安装核心不会连接 QQ。

若需 OneBot 投送，单独安装 dsh-qq-onebot 0.4.0-development，并挂载 enabled=true 的 dsh-qq-forward/onebot。适配器要求已有 imForward 与 qqOnebot 服务。它只读取精确会话中已接纳的转发授权及已缓存引用消息，不执行全局 get_msg 查询。卸载适配器不会关闭独立管理的连接。

若需持久投送，单独安装 dsh-job-delivery 0.2.0-development，并挂载 enabled=true 的 dsh-qq-forward/job-delivery。其 provider 与 maxConcurrent 字段配置共享生产者注册。imForwardJobs.submit 接收 scope、actorId、operationId、preparedId，并 checkpoint 一个已保留转发引用。队列跨重启保留接纳回执，不确定结果必须明确核对。

-----

<a id="configuration"></a>
## 配置与所有者页面

原生 Web 插件页面提供全部核心设置、运行计数、按会话分页记录、有界转义预览与分页原件下载。图片和 GIF 展示原始字节；音视频使用浏览器原生控件。HTML 等主动文档以附件下载，并设置 sandbox 与 nosniff 响应头。所有者 RPC 方法分别拒绝非所有者身份，包括获得全局动作授权的身份。

保存设置与明确重启要求读写空闲，并提交已观测配置版本。刷新与保存失败保留草稿。更改命名空间不能隐藏已保留记录；收紧容量不能使已有图或原始媒体不可读。工作进行中会拒绝维护，不会静默取消。停用再启用核心保留存储记录。

核心容量均声明于 [Config](src/config.ts) 和[浏览器字段清单](src/fields.ts)：命名空间；读取与提供者并发及期限；遍历、内联深度、节点、消息段、文字与文档容量；准备记录保留与变更容量；准备及发送并发；原件数量、字节、尺寸、像素、分块与 MIME 策略。prepareTimeoutMs 独立于 readTimeoutMs，限制包括媒体获取在内的完整准备过程。取消会等待所管理工作结束。

qq-forward-control 独立配置 targetEntryId、statusRefreshMs、pageSize、maxScopeOptions、previewChars 与 previewMedia。预览限制不截断保留源数据或原件下载。所有者路由仅导出属于所选会话范围及准备 ID 的附件，不接受任意位置。

-----

<a id="implementation"></a>
## 实现说明

<details>
<summary>实现细节</summary>

可信 Host 消费者按精确账号注册 ForwardProvider。read 保留图，并明确标记未解析、歧义、循环和超限边。不同外层消息授权下的同名资源保持隔离。超大源内容整体失败。prepare 拒绝不完整图，并按会话范围、操作 ID 及输入指纹去重；完整图与原生附件回执共同保留。重新打开存储不会抓取来源或重放发送。

准备记录使用原生 domain 版本 1。恢复校验图可达性、引用一致性、容量、指纹、精确范围与完整媒体覆盖；错误记录导致恢复失败。元数据预览独立于不可变原件。原生回执仅供 Host 使用。详见[运行时](src/runtime.ts)、[存储](src/store.ts)和[输入校验](src/wire.ts)。

materialize 在明确重复展开容量下，将嵌套资源和引用转换为有序展示树。OneBot 适配器在调用发送器前拒绝不支持消息段及含文件的完整转发，不通过丢弃消息段伪装成功。受支持原始字节使用范围绑定的临时传输句柄，结束后释放。sendRetained 每次调用仅尝试一次；发送器异常保持 uncertain。操作级去重由持久队列负责。

</details>

<a id="verification"></a>
## 验证

npm run check 执行严格 Host/Client 类型检查、行为测试和归档检查。测试覆盖递归图、精确范围、原生 JSON/附件存储、取消屏障、并发会话、原件策略、所有者控制，以及真实已发布 OneBot/任务适配器。回环协议帧属于模拟证据，不是 QQ 手机验收。

执行 npm pack --pack-destination artifacts 后，npm run test:dsh -- --minimum-free-bytes 1073741824 安装全新 SDK profile，验证准备、跨进程回执恢复与所有者重载。npm run test:web -- --minimum-free-bytes 1073741824 --browser-cache <installed-playwright-cache> 安装全新 Web profile，通过自有无头浏览器操作原生页面。所有产物位于 .test-artifacts，不加载正式人设、skills、记忆、凭据或真实 QQ 目标。

<a id="model-experience"></a>
## 模型体验

间接影响。本 bundle 不增加模型工具或提示词。转发文字、发送者声明、链接和卡片均是不可信内容。消费插件负责授权访问，并必须将每项模型可见输入写入自身 DSH 会话事件。显示的发送者名称不能证明身份。

<a id="limitations"></a>
## 已知限制与待办

- [dsh-plugin-lab 0.3.0-development](https://github.com/Soldsix/dsh-plugin-lab/releases/tag/v0.3.0-development) 的可选 dsh-plugin-lab/forward 入口已支持在隔离 profile 验证完整转发来源、嵌套引用及原件映射。QQ 手机呈现与桌面原生 UI 仍需单独验收。
- 核心不下载任意 URL、不缩放媒体、不删除记录、不提供 TTL 或数据迁移。范围绑定媒体提供者提供原件，原生存储保留完全相同字节。传输投送可能有独立协议限制。
- 若在后续取消或入库冲突前已导入不可变附件，附件可能继续由原生附件服务保留；本包不删除共享原件。
- 来源授权由提供者与调用者负责。仅准备输出不能保证恰好一次投送。不确定结果必须先核对再决定是否重试；服务端接纳不证明客户端已展示。

### 开发备注

此预发行版不会自动替换正式机器人处理。发行证据位于仓库 evidence 目录；这些测试不需要模型、真实 QQ 消息或 B站写入。
