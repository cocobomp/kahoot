import { EVENTS } from "@razzia/common/constants"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  time: number
  total: number
  label: string
}

/** Countdown and "x/total" counter shown during the gage proposals and vote. */
const GageHud = ({ time, total, label }: Props) => {
  const [cooldown, setCooldown] = useState(time)
  const [count, setCount] = useState(0)
  const { t } = useTranslation()

  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    setCooldown(sec)
  })

  useEvent(EVENTS.GAME.PLAYER_ANSWER, (value) => {
    setCount(value)
  })

  return (
    <div className="mx-auto mb-4 flex w-full max-w-7xl justify-between gap-1 px-2 text-lg font-bold text-white md:text-xl">
      <div className="flex flex-col items-center rounded-lg bg-black/40 px-4 text-lg font-bold">
        <span className="translate-y-1 text-sm">{t("game:hud.time")}</span>
        <span>{cooldown}</span>
      </div>
      <div className="flex flex-col items-center rounded-lg bg-black/40 px-4 text-lg font-bold">
        <span className="translate-y-1 text-sm">{label}</span>
        <span>
          {count}/{total}
        </span>
      </div>
    </div>
  )
}

export default GageHud
