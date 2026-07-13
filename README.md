# SSE Inspector

SSE Inspector is a local DevTools extension for observing Server-Sent Events, EventSource and streaming fetch responses. It groups connections, formats JSON and keeps captured messages inside the browser.

[Website](https://evilirving.github.io/sse-viewer/) · [Install](https://evilirving.github.io/sse-viewer/install.html) · [Privacy](https://evilirving.github.io/sse-viewer/privacy.html) · [Support](https://github.com/EvilIrving/sse-viewer/issues)

## Install

Download the Chrome or Edge archive from [GitHub Releases](https://github.com/EvilIrving/sse-viewer/releases), unzip it and load the folder through the browser’s extension management page. Then open DevTools, select SSE Inspector and refresh the page you want to inspect.

## Development and release

`npm run validate` checks the MV3 manifest, version, referenced files and locales. `npm run package` creates Chrome and Edge archives. `npm run release` also checks generated ZIP contents. The same command runs in CI; a `v*` tag creates the GitHub Release.

## Privacy

The extension observes stream data only after you open its DevTools panel for a tab. Captured data remains local to the browser session and is not sent to external services.
