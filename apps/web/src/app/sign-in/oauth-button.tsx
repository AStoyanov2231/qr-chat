"use client";

import { GoogleLogo } from "@phosphor-icons/react";
import { useState } from "react";
import { safeAuthDestination } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

export function OAuthButton({
  next,
}: {
  next: string;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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
