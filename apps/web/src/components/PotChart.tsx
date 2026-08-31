import { useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import {
  addDays,
  daysBetween,
  fromDayKey,
  type PotHistoryPoint,
  type PotProjection,
} from '@blackbox/shared'
import { formatDay } from './ui'
import { palette } from '../theme'

/**
 * Évolution de la cagnotte : trait plein sur l'historique, pointillé sur
 * l'estimation.
 *
 * Une seule série, donc aucune légende — le titre la nomme. Le passé et la
 * projection sont la MÊME grandeur : ils se distinguent par la texture, jamais
 * par une seconde couleur, qui ferait croire à deux mesures différentes.
 *
 * SVG écrit à la main : le besoin tient en deux polylignes, et une bibliothèque
 * de graphiques demanderait de découper la série en deux pour obtenir ce
 * pointillé — autant de travail, plus une dépendance.
 */

// Repère de dessin, en unités du viewBox. La hauteur réserve la bande des
// étiquettes d'axe sous le tracé : les inclure dans le cadre évite qu'elles
// soient rognées.
const W = 340
const PLOT_TOP = 10
const PLOT_BOTTOM = 108
const AXIS_Y = 128
const H = 136
const PAD_LEFT = 6
const PAD_RIGHT = 8

export const PotChart = ({
  history,
  projection,
}: {
  history: PotHistoryPoint[]
  /**
   * Calculée par le serveur, seul à connaître les règles de cotisation et
   * l'effectif concerné. Le composant ne fait que la tracer — sa ligne arrive
   * toute faite, marches comprises.
   */
  projection: PotProjection | null
}) => {
  const [hover, setHover] = useState<PotHistoryPoint | null>(null)

  // Deux points au minimum : un seul ne dessine pas une évolution.
  if (history.length < 2) return null

  const first = history[0]!.day
  const current = history[history.length - 1]!.total
  // Le jour de référence vient du serveur, dont l'horloge est celle des
  // amendes. Le front n'a pas la sienne : sur un téléphone mal réglé, la
  // courbe pleine s'arrêterait ailleurs que la projection ne commence.
  const today = projection ? projection.startDay : history[history.length - 1]!.day

  const lastDay = projection ? projection.endDay : today
  const totalDays = Math.max(1, daysBetween(first, lastDay))
  // Le plancher à 1 évite une division par zéro quand la caisse ne contient que
  // des amendes à 0 € — un gâteau d'anniversaire, une tournée.
  //
  // La marge de 22 % au-dessus du maximum n'est pas décorative : c'est la place
  // de l'étiquette du point le plus haut, qui serait sinon rognée par le bord.
  const maxValue = Math.max(1, current, projection?.total ?? 0) * 1.22

  const x = (day: string) =>
    PAD_LEFT + (daysBetween(first, day) / totalDays) * (W - PAD_LEFT - PAD_RIGHT)
  const y = (value: number) =>
    PLOT_BOTTOM - (value / maxValue) * (PLOT_BOTTOM - PLOT_TOP)

  // La courbe se prolonge jusqu'à aujourd'hui même sans amende récente : le
  // montant n'a pas bougé, et s'arrêter à la dernière amende laisserait croire
  // que la caisse s'est arrêtée là.
  const solid = [...history, { day: today, total: current }]
    .filter((p, i, all) => i === 0 || p.day !== all[i - 1]!.day)
    .map((p) => `${x(p.day)},${y(p.total)}`)
    .join(' ')

  const currentX = x(today)
  const projectionX = projection ? x(projection.endDay) : null

  // Les deux étiquettes se chevaucheraient en fin de saison, quand la
  // projection ne dépasse plus le montant courant que de peu. On sacrifie
  // alors celle du courant : c'est la projection qui porte l'information.
  const showCurrentLabel = projectionX === null || projectionX - currentX > 76

  /** Une étiquette au bord se cale dessus plutôt que de le franchir. */
  const anchor = (px: number) => (px > W - 52 ? 'end' : px < 36 ? 'start' : 'middle')

  /** Le jour de l'historique le plus proche du doigt. */
  const pointAt = (clientX: number, target: SVGSVGElement) => {
    const box = target.getBoundingClientRect()
    const ratio = (clientX - box.left) / box.width
    const day = addDays(first, Math.round(ratio * totalDays))
    const seen = history.filter((p) => p.day <= day)
    return seen.length ? seen[seen.length - 1]! : history[0]!
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Évolution
        </Typography>
        {/* Réservé au survol : les deux montants qui comptent sont étiquetés
            sur le tracé, cette ligne ne sert qu'à lire un jour du passé. */}
        {hover && (
          <>
            <Typography variant="caption" color="text.secondary">
              {formatDay(hover.day)}
            </Typography>
            <Typography variant="caption" sx={{ color: palette.text, fontWeight: 600 }}>
              {hover.total} €
            </Typography>
          </>
        )}
      </Stack>

      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        // La méthode d'estimation n'a plus de place sur le tracé : elle vit ici,
        // lue par les lecteurs d'écran et affichée au survol prolongé.
        aria-label={
          projection
            ? `Évolution de la cagnotte : ${current} € aujourd'hui, ${projection.total} € estimés au ${formatDay(projection.endDay)} — dont ${projection.dues} € de cotisations restantes et ${projection.fines} € d'amendes au rythme observé`
            : `Évolution de la cagnotte : ${current} € aujourd'hui`
        }
        sx={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        onPointerMove={(e) => setHover(pointAt(e.clientX, e.currentTarget))}
        onPointerDown={(e) => setHover(pointAt(e.clientX, e.currentTarget))}
        onPointerLeave={() => setHover(null)}
      >
        {/* Une seule ligne de repère, le zéro — la seule valeur qui veuille
            dire quelque chose ici. Un filet haut ne marquerait qu'un maximum
            arbitraire, et viendrait toucher l'étiquette de l'estimation.
            Pleine, jamais pointillée : dans ce graphique le pointillé signifie
            « estimation », l'employer pour la grille brouillerait le sens. */}
        <line
          x1={0}
          y1={PLOT_BOTTOM}
          x2={W}
          y2={PLOT_BOTTOM}
          stroke="rgba(148,163,184,0.25)"
          strokeWidth={1}
        />

        <polyline
          points={solid}
          fill="none"
          stroke={palette.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {projection && (
          <>
            {/* Une droite entre les deux extrémités. Le chemin réel est un
                escalier — les cotisations tombent d'un coup le 1er — mais le
                dessiner ainsi encombre sans rien apprendre. Le point d'arrivée,
                lui, reste calculé cotisation par cotisation. */}
            <line
              x1={currentX}
              y1={y(current)}
              x2={x(projection.endDay)}
              y2={y(projection.total)}
              stroke={palette.accent}
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
              opacity={0.75}
            />
            {/* Cercle creux : le même trait, donc la même grandeur, mais une
                extrémité qui n'a pas été mesurée. */}
            <circle
              cx={x(projection.endDay)}
              cy={y(projection.total)}
              r={4}
              fill={palette.surface}
              stroke={palette.accent}
              strokeWidth={2}
            />
          </>
        )}

        <circle cx={currentX} cy={y(current)} r={4} fill={palette.accent} />

        {/* Étiquettes directes : les deux montants se lisent sans toucher
            l'écran. Le « ≈ » dit l'estimation en un caractère, là où une
            seconde ligne de texte encombrerait le tracé. */}
        {showCurrentLabel && (
          <text
            x={currentX}
            y={y(current) - 9}
            fill={palette.text}
            fontSize={11}
            fontWeight={600}
            textAnchor={anchor(currentX)}
          >
            {current} €
          </text>
        )}

        {projection && projectionX !== null && (
          <text
            x={projectionX}
            y={y(projection.total) - 9}
            fill={palette.accent}
            fontSize={11}
            fontWeight={600}
            textAnchor={anchor(projectionX)}
          >
            ≈ {projection.total} €
          </text>
        )}

        {hover && (
          <line
            x1={x(hover.day)}
            y1={PLOT_TOP}
            x2={x(hover.day)}
            y2={PLOT_BOTTOM}
            stroke="rgba(148,163,184,0.45)"
            strokeWidth={1}
          />
        )}

        <text x={PAD_LEFT} y={AXIS_Y} fill={palette.textMuted} fontSize={10}>
          {monthLabel(first)}
        </text>
        <text x={W - PAD_RIGHT} y={AXIS_Y} fill={palette.textMuted} fontSize={10} textAnchor="end">
          {monthLabel(lastDay)}
        </text>
      </Box>

    </Box>
  )
}

const monthLabel = (day: string) =>
  fromDayKey(day).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
