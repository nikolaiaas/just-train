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

Azure MAI is the closest current technical candidate because it accepts one
reference image, generates one image, and OpenRouter lists the Azure endpoint
as Zero Data Retention capable. MAI Image 2.5 is currently documented as a
preview model. OpenRouter's Images API can pin Azure and disable fallback, but
its image-specific request schema does not provide request-level `zdr` or
`data_collection` controls. ZDR therefore has to be enforced and verified with
an OpenRouter key guardrail and the live endpoint route. The request itself
separately enforces Azure-only routing with fallback disabled.

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
- **Krea and Seed/ByteDance image routes:** not selected because no adequate
  public DPA and route-specific child-use, retention, or transfer documentation
  was located beyond their public [Krea use policy](https://www.krea.ai/krea-2-use-policy)
  and [BytePlus acceptable-use policy](https://docs.byteplus.com/en/docs/legal/docs-acceptable-use-policy).
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
- a key guardrail enforcing ZDR, the exact model/provider allowlists, and a
  strict spend ceiling, plus verified request-level Azure-only/no-fallback
  controls, all tested without exposing a secret;
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
- [Azure model data, privacy, and abuse monitoring](https://learn.microsoft.com/azure/foundry/responsible-ai/openai/data-privacy)
- [Microsoft MAI Image on Azure](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image)
- [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms)
- [Danish Data Protection Act](https://www.retsinformation.dk/eli/lta/2024/289)
