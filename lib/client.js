window.__ModuleLoader__.load({ id: "dsh-image-to-text", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  ImageReplacementSettings: () => ImageReplacementSettings,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");

// src/policy.ts
var SETTINGS_NAMESPACE = "image-to-text";
function isReplacementEnabled(policy, provider, model) {
  const models = policy.routes && Object.hasOwn(policy.routes, provider) ? policy.routes[provider] : void 0;
  return models && Object.hasOwn(models, model) ? models[model] === true : policy.defaultEnabled === true;
}
function toggleOperation(provider, model, enabled) {
  if (!provider || !model) throw new Error("image-to-text: provider and model must not be empty");
  return { op: "set", path: ["routes", provider, model], value: enabled };
}

// src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ImageReplacementSettings(props) {
  if (!props.form || !props.loadCatalog || !props.watchCatalog) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Controls, { form: props.form, loadCatalog: props.loadCatalog, watchCatalog: props.watchCatalog });
}
function Controls({ form, loadCatalog, watchCatalog }) {
  const source = (0, import_react.useMemo)(() => ({
    subscribe: (listener) => form.subscribe(listener),
    getSnapshot: () => form.getSnapshot()
  }), [form]);
  const state = (0, import_react.useSyncExternalStore)(source.subscribe, source.getSnapshot, source.getSnapshot);
  const [catalog, setCatalog] = (0, import_react.useState)();
  const [loadError, setLoadError] = (0, import_react.useState)();
  const [saveError, setSaveError] = (0, import_react.useState)();
  const [saving, setSaving] = (0, import_react.useState)(false);
  const pending = (0, import_react.useRef)(false);
  const [refresh, setRefresh] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    let active = true;
    let generation = 0;
    const load = async () => {
      const own = ++generation;
      try {
        const value = await loadCatalog();
        if (active && own === generation) {
          setCatalog(value);
          setLoadError(void 0);
        }
      } catch (error) {
        if (active && own === generation) setLoadError(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    const dispose = watchCatalog(() => {
      void load();
    });
    return () => {
      active = false;
      dispose();
    };
  }, [loadCatalog, watchCatalog, refresh]);
  async function save(provider, model, enabled) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setSaveError(void 0);
    try {
      const accepted = await form.mutate([toggleOperation(provider, model, enabled)], state.revision);
      if (!accepted) setSaveError("The setting was not saved. Refresh settings and try again.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  const writable = state.status === "ready" && state.writable && !saving;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "aria-label": "Image replacement", style: { marginTop: 20 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { fontSize: "inherit", marginBottom: 8 }, children: "Image replacement" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { opacity: 0.75, fontSize: 13 }, children: "Replace images with saved descriptions before coding requests. Choose separately for each endpoint and model." }),
    state.status !== "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { role: "status", children: [
      "Image replacement settings are ",
      state.status,
      "."
    ] }) : null,
    state.status === "ready" && !state.writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: "These settings are read-only." }) : null,
    !catalog && !loadError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: "Loading models\u2026" }) : null,
    loadError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { role: "alert", children: [
      "Could not load models: ",
      loadError,
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => setRefresh((value) => value + 1), children: "Retry" })
    ] }) : null,
    saveError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: saveError }) : null,
    catalog?.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { role: "alert", children: [
      failure.name,
      ": ",
      failure.message
    ] }, failure.id)),
    catalog && catalog.groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No configured models. Add an endpoint and model above first." }) : null,
    catalog?.groups.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { style: { border: "1px solid color-mix(in srgb, currentColor 20%, transparent)", borderRadius: 10, padding: 12, margin: "12px 0" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("legend", { children: [
        provider.name,
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { style: { opacity: 0.65 }, children: [
          "(",
          provider.id,
          ")"
        ] })
      ] }),
      provider.models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, padding: "6px 0" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          model.name,
          model.name === model.id ? "" : ` (${model.id})`
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: isReplacementEnabled(state.value ?? {}, provider.id, model.id),
              "aria-label": `Replace Image with Txt \u2014 ${provider.id} / ${model.id}`,
              disabled: !writable,
              onChange: (event) => {
                void save(provider.id, model.id, event.target.checked);
              }
            }
          ),
          "Replace Image with Txt"
        ] })
      ] }, model.id))
    ] }, provider.id)),
    saving ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: "Saving\u2026" }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { opacity: 0.65, fontSize: 12 }, children: "Changes save immediately and apply from the next agent step. Existing descriptions stay in conversation history." })
  ] });
}
var inject = ["slots", "configForms", "remote", "remote.session"];
function apply(ctx) {
  const form = ctx.configForms.get(SETTINGS_NAMESPACE);
  const loadCatalog = async () => {
    const response = await ctx.remote.session.modelCatalog();
    if (!response.ok) throw new Error(response.error.message);
    return response.value;
  };
  const watchCatalog = (listener) => {
    const disposers = [
      ctx.remote.$on("llm/adapters-updated", listener),
      ctx.remote.$on("llm/models-updated", listener),
      ctx.remote.$on("settings/document-updated", listener),
      ctx.on("connection/reset", listener)
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  };
  ctx.slots.inject("settings.models.footer", () => ctx.slots.register({
    name: "settings.models.footer",
    id: "image-to-text",
    order: 50,
    inject: () => ({ form, loadCatalog, watchCatalog })
  }, ImageReplacementSettings));
}
return module.exports; } });
