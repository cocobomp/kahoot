// oxlint-disable typescript/no-unnecessary-condition
import {
  EVENTS,
  GAGE_PROPOSAL_TIME,
  GAGE_VOTE_TIME,
  MAX_GAGE_LENGTH,
  MAX_GAGES,
  MAX_POINTS,
  MEDIA_TYPES,
  NO_TIME_LIMIT,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import { isEstimationOptions } from "@razzia/common/questions/options"
import type {
  Answer,
  GameGage,
  GameResult,
  GameSettings,
  GameUpdateQuestion,
  Player,
  Question,
  QuestionResult,
  Quizz,
  QuizzMode,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import {
  countAnswers,
  scoreQuestion,
  type ScoredPlayer,
} from "@razzia/socket/services/scoring/round"
import { orderToPoint, timeToPoint } from "@razzia/socket/utils/game"
import sleep, { SECOND_MS } from "@razzia/socket/utils/sleep"
import { nanoid } from "nanoid"

type BroadcastFn = <T extends Status>(
  _status: T,
  _data: StatusDataMap[T],
) => void
type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

export interface RoundManagerOptions {
  quizz: Quizz
  players: PlayerManager
  cooldown: CooldownTimer
  io: Server
  gameId: string
  getManagerId: () => string
  broadcast: BroadcastFn
  send: SendFn
  onNewQuestion: () => void
  onGameFinished: (_result: GameResult) => void
  getSettings: () => GameSettings
}

interface GageChoice {
  text: string
  /** Players who proposed it: they cannot vote for it */
  authorIds: string[]
}

interface RoundStep {
  name: string
  gameModes: QuizzMode[]
  skip?: () => boolean
  enter: () => void
  delay: (_settings: GameSettings) => number
}

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private readonly steps: RoundStep[]
  private started = false
  private currentQuestion = 0
  private currentStep = -1
  private playersAnswers: Answer[] = []
  private startTime = 0
  private acceptingAnswers = false
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  private questionsHistory: QuestionResult[] = []
  private autoAdvanceTimer: NodeJS.Timeout | null = null
  // Forfeits ("gages") proposed and voted by the players before the first question
  private phase: "gageProposals" | "gageVote" | "gageResult" | "questions" =
    "questions"
  private gageChoices: GageChoice[] = []
  private gage: string | null = null

  constructor(opts: RoundManagerOptions) {
    this.opts = opts

    const steps: RoundStep[] = [
      {
        name: "reveal",
        gameModes: [QUIZZ_MODES.QUIZ, QUIZZ_MODES.SURVEY],
        enter: () => {
          this.showResults()
        },
        delay: (settings) => settings.autoAdvance.responsesDelay,
      },
      {
        name: "leaderboard",
        gameModes: [QUIZZ_MODES.QUIZ],
        skip: () => this.isLastQuestion() || this.isSameCategoryNext(),
        enter: () => {
          this.showLeaderboard()
        },
        delay: (settings) => settings.autoAdvance.leaderboardDelay,
      },
    ]

    this.steps = steps.filter((step) =>
      step.gameModes.includes(opts.quizz.gameMode),
    )
  }

  isStarted(): boolean {
    return this.started
  }

  private get question(): Question {
    return this.opts.quizz.questions[this.currentQuestion]
  }

  private isAskingQuestion(): boolean {
    return this.currentStep < 0
  }

  private isLastQuestion(): boolean {
    return !this.opts.quizz.questions[this.currentQuestion + 1]
  }

  private isSameCategoryNext(): boolean {
    const category = this.question.category?.trim()
    const next = this.opts.quizz.questions[this.currentQuestion + 1]

    return Boolean(category) && next?.category?.trim() === category
  }

  private isSurvey(): boolean {
    return this.opts.quizz.gameMode === QUIZZ_MODES.SURVEY
  }

  private isGageEnabled(): boolean {
    return !this.isSurvey() && this.opts.quizz.gageVote === true
  }

  private hasProposedGage(playerId: string): boolean {
    return this.gageChoices.some((choice) =>
      choice.authorIds.includes(playerId),
    )
  }

  /** Adds a gage, merging it with an identical one (same text, any case). */
  private addGageChoice(text: string, authorId?: string): void {
    const gage = text.replace(/\s+/gu, " ").trim().slice(0, MAX_GAGE_LENGTH)

    if (!gage) {
      return
    }

    const existing = this.gageChoices.find(
      (choice) => choice.text.toLowerCase() === gage.toLowerCase(),
    )

    if (existing) {
      if (authorId) {
        existing.authorIds.push(authorId)
      }

      return
    }

    this.gageChoices.push({ text: gage, authorIds: authorId ? [authorId] : [] })
  }

  // ── Auto advance ─────────────────────────────────────────────────────────

  clearAutoAdvance(): void {
    if (!this.autoAdvanceTimer) {
      return
    }

    clearInterval(this.autoAdvanceTimer)
    this.autoAdvanceTimer = null
    this.emitAutoAdvance(null)
  }

  private emitAutoAdvance(state: { seconds: number; total: number } | null) {
    this.opts.io
      .to(this.opts.getManagerId())
      .emit(EVENTS.MANAGER.AUTO_ADVANCE, state)
  }

  private scheduleAutoAdvance(delay: number): void {
    this.clearAutoAdvance()

    if (!this.opts.getSettings().autoAdvance.enable) {
      return
    }

    let remaining = delay

    this.emitAutoAdvance({ seconds: remaining, total: delay })

    this.autoAdvanceTimer = setInterval(() => {
      remaining -= 1

      if (remaining > 0) {
        this.emitAutoAdvance({ seconds: remaining, total: delay })

        return
      }

      this.clearAutoAdvance()
      this.advance()
    }, SECOND_MS)
  }

  // ── Flow ─────────────────────────────────────────────────────────────────

  getReconnectInfo(): GameUpdateQuestion | null {
    if (!this.started) {
      return null
    }

    return {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    }
  }

  async start(socket: Socket): Promise<void> {
    if (this.started) {
      return
    }

    if (this.opts.players.count() === 0) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.noPlayersConnected")

      return
    }

    this.started = true

    this.opts.broadcast(STATUS.SHOW_START, {
      time: 3,
      subject: this.opts.quizz.subject,
    })

    await sleep(3)

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.START_COOLDOWN)
    await this.opts.cooldown.start(3)

    if (this.isGageEnabled()) {
      void this.startGageProposals()

      return
    }

    void this.newQuestion()
  }

  advance(): void {
    if (!this.started) {
      return
    }

    this.clearAutoAdvance()

    if (this.phase === "gageResult") {
      this.phase = "questions"
      void this.newQuestion()

      return
    }

    if (this.isAskingQuestion()) {
      this.acceptingAnswers = false
      this.opts.cooldown.abort()

      return
    }

    this.runStep(this.currentStep + 1)
  }

  private runStep(index: number): void {
    const step = this.steps[index]

    if (!step) {
      this.nextQuestion()

      return
    }

    if (step.skip?.()) {
      this.runStep(index + 1)

      return
    }

    this.currentStep = index
    step.enter()
    this.scheduleAutoAdvance(step.delay(this.opts.getSettings()))
  }

  private nextQuestion(): void {
    if (this.isLastQuestion()) {
      this.finish()

      return
    }

    this.currentQuestion += 1
    void this.newQuestion()
  }

  private async newQuestion(): Promise<void> {
    if (!this.started) {
      return
    }

    this.currentStep = -1
    this.phase = "questions"

    this.opts.onNewQuestion()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    })

    this.opts.broadcast(STATUS.SHOW_PREPARED, {
      totalAnswers: this.question.answers.length,
      questionNumber: this.currentQuestion + 1,
      questionType: this.question.type,
    })

    await sleep(2)

    if (!this.started) {
      return
    }

    const imageMedia = (() => {
      if (this.question.media?.type !== MEDIA_TYPES.IMAGE) {
        return undefined
      }

      return this.question.media
    })()

    this.opts.broadcast(STATUS.SHOW_QUESTION, {
      question: this.question.question,
      media: imageMedia,
      cooldown: this.question.cooldown,
    })

    await sleep(this.question.cooldown)

    if (!this.started) {
      return
    }

    this.startTime = Date.now()
    this.acceptingAnswers = true

    this.opts.broadcast(STATUS.SELECT_ANSWER, {
      question: this.question.question,
      answers: this.question.answers,
      media: this.question.media,
      time: this.question.time,
      totalPlayer: this.opts.players.count(),
      questionType: this.question.type,
      options: this.question.options,
      answersOnly: this.opts.getSettings().answersOnly,
    })

    await this.opts.cooldown.start(this.question.time)

    this.acceptingAnswers = false

    if (!this.started) {
      return
    }

    this.runStep(0)
  }

  // ── Gages ────────────────────────────────────────────────────────────────

  private async startGageProposals(): Promise<void> {
    this.phase = "gageProposals"
    this.gageChoices = []
    this.acceptingAnswers = true

    this.opts.broadcast(STATUS.SHOW_GAGE_PROPOSALS, {
      time: GAGE_PROPOSAL_TIME,
      totalPlayer: this.opts.players.count(),
    })

    await this.opts.cooldown.start(GAGE_PROPOSAL_TIME)

    this.acceptingAnswers = false

    if (!this.started) {
      return
    }

    // Too few proposals: the quiz's own gages fill in
    if (this.gageChoices.length < 2) {
      const fallback = (this.opts.quizz.gages ?? []).slice(0, MAX_GAGES)

      fallback.forEach((gage) => {
        this.addGageChoice(gage)
      })
    }

    if (this.gageChoices.length === 0) {
      void this.newQuestion()

      return
    }

    if (this.gageChoices.length === 1) {
      this.showGageResult()

      return
    }

    void this.startGageVote()
  }

  private async startGageVote(): Promise<void> {
    this.phase = "gageVote"
    this.playersAnswers = []
    this.acceptingAnswers = true

    const data = {
      choices: this.gageChoices.map((choice) => choice.text),
      time: GAGE_VOTE_TIME,
      totalPlayer: this.opts.players.count(),
    }

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_GAGE_VOTE, data)

    this.opts.players.getAll().forEach((player) => {
      this.opts.send(player.id, STATUS.SHOW_GAGE_VOTE, {
        ...data,
        ownChoices: this.gageChoices.flatMap((choice, index) =>
          choice.authorIds.includes(player.id) ? [index] : [],
        ),
      })
    })

    await this.opts.cooldown.start(GAGE_VOTE_TIME)

    this.acceptingAnswers = false

    if (!this.started) {
      return
    }

    this.showGageResult()
  }

  /** The most voted gage wins, a tie (or no vote at all) is drawn at random. */
  private showGageResult(): void {
    const choices = this.gageChoices.map((choice) => choice.text)
    const responses = countAnswers(this.playersAnswers)
    const votes = choices.map((_, index) => responses[index] ?? 0)
    const best = Math.max(...votes)
    const tied = votes.flatMap((count, index) =>
      count === best ? [index] : [],
    )
    const winner = tied[Math.floor(Math.random() * tied.length)]

    this.gage = choices[winner]
    this.phase = "gageResult"
    this.playersAnswers = []

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_GAGE_RESULT, {
      choices,
      votes,
      winner,
      tie: tied.length > 1,
    })

    this.opts.players.getAll().forEach((player) => {
      this.opts.send(player.id, STATUS.WAIT, { text: "game:gage.chosen" })
    })

    this.scheduleAutoAdvance(this.opts.getSettings().autoAdvance.responsesDelay)
  }

  /** The validated gage goes to the last of the leaderboard (all of them on a tie). */
  private getFinalGage(): { gage: GameGage; loserIds: string[] } | null {
    const last = this.leaderboard.at(-1)

    if (!this.gage || !last) {
      return null
    }

    const losers = this.leaderboard.filter(
      (player) => player.points === last.points,
    )

    return {
      gage: {
        text: this.gage,
        losers: losers.map((player) => player.username),
      },
      loserIds: losers.map((player) => player.id),
    }
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  private recordHistory(players: Player[], scored: ScoredPlayer[] = []): void {
    this.questionsHistory.push({
      ...this.question,
      solutions: this.isSurvey() ? undefined : this.question.solutions,
      playerAnswers: players.map((player) => {
        const score = scored.find((s) => s.id === player.id)

        return {
          playerName: player.username,
          answerIds:
            this.playersAnswers.find((a) => a.playerId === player.id)
              ?.answerIds ?? null,
          ...(score && {
            correct: score.lastCorrect,
            points: score.lastPoints,
          }),
        }
      }),
    })
  }

  private showResults(): void {
    const currentPlayers = this.opts.players.getAll()
    const answerCounts = countAnswers(this.playersAnswers)

    if (this.isSurvey()) {
      this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
        ...this.question,
        solutions: undefined,
        responses: answerCounts,
      })

      currentPlayers.forEach((player) => {
        this.opts.send(player.id, STATUS.WAIT, {
          text: "game:answerNoted",
        })
      })

      this.recordHistory(currentPlayers)
      this.playersAnswers = []

      return
    }

    const oldLeaderboard = (() => {
      if (this.leaderboard.length === 0) {
        return currentPlayers.map((p) => ({ ...p }))
      }

      return this.leaderboard.map((p) => ({ ...p }))
    })()

    const sortedPlayers = scoreQuestion(
      this.question,
      currentPlayers,
      this.playersAnswers,
    )

    this.opts.players.replace(sortedPlayers)

    sortedPlayers.forEach((player, index) => {
      const aheadPlayer = sortedPlayers[index - 1]

      this.opts.send(player.id, STATUS.SHOW_RESULT, {
        correct: player.lastCorrect,
        message: player.lastCorrect ? "game:correct" : "game:wrong",
        points: player.lastPoints,
        myPoints: player.points,
        rank: index + 1,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
      })
    })

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
      ...this.question,
      responses: answerCounts,
    })

    this.recordHistory(currentPlayers, sortedPlayers)

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard ??= oldLeaderboard
    this.playersAnswers = []
  }

  private showLeaderboard(): void {
    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
    })

    this.tempOldLeaderboard = null
  }

  private finishSurvey(): void {
    const players = this.opts.players.getAll()

    const summary = {
      subject: this.opts.quizz.subject,
      totalPlayers: players.length,
      totalQuestions: this.opts.quizz.questions.length,
    }

    this.opts.send(this.opts.getManagerId(), STATUS.SUMMARY, summary)

    players.forEach((player) => {
      this.opts.send(player.id, STATUS.SUMMARY, summary)
    })
  }

  private finish(): void {
    this.started = false
    this.clearAutoAdvance()

    const finalPlayers = this.isSurvey()
      ? this.opts.players.getAll()
      : this.leaderboard
    const finalGage = this.getFinalGage()

    this.opts.onGameFinished({
      id: `${Date.now()}-${nanoid(8)}`,
      gameMode: this.opts.quizz.gameMode,
      subject: this.opts.quizz.subject,
      date: new Date().toISOString(),
      players: finalPlayers.map((player, index) => ({
        username: player.username,
        points: player.points,
        rank: index + 1,
      })),
      questions: this.questionsHistory,
      ...(finalGage && { gage: finalGage.gage }),
    })

    if (this.isSurvey()) {
      this.finishSurvey()

      return
    }

    const top = this.leaderboard
      .slice(0, 3)
      .map(({ username, points }) => ({ username, points }))

    this.opts.send(this.opts.getManagerId(), STATUS.FINISHED, {
      subject: this.opts.quizz.subject,
      top,
      ...(finalGage && { gage: finalGage.gage }),
    })

    this.leaderboard.forEach((player, index) => {
      this.opts.send(player.id, STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
        rank: index + 1,
        ...(finalGage && {
          gage: finalGage.gage,
          isLoser: finalGage.loserIds.includes(player.id),
        }),
      })
    })
  }

  // ── Player actions ───────────────────────────────────────────────────────

  private normalizeAnswer(answerIds: number[]): number[] | null {
    const { options } = this.question

    if (!isEstimationOptions(options)) {
      return answerIds
    }

    const value = answerIds.at(0)

    if (
      answerIds.length !== 1 ||
      value === undefined ||
      !Number.isFinite(value)
    ) {
      return null
    }

    return [Math.min(options.max, Math.max(options.min, value))]
  }

  private normalizeGageVote(
    playerId: string,
    answerIds: number[],
  ): number[] | null {
    const index = answerIds.at(0)
    const choice = index === undefined ? undefined : this.gageChoices[index]

    if (
      answerIds.length !== 1 ||
      index === undefined ||
      !choice ||
      choice.authorIds.includes(playerId)
    ) {
      return null
    }

    return [index]
  }

  private answerPoints(): number {
    if (isEstimationOptions(this.question.options)) {
      return this.question.maxPoints ?? MAX_POINTS
    }

    if (this.question.time === NO_TIME_LIMIT) {
      return orderToPoint(
        this.playersAnswers.length,
        this.opts.players.count(),
        this.question.maxPoints,
      )
    }

    return timeToPoint(this.startTime, this.question)
  }

  selectAnswer(socket: Socket, answerIds: number[]): void {
    const player = this.opts.players.findById(socket.id)

    if (!player || !this.acceptingAnswers) {
      return
    }

    if (this.playersAnswers.find((a) => a.playerId === socket.id)) {
      return
    }

    if (this.phase === "gageProposals") {
      return
    }

    const isGageVote = this.phase === "gageVote"
    const submitted = isGageVote
      ? this.normalizeGageVote(player.id, answerIds)
      : this.normalizeAnswer(answerIds)

    if (!submitted) {
      return
    }

    const points = isGageVote ? 0 : this.answerPoints()

    this.playersAnswers.push({
      playerId: player.id,
      answerIds: submitted,
      points,
    })

    this.opts.send(socket.id, STATUS.WAIT, {
      text: "game:waitingForAnswers",
    })

    socket
      .to(this.opts.gameId)
      .emit(EVENTS.GAME.PLAYER_ANSWER, this.playersAnswers.length)
    this.opts.players.broadcastCount()
    this.endIfEveryoneAnswered()
  }

  proposeGage(socket: Socket, text: string): void {
    const player = this.opts.players.findById(socket.id)

    if (
      !player ||
      !this.acceptingAnswers ||
      this.phase !== "gageProposals" ||
      this.hasProposedGage(player.id)
    ) {
      return
    }

    this.addGageChoice(text, player.id)

    if (!this.hasProposedGage(player.id)) {
      return
    }

    this.opts.send(socket.id, STATUS.WAIT, { text: "game:gage.proposalSent" })

    const proposers = this.opts.players
      .getAll()
      .filter((p) => this.hasProposedGage(p.id)).length

    socket.to(this.opts.gameId).emit(EVENTS.GAME.PLAYER_ANSWER, proposers)
    this.endIfEveryoneAnswered()
  }

  updatePlayerId(oldId: string, newId: string): void {
    this.playersAnswers = this.playersAnswers.map((answer) =>
      answer.playerId === oldId ? { ...answer, playerId: newId } : answer,
    )
    this.gageChoices.forEach((choice) => {
      choice.authorIds = choice.authorIds.map((id) =>
        id === oldId ? newId : id,
      )
    })
  }

  endIfEveryoneAnswered(): void {
    if (!this.acceptingAnswers) {
      return
    }

    const connected = this.opts.players.getAll().filter((p) => p.connected)
    const everyoneAnswered = connected.every((player) =>
      this.phase === "gageProposals"
        ? this.hasProposedGage(player.id)
        : this.playersAnswers.some((a) => a.playerId === player.id),
    )

    if (connected.length > 0 && everyoneAnswered) {
      this.opts.cooldown.abort()
    }
  }
}
