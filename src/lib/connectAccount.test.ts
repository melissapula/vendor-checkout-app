import { NEW_CONNECTED_ACCOUNT_PARAMS } from '../../supabase/functions/_shared/connectAccount';

// Who pays Stripe's fees can only be chosen when an account is created, so a
// regression here can't be fixed later on the accounts it created.
describe('NEW_CONNECTED_ACCOUNT_PARAMS', () => {
  it('has the vendor pay Stripe fees, so the platform pays no Connect fees', () => {
    expect(NEW_CONNECTED_ACCOUNT_PARAMS.controller.fees.payer).toBe('account');
  });

  it('leaves negative-balance losses with Stripe, not the platform', () => {
    expect(NEW_CONNECTED_ACCOUNT_PARAMS.controller.losses.payments).toBe('stripe');
  });

  // Stripe rejects the Express dashboard unless the platform pays fees and
  // covers losses, so Stripe-owned pricing comes with the full dashboard.
  it('has Stripe collect requirements and gives the vendor the full Stripe dashboard', () => {
    expect(NEW_CONNECTED_ACCOUNT_PARAMS.controller.requirement_collection).toBe('stripe');
    expect(NEW_CONNECTED_ACCOUNT_PARAMS.controller.stripe_dashboard.type).toBe('full');
  });

  it('does not use the legacy account type, which overrides the controller settings', () => {
    expect(NEW_CONNECTED_ACCOUNT_PARAMS).not.toHaveProperty('type');
  });

  it('requests card payments and transfers', () => {
    expect(NEW_CONNECTED_ACCOUNT_PARAMS.capabilities).toEqual({
      card_payments: { requested: true },
      transfers: { requested: true },
    });
  });
});
