import Module from "node:module";
import { register } from "node:module";

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

register(new URL("./server-only-loader.mjs", import.meta.url), import.meta.url);
