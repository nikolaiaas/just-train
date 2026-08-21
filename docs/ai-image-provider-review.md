# AI image provider review

Reviewed on 2026-08-21 for the `portrait.cartoon_3d` operation. This is a
technical and product-risk decision record, not legal advice.

## Decision

- **Technical test route:** Microsoft `microsoft/mai-image-2.5` through
  OpenRouter's Azure image endpoint, pinned to provider `azure` with fallback
  disabled.
- **Allowed test data:** synthetic people and consenting adults only.
- **Real child photos:** **no-go** through the current standard OpenRouter route.
  The database rejects child-labelled and child-profile-linked requests, the
  operation remains disabled, and the tester allowlist remains empty. Because
  a caller label cannot prove who appears in a photo, trusted-tester policy is
  also part of this temporary boundary.
- **Live route status:** **not verified**. The pinned OpenRouter Azure/MAI route
  returned HTTP 400 for two requests using the same fully synthetic
  fictional-child reference, including a 1024 by 1024 PNG. OpenRouter reported
  no billed usage for either request. The generic response does not identify
  the failing layer or prove that the depicted age caused the rejection, but it
  is sufficient reason not to activate the route.

Azure MAI is the closest current technical candidate because it accepts one
reference image, generates one image, and OpenRouter lists the Azure endpoint
as Zero Data Retention capable. MAI Image 2.5 is currently documented as a
preview model. OpenRouter's Images API can pin Azure and disable fallback, but
its image-specific request schema does not provide request-level `zdr` or
`data_collection` controls. ZDR therefore has to be enforced and verified with
an OpenRouter key guardrail and the live endpoint route. The request itself
separately enforces Azure-only routing with fallback disabled.

## Development key and live verification

On 2026-08-21 a separate 90-day development key was created with a USD 5
total limit. Its assigned guardrail has a USD 5 daily ceiling, allows only the
Azure provider and `microsoft/mai-image-2.5`, and enables non-frontier Zero Data
Retention. OpenRouter displays that ZDR mode as partially enforced because it
does not cover frontier models. This records the selected configuration and UI
status; it is not proof of end-to-end ZDR for a request. The key was installed
only in the ignored local Function environment and Hosted Development's Edge
secrets. No migration or Function was deployed, no tester was added, and the
operation remains disabled.

The first synthetic request used a 1254 by 1254 PNG and the second used a
freshly encoded 1024 by 1024 PNG. Both were submitted with Azure-only routing
and fallback disabled, returned HTTP 400, and consumed no OpenRouter credit;
OpenRouter's upstream log explicitly recorded one Azure attempt for the first.
A separate OpenAI ImageGen edit of the same synthetic reference successfully
produced the requested friendly 3D cartoon. That demonstrates the product
interaction, not an approved production processor route.

## Why child-photo production is blocked

1. OpenRouter's standard Data Processing Addendum says Sensitive Data is not
   intended unless the parties explicitly agree otherwise. An ordinary face
   photo is not automatically special-category biometric data under GDPR, but
   this operation deliberately preserves a recognizable face and skin tone,
   and OpenRouter's broader contractual classification remains unresolved.
2. Standard OpenRouter processing uses US hosting and transfer safeguards.
   OpenRouter's EU in-region routing is an enterprise feature, and the current
   Azure image endpoint does not by itself prove EU-only processing.
3. Azure states that model inputs and outputs are not used to train foundation
   models. Under Microsoft's standard Azure Direct Models posture, selected
   flagged prompts and outputs may be stored for human abuse review; automated
   review itself does not require that storage. Modified abuse monitoring
   removes the storage and human-review path while automated review may remain.
   OpenRouter still needs to confirm the exact configuration behind its
   ZDR-labelled Azure endpoint in writing.
4. Danish child/privacy work is still incomplete: legal basis, age-appropriate
   notice, verifiable guardian authority where required, withdrawal, deletion,
   retention, child rights, DPIA/risk review, and processor/subprocessor
   documentation.
5. OpenRouter requires API customers to comply with model/provider terms. A
   written provider position for this exact child portrait use case is still
   missing.

## Alternatives checked

- **Google Vertex image models:** rejected for this product route. Google's
  current Service Specific Terms prohibit using Generative AI Services in an
  application directed to, or likely to be accessed by, people under 18.
- **OpenAI GPT Image 2 through OpenRouter:** the closest capability match in
  current endpoint metadata. The separate successful ImageGen edit did not test
  this exact model or OpenRouter route and is only a product-interaction proof.
  OpenAI's under-18 API guidance requires extra safeguards and Zero Data
  Retention when processing personal data of children below the applicable age
  of digital consent. OpenRouter's current ZDR endpoint list does not include
  GPT Image, so this route is not acceptable for real child photos.
- **Krea image routes:** support reference editing, but route-specific ZDR,
  child-directed use, and processor terms could not all be verified from
  primary sources. Do not use without written confirmation.
- **Seed/ByteDance image routes:** current Seedream models appear on
  OpenRouter's ZDR list and BytePlus publishes a DPA, but the contractual link
  between that DPA and OpenRouter's exact `seed` endpoint, its processing
  region, and child-portrait use has not been established. Do not use real
  child photos without that written chain.
- **Black Forest Labs and xAI image routes:** technically support reference
  edits, but OpenRouter currently reports retention rather than ZDR for these
  routes. Black Forest Labs also states that its services are not directed to
  people under 18.
- **Direct Azure:** worth a separate processor and abuse-monitoring assessment,
  but it does not currently solve EU-only inference. MAI Image 2.5 is documented
  as a Global Standard deployment, for which Microsoft may process inference
  outside the resource geography. A direct route would still require an
  acceptable deployment geography plus the full child privacy and product
  safety review.

## Required before reconsidering real child photos

- written approval for processing this exact child portrait data and output;
- approved processor/DPA and subprocessor chain, including sensitive-data
  classification;
- verified EU-region processing and international-transfer position;
- a production-approved key guardrail enforcing ZDR, the exact model/provider
  allowlists, and a strict spend ceiling, plus verified request-level
  provider-only/no-fallback controls, all tested without exposing a secret;
- production-ready model status or an explicitly accepted preview-model risk;
- guardian/child notice and legal-basis flow, DPIA/risk review, retention,
  deletion, export, incident, and off-platform Storage recovery tests;
- provider-success checkpoint, idempotent finalization, stale-job recovery, and
  automatic deletion implemented before activation.

## Primary references

- [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter guardrails](https://openrouter.ai/docs/guides/features/guardrails)
- [OpenRouter Data Processing Addendum](https://openrouter.ai/data-processing-agreement)
- [OpenRouter terms](https://openrouter.ai/terms)
- [OpenRouter sovereign and EU routing](https://openrouter.ai/docs/guides/features/sovereign-ai)
- [OpenRouter current ZDR endpoints](https://openrouter.ai/api/v1/endpoints/zdr)
- [OpenRouter provider policies](https://openrouter.ai/providers)
- [OpenRouter image endpoint metadata](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2/endpoints)
- [Krea image endpoint metadata](https://openrouter.ai/api/v1/images/models/krea/krea-2-large/endpoints)
- [Seedream image endpoint metadata](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-0-pro/endpoints)
- [BytePlus Data Processing Addendum](https://docs.byteplus.com/en/docs/legal/docs-data-processing-addendum)
- [Black Forest Labs privacy policy](https://bfl.ai/legal/privacy-policy)
- [xAI image endpoint metadata](https://openrouter.ai/api/v1/images/models/x-ai/grok-imagine-image-2.0/endpoints)
- [OpenAI under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
- [Azure model data, privacy, and abuse monitoring](https://learn.microsoft.com/azure/foundry/responsible-ai/openai/data-privacy)
- [Microsoft MAI Image on Azure](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image)
- [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms)
- [Danish Data Protection Act](https://www.retsinformation.dk/eli/lta/2024/289)
