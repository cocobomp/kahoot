import type { GameGage } from "@razzia/common/types/game"
import { Dices } from "lucide-react"
import { useTranslation } from "react-i18next"

interface Props {
  gage: GameGage
  isLoser?: boolean
}

const formatNames = (names: string[], language: string) => {
  try {
    return new Intl.ListFormat(language, { type: "conjunction" }).format(names)
  } catch {
    return names.join(", ")
  }
}

const GageBanner = ({ gage, isLoser = false }: Props) => {
  const { t, i18n } = useTranslation()
  const names = formatNames(gage.losers, i18n.language)

  return (
    <div className="anim-show z-40 mx-auto w-full max-w-3xl px-2">
      <div className="text-foreground flex items-start gap-3 rounded-xl bg-white px-4 py-3 text-lg font-bold shadow-lg md:text-2xl">
        <Dices className="text-primary mt-1 size-7 shrink-0" />
        <p className="min-w-0 wrap-anywhere">
          {isLoser
            ? t("game:gage.youLose", { gage: gage.text })
            : t("game:gage.forLosers", { names, gage: gage.text })}
        </p>
      </div>
    </div>
  )
}

export default GageBanner
