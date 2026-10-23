// What the customer wants the reel to do, picked on the home screen (新商品を知らせる, 来店・予約を増やす…).
// The id rides along with the job's input; each copy prompt gets one extra line so the words serve that goal.

export const GOALS = {
  launch:
    'Goal of this reel: announce a NEW product. Make it feel new and worth trying now; the hook says it is new. Never invent a release date, price or offer that is not in the facts.',
  visit:
    'Goal of this reel: bring more people to visit or book. Make the place feel welcoming and easy to come to, and end on a clear invitation to book or drop by (only booking details from the facts).',
  sale:
    'Goal of this reel: promote a sale or campaign. Lead with the offer exactly as written in the facts and make it feel timely; never invent a discount, deadline or price.',
  experience:
    'Goal of this reel: make viewers want to book this experience. Let them feel they are already there, then make booking feel like the obvious next step.',
  talk:
    'Goal of this reel: the speaker explains something in their own words. Keep their message clear; on-screen words highlight their key points.',
  service:
    'Goal of this reel: introduce the service clearly: what it is, who it is for and why choose it, in that order.',
} as const;

export type Goal = keyof typeof GOALS;

export const isGoal = (g: unknown): g is Goal => typeof g === 'string' && Object.prototype.hasOwnProperty.call(GOALS, g);

/** The prompt line for a goal, or '' when none was picked. */
export const goalLine = (g: unknown) => (isGoal(g) ? GOALS[g] : '');
