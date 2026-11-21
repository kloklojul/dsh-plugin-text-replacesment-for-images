/** Browser-safe routing policy shared by the switch and the agent interceptor. */
export type ModelRoutes = Readonly<Record<string, Readonly<Record<string, boolean>>>>
export interface ImagePolicy { defaultEnabled?: boolean; routes?: ModelRoutes }
export const SETTINGS_NAMESPACE = 'image-to-text'

export function isReplacementEnabled(policy: ImagePolicy, provider: string, model: string): boolean {
  const models = policy.routes && Object.hasOwn(policy.routes, provider) ? policy.routes[provider] : undefined
  return models && Object.hasOwn(models, model) ? models[model] === true : policy.defaultEnabled === true
}

/** Literal path segments preserve provider IDs and model IDs containing dots or slashes. */
export function toggleOperation(provider: string, model: string, enabled: boolean) {
  if (!provider || !model) throw new Error('image-to-text: provider and model must not be empty')
  return { op: 'set' as const, path: ['routes', provider, model], value: enabled }
}
