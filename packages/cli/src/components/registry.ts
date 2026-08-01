import type { Component } from './types.ts'
import {
  aptBaseComponent, sshComponent, kvmComponent, dockerComponent, nvidiaComponent,
  sysctlComponent, gitIdentityComponent, shellEnvComponent,
} from './system.ts'
import { nodeComponent, jsGlobalsComponent } from './node.ts'
import { androidStudioComponent, androidSdkComponent } from './android.ts'
import {
  ollamaComponent, ollamaModelComponent, ollamaTuningComponent, aiderComponent,
} from './ai.ts'
import { workspaceComponent, conventionsComponent, dailyReportComponent } from './workspace.ts'

/**
 * Declaration order is install order. `requires` is validated against it, so a
 * component can never be scheduled before something it depends on.
 */
export const components: Component[] = [
  aptBaseComponent,
  sshComponent,
  nvidiaComponent,
  kvmComponent,
  dockerComponent,
  nodeComponent,
  jsGlobalsComponent,
  androidStudioComponent,
  androidSdkComponent,
  aiderComponent,
  ollamaComponent,
  ollamaModelComponent,
  ollamaTuningComponent,
  workspaceComponent,
  conventionsComponent,
  shellEnvComponent,
  sysctlComponent,
  gitIdentityComponent,
  dailyReportComponent,
]

export function componentById(id: string): Component | undefined {
  return components.find((c) => c.id === id)
}

/** Throws if a `requires` names something unknown or declared later. */
export function validateOrdering(list: Component[] = components): void {
  const seen = new Set<string>()
  for (const component of list) {
    for (const dep of component.requires ?? []) {
      if (!list.some((c) => c.id === dep)) {
        throw new Error(`${component.id} requires unknown component "${dep}"`)
      }
      if (!seen.has(dep)) {
        throw new Error(`${component.id} requires "${dep}", which is declared after it`)
      }
    }
    seen.add(component.id)
  }
}
