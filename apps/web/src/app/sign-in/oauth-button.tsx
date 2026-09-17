"use client";

import { AppleLogo, GoogleLogo } from "@phosphor-icons/react";
import { useState } from "react";
import { safeAuthDestination } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "apple";

export function OAuthButton({
  provider,
  next,
}: {
  provider: Provider;
  next: string;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const label =
    provider === "google" ? "Continue with Google" : "Continue with Apple";
  const ProviderIcon = provider === "google" ? GoogleLogo : AppleLogo;

  async function signIn() {
    setError("");
    setPending(true);

    const destination = safeAuthDestination(next);
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", destination);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (authError) {
      setError("Sign in could not start. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="auth-provider-wrap">
      <button
        className={`auth-provider auth-provider-${provider}`}
        type="button"
        onClick={signIn}
        disabled={pending}
        aria-describedby={error ? `${provider}-auth-error` : undefined}
      >
        <ProviderIcon size={22} weight="bold" aria-hidden="true" />
        <span>{pending ? "Opening sign in..." : label}</span>
      </button>
      {error && (
        <p
          className="auth-inline-error"
          id={`${provider}-auth-error`}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
