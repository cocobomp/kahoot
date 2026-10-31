import { MAX_GAGES, QUIZZ_MODES } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import Switch from "@razzia/web/components/Switch"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Dices, Plus, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

/** Forfeits ("gages") players propose and vote on before the first question. */
const QuizzEditorGages = () => {
  const { gameMode } = useQuizzEditor()
  const { control, setValue } = useFormContext<QuizzFormValues>()
  const gages = useWatch({ control, name: "gages" }) ?? []
  const { t } = useTranslation()

  if (gameMode !== QUIZZ_MODES.QUIZ) {
    return null
  }

  const update = (next: string[]) => {
    setValue("gages", next, { shouldDirty: true })
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button className="bg-accent text-accent-foreground text-md px-4 py-2 font-semibold">
          <Dices className="size-5" />
          {t("quizz:gages.button")}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />

        <Dialog.Content className="bg-background data-[state=open]:animate-fade fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl p-4 shadow-xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-foreground text-lg font-semibold">
              {t("quizz:gages.title")}
            </Dialog.Title>

            <Dialog.Close
              aria-label={t("common:close")}
              className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-md p-1"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-muted-foreground text-sm">
            {t("quizz:gages.hint")}
          </Dialog.Description>

          <Controller
            control={control}
            name="gageVote"
            render={({ field }) => (
              <label className="text-foreground flex items-center justify-between gap-4 font-semibold">
                {t("quizz:gages.enable")}
                <Switch
                  aria-label={t("quizz:gages.enable")}
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              </label>
            )}
          />

          <p className="text-muted-foreground text-sm">
            {t("quizz:gages.fallback")}
          </p>

          {gages.length > 0 && (
            <div className="flex flex-col gap-2">
              {gages.map((gage, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    variant="sm"
                    className="flex-1"
                    value={gage}
                    aria-label={t("quizz:gages.label", { number: index + 1 })}
                    placeholder={t("quizz:gages.placeholder")}
                    onChange={(event) =>
                      update(
                        gages.map((value, i) =>
                          i === index ? event.target.value : value,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={t("quizz:gages.remove")}
                    className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-md p-2"
                    onClick={() => update(gages.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {gages.length < MAX_GAGES && (
            <Button
              className="bg-accent text-accent-foreground text-md px-4 py-2 font-semibold"
              onClick={() => update([...gages, ""])}
            >
              <Plus className="size-4" />
              {t("quizz:gages.add")}
            </Button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default QuizzEditorGages
