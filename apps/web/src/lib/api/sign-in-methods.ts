import type {
  AppleLinkRequest,
  GoogleLinkRequest,
  ReauthRequest,
  ReauthResponse,
  SetPasswordRequest,
  SignInMethods,
  SignInProvider,
  UnlinkProviderRequest,
} from "@tarodan/types";
import { api } from "./client";

/**
 * Sign-in methods and step-up (contract: `@tarodan/types` sign-in-methods).
 * Every write answers the fresh `SignInMethods`. The step-up token
 * (`reauthToken`) is passed in by the caller and never stored here.
 */
export const signInMethodsApi = {
  get: () => api.get<SignInMethods>("/auth/sign-in-methods"),
  reauth: (body: ReauthRequest) =>
    api.post<ReauthResponse>("/auth/reauth", body),
  setPassword: (body: SetPasswordRequest) =>
    api.post<SignInMethods>("/auth/password/set", body),
  linkGoogle: (body: GoogleLinkRequest) =>
    api.post<SignInMethods>("/auth/social/google/link", body),
  linkApple: (body: AppleLinkRequest) =>
    api.post<SignInMethods>("/auth/social/apple/link", body),
  unlink: (provider: SignInProvider, body: UnlinkProviderRequest) =>
    api.post<SignInMethods>(`/auth/social/${provider}/unlink`, body),
};
