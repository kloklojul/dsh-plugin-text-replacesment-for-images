/** Pure, browser-safe replay of durable replacements. Originals remain in the log. */
import type { Message, UserMessage } from '@deepseek-ai/dsh-llm';
import type { SessionSeq } from '@deepseek-ai/dsh-session/types';
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface';
export interface Replacement {
    index: number;
    description: string;
}
export interface Target {
    seq: SessionSeq;
    replacements: Replacement[];
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** @messageProjection */
        'image-to-text/project': {
            targets: Target[];
        };
        'image-to-text/archive': {
            original: UserMessage;
            replacement: UserMessage;
        };
    }
}
export declare function replaceImages<T extends Message>(message: T, replacements: Replacement[]): T;
export declare const imageToTextProjection: SessionMessageProjection<'image-to-text/project'>;
