# @app/ui

The design-system adapter. Screens import from here, never from `heroui-native`
directly, so replacing or restyling the library is a change in one package.

Every component requires `testID` and `accessibilityLabel`. The quality gate
finds elements through the accessibility tree, so a component that drops them
makes everything beneath it invisible to the agent, which then counts as not
built.

The app renders on iOS, Android and the web from the same components: Expo's
web export runs React Native through `react-native-web`. When a project adds a
separate marketing site (`apps/web`, Next.js), that site uses HeroUI for the web,
wrapped here the same way.
