"use client";

import { GoogleLogo } from "@phosphor-icons/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { safeAuthDestination } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

const authErrors: Record<string, string> = {
  missing_code: "Google did not return a sign-in code. Please try again.",
  callback_failed: "We could not finish signing you in. Please try again.",
};
const noop = () => () => {};
function useSearchParam(name: string) {
  return useSyncExternalStore(noop, () => new URLSearchParams(window.location.search).get(name), () => null);
}

export function SignInError() {
  const message = authErrors[useSearchParam("error") ?? ""];
  return message ? <p className="auth-page-error" role="alert">{message}</p> : null;
}

export function OAuthButton() {
  const next = safeAuthDestination(useSearchParam("next"));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let stopped = false;
    void createClient().auth.getSession().then(({ data }) => {
      if (!stopped && data.session) window.location.replace(next);
    });
    return () => { stopped = true; };
  }, [next]);

  // Back/forward cache restores the page with its old "pending" state.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setPending(false); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function signIn() {
    setError("");
    setPending(true);

    const destination = safeAuthDestination(next);
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", destination);

    const supabase = createClient();
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (authError) throw authError;
    } catch {
      setError("Sign in could not start. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="auth-provider-wrap">
      <button
        className="auth-provider auth-provider-google"
        type="button"
        onClick={signIn}
        disabled={pending}
        aria-describedby={error ? "google-auth-error" : undefined}
      >
        <GoogleLogo size={22} weight="bold" aria-hidden="true" />
        <span>{pending ? "Opening sign in..." : "Continue with Google"}</span>
      </button>
      {error && (
        <p
          className="auth-inline-error"
          id="google-auth-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
