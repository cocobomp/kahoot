import type {
  GameGage,
  Player,
  QuestionMedia,
  QuestionOptions,
  QuestionType,
} from "@razzia/common/types/game"

export const STATUS = {
  SHOW_ROOM: "SHOW_ROOM",
  SHOW_START: "SHOW_START",
  SHOW_PREPARED: "SHOW_PREPARED",
  SHOW_QUESTION: "SHOW_QUESTION",
  SELECT_ANSWER: "SELECT_ANSWER",
  SHOW_RESULT: "SHOW_RESULT",
  SHOW_RESPONSES: "SHOW_RESPONSES",
  SHOW_LEADERBOARD: "SHOW_LEADERBOARD",
  FINISHED: "FINISHED",
  SUMMARY: "SUMMARY",
  WAIT: "WAIT",
  SHOW_GAGE_PROPOSALS: "SHOW_GAGE_PROPOSALS",
  SHOW_GAGE_VOTE: "SHOW_GAGE_VOTE",
  SHOW_GAGE_RESULT: "SHOW_GAGE_RESULT",
} as const

export type Status = (typeof STATUS)[keyof typeof STATUS]

export interface CommonStatusDataMap {
  SHOW_START: { time: number; subject: string }
  SHOW_PREPARED: {
    totalAnswers: number
    questionNumber: number
    questionType: QuestionType
  }
  SHOW_QUESTION: {
    question: string
    media?: QuestionMedia
    cooldown: number
  }
  SELECT_ANSWER: {
    question: string
    answers: string[]
    media?: QuestionMedia
    time: number
    totalPlayer: number
    questionType: QuestionType
    options?: QuestionOptions
    answersOnly: boolean
  }
  SHOW_RESULT: {
    correct: boolean
    message: string
    points: number
    myPoints: number
    rank: number
    aheadOfMe: string | null
  }
  WAIT: { text: string }
  FINISHED: {
    subject: string
    top: Array<Pick<Player, "username" | "points">>
    rank?: number
    gage?: GameGage
    isLoser?: boolean
  }
  SUMMARY: { subject: string; totalPlayers: number; totalQuestions: number }
  SHOW_GAGE_PROPOSALS: { time: number; totalPlayer: number }
  SHOW_GAGE_VOTE: {
    choices: string[]
    time: number
    totalPlayer: number
    /** Indexes of the player's own proposals, which they cannot vote for */
    ownChoices?: number[]
  }
}

interface ManagerExtraStatus {
  SHOW_ROOM: { text: string; inviteCode?: string }
  SHOW_RESPONSES: {
    question: string
    responses: Record<number, number>
    solutions?: number[]
    answers: string[]
    media?: QuestionMedia
    type: QuestionType
    options?: QuestionOptions
    note?: string
  }
  SHOW_LEADERBOARD: { oldLeaderboard: Player[]; leaderboard: Player[] }
  SHOW_GAGE_RESULT: {
    choices: string[]
    votes: number[]
    winner: number
    tie: boolean
  }
}

export type PlayerStatusDataMap = CommonStatusDataMap

export type ManagerStatusDataMap = CommonStatusDataMap & ManagerExtraStatus

export type StatusDataMap = PlayerStatusDataMap & ManagerStatusDataMap
