export function ensureNodeWebSocket() {
  if (typeof globalThis.WebSocket !== "undefined") {
    return;
  }

  class NodeNoopWebSocket {
    url = "";
    readyState = 3;
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false;
    }
  }

  globalThis.WebSocket = NodeNoopWebSocket as unknown as typeof WebSocket;
}
