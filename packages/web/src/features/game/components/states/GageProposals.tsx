import {
  EVENTS,
  MAX_GAGE_LENGTH,
  MAX_GAGES_PER_PLAYER,
} from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import GageHud from "@razzia/web/features/game/components/GageHud"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_GAGE_PROPOSALS"]
}

const GageProposals = ({ data: { time, totalPlayer } }: Props) => {
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()
  const [draft, setDraft] = useState("")
  const [gages, setGages] = useState<string[]>([])
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

  const draftText = draft.trim()
  const isFull = gages.length >= MAX_GAGES_PER_PLAYER
  // A gage still being typed is sent too
  const toSend =
    draftText && !isFull && !gages.includes(draftText)
      ? [...gages, draftText]
      : gages

  const addDraft = () => {
    if (!draftText || isFull) {
      return
    }

    setGages((current) =>
      current.includes(draftText) ? current : [...current, draftText],
    )
    setDraft("")
  }

  const handleSend = () => {
    if (!player || !gameId) {
      return
    }

    socket.emit(EVENTS.PLAYER.PROPOSE_GAGE, { gameId, gages: toSend })
  }

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4">
        <h2 className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-5xl">
          {t("game:gage.proposeTitle")}
        </h2>
        <p className="text-center text-lg font-semibold text-white drop-shadow-lg md:text-2xl">
          {t("game:gage.proposeHint", { max: MAX_GAGES_PER_PLAYER })}
        </p>

        {player && (
          <div className="mt-4 flex w-full flex-col gap-3 rounded-xl bg-white p-4 shadow-lg">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                addDraft()
              }}
              className="flex gap-2"
            >
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_GAGE_LENGTH}
                disabled={isFull}
                placeholder={t("game:gage.proposePlaceholder")}
                aria-label={t("game:gage.proposeTitle")}
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={!draftText || isFull}>
                {t("game:gage.addGage")}
              </Button>
            </form>

            {gages.length > 0 && (
              <ul className="flex flex-col gap-2">
                {gages.map((gage) => (
                  <li
                    key={gage}
                    className="text-foreground flex items-center justify-between gap-2 rounded-lg bg-gray-100 px-3 py-2 font-semibold"
                  >
                    <span className="min-w-0 break-words">{gage}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setGages((current) => current.filter((g) => g !== gage))
                      }
                      aria-label={t("game:gage.removeGage")}
                      className="text-muted-foreground shrink-0 hover:text-gray-800"
                    >
                      <X className="size-5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button onClick={handleSend} className="bg-green-600">
              {toSend.length > 0
                ? t("game:gage.sendGages", { number: toSend.length })
                : t("game:gage.noGage")}
            </Button>
          </div>
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
