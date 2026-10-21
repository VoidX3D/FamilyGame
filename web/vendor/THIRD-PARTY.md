# Third-party frontend assets

Vendored into `web/vendor/` by `npm run vendor`. Do not edit these files.

| File | Package | Version | License |
|---|---|---|---|
| `gsap.min.js` | [gsap](https://www.npmjs.com/package/gsap) | 3.15.0 | [GSAP Standard License](https://gsap.com/standard-license) |
| `lenis.min.js`, `lenis.css` | [lenis](https://www.npmjs.com/package/lenis) | 1.3.27 | MIT |
| `socket.io.min.js` | [socket.io-client](https://www.npmjs.com/package/socket.io-client) | 4.8.4 | MIT |

Backend packages (installed in `server/`, not vendored): Express 5.3.0 (MIT), Socket.IO 4.8.4 (MIT), cors 2.8.6 (MIT), swagger-ui-dist 5.17.14 (Apache-2.0).

## The icons

The icon set in `web/assets/icons/` and the `web/icons.js` map generated from
it are [Lucide](https://lucide.dev/), under the ISC licence. They are copied
there by `npm run icons` from the `lucide-static` package, which is a build
time dependency only, so nothing is added to what the browser downloads.

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part
of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```
