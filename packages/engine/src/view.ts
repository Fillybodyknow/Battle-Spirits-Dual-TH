import type { CardInstance, GameState, PlayerId } from './types';

export type CardView = Omit<CardInstance, 'cardNo'> & { cardNo: string | null };

export type PlayerView = Omit<GameState, 'rng' | 'cards'> & {
  viewer: PlayerId;
  cards: Record<string, CardView>;
};

/**
 * มุมมองของผู้เล่นหนึ่งฝ่าย: ซ่อน cardNo ของการ์ดในเด็ค (ทั้งสองฝ่าย),
 * มือและ Burst ของคู่ต่อสู้ และตัด rng ออกเพื่อไม่ให้ทำนายการสับได้
 */
export function getPlayerView(state: GameState, viewer: PlayerId): PlayerView {
  const hidden = new Set<string>();
  for (const [player, p] of Object.entries(state.players) as [PlayerId, GameState['players'][PlayerId]][]) {
    p.deck.forEach((id) => hidden.add(id));
    if (player !== viewer) {
      p.hand.forEach((id) => hidden.add(id));
      if (p.burst) hidden.add(p.burst);
    }
  }

  // การ์ดที่เอฟเฟกต์แสดงจากเด็ค ทั้งสองฝ่ายเห็น
  if (state.choice?.kind === 'card') state.choice.revealed?.forEach((id) => hidden.delete(id));

  const cards: Record<string, CardView> = {};
  for (const [id, card] of Object.entries(state.cards)) {
    cards[id] = { ...card, cores: [...card.cores], cardNo: hidden.has(id) ? null : card.cardNo };
  }

  const { rng: _rng, cards: _cards, ...rest } = structuredClone(state);
  return { ...rest, viewer, cards };
}
