import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ApplyRuleResult,
  ClaimableMember,
  Dashboard,
  Fine,
  MemberDetail,
  MemberSummary,
  Me,
  ResetPasswordResult,
  Rule,
  RuleContext,
  RuleKind,
  Settings,
  SignupContext,
} from '@blackbox/shared'
import { apiFetch } from './client'

const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

const patch = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

// ---------------------------------------------------------------- session

/**
 * `null` = déconnecté. On ne veut pas d'un état d'erreur : un 401 sur /me est
 * la réponse normale quand personne n'est connecté.
 */
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<Me>('/auth/me').catch(() => null),
    retry: false,
    staleTime: Infinity,
  })

export const useSignupContext = () =>
  useQuery({ queryKey: ['signup-context'], queryFn: () => apiFetch<SignupContext>('/auth/context') })

/** Après login/signup/claim, tout est potentiellement obsolète : on vide le cache. */
const useSessionMutation = <TVars>(fn: (vars: TVars) => Promise<Me>) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      qc.invalidateQueries()
    },
  })
}

export const useLogin = () =>
  useSessionMutation((v: { email: string; password: string }) => post<Me>('/auth/login', v))

export const useSignup = () =>
  useSessionMutation((v: { email: string; password: string; inviteCode?: string }) =>
    post<Me>('/auth/signup', v),
  )

export const useClaim = () =>
  useSessionMutation((v: { memberId: number } | { displayName: string }) =>
    post<Me>('/auth/claim', v),
  )

export const useLogout = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post('/auth/logout'),
    onSuccess: () => {
      // Surtout PAS qc.clear() : il vide aussi le cache des MUTATIONS, donc la
      // mutation en cours de résolution est détruite et le onSuccess passé à
      // mutate() n'est jamais appelé — la redirection ne partait jamais.
      // On retire les données de la caisse et on marque la session close ;
      // le routeur voit `me === null` et bascule seul sur /login.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      qc.setQueryData(['me'], null)
    },
  })
}

export const useClaimable = () =>
  useQuery({ queryKey: ['claimable'], queryFn: () => apiFetch<ClaimableMember[]>('/auth/claimable') })

// ---------------------------------------------------------------- données

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/dashboard') })

export const useMembers = () =>
  useQuery({ queryKey: ['members'], queryFn: () => apiFetch<MemberSummary[]>('/members') })

export const useMember = (id: number | 'me') =>
  useQuery({
    queryKey: ['member', id],
    queryFn: () => apiFetch<MemberDetail>(`/members/${id}`),
  })

export const useRules = (includeArchived = false) =>
  useQuery({
    queryKey: ['rules', includeArchived],
    queryFn: () => apiFetch<Rule[]>(`/rules${includeArchived ? '?archived=1' : ''}`),
  })

export const useFines = (filters: { unpaid?: boolean; memberId?: number }) => {
  const params = new URLSearchParams()
  if (filters.unpaid) params.set('unpaid', '1')
  if (filters.memberId) params.set('memberId', String(filters.memberId))
  const qs = params.toString()

  return useQuery({
    queryKey: ['fines', filters.unpaid ?? false, filters.memberId ?? null],
    queryFn: () => apiFetch<Fine[]>(`/fines${qs ? `?${qs}` : ''}`),
  })
}

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => apiFetch<Settings>('/settings') })

// ---------------------------------------------------------------- mutations

/**
 * Une amende touche les totaux, le classement et le fil : plutôt que de lister
 * les clés à invalider une par une (et d'en oublier), on invalide tout.
 * Le volume de données est minuscule, le refetch est instantané.
 */
const useDataMutation = <TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() })
}

export const useAddFine = () =>
  useDataMutation((v: { memberIds: number[]; ruleId: number; tierId?: number }) =>
    post<Fine[]>('/fines', v),
  )

export const useSetFinePaid = () =>
  useDataMutation((v: { id: number; paid: boolean }) =>
    patch<Fine>(`/fines/${v.id}/paid`, { paid: v.paid }),
  )

export const useDeleteFine = () =>
  useDataMutation((id: number) => apiFetch<void>(`/fines/${id}`, { method: 'DELETE' }))

/** Validation d'un signalement : c'est ce geste qui notifie le joueur. */
export const useConfirmFine = () =>
  useDataMutation((id: number) => apiFetch<Fine>(`/fines/${id}/confirm`, { method: 'PATCH' }))

/**
 * Qui peut ouvrir l'écran d'ajout d'amende, et sous quelle forme.
 *
 * Un gestionnaire saisit directement. Un joueur ne peut que signaler, et
 * seulement si l'admin a ouvert cette possibilité.
 */
export const useFineEntry = () => {
  const me = useMe()
  const settings = useSettings()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'
  const canReport = settings.data?.allowPlayerReports === true

  return {
    isStaff,
    /** Le joueur signale au lieu de saisir : l'amende restera à valider. */
    reporting: !isStaff && canReport,
    allowed: isStaff || canReport,
    /** `undefined` tant que les réglages ne sont pas chargés : on ne tranche pas. */
    loading: settings.isPending || me.isPending,
  }
}

export const useCreateRule = () =>
  useDataMutation(
    (v: {
      label: string
      description?: string
      amount: number
      kind: RuleKind
      context: RuleContext
      tiers: { label: string; amount: number }[]
    }) => post<Rule>('/rules', v),
  )

/** Applique une règle à tous les membres d'un coup (cotisation). */
export const useApplyRule = () =>
  useDataMutation((id: number) => post<ApplyRuleResult>(`/rules/${id}/apply`))

export const useUpdateRule = () =>
  useDataMutation(
    (v: {
      id: number
      label?: string
      description?: string | null
      amount?: number
      context?: RuleContext
      tiers?: { label: string; amount: number }[]
      archived?: boolean
    }) => {
      const { id, ...body } = v
      return patch<Rule>(`/rules/${id}`, body)
    },
  )

export const useCreateMember = () =>
  useDataMutation((v: { displayName: string }) => post<MemberSummary>('/members', v))

export const useUpdateMember = () =>
  useDataMutation((v: { id: number; displayName?: string; receivesFines?: boolean }) => {
    const { id, ...body } = v
    return patch<MemberSummary>(`/members/${id}`, body)
  })

/** Détache le compte d'un participant : sert à corriger un nom mal réclamé. */
export const useUnlinkMember = () =>
  useDataMutation((id: number) => post<MemberSummary>(`/members/${id}/unlink`))

/**
 * Réinitialisation par l'admin. Le mot de passe temporaire n'existe que dans
 * cette réponse : il n'est stocké nulle part en clair et ne peut pas être relu.
 */
export const useResetPassword = () =>
  useDataMutation((userId: number) =>
    post<ResetPasswordResult>(`/users/${userId}/reset-password`),
  )

export const useUpdateRole = () =>
  useDataMutation((v: { userId: number; role: 'MANAGER' | 'PLAYER' }) =>
    patch(`/users/${v.userId}/role`, { role: v.role }),
  )

export const useUpdateSettings = () =>
  useDataMutation((v: { lateAfterDays?: number }) => patch<Settings>('/settings', v))

/** Interrupteurs de fonctionnalité : route distincte, réservée à l'admin. */
export const useUpdateFeatures = () =>
  useDataMutation(
    (v: { allowPlayerReports?: boolean; enablePenalties?: boolean; enableDues?: boolean }) =>
      patch<Settings>('/settings/features', v),
  )

/** Renouvellement du code : action de distribution, ouverte aux gestionnaires. */
export const useRegenerateInviteCode = () =>
  useDataMutation(() => apiFetch<Settings>('/settings/invite-code', { method: 'POST' }))

export const useUpdateMe = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { displayName?: string; currentPassword?: string; newPassword?: string }) =>
      patch<Me>('/me', v),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      qc.invalidateQueries()
    },
  })
}
