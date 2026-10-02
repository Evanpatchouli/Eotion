/** Accept only absolute HTTP(S) links without whitespace or user information. */
export function isSafeLinkHref(href: string): boolean {
  if (!/^https?:\/\//i.test(href) || /\s|[\u0000-\u001f\u007f]/u.test(href)) return false

  try {
    const url = new URL(href)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.hostname.length > 0
      && !url.username
      && !url.password
  } catch {
    return false
  }
}
