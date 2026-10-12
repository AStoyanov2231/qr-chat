import { Analytics } from "@vercel/analytics/next";
import { LandingPage } from "@/components/landing-page";

// Analytics stays on the public landing so app traffic does not spend the event quota.
export default function WelcomePage() {
  return <><LandingPage /><Analytics /></>;
}
