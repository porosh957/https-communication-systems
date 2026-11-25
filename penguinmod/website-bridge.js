/* PenguinMod Website Bridge — HTTP polling starter.
   Uses HTTPS when SERVER_URL is set to your Render service.
   Structured allowlisted commands only; never eval remote JavaScript. */
(function (Scratch) {
  "use strict";
  if (!Scratch || !Scratch.extensions) throw new Error("PenguinMod extension API unavailable");

  let serverURL = "http://127.0.0.1:8787";
  let sessionId = "", username = "", token = "";
  let connected = false, statusText = "Not connected", pollTimer = null;
  let polling = false;

  function apiHeaders() {
    return {
      "x-session-id": sessionId,
      "x-username": username,
      "x-session-token": token
    };
  }
  function normalizeURL(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }
  async function verifySession() {
    const response = await fetch(serverURL + "/api/session", { headers: apiHeaders() });
    if (!response.ok) throw new Error("Session verification rejected (" + response.status + ")");
    const data = await response.json();
    if (data.sessionId !== sessionId || data.username !== username) throw new Error("Session identity mismatch");
    return data;
  }
  async function execute(command) {
    const runtime = Scratch.vm && Scratch.vm.runtime;
    const sprite = runtime && runtime.targets && runtime.targets.find(target => !target.isStage);
    if (!sprite) throw new Error("No sprite target found");

    switch (command.type) {
      case "say":
        runtime.emit("SAY", sprite, "say", String(command.text || "").slice(0, 300));
        break;
      case "move":
        sprite.setXY(sprite.x, sprite.y + Number(command.value || 0));
        break;
      case "turn":
        sprite.setDirection(sprite.direction + Number(command.value || 0));
        break;
      case "goto":
        sprite.setXY(Number(command.x) || 0, Number(command.y) || 0);
        break;
      case "setX":
        sprite.setXY(Number(command.value) || 0, sprite.y);
        break;
      case "setY":
        sprite.setXY(sprite.x, Number(command.value) || 0);
        break;
      case "wait":
        await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(5000, Number(command.ms) || 0))));
        break;
      default:
        throw new Error("Unsupported command type");
    }
  }
  async function pollQueue() {
    if (!connected || polling) return;
    polling = true;
    try {
      await verifySession();
      const response = await fetch(serverURL + "/api/commands", { headers: apiHeaders() });
      if (!response.ok) throw new Error("Command queue request failed (" + response.status + ")");
      const data = await response.json();
      for (const item of (data.commands || [])) {
        for (const command of (item.program || [])) await execute(command);
      }
      statusText = "Connected · session verified";
    } catch (error) {
      statusText = "Connection error: " + error.message;
      connected = false;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    } finally {
      polling = false;
    }
  }

  class WebsiteBridge {
    getInfo() {
      return {
        id: "websitebridge",
        name: "Website Bridge",
        blocks: [
          { opcode: "setServer", blockType: Scratch.BlockType.COMMAND, text: "set website server URL [URL]", arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: "https://your-service.onrender.com" } } },
          { opcode: "connect", blockType: Scratch.BlockType.COMMAND, text: "connect session [SID] username [USER] token [TOKEN]", arguments: {
            SID: { type: Scratch.ArgumentType.STRING, defaultValue: "" },
            USER: { type: Scratch.ArgumentType.STRING, defaultValue: "" },
            TOKEN: { type: Scratch.ArgumentType.STRING, defaultValue: "" }
          } },
          { opcode: "disconnect", blockType: Scratch.BlockType.COMMAND, text: "disconnect website session" },
          { opcode: "status", blockType: Scratch.BlockType.REPORTER, text: "website connection status" },
          { opcode: "isConnected", blockType: Scratch.BlockType.BOOLEAN, text: "website connected?" }
        ]
      };
    }
    setServer(args) {
      const candidate = normalizeURL(args.URL);
      if (!/^https?:\/\//i.test(candidate)) {
        statusText = "Server URL must start with http:// or https://";
        return;
      }
      serverURL = candidate;
      statusText = "Server set to " + serverURL;
    }
    async connect(args) {
      sessionId = String(args.SID || "").trim();
      username = String(args.USER || "").trim();
      token = String(args.TOKEN || "").trim();
      if (!sessionId || !username || !token) { statusText = "Session ID, username and token are required"; return; }
      try {
        await verifySession();
        connected = true;
        statusText = "Session verified; polling commands";
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(pollQueue, 1200);
        await pollQueue();
      } catch (error) {
        connected = false;
        statusText = "Rejected: " + error.message;
      }
    }
    disconnect() {
      connected = false;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      statusText = "Disconnected";
    }
    status() { return statusText; }
    isConnected() { return connected; }
  }
  Scratch.extensions.register(new WebsiteBridge());
})(Scratch);
