import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PushConfig } from '@blackbox/shared'
import { apiFetch } from './client'

/** La clé publique VAPID voyage en base64url ; l'API du navigateur veut des octets. */
const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** L'app tourne-t-elle depuis l'écran d'accueil plutôt que dans un onglet ? */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // Propriété historique d'iOS, toujours la seule fiable là-bas.
  (navigator as unknown as { standalone?: boolean }).standalone === true

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window

/**
 * Pourquoi les notifications sont indisponibles, le cas échéant.
 * `ios-not-installed` est le cas le plus fréquent et le moins évident : sur
 * iPhone, le push n'existe que si l'app a été ajoutée à l'écran d'accueil.
 */
export type PushBlocker = 'unsupported' | 'ios-not-installed' | 'denied' | null

export const usePush = () => {
  const config = useQuery({
    queryKey: ['push-config'],
    queryFn: () => apiFetch<PushConfig>('/push/config'),
    staleTime: Infinity,
  })

  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // État réel de l'appareil : c'est l'abonnement du navigateur qui fait foi,
  // pas une préférence stockée quelque part.
  useEffect(() => {
    if (!supported()) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(sub !== null))
      .catch(() => setSubscribed(false))
  }, [])

  const blocker: PushBlocker = !supported()
    ? 'unsupported'
    : isIOS() && !isStandalone()
      ? 'ios-not-installed'
      : Notification.permission === 'denied'
        ? 'denied'
        : null

  const subscribe = async () => {
    setBusy(true)
    setError(null)
    try {
      // La demande de permission DOIT partir d'un geste utilisateur : appelée
      // au chargement, iOS la refuse en silence.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Permission refusée')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.data!.publicKey!),
      })

      await apiFetch('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) })
      setSubscribed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation impossible')
    } finally {
      setBusy(false)
    }
  }

  const unsubscribe = async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // On prévient le serveur AVANT de résilier localement : sinon l'endpoint
        // est perdu et sa ligne resterait en base jusqu'au premier envoi raté.
        await apiFetch('/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Désactivation impossible')
    } finally {
      setBusy(false)
    }
  }

  return {
    /** Le serveur a-t-il des clés VAPID ? Sinon, rien à proposer. */
    available: config.data?.enabled === true,
    blocker,
    subscribed,
    busy,
    error,
    subscribe,
    unsubscribe,
  }
}
