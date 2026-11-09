---
description: "为独立 DSH 消息消费者保留完整范围绑定的转发图及原始字节。"
kind: "package-bundle"
---
# dsh-qq-forward

[English](README.md) | 中文

## 摘要

本地候选提供协议无关的 Host 转发服务，保留发送者显示声明、嵌套资源、引用关系和媒体原件。准备按范围与操作 ID 持久去重，发送返回分类回执，不自动重试。不添加模型、人设、自动回复或 QQ 登录；协议适配器及原生所有者页面仍在开发，尚未发行。

## 使用本包

目标为 DSH 0.2.2-rc.1 与 Cordis 4.1；该已发布 DSH 宿主要求 Node >=24.9.0。本包没有应用启动程序，profile 必须提供 storageDomain 与 attachments；媒体原件需要已安装的 imMedia 提供者。核心在操作时解析可选媒体服务，因此后安装的提供者也能直接使用。

默认停用的 bundle 条目为 qq-forward，须在隔离 profile 明确启用。Config 解析容量，并校验命名空间、记录保留与媒体预算关系。受支持的应用仅通过 dsh profile 启动，测试不得加载未指定的生产 profile。

可信 Host 消费者按精确账号注册一个 ForwardProvider。read 接收完整会话范围、已接纳的外层消息 ID 与资源 ID；源适配器负责授权，转发昵称和账号不能授予访问权限。引用只能查询同一会话已接纳的缓存消息，不得全局 get_msg 查询或重发旧消息。

结果保留所有已解析节点，并明确列出缺失、歧义、循环及超限边；任何请求边未解析时 complete 为 false。不同外层授权下同名资源保持隔离，更短的引用路径可修正深度判断而不重复读取成功资源。超大源内容整体失败，不截断伪装成功。

prepare 接收来源 ID 或生成节点、已授权目标及稳定 operationId，拒绝不完整图与任意本机存储回执。同操作同输入共享一次准备，输入改变则冲突。媒体通过原生逐字节附件接口保留一次，并与完整图共同保存；重新打开存储不会抓取来源、重新生成或重放发送。

sendRetained 接收精确目标范围内的准备 ID，读取并校验原件，每次调用只尝试一次发送。缺少发送器、范围拒绝和发送前容量不足保持明确失败；调用发送器后的异常保持 uncertain。持久投送消费者必须负责操作去重及不确定结果核对，本核心不单独保证恰好一次发送。

renderPreview 是有界展示辅助，不替代源数据。它标记未核实发送者、资源边界与未解析引用，按 Unicode 码点计数并标记省略，按出现顺序返回不透明媒体引用。任何模型可见内容都必须由消费者写入自己的 DSH 会话事件。

materialize 将完整图转换为独立的内联展示树，保留嵌套资源、引用和消息段顺序。maxNodes、maxInlineDepth 与 maxPartsPerNode 同样限制重复展示展开，超限整体失败；不会修改保留的源文档，也不会丢弃不支持的普通消息段以伪装发送成功。

## 配置

所有部署容量均为明确的 Config 字段：namespace；maxConcurrentReads、maxProviderCalls、readTimeoutMs；maxTraversalDepth、maxInlineDepth、maxMessages、maxResources、maxNodes、maxPartsPerNode、maxTextChars、maxDocumentBytes；maxPrepared、maxRecordBytes、maxRetainedBytes、maxPendingMutations；maxConcurrentPrepares、maxConcurrentSends；maxAssets、maxMediaItemBytes、maxMediaBytes、mediaChunkBytes、maxMediaDimension、maxMediaPixels 及 allowedMediaMimeTypes。enabled 默认 false，范围和默认值见[配置 schema](src/config.ts)。

准备记录使用原生 domain 版本 1，保留至所有者明确管理；当前候选不提供删除、TTL 或迁移命令。恢复校验图可达性、引用一致性、循环、容量、内容指纹、精确范围和完整媒体覆盖，错误记录导致恢复失败，不跳过。

## 验证本候选

运行 npm run typecheck 与 npm test。单元测试使用合成身份、无网络提供者、真实原生 JSON 存储和真实原生附件流；测试及临时数据位于 .test-artifacts，不加载正式归档、人设、skills、QQ 账号或外部模型。取消测试使用显式屏障并等待真实清理，Node 22 仅作兼容探测，不改变宿主要求。

发行输入脚本在填充 npm 缓存前验证固定公开库归档。package.json 和 package-lock.json 保持公开依赖 URL；开发 bootstrap 暂时安装完全一致的已校验归档，并恢复公开清单，不以私有运行依赖或上级目录模块作为安装前提。

## 可选持久投送

独立的 dsh-qq-forward/job-delivery 入口要求可选 peer dsh-job-delivery 0.2.0-development 及已有 imForward/jobDelivery 服务，Config 字段为 enabled、provider、maxConcurrent。默认停用，提供 imForwardJobs.submit，接收 scope、actorId、operationId、preparedId；入队前校验保留授权，checkpoint 一个稳定转发引用。共享队列负责重试、不确定状态核对、观察与取消，适配器不复制源正文到任务请求。

提供者注册和发送容量释放通过范围绑定的失效事件唤醒现有队列。卸载适配器等待其生产者注册清理，准备数据及任务记录保留。经已安装传输服务的队列端到端投送仍待原生 profile 验收。

## 模型体验

间接影响。核心没有模型工具或提示词变更，转发内容、名称、链接和卡片都是不可信来源。消费者决定渲染、授权操作并记录模型可见事件；原生附件回执仅供 Host 使用，不接受模型指定文件位置。

## 已知限制与待办

- 独立 OneBot 桥接、原生所有者页面、离线实验室捕获及全新 bundle 安装验收仍待完成；可选持久投送适配器只有单元验收，不能替换正式处理。
- 核心不下载任意 URL，原件获取属于范围绑定的媒体提供者；存储按提供字节保留，不缩放或重编码。
- 发送者声明只供显示，后端时间和传输特定的不支持消息段取决于发送适配器。
- 服务器接纳回执不能证明 QQ 手机显示消息。本轮测试没有真实 QQ 消息、B站写入或模型请求。
