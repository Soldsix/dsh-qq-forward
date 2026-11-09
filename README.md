---
description: "Read nested QQ forwards, retain original media and compose durable delivery in a DSH profile."
kind: "package-bundle"
---
# dsh-qq-forward

English | [中文](README.zh.md)

## Summary

Read nested forwards together with their quoted messages, keep exact original media, and preview retained output in the native plugin page. Add the bundle to an isolated DSH profile and enable the core explicitly. Optional OneBot and durable-job adapters reuse existing transport and task services. No model, automatic reply, login or background schedule is created.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration and owner page](#configuration)
- [Understand the implementation](#implementation)
- [Verification](#verification)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#limitations)

-----

<a id="use-this-package"></a>
## Use this package

Use DSH 0.2.2-rc.1 and Cordis 4.1. The published Host requires Node >=24.9.0. This package has no application binary; supported applications launch through dsh profiles. Install the reviewed tarball into your isolated profile with `dsh plugin --profile <profile> add <archive> --ignore-scripts`. Native SDK and Web tests exercise this installation path.

The bundle inserts qq-forward with enabled=false and a separate qq-forward-control entry. Enable qq-forward in cordis.patch.yml or the native owner page. The profile supplies storageDomain and attachments. Original acquisition requires a scoped imMedia provider; the core resolves that optional service when an operation starts. Installing the core alone does not connect to QQ.

For OneBot dispatch, install dsh-qq-onebot 0.4.0-development separately and mount dsh-qq-forward/onebot with enabled=true. The adapter requires existing imForward and qqOnebot services. It reads only admitted forward grants and cached quoted messages in the exact conversation; it never performs global get_msg lookup. Removing the adapter leaves the separately owned connection running.

For durable delivery, install dsh-job-delivery 0.2.0-development separately and mount dsh-qq-forward/job-delivery with enabled=true. Its provider and maxConcurrent fields select the shared producer registration. imForwardJobs.submit accepts scope, actorId, operationId and preparedId, then checkpoints one retained forward reference. The queue preserves accepted receipts across restarts and requires explicit reconciliation of uncertain outcomes.

-----

<a id="configuration"></a>
## Configuration and owner page

The native Web plugin page exposes every core setting, runtime counters, scoped record pagination, bounded escaped previews and paged original downloads. Images and GIFs display original bytes; audio and video use native browser controls. HTML and other active documents download as attachments with sandbox and nosniff headers. Owner RPC methods independently reject non-owner principals, including principals with a global action grant.

Settings save and explicit restart require idle IO and an observed configuration revision. Drafts survive refresh and failed saves. Namespace changes cannot hide retained records, and tighter limits cannot strand existing graphs or original media. A busy operation refuses maintenance; it is not silently cancelled. Disabling and re-enabling the core preserves stored records.

Core capacities are declared in [Config](src/config.ts) and [the browser field inventory](src/fields.ts): namespace; read/provider concurrency and deadlines; traversal, inline depth, node, part, text and document limits; prepared-record retention and mutation limits; prepare/send concurrency; original counts, bytes, dimensions, pixels, chunk size and MIME policy. prepareTimeoutMs bounds the entire preparation, including media acquisition, independently of readTimeoutMs. Cancellation waits for owned work to settle.

qq-forward-control has independent targetEntryId, statusRefreshMs, pageSize, maxScopeOptions, previewChars and previewMedia settings. Preview limits never truncate retained source data or original downloads. The owner route exports only an attachment belonging to the selected scope and prepared ID; it accepts no arbitrary location.

-----

<a id="implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

Trusted Host consumers register a ForwardProvider per exact account. read retains a graph with explicit unresolved, ambiguous, cyclic and limited edges. Equal resource IDs under different outer-message grants remain distinct. Oversized source content fails intact. prepare refuses an incomplete graph and deduplicates by scope plus operation ID and input fingerprint. It retains native attachment receipts with the complete graph. Reopening storage neither fetches sources nor replays sends.

Prepared records use native domain version 1. Recovery validates graph reachability, quote consistency, capacities, fingerprints, exact scope and complete media coverage. Invalid records fail recovery. Metadata previews are detached from immutable originals. Native receipts remain Host-only. See [the runtime](src/runtime.ts), [storage](src/store.ts) and [wire validation](src/wire.ts).

materialize expands nested resources and quotes into an ordered display tree under explicit duplication limits. The OneBot adapter refuses unsupported parts and whole forwards containing files before calling the sender; it never drops parts to simulate success. Supported original bytes receive scoped temporary transport handles, which are released after settlement. sendRetained attempts once per invocation; sender exceptions remain uncertain. Operation-level deduplication belongs to the durable queue.

</details>

<a id="verification"></a>
## Verification

npm run check runs strict Host/Client typechecks, behavior tests and package guards. Tests exercise recursive graphs, exact scope, native JSON/attachment storage, cancellation barriers, concurrent conversations, original policy, owner controls and actual published OneBot/job adapters. Loopback protocol frames are simulation evidence, not QQ phone verification.

After npm pack --pack-destination artifacts, npm run test:dsh -- --minimum-free-bytes 1073741824 installs a fresh SDK profile and verifies prepare, cross-process receipt recovery and owner reload. npm run test:web -- --minimum-free-bytes 1073741824 --browser-cache <installed-playwright-cache> installs a fresh Web profile and drives its own headless browser through the native page. All artifacts stay under .test-artifacts. No production persona, skills, memory, credentials or live QQ destination is loaded.

<a id="model-experience"></a>
## Model Experience

Indirect. This bundle adds no model tool or prompt. Forwarded text, sender claims, links and cards are untrusted content. A consuming plugin authorizes access and must record every model-visible input in its own DSH session events. Displayed sender names never establish identity.

<a id="limitations"></a>
## Known Limitations and Deferred Work

- Full forward-graph capture is available through the optional dsh-plugin-lab/forward entry in [dsh-plugin-lab 0.3.0-development](https://github.com/Soldsix/dsh-plugin-lab/releases/tag/v0.3.0-development). It verifies nested sources, quotes and original mappings in an isolated profile. QQ phone rendering and desktop-native UI remain separate acceptance work.
- The core does not download arbitrary URLs, resize media, delete records, enforce TTL or migrate data. A scoped media provider supplies originals; native storage retains exactly those bytes. Transport delivery may have separate protocol limits.
- An immutable attachment imported before a later cancellation or admission conflict may remain under native attachment ownership. This package does not delete shared originals.
- Source authorization belongs to the provider and caller. A prepared output alone does not guarantee exactly-once delivery. Confirm uncertain results before a retry; server acceptance does not prove client display.

### Dev Note

The pre-release does not replace production robot handling automatically. Release evidence lives in the repository evidence directory; no model, live QQ message or Bilibili write is required for these tests.
