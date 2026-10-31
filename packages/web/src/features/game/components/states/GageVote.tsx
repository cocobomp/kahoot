import { EVENTS, MAX_ANSWERS } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Button from "@razzia/web/components/Button"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import GageHud from "@razzia/web/features/game/components/GageHud"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { ANSWERS_COLORS, SFX } from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_GAGE_VOTE"]
}

const GageVote = ({
  data: { choices, time, totalPlayer, ownChoices = [] },
}: Props) => {
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()
  const [selected, setSelected] = useState<number[]>([])
  const { t } = useTranslation()

  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
    interrupt: true,
    loop: true,
  })

  useEffect(() => {
    playMusic()

    return () => {
      stopMusic()
    }
  }, [playMusic, stopMusic])

  // Several gages can be ticked, the player's own ones included
  const toggle = (index: number) => {
    setSelected((current) => {
      if (current.includes(index)) {
        return current.filter((i) => i !== index)
      }

      return current.length >= MAX_ANSWERS ? current : [...current, index]
    })
  }

  const handleVote = () => {
    if (!player || !gameId || selected.length === 0) {
      return
    }

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: { answerKeys: selected },
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col justify-between">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 px-2">
        <h2 className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-5xl">
          {t("game:gage.voteTitle")}
        </h2>
        <p className="text-center text-lg font-semibold text-white drop-shadow-lg md:text-2xl">
          {t("game:gage.voteHint", { max: MAX_ANSWERS })}
        </p>

        <div
          className={clsx(
            "mt-2 grid max-h-full w-full gap-2 overflow-y-auto p-1",
            !player && "md:grid-cols-2",
          )}
        >
          {choices.map((choice, index) => {
            const isOwn = ownChoices.includes(index)

            return (
              <AnswerButton
                key={index}
                label={String(index + 1)}
                className={clsx(
                  ANSWERS_COLORS[index % ANSWERS_COLORS.length],
                  "font-bold",
                )}
                disabled={!player}
                selected={player ? selected.includes(index) : undefined}
                onClick={() => toggle(index)}
              >
                {isOwn ? `${choice} (${t("game:gage.ownProposal")})` : choice}
              </AnswerButton>
            )
          })}
        </div>

        {player && (
          <Button
            onClick={handleVote}
            disabled={selected.length === 0}
            className="w-full max-w-xs bg-green-600"
          >
            {t("game:gage.voteButton", { number: selected.length })}
          </Button>
        )}
      </div>

      <GageHud time={time} total={totalPlayer} label={t("game:hud.answers")} />
    </div>
  )
}

export default GageVote
