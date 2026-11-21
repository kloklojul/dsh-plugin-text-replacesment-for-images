import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, createUserMessage, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as plugin from '../lib/index.js'
import { imageToTextProjection, replaceImages } from '../lib/projection.js'

const image = (name = 'screenshot.png') => ({ type: 'image', attachment: {
  attachmentId: `sha256:${'a'.repeat(64)}`, name, mediaType: 'image/png', bytes: 1, width: 1, height: 1,
} })
const user = (...content) => createUserMessage({ content, source: { kind: 'user' } })
const text = value => ({ type: 'text', text: value })
const hasImage = options => options.messages.some(m => m.content.some(b => b.type === 'image' && !b.offloaded))
const response = (value, kind = 'stop') => [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: value },
  { type: 'block-end', index: 0, block: text(value) },
  { type: 'finish', reason: { kind } },
]
class Adapter extends LlmAdapter {
  requests = []
  constructor(script) { super(); this.script = script }
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, ...(this.reasoning ? { reasoning: this.reasoning } : {}) }
  }
  async *stream(options) {
    this.requests.push(options)
    const entry = this.script.shift()
    assert.ok(entry, 'unexpected model call')
    if (typeof entry === 'function') yield* await entry(options)
    else yield* entry
  }
}
async function harness(t, script, config = {}, viaLoader = false) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  const raw = { defaultEnabled: true, failureMode: 'error', retryMaxOutputTokens: 8192, ...config }
  let pluginFiber
  let update
  if (viaLoader) {
    const { default: Loader } = await import('@deepseek-ai/cordis-plugin-loader')
    await ctx.plugin(Loader)
    ctx.loader.builtins.imageToText = plugin
    const id = await ctx.loader.create({ id: 'image-to-text', name: 'cordis:imageToText', config: raw })
    const entry = ctx.loader.resolve(id)
    pluginFiber = entry.fiber
    await pluginFiber.await()
    update = async config => { await entry.update({ config: { ...entry.options.config, ...config } }); await entry.fiber.await() }
  } else {
    pluginFiber = ctx.plugin(plugin, raw)
    await pluginFiber
    update = config => pluginFiber.update(config)
  }
  const driver = await mountAgentLoopTestHarness(ctx)
  const adapter = new Adapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = await driver.create('test-agent', { provider: 'mock', model: 'main' })
  return { ctx, adapter, agent, pluginFiber, driver, update }
}
async function send(agent, message) {
  agent.followup(message)
  await agent.whenIdle()
}
const pluginEvents = agent => agent.session.snapshotEvents().filter(e => e.type.startsWith('image-to-text/'))

test('user upload is described once; original retained; later turns remain text-only', async t => {
  const { agent, adapter } = await harness(t, [response('Four cedar posts and a blue roof.'), response('answer'), response('second answer')])
  await send(agent, user(text('Inspect the pergola roof'), image()))
  assert.equal(adapter.requests.length, 2)
  assert.ok(hasImage(adapter.requests[0]))
  assert.equal(adapter.requests[0].tools, undefined)
  assert.equal(adapter.requests[0].messages.length, 1)
  assert.match(adapter.requests[0].messages[0].content[0].text, /pergola roof/)
  assert.equal(hasImage(adapter.requests[1]), false)
  assert.match(JSON.stringify(adapter.requests[1].messages), /Four cedar posts/)
  assert.equal(JSON.stringify(adapter.requests[1].messages).match(/Four cedar posts/g).length, 1, 'delta and final block must not duplicate text')
  const archive = pluginEvents(agent)[0]
  assert.equal(archive.type, 'image-to-text/archive')
  assert.ok(archive.data.original.content.some(b => b.type === 'image'))
  await send(agent, user(text('Now adjust the sun')))
  assert.equal(adapter.requests.length, 3)
  assert.equal(hasImage(adapter.requests[2]), false)
  assert.deepEqual(pluginEvents(agent), [archive])
  const restored = Session.create('restored', agent.session.snapshotEvents(), undefined, undefined, [imageToTextProjection])
  assert.deepEqual(restored.deriveMessages(), agent.session.deriveMessages())
})

test('tool screenshots are projected before the following main call', async t => {
  const { agent, adapter } = await harness(t, [response('initial'), response('A broken red button.'), response('fixed')])
  await send(agent, user(text('Repair the red button')))
  agent.session.append('assistant/message', { turn: 1, step: 1, message: createAssistantMessage({
    content: [{ type: 'tool-call', id: 'call-1', name: 'read_image', arguments: '{}' }],
    source: { provider: 'mock', model: 'main' },
  }), stream: [] }, { surfaceOp: 'append' })
  const source = agent.session.append('tool/result', {
    turn: 1, step: 1, message: createToolResultMessage({ callId: 'call-1', isError: false, content: [text('preview.png'), image('preview.png')] }),
  }, { surfaceOp: 'append' })
  await send(agent, user(text('Continue')))
  assert.equal(adapter.requests.length, 3)
  assert.ok(hasImage(adapter.requests[1]))
  assert.match(adapter.requests[1].messages[0].content[0].text, /Repair the red button/)
  assert.equal(hasImage(adapter.requests[2]), false)
  assert.match(JSON.stringify(adapter.requests[2].messages), /broken red button/)
  assert.ok(source.data.message.content.some(b => b.type === 'image'))
  const projected = agent.session.deriveEventMessage(source)
  assert.equal(projected.id, source.data.message.id)
  assert.equal(projected.toolCallId, 'call-1')
  assert.ok(projected.content.every(b => b.type !== 'image'))
  const restored = Session.create('restored-tool', agent.session.snapshotEvents(), undefined, undefined, [imageToTextProjection])
  assert.deepEqual(restored.deriveMessages(), agent.session.deriveMessages())
})

test('multiple images are handled sequentially and retain order', async t => {
  const { agent, adapter } = await harness(t, [response('first observation'), response('second observation'), response('answer')])
  await send(agent, user(text('Compare these'), image('first'), text('then'), image('second')))
  assert.equal(adapter.requests.length, 3)
  assert.equal(hasImage(adapter.requests[2]), false)
  const rendered = JSON.stringify(adapter.requests[2].messages)
  assert.ok(rendered.indexOf('first observation') < rendered.indexOf('second observation'))
})

test('a screenshot produced by a real executed tool is intercepted within the same turn', async t => {
  const call = { type: 'tool-call', id: 'screenshot-call', name: 'take_screenshot', arguments: '{}' }
  const { ctx, agent, adapter } = await harness(t, [
    [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'block-end', index: 0, block: call },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    response('Screenshot shows a displaced roof.'), response('I will repair the roof.'),
  ])
  ctx.tools.register({
    name: 'take_screenshot', description: 'Take a preview screenshot',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'boolean' }, render: () => [image('tool-screenshot.png')] },
    execute: async () => true,
  })
  await send(agent, user(text('Inspect and repair the roof')))
  assert.equal(adapter.requests.length, 3)
  assert.equal(hasImage(adapter.requests[0]), false)
  assert.equal(hasImage(adapter.requests[1]), true)
  assert.equal(adapter.requests[1].tools, undefined)
  assert.equal(hasImage(adapter.requests[2]), false)
  assert.match(JSON.stringify(adapter.requests[2].messages), /displaced roof/)
  assert.equal(pluginEvents(agent)[0].type, 'image-to-text/project')
})

test('a previously archived admission is reused without another vision call', async t => {
  const original = user(text('Inspect the beams'), image())
  const { ctx, agent, adapter } = await harness(t, [response('Sturdy beams.')])
  const dispatch = (await import('@deepseek-ai/dsh-agent')).agentEvents(ctx, agent)
  const payload = { messages: [original], turn: 1, step: 1, signal: new AbortController().signal, modelSelection: { provider: 'mock', model: 'main' } }
  const first = await dispatch.waterfall('agent/pre-step', payload, async () => ({ kind: 'enter', messages: [original] }))
  const second = await dispatch.waterfall('agent/pre-step', payload, async () => ({ kind: 'enter', messages: [original] }))
  assert.deepEqual(first, second)
  assert.equal(adapter.requests.length, 1)
  assert.equal(pluginEvents(agent).length, 1)
})

test('timeout aborts cooperative vision adapters and prevents a main call', async t => {
  const { agent, adapter } = await harness(t, [async options => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('adapter ignored deadline')), 1000)
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason) }, { once: true })
    })
    return []
  }], { timeoutMs: 20 })
  await send(agent, user(image()))
  assert.equal(adapter.requests.length, 1)
  assert.equal(pluginEvents(agent).length, 0)
})

test('configuration rejects unbounded limits and incomplete model selection', () => {
  for (const config of [{ provider: 'mock' }, { model: 'vision' }, { timeoutMs: -1 }, { maxOutputTokens: 0 }, { maxFocusChars: 1.5 }]) {
    assert.throws(() => plugin.apply({}, config))
  }
})

for (const [label, stream] of [
  ['empty output', response('')],
  ['truncation', response('unfinished', 'max-tokens')],
  ['missing finish', [{ type: 'text-delta', index: 0, text: 'partial' }]],
  ['exception', () => { throw new Error('vision unavailable') }],
]) test(`${label} prevents the main call and leaves original input in durable inbox log`, async t => {
  const { agent, adapter } = await harness(t, [stream])
  await send(agent, user(text('Inspect'), image()))
  assert.equal(adapter.requests.length, 1)
  assert.equal(pluginEvents(agent).length, 0)
  assert.ok(JSON.stringify(agent.session.snapshotEvents()).includes('screenshot.png'))
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'turn/end').at(-1).data.reason.kind, 'error')
})

test('cancellation during image analysis cannot archive or enter the main call', async t => {
  let started
  const ready = new Promise(resolve => { started = resolve })
  const { agent, adapter } = await harness(t, [async options => {
    started()
    await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
    return []
  }])
  agent.followup(user(image()))
  await ready
  await agent.cancel()
  await agent.whenIdle()
  assert.equal(adapter.requests.length, 1)
  assert.equal(pluginEvents(agent).length, 0)
})

test('dedicated vision provider/model configuration leaves main model unchanged', async t => {
  const { agent, adapter } = await harness(t, [response('observation'), response('answer')], { provider: 'mock', model: 'vision' })
  await send(agent, user(image()))
  assert.deepEqual(adapter.requests.map(r => r.model), ['vision', 'main'])
})

test('text-only and previously offloaded inputs do not trigger image analysis', async t => {
  const { agent, adapter } = await harness(t, [response('answer')])
  await send(agent, user(text('Hello'), { ...image(), offloaded: true }))
  assert.equal(adapter.requests.length, 1)
  assert.equal(pluginEvents(agent).length, 0)
})

test('projection preserves identity and rejects invalid targets atomically', () => {
  const session = Session.create('projection', undefined, undefined, undefined, [imageToTextProjection])
  const source = session.append('user/message', user(text('before'), image(), text('after')), { surfaceOp: 'append' })
  const before = session.deriveMessages()
  assert.throws(() => session.append('image-to-text/project', { targets: [
    { seq: source.seq, replacements: [{ index: 0, description: 'valid' }] },
    { seq: 999, replacements: [{ index: 0, description: 'invalid' }] },
  ] }))
  assert.deepEqual(session.deriveMessages(), before)
  session.append('image-to-text/project', { targets: [{ seq: source.seq, replacements: [{ index: 0, description: 'A roof' }] }] })
  assert.equal(session.deriveMessages()[0].id, before[0].id)
  assert.equal(before[0].content[1].type, 'image')
  assert.equal(session.deriveMessages()[0].content[1].type, 'text')
})

test('replacement rejects out-of-range, duplicate and empty descriptions', () => {
  const message = user(image())
  for (const replacements of [
    [{ index: 1, description: 'bad' }],
    [{ index: 0, description: '' }],
    [{ index: 0, description: 'one' }, { index: 0, description: 'two' }],
  ]) assert.throws(() => replaceImages(message, replacements))
})

test('replacement is opt-in by default', async t => {
  const { agent, adapter } = await harness(t, [response('normal vision answer')], { defaultEnabled: false })
  await send(agent, user(image()))
  assert.equal(adapter.requests.length, 1)
  assert.equal(adapter.requests[0].purpose, undefined)
  assert.equal(pluginEvents(agent).length, 0)
  assert.equal(hasImage(adapter.requests[0]), true)
  const defaults = plugin.Config({})
  assert.equal(defaults.defaultEnabled.get(), false)
  assert.deepEqual(defaults.routes.get(), {})
})

test('the same model on different endpoints and other models have independent switches', async t => {
  const { ctx, agent, adapter, driver } = await harness(t, [response('observation'), response('answer'), response('native model'), response('native endpoint')], {
    defaultEnabled: false, routes: { mock: { main: true }, other: { main: false } },
  })
  ctx.llm.registerAdapter(['other'], adapter)
  const otherModel = await driver.create('other-model', { provider: 'mock', model: 'secondary' })
  const otherEndpoint = await driver.create('other-endpoint', { provider: 'other', model: 'main' })
  await send(agent, user(image()))
  await send(otherModel, user(image()))
  await send(otherEndpoint, user(image()))
  assert.deepEqual(adapter.requests.map(r => [r.provider, r.model, r.purpose]), [
    ['mock', 'main', 'image-to-text'], ['mock', 'main', undefined],
    ['mock', 'secondary', undefined], ['other', 'main', undefined],
  ])
  assert.equal(pluginEvents(otherModel).length, 0)
  assert.equal(pluginEvents(otherEndpoint).length, 0)
})

test('live switch updates retain projection ownership and apply on the next step', async t => {
  const { ctx, agent, adapter, pluginFiber, update } = await harness(t, [
    response('normal image turn'), response('saved observation'), response('converted turn'), response('normal again'),
  ], { defaultEnabled: false }, true)
  const reference = pluginFiber.effectiveConfig.routes
  const projection = ctx.sessions.messageProjections.find(p => p.type === 'image-to-text/project')
  await send(agent, user(image()))
  await update({ defaultEnabled: false, routes: { mock: { main: true } } })
  assert.equal(pluginFiber.effectiveConfig.routes, reference, 'toggle must update the stable volatile reference')
  assert.equal(ctx.sessions.messageProjections.find(p => p.type === 'image-to-text/project'), projection)
  await send(agent, user(text('Continue')))
  assert.equal(adapter.requests[1].purpose, 'image-to-text')
  assert.equal(hasImage(adapter.requests[2]), false)
  const saved = agent.session.deriveMessages()[0]
  await update({ defaultEnabled: false, routes: { mock: { main: false } } })
  await send(agent, user(image('new.png')))
  assert.equal(adapter.requests.length, 4)
  assert.equal(adapter.requests[3].purpose, undefined)
  assert.equal(hasImage(adapter.requests[3]), true)
  assert.deepEqual(agent.session.deriveMessages()[0], saved)
})

test('truncated analysis retries once and persists only the complete replacement', async t => {
  const { agent, adapter } = await harness(t, [response('partial observation', 'max-tokens'), response('complete observation'), response('answer')], {
    maxOutputTokens: 4096, retryMaxOutputTokens: 32768,
  })
  await send(agent, user(image()))
  assert.deepEqual(adapter.requests.slice(0, 2).map(request => request.maxTokens), [4096, 32768])
  assert.equal(hasImage(adapter.requests[2]), false)
  assert.match(JSON.stringify(adapter.requests[2].messages), /complete observation/)
  assert.doesNotMatch(JSON.stringify(pluginEvents(agent)), /partial observation/)
})

test('exhausted analysis retries pass the original image through without failing the coding turn', async t => {
  const { agent, adapter } = await harness(t, [response('partial one', 'max-tokens'), response('partial two', 'max-tokens'), response('native vision answer')], {
    maxOutputTokens: 4096, retryMaxOutputTokens: 32768, failureMode: 'passthrough',
  })
  await send(agent, user(image()))
  assert.equal(adapter.requests.length, 3)
  assert.equal(adapter.requests[2].purpose, undefined)
  assert.equal(hasImage(adapter.requests[2]), true)
  assert.equal(pluginEvents(agent).length, 0)
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'turn/end').at(-1).data.reason.kind, 'completed')
})

test('passthrough on analysis failure retains successful descriptions of other images', async t => {
  const { agent, adapter } = await harness(t, [response('first description'), () => { throw new Error('vision unavailable') }, response('native vision answer')], { failureMode: 'passthrough' })
  await send(agent, user(image('first.png'), image('second.png')))
  const main = adapter.requests[2]
  assert.match(JSON.stringify(main.messages), /first description/)
  assert.equal(main.messages.flatMap(message => message.content).filter(block => block.type === 'image').length, 1)
  assert.equal(main.messages.flatMap(message => message.content).find(block => block.type === 'image').attachment.name, 'second.png')
})

test('vision uses a supported off effort while the coding model retains its default thinking', async t => {
  const { agent, adapter } = await harness(t, [response('description'), response('answer')])
  adapter.reasoning = { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }], defaultEffort: 'high' }
  await send(agent, user(image()))
  assert.equal(adapter.requests[0].reasoningEffort, 'off')
  assert.equal(adapter.requests[1].reasoningEffort, 'high')
})

test('an explicit vision effort overrides automatic selection of off', async t => {
  const { agent, adapter } = await harness(t, [response('description'), response('answer')], { reasoningEffort: 'high' })
  adapter.reasoning = { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }], defaultEffort: 'high' }
  await send(agent, user(image()))
  assert.equal(adapter.requests[0].reasoningEffort, 'high')
})

test('user cancellation still stops a turn when passthrough is enabled', async t => {
  let started
  const ready = new Promise(resolve => { started = resolve })
  const { agent, adapter } = await harness(t, [async options => {
    started()
    await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
    return []
  }], { failureMode: 'passthrough' })
  agent.followup(user(image()))
  await ready
  await agent.cancel()
  await agent.whenIdle()
  assert.equal(adapter.requests.length, 1)
  assert.equal(pluginEvents(agent).length, 0)
})
