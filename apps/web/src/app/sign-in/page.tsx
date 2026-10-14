import Link from "next/link";
import { Icon } from "@/components/icon";
import { OAuthButton, SignInError } from "./oauth-button";

// Static: query parameters and the signed-in redirect are handled in the browser.
export default function SignInPage() {
  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link href="/welcome" className="app-brand" aria-label="About QR Chat">
          <span><Icon name="qr" size={19} /></span>
          QR Chat
        </Link>
      </header>

      <section className="auth-shell">
        <div className="auth-copy">
          <h1>Find your people.</h1>
          <p>Sign in, scan the code, join the room.</p>

          <div className="auth-actions">
            <OAuthButton />
          </div>

          <SignInError />

          <p className="auth-terms">
            By continuing, you agree to use QR Chat respectfully. See our <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
