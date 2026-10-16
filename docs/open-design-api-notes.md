# OpenDesign Cloud API: verified connection notes

Checked 16 October 2026. No API key is included in this document.

## Connection and verification

- User-supplied base URL: `https://amr-link.open-design.ai/v1`.
- Authentication verified using an `Authorization: Bearer <API_KEY>` header.
- A read-only `GET /models` request returned HTTP 200 and 12 model IDs.
- An ordinary unauthenticated browser request to the base path `/v1` returned 404. That result does not establish that the model API is unavailable.
- Successful catalogue authentication does not establish generation compatibility, available credit, or that every listed model accepts every protocol. Those require separate checks when an actual generation task is requested.

## Protocols and roles

The official site's API FAQ describes compatibility with OpenAI Chat Completions, OpenAI Responses and Anthropic Messages. Validate protocol/model combinations for the intended client. Expected OpenAI-style generation routes relative to the supplied base are `/responses` and `/chat/completions`; no generation request was made during this check.

This is a model API connection. It can receive prompts and return model output. It does not by itself grant access to local project files, design-system assets, project management, previews or publishing. The separate design-workspace integration previously returned a transport error; the working model-catalogue request does not repair or validate that integration.

For a design task, provide the brief, relevant design-system specification and existing UI context through the appropriate workflow. Do not assume that sending a prompt to a hosted model automatically applies a selected design system or updates the app repository.

## Model catalogue observed

These are the IDs returned for this key at verification time, not a permanent availability guarantee:

- `claude-haiku-5.5`
- `deepseek-v4-flash`
- `deepseek-v4-flash-vision-exp`
- `deepseek-v4-pro`
- `deepseek-v4.1-flash`
- `glm-5.3-flash`
- `glm-5.3-flashx`
- `gpt-6-luna`
- `hy4-preview`
- `kimi-k2.7-code`
- `mimo-v2.6-flash`
- `mimo-v2.6-pro`

Query the live catalogue before choosing a model. Do not infer input modalities, context limits, tool support or prices from a model name alone.

## Usage and integration

Official documentation says API usage shares OpenDesign Cloud credits and usage windows. Model availability and allowance depend on the account/plan. Do not infer the account's balance or plan from this catalogue response.

If later integrating the API into The Road Problem, make model calls server-side and use the deployment's secret configuration. Do not place credentials in browser bundles, public environment variables, source-controlled files, design briefs or generated artifacts. Configuration and generation were not part of this connection check.

## Primary references

- [Official API/credit FAQ and plan information](https://open-design.ai/pricing/)
- [Official API protocol compatibility FAQ](https://open-design.ai/es/pricing/?audience=team)
- [Official source and workspace capabilities](https://github.com/nexu-io/open-design)

Verification evidence in this document is a summary of the live read-only request. Raw credential-bearing requests and the key were not written to project files.
