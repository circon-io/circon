import { buttonVariants } from '@heroui/react'
import { site } from '@/content/site'
import type { Dictionary } from '@/i18n/dictionaries'
import { CopyCommand } from '../copy-command'
import { RunConsole } from '../graphics/run-console'
import { cx } from '../ui/cx'
import { ArrowRightIcon, GitHubIcon } from '../ui/icons'

export function Hero({ dict }: { dict: Dictionary }) {
  const t = dict.hero
  return (
    <section className="relative overflow-hidden pb-20 pt-14 sm:pb-28 sm:pt-20">
      {/* Backdrop: grid, two drifting orbs. Decorative only. */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="orb left-[8%] top-[-8%] size-[28rem] bg-accent" />
        <div className="orb right-[2%] top-[18%] size-[22rem] bg-glow [animation-delay:-6s]" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div>
          <div className="fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
              <span className="size-1.5 rounded-full bg-accent animate-pulse-ring" />
              {t.eyebrow}
            </p>
          </div>
          <div className="fade-up [--delay:60ms]">
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {t.titleLead} <span className="text-gradient">{t.titleAccent}</span>
            </h1>
          </div>
          <p className="fade-up mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted [--delay:120ms]">{t.subtitle}</p>
          <div className="fade-up mt-8 flex flex-wrap gap-3 [--delay:180ms]">
            <a href="#install" className={cx(buttonVariants({ size: 'lg', variant: 'primary' }), 'gap-2')}>
              {t.primary}
              <ArrowRightIcon />
            </a>
            <a href={site.githubUrl} className={cx(buttonVariants({ size: 'lg', variant: 'outline' }), 'gap-2')}>
              <GitHubIcon />
              {t.secondary}
            </a>
          </div>
          <div className="fade-up mt-10 max-w-xl [--delay:240ms]">
            <div id="install" className="scroll-mt-28">
              <p className="mb-2 text-xs font-medium text-muted">{t.installLabel}</p>
              <CopyCommand command={site.installCommand} copy={t.copy} copied={t.copied} />
              <p className="mt-2 text-xs text-muted">{t.installNote}</p>
            </div>
          </div>
        </div>

        <div className="fade-up relative [--delay:200ms]">
          <RunConsole t={dict.console} />
        </div>
      </div>
    </section>
  )
}
