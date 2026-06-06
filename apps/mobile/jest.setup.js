/**
 * jest.setup.js — Sprint QA-α mobile (2026-06-06).
 *
 * Pre-test polyfills para que el jest-expo preset arranque correctamente.
 *
 * Problema raíz: jest-expo v54 importa `expo/src/winter` (línea 305 del setup)
 * que assume globals web (FormData) disponibles. Node 18+ los tiene native pero
 * Node 16 no, y el environment de jest (jsdom no por default en jest-expo) no
 * los provee.
 *
 * Solución: polyfill FormData de form-data antes de que el setup importe winter.
 */

// FormData polyfill — Node 18+ tiene nativo via undici; Node 16 necesita esto.
if (typeof globalThis.FormData === 'undefined') {
  try {
    globalThis.FormData = require('form-data')
  } catch {
    // form-data no instalado — mocked stub
    globalThis.FormData = class FormData {
      append() {}
      get() { return null }
      has() { return false }
      delete() {}
      entries() { return [] }
      keys() { return [] }
      values() { return [] }
    }
  }
}

// Otros polyfills web que expo/winter podría necesitar
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class Blob {
    constructor(parts = [], options = {}) {
      this.parts = parts
      this.type = options.type ?? ''
      this.size = parts.reduce((s, p) => s + (p?.length ?? 0), 0)
    }
  }
}

if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends globalThis.Blob {
    constructor(parts, name, options = {}) {
      super(parts, options)
      this.name = name
      this.lastModified = options.lastModified ?? Date.now()
    }
  }
}

// Headers polyfill — usado por api/client.ts (new Headers(init.headers))
if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = class Headers {
    constructor(init) {
      this._h = new Map()
      if (init) {
        if (init instanceof Headers) {
          init._h.forEach((v, k) => this._h.set(k.toLowerCase(), v))
        } else if (Array.isArray(init)) {
          init.forEach(([k, v]) => this._h.set(k.toLowerCase(), v))
        } else if (typeof init === 'object') {
          Object.entries(init).forEach(([k, v]) => this._h.set(k.toLowerCase(), v))
        }
      }
    }
    get(name) {
      return this._h.get(name.toLowerCase()) ?? null
    }
    set(name, value) {
      this._h.set(name.toLowerCase(), String(value))
    }
    has(name) {
      return this._h.has(name.toLowerCase())
    }
    delete(name) {
      this._h.delete(name.toLowerCase())
    }
    forEach(cb) {
      this._h.forEach((v, k) => cb(v, k, this))
    }
    entries() {
      return this._h.entries()
    }
    keys() {
      return this._h.keys()
    }
    values() {
      return this._h.values()
    }
  }
}

// Response polyfill básico — solo para typeof check; no usado profundamente
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {}
}

// __DEV__ global de RN
if (typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = false
}
