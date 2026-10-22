import { CodeIcon, FlaskIcon, GlobeIcon, PhoneIcon, AppleIcon } from '../ui/icons'

/**
 * The feedback loops: the gate's tiers, cheapest first. Each one only runs when
 * the project has what it needs, and a failing tier stops the iteration before
 * anything is committed.
 */
export const TIERS = [
  {
    id: 'typecheck',
    label: 'Typecheck',
    icon: CodeIcon,
    description: 'tsc across the workspace. Seconds, and catches most broken edits before anything runs.',
    needs: 'A tsconfig.json and TypeScript installed.',
  },
  {
    id: 'unit tests',
    label: 'Unit tests',
    icon: FlaskIcon,
    description: "The project's own test suite: business rules, API routes, validation.",
    needs: 'A test script in package.json.',
  },
  {
    id: 'web UI',
    label: 'Web',
    icon: GlobeIcon,
    description: 'Starts the API and the web app, reads the accessibility tree, and fails on any missing label.',
    needs: '.circon/expected-web.txt and agent-device on the runner.',
  },
  {
    id: 'android UI',
    label: 'Android',
    icon: PhoneIcon,
    description: 'The real app on an emulator the runner boots itself; the native build is redone only when native code changes.',
    needs: '.circon/expected-android.txt and the Android SDK.',
  },
  {
    id: 'ios UI',
    label: 'iOS',
    icon: AppleIcon,
    description: 'The simulator on a Mac runner, or a USB iPhone on Linux or macOS.',
    needs: '.circon/expected-ios.txt and an iOS mode on the runner.',
  },
] as const

export type TierId = (typeof TIERS)[number]['id']
