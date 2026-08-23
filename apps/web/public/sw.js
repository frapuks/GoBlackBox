/**
 * Service worker dédié aux notifications.
 *
 * Il ne met RIEN en cache et n'intercepte aucune requête réseau : pas de
 * gestionnaire `fetch`. C'est délibéré — un cache mal réglé sert une version
 * périmée de l'app pendant des jours après un déploiement, et se répare mal
 * quand l'app est installée sur quinze téléphones. Les notifications n'en ont
 * pas besoin.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Message illisible : on affiche quand même quelque chose plutôt que rien.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'BLACKBOX', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  // Réutilise l'onglet déjà ouvert plutôt que d'en empiler un nouveau à chaque
  // notification.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.navigate(url).then((c) => c && c.focus())
      }
      return self.clients.openWindow(url)
    }),
  )
})
