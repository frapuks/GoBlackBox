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
  user: {
    id: number
    email: string
    role: Role
    /**
     * Vrai après une réinitialisation par l'admin : l'app bloque sur l'écran de
     * changement tant que ce n'est pas fait.
     */
    mustChangePassword: boolean
  }
  /** null tant que le compte n'a pas réclamé son membre. */
  member: { id: number; displayName: string } | null
}

export type ClaimableMember = { id: number; displayName: string }

/** Indique au front s'il doit afficher le champ « code d'invitation ». */
export type SignupContext = { firstAccount: boolean }

// ---------------------------------------------------------------- membres

export const createMemberInput = z.object({ displayName: nameSchema })

export const updateMemberInput = z.object({
  displayName: nameSchema.optional(),
  receivesFines: z.boolean().optional(),
})

export const updateRoleInput = z.object({ role: z.enum(['MANAGER', 'PLAYER']) })

/**
 * Le mot de passe temporaire n'est renvoyé qu'ici, une seule fois : il n'est
 * stocké que haché et aucune route ne permet de le relire.
 */
export type ResetPasswordResult = { temporaryPassword: string }

export type MemberSummary = {
  id: number
  displayName: string
  /** null = participant fantôme, pas encore de compte. */
  userId: number | null
  role: Role | null
  /**
   * Faux pour un gestionnaire qui ne joue pas : il n'apparaît plus à la saisie
   * d'une amende et sort de la cible des cotisations et des pénalités.
   * Indépendant du rôle — un gestionnaire qui joue reste amendable.
   */
  receivesFines: boolean
  totalOwed: number
  totalPaid: number
  /** Au moins une amende impayée dépassant lateAfterDays. */
  hasLate: boolean
  /**
   * Nombre d'amendes validées reçues. Compté, et non déduit des montants : une
   * amende peut valoir 0 € (une tournée, un gâteau), et un signalement en
   * attente n'a encore rien reçu.
   */
  fineCount: number
  /** Distinctions portées à côté du prénom. Calculées à la lecture. */
  badges: MemberBadge[]
}

export type MemberDetail = MemberSummary & { fines: Fine[] }

/**
 * Un point de l'historique de la cagnotte : le cumul des amendes validées à la
 * fin de ce jour. Seuls les jours où quelque chose s'est passé sont renvoyés —
 * entre deux points, le montant n'a pas bougé.
 */
export type PotHistoryPoint = { day: string; total: number }

/**
 * Prévision de fin de caisse, décomposée en deux termes de nature différente.
 *
 * `dues` ne s'estime pas : on connaît le montant d'une cotisation, l'effectif
 * concerné et le nombre de 1ers du mois restants. `fines` est la seule part
 * réellement estimée, au rythme observé depuis le début.
 *
 * Séparer les deux règle au passage le biais de fin de saison : la fenêtre de
 * rythme ne contient plus aucune cotisation, elle ne peut donc plus en
 * projeter là où il n'en tombera plus.
 *
 * Seules les deux extrémités sont renvoyées : le graphique relie le montant
 * d'aujourd'hui à celui de la fin par une droite. Le chemin réel est un
 * escalier — les cotisations tombent d'un coup le 1er — mais le tracer ainsi
 * alourdit la lecture sans rien apprendre, et la destination reste exacte.
 */
export type PotProjection = {
  /** Aujourd'hui, selon l'horloge du serveur — la même que celle des amendes. */
  startDay: string
  endDay: string
  total: number
  dues: number
  fines: number
}

export type PotHistory = {
  points: PotHistoryPoint[]
  /** null quand l'historique est trop court, ou sans date de fin à venir. */
  projection: PotProjection | null
}

// ---------------------------------------------------------------- badges

/**
 * Icônes proposées au gestionnaire quand il crée une règle d'infraction.
 *
 * Liste fermée et partagée : le formulaire n'en propose pas d'autres, et le
 * front sait donc dessiner tout ce que la base peut contenir. En ajouter une
 * demande de toucher cette liste ET le registre d'icônes du front — les deux
 * sont côte à côte dans la revue.
 */
export const BADGE_ICONS = [
  // Propres au handball et aux usages de la caisse.
  'star',
  'sock',
  'hide',
  'minus7',
  'thirty',
  'megaphone',
  'clock',
  'twomin',
  'angry',
  'hand',
  'phone',
  'danger',
  'absence',
  'late',
  'jersey',
  'assistwalker',
  'hotel',
  'coffee',
  // Handball.
  'goattext',
  'player',
  'ball',
  'whistle',
  'muscle',
  // Génériques : sans sens imposé, à coller sur n’importe quelle règle.
  'heart',
  'bolt',
  'trophy',
  'thumbup',
  'thumbdown',
  'tagfaces',
  'donotdisturb',
  'flag',
  'party',
  'question',
] as const
export type BadgeIcon = (typeof BADGE_ICONS)[number]
export const badgeIconSchema = z.enum(BADGE_ICONS)

/**
 * Icônes que le SYSTÈME décerne, jamais une règle : elles récompensent une
 * position au classement, pas un type d'amende. Hors de la liste ci-dessus pour
 * qu'un gestionnaire ne puisse pas se les attribuer.
 */
export const SYSTEM_BADGE_ICONS = ['euro', 'crown'] as const
export type SystemBadgeIcon = (typeof SYSTEM_BADGE_ICONS)[number]

/**
 * Tout ce qu'un badge peut afficher. Les deux distinctions du classement se
 * choisissent dans cette liste complète — l'admin peut très bien vouloir un
 * éclair au premier —, alors qu'une règle reste limitée à BADGE_ICONS.
 */
export const ALL_BADGE_ICONS = [...SYSTEM_BADGE_ICONS, ...BADGE_ICONS] as const
export type AnyBadgeIcon = (typeof ALL_BADGE_ICONS)[number]
export const anyBadgeIconSchema = z.enum(ALL_BADGE_ICONS)

/**
 * Une distinction portée à côté d'un prénom.
 *
 * Calculée à la lecture, jamais stockée : elle change de porteur dès qu'une
 * amende est ajoutée ou supprimée, et un état enregistré finirait par mentir.
 */
export type MemberBadge = {
  icon: AnyBadgeIcon
  /** Ce qu'il récompense : « Le plus de Carton rouge », « Premier au classement ». */
  label: string
  /** Sanctions concernées, et leur montant cumulé. Le libellé seul ne suffit
   *  pas : la fiche du joueur détaille « (3 / 45 €) » sous chaque badge. */
  count: number
  amount: number
}

/**
 * Les participants qui figurent au classement, dans l'ordre.
 *
 * Ici et non dans un écran : le serveur s'en sert pour décerner l'euro et la
 * couronne, le front pour afficher la liste. Deux implémentations finiraient
 * par désigner des premiers différents.
 *
 * Départage à égalité par le nom, comme le fait le tri SQL.
 */
type Rankable = {
  displayName: string
  receivesFines: boolean
  fineCount: number
  totalOwed: number
  totalPaid: number
}

export const rankedMembers = <T extends Rankable>(members: T[]): T[] =>
  members
    .filter((m) => m.receivesFines || m.fineCount > 0)
    .sort(
      (a, b) =>
        b.totalOwed + b.totalPaid - (a.totalOwed + a.totalPaid) ||
        a.displayName.localeCompare(b.displayName),
    )

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

/**
 * Un palier d'une règle : « 0 à 5 min », « récidive »… Libellé libre, donc le
 * mécanisme ne se limite pas aux durées.
 */
export const ruleTierInput = z.object({ label: nameSchema, amount: amountSchema })
export type RuleTier = { id: number; label: string; amount: number }

export const createRuleInput = z.object({
  label: nameSchema,
  description: z.string().trim().max(300).optional(),
  /** Ignoré quand la règle a des paliers : c'est alors le palier qui décide. */
  amount: amountSchema,
  /** Icône du badge décerné au champion. Absente = la règle n'en décerne pas. */
  badgeIcon: badgeIconSchema.nullable().optional(),
  kind: ruleKindSchema.default('FINE'),
  context: ruleContextSchema.default('OTHER'),
  tiers: z.array(ruleTierInput).max(10).default([]),
})

export const updateRuleInput = z.object({
  label: nameSchema.optional(),
  description: z.string().trim().max(300).nullable().optional(),
  amount: amountSchema.optional(),
  badgeIcon: badgeIconSchema.nullable().optional(),
  context: ruleContextSchema.optional(),
  /** Remplace l'intégralité des paliers. Absent = paliers inchangés. */
  tiers: z.array(ruleTierInput).max(10).optional(),
  archived: z.boolean().optional(),
})

export type Rule = {
  id: number
  label: string
  description: string | null
  amount: number
  kind: RuleKind
  context: RuleContext
  /** Icône du badge que porte le champion de cette règle. */
  badgeIcon: BadgeIcon | null
  /** Vide = règle à montant unique. Sinon, c'est le palier qui porte le montant. */
  tiers: RuleTier[]
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
  /** Obligatoire si la règle a des paliers, interdit sinon. */
  tierId: z.number().int().positive().optional(),
})

export const setPaidInput = z.object({ paid: z.boolean() })

/**
 * État de VALIDATION d'une amende, distinct de son état de paiement.
 *
 * PENDING   : signalée par un joueur, en attente d'un gestionnaire. Ne compte
 *             dans aucun total et ne déclenche aucune notification.
 * CONFIRMED : saisie par un gestionnaire, ou signalement validé.
 */
export const FINE_STATUSES = ['PENDING', 'CONFIRMED'] as const
export const fineStatusSchema = z.enum(FINE_STATUSES)
export type FineStatus = z.infer<typeof fineStatusSchema>

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
  /** Auteur de la saisie : permet à un joueur d'annuler son propre signalement. */
  createdById: number | null
  status: FineStatus
  /** Calculé côté serveur à partir de settings.lateAfterDays. */
  isLate: boolean
}

// ---------------------------------------------------------------- réglages

/**
 * Réglages de la caisse, réservés à l'admin.
 * Le renouvellement du code a sa propre route : il est ouvert aux
 * gestionnaires, contrairement à ces deux réglages.
 */
/**
 * Réglages du quotidien : un gestionnaire les ajuste.
 * Les interrupteurs de fonctionnalité ont leur propre route, réservée à
 * l'admin — deux routes plutôt qu'un contrôle par champ, la garde est alors
 * entièrement portée par le `preHandler`.
 */
/** Date civile seule, sans heure ni fuseau : « 2027-05-31 ». */
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')

export const updateSettingsInput = z.object({
  lateAfterDays: z.number().int().min(1).max(365).optional(),
  // `null` efface la date, `undefined` la laisse telle quelle : sans cette
  // distinction, on ne pourrait jamais revenir en arrière.
  //
  // La cohérence de la plage n'est PAS vérifiée ici : elle porte sur l'état
  // final, que seule la route connaît après fusion avec l'existant.
  endDate: dateSchema.nullable().optional(),
  usageStartDate: dateSchema.nullable().optional(),
  usageEndDate: dateSchema.nullable().optional(),
})

/** Ce que l'équipe utilise. Activer ou couper engage tout le monde : admin. */
/** Les distinctions décernées par le système. `null` retire le badge. */
export const updateBadgesInput = z.object({
  firstBadgeIcon: anyBadgeIconSchema.nullable().optional(),
  lastBadgeIcon: anyBadgeIconSchema.nullable().optional(),
  firstFineBadgeIcon: anyBadgeIconSchema.nullable().optional(),
})

export const updateFeaturesInput = z.object({
  allowPlayerReports: z.boolean().optional(),
  enablePenalties: z.boolean().optional(),
  enableDues: z.boolean().optional(),
})

export type Settings = {
  lateAfterDays: number
  /**
   * Dates de la caisse, au format « AAAA-MM-JJ ». Purement informatives : rien
   * n'est bloqué ni fermé quand elles sont dépassées.
   *
   * `usageEndDate` à null avec un début renseigné = l'argent se dépense sur un
   * seul jour ; renseignée, c'est une plage — typiquement un week-end retenu
   * avant de savoir lequel des deux jours sera le bon.
   */
  endDate: string | null
  usageStartDate: string | null
  usageEndDate: string | null
  /** Les joueurs peuvent-ils signaler une amende, à valider par un gestionnaire ? */
  allowPlayerReports: boolean
  /** Sections de l'écran Règles que l'équipe utilise réellement. */
  enablePenalties: boolean
  enableDues: boolean
  /** Icônes des badges décernés par le système. null = pas de badge. */
  firstBadgeIcon: AnyBadgeIcon | null
  lastBadgeIcon: AnyBadgeIcon | null
  /** Porté par celui qui a reçu la toute première amende, cotisations exclues. */
  firstFineBadgeIcon: AnyBadgeIcon | null
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

// ---------------------------------------------------------------- push

/**
 * Abonnement d'un appareil aux notifications, tel que le navigateur le produit.
 * L'endpoint identifie l'appareil ; les clés servent à chiffrer le message.
 */
export const pushSubscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
})

/** `enabled: false` = serveur sans clés VAPID, le front masque l'interrupteur. */
export type PushConfig = { enabled: boolean; publicKey: string | null }

// ---------------------------------------------------------------- jours civils

/**
 * Jour civil « AAAA-MM-JJ ». Ce format circule partout — base, API, réglages —
 * et se compare directement en chaîne, l'ordre lexicographique étant l'ordre
 * chronologique.
 *
 * Ici et non côté front : la prévision se calcule sur le serveur, qui a besoin
 * de la même arithmétique. Deux implémentations finiraient par diverger d'un
 * jour, et personne ne verrait où.
 *
 * Les conversions passent toujours par une date LOCALE : lue en UTC, une chaîne
 * de ce format désigne la veille dans tout fuseau négatif.
 */
const pad = (n: number) => String(n).padStart(2, '0')

export const toDayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const fromDayKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export const todayKey = () => toDayKey(new Date())

export const addDays = (key: string, days: number) => {
  const d = fromDayKey(key)
  d.setDate(d.getDate() + days)
  return toDayKey(d)
}

/** Nombre de jours de `from` à `to`, négatif si `to` précède. */
export const daysBetween = (from: string, to: string) =>
  Math.round((fromDayKey(to).getTime() - fromDayKey(from).getTime()) / 86_400_000)

/**
 * Les 1ers du mois strictement après `after`, jusqu'à `until` inclus.
 *
 * C'est la date à laquelle l'équipe applique sa cotisation. Codée en dur pour
 * l'instant : rien dans l'app ne l'automatise ni ne l'enregistre, c'est une
 * habitude. Un mois oublié fera donc surestimer.
 */
export const monthStartsBetween = (after: string, until: string): string[] => {
  const days: string[] = []
  const d = fromDayKey(after)
  // Le 1er du mois suivant : si `after` EST un 1er, on ne le recompte pas —
  // la cotisation du jour est soit déjà dans l'historique, soit imminente.
  let cursor = new Date(d.getFullYear(), d.getMonth() + 1, 1)

  while (toDayKey(cursor) <= until) {
    days.push(toDayKey(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return days
}
