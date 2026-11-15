import { useEffect, useRef, useState } from 'react';
import {
  AndroidLogo, ArrowRight, Baby, BookOpenText, Briefcase, Broom, CaretDown, Car, ChatCircleText,
  CheckCircle, ClockClockwise, Confetti, CookingPot, DownloadSimple, EnvelopeSimple, Flag, Globe,
  GraduationCap, HandHeart, Info, Keyboard, Lightning, List, MagnifyingGlass, MapPin, Package,
  Phone, ShieldCheck, Star, Tag, Translate, Truck, UserCircle, Warning, Wrench, X,
} from '@phosphor-icons/react';
import {
  FALLBACK_RELEASE, MIN_ANDROID, PACKAGE_NAME, fetchLatestRelease, formatSizeMB,
} from './release.js';
import {
  SMS_SHORTCODE, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_INTL, comingSoonFeature, copy, faqs,
  features, legal, meta, safetyPoints, steps, workTypes,
} from './content.js';

const LANG_KEY = 'kaaj-lang';
const RELEASE_CACHE_KEY = 'kaaj-latest-apk';
const RELEASE_CACHE_MS = 30 * 60 * 1000;

const workIcons = {
  cleaning: Broom, cooking: CookingPot, electrical: Lightning, plumbing: Wrench, elderly: HandHeart,
  childcare: Baby, driving: Car, delivery: Package, tutoring: BookOpenText, data: Keyboard,
  events: Confetti, moving: Truck,
};
const featureIcons = {
  post: Briefcase, nearby: MagnifyingGlass, price: Tag, profile: UserCircle, verify: ShieldCheck,
  chat: ChatCircleText, checkin: ClockClockwise, reviews: Star, report: Flag, language: Translate,
  training: GraduationCap,
};

const srcSet = (name, widths) => widths.map((w) => `./assets/img/${name}-${w}.webp ${w}w`).join(', ');

function initialLanguage() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl === 'en' || fromUrl === 'bn') return fromUrl;
    const stored = window.localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'bn') return stored;
  } catch { /* storage unavailable */ }
  return 'bn';
}

function readCachedRelease() {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(RELEASE_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.savedAt < RELEASE_CACHE_MS && cached.release?.downloadUrl) return cached.release;
  } catch { /* ignore */ }
  return null;
}

// Starts with the bundled fallback so rendering never waits on GitHub.
function useLatestRelease() {
  const [release, setRelease] = useState(() => readCachedRelease() || FALLBACK_RELEASE);
  useEffect(() => {
    if (readCachedRelease()) return undefined;
    let active = true;
    fetchLatestRelease().then((latest) => {
      if (!active) return;
      setRelease(latest);
      if (latest.source === 'github') {
        try {
          window.sessionStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), release: latest }));
        } catch { /* ignore */ }
      }
    });
    return () => { active = false; };
  }, []);
  return release;
}

function formatDate(iso, lang) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function SectionHeader({ kicker, title, body, id, align = 'start' }) {
  return <div className={`section-header ${align === 'center' ? 'is-center' : ''}`}>
    <p className="kicker">{kicker}</p>
    <h2 id={id}>{title}</h2>
    {body && <p className="section-lead">{body}</p>}
  </div>;
}

function StepList({ items }) {
  return <ol className="step-list">
    {items.map(([title, body], index) => <li key={title}>
      <span className="step-num" aria-hidden="true">{index + 1}</span>
      <div><h4>{title}</h4><p>{body}</p></div>
    </li>)}
  </ol>;
}

function SmsCommand({ keyword, t }) {
  return <p className="sms-command">
    <code>{keyword}</code>
    <span className="sms-to">{t.smsTo}</span>
    <code>{SMS_SHORTCODE}</code>
    <a className="sms-link" href={`sms:${SMS_SHORTCODE}?body=${encodeURIComponent(keyword)}`}>{t.sendSms}</a>
  </p>;
}

export function App() {
  const [lang, setLang] = useState(initialLanguage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [formOpened, setFormOpened] = useState(false);
  const formTimer = useRef(null);
  const menuButton = useRef(null);
  const release = useLatestRelease();

  const t = copy[lang];
  const bn = lang === 'bn';
  const sizeMB = formatSizeMB(release.sizeBytes, lang);
  const releaseDate = formatDate(release.publishedAt, lang);
  const releaseMeta = [`v${release.version}`, sizeMB && `${sizeMB} MB`, `Android ${MIN_ANDROID}+`].filter(Boolean).join(' · ');

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    document.title = meta[lang].title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta[lang].description);
    try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
    };
    const onResize = () => { if (window.innerWidth >= 960) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [menuOpen]);

  useEffect(() => () => clearTimeout(formTimer.current), []);

  function toggleLanguage() {
    setLang(bn ? 'en' : 'bn');
    setMenuOpen(false);
  }

  function submitContact(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`[KAAJ Website] ${data.get('subject')}`);
    const body = encodeURIComponent(`Name: ${data.get('name')}\nEmail/Phone: ${data.get('contact')}\n\n${data.get('message')}`);
    setFormOpened(true);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    clearTimeout(formTimer.current);
    formTimer.current = window.setTimeout(() => setFormOpened(false), 8000);
  }

  const installSteps = t.installSteps.map(([title, body]) => [title, body.replace('{size}', sizeMB || '60')]);

  return <div className="site">
    <a className="skip-link" href="#main">{t.skip}</a>

    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label={t.homeLabel}>
          <img src="./assets/img/logo-96.webp" width="40" height="40" alt="" />
          <span>KAAJ</span>
        </a>
        <nav id="site-nav" className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label={t.navLabel}>
          <ul>
            {t.nav.map(([id, label]) => <li key={id}><a href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a></li>)}
            <li className="nav-download"><a className="btn btn-primary btn-block" href="#download" onClick={() => setMenuOpen(false)}><DownloadSimple weight="bold" aria-hidden="true" />{t.downloadApk}</a></li>
          </ul>
        </nav>
        <div className="header-actions">
          <button className="lang-toggle" type="button" onClick={toggleLanguage} aria-label={t.langSwitchLabel} lang={bn ? 'en' : 'bn'}>
            <Globe aria-hidden="true" /><span className="lang-long">{t.langSwitch}</span><span className="lang-short" aria-hidden="true">{t.langSwitchShort}</span>
          </button>
          <a className="btn btn-primary btn-sm header-download" href="#download"><DownloadSimple weight="bold" aria-hidden="true" />{t.headerDownload}</a>
          <button ref={menuButton} className="menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="site-nav" aria-label={menuOpen ? t.menuClose : t.menuOpen}>
            {menuOpen ? <X aria-hidden="true" /> : <List aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>

    <main id="main" tabIndex="-1">
      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="hero-badge"><MapPin weight="fill" aria-hidden="true" />{t.heroBadge}</p>
            <h1 id="hero-title">{t.heroTitle}</h1>
            <p className="hero-lead">{t.heroBody}</p>
            <div className="hero-actions">
              <a className="btn btn-primary btn-lg" href={release.downloadUrl} rel="noopener"><DownloadSimple weight="bold" aria-hidden="true" />{t.downloadApk}</a>
              <a className="btn btn-secondary btn-lg" href="#how">{t.howCta}<ArrowRight weight="bold" aria-hidden="true" /></a>
            </div>
            <p className="hero-meta"><AndroidLogo weight="fill" aria-hidden="true" /><span>{releaseMeta}</span>{release.prerelease && <span className="pill pill-amber">{t.pilotBuild}</span>}</p>
            <ul className="trust-chips">
              {t.chips.map((chip, index) => {
                const Icon = [ShieldCheck, Translate, MapPin][index];
                return <li key={chip}><Icon weight="fill" aria-hidden="true" />{chip}</li>;
              })}
            </ul>
          </div>
          <figure className="hero-media">
            <img
              src="./assets/img/hero-960.webp"
              srcSet={srcSet('hero', [640, 960, 1440])}
              sizes="(min-width: 960px) 46vw, calc(100vw - 32px)"
              width="1440" height="960" fetchPriority="high" alt={t.heroAlt}
            />
          </figure>
        </div>
      </section>

      <section className="work-types" aria-labelledby="work-types-title">
        <div className="container">
          <h2 id="work-types-title" className="eyebrow-title">{t.workTypesTitle}</h2>
          <ul className="work-chips">
            {workTypes.map(([key, bnLabel, enLabel]) => {
              const Icon = workIcons[key];
              return <li key={key}><Icon aria-hidden="true" />{bn ? bnLabel : enLabel}</li>;
            })}
          </ul>
        </div>
      </section>

      <section className="section" id="how" aria-labelledby="how-title">
        <div className="container">
          <SectionHeader id="how-title" kicker={t.howKicker} title={t.howTitle} body={t.howBody} align="center" />
          <div className="journey-grid">
            <article className="journey-card">
              <img src="./assets/img/client-836.webp" srcSet={srcSet('client', [480, 836])} sizes="(min-width: 960px) 560px, calc(100vw - 32px)" width="836" height="557" loading="lazy" decoding="async" alt={t.clientAlt} />
              <div className="journey-body">
                <p className="overline">{t.forClients}</p>
                <h3>{t.clientsTitle}</h3>
                <StepList items={steps[lang].clients} />
              </div>
            </article>
            <article className="journey-card">
              <img src="./assets/img/worker-836.webp" srcSet={srcSet('worker', [480, 836])} sizes="(min-width: 960px) 560px, calc(100vw - 32px)" width="836" height="557" loading="lazy" decoding="async" alt={t.workerAlt} />
              <div className="journey-body">
                <p className="overline">{t.forWorkers}</p>
                <h3>{t.workersTitle}</h3>
                <StepList items={steps[lang].workers} />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section section-tint" id="features" aria-labelledby="features-title">
        <div className="container">
          <SectionHeader id="features-title" kicker={t.featuresKicker} title={t.featuresTitle} body={t.featuresBody} align="center" />
          <ul className="feature-grid">
            {features.map(([key, bnTitle, bnBody, enTitle, enBody]) => {
              const Icon = featureIcons[key];
              return <li className="feature-card" key={key}>
                <span className="icon-tile"><Icon weight="duotone" aria-hidden="true" /></span>
                <h3>{bn ? bnTitle : enTitle}</h3>
                <p>{bn ? bnBody : enBody}</p>
              </li>;
            })}
            <li className="feature-card is-soon">
              <span className="icon-tile"><GraduationCap weight="duotone" aria-hidden="true" /></span>
              <div>
                <p className="pill pill-neutral">{t.comingSoon}</p>
                <h3>{bn ? comingSoonFeature[1] : comingSoonFeature[3]}</h3>
                <p>{bn ? comingSoonFeature[2] : comingSoonFeature[4]}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="section" id="safety" aria-labelledby="safety-title">
        <div className="container safety-grid">
          <div>
            <SectionHeader id="safety-title" kicker={t.safetyKicker} title={t.safetyTitle} body={t.safetyBody} />
            <ul className="safety-list">
              {safetyPoints.map(([key, bnTitle, bnBody, enTitle, enBody]) => {
                const Icon = featureIcons[key];
                return <li key={key}>
                  <span className="icon-tile icon-tile-sm"><Icon weight="duotone" aria-hidden="true" /></span>
                  <div><h3>{bn ? bnTitle : enTitle}</h3><p>{bn ? bnBody : enBody}</p></div>
                </li>;
              })}
            </ul>
          </div>
          <div className="safety-aside">
            <img src="./assets/img/rajshahi-1200.webp" srcSet={srcSet('rajshahi', [640, 1200])} sizes="(min-width: 960px) 520px, calc(100vw - 32px)" width="1200" height="675" loading="lazy" decoding="async" alt={t.safetyAlt} />
            <div className="emergency" role="note">
              <Warning weight="fill" aria-hidden="true" />
              <div>
                <h3>{t.emergencyTitle}</h3>
                <p>{t.emergencyBody}</p>
                <a className="btn btn-danger btn-sm" href="tel:999"><Phone weight="fill" aria-hidden="true" />{t.call999}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tint" id="pricing" aria-labelledby="pricing-title">
        <div className="container pricing-grid">
          <div className="pricing-header">
            <SectionHeader id="pricing-title" kicker={t.pricingKicker} title={t.pricingTitle} body={t.pricingBody} />
          </div>
          <article className="price-card" aria-label={t.planName}>
            <div className="price-head">
              <h3>{t.planName}</h3>
              <span className="pill pill-green">{t.operators}</span>
            </div>
            <p className="price"><strong>{t.price}</strong><span>{t.perDay}</span></p>
            <p className="price-extra">{t.priceExtra}</p>
            <ul className="check-list">
              {t.pricingPoints.map((point) => <li key={point}><CheckCircle weight="fill" aria-hidden="true" />{point}</li>)}
            </ul>
            <p className="price-warning"><Info weight="fill" aria-hidden="true" /><span>{t.uninstallWarning}</span></p>
          </article>
          <div className="pricing-howto">
            <div className="howto-card">
              <h3>{t.subscribeTitle}</h3>
              <p>{t.subscribeBody}</p>
              <SmsCommand keyword="START kaaj" t={t} />
            </div>
            <div className="howto-card is-stop">
              <h3>{t.unsubscribeTitle}</h3>
              <p>{t.unsubscribeBody}</p>
              <SmsCommand keyword="STOP kaaj" t={t} />
              <p className="howto-note">{t.unsubscribeAlt}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="download" id="download" aria-labelledby="download-title">
        <div className="container download-grid">
          <div>
            <SectionHeader id="download-title" kicker={t.downloadKicker} title={t.downloadTitle} body={t.downloadBody} />
            <article className="release-card" aria-live="polite">
              <div className="release-head">
                <img src="./assets/img/logo-96.webp" width="56" height="56" alt="" loading="lazy" decoding="async" />
                <div>
                  <h3>{t.releaseCardTitle}</h3>
                  <p className="release-name">{release.name}</p>
                </div>
                <span className={`pill ${release.prerelease ? 'pill-amber' : 'pill-green'}`}>{release.prerelease ? t.pilotBuild : t.latestBadge}</span>
              </div>
              <dl className="release-facts">
                <div><dt>{t.version}</dt><dd>{release.version}</dd></div>
                {sizeMB && <div><dt>{t.size}</dt><dd>{sizeMB} MB</dd></div>}
                {releaseDate && <div><dt>{t.released}</dt><dd>{releaseDate}</dd></div>}
                <div><dt>{t.requires}</dt><dd>{t.androidReq}</dd></div>
              </dl>
              <div className="release-actions">
                <a className="btn btn-light btn-lg" href={release.downloadUrl} rel="noopener"><DownloadSimple weight="bold" aria-hidden="true" />{t.downloadApk}{sizeMB && <span className="btn-sub">{sizeMB} MB</span>}</a>
                <a className="text-link" href={release.releaseUrl} target="_blank" rel="noopener noreferrer">{t.releasePage}<ArrowRight aria-hidden="true" /></a>
              </div>
              {release.sha256
                ? <details className="checksum">
                  <summary>{t.checksum}</summary>
                  <p>{t.checksumHelp}</p>
                  <code>{release.sha256}</code>
                  <p className="package-id">{t.packageId}: <code>{PACKAGE_NAME}</code></p>
                </details>
                : <p className="checksum-missing">{t.checksumMissing}</p>}
            </article>
            <div className="pilot-note" role="note">
              <Info weight="fill" aria-hidden="true" />
              <div><strong>{t.pilotNoteTitle}</strong><p>{t.pilotNote}</p></div>
            </div>
          </div>
          <div className="install-card" id="install">
            <h3>{t.installTitle}</h3>
            <ol className="install-steps">
              {installSteps.map(([title, body], index) => <li key={title}>
                <span className="step-num" aria-hidden="true">{index + 1}</span>
                <div><h4>{title}</h4><p>{body}</p></div>
              </li>)}
            </ol>
          </div>
        </div>
      </section>

      <section className="section" id="faq" aria-labelledby="faq-title">
        <div className="container faq-grid">
          <div>
            <SectionHeader id="faq-title" kicker={t.faqKicker} title={t.faqTitle} />
            <p className="faq-contact"><EnvelopeSimple aria-hidden="true" /><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
          </div>
          <div className="faq-list">
            {faqs[lang].map(([question, answer], index) => {
              const open = openFaq === index;
              return <div className={`faq-item ${open ? 'is-open' : ''}`} key={question}>
                <h3>
                  <button type="button" id={`faq-q-${index}`} aria-expanded={open} aria-controls={`faq-a-${index}`} onClick={() => setOpenFaq(open ? -1 : index)}>
                    <span>{question}</span><CaretDown weight="bold" aria-hidden="true" />
                  </button>
                </h3>
                <div id={`faq-a-${index}`} role="region" aria-labelledby={`faq-q-${index}`} hidden={!open}><p>{answer}</p></div>
              </div>;
            })}
          </div>
        </div>
      </section>

      <section className="section section-tint" id="legal" aria-labelledby="legal-title">
        <div className="container">
          <SectionHeader id="legal-title" kicker={t.legalKicker} title={t.legalTitle} />
          <div className="legal-grid">
            <article className="legal-card" id="terms">
              <h3>{t.termsTitle}</h3>
              {legal[lang].terms.map(([title, body]) => <div key={title}><h4>{title}</h4><p>{body}</p></div>)}
            </article>
            <article className="legal-card" id="privacy">
              <h3>{t.privacyTitle}</h3>
              {legal[lang].privacy.map(([title, body]) => <div key={title}><h4>{title}</h4><p>{body}</p></div>)}
            </article>
          </div>
          <p className="legal-updated">{t.lastUpdated}</p>
        </div>
      </section>

      <section className="section" id="contact" aria-labelledby="contact-title">
        <div className="container contact-grid">
          <div>
            <SectionHeader id="contact-title" kicker={t.contactKicker} title={t.contactTitle} body={t.contactBody} />
            <address className="contact-list">
              <a href={`mailto:${SUPPORT_EMAIL}`}><EnvelopeSimple aria-hidden="true" />{SUPPORT_EMAIL}</a>
              <a href={`tel:${SUPPORT_PHONE_INTL}`}><Phone aria-hidden="true" />{SUPPORT_PHONE}</a>
              <span><MapPin aria-hidden="true" />{t.location}</span>
            </address>
          </div>
          <form className="contact-form" onSubmit={submitContact}>
            <div className="form-row">
              <label htmlFor="cf-name">{t.formName}<input id="cf-name" name="name" required minLength="2" maxLength="80" autoComplete="name" /></label>
              <label htmlFor="cf-contact">{t.formContact}<input id="cf-contact" name="contact" required maxLength="120" autoComplete="email" /></label>
            </div>
            <label htmlFor="cf-subject">{t.formSubject}<input id="cf-subject" name="subject" required minLength="3" maxLength="120" /></label>
            <label htmlFor="cf-message">{t.formMessage}<textarea id="cf-message" name="message" required minLength="10" maxLength="3000" rows="5" /></label>
            <div className="form-foot">
              <button className="btn btn-primary" type="submit">{t.formSend}<ArrowRight weight="bold" aria-hidden="true" /></button>
              <p className="form-hint">{t.formHint}</p>
            </div>
            <p className="form-status" role="status">{formOpened && <><CheckCircle weight="fill" aria-hidden="true" />{t.formOpened}</>}</p>
          </form>
        </div>
      </section>
    </main>

    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <a className="brand" href="#top" aria-label={t.homeLabel}><img src="./assets/img/logo-96.webp" width="40" height="40" alt="" loading="lazy" decoding="async" /><span>KAAJ</span></a>
          <p>{t.footerTagline}</p>
        </div>
        <nav aria-label={t.footerExplore}>
          <h2>{t.footerExplore}</h2>
          <ul>
            <li><a href="#how">{t.nav[0][1]}</a></li>
            <li><a href="#features">{t.nav[1][1]}</a></li>
            <li><a href="#pricing">{t.nav[3][1]}</a></li>
            <li><a href="#download">{t.footerDownload}</a></li>
          </ul>
        </nav>
        <nav aria-label={t.footerSupport}>
          <h2>{t.footerSupport}</h2>
          <ul>
            <li><a href="#faq">{t.nav[4][1]}</a></li>
            <li><a href="#terms">{t.termsTitle}</a></li>
            <li><a href="#privacy">{t.privacyTitle}</a></li>
            <li><a href="#contact">{t.footerContact}</a></li>
          </ul>
        </nav>
      </div>
      <div className="container footer-bottom">
        <p>{t.copyright}</p>
        <p>{t.footerEmergency}</p>
      </div>
    </footer>
  </div>;
}
