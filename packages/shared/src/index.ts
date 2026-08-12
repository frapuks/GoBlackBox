import { z } from 'zod'

/**
 * Source de vérité partagée entre l'API et le front.
 * Tout ce qui traverse le réseau est décrit ici, une seule fois.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'PLAYER'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

/** Les montants sont des euros ENTIERS. 0 est valide : la sanction réelle est décrite dans la règle. */
export const amountSchema = z.number().int().min(0).max(10_000)

const nameSchema = z.string().trim().min(1).max(60)
const passwordSchema = z.string().min(8).max(200)

// ---------------------------------------------------------------- health

export const healthSchema = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
  migrations: z.number().int(),
  now: z.string(),
})
export type Health = z.infer<typeof healthSchema>

// ---------------------------------------------------------------- auth

export const signupInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  /** Optionnel uniquement pour le tout premier compte, qui devient ADMIN. */
  inviteCode: z.string().trim().optional(),
})
export type SignupInput = z.infer<typeof signupInput>

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof loginInput>

/** Soit on réclame un membre fantôme existant, soit on en crée un nouveau. */
export const claimInput = z.union([
  z.object({ memberId: z.number().int().positive() }),
  z.object({ displayName: nameSchema }),
])
export type ClaimInput = z.infer<typeof claimInput>

export type Me = {
  user: { id: number; email: string; role: Role }
  /** null tant que le compte n'a pas réclamé son membre. */
  member: { id: number; displayName: string } | null
}

export type ClaimableMember = { id: number; displayName: string }

/** Indique au front s'il doit afficher le champ « code d'invitation ». */
export type SignupContext = { firstAccount: boolean }

// ---------------------------------------------------------------- membres

export const createMemberInput = z.object({ displayName: nameSchema })

export const updateMemberInput = z.object({ displayName: nameSchema.optional() })

export const updateRoleInput = z.object({ role: z.enum(['MANAGER', 'PLAYER']) })

export type MemberSummary = {
  id: number
  displayName: string
  /** null = participant fantôme, pas encore de compte. */
  userId: number | null
  role: Role | null
  totalOwed: number
  totalPaid: number
  /** Au moins une amende impayée dépassant lateAfterDays. */
  hasLate: boolean
}

export type MemberDetail = MemberSummary & { fines: Fine[] }

// ---------------------------------------------------------------- règles

/**
 * FINE    : une infraction, donnée à un ou plusieurs fautifs.
 * DUES    : une cotisation, appliquée à toute l'équipe en une fois.
 * PENALTY : une pénalité de retard, appliquée en une fois aux seuls membres
 *           ayant au moins une amende impayée au-delà du délai.
 *
 * Les trois produisent la même chose au final — une ligne dans `fines`.
 * La cible d'une application se déduit de `kind` côté serveur.
 */
export const RULE_KINDS = ['FINE', 'DUES', 'PENALTY'] as const
export const ruleKindSchema = z.enum(RULE_KINDS)
export type RuleKind = z.infer<typeof ruleKindSchema>

/**
 * Contexte d'application d'une règle. Une règle appartient à exactement un
 * contexte : c'est ce qui permet de ne proposer, au moment de la saisie, que
 * les règles pertinentes là où on se trouve.
 */
export const RULE_CONTEXTS = ['MATCH', 'TRAINING', 'OTHER'] as const
export const ruleContextSchema = z.enum(RULE_CONTEXTS)
export type RuleContext = z.infer<typeof ruleContextSchema>

export const RULE_CONTEXT_LABEL: Record<RuleContext, string> = {
  MATCH: 'Match',
  TRAINING: 'Entraînement',
  OTHER: 'Autres',
}

export const createRuleInput = z.object({
  label: nameSchema,
  description: z.string().trim().max(300).optional(),
  amount: amountSchema,
  kind: ruleKindSchema.default('FINE'),
  context: ruleContextSchema.default('OTHER'),
})

export const updateRuleInput = z.object({
  label: nameSchema.optional(),
  description: z.string().trim().max(300).nullable().optional(),
  amount: amountSchema.optional(),
  context: ruleContextSchema.optional(),
  archived: z.boolean().optional(),
})

export type Rule = {
  id: number
  label: string
  description: string | null
  amount: number
  kind: RuleKind
  context: RuleContext
  archivedAt: string | null
  /** Dernière fois que cette règle a été appliquée. Sert à ne pas cotiser deux fois. */
  lastAppliedAt: string | null
}

/** Retour de l'application d'une cotisation à toute l'équipe. */
export type ApplyRuleResult = { created: number }

// ---------------------------------------------------------------- amendes

/**
 * Une même règle s'applique à plusieurs joueurs d'un coup : quand trois
 * personnes arrivent en retard, on ne veut pas ressaisir trois fois.
 */
export const createFineInput = z.object({
  memberIds: z.array(z.number().int().positive()).min(1).max(50),
  ruleId: z.number().int().positive(),
})

export const setPaidInput = z.object({ paid: z.boolean() })

export type Fine = {
  id: number
  memberId: number
  memberName: string
  ruleId: number | null
  /** Copiés depuis la règle à la création : l'historique ne se réécrit jamais. */
  amount: number
  label: string
  createdAt: string
  paidAt: string | null
  createdByName: string | null
  /** Calculé côté serveur à partir de settings.lateAfterDays. */
  isLate: boolean
}

// ---------------------------------------------------------------- réglages

export const updateSettingsInput = z.object({
  lateAfterDays: z.number().int().min(1).max(365).optional(),
  regenerateInviteCode: z.boolean().optional(),
})

export type Settings = {
  lateAfterDays: number
  /** Présent uniquement pour l'ADMIN : ne doit jamais fuiter vers un joueur. */
  inviteCode?: string
}

export const updateMeInput = z.object({
  displayName: nameSchema.optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: passwordSchema.optional(),
})

// ---------------------------------------------------------------- dashboard

export type Dashboard = {
  lateAfterDays: number
  totalOwed: number
  totalPaid: number
  members: MemberSummary[]
}
