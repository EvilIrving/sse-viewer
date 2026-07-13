# Release checklist

Run `npm run release`; it validates manifest and locale data, builds Chrome and Edge ZIPs, then inspects each archive. Confirm the packages contain the DevTools page, service worker, injected scripts, locales and icons, with no source-control or documentation files.

Load each unzipped archive in Chrome and Edge. Open DevTools on a page with an SSE connection, select SSE Inspector, refresh the page and verify stream grouping, JSON formatting, filtering and the empty state. Confirm site, privacy, release and store-listing URLs use the same repository before creating a `v*` tag.
