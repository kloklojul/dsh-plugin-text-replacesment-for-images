export const SETTINGS_NAMESPACE = 'image-to-text';
export function isReplacementEnabled(policy, provider, model) {
    const models = policy.routes && Object.hasOwn(policy.routes, provider) ? policy.routes[provider] : undefined;
    return models && Object.hasOwn(models, model) ? models[model] === true : policy.defaultEnabled === true;
}
/** Literal path segments preserve provider IDs and model IDs containing dots or slashes. */
export function toggleOperation(provider, model, enabled) {
    if (!provider || !model)
        throw new Error('image-to-text: provider and model must not be empty');
    return { op: 'set', path: ['routes', provider, model], value: enabled };
}
