/** Short, URL-safe ids for nodes, edges and variables. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('')
      : Math.random().toString(36).slice(2, 8)
  return `${prefix}-${random}`
}
