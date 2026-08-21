# AI image provider review

Reviewed on 2026-08-21 for the `portrait.cartoon_3d` operation. This is a
technical and product-risk decision record, not legal advice.

## Decision

- **Private family prototype route:** OpenAI `openai/gpt-image-2` through
  OpenRouter's Images API, pinned to provider `openai` with fallback disabled.
- **Product data:** an authenticated family member may submit one photo linked
  to a currently selected active child in that member's family. Development,
  automated tests, previews, and task evidence remain synthetic-only.
- **Risk decision:** the owner has explicitly accepted the remaining
  under-18/provider risk for this private family prototype. This is not a legal
  or production approval for a broader child pilot.
- **Live route status:** **verified with synthetic data**. The exact pinned
  OpenRouter route returned HTTP 200 and a valid PNG in about 19 seconds.

The operation keeps its requested prompt in an immutable database version:

> Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features.

The active version 2 sends one validated input reference with a 1:1 aspect
ratio, low quality, opaque background, and one requested result. Clients cannot
supply the prompt, model, provider, or arbitrary model options. There is no
feature or tester toggle. Authentication, family isolation, selected-child
linkage, private Storage, the server-only key, one provider attempt,
idempotency, timeout, and request/cost ceilings remain enforced.

## Development key and live verification

On 2026-08-21 a separate 90-day development key was created with a USD 5
total limit. Its assigned guardrail now retains only a USD 5 daily spending
ceiling. The earlier Azure/model allowlists and non-frontier Zero Data Retention
requirement were deliberately removed. Exact route control is still enforced
by the worker request with `provider.only: ["openai"]` and
`allow_fallbacks: false`.

The key is installed only in the ignored local Function environment and Hosted
Development's Edge secrets. On 2026-08-21 protected PR #4 deployed the two AI
migrations through the native Supabase integration, after which
`process-ai-job` was deployed separately with JWT verification enabled. The
hosted Function returned HTTP 401 without authentication and HTTP 200 for its
CORS preflight, confirming that the active deployment remains behind the
expected authentication boundary.

An authenticated Hosted Development end-to-end verification on the same date
uploaded a synthetic image for the selected synthetic child, processed one job
through the deployed Function and OpenAI GPT Image 2 route, and displayed the
generated result from private Storage. This proves the deployed family path;
it does not close the separate recovery, finalization, retention, or broader
privacy work listed below.

The earlier local synthetic end-to-end verification used a fully synthetic
1024 by 1024 PNG, the exact prompt above, model `openai/gpt-image-2`, and the
same OpenAI-only/no-fallback route as the worker. It returned HTTP 200, one
valid PNG, and generation ID
`gen-img-1787315324-mf0eyF1qKxxS42h1pzy4` in about 19 seconds. OpenRouter marked
the call as BYOK and reported USD 0 billed by OpenRouter; its response reported
USD 0.014237 of upstream inference cost. No real family image was used.

The initial immutable version 1 history used Microsoft
`microsoft/mai-image-2.5`, Azure-only, with fallback disabled. Its two
credentialed synthetic requests returned HTTP 400 and consumed no OpenRouter
credit. A separate OpenAI ImageGen edit had proved the interaction, but not the
exact route. The new GPT Image 2 request is the first successful verification
of the route now implemented by the worker.

## Accepted prototype risk and remaining work

1. OpenRouter's standard Data Processing Addendum says Sensitive Data is not
   intended unless the parties explicitly agree otherwise. An ordinary face
   photo is not automatically special-category biometric data under GDPR, but
   this operation deliberately preserves a recognizable face and skin tone,
   and OpenRouter's broader contractual classification remains unresolved.
2. Standard OpenRouter processing uses US hosting and transfer safeguards.
   OpenRouter's EU in-region routing is an enterprise feature, and the current
   GPT Image route does not claim EU-only processing.
3. OpenAI's under-18 API guidance calls for additional safeguards and Zero Data
   Retention when personal data of children below the applicable age of digital
   consent is processed. OpenRouter's current ZDR endpoint list does not include
   GPT Image, and the budget-only guardrail does not claim ZDR.
4. Danish child/privacy work is still incomplete: legal basis, age-appropriate
   notice, verifiable guardian authority where required, withdrawal, deletion,
   retention, child rights, DPIA/risk review, and processor/subprocessor
   documentation.
5. OpenRouter requires API customers to comply with model/provider terms. A
   written provider position for this exact child portrait use case is still
   missing. The owner accepts this uncertainty only for the private family
   prototype.
6. Input and output records contain `delete_after` deadlines, but no worker yet
   proves that private Storage bytes are physically deleted. Database backups
   also do not restore Storage object bytes.

## Alternatives checked

- **Google Vertex image models:** rejected for this product route. Google's
  current Service Specific Terms prohibit using Generative AI Services in an
  application directed to, or likely to be accessed by, people under 18.
- **OpenAI GPT Image 2 through OpenRouter:** selected for the private family
  prototype after the exact synthetic route succeeded. It is the closest
  capability match in current endpoint metadata. Its non-ZDR status remains an
  accepted prototype risk, not a broader production approval.
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

## Required before a broader real-child rollout

- written approval for processing this exact child portrait data and output;
- approved processor/DPA and subprocessor chain, including sensitive-data
  classification;
- verified EU-region processing and international-transfer position;
- a production-approved privacy posture and key guardrail, including a strict
  spend ceiling and any required ZDR/model/provider controls, plus verified
  request-level provider-only/no-fallback controls, all tested without exposing
  a secret;
- production-ready model status or an explicitly accepted preview-model risk;
- guardian/child notice and legal-basis flow, DPIA/risk review, retention,
  deletion, export, incident, and off-platform Storage recovery tests;
- provider-success checkpoint, idempotent finalization, stale-job recovery, and
  automatic deletion implemented and verified rather than inferred from
  `delete_after` metadata.

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
- [OpenAI GPT Image 2 model](https://developers.openai.com/api/docs/models/gpt-image-2)
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
