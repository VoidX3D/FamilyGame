/* A small, self contained API documentation page.
 *
 * It reads the OpenAPI document from /api/openapi.json and renders it.
 * There is no external script and no build step, so the page works on a
 * private server with no internet connection, and it looks like the rest
 * of the app.
 */

export const docsPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Family Game Hub · API</title>
    <style>
      :root {
        --bg: #0b1220;
        --surface: #111a2b;
        --surface-2: #18233a;
        --surface-3: #22304c;
        --line: rgba(255, 255, 255, 0.09);
        --text: #f4f1ff;
        --muted: #aeb8d0;
        --primary: #ff8a6b;
        --secondary: #5eead4;
        --tertiary: #c4b5fd;
        --get: #5eead4;
        --post: #ff8a6b;
        --put: #c4b5fd;
        --delete: #ffb4ab;
        --radius: 18px;
        --mono: ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background:
          radial-gradient(900px 500px at 85% -10%, rgba(255, 138, 107, 0.14), transparent 60%),
          radial-gradient(760px 440px at -10% 30%, rgba(94, 234, 212, 0.1), transparent 62%),
          var(--bg);
        color: var(--text);
        font-family: "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }

      a { color: var(--secondary); }

      .page {
        width: min(100% - 40px, 1080px);
        margin: 0 auto;
        padding: 48px 0 96px;
      }

      .topbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 36px;
      }

      .brand { display: flex; align-items: center; gap: 14px; }
      .brand-mark {
        width: 46px; height: 46px; border-radius: 14px;
        background: linear-gradient(135deg, var(--primary), var(--tertiary));
      }
      .brand h1 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
      .brand p { margin: 0; color: var(--muted); font-size: 12.5px; }

      .links { display: flex; gap: 10px; flex-wrap: wrap; }
      .links a {
        padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px;
        background: var(--surface); color: var(--text); text-decoration: none;
        font-size: 13px; font-weight: 600;
      }
      .links a:hover { border-color: var(--secondary); }

      .intro {
        padding: 26px 28px; margin-bottom: 34px;
        border: 1px solid var(--line); border-radius: var(--radius);
        background: var(--surface);
      }
      .intro h2 { margin: 0 0 10px; font-size: 22px; letter-spacing: -0.02em; }
      .intro pre {
        margin: 0; white-space: pre-wrap; color: var(--muted);
        font-family: var(--mono); font-size: 12.5px; line-height: 1.75;
      }

      h2.tag {
        margin: 40px 0 14px; font-size: 13px; text-transform: uppercase;
        letter-spacing: 0.14em; color: var(--primary);
      }
      h2.tag:first-of-type { margin-top: 12px; }

      .op {
        margin-bottom: 14px; border: 1px solid var(--line);
        border-radius: var(--radius); background: var(--surface); overflow: hidden;
      }
      .op-head {
        display: flex; align-items: center; gap: 14px;
        padding: 14px 18px; cursor: pointer; list-style: none;
      }
      .op-head::-webkit-details-marker { display: none; }
      .method {
        flex: 0 0 auto; min-width: 62px; padding: 5px 10px; border-radius: 8px;
        text-align: center; font-family: var(--mono); font-size: 12px; font-weight: 700;
      }
      .method.get { background: rgba(94, 234, 212, 0.14); color: var(--get); }
      .method.post { background: rgba(255, 138, 107, 0.14); color: var(--post); }
      .method.put { background: rgba(196, 181, 253, 0.14); color: var(--put); }
      .method.delete { background: rgba(255, 180, 171, 0.14); color: var(--delete); }
      .op-path { font-family: var(--mono); font-size: 14px; font-weight: 600; }
      .op-sum { color: var(--muted); font-size: 13.5px; }
      .op-head .chev { margin-left: auto; color: var(--muted); transition: transform .18s ease; }
      details[open] .op-head .chev { transform: rotate(90deg); }

      .op-body {
        padding: 0 18px 18px; border-top: 1px solid var(--line);
        color: var(--muted); font-size: 13.5px;
      }
      .op-body h4 {
        margin: 16px 0 8px; color: var(--text); font-size: 12px;
        text-transform: uppercase; letter-spacing: 0.1em;
      }
      .op-body table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .op-body td { padding: 6px 10px 6px 0; vertical-align: top; }
      .op-body td:first-child {
        width: 92px; color: var(--text); font-family: var(--mono); font-size: 12px;
      }
      code {
        font-family: var(--mono); font-size: 12.5px;
        padding: 2px 6px; border-radius: 6px; background: var(--surface-3);
        color: var(--secondary);
      }
      .status {
        display: inline-block; min-width: 38px; padding: 1px 8px; margin-right: 8px;
        border-radius: 6px; background: var(--surface-3); color: var(--text);
        font-family: var(--mono); font-size: 12px; text-align: center;
      }
      .events { display: grid; gap: 8px; }
      .event {
        display: grid; grid-template-columns: 150px 1fr; gap: 14px;
        padding: 10px 12px; border-radius: 12px; background: var(--surface-2);
        font-size: 13px;
      }
      .event b { font-family: var(--mono); font-size: 12.5px; color: var(--secondary); }
      .event span { color: var(--muted); }
      .foot { margin-top: 44px; color: var(--muted); font-size: 12.5px; }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="topbar">
        <div class="brand">
          <div class="brand-mark"></div>
          <div>
            <h1>Family Game Hub</h1>
            <p>API documentation</p>
          </div>
        </div>
        <nav class="links">
          <a href="/api/openapi.json">OpenAPI file</a>
          <a href="/healthz">Health</a>
          <a href="/api/games">Games</a>
          <a href="/">Service</a>
        </nav>
      </div>

      <section class="intro" id="intro">
        <h2>Loading…</h2>
      </section>

      <div id="content"></div>

      <p class="foot">
        Everything that happens during a game travels over Socket.IO, not REST.
        The events are listed at the bottom of this page.
      </p>
    </main>

    <script type="module">
      const content = document.getElementById("content");
      const intro = document.getElementById("intro");

      const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };

      const render = (spec) => {
        // The description is written in markdown, because Swagger renders it
        // that way. This page shows plain text, so the markers are removed.
        const plain = (text) =>
          String(text || "")
            .replace(/\\*\\*([^*]+)\\*\\*/g, "$1")
            .replace(/\\n{3,}/g, "\\n\\n");

        intro.replaceChildren(
          el("h2", null, spec.info.title),
          el("pre", null, plain(spec.info.description)),
        );

        const groups = new Map();
        for (const [path, methods] of Object.entries(spec.paths)) {
          for (const [method, op] of Object.entries(methods)) {
            const tag = (op.tags || ["Other"])[0];
            if (!groups.has(tag)) groups.set(tag, []);
            groups.get(tag).push({ path, method, op });
          }
        }

        for (const [tag, operations] of groups) {
          content.append(el("h2", "tag", tag));

          for (const { path, method, op } of operations) {
            const details = el("details", "op");
            const head = el("summary", "op-head");
            head.append(el("span", \`method \${method}\`, method.toUpperCase()));
            head.append(el("span", "op-path", path));
            head.append(el("span", "op-sum", op.summary || ""));
            head.append(el("span", "chev", "›"));
            details.append(head);

            const body = el("div", "op-body");
            if (op.description) body.append(el("p", null, op.description));

            if (op.parameters?.length) {
              body.append(el("h4", null, "Parameters"));
              const table = el("table");
              for (const parameter of op.parameters) {
                const row = el("tr");
                row.append(el("td", null, parameter.name));
                row.append(
                  el(
                    "td",
                    null,
                    \`\${parameter.in} · \${parameter.required ? "required" : "optional"}\${
                      parameter.description ? " · " + parameter.description : ""
                    }\`,
                  ),
                );
                table.append(row);
              }
              body.append(table);
            }

            if (op.requestBody) {
              body.append(el("h4", null, "Body"));
              const example = op.requestBody.content?.["application/json"]?.example;
              body.append(
                el(
                  "p",
                  null,
                  example
                    ? JSON.stringify(example, null, 2)
                    : "application/json",
                ),
              );
            }

            body.append(el("h4", null, "Responses"));
            const table = el("table");
            for (const [code, response] of Object.entries(op.responses || {})) {
              const row = el("tr");
              const cell = el("td");
              cell.append(el("span", "status", code));
              cell.append(el("span", null, response.description || ""));
              row.append(cell);
              row.append(el("td", null, ""));
              table.append(row);
            }
            body.append(table);

            details.append(body);
            content.append(details);
          }
        }

        const events = spec["x-socketio"]?.events;
        if (events?.length) {
          content.append(el("h2", "tag", "Socket.IO events"));
          const list = el("div", "events");
          for (const event of events) {
            const row = el("div", "event");
            row.append(el("b", null, event.name));
            row.append(el("span", null, \`\${event.direction} · \${event.summary}\`));
            list.append(row);
          }
          content.append(list);
        }
      };

      try {
        const response = await fetch("/api/openapi.json");
        render(await response.json());
      } catch (error) {
        intro.replaceChildren(
          el("h2", null, "Could not load the API description"),
          el("p", null, String(error.message || error)),
        );
      }
    </script>
  </body>
</html>
`;
