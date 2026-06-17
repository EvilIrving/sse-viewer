# Product

## Register

product

## Users

Web developers debugging SSE connections. Primary: engineers building AI chat apps with streaming responses. Secondary: developers working on real-time dashboards, notifications, or live feeds. They use DevTools daily, expect Chrome-native UX patterns, and value speed and clarity over decorative polish.

## Product Purpose

A Chrome DevTools panel that surfaces SSE messages with better grouping, search, and JSON inspection than Chrome's built-in Network panel. Exists because the Network panel makes SSE debugging painful: requests are hard to find, messages are buried in EventStream tabs, and JSON requires manual copy-paste to format.

## Brand Personality

Efficient, focused, unobtrusive. Developer-tool minimalism. Not playful, not corporate — just a well-made tool that gets out of the way.

## Anti-references

- **Postman**: Too heavy, too many features, cluttered interface
- **Datadog dashboards**: SaaS aesthetic, charts everywhere, marketing colors
- **Material Design default blue**: Feels generic, not tool-like
- **Over-designed devtools**: Gradients, shadows, animations that slow down interaction

## Design Principles

1. **Information first**: the data matters, not the chrome around it
2. **Native feel**: blend into Chrome DevTools, don't fight the host environment
3. **Zero-config utility**: works immediately, obvious how to use
4. **Density with hierarchy**: show a lot, but make it scannable
