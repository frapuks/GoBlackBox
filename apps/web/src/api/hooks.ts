import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ApplyRuleResult,
  ClaimableMember,
  Dashboard,
  Fine,
  MemberDetail,
  MemberSummary,
  Me,
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
  useDataMutation((v: { memberIds: number[]; ruleId: number }) => post<Fine[]>('/fines', v))

export const useSetFinePaid = () =>
  useDataMutation((v: { id: number; paid: boolean }) =>
    patch<Fine>(`/fines/${v.id}/paid`, { paid: v.paid }),
  )

export const useDeleteFine = () =>
  useDataMutation((id: number) => apiFetch<void>(`/fines/${id}`, { method: 'DELETE' }))

export const useCreateRule = () =>
  useDataMutation(
    (v: {
      label: string
      description?: string
      amount: number
      kind: RuleKind
      context: RuleContext
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
      archived?: boolean
    }) => {
      const { id, ...body } = v
      return patch<Rule>(`/rules/${id}`, body)
    },
  )

export const useCreateMember = () =>
  useDataMutation((v: { displayName: string }) => post<MemberSummary>('/members', v))

export const useUpdateMember = () =>
  useDataMutation((v: { id: number; displayName?: string }) => {
    const { id, ...body } = v
    return patch<MemberSummary>(`/members/${id}`, body)
  })

export const useUpdateRole = () =>
  useDataMutation((v: { userId: number; role: 'MANAGER' | 'PLAYER' }) =>
    patch(`/users/${v.userId}/role`, { role: v.role }),
  )

export const useUpdateSettings = () =>
  useDataMutation((v: { lateAfterDays?: number; regenerateInviteCode?: boolean }) =>
    patch<Settings>('/settings', v),
  )

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
