# @app/ui

The seam between the product and the design system.

Screens import from here, never directly from HeroUI or Fragment UI. Fragment UI
is early-stage and would otherwise own the auth and billing screens outright —
this keeps replacing it a change to one package rather than a rewrite.

Two rules:

- **Every exported component forwards `testID` and `accessibilityLabel`.** The
  automated gate drives the app through its accessibility tree; a wrapper that
  swallows those props makes everything beneath it invisible and therefore
  untestable.
- Wrap, do not re-implement. If HeroUI has the component, the wrapper should be
  a few lines of prop mapping.
