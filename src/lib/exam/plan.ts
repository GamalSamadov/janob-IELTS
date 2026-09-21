import { CUE_CARDS, PART1_TOPICS, WORK_OR_STUDY, type CueCardTopic, type Part1Topic } from "./topics";
import type { ExamMode, ExamPlan, PlanSummary } from "./types";

export interface ModeRules {
  /** Extra Part 1 topics after work/studies. */
  part1Topics: number;
  /** Questions to ask per Part 1 topic. */
  part1QuestionsPerTopic: number;
  prepSeconds: number;
  talkSeconds: number;
  roundingOff: number;
  part3Questions: number;
  /** Hard stop for the whole session, in minutes. */
  maxMinutes: number;
}

export const MODE_RULES: Record<ExamMode, ModeRules> = {
  full: {
    part1Topics: 2,
    part1QuestionsPerTopic: 4,
    prepSeconds: 60,
    talkSeconds: 120,
    roundingOff: 1,
    part3Questions: 5,
    maxMinutes: 22,
  },
  quick: {
    part1Topics: 1,
    part1QuestionsPerTopic: 2,
    prepSeconds: 60,
    talkSeconds: 120,
    roundingOff: 0,
    part3Questions: 2,
    maxMinutes: 12,
  },
};

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function createPlan(mode: ExamMode): ExamPlan {
  return {
    part1TopicIds: pickRandom(PART1_TOPICS, MODE_RULES[mode].part1Topics).map((t) => t.id),
    cueCardId: pickRandom(CUE_CARDS, 1)[0].id,
  };
}

export interface ResolvedPlan {
  part1: Part1Topic[];
  card: CueCardTopic;
}

/** Validates ids coming from the client and resolves them to full topics. */
export function resolvePlan(plan: unknown, mode: ExamMode): ResolvedPlan | null {
  if (!plan || typeof plan !== "object") return null;
  const { part1TopicIds, cueCardId } = plan as Partial<ExamPlan>;
  if (!Array.isArray(part1TopicIds) || typeof cueCardId !== "string") return null;
  if (part1TopicIds.length !== MODE_RULES[mode].part1Topics) return null;
  const part1 = part1TopicIds.map((id) => PART1_TOPICS.find((t) => t.id === id));
  const card = CUE_CARDS.find((c) => c.id === cueCardId);
  if (!card || part1.some((t) => !t)) return null;
  return { part1: [WORK_OR_STUDY, ...(part1 as Part1Topic[])], card };
}

export function summarizePlan(resolved: ResolvedPlan): PlanSummary {
  const { card } = resolved;
  return {
    part1Topics: resolved.part1.map((t) => t.title),
    cueCard: { id: card.id, title: card.title, prompts: card.prompts, explain: card.explain },
    part3Theme: card.part3Theme,
  };
}
