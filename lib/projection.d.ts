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
/**
 * Plugin-owned log records. Harness refuses to reload a stored session that contains an event
 * type outside its built-in vocabulary unless the event is marked `ignorable`, so both records are
 * written with `appendPluginRecord`, which stores them under the `plugin:` namespace with that
 * marker. A reader without this plugin skips them and keeps the original images.
 */
export declare const PROJECT_RECORD: "plugin:image-to-text/project";
export declare const ARCHIVE_RECORD: "plugin:image-to-text/archive";
export interface ArchiveRecord {
    original: UserMessage;
    replacement: UserMessage;
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** @messageProjection Typed here only so the projection can name it; written as a plugin record. */
        'plugin:image-to-text/project': {
            targets: Target[];
        };
    }
    interface PluginRecordMap {
        'plugin:image-to-text/project': {
            targets: Target[];
        };
        'plugin:image-to-text/archive': ArchiveRecord;
    }
}
export declare function replaceImages<T extends Message>(message: T, replacements: Replacement[]): T;
export declare const imageToTextProjection: SessionMessageProjection<typeof PROJECT_RECORD>;
