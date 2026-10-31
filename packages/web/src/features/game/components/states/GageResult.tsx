import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import AnswerNote from "@razzia/web/features/game/components/AnswerNote"
import { SFX } from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { Check } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_GAGE_RESULT"]
}

const GageResult = ({ data: { choices, votes, winner, tie } }: Props) => {
  const { t } = useTranslation()
  const [sfxResults] = useSound(SFX.RESULTS_SOUND, { volume: 0.2 })
  const maxVotes = Math.max(1, ...votes)
  const order = [
    winner,
    ...choices
      .map((_, index) => index)
      .filter((index) => index !== winner)
      .sort((a, b) => votes[b] - votes[a]),
  ]
  const note = [
    t("game:gage.validated", { gage: choices[winner] }),
    tie ? t("game:gage.tie") : "",
  ].join(" ")

  useEffect(() => {
    sfxResults()
  }, [sfxResults])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-6 px-2 pb-4">
      <h2 className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-5xl">
        {t("game:gage.resultTitle")}
      </h2>

      <div className="flex max-h-[55vh] w-full max-w-3xl flex-col gap-2 overflow-y-auto p-1">
        {order.map((index) => (
          <div
            key={index}
            className={clsx(
              "text-foreground relative overflow-hidden rounded-xl bg-white px-4 py-3 text-lg font-bold shadow-lg md:text-xl",
              index === winner ? "ring-primary ring-4" : "opacity-80",
            )}
          >
            <div
              className="bg-primary/25 absolute inset-y-0 left-0"
              style={{ width: `${(votes[index] / maxVotes) * 100}%` }}
            />
            <div className="relative flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2 wrap-anywhere">
                {index === winner && (
                  <Check className="text-primary size-6 shrink-0" />
                )}
                {choices[index]}
              </span>
              <span className="tabular-nums">{votes[index]}</span>
            </div>
          </div>
        ))}
      </div>

      <AnswerNote note={note} />
    </div>
  )
}

export default GageResult
