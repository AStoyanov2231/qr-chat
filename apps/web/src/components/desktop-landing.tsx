"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useMemo, useRef, useState, useEffect } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Icon } from "@/components/icon";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const moments = [
  { quote: "Anyone here for the live music later?", name: "Maya" },
  { quote: "There’s room at our table.", name: "Daniel" },
  { quote: "Great coffee today.", name: "Alex" },
];

function PhoneQR({ value }: { value: string }) {
  const qr = useMemo(
    () => QRCode.create(value, { errorCorrectionLevel: "M" }),
    [value],
  );
  const size = qr.modules.size;
  const cells: string[] = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) {
        cells.push(`M${col + 4},${row + 4}h1v1h-1z`);
      }
    }
  }

  return (
    <svg
      className="phone-qr"
      role="img"
      aria-label="Scan to open QR Chat on your phone"
      viewBox={`0 0 ${size + 8} ${size + 8}`}
      shapeRendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path d={cells.join("")} fill="#111214" />
    </svg>
  );
}

export function DesktopLanding() {
  const root = useRef<HTMLDivElement>(null);
  const [phoneUrl, setPhoneUrl] = useState("");
  const [moment, setMoment] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const url = new URL(
        process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
      );
      const code = new URLSearchParams(window.location.search).get("code");
      if (code !== null) {
        url.searchParams.set("code", code.length <= 64 ? code : "INVALID");
      }
      setPhoneUrl(url.toString());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduceMotion) return;

      gsap.from(".dl-hero-word", {
        yPercent: 115,
        stagger: 0.08,
        duration: 1.05,
        ease: "power4.out",
      });
      gsap.from(".dl-hero-device", {
        y: 70,
        rotate: 5,
        opacity: 0,
        duration: 1.25,
        ease: "power3.out",
      });

      const desktop = gsap.matchMedia();
      desktop.add("(min-width: 980px)", () => {
        ScrollTrigger.create({
          trigger: ".dl-story",
          start: "top top+=110",
          end: "bottom bottom-=100",
          pin: ".dl-story-copy",
          pinSpacing: false,
        });
      });

      gsap.utils.toArray<HTMLElement>(".dl-story-frame").forEach((frame) => {
        gsap.fromTo(
          frame,
          { scale: 0.82, opacity: 0.25 },
          {
            scale: 1,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: frame,
              start: "top 92%",
              end: "center 55%",
              scrub: true,
            },
          },
        );
        gsap.to(frame, {
          opacity: 0.22,
          filter: "brightness(0.42)",
          ease: "none",
          scrollTrigger: {
            trigger: frame,
            start: "center 35%",
            end: "bottom 5%",
            scrub: true,
          },
        });
      });

      return () => desktop.revert();
    },
    { scope: root },
  );

  function changeMoment(direction: number) {
    setMoment(
      (current) => (current + direction + moments.length) % moments.length,
    );
  }

  return (
    <div className="dl-page" ref={root}>
      <header className="dl-nav">
        <Link href="/" className="dl-brand" aria-label="QR Chat home">
          <span className="dl-brand-mark">
            <Icon name="qr" size={20} />
          </span>
          qr chat
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a className="dl-nav-cta" href="#get-started">
            Open on phone <Icon name="arrow" size={16} />
          </a>
        </nav>
      </header>

      <main className="dl-main">
        <section className="dl-hero">
          <div className="dl-hero-copy">
            <h1 aria-label="Real conversations start here">
              <span className="dl-line">
                <span className="dl-hero-word">Real conversations</span>
              </span>
              <span className="dl-line">
                <span className="dl-hero-word">start here.</span>
              </span>
            </h1>
            <p>Scan the code. Meet the room.</p>
            <div className="dl-hero-actions">
              <a className="dl-button dl-button-light" href="#get-started">
                Try QR Chat <Icon name="arrow" size={18} />
              </a>
              <a className="dl-text-link" href="#how-it-works">
                See how it works
              </a>
            </div>
          </div>

          <div className="dl-hero-visual" aria-label="QR Chat mobile preview">
            <div className="dl-glow" />
            <div className="dl-hero-device">
              <Image
                src="/product/onboarding.png"
                alt="QR Chat welcome screen inside a café"
                width={220}
                height={420}
                priority
              />
            </div>
            <div className="dl-orbit-copy">Here, together.</div>
          </div>
        </section>

        <div className="dl-marquee" aria-hidden="true">
          <div>
            <span>CAFÉS</span><i />
            <span>EVENTS</span><i />
            <span>POP-UPS</span><i />
            <span>COMMUNITIES</span><i />
            <span>CAFÉS</span><i />
            <span>EVENTS</span><i />
            <span>POP-UPS</span><i />
            <span>COMMUNITIES</span><i />
          </div>
        </div>

        <section className="dl-bento" id="how-it-works">
          <article className="dl-bento-scan dl-card">
            <div className="dl-card-copy">
              <h2>Point. Scan. Join.</h2>
            </div>
            <Image
              src="/product/scanner.png"
              alt="Camera scanning a QR code at a café"
              width={220}
              height={420}
            />
          </article>
          <article className="dl-bento-name dl-card">
            <h2>Choose a name.</h2>
            <div className="dl-name-field">
              <span className="dl-mini-avatar">C</span>
              Capybara
            </div>
          </article>
          <article className="dl-bento-chat dl-card">
            <div>
              <h2>Say hello.</h2>
            </div>
            <div className="dl-mini-message">There’s room at our table.</div>
          </article>
        </section>

        <section className="dl-story">
          <div className="dl-story-copy">
            <h2>The room becomes the conversation.</h2>
            <p>No feed. No followers. Just who is here.</p>
          </div>
          <div className="dl-story-gallery">
            <figure className="dl-story-frame">
              <Image
                src="/product/scanner.png"
                alt="Scan a QR code"
                width={220}
                height={420}
              />
              <figcaption>Scan</figcaption>
            </figure>
            <figure className="dl-story-frame">
              <Image
                src="/product/chat.png"
                alt="Join the local group chat"
                width={220}
                height={420}
              />
              <figcaption>Chat</figcaption>
            </figure>
            <div className="dl-moment dl-story-frame">
              <blockquote>“{moments[moment].quote}”</blockquote>
              <span>{moments[moment].name}, Brew &amp; Co.</span>
              <div className="dl-moment-controls">
                <button
                  onClick={() => changeMoment(-1)}
                  aria-label="Previous message"
                >
                  <span>←</span>
                </button>
                <span>
                  {moment + 1} / {moments.length}
                </span>
                <button
                  onClick={() => changeMoment(1)}
                  aria-label="Next message"
                >
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="dl-handoff" id="get-started">
          <div>
            <h2>Enter the room.</h2>
            <p>Open your camera and scan.</p>
          </div>
          <div className="dl-handoff-code">
            {phoneUrl ? (
              <PhoneQR value={phoneUrl} />
            ) : (
              <div
                className="dl-qr-placeholder"
                aria-label="Preparing QR code"
              />
            )}
          </div>
        </section>
      </main>

      <footer className="dl-footer">
        <Link href="/" className="dl-brand">
          <span className="dl-brand-mark">
            <Icon name="qr" size={18} />
          </span>
          qr chat
        </Link>
        <span>Be here.</span>
      </footer>
    </div>
  );
}
