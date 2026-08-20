/**
 * Client HTTP minimal.
 *
 * Chemin relatif `/api` : en dev le proxy Vite l'envoie sur le conteneur api,
 * en prod le Nginx Proxy Manager fait la même chose. Aucune URL à injecter
 * au build ni au runtime.
 */
export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  // L'en-tête n'est posé QUE s'il y a un corps. Annoncer `application/json`
  // sur une requête vide fait répondre à Fastify « Body cannot be empty when
  // content-type is set to application/json » — ce qui cassait la déconnexion,
  // la suppression d'une amende et l'application d'une cotisation.
  const hasBody = init?.body !== undefined && init?.body !== null

  const res = await fetch(`/api${path}`, {
    ...init,
    // Indispensable : le JWT voyage en cookie httpOnly.
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.message ?? `${res.status} ${res.statusText}`)
  }

  // 204 sur une suppression : il n'y a rien à analyser, et `res.json()`
  // échouerait sur un corps vide.
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}
