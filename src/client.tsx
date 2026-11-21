/** Models-settings extension; runtime imports resolve through Harness's module loader. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ModelsFooterOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import { isReplacementEnabled, SETTINGS_NAMESPACE, toggleOperation } from './policy.js'
import type { ImagePolicy } from './policy.js'

export interface SettingsProps extends ModelsFooterOwnerProps {
  form?: ConfigForm<ImagePolicy>
  loadCatalog?: () => Promise<ModelCatalog>
  watchCatalog?: (listener: () => void) => () => void
}

export function ImageReplacementSettings(props: SettingsProps): ReactNode {
  if (!props.form || !props.loadCatalog || !props.watchCatalog) return null
  return <Controls form={props.form} loadCatalog={props.loadCatalog} watchCatalog={props.watchCatalog} />
}

function Controls({ form, loadCatalog, watchCatalog }: Required<Pick<SettingsProps, 'form' | 'loadCatalog' | 'watchCatalog'>>): ReactNode {
  const source = useMemo(() => ({
    subscribe: (listener: () => void) => form.subscribe(listener),
    getSnapshot: () => form.getSnapshot(),
  }), [form])
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const [catalog, setCatalog] = useState<ModelCatalog>()
  const [loadError, setLoadError] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    let generation = 0
    const load = async () => {
      const own = ++generation
      try {
        const value = await loadCatalog()
        if (active && own === generation) { setCatalog(value); setLoadError(undefined) }
      } catch (error) {
        if (active && own === generation) setLoadError(error instanceof Error ? error.message : String(error))
      }
    }
    void load()
    const dispose = watchCatalog(() => { void load() })
    return () => { active = false; dispose() }
  }, [loadCatalog, watchCatalog, refresh])

  async function save(provider: string, model: string, enabled: boolean) {
    if (pending.current) return
    pending.current = true
    setSaving(true)
    setSaveError(undefined)
    try {
      const accepted = await form.mutate([toggleOperation(provider, model, enabled)], state.revision)
      if (!accepted) setSaveError('The setting was not saved. Refresh settings and try again.')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally { pending.current = false; setSaving(false) }
  }
  const writable = state.status === 'ready' && state.writable && !saving
  return (
    <section aria-label="Image replacement" style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 'inherit', marginBottom: 8 }}>Image replacement</h3>
      <p style={{ opacity: 0.75, fontSize: 13 }}>Replace images with saved descriptions before coding requests. Choose separately for each endpoint and model.</p>
      {state.status !== 'ready' ? <p role="status">Image replacement settings are {state.status}.</p> : null}
      {state.status === 'ready' && !state.writable ? <p role="status">These settings are read-only.</p> : null}
      {!catalog && !loadError ? <p role="status">Loading models…</p> : null}
      {loadError ? <p role="alert">Could not load models: {loadError} <button type="button" onClick={() => setRefresh(value => value + 1)}>Retry</button></p> : null}
      {saveError ? <p role="alert">{saveError}</p> : null}
      {catalog?.failures.map(failure => <p key={failure.id} role="alert">{failure.name}: {failure.message}</p>)}
      {catalog && catalog.groups.length === 0 ? <p>No configured models. Add an endpoint and model above first.</p> : null}
      {catalog?.groups.map(provider => (
        <fieldset key={provider.id} style={{ border: '1px solid color-mix(in srgb, currentColor 20%, transparent)', borderRadius: 10, padding: 12, margin: '12px 0' }}>
          <legend>{provider.name} <small style={{ opacity: 0.65 }}>({provider.id})</small></legend>
          {provider.models.map(model => (
            <div key={model.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
              <span>{model.name}{model.name === model.id ? '' : ` (${model.id})`}</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={isReplacementEnabled(state.value ?? {}, provider.id, model.id)}
                  aria-label={`Replace Image with Txt — ${provider.id} / ${model.id}`} disabled={!writable}
                  onChange={event => { void save(provider.id, model.id, event.target.checked) }} />
                Replace Image with Txt
              </label>
            </div>
          ))}
        </fieldset>
      ))}
      {saving ? <p role="status">Saving…</p> : null}
      <p style={{ opacity: 0.65, fontSize: 12 }}>Changes save immediately and apply from the next agent step. Existing descriptions stay in conversation history.</p>
    </section>
  )
}

export const inject = ['slots', 'configForms', 'remote', 'remote.session']
export function apply(ctx: Context): void {
  const form = ctx.configForms.get<ImagePolicy>(SETTINGS_NAMESPACE)
  const loadCatalog = async (): Promise<ModelCatalog> => {
    const response = await ctx.remote.session.modelCatalog()
    if (!response.ok) throw new Error(response.error.message)
    return response.value
  }
  const watchCatalog = (listener: () => void) => {
    const disposers = [
      ctx.remote.$on('llm/adapters-updated', listener),
      ctx.remote.$on('llm/models-updated', listener),
      ctx.remote.$on('settings/document-updated', listener),
      ctx.on('connection/reset', listener),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: 'image-to-text', order: 50,
    inject: () => ({ form, loadCatalog, watchCatalog }),
  }, ImageReplacementSettings))
}
