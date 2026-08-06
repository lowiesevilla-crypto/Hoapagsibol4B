"use strict";

// Integration tests execute server modules directly through Node rather than
// through Next.js. Neutralize only the framework sentinel while leaving all
// other module resolution, including React and Next.js, unchanged.
const Module = require("node:module");
const originalLoad = Module._load;

Module._load = function loadWithServerOnlyTestShim(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
