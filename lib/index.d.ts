import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { ModelRoutes } from './policy.js';
export declare const name = "image-to-text";
export declare const inject: string[];
declare module '@deepseek-ai/dsh-llm' {
    interface LlmRequestPurposeMap {
        'image-to-text': true;
    }
}
export interface Config {
    defaultEnabled?: boolean | Volatile<boolean>;
    routes?: ModelRoutes | Volatile<ModelRoutes>;
    provider?: string;
    model?: string;
    reasoningEffort?: GenerateOptions['reasoningEffort'];
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxFocusChars?: number;
}
/** Only policy fields are volatile: changing a switch retains projection ownership and in-flight calls. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    defaultEnabled: z<boolean, boolean, "volatile-defined">;
    routes: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<import("@deepseek-ai/cosmokit").Dict<boolean, string>, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<import("@deepseek-ai/cosmokit").Dict<boolean, string>, string>>, "volatile-defined">;
    provider: z<string, string, "plain">;
    model: z<string, string, "plain">;
    reasoningEffort: z<string, string, "plain">;
    maxOutputTokens: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    maxFocusChars: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    defaultEnabled: z<boolean, boolean, "volatile-defined">;
    routes: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<import("@deepseek-ai/cosmokit").Dict<boolean, string>, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<import("@deepseek-ai/cosmokit").Dict<boolean, string>, string>>, "volatile-defined">;
    provider: z<string, string, "plain">;
    model: z<string, string, "plain">;
    reasoningEffort: z<string, string, "plain">;
    maxOutputTokens: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    maxFocusChars: z<number, number, "defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config?: Config): void;
