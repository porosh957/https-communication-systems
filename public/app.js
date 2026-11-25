let activeSession = null;
const $ = id => document.getElementById(id);

async function health() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    $("status").textContent = data.ok ? "Server online" : "Server error";
  } catch {
    $("status").textContent = "Server offline";
  }
}

function parseProgram(source) {
  const lines = source.replace(/\r/g, "").split("\n");
  let index = 0;

  function parseBlock(expectedIndent, depth) {
    if (depth > 8) throw new Error("Maximum nesting depth is 8.");
    const commands = [];

    while (index < lines.length) {
      const raw = lines[index];
      if (!raw.trim() || raw.trimStart().startsWith("#")) {
        index++;
        continue;
      }
      if (/\t/.test(raw)) throw new Error("Use spaces for indentation, not tabs (line " + (index + 1) + ").");
      const indent = raw.length - raw.trimStart().length;
      if (indent < expectedIndent) break;
      if (indent > expectedIndent) throw new Error("Unexpected indentation on line " + (index + 1) + ". Use four spaces inside a branch.");

      const line = raw.trim();
      index++;

      let match;
      if ((match = line.match(/^repeat\s+\((-?(?:\d+\.?\d*|\.\d+))\)\s*$/i))) {
        const times = Number(match[1]);
        if (!Number.isInteger(times) || times < 0 || times > 100) {
          throw new Error("repeat count must be a whole number from 0 to 100 (line " + index + ").");
        }
        const childIndent = findNextIndent(lines, index);
        if (childIndent === null || childIndent <= indent) throw new Error("repeat needs an indented body (line " + index + ").");
        if (childIndent !== indent + 4) throw new Error("Indent nested commands by exactly four spaces (line " + (index + 1) + ").");
        const body = parseBlock(childIndent, depth + 1);
        if (!body.length) throw new Error("repeat body cannot be empty (line " + index + ").");
        commands.push({ type: "repeat", times, program: body });
        continue;
      }

      if (/^forever\s*$/i.test(line)) {
        const childIndent = findNextIndent(lines, index);
        if (childIndent === null || childIndent <= indent) throw new Error("forever needs an indented body (line " + index + ").");
        if (childIndent !== indent + 4) throw new Error("Indent nested commands by exactly four spaces (line " + (index + 1) + ").");
        const body = parseBlock(childIndent, depth + 1);
        if (!body.length) throw new Error("forever body cannot be empty (line " + index + ").");
        commands.push({ type: "forever", program: body });
        continue;
      }

      if (/^stop speaking$/i.test(line)) {
        commands.push({ type: "stopSpeaking" });
      } else if ((match = line.match(/^say\s+\[([\s\S]*)\]$/i))) {
        commands.push({ type: "say", text: match[1] });
      } else if ((match = line.match(/^move\s+steps\s+\((-?(?:\d+\.?\d*|\.\d+))\)$/i))) {
        commands.push({ type: "move", value: Number(match[1]) });
      } else if ((match = line.match(/^turn\s+degrees\s+\((-?(?:\d+\.?\d*|\.\d+))\)$/i))) {
        commands.push({ type: "turn", value: Number(match[1]) });
      } else if ((match = line.match(/^go\s+to\s+x\s+\((-?(?:\d+\.?\d*|\.\d+))\)\s+y\s+\((-?(?:\d+\.?\d*|\.\d+))\)$/i))) {
        commands.push({ type: "goto", x: Number(match[1]), y: Number(match[2]) });
      } else if ((match = line.match(/^set\s+x\s+to\s+\((-?(?:\d+\.?\d*|\.\d+))\)$/i))) {
        commands.push({ type: "setX", value: Number(match[1]) });
      } else if ((match = line.match(/^set\s+y\s+to\s+\((-?(?:\d+\.?\d*|\.\d+))\)$/i))) {
        commands.push({ type: "setY", value: Number(match[1]) });
      } else if ((match = line.match(/^wait\s+milliseconds\s+\((-?(?:\d+\.?\d*|\.\d+))\)$/i))) {
        commands.push({ type: "wait", ms: Number(match[1]) });
      } else if ((match = line.match(/^set\s+visible\s+\{(true|false)\}$/i))) {
        commands.push({ type: "visible", value: match[1].toLowerCase() === "true" });
      } else {
        throw new Error("Unknown command or invalid input syntax on line " + index + ": " + line);
      }
    }
    return commands;
  }

  function findNextIndent(linesArray, from) {
    for (let i = from; i < linesArray.length; i++) {
      if (!linesArray[i].trim() || linesArray[i].trimStart().startsWith("#")) continue;
      return linesArray[i].length - linesArray[i].trimStart().length;
    }
    return null;
  }

  const program = parseBlock(0, 0);
  if (!program.length) throw new Error("Write at least one command first.");
  return program;
}

$("createForm").addEventListener("submit", async event => {
  event.preventDefault();
  const username = $("username").value.trim();
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
  const data = await response.json();
  if (!response.ok) {
    $("result").textContent = data.error || "Session creation failed";
    return;
  }
  activeSession = data;
  $("sid").textContent = data.sessionId;
  $("suser").textContent = data.username;
  $("token").textContent = data.token;
  $("sessionCard").classList.remove("hidden");
  $("send").disabled = false;
  $("result").textContent = "Session created. Connect PenguinMod using these credentials.";
});

$("send").addEventListener("click", async () => {
  if (!activeSession) return;
  try {
    const program = parseProgram($("program").value);
    const response = await fetch("/api/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": activeSession.sessionId,
        "x-username": activeSession.username,
        "x-session-token": activeSession.token
      },
      body: JSON.stringify({ program })
    });
    const data = await response.json();
    $("result").textContent = response.ok
      ? "Program queued: " + data.commandId + " (" + program.length + " top-level commands)"
      : (data.error || "Program rejected");
  } catch (error) {
    $("result").textContent = "Syntax error: " + error.message;
  }
});

health();
