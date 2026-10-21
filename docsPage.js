/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* The API documentation page.
 *
 * It is the real Swagger UI, served from the backend, so the documentation
 * always matches the running service and there is nothing to install on
 * the reader's machine. Swagger UI ships light only, so the styles below
 * are a dark theme built from the same palette as the rest of the app.
 */

export const swaggerPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b1020" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Family Game Hub API</title>
    <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
    <link rel="icon" href="/api/docs/favicon-32x32.png" sizes="32x32" />
    <style>
      :root {
        color-scheme: dark;

        --fg-bg: #0b1020;
        --fg-surface: #151c32;
        --fg-surface-2: #1d2742;
        --fg-surface-3: #263456;
        --fg-code: #0d1526;
        --fg-line: rgba(255, 255, 255, 0.09);
        --fg-line-soft: rgba(255, 255, 255, 0.055);

        --fg-text: #f8f7f2;
        --fg-muted: #aab5d0;
        --fg-faint: rgba(170, 181, 208, 0.72);

        --fg-primary: #ffd166;
        --fg-secondary: #55d6be;
        --fg-tertiary: #6c8cff;
        --fg-danger: #ff7a7a;

        --fg-radius: 16px;
        --fg-radius-sm: 10px;
      }

      * {
        scrollbar-color: var(--fg-surface-3) transparent;
      }

      html,
      body {
        background: var(--fg-bg) !important;
      }

      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
          Roboto, "Helvetica Neue", Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      /* A soft glow behind the header, the way the app's own pages open.
       * It sits at z-index -1 so it stays behind everything. A fixed
       * overlay at z-index 0 paints over any content that is not itself
       * positioned, which turns the operation cards a shade of light. */
      body::before {
        content: "";
        position: fixed;
        z-index: -1;
        inset: -20% 0 auto 0;
        height: 460px;
        pointer-events: none;
        background:
          radial-gradient(60% 60% at 18% 0%, rgba(255, 209, 102, 0.14), transparent 70%),
          radial-gradient(55% 60% at 82% 10%, rgba(85, 214, 190, 0.13), transparent 72%);
      }

      .swagger-ui .topbar {
        display: none;
      }

      /* One width for the whole page, so the heading, the servers, the
       * authorise button and the operations all line up on the same
       * left edge. */
      .swagger-ui .wrapper,
      .swagger-ui .scheme-container,
      .swagger-ui .information-container {
        max-width: 1160px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 24px;
        padding-right: 24px;
      }

      .swagger-ui .wrapper {
        padding-bottom: 96px;
      }

      /* The information container is also a .wrapper, so it picks up the
       * page's bottom padding. It does not need it. */
      .swagger-ui .information-container {
        display: block;
        padding-bottom: 0;
      }

      /* The authorise button. Swagger centres it in a tall white box;
       * here it is a small button on the left, under the servers. */
      .swagger-ui .scheme-container {
        display: block;
        margin: 0 0 26px;
        padding: 0;
        background: transparent;
        box-shadow: none;
      }

      .swagger-ui .scheme-container .schemes {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        justify-content: flex-start;
        /* It is a .wrapper as well, so it would pick up the page's
         * bottom padding and leave a hole under the button. */
        padding-bottom: 0;
      }

      .swagger-ui .auth-btn-wrapper {
        justify-content: flex-start;
        padding: 0;
      }

      .swagger-ui .btn.authorize {
        border-color: rgba(85, 214, 190, 0.5);
        color: var(--fg-secondary);
      }

      .swagger-ui .btn.authorize svg {
        fill: var(--fg-secondary);
      }

      /* --- the header ------------------------------------------------- */

      .swagger-ui .info {
        margin: 0 0 20px;
        padding: 40px 0 0;
      }

      .swagger-ui .info .description p {
        margin: 0 0 10px;
      }

      .swagger-ui .info .description p:last-child {
        margin-bottom: 0;
      }

      /* The licence and contact lines sit under the description. Swagger
       * gives them a big margin, which leaves a hole in the page. */
      .swagger-ui .info h2 {
        margin: 14px 0 0;
        color: var(--fg-faint);
        font-size: 12px;
        font-weight: 600;
      }

      .swagger-ui .info h2 a {
        color: var(--fg-muted);
      }

      .swagger-ui .info h2 a:hover {
        color: var(--fg-primary);
      }

      .swagger-ui .info .title {
        margin: 0;
        color: var(--fg-text);
        font-size: 34px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .swagger-ui .info .title small {
        background: transparent;
        padding: 0;
      }

      .swagger-ui .info .title small pre {
        margin: 0;
        color: var(--fg-secondary);
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      .swagger-ui .info .title small.version-stamp {
        background: var(--fg-surface-2);
        border: 1px solid var(--fg-line);
        border-radius: var(--fg-radius-sm);
        padding: 2px 10px;
      }

      .swagger-ui .info p,
      .swagger-ui .info li,
      .swagger-ui .info table,
      .swagger-ui .info h2,
      .swagger-ui .info h3 {
        color: var(--fg-muted);
      }

      .swagger-ui .info p {
        font-size: 15px;
        line-height: 1.65;
      }

      .swagger-ui .info .title small pre {
        color: var(--fg-secondary);
      }

      .swagger-ui .renderedMarkdown p,
      .swagger-ui .renderedMarkdown li {
        color: var(--fg-muted);
        line-height: 1.65;
      }

      /* --- the servers panel ------------------------------------------ */

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

      .swagger-ui .servers {
        margin: 0 0 22px;
        padding: 16px 20px;
        border: 1px solid var(--fg-line);
        border-radius: var(--fg-radius);
        background: var(--fg-surface) !important;
      }

      .swagger-ui .servers > label {
        display: block;
        margin-bottom: 10px;
        color: var(--fg-faint) !important;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .swagger-ui .servers select,
      .swagger-ui .servers .select-label {
        background: var(--fg-surface-3) !important;
        color: var(--fg-text) !important;
        border: 1px solid var(--fg-line) !important;
        border-radius: var(--fg-radius-sm) !important;
        min-height: 38px;
      }

      .swagger-ui .servers .response-controls,
      .swagger-ui .auth-btn-wrapper {
        color: var(--fg-faint) !important;
      }

      /* --- the sections ----------------------------------------------- */

      .swagger-ui .opblock-tag {
        margin: 0;
        padding: 22px 0 12px;
        border-bottom: 1px solid var(--fg-line-soft);
        color: var(--fg-text);
        font-size: 22px;
        font-weight: 780;
        letter-spacing: -0.01em;
      }

      .swagger-ui .opblock-tag small {
        color: var(--fg-faint);
        font-weight: 500;
        font-size: 13px;
      }

      .swagger-ui .opblock-tag:hover {
        color: var(--fg-primary);
      }

      /* --- the operations --------------------------------------------- */

      .swagger-ui .opblock {
        margin: 0 0 12px;
        border: 1px solid var(--fg-line);
        border-radius: var(--fg-radius);
        background: var(--fg-surface);
        box-shadow: none;
        overflow: hidden;
      }

      .swagger-ui .opblock .opblock-summary {
        border-bottom: none;
        background: var(--fg-surface);
        padding: 12px 16px;
        transition: background 140ms ease;
      }

      .swagger-ui .opblock .opblock-summary:hover {
        background: var(--fg-surface-2);
      }

      .swagger-ui .opblock .opblock-summary:focus-visible {
        outline: 2px solid var(--fg-primary);
        outline-offset: -2px;
      }

      .swagger-ui .opblock .opblock-summary-method {
        min-width: 74px;
        border-radius: var(--fg-radius-sm);
        background: var(--fg-surface-3);
        color: var(--fg-secondary);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-shadow: none;
      }

      /* Swagger paints the method chip with a solid light colour, which
       * needs a much stronger rule to replace. Each method gets the
       * colour of the app's own palette. */
      .swagger-ui .opblock.opblock-get .opblock-summary-method {
        background: rgba(108, 140, 255, 0.2);
        color: #9db2ff;
      }

      .swagger-ui .opblock.opblock-post .opblock-summary-method {
        background: rgba(255, 209, 102, 0.2);
        color: var(--fg-primary);
      }

      .swagger-ui .opblock.opblock-put .opblock-summary-method {
        background: rgba(85, 214, 190, 0.2);
        color: var(--fg-secondary);
      }

      .swagger-ui .opblock.opblock-delete .opblock-summary-method {
        background: rgba(255, 122, 122, 0.2);
        color: var(--fg-danger);
      }

      .swagger-ui .opblock .opblock-summary-path {
        color: var(--fg-text);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 14px;
        font-weight: 600;
      }

      .swagger-ui .opblock .opblock-summary-path__deprecated {
        color: var(--fg-faint);
      }

      .swagger-ui .opblock .opblock-summary-description {
        color: var(--fg-muted);
        font-size: 13px;
      }

      .swagger-ui .opblock .opblock-body {
        border-top: 1px solid var(--fg-line-soft);
        background: var(--fg-surface);
        padding: 0 16px 16px;
      }

      .swagger-ui .opblock .opblock-section-header {
        background: var(--fg-surface-2);
        box-shadow: none;
        padding: 10px 0;
      }

      .swagger-ui .opblock .opblock-section-header > h4,
      .swagger-ui .opblock .opblock-section-header > label {
        color: var(--fg-text);
        font-size: 13px;
      }

      .swagger-ui .opblock-body pre.microlight,
      .swagger-ui .opblock-body pre,
      .swagger-ui .highlight-code,
      .swagger-ui .microlight {
        background: var(--fg-code) !important;
        border: 1px solid var(--fg-line-soft) !important;
        border-radius: var(--fg-radius-sm);
        color: #d7e2ff;
        box-shadow: none;
      }

      /* --- the tables and the forms ------------------------------------ */

      .swagger-ui table thead tr td,
      .swagger-ui table thead tr th {
        border-bottom-color: var(--fg-line);
        color: var(--fg-text);
        font-size: 13px;
      }

      .swagger-ui table tbody tr td {
        border-bottom-color: var(--fg-line-soft);
        color: var(--fg-muted);
      }

      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type,
      .swagger-ui .parameter__in,
      .swagger-ui .prop-type,
      .swagger-ui .prop-format,
      .swagger-ui .model,
      .swagger-ui .model-title,
      .swagger-ui .response-col_status,
      .swagger-ui .response-col_description,
      .swagger-ui .tab li,
      .swagger-ui label {
        color: var(--fg-muted);
      }

      .swagger-ui .parameter__name.required span,
      .swagger-ui .response-col_status {
        color: var(--fg-primary);
        font-weight: 700;
      }

      .swagger-ui .model-box {
        background: var(--fg-code);
        border-radius: var(--fg-radius-sm);
        padding: 4px 0;
      }

      .swagger-ui .model-title__text {
        color: var(--fg-secondary);
      }

      .swagger-ui .model-toggle {
        color: var(--fg-faint);
      }

      /* --- the schemas ------------------------------------------------
       *
       * Swagger draws the schema section with the light theme's colours:
       * a dark grey title on a grey card, which is unreadable on a dark
       * page. Every part of it gets a colour from the palette above. */

      .swagger-ui section.models,
      .swagger-ui .models {
        color: var(--fg-muted);
      }

      .swagger-ui section.models h4,
      .swagger-ui .models h4,
      .swagger-ui .models-control {
        color: var(--fg-text);
      }

      .swagger-ui .models-control svg {
        fill: var(--fg-muted);
      }

      .swagger-ui .json-schema-2020-12 {
        background: var(--fg-surface-2);
        border: 1px solid var(--fg-line-soft);
        border-radius: var(--fg-radius-sm);
        margin: 0 0 12px;
        padding: 12px 14px;
      }

      .swagger-ui .json-schema-2020-12--embedded {
        background: transparent;
        border: none;
        padding: 0;
      }

      .swagger-ui .json-schema-2020-12-head {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .swagger-ui .json-schema-2020-12-accordion {
        background: transparent;
        border: none;
        outline: none;
        padding: 0;
      }

      .swagger-ui .json-schema-2020-12-accordion__icon svg {
        fill: var(--fg-muted);
      }

      .swagger-ui .json-schema-2020-12__title {
        color: var(--fg-text);
        font-weight: 700;
      }

      .swagger-ui .json-schema-2020-12__attribute {
        color: var(--fg-muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      .swagger-ui .json-schema-2020-12__attribute--primary {
        color: var(--fg-secondary);
        font-weight: 700;
      }

      .swagger-ui .json-schema-2020-12__attribute--muted {
        color: var(--fg-faint);
      }

      .swagger-ui .json-schema-2020-12-expand-deep-button {
        background: transparent;
        border: none;
        color: var(--fg-faint);
        font-size: 12px;
      }

      .swagger-ui .json-schema-2020-12-expand-deep-button:hover {
        color: var(--fg-primary);
      }

      .swagger-ui .json-schema-2020-12-body {
        border-left: 1px dashed var(--fg-line);
        margin: 8px 0 0;
        padding-left: 12px;
      }

      .swagger-ui .json-schema-2020-12-keyword__children {
        border-left: 1px dashed var(--fg-line);
        margin: 0 0 0 16px;
      }

      .swagger-ui .json-schema-2020-12-keyword__name {
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 700;
      }

      .swagger-ui .json-schema-2020-12-keyword__name--primary {
        color: var(--fg-text);
      }

      .swagger-ui .json-schema-2020-12-keyword__name--secondary {
        color: var(--fg-faint);
      }

      .swagger-ui .json-schema-2020-12-keyword__value,
      .swagger-ui .json-schema-2020-12-keyword__value--primary {
        color: var(--fg-muted);
      }

      .swagger-ui .json-schema-2020-12-keyword__value--secondary {
        color: var(--fg-faint);
      }

      .swagger-ui .json-schema-2020-12-keyword__value--const,
      .swagger-ui .json-schema-2020-12-keyword__value--warning {
        border-color: var(--fg-line);
        color: var(--fg-text);
      }

      .swagger-ui .json-schema-2020-12-value,
      .swagger-ui .json-schema-2020-12-value--primary {
        color: var(--fg-text);
      }

      /* --- the buttons -------------------------------------------------- */

      .swagger-ui .btn {
        background: var(--fg-surface-2);
        border: 1px solid var(--fg-line);
        border-radius: var(--fg-radius-sm);
        box-shadow: none;
        color: var(--fg-text);
        font-weight: 700;
        transition: background 140ms ease, border-color 140ms ease;
      }

      .swagger-ui .btn:hover {
        background: var(--fg-surface-3);
      }

      .swagger-ui .btn.execute {
        background: var(--fg-primary);
        border-color: var(--fg-primary);
        color: #241b05;
      }

      .swagger-ui .btn.execute:hover {
        background: #ffe08a;
        border-color: #ffe08a;
      }

      .swagger-ui .btn.cancel {
        background: transparent;
        border-color: var(--fg-line);
        color: var(--fg-muted);
      }

      .swagger-ui select,
      .swagger-ui input[type="text"],
      .swagger-ui input[type="email"],
      .swagger-ui input[type="password"],
      .swagger-ui textarea {
        background: var(--fg-code);
        border: 1px solid var(--fg-line);
        border-radius: var(--fg-radius-sm);
        box-shadow: none;
        color: var(--fg-text);
      }

      .swagger-ui .copy-to-clipboard button {
        background: var(--fg-surface-3);
        border-radius: var(--fg-radius-sm);
      }

      /* --- the small pieces ---------------------------------------------- */

      /* Only the little chevrons are inverted. Swagger draws them dark for
       * a white page, and a dark chevron on a dark card is invisible.
       * The whole summary row must never be filtered: inverting it turns
       * the dark card into a light one. */
      .swagger-ui .expand-operation {
        filter: invert(1) hue-rotate(180deg);
        opacity: 0.55;
      }

      .swagger-ui .expand-operation:hover {
        opacity: 1;
      }

      .swagger-ui .opblock-control-arrow {
        opacity: 0.6;
      }

      .swagger-ui .opblock-control-arrow:hover {
        opacity: 1;
      }

      .swagger-ui .response-controls,
      .swagger-ui .try-out {
        color: var(--fg-faint);
      }

      .swagger-ui .footer {
        background: transparent;
        padding-top: 24px;
      }

      .swagger-ui .back-to-top {
        background: var(--fg-surface-2);
        border: 1px solid var(--fg-line);
      }

      .swagger-ui .loading-container {
        color: var(--fg-muted);
      }

      .swagger-ui .validation-errors__input {
        background: var(--fg-code);
        color: var(--fg-text);
      }

      .swagger-ui .errors-wrapper {
        background: rgba(255, 122, 122, 0.12);
        border-radius: var(--fg-radius-sm);
      }

      .swagger-ui .errors-wrapper .error-wrapper {
        color: var(--fg-danger);
      }

      .swagger-ui .title small pre {
        color: var(--fg-secondary);
      }

      @media (max-width: 700px) {
        .swagger-ui .wrapper {
          padding: 0 14px 64px;
        }

        .swagger-ui .info .title {
          font-size: 26px;
        }

        .swagger-ui .opblock-tag {
          font-size: 19px;
        }
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
          defaultModelExpandDepth: 3,
          tryItOutEnabled: true,
          displayRequestDuration: true,
          filter: false,
          persistAuthorization: false,
          layout: "BaseLayout",
          docExpansion: "list",
        });
      };
    </script>
  </body>
</html>
`;
