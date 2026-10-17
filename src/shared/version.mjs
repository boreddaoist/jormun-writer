// Compare two version strings like 0.3.2 and v0.10.0. Returns 1, 0 or -1.
export function compareVersions(a, b) {
  const n = (v) => String(v).replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0)
  const A = n(a)
  const B = n(b)
  for (let i = 0; i < 3; i++) {
    if ((A[i] || 0) > (B[i] || 0)) return 1
    if ((A[i] || 0) < (B[i] || 0)) return -1
  }
  return 0
}
