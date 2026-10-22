import { Geist, Geist_Mono } from 'next/font/google'

/** The dashboard's type. next/font downloads it at build time and serves it from our origin, so no visitor's browser ever asks Google. */
export const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
export const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
