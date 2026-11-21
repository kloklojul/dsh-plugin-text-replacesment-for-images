/** Browser-safe routing policy shared by the switch and the agent interceptor. */
export type ModelRoutes = Readonly<Record<string, Readonly<Record<string, boolean>>>>;
export interface ImagePolicy {
    defaultEnabled?: boolean;
    routes?: ModelRoutes;
}
export declare const SETTINGS_NAMESPACE = "image-to-text";
export declare function isReplacementEnabled(policy: ImagePolicy, provider: string, model: string): boolean;
/** Literal path segments preserve provider IDs and model IDs containing dots or slashes. */
export declare function toggleOperation(provider: string, model: string, enabled: boolean): {
    op: "set";
    path: string[];
    value: boolean;
};
