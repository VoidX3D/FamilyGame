/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* The API documentation page.
 *
 * It is the real Swagger UI, served from the backend, so the documentation
 * always matches the running service and there is nothing to install on
 * the reader's machine. The styles below are a dark theme that matches the
 * rest of the app, because Swagger UI ships light only.
 */

export const swaggerPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b1220" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Family Game Hub API</title>
    <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
    <link rel="icon" href="/api/docs/favicon-32x32.png" sizes="32x32" />
    <style>
      :root {
        color-scheme: dark;
        --fg-bg: #0b1220;
        --fg-surface: #111a2b;
        --fg-surface-2: #18233a;
        --fg-line: rgba(255, 255, 255, 0.09);
        --fg-text: #f4f1ff;
        --fg-muted: #aeb8d0;
        --fg-primary: #ff8a6b;
        --fg-secondary: #5eead4;
      }

      html, body {
        background: var(--fg-bg) !important;
      }

      body {
        margin: 0;
      }

      .swagger-ui .topbar {
        display: none;
      }

      .swagger-ui .wrapper {
        max-width: 1180px;
        padding: 0 20px 80px;
      }

      .swagger-ui .info {
        margin: 32px 0;
      }

      .swagger-ui .info .title,
      .swagger-ui .info h2,
      .swagger-ui .opblock-tag,
      .swagger-ui .opblock .opblock-summary-path,
      .swagger-ui .opblock .opblock-summary-path__deprecated,
      .swagger-ui .opblock .opblock-summary-description,
      .swagger-ui .model-title,
      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type,
      .swagger-ui .response-col_status,
      .swagger-ui .response-col_description,
      .swagger-ui .prop-type,
      .swagger-ui .model,
      .swagger-ui section.models,
      .swagger-ui .model-toggle,
      .swagger-ui .tab li,
      .swagger-ui label,
      .swagger-ui h1,
      .swagger-ui h2,
      .swagger-ui h3,
      .swagger-ui h4,
      .swagger-ui h5 {
        color: var(--fg-text);
      }

      .swagger-ui .info .title small {
        background: transparent;
      }

      .swagger-ui .info .title small pre {
        color: var(--fg-secondary);
      }

      .swagger-ui .info .base-url,
      .swagger-ui .info p,
      .swagger-ui .info li,
      .swagger-ui .info table,
      .swagger-ui .scheme-container,
      .swagger-ui .opblock .opblock-summary-description,
      .swagger-ui .opblock-description-wrapper p,
      .swagger-ui .opblock-description-wrapper li,
      .swagger-ui .parameter__name,
      .swagger-ui .parameter__in,
      .swagger-ui .parameter__type,
      .swagger-ui .response-col_description,
      .swagger-ui .model,
      .swagger-ui .prop-type,
      .swagger-ui .prop-format,
      .swagger-ui .model-title {
        color: var(--fg-muted);
      }

      .swagger-ui .servers,
      .swagger-ui .servers > label,
      .swagger-ui .servers > label > span,
      .swagger-ui .scheme-container,
      .swagger-ui .scheme-container .schemes,
      .swagger-ui .auth-wrapper,
      .swagger-ui .auth-container,
      .swagger-ui .information-container,
      .swagger-ui .info .description {
        background: transparent !important;
        color: var(--fg-muted) !important;
      }

      .swagger-ui .servers select,
      .swagger-ui .servers .select-label {
        background: #0d1526 !important;
        color: var(--fg-text) !important;
        border-color: var(--fg-line) !important;
      }

      .swagger-ui .servers .response-controls,
      .swagger-ui .auth-btn-wrapper {
        color: var(--fg-muted) !important;
      }

      .swagger-ui .opblock-tag {
        font-size: 20px;
        border-bottom-color: var(--fg-line);
      }

      .swagger-ui .opblock-tag small {
        color: var(--fg-muted);
      }

      .swagger-ui .opblock .opblock-summary {
        background: var(--fg-surface);
        border-color: var(--fg-line);
        box-shadow: none;
      }

      .swagger-ui .opblock .opblock-summary:hover {
        background: var(--fg-surface-2);
      }

      .swagger-ui .opblock .opblock-summary-method {
        background: var(--fg-surface-2);
        border-radius: 6px;
        color: var(--fg-secondary);
        text-shadow: none;
        font-weight: 700;
      }

      .swagger-ui .opblock.opblock-post .opblock-summary-method {
        color: var(--fg-primary);
      }

      .swagger-ui .opblock.opblock-delete .opblock-summary-method {
        color: #ffb4ab;
      }

      .swagger-ui .opblock .opblock-body pre.microlight,
      .swagger-ui .opblock .opblock-body pre {
        background: #0d1526 !important;
        border-color: var(--fg-line) !important;
      }

      .swagger-ui .opblock .opblock-section-header {
        background: var(--fg-surface-2);
        box-shadow: none;
      }

      .swagger-ui .btn {
        background: var(--fg-surface-2);
        color: var(--fg-text);
        border-color: var(--fg-line);
        box-shadow: none;
      }

      .swagger-ui .btn.execute {
        background: var(--fg-primary);
        border-color: var(--fg-primary);
        color: #2a0b04;
      }

      .swagger-ui select,
      .swagger-ui input[type="text"],
      .swagger-ui input[type="email"],
      .swagger-ui input[type="password"] {
        background: #0d1526;
        color: var(--fg-text);
        border-color: var(--fg-line);
        box-shadow: none;
      }

      .swagger-ui table thead tr td,
      .swagger-ui table thead tr th {
        border-bottom-color: var(--fg-line);
        color: var(--fg-text);
      }

      .swagger-ui .parameter__name.required span,
      .swagger-ui .response-col_status {
        color: var(--fg-primary);
      }

      .swagger-ui .model-box {
        background: #0d1526;
        border-radius: 10px;
      }

      .swagger-ui .model-title__text {
        color: var(--fg-secondary);
      }

      .swagger-ui .highlight-code,
      .swagger-ui .microlight {
        background: #0d1526 !important;
      }

      .swagger-ui .response-controls,
      .swagger-ui .try-out {
        color: var(--fg-muted);
      }

      .swagger-ui .expand-operation,
      .swagger-ui .opblock-summary-control {
        filter: invert(1) hue-rotate(180deg);
      }

      .swagger-ui .footer {
        background: transparent;
      }

      .swagger-ui .renderedMarkdown p,
      .swagger-ui .renderedMarkdown li {
        color: var(--fg-muted);
      }

      .swagger-ui .back-to-top {
        background: var(--fg-surface-2);
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/swagger-ui-bundle.js" crossorigin></script>
    <script src="/api/docs/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: "/api/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          docExpansion: "list",
          defaultModelsExpandDepth: 1,
          tryItOutEnabled: true,
          persistAuthorization: false,
          layout: "BaseLayout",
        });
      };
    </script>
  </body>
</html>
`;
