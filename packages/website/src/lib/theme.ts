/** Where the color scheme choice is kept. Read by the pre-paint script and the toggle. */
export const themeKey = 'circon-theme'

/**
 * Applies the saved or system color scheme before first paint, so a dark-mode
 * visitor never sees a white flash. Same as the dashboard's, plus the `js`
 * class that lets scroll reveals hide content only when script will show it.
 */
export const themeScript = `(() => {
  document.documentElement.classList.add('js');
  try {
    const saved = localStorage.getItem('${themeKey}');
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch {}
})()`
