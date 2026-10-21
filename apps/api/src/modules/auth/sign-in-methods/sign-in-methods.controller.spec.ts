import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ReauthGuard } from "../reauth/reauth.guard";
import { SignInMethodsController } from "./sign-in-methods.controller";

/**
 * Every write on a sign-in method needs a fresh step-up (`@RequireReauth`);
 * the read and the step-up itself need only the session.
 */
describe("SignInMethodsController step-up", () => {
  const guardsOf = (method: keyof SignInMethodsController) =>
    (Reflect.getMetadata(
      GUARDS_METADATA,
      SignInMethodsController.prototype[method],
    ) ?? []) as unknown[];

  it.each<keyof SignInMethodsController>([
    "setPassword",
    "linkGoogle",
    "linkApple",
    "unlinkProvider",
  ])("%s requires a reauthToken", (method) => {
    expect(guardsOf(method)).toContain(ReauthGuard);
  });

  it.each<keyof SignInMethodsController>([
    "getSignInMethods",
    "reauthenticate",
  ])("%s needs no step-up", (method) => {
    expect(guardsOf(method)).not.toContain(ReauthGuard);
  });
});
