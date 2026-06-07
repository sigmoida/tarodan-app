import { TradeStatus } from '@prisma/client';
import { TRADE_VALID_TRANSITIONS } from './trade.service';

describe('TRADE_VALID_TRANSITIONS', () => {
  it('locks every TradeStatus into the transition map (no missing key)', () => {
    for (const status of Object.values(TradeStatus)) {
      expect(TRADE_VALID_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(TRADE_VALID_TRANSITIONS[status])).toBe(true);
    }
  });

  it('does NOT allow at_warehouse → cancelled (admin must reject or approve)', () => {
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.at_warehouse]).not.toContain(
      TradeStatus.cancelled,
    );
  });

  it('does NOT allow admin_reviewing → cancelled', () => {
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.admin_reviewing]).not.toContain(
      TradeStatus.cancelled,
    );
  });

  it('does NOT allow shipping_to_recipients → cancelled (dispute path only)', () => {
    expect(
      TRADE_VALID_TRANSITIONS[TradeStatus.shipping_to_recipients],
    ).not.toContain(TradeStatus.cancelled);
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.shipping_to_recipients]).toEqual(
      expect.arrayContaining([TradeStatus.completed, TradeStatus.disputed]),
    );
  });

  it('shipping_to_warehouse can still cancel (cancel guard handles warehouse arrival separately)', () => {
    expect(
      TRADE_VALID_TRANSITIONS[TradeStatus.shipping_to_warehouse],
    ).toContain(TradeStatus.cancelled);
  });

  it('terminal states have no outgoing transitions', () => {
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.completed]).toEqual([]);
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.cancelled]).toEqual([]);
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.rejected]).toEqual([]);
  });

  it('returning collapses only to cancelled (via markReturnDelivered)', () => {
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.returning]).toEqual([
      TradeStatus.cancelled,
    ]);
  });

  it('disputed can resolve to either completed or cancelled', () => {
    expect(TRADE_VALID_TRANSITIONS[TradeStatus.disputed]).toEqual(
      expect.arrayContaining([TradeStatus.completed, TradeStatus.cancelled]),
    );
  });
});
