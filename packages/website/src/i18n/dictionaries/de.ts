import type { Dictionary } from './en.ts'

/** Every string on the site, in German. Typed against `en.ts`, key for key. */
export const de: Dictionary = {
  meta: {
    title: 'circon: von der Idee bis in die Produktion, auf deiner eigenen Maschine',
    shortTitle: 'Von der Idee bis in die Produktion',
    description:
      'Beschreibe deine App, gib den KI-Plan frei, und dein eigener Runner baut, testet und veröffentlicht sie. Hybride Agenten (Claude Code, Codex, aider mit lokalen Modellen), ein mehrstufiges Quality Gate und ein Pull Request pro Lauf.',
    keywords: [
      'KI-Softwareentwicklung',
      'autonomer Coding-Agent',
      'selbst gehosteter KI-Runner',
      'Claude Code',
      'OpenAI Codex',
      'aider',
      'Ollama',
      'Quality Gate',
      'Expo',
      'React Native',
      'App-Entwicklung automatisieren',
    ],
  },

  nav: {
    skip: 'Zum Inhalt springen',
    how: 'So funktioniert’s',
    gate: 'Quality Gate',
    agents: 'Agenten',
    runner: 'Runner',
    pricing: 'Preise',
    faq: 'FAQ',
    github: 'GitHub',
    dashboard: 'Dashboard öffnen',
    getStarted: 'Loslegen',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
    language: 'Sprache',
    themeToLight: 'Zum hellen Modus wechseln',
    themeToDark: 'Zum dunklen Modus wechseln',
    home: 'circon Startseite',
  },

  hero: {
    eyebrow: 'Deine Maschine. Deine Modelle. Deine Konventionen.',
    titleLead: 'Von der Idee bis in die Produktion,',
    titleAccent: 'auf deiner eigenen Maschine.',
    subtitle:
      'Beschreibe die App. Eine KI schreibt den Plan, du gibst ihn frei, und dein eigener Runner baut, testet und veröffentlicht sie. Jede Änderung muss das Quality Gate bestehen, und jeder Lauf endet in einem Pull Request.',
    primary: 'Loslegen',
    secondary: 'Auf GitHub ansehen',
    installLabel: 'Runner installieren',
    copy: 'Kopieren',
    copied: 'Kopiert',
    installNote: 'Ubuntu mit NVIDIA-GPU oder ein Mac mit Apple Silicon.',
  },

  console: {
    label: 'Ein Lauf, live',
    branch: 'circon/run-2026-10-23-a1f3',
    tasksTitle: 'PRD.md',
    tasks: ['Login-Screen mit Magic Link', 'Bestellhistorie mit Filtern', 'Push-Benachrichtigungen bei Statuswechsel'],
    plan: 'Planen',
    build: 'Bauen',
    gate: 'Gate',
    gateChecks: '5 Prüfungen',
    commit: 'Commit',
    pr: 'Pull Request',
    running: 'läuft',
    passed: 'fertig',
    queued: 'wartet',
    iteration: 'Iteration',
    cost: 'Kosten',
    notional: 'Abo',
    prOpened: 'geöffnet',
  },

  stats: [
    { value: '5', label: 'Prüfstufen, günstigste zuerst' },
    { value: '3', label: 'Agenten-Rollen, jede mit eigenem Modell' },
    { value: '1', label: 'Pull Request pro Lauf' },
    { value: '0', label: 'Builds in unserer Cloud' },
  ],

  flow: {
    eyebrow: 'So funktioniert’s',
    title: 'Du entscheidest, was entsteht. Der Runner erledigt den Rest.',
    subtitle:
      'Du gibst zweimal frei, dazwischen arbeitet eine Maschine. Im Dashboard planst und prüfst du, dein Runner schreibt und testet den Code.',
    dashboardLane: 'Dashboard',
    runnerLane: 'Dein Runner',
    steps: [
      {
        lane: 'dashboard',
        title: 'Repository verbinden',
        body: 'Installiere die GitHub App für das Repository, das entstehen soll. circon sieht nur die Repositories, die du auswählst, und eine Deinstallation der App entzieht den Zugriff sofort.',
      },
      {
        lane: 'dashboard',
        title: 'Beschreiben, was entstehen soll',
        body: 'Ein paar Sätze reichen. Der Planer denkt über das Produkt nach und schlägt Ideen vor, die du annimmst oder verwirfst.',
      },
      {
        lane: 'dashboard',
        title: 'Plan freigeben',
        body: 'Verfeinere ihn, bis er stimmt. Der freigegebene Plan wird als PRD.md committet, und nur Menschen bearbeiten ihn.',
      },
      {
        lane: 'runner',
        title: 'Maschine registrieren',
        body: 'Installiere circon und registriere die Maschine mit einem Token aus dem Dashboard, wie einen selbst gehosteten CI-Runner. Sie richtet die Toolchain ein und wartet dann auf Arbeit.',
      },
      {
        lane: 'runner',
        title: 'In einer Schleife bauen',
        body: 'Planen, bauen, testen, committen: eine Aufgabe pro Iteration, auf einem eigenen Branch, nie auf main.',
      },
      {
        lane: 'dashboard',
        title: 'Prüfen und ausliefern',
        body: 'Jeder Lauf endet in einem Pull Request mit Screenshots, Gate-Ergebnissen und Kosten. Gib das Release frei, und es geht raus.',
      },
    ],
  },

  gate: {
    eyebrow: 'Quality Gate',
    title: 'Das Gate entscheidet, nicht der Agent.',
    subtitle:
      'Jede Iteration muss eine Reihe von Prüfungen bestehen, bevor etwas committet wird: die günstigsten zuerst, und der erste Fehler stoppt den Rest. Die UI-Prüfungen steuern die echte App und lesen ihren Accessibility-Tree, statt Screenshots zu vergleichen.',
    tiers: [
      { title: 'Typecheck', body: 'Prüft die Typen im ganzen Projekt. Fängt die meisten kaputten Änderungen in Sekunden ab, bevor etwas läuft.', cost: 'Sekunden' },
      { title: 'Unit-Tests', body: 'Die Test-Suite des Projekts: Geschäftsregeln, API-Routen, Validierung.', cost: 'Sekunden' },
      { title: 'Web-UI', body: 'Startet API und Web-App und schlägt fehl, wenn ein erwartetes Accessibility-Label fehlt.', cost: 'eine Minute' },
      { title: 'Android-UI', body: 'Die echte App auf einem Emulator, den der Runner selbst startet.', cost: 'Minuten' },
      { title: 'iOS-UI', body: 'Der Simulator auf einem Mac-Runner oder ein iPhone per USB unter Linux oder macOS.', cost: 'Minuten' },
    ],
    scenarioPass: 'Alle Prüfungen bestanden: committet',
    scenarioFail: 'Android fehlgeschlagen: Die Änderung wird verworfen, der Fehler fließt in den nächsten Prompt',
    committed: 'committet',
    reverted: 'verworfen',
    breakerTitle: 'Eine festgefahrene Schleife stoppt sich selbst',
    breakerBody:
      'Drei fehlgeschlagene Gates in Folge stoppen die Schleife. Infrastrukturprobleme werden nach einer Pause wiederholt, und Kostenlimits stoppen einen Lauf, bevor er das Budget überschreitet.',
    reviewTitle: 'Ein zweites Paar Augen, alle fünf Iterationen',
    reviewBody: 'Ein Reviewer liest den gesammelten Diff auf Korrektheit und Sicherheit. Seine Befunde fließen in den nächsten Prompt.',
  },

  agents: {
    eyebrow: 'Hybride Agenten',
    title: 'Das richtige Modell für jede Rolle.',
    subtitle:
      'Planen, Bauen und Reviewen sind getrennte Rollen, und jede kann einen anderen Agenten und ein anderes Modell nutzen. Lass einen Anbieter den anderen prüfen und erledige die günstigen Teile mit einem lokalen Modell.',
    roles: [
      { title: 'Planen', body: 'Ein starkes Reasoning-Modell zerlegt die nächste Aufgabe, bevor Code entsteht.' },
      { title: 'Bauen', body: 'Setzt genau eine Aufgabe aus dem Plan um. Committet selbst nie; committet wird nur, was das Gate besteht.' },
      { title: 'Reviewen', body: 'Ein zweites Modell, idealerweise von einem anderen Anbieter, prüft den Diff.' },
    ],
    hub: 'circon run',
    points: [
      {
        title: 'Deine Abos, nicht nur API-Keys',
        body: 'Claude Code und Codex können über die Abos laufen, die du schon bezahlst. Diese Nutzung wird erfasst, aber nie auf deine Kostenlimits angerechnet.',
      },
      {
        title: 'Ein Nutzungslimit ist eine Pause, kein Fehler',
        body: 'Ist das Limit eines Abos erreicht, verwirft die Schleife die angefangene Änderung und wartet, bis das Limit zurückgesetzt wird.',
      },
      {
        title: 'Lokale Modelle auf deiner GPU',
        body: 'aider mit Ollama erledigt die günstigen Änderungen auf deiner NVIDIA-Karte oder deinem Apple Silicon. Ohne Abrechnung pro Token.',
      },
    ],
  },

  runner: {
    eyebrow: 'Deine Maschine, deine Modelle',
    title: 'Mach aus deiner eigenen Maschine einen Runner.',
    subtitle:
      'Der Runner ist Hardware, die du kontrollierst, wie ein selbst gehosteter CI-Runner. Wir führen deinen Code nie in unserer Cloud aus; der gehostete Teil koordiniert nur Projekte, Jobs und Live-Logs.',
    points: [
      {
        title: 'Beliebig oft ausführbar',
        body: 'Das Setup prüft, was wirklich installiert ist, und ergänzt nur, was fehlt. Es lädt nie ein Modell doppelt herunter und dupliziert keine Konfigurationszeile.',
      },
      {
        title: 'Lässt dein Setup in Ruhe',
        body: 'Node aus nvm oder Docker aus deiner Distribution bleiben unangetastet. Upgrades gibt es nur, wenn du sie anforderst.',
      },
      {
        title: 'Linux oder Mac',
        body: 'Ubuntu mit NVIDIA-GPU oder Apple Silicon mit Ollama auf Metal. Web und Android brauchen keine Apple-Hardware.',
      },
      {
        title: 'Hält sauber an',
        body: 'Immer nur ein Lauf. Ein Stopp greift zwischen zwei Iterationen, nie mitten in einem Commit.',
      },
    ],
    terminalTitle: 'runner — zsh',
  },

  conventions: {
    eyebrow: 'Konventionen sind das Produkt',
    title: 'Jedes Projekt wird gleich gebaut.',
    subtitle:
      'Stack, Monorepo-Struktur, Accessibility-Regeln und CI/CD stehen einmal in einem Konventionen-Repository, das jeder Agent liest. Weil jedes Projekt gleich aufgebaut ist, lässt sich Agenten-Code schnell prüfen und jedes Projekt leicht hosten.',
    tree: [
      { path: 'apps/mobile', note: 'Expo: iOS, Android und Web, inklusive Admin' },
      { path: 'apps/web', note: 'Next.js, nur wenn SEO es braucht' },
      { path: 'services/api', note: 'Hono: Auth, Geschäftslogik, Webhooks' },
      { path: 'packages/domain', note: 'Geschäftsregeln in reinem TypeScript' },
      { path: 'packages/shared', note: 'Der Vertrag zwischen Clients und API' },
      { path: 'packages/ui', note: 'HeroUI und HeroUI Native' },
      { path: 'PRD.md', note: 'Was gebaut wird. Nur Menschen bearbeiten es.' },
    ],
    points: [
      { title: 'Portabel von Grund auf', body: 'Standardmäßig Cloudflare, aber nur eine Adapter-Datei darf davon abhängen, damit ein Hosting-Wechsel klein bleibt.' },
      { title: 'Fest pro Lauf', body: 'Konventionen ändern sich nie mitten im Lauf. Sie sind der Vertrag.' },
      { title: 'Versioniert in Git', body: 'Eine Konvention ändern heißt committen. Jeder Runner übernimmt sie beim nächsten Update.' },
    ],
  },

  approve: {
    eyebrow: 'Menschen geben zweimal frei',
    title: 'Du bestimmst, was ausgeliefert wird.',
    gates: [
      {
        label: 'Gate 1',
        title: 'Pull Request mergen',
        body: 'Mergen heißt: „Dieser Code ist korrekt.“ Jeder Lauf kommt als ein Pull Request auf eigenem Branch, mit Screenshots, Prüfergebnissen und Kosten.',
      },
      {
        label: 'Gate 2',
        title: 'Release freigeben',
        body: 'Freigeben heißt: „Das soll jetzt zu den Nutzern.“ Die Web-App geht ins Hosting, die Mobile-Apps über Codemagic zu TestFlight und Google Play. Niemand muss einen Diff lesen.',
      },
    ],
  },

  pricing: {
    eyebrow: 'Preise',
    title: 'Kostenlos starten, auf einer Maschine.',
    subtitle:
      'Die CLI ist Open Source unter der MIT-Lizenz. Deine KI-Anbieter bezahlst du direkt, oder du nutzt Abos, die du schon hast.',
    plans: [
      {
        name: 'Basic',
        price: 'Kostenlos',
        description: 'Für ein Projekt auf einem Runner.',
        cta: 'Kostenlos starten',
        features: ['1 Runner', '1 Projekt', '10 Plan-Generierungen', 'Live-Logs und Job-Queue', '7 Tage Laufhistorie'],
      },
      {
        name: 'Pro',
        price: 'Kostenpflichtig',
        description: 'Für Teams, die mehrere Projekte parallel betreiben.',
        cta: 'Im Dashboard upgraden',
        features: ['10 Runner', '10 Projekte', '100 Plan-Generierungen', 'iOS-Runner', '90 Tage Laufhistorie', 'Priorisierter Support'],
      },
    ],
    recommended: 'Für Teams',
  },

  faq: {
    eyebrow: 'FAQ',
    title: 'Fragen und Antworten.',
    items: [
      {
        q: 'Was ist circon?',
        a: 'circon bringt eine App von der Idee bis in die Produktion. Du beschreibst im Dashboard, was du willst, eine KI schreibt den Projektplan, und nach deiner Freigabe baut, testet und veröffentlicht ein Runner auf deiner eigenen Maschine die App, nach gemeinsamen Engineering-Konventionen.',
      },
      {
        q: 'Läuft mein Code in eurer Cloud?',
        a: 'Nein. Der Runner ist eine Maschine, die dir gehört, registriert wie ein selbst gehosteter CI-Runner. Die gehostete Control Plane koordiniert nur Projekte, Jobs, Live-Logs und Abrechnung. Dein Code wird auf deiner Hardware geklont und gebaut.',
      },
      {
        q: 'Welche KI-Agenten und Modelle werden unterstützt?',
        a: 'aider (mit einem lokalen Ollama-Modell als Editor), Claude Code und OpenAI Codex. Planen, Bauen und Reviewen sind getrennte Rollen, und jede kann einen anderen Agenten und ein anderes Modell nutzen, per Abo oder API-Key.',
      },
      {
        q: 'Welche Hardware braucht ein Runner?',
        a: 'Ubuntu 24.04 oder neuer mit NVIDIA-GPU oder einen Mac mit Apple Silicon. Web- und Android-Tests laufen auf beiden. iOS-Tests nutzen den Simulator auf einem Mac oder ein per USB verbundenes iPhone unter Linux oder macOS.',
      },
      {
        q: 'Welche Apps baut circon?',
        a: 'Full-Stack-Apps in TypeScript: ein Expo-Client für iOS, Android und Web, eine Hono-API, gemeinsame Geschäftslogik und Next.js, wenn eine Marketing-Seite gebraucht wird, alles in einem pnpm-Monorepo, standardmäßig auf Cloudflare deployt.',
      },
      {
        q: 'Wie verhindert circon, dass ein Agent etwas kaputt macht?',
        a: 'Agenten committen nie. Jede Änderung muss ein mehrstufiges Quality Gate bestehen (Typecheck, Unit-Tests, Web-, Android- und iOS-UI), sonst wird sie verworfen. Jeder Lauf arbeitet auf einem eigenen Branch und endet in einem Pull Request, den ein Mensch mergt. Ein Circuit Breaker und Kostenlimits stoppen eine Schleife, die nicht vorankommt.',
      },
      {
        q: 'Was kostet das?',
        a: 'Die CLI ist kostenlos und Open Source unter der MIT-Lizenz. Das gehostete Dashboard hat einen kostenlosen Basic-Plan mit einem Runner und einen Pro-Plan für mehr. KI-Nutzung rechnen deine Anbieter ab, oder sie ist durch bestehende Abos gedeckt, mit Limits pro Lauf und pro Tag, die du festlegst.',
      },
    ],
  },

  cta: {
    title: 'Deine nächste App, gebaut, während du schläfst.',
    subtitle: 'Installiere den Runner, verbinde ein Repository und beschreibe, was du willst.',
    primary: 'Dashboard öffnen',
    secondary: 'Zum Schnellstart',
  },

  footer: {
    tagline: 'Von der Idee bis in die Produktion, auf deiner eigenen Maschine.',
    product: 'Produkt',
    resources: 'Ressourcen',
    legal: 'Rechtliches',
    imprint: 'Impressum',
    privacy: 'Datenschutzerklärung',
    source: 'Quellcode',
    docs: 'Schnellstart',
    license: 'CLI unter MIT. Control Plane und Dashboard unter FSL-1.1-ALv2.',
    rights: 'Alle Rechte vorbehalten.',
  },

  legal: {
    updated: 'Stand',
    back: 'Zur Startseite',
    breadcrumbHome: 'Startseite',
  },
}
