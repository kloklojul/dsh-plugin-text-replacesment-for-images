export function replaceImages(message, replacements) {
    const pending = new Map();
    for (const item of replacements) {
        if (!Number.isSafeInteger(item.index) || item.index < 0 || pending.has(item.index)
            || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 65536) {
            throw new Error('image-to-text: invalid or duplicate image replacement');
        }
        pending.set(item.index, item.description);
    }
    let index = 0;
    const content = message.content.map(block => {
        if (block.type !== 'image')
            return block;
        const description = pending.get(index++);
        if (description === undefined)
            return block;
        if (block.offloaded)
            throw new Error('image-to-text: cannot replace an already offloaded image');
        pending.delete(index - 1);
        return { type: 'text', text: `[Image observation; original retained in session log]\n${description}\n[End image observation]` };
    });
    if (pending.size)
        throw new Error('image-to-text: replacement does not refer to an image');
    return { ...message, content };
}
export const imageToTextProjection = {
    type: 'image-to-text/project',
    project(event, context) {
        if (!event.data || !Array.isArray(event.data.targets) || !event.data.targets.length) {
            throw new Error('image-to-text: targets must be nonempty');
        }
        const result = new Map();
        for (const target of event.data.targets) {
            if (!target || !Number.isSafeInteger(target.seq) || target.seq < 0 || result.has(target.seq)
                || !context.nodes.includes(target.seq) || !Array.isArray(target.replacements) || !target.replacements.length) {
                throw new Error('image-to-text: invalid projection target');
            }
            const source = context.events[target.seq - context.baseSeq];
            if (source?.type !== 'user/message' && source?.type !== 'tool/result') {
                throw new Error('image-to-text: target must be a user message or tool result');
            }
            const message = context.messages.get(target.seq)
                ?? (source.type === 'user/message' ? source.data : source.data.message);
            result.set(target.seq, replaceImages(message, target.replacements));
        }
        return result;
    },
};
