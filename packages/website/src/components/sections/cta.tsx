import { buttonVariants } from '@heroui/react'
import { site } from '@/content/site'
import type { Dictionary } from '@/i18n/dictionaries'
import { CopyCommand } from '../copy-command'
import { Reveal } from '../reveal'
import { cx } from '../ui/cx'
import { ArrowRightIcon } from '../ui/icons'

export function Cta({ dict }: { dict: Dictionary }) {
  const t = dict.cta
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="beam-border relative overflow-hidden rounded-3xl bg-surface px-6 py-16 text-center sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
            <div className="orb -left-20 -top-20 size-80 bg-accent" />
            <div className="orb -bottom-24 -right-16 size-80 bg-glow [animation-delay:-9s]" />
          </div>
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">{t.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted">{t.subtitle}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={site.dashboardUrl} className={cx(buttonVariants({ size: 'lg', variant: 'primary' }), 'gap-2')}>
              {t.primary}
              <ArrowRightIcon />
            </a>
            <a href={`${site.githubUrl}/blob/main/SETUP.md`} className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              {t.secondary}
            </a>
          </div>
          <div className="mx-auto mt-10 max-w-2xl text-left">
            <CopyCommand command={site.installCommand} copy={dict.hero.copy} copied={dict.hero.copied} />
          </div>
        </div>
      </Reveal>
    </section>
  )
}
