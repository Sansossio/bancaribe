const FIXED_COOKIE = ['Secure', 'HttpOnly']

export class CookieManager {
  private cookies: Map<string, string> = new Map()

  private parseCookies (str: string) {
    const rx = /([^;=\s]*)=([^;]*)/g
    const obj: any = {}
    for (let m; m = rx.exec(str);) { obj[m[1]] = decodeURIComponent(m[2]) }
    return obj
  }

  setCookie (cookies: string[]) {
    const cookiesParsed = cookies.map((cookie) => this.parseCookies(cookie)).flat().reduce((acc, cookie) => ({ ...acc, ...cookie }), {})
    for (const cookieKey in cookiesParsed) {
      this.cookies.set(cookieKey, cookiesParsed[cookieKey])
    }
  }

  deleteAll () {
    this.cookies.clear()
  }

  toString () {
    const response = [...this.cookies.keys()]
      .reduce<string[]>((acc, key) => {
        const value = this.cookies.get(key)
        acc.push(`${key}=${value}`)
        return acc
      }, [])
      .concat(FIXED_COOKIE)
      .join('; ')

    return `${response};`
  }
}
