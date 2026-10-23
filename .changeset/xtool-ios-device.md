---
"@circon/cli": minor
---

A USB iPhone on a Linux runner no longer needs a provisioned build: xtool signs the dev client and WebDriverAgent for the phone on the cable, from an App Store Connect key set in `circon config`. The Codemagic dev-client build is now unsigned, and WebDriverAgent is downloaded by `circon setup` instead of built by hand.
