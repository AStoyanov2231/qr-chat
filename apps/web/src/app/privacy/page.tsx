import Link from "next/link";
import { Icon } from "@/components/icon";

export const metadata = { title: "Privacy Policy – QR Chat" };
const contact = process.env.NEXT_PUBLIC_PRIVACY_EMAIL;

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link href="/welcome" className="app-brand" aria-label="About QR Chat"><span><Icon name="qr" size={19} /></span>QR Chat</Link>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated 15 October 2026</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> the email address, name and photo your Google account shares when you sign in. You can change your display name and photo in Edit Profile.</li>
        <li><strong>What you add:</strong> messages, friend requests and blocks.</li>
        <li><strong>What you scan:</strong> the text of a QR code or the number of a product barcode, so we can put you in its group, plus when you joined.</li>
        <li><strong>Camera:</strong> the camera is used on your device to read codes. Video and photos are never recorded or uploaded.</li>
        <li><strong>Technical data:</strong> our hosts (Vercel, Supabase) keep standard server logs, such as IP address and request time, for security and operation. The public welcome page uses Vercel Web Analytics, which counts visits without cookies.</li>
      </ul>

      <h2>QR codes</h2>
      <p>For a website address we keep only the site and page path. Anything after “?” or “#”, and any login details in the address, are removed before saving. Our server opens the scanned page once, without sending anything about you, and saves only its title and preview image (the page’s “og:image”) as the group name and photo. If the page cannot be read, the group is named from the address text, for example “happy” from happy.com. Codes that carry Wi-Fi passwords, contact cards, payment or one-time-password data are refused. Please do not scan codes that contain private links.</p>

      <h2>Product barcodes</h2>
      <p>Our server looks up the barcode number on <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>. Nothing about you is sent, only the number. We save the product name and photo so the lookup happens once per product. Product data and photos come from Open Food Facts contributors under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a> and <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA</a> licenses. When a product is unknown, a group member may type a name for it; everyone who scans that product sees it.</p>

      <h2>Who can see what</h2>
      <p>Group members see your name, photo and group messages while they have access. Friends see your direct messages. We do not sell your data or use it for advertising.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Group access ends 24 hours after you join; scanning again renews it.</li>
        <li>Group messages are deleted after 30 days.</li>
        <li>Account data is kept until you delete your account.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>In Profile → Settings → Delete account you can erase your profile, photo, friendships, blocks and sent messages, and remove your sign-in. You may also ask to access, correct or export your data{contact ? <> at <a href={`mailto:${contact}`}>{contact}</a></> : ""}, object to processing, or complain to your data protection authority.</p>

      <h2>Who processes data for us</h2>
      <p>Google (sign-in), Supabase (database, authentication and file storage), Vercel (hosting and visit counts) and Open Food Facts (product lookups by barcode number).</p>

      <h2>Children</h2>
      <p>QR Chat is not for people under 16.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we update the date above.</p>
    </main>
  );
}
