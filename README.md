---
description: "Retain complete scoped forward graphs and original bytes for independent DSH messaging consumers."
kind: "package-bundle"
---
# dsh-qq-forward

English | [中文](README.zh.md)

## Summary

This local candidate contributes a protocol-neutral Host service for scoped recursive forwards. It retains sender display claims, nested resources, quoted-message associations and exact media originals. Preparation is durable and deduplicated by scope plus operation ID; sending returns classified receipts without automatic retries. It adds no model, persona, automatic reply or QQ login. Protocol adapters and native owner controls are still under development; this repository is not a published release.

## Use this package

The target is DSH 0.2.2-rc.1 with Cordis 4.1. The published DSH Host requires Node >=24.9.0. This bundle has no application binary. The profile must supply storageDomain and attachments; media originals require an installed imMedia provider. The core resolves optional media at operation time, so a provider installed later is usable without recreating the core.

The disabled bundle entry is qq-forward. Enable it explicitly in an isolated profile. Config resolves capacities and validates namespace, record-retention and media-budget relationships. Supported application startup belongs to dsh profiles only. Do not load an undeclared production profile for testing.

Trusted Host consumers register one ForwardProvider per exact account. read accepts a complete conversation scope, admitted outer-message ID and resource ID. Source adapters own authorization; a forwarded name or user ID never grants access. Quote lookup must use admitted cached messages in that exact conversation, without global get_msg lookup or republishing old messages.

The result preserves every resolved node plus explicit missing, ambiguous, cyclic and limited edges. complete is false whenever any requested edge is unresolved. Equal resource IDs under different outer-message grants remain distinct. Shorter reference paths relax depth limits without repeating successful resource reads. Oversized source bodies fail intact rather than being truncated.

prepare accepts source IDs or generated nodes, an authenticated destination and a stable operationId. It refuses incomplete graphs and arbitrary native storage receipts. The same operation and input share one preparation; changed input conflicts. Referenced media are copied through the native verbatim attachment API once and retained with the exact graph. Reopening native storage does not fetch sources, regenerate content or replay sends.

sendRetained accepts a prepared ID in its exact destination scope and reads verified original bytes. It makes one sender attempt per invocation. A missing sender, refused scope or pre-dispatch capacity failure remains a failure; an exception after invoking a sender remains uncertain. A durable delivery consumer must deduplicate operation IDs and reconcile uncertain outcomes; this core alone does not guarantee exactly-once sending.

renderPreview is a bounded presentation helper, not a replacement for source data. It labels unverified senders, resource boundaries and unresolved references, counts Unicode code points and marks omissions. It returns opaque media references in encounter order. Any material exposed to a model must be recorded by the consuming plugin in its own DSH session events.

materialize converts a complete graph into a detached inline display tree while preserving nested resources, quotes and part order. maxNodes, maxInlineDepth and maxPartsPerNode also bound repeated display expansion; exceeding them fails the complete operation. It never changes the retained source document or discards unsupported ordinary parts to make a send succeed.

## Configuration

All deployment capacities are explicit Config fields: namespace; maxConcurrentReads, maxProviderCalls, readTimeoutMs; maxTraversalDepth, maxInlineDepth, maxMessages, maxResources, maxNodes, maxPartsPerNode, maxTextChars, maxDocumentBytes; maxPrepared, maxRecordBytes, maxRetainedBytes, maxPendingMutations; maxConcurrentPrepares, maxConcurrentSends; maxAssets, maxMediaItemBytes, maxMediaBytes, mediaChunkBytes, maxMediaDimension, maxMediaPixels and allowedMediaMimeTypes. enabled defaults to false. See [the schema](src/config.ts) for ranges and defaults.

Prepared records use native domain version 1. They are retained until their owner explicitly manages them; this candidate provides no deletion, TTL or migration command. Record recovery validates graph reachability, quote consistency, cycles, capacities, content fingerprints, exact scope and complete media coverage. Invalid records fail recovery rather than being skipped.

## Verify this candidate

Run npm run typecheck and npm test. Unit tests use synthetic identities, loopback-independent providers, actual native JSON storage and actual native attachment streams. Test files and temporary data stay under .test-artifacts; no production archive, persona, skills, QQ account or external model is loaded. Cancellation tests use barriers and await actual cleanup. Node 22 results are compatibility probes, not a change to the Host requirement.

The release-input scripts verify immutable public library archives before seeding npm's cache. package.json and package-lock.json retain public dependency URLs; the development bootstrap temporarily installs the exact verified archives and restores the public manifest. No private runtime dependency or ancestor module is intended as an installation prerequisite.

## Optional durable delivery

The separate dsh-qq-forward/job-delivery entry requires the optional dsh-job-delivery 0.2.0-development peer and existing imForward/jobDelivery services. Its Config fields are enabled, provider and maxConcurrent. The default-disabled adapter exposes imForwardJobs.submit with scope, actorId, operationId and preparedId. It validates the retained grant before queue admission and checkpoints one stable prepared forward reference. The shared queue owns retries, uncertainty reconciliation, observation and cancellation; the adapter copies no source body into the task request.

Provider registration and send-capacity releases wake the existing queue through scoped invalidation. Removing the adapter joins its producer registration; retained prepared data and task records are preserved. End-to-end queue dispatch through an installed transport is still pending native-profile verification.

## Model Experience

Indirect. There are no model tools or prompt changes in the core. Forwarded content, names, links and cards are untrusted source material. A consumer decides whether to render it, authorizes the operation and records model-visible events. Native attachment receipts are Host-only data, not model-selected filesystem locations.

## Known Limitations and Deferred Work

- The independent OneBot bridge, native owner page, offline-lab capture and fresh bundle-installation verification are pending. The optional durable delivery adapter has unit verification only. This candidate is not ready to replace production handling.
- The core does not download arbitrary URLs. Original acquisition belongs to the scoped media provider; storage preserves the bytes it supplies without resizing or re-encoding.
- Sender claims are retained for display only. Backend timestamps and transport-specific unsupported parts depend on the selected sender adapter.
- Confirmed server receipts do not prove a QQ phone displayed a message. No real QQ, Bilibili write or model request has been made during these tests.
