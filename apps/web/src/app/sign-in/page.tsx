import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { safeAuthDestination } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { OAuthButton } from "./oauth-button";

const authErrors: Record<string, string> = {
  missing_code: "Google did not return a sign-in code. Please try again.",
  callback_failed: "We could not finish signing you in. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeAuthDestination(
    typeof params.next === "string" ? params.next : undefined,
  );
  const errorCode = typeof params.error === "string" ? params.error : "";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims.sub) {
    redirect(next);
  }

  const appleEnabled = process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true";

  return (
    <main className="auth-page">
      <header className="auth-header">
        <span className="app-brand" aria-label="QR Chat">
          <span><Icon name="qr" size={19} /></span>
          QR Chat
        </span>
      </header>

      <section className="auth-shell">
        <div className="auth-copy">
          <h1>Find your people.</h1>
          <p>Sign in, scan the code, join the room.</p>

          <div className="auth-actions">
            <OAuthButton provider="google" next={next} />
            {appleEnabled && <OAuthButton provider="apple" next={next} />}
          </div>

          {authErrors[errorCode] && (
            <p className="auth-page-error" role="alert">
              {authErrors[errorCode]}
            </p>
          )}

          <p className="auth-terms">
            By continuing, you agree to use QR Chat respectfully.
          </p>
        </div>
      </section>
    </main>
  );
}
