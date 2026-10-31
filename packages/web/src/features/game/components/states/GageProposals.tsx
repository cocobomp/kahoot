import { EVENTS, MAX_GAGE_LENGTH } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import GageHud from "@razzia/web/features/game/components/GageHud"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_GAGE_PROPOSALS"]
}

const GageProposals = ({ data: { time, totalPlayer } }: Props) => {
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()
  const [gage, setGage] = useState("")
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

  const handleSubmit = () => {
    const text = gage.trim()

    if (!player || !gameId || !text) {
      return
    }

    socket.emit(EVENTS.PLAYER.PROPOSE_GAGE, { gameId, gage: text })
  }

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4">
        <h2 className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-5xl">
          {t("game:gage.proposeTitle")}
        </h2>
        <p className="text-center text-lg font-semibold text-white drop-shadow-lg md:text-2xl">
          {t("game:gage.proposeHint")}
        </p>

        {player && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleSubmit()
            }}
            className="mt-4 flex w-full flex-col gap-3 rounded-xl bg-white p-4 shadow-lg"
          >
            <Input
              value={gage}
              onChange={(event) => setGage(event.target.value)}
              maxLength={MAX_GAGE_LENGTH}
              placeholder={t("game:gage.proposePlaceholder")}
              aria-label={t("game:gage.proposeTitle")}
            />
            <Button type="submit" disabled={!gage.trim()}>
              {t("common:submit")}
            </Button>
          </form>
        )}
      </div>

      <GageHud
        time={time}
        total={totalPlayer}
        label={t("game:gage.proposals")}
      />
    </div>
  )
}

export default GageProposals
