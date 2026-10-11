"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChatCircle, DeviceMobile, Globe, QrCode, Users } from "@phosphor-icons/react";

export function LandingPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (canvas.current) {
      void QRCode.toCanvas(canvas.current, new URL("/sign-in", window.location.origin).href, {
        width: 180, margin: 4, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" },
      }).then(() => { if (active) setQrReady(true); }, () => { if (active) setQrReady(false); });
    }
    return () => { active = false; };
  }, []);

  return <main className="landing-page">
    <header className="landing-header">
      <Link href="/welcome" className="app-brand" aria-label="QR Chat home"><QrCode size={28} weight="bold" aria-hidden="true" />QR Chat</Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#get-started" className="landing-nav-cta">Get started <ArrowRight size={16} aria-hidden="true" /></a></nav>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <p className="landing-eyebrow"><span />Made for the moment</p>
        <h1 id="landing-title">A little<br /><span>closer.</span></h1>
        <p className="landing-intro">Scan a QR code. Join the conversation around you.</p>
        <p className="landing-description">A shared table, a familiar café, a new face. QR Chat gives people in the same place a way to say hello.</p>
        <a className="landing-primary" href="#get-started">Find your people <ArrowRight size={20} aria-hidden="true" /></a>
        <p className="landing-caption">Made for your phone. Available in your browser.</p>
      </div>
      <div className="landing-preview" aria-label="Illustration of a group conversation">
        <div className="landing-preview-note"><QrCode size={20} aria-hidden="true" /> One scan. A shared conversation.</div>
        <div className="landing-phone">
          <div className="landing-phone-top"><span className="landing-phone-dot" /><span>QR Chat</span><ChatCircle size={20} aria-hidden="true" /></div>
          <div className="landing-room"><span className="landing-room-avatar">CC</span><strong>Corner Café</strong><span>A conversation for this QR code</span></div>
          <div className="landing-messages"><span className="landing-example-label">Example conversation</span><div className="landing-example-message"><span className="landing-example-avatar">M</span><p>Anyone else here for the first time?</p></div><div className="landing-example-message own"><p>Me! Mind if I join you?</p></div><div className="landing-example-message"><span className="landing-example-avatar">M</span><p>There’s a seat right here 👋</p></div></div>
          <div className="landing-example-composer" aria-hidden="true"><span>Say hello…</span><ArrowRight size={20} /></div>
        </div>
        <div className="landing-preview-footer"><Users size={20} aria-hidden="true" /><span>Meet here.<br /><strong>Stay in touch.</strong></span></div>
      </div>
    </section>

    <section id="how-it-works" className="landing-how" aria-labelledby="landing-how-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">From nearby to connected</p><h2 id="landing-how-title">Start with a hello.</h2></div>
      <div className="landing-steps">
        <article><span className="landing-step-icon"><QrCode size={28} aria-hidden="true" /></span><span className="landing-step-number">01</span><h3>Scan the same code</h3><p>Sign in with Google, then use your phone’s camera to scan a venue’s QR code.</p></article>
        <article><span className="landing-step-icon"><ChatCircle size={28} aria-hidden="true" /></span><span className="landing-step-number">02</span><h3>Join the conversation</h3><p>Chat with the group for up to 24 hours. You have one active group at a time.</p></article>
        <article><span className="landing-step-icon"><Users size={28} aria-hidden="true" /></span><span className="landing-step-number">03</span><h3>Keep the connection</h3><p>Send a friend request. Once accepted, you can message each other after group access ends.</p></article>
      </div>
    </section>

    <section id="get-started" className="landing-platforms" aria-labelledby="landing-platforms-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Take the conversation with you</p><h2 id="landing-platforms-title">Your phone. Your way in.</h2><p>Start in your mobile browser today. Native downloads are not available yet.</p></div>
      <div className="landing-platform-grid">
        <article className="landing-platform available"><div className="landing-platform-title"><Globe size={25} aria-hidden="true" /><h3>Web browser</h3><span>Available now</span></div><p>No download needed. Open QR Chat on your phone.</p><div className="landing-qr"><canvas ref={canvas} role="img" aria-label="Scan to open QR Chat in your phone’s browser" hidden={!qrReady} />{!qrReady && <span>Use the link below to open QR Chat.</span>}</div><Link href="/sign-in" className="landing-primary">Open web app <ArrowRight size={19} aria-hidden="true" /></Link><small>On desktop? Scan this QR with your phone’s camera.</small></article>
        {["iOS", "Android"].map((platform) => <article key={platform} className="landing-platform"><div className="landing-platform-title"><DeviceMobile size={25} aria-hidden="true" /><h3>{platform}</h3></div><p>A native QR Chat app for your phone.</p><div className="landing-native-slot" aria-label={`${platform} download QR code unavailable`} /><strong className="landing-unavailable">Not available yet</strong><small>Download link and QR code will appear here when available.</small></article>)}
      </div>
    </section>

    <section id="privacy" className="landing-privacy"><span className="landing-privacy-icon"><ChatCircle size={26} aria-hidden="true" /></span><div><h2>A shared space, with clear boundaries.</h2><p>Group messages are available to members with active access. Direct messages are for accepted friends. Your name and profile photo help people recognize you.</p></div></section>
    <footer className="landing-footer"><span className="app-brand"><QrCode size={22} aria-hidden="true" />QR Chat</span><span>A little closer.</span><a href="#privacy">Privacy</a></footer>
  </main>;
}
