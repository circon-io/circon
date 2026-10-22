/**
 * The icon set, as inline SVG on a 24px grid with a 1.75 stroke: no icon
 * package, no font, and every icon inherits the text color around it.
 */

type IconProps = { className?: string; title?: string }

function make(paths: React.ReactNode) {
  return function Icon({ className = 'size-4', title }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
      >
        {title ? <title>{title}</title> : null}
        {paths}
      </svg>
    )
  }
}

export const HomeIcon = make(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>)
export const FolderIcon = make(<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />)
export const PlayIcon = make(<path d="M7 4.5v15l12-7.5z" />)
export const ServerIcon = make(<><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>)
export const InboxIcon = make(<><path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" /><path d="M5 5h14l2 8.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5.5z" /></>)
export const SettingsIcon = make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>)
export const ChevronRightIcon = make(<path d="m9 6 6 6-6 6" />)
export const ChevronLeftIcon = make(<path d="m15 6-6 6 6 6" />)
export const ExternalIcon = make(<><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>)
export const CheckIcon = make(<path d="m5 12.5 4.5 4.5L19 7.5" />)
export const XIcon = make(<path d="M6 6l12 12M18 6 6 18" />)
export const AlertIcon = make(<><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.5h.01" /></>)
export const ClockIcon = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>)
export const BranchIcon = make(<><circle cx="6" cy="5.5" r="2" /><circle cx="6" cy="18.5" r="2" /><circle cx="18" cy="8.5" r="2" /><path d="M6 7.5v9M18 10.5c0 4-6 3-11 6.5" /></>)
export const PullRequestIcon = make(<><circle cx="6" cy="5.5" r="2" /><circle cx="6" cy="18.5" r="2" /><circle cx="18" cy="18.5" r="2" /><path d="M6 7.5v9M18 16.5V9a2 2 0 0 0-2-2h-4M13.5 4.5 11 7l2.5 2.5" /></>)
export const TerminalIcon = make(<><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5" /></>)
export const KeyIcon = make(<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2" /></>)
export const SparklesIcon = make(<><path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.2 10.2 12.6 4.5 10.8 10.2 9z" /><path d="M19 3v4M17 5h4" /></>)
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />)
export const CopyIcon = make(<><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" /><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" /></>)
export const SunIcon = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>)
export const MoonIcon = make(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />)
export const MenuIcon = make(<path d="M4 7h16M4 12h16M4 17h16" />)
export const GlobeIcon = make(<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.8 2.5 14.2 0 17M12 3.5c-2.5 2.8-2.5 14.2 0 17" /></>)
export const PhoneIcon = make(<><rect x="6.5" y="2.5" width="11" height="19" rx="2" /><path d="M11 18.5h2" /></>)
export const AppleIcon = make(<><path d="M16.5 12.8c0-2.4 2-3.5 2-3.6a4.4 4.4 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.6.9s-1.9-.9-3.1-.8A4.6 4.6 0 0 0 4.4 10c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.2 2.8-2.4a10 10 0 0 0 1.3-2.6 4 4 0 0 1-2.4-4.2z" /><path d="M14 4.5a3.2 3.2 0 0 0 .8-2.5 3.4 3.4 0 0 0-2.2 1.1 3.1 3.1 0 0 0-.8 2.4 2.8 2.8 0 0 0 2.2-1z" /></>)
export const CodeIcon = make(<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4" />)
export const FlaskIcon = make(<><path d="M9.5 3.5h5M10.5 3.5v6L5 18.5A1.5 1.5 0 0 0 6.3 20.5h11.4a1.5 1.5 0 0 0 1.3-2L13.5 9.5v-6" /><path d="M7.5 14.5h9" /></>)
export const LoopIcon = make(<><path d="M17 3.5 20.5 7 17 10.5" /><path d="M3.5 12V10a3 3 0 0 1 3-3h14" /><path d="M7 20.5 3.5 17 7 13.5" /><path d="M20.5 12v2a3 3 0 0 1-3 3h-14" /></>)
export const RocketIcon = make(<><path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2" /><path d="M9.5 14.5 7 12c.8-4.5 4.4-8.5 13-9-.5 8.6-4.5 12.2-9 13z" /><circle cx="15" cy="9" r="1.5" /></>)
export const DollarIcon = make(<path d="M12 3v18M16.5 7.5a4 4 0 0 0-4-2.5H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1.5a4 4 0 0 1-4-2.5" />)
export const CpuIcon = make(<><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>)
export const ShieldIcon = make(<path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6z" />)
export const StopIcon = make(<rect x="6" y="6" width="12" height="12" rx="1.5" />)
export const GithubIcon = make(<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />)
