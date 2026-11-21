import type { ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ModelsFooterOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ImagePolicy } from './policy.js';
export interface SettingsProps extends ModelsFooterOwnerProps {
    form?: ConfigForm<ImagePolicy>;
    loadCatalog?: () => Promise<ModelCatalog>;
    watchCatalog?: (listener: () => void) => () => void;
}
export declare function ImageReplacementSettings(props: SettingsProps): ReactNode;
export declare const inject: string[];
export declare function apply(ctx: Context): void;
