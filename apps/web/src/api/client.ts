/**
 * Client HTTP minimal.
 *
 * Chemin relatif `/api` : en dev le proxy Vite l'envoie sur le conteneur api,
 * en prod le Nginx Proxy Manager fait la même chose. Aucune URL à injecter
 * au build ni au runtime.
 */
export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    // Indispensable dès l'étape 2 : le JWT voyage en cookie httpOnly.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.message ?? `${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}
