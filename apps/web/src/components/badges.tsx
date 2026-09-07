import type { SvgIconProps } from '@mui/material/SvgIcon'
import { Box, IconButton, Stack, Typography } from '@mui/material'
import AssistWalkerIcon from '@mui/icons-material/AssistWalker'
import BlockIcon from '@mui/icons-material/Block'
import BoltIcon from '@mui/icons-material/Bolt'
import CampaignIcon from '@mui/icons-material/Campaign'
import CelebrationIcon from '@mui/icons-material/Celebration'
import CoffeeIcon from '@mui/icons-material/Coffee'
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import EuroIcon from '@mui/icons-material/Euro'
import FavoriteIcon from '@mui/icons-material/Favorite'
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter'
import FlagIcon from '@mui/icons-material/Flag'
import HotelIcon from '@mui/icons-material/Hotel'
import PanToolIcon from '@mui/icons-material/PanTool'
import PersonOffIcon from '@mui/icons-material/PersonOff'
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone'
import QuestionMarkIcon from '@mui/icons-material/QuestionMark'
import ScheduleIcon from '@mui/icons-material/Schedule'
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied'
import SportsIcon from '@mui/icons-material/Sports'
import SportsHandballIcon from '@mui/icons-material/SportsHandball'
import SportsVolleyballIcon from '@mui/icons-material/SportsVolleyball'
import StarIcon from '@mui/icons-material/Star'
import TagFacesIcon from '@mui/icons-material/TagFaces'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import WatchIcon from '@mui/icons-material/Watch'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import WarningIcon from '@mui/icons-material/Warning'
import type { AnyBadgeIcon, MemberBadge } from '@blackbox/shared'
import {
  CrownIcon,
  GoatTextIcon,
  JerseyIcon,
  MinusSevenIcon,
  SockIcon,
  ThirtyIcon,
  TwoMinutesIcon,
} from './icons'
import { palette } from '../theme'

/**
 * Le dessin des badges. QUI les porte se décide côté serveur — les comptages
 * par règle et par joueur n'existent dans aucune charge utile du front.
 *
 * Ce registre doit couvrir toute la liste d'icônes du paquet partagé : les deux
 * se modifient ensemble, sinon la base peut contenir une icône que le front ne
 * sait pas dessiner.
 */

type IconComponent = React.ComponentType<SvgIconProps>

export const BADGE_COMPONENTS: Record<AnyBadgeIcon, IconComponent> = {
  // Décernées par le système — classement et première amende —, jamais par une règle.
  euro: EuroIcon,
  crown: CrownIcon,
  // Proposées au gestionnaire à la création d'une règle.
  star: StarIcon,
  sock: SockIcon,
  hide: VisibilityOffIcon,
  minus7: MinusSevenIcon,
  thirty: ThirtyIcon,
  megaphone: CampaignIcon,
  clock: ScheduleIcon,
  twomin: TwoMinutesIcon,
  angry: SentimentVeryDissatisfiedIcon,
  hand: PanToolIcon,
  phone: PhoneIphoneIcon,
  danger: WarningIcon,
  absence: PersonOffIcon,
  late: WatchIcon,
  jersey: JerseyIcon,
  assistwalker: AssistWalkerIcon,
  hotel: HotelIcon,
  coffee: CoffeeIcon,
  // Handball.
  goattext: GoatTextIcon,
  player: SportsHandballIcon,
  ball: SportsVolleyballIcon,
  whistle: SportsIcon,
  muscle: FitnessCenterIcon,
  // Génériques, sans sens imposé.
  heart: FavoriteIcon,
  bolt: BoltIcon,
  trophy: EmojiEventsIcon,
  thumbup: ThumbUpIcon,
  thumbdown: ThumbDownIcon,
  tagfaces: TagFacesIcon,
  donotdisturb: DoNotDisturbOnIcon,
  flag: FlagIcon,
  party: CelebrationIcon,
  question: QuestionMarkIcon,
}

/**
 * La couleur d'un badge.
 *
 * Accent orange par défaut, pas une couleur d'état : dans cette app le jaune,
 * le rouge et le gris disent où en est un PAIEMENT. Une distinction n'en a pas.
 * La couronne fait exception — elle se lit dorée, et rien d'autre ne le dit.
 */
export const badgeColor = (icon: AnyBadgeIcon) =>
  icon === 'crown' ? palette.accentSoft : palette.accent

/**
 * « Le plus de Carton rouge en match (3 amendes / 45 €) ».
 *
 * Un seul endroit compose ce texte : l'infobulle du prénom et la liste de la
 * fiche joueur disent exactement la même chose.
 */
export const badgeText = (b: MemberBadge) =>
  // Singulier jusqu'à 1 inclus, zéro compris — « 0 amende », comme le veut
  // l'usage français. Le cas se produit sur le badge du dernier au classement.
  `${b.label} (${b.count} amende${b.count > 1 ? 's' : ''} / ${b.amount} €)`

/**
 * Choix d'une icône de badge.
 *
 * Une grille plutôt qu'une liste déroulante : on choisit une icône à l'œil, pas
 * par son nom. `null` est une option à part entière — une règle peut ne décerner
 * aucun badge, et l'admin peut vouloir éteindre une distinction du système.
 *
 * La liste proposée est un paramètre : une règle ne peut pas s'attribuer l'euro
 * ni la couronne, alors que les réglages y ont droit.
 */
export const BadgeIconPicker = <T extends AnyBadgeIcon>({
  label,
  icons,
  value,
  onChange,
}: {
  /** Omis quand le titre d'une boîte de dialogue le dit déjà. */
  label?: string
  icons: readonly T[]
  value: T | null
  onChange: (icon: T | null) => void
}) => (
  <Stack spacing={0.5}>
    {label && (
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
    )}

    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.5 }}>
      <IconButton
        aria-label="Aucun badge"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        sx={{
          border: '1px solid',
          borderColor: value === null ? palette.accent : 'rgba(148,163,184,0.25)',
          color: value === null ? palette.accent : palette.textMuted,
          borderRadius: 1,
        }}
      >
        <BlockIcon fontSize="small" />
      </IconButton>

      {icons.map((icon) => {
        // Annoté : l'accès indexé par un générique perd le type du composant,
        // et TypeScript ne sait plus qu'il accepte les props d'une icône.
        const Icon: IconComponent = BADGE_COMPONENTS[icon]
        const active = value === icon
        return (
          <IconButton
            key={icon}
            aria-label={icon}
            aria-pressed={active}
            onClick={() => onChange(icon)}
            sx={{
              border: '1px solid',
              borderColor: active ? palette.accent : 'rgba(148,163,184,0.25)',
              bgcolor: active ? 'rgba(249,115,22,0.12)' : 'transparent',
              color: active ? palette.accent : palette.text,
              borderRadius: 1,
            }}
          >
            <Icon fontSize="small" />
          </IconButton>
        )
      })}
    </Box>
  </Stack>
)
