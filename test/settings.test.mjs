import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { isReplacementEnabled, toggleOperation } from '../lib/policy.js'

const require = createRequire(import.meta.url)
let artifact
runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { artifact = value } } },
})
assert.equal(artifact.id, 'dsh-image-to-text')
const { ImageReplacementSettings, apply } = artifact.factory(require)

const catalog = { groups: [
  { id: 'local', name: 'Local endpoint', models: [{ id: 'dsv41', name: 'dsv41' }, { id: 'another', name: 'Another model' }] },
  { id: 'relay', name: 'Oracle relay', models: [{ id: 'dsv41', name: 'dsv41' }] },
], failures: [], default: { provider: 'local', model: 'dsv41' }, routableProviders: ['local', 'relay'] }

class Form {
  listeners = new Set()
  writes = []
  state = { status: 'ready', writable: true, revision: 7, value: { routes: { local: { dsv41: true } } } }
  getSnapshot() { return this.state }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  update(patch) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener() }
  async mutate(ops, revision) {
    this.writes.push({ ops, revision })
    const { path: [, provider, model], value } = ops[0]
    this.update({ revision: this.state.revision + 1, value: {
      ...this.state.value, routes: { ...this.state.value.routes, [provider]: { ...this.state.value.routes[provider], [model]: value } },
    } })
    return true
  }
}
async function mount(t, form = new Form(), loadCatalog = async () => catalog) {
  let renderer
  await act(async () => {
    renderer = create(React.createElement(ImageReplacementSettings, { form, loadCatalog, watchCatalog: () => () => {} }))
  })
  t.after(() => act(() => renderer.unmount()))
  return { renderer, form }
}
const switches = renderer => renderer.root.findAllByType('input')

test('browser artifact uses the Harness module-loader protocol and registers the Models settings slot', () => {
  let registered
  let namespace
  apply({
    configForms: { get(ns) { namespace = ns; return new Form() } },
    slots: { inject(name, callback) { assert.equal(name, 'settings.models.footer'); callback() }, register(options, component) { registered = { options, component } } },
  })
  assert.equal(namespace, 'image-to-text')
  assert.equal(registered.options.id, 'image-to-text')
  assert.equal(registered.component, ImageReplacementSettings)
})

test('Models settings shows one switch per endpoint/model and saves only the chosen route', async t => {
  const { renderer, form } = await mount(t)
  assert.deepEqual(switches(renderer).map(input => input.props.checked), [true, false, false])
  await act(async () => switches(renderer)[2].props.onChange({ target: { checked: true } }))
  assert.equal(form.writes.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(form.writes[0])), {
    ops: [{ op: 'set', path: ['routes', 'relay', 'dsv41'], value: true }], revision: 7,
  })
  assert.deepEqual(switches(renderer).map(input => input.props.checked), [true, false, true])
  await act(async () => switches(renderer)[0].props.onChange({ target: { checked: false } }))
  assert.deepEqual(switches(renderer).map(input => input.props.checked), [false, false, true])
})

test('read-only settings disable every switch', async t => {
  const form = new Form()
  form.update({ writable: false })
  const { renderer } = await mount(t, form)
  assert.ok(switches(renderer).every(input => input.props.disabled))
  assert.equal(form.writes.length, 0)
})

test('save refusals and transport failures are visible without changing the checkbox', async t => {
  const form = new Form()
  form.mutate = async () => false
  const { renderer } = await mount(t, form)
  await act(async () => switches(renderer)[2].props.onChange({ target: { checked: true } }))
  assert.match(JSON.stringify(renderer.toJSON()), /not saved/)
  assert.equal(switches(renderer)[2].props.checked, false)
  form.mutate = async () => { throw new Error('connection lost') }
  await act(async () => switches(renderer)[2].props.onChange({ target: { checked: true } }))
  assert.match(JSON.stringify(renderer.toJSON()), /connection lost/)
  assert.equal(switches(renderer)[2].props.checked, false)
})

test('failed model catalog loads show a working Retry button', async t => {
  let attempts = 0
  const { renderer } = await mount(t, new Form(), async () => {
    if (++attempts === 1) throw new Error('offline')
    return catalog
  })
  assert.match(JSON.stringify(renderer.toJSON()), /offline/)
  await act(async () => renderer.root.findByType('button').props.onClick())
  assert.equal(switches(renderer).length, 3)
})

test('provider/model IDs are literal dictionary keys; prototype values never enable replacement', () => {
  assert.deepEqual(toggleOperation('relay.example', 'vendor/model.v1', true), {
    op: 'set', path: ['routes', 'relay.example', 'vendor/model.v1'], value: true,
  })
  assert.equal(isReplacementEnabled({}, 'relay', 'dsv41'), false)
  assert.equal(isReplacementEnabled({ routes: Object.create({ relay: { dsv41: true } }) }, 'relay', 'dsv41'), false)
  assert.equal(isReplacementEnabled({ defaultEnabled: true, routes: { relay: { dsv41: false } } }, 'relay', 'dsv41'), false)
})
