# dsh-image-to-text

A DeepSeek Harness plugin that converts user images **and tool screenshots** into durable textual observations before the coding model sees them.

**Enable it separately for each endpoint/model:** open **Settings → Models**, scroll to **Image replacement**, and switch on **Replace Image with Txt** for the desired model. All switches default to **off**. Changes save immediately to the active Harness profile and take effect on the next agent step, without restarting the plugin.

Harness currently exposes extension slots at the provider-card level and below the Models list, but none inside the model row next to its Text/Image checkboxes. This plugin uses the supported area below the list, with switches grouped by endpoint and model, so installation works without patching Harness.

This targets servers such as StrixFold where an image-bearing request bypasses prompt caching. The vision call still contains an image; subsequent coding calls contain the saved description. The plugin removes this particular cache obstacle. It does not guarantee a particular cache hit rate or equal image-understanding quality.

## Behavior

1. A user uploads an image, or an agent tool returns a screenshot, while replacement is enabled for the agent's selected endpoint/model.
2. Before the next agent step, the plugin makes a separate vision request containing that image, the latest user task, and nearby text. It sends no tools or full conversation history. Multiple images are analyzed sequentially.
3. The description replaces the image in the model-visible conversation. Tool result identities and surrounding text remain intact.
4. The replacement is recorded in the session log and reused on later turns and after restart. Existing descriptions are never regenerated just because another turn arrives.

Original user messages and attachment references remain in `plugin:image-to-text/archive` records; original tool results remain unchanged in their source events. Image bytes remain in Harness's attachment storage, not in this repository. Files still available to the normal image-reading tool can be inspected again; each new image occurrence receives a fresh observation. There is no automatic attachment-reinspection tool in this version.

If analysis reaches its output cap, the plugin retries once with a larger budget. It never saves a truncated description. If analysis still fails, the default `passthrough` mode sends the original image to the coding model and logs a warning, allowing normal vision to continue. That request may bypass prompt caching. The image remains eligible for conversion on a later step. Set `failureMode: error` to stop the turn instead. User cancellation always stops the turn and never triggers passthrough.

## Compatibility

- Node.js 24 or later.
- DeepSeek Harness **0.2.2-rc.5** SDK, tested against upstream commit `2e39e70496aa02986ca6a820c5d497e816b69d7e`.
- An image-capable provider/model already configured in Harness. Its attachment handling and credentials are reused.

Harness is evolving quickly; peer dependencies pin the tested SDK version. The bundle's runtime range permits the 0.2.2 release line and later 0.2.x versions, but those later versions have not been tested. Check compatibility before upgrading.

## Install from GitHub

Install from the [GitHub repository](https://github.com/kloklojul/dsh-plugin-text-replacesment-for-images):

1. Open **Plugins → Add plugin** in Harness on each machine where the Harness application runs.
2. Enter `https://github.com/kloklojul/dsh-plugin-text-replacesment-for-images` and install/enable the bundle. For reproducible installations, select a published tag or commit using the installer's supported Git spec.
3. Restart Harness if its plugin manager reports that a restart is required.
4. In **Settings → Models → Image replacement**, enable **Replace Image with Txt** for the desired endpoint/model.
5. Start a **new conversation** for a clean cache comparison.

The package includes compiled `lib/` files and a `dsh.bundle` manifest, so installation does not require building this plugin on each machine. No npm publication is needed. Install it in the Harness application, not in StrixFold itself. The model hosts do not need it unless they also run Harness.

When enabled, the default uses each agent's selected provider and model for vision. For a local vision-capable `dsv41` setup this reuses that configured connection; there is no hardcoded hostname or API key. A separate vision provider is optional and can reduce work on the coding server. The switch always belongs to the **coding endpoint/model**, even when descriptions use a separate vision provider.

## Configuration

Defaults are provided by the bundle. To override them, merge this entry into the existing profile's `cordis.patch.yml` (usually `$DSH_HOME/profiles/web/cordis.patch.yml` for `dsh web`):

```yaml
- id: image-to-text
  name: dsh-image-to-text
  config:
    defaultEnabled: false
    routes:
      your-local-provider:
        dsv41: true
      your-relay-provider:
        dsv41: false
    # Both optional; use the provider ID and model ID registered in Harness.
    # provider: your-vision-provider
    # model: your-vision-model
    # Optional explicit override; otherwise a declared off/none effort is preferred.
    # reasoningEffort: none
    maxOutputTokens: 8192
    retryMaxOutputTokens: 32768
    failureMode: passthrough
    timeoutMs: 180000
    maxFocusChars: 12000
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `routes` | `{}` | Explicit boolean per provider ID and model ID. A Models-page switch changes only this pair. |
| `defaultEnabled` | `false` | Fallback for pairs without an explicit switch value. Keep false for normal per-model opt-in behavior. |
| `provider`, `model` | Current agent selection | Override both together to use a dedicated vision model. |
| `reasoningEffort` | Declared `off`/`none`, otherwise adapter default | Optional vision-only effort ID; it does not change the coding model's thinking settings. Unsupported effort IDs are never guessed. |
| `maxOutputTokens` | 8192 | Initial vision output cap, including reasoning when the provider counts it. Allowed: 1–32768. |
| `retryMaxOutputTokens` | 32768 | Output cap for one fresh attempt after truncation. At or below the initial cap disables this retry. |
| `failureMode` | `passthrough` | Keep the original image in the coding request on analysis failure, or use `error` to stop the turn. |
| `timeoutMs` | 180000 | Total vision deadline per image, shared by both attempts. Allowed: 1–3600000. The adapter must honor cancellation. |
| `maxFocusChars` | 12000 | Limit on task/context characters sent with each image. Allowed: 1–100000. |

The prompt requests a focused description of at most roughly 500–1500 words. If the vision provider advertises `off` or `none`, image descriptions use it automatically unless explicitly overridden. This avoids spending the description budget on hidden reasoning while leaving the coding model's thinking unchanged. For a gateway whose server defaults to thinking but whose Harness model declares no reasoning controls, configure a separate vision route to the same endpoint with the appropriate effort mapping, and select it with this plugin's `provider`/`model` fields.

Endpoint identity means the **provider route ID** saved in Harness. Two provider IDs with the same model ID have independent switches, even if they point at the same base URL. Editing a base URL while retaining its provider ID retains that route's setting. IDs containing dots or slashes are stored as literal keys.

Turning a switch off lets future unconverted images follow Harness's normal vision path. Already saved descriptions remain in history; the plugin does not rewrite old text back into images. Disabling the switch keeps the session projection registered, so existing conversations continue to replay correctly. Keep the model's **Image** input type enabled if its vision adapter requires that capability.

Credentials stay in Harness's provider settings. This plugin never reads an `.env` file or implements a second credential store. Descriptions and original attachment references are session data and follow Harness's storage policy. The default sends images to the current configured model; selecting another provider sends images and the bounded task context to that provider.

## Implementation and limits

The host plugin registers one global `agent/pre-step` listener. Harness's scope routing allows this listener to observe regular agents and subagents. At each step it captures the selected provider/model's live replacement policy. If enabled, it processes messages admitted through the normal step decision and images already on the session surface, including tool screenshots. Policy fields use Harness's volatile Config references: Models-page changes are durable, revision-fenced settings mutations that preserve the running plugin and projection registration.

Incoming images are archived before their text replacements enter the normal logged user-message channel. Existing surface images use a pure `plugin:image-to-text/project` session projection. Frozen `llm/stream` requests are never mutated. Vision requests are tagged with purpose `image-to-text` and go directly through the configured LLM runtime, so they do not recursively run the agent plugin.

- Descriptions are lossy. Fine visual details, exact geometry, OCR and visual comparisons can suffer; choose a capable vision model and re-read the original when needed.
- Existing conversations undergo a one-time prefix change when old images are converted. Later turns reuse the saved text. New screenshots add observations to history, and other sources of changing prompt prefixes can still reduce cache reuse.
- Each image occurrence costs a vision call. This version does not deduplicate identical files across different messages: the user's task or screenshot meaning may have changed.
- Images already marked `offloaded` are left alone; their missing observations cannot be recovered from that placeholder.
- Both records are written with `appendPluginRecord`, so they are marked `ignorable` and a stored session always reloads. With the plugin loaded, the projection replays the text replacements; without it, the records are skipped and the original images are shown again. Detached replay consumers must supply `imageToTextProjection` from `dsh-image-to-text/projection`.
- Versions before 0.2.2 wrote `image-to-text/project` and `image-to-text/archive` without the `ignorable` marker. Harness refuses to reload sessions containing those events; rename them to the `plugin:` types and add `"ignorable": true` to recover such sessions.
- Other plugins that make their own LLM calls or add images after this pre-step listener finishes are outside this interception boundary. Existing in-flight calls are unaffected.
- The observer prompt treats text in images as untrusted data. This reduces instruction confusion; descriptions do not constitute a security boundary.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run check
```

Tests run against the real Harness agent loop, session store, LLM runtime, tool executor and Loader, with a scripted model adapter. They cover uploads, an executed screenshot-producing tool, durable replay, multiple images, failed analysis, cancellation, timeouts, dedicated vision routing, independent endpoint/model policies, and live Loader updates preserving projection ownership. React component tests load the actual browser artifact through its module-loader factory and exercise saving switches, refusal/error handling, read-only settings, and catalog retry. They do not measure real model vision quality or StrixFold cache performance or launch the full Harness browser application.

Commit `src/`, `lib/`, `package-lock.json`, the manifest, documentation and tests together. `.upstream/` is an ignored reference checkout used during development and is not distributed. GitHub Actions checks Windows and Linux with Node 24 and 26 after publication.

To contribute from a fresh checkout:

```sh
git clone https://github.com/kloklojul/dsh-plugin-text-replacesment-for-images.git
cd dsh-plugin-text-replacesment-for-images
npm ci --ignore-scripts
npm run check
```

To publish changes from your checkout:

```sh
git add .
git commit -m "Describe the change"
git push -u origin main
```

## License

Apache-2.0, matching the repository's original license. This project is independent of DeepSeek and StrixFold.
