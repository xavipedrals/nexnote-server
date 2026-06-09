import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NuNotes — Never take notes again</title>
<meta name="description" content="NuNotes is your smartest assistant. Get instant notes, AI summaries, flashcards, quizzes, and exam prep — on iPhone, iPad, and Mac.">
<link rel="icon" href="images/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="images/apple-touch-icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="index.html" class="nav-logo">
      <img src="images/logo.png" alt="" width="32" height="32" class="nav-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="nav-links">
      <a href="support.html" class="nav-link nav-link-hide">Support</a>
      <a href="#download" class="btn btn-primary">Download</a>
    </div>
  </div>
</nav>

<header class="hero">
  <div class="container-narrow">
    <h1>Never take notes again.</h1>
    <p class="subtitle">NuNotes turns lectures and documents into organized notes, AI summaries, flashcards, quizzes, and exam-mode study plans — on iPhone, iPad, and Mac.</p>
    <div class="hero-cta">
      <!-- APP_STORE_URL: replace href when live -->
      <a href="#download" class="btn btn-primary btn-lg">Coming soon on the App Store</a>
    </div>
    <span class="hero-note">Available on iPhone, iPad, and Mac. Free to start.</span>
    <div class="hero-mockup">
      <img src="images/record_lesson.png" alt="Recording a lecture in NuNotes with live waveform" width="471" height="1024" decoding="async">
    </div>
  </div>
</header>

<section class="section">
  <div class="container">
    <div class="feature-band">
      <div class="feature-band-media">
        <img src="images/flashcards.png" alt="Flashcard study session with spaced repetition ratings" width="471" height="1024" loading="lazy" decoding="async">
      </div>
      <div class="feature-band-copy">
        <h2>Flashcards optimized to pass exams.</h2>
        <p>Spaced repetition built into every note — rate cards Again, Hard, Good, or Easy and NuNotes schedules what you need to review before test day.</p>
      </div>
    </div>
    <div class="feature-band feature-band-reverse">
      <div class="feature-band-media">
        <img src="images/note_ai_summary.png" alt="Note detail with AI summary, flashcards, quiz, and podcast" width="471" height="1024" loading="lazy" decoding="async">
      </div>
      <div class="feature-band-copy">
        <h2>Get summaries with AI.</h2>
        <p>Every note gets a TL;DR, key definitions, and one-tap access to flashcards, quizzes, and podcasts generated from your own material.</p>
      </div>
    </div>
    <div class="feature-band">
      <div class="feature-band-media">
        <img src="images/ai_quiz.png" alt="AI quiz question with multiple choice answers" width="471" height="1024" loading="lazy" decoding="async">
      </div>
      <div class="feature-band-copy">
        <h2>Test yourself with AI quizzes.</h2>
        <p>Practice exams built from your notes — with instant feedback so you know what to review before the real thing.</p>
      </div>
    </div>
    <div class="feature-band feature-band-reverse">
      <div class="feature-band-media">
        <img src="images/listen_to_podcast.png" alt="AI-generated podcast player for your notes" width="471" height="1024" loading="lazy" decoding="async">
      </div>
      <div class="feature-band-copy">
        <h2>Listen to your notes as a podcast.</h2>
        <p>Turn any note into an auto-generated audio summary — study on the bus, at the gym, or anywhere you can't read.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <h2>NuNotes keeps it simple.</h2>
      <p>Three steps between you and the best notes you've ever had.</p>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h3>Record or upload</h3>
        <p>Use anything — links, audio, video, documents, websites, or podcasts.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h3>Get notes</h3>
        <p>Organized notes and transcripts appear on your phone in seconds.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h3>Review, study, share</h3>
        <p>AI-made study materials help you learn, and you can chat with your notes any time.</p>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-header">
      <h2>Capture, organize, and learn 10× faster.</h2>
      <p>Everything you need to turn any lecture, meeting, or document into material you'll actually revisit.</p>
    </div>
    <div class="features">
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        </div>
        <h3>Record or upload</h3>
        <p>Lectures, PDFs, documents, videos, and links — NuNotes handles them all.</p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
        </div>
        <h3>Beautiful notes</h3>
        <p>Instant, organized notes that read like a study guide, not a transcript dump.</p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h3>AI chat</h3>
        <p>Ask your notes anything and get grounded answers from your own material.</p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </div>
        <h3>Quizzes &amp; flashcards</h3>
        <p>Turn a lecture into practice exams, flashcards, and study games in one tap.</p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        </div>
        <h3>AI podcasts</h3>
        <p>Listen to your material as a podcast on the bus, at the gym, anywhere.</p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <h3>100+ languages</h3>
        <p>NuNotes captures and organizes notes in over 100 languages.</p>
      </div>
    </div>
  </div>
</section>

<section id="faq" class="section section-alt">
  <div class="container-narrow">
    <div class="section-header">
      <h2>Frequently asked questions</h2>
    </div>
    <div class="faq">
      <details class="faq-item">
        <summary class="faq-question">What does NuNotes do?
          <svg class="faq-toggle" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </summary>
        <div class="faq-answer">Get detailed and organized notes from any lecture, meeting, or document. Get study materials made by AI including quizzes, practice exams, flashcards, podcasts, videos, study games, and more. NuNotes helps you improve your grades by using AI that doesn't break your university's honor code.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-question">Is NuNotes ok to use at my school?
          <svg class="faq-toggle" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </summary>
        <div class="faq-answer">Yes. NuNotes only helps you learn and capture key details — it doesn't cheat for you. As long as your professor or teacher is cool with you audio recording the class, you're good to go.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-question">Does NuNotes work on iPhone, iPad, and Mac?
          <svg class="faq-toggle" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </summary>
        <div class="faq-answer">Yes. NuNotes runs on iPhone, iPad, and Mac — your notes and study progress stay in sync across all your devices. The app is free to download and use.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-question">Is NuNotes free?
          <svg class="faq-toggle" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </summary>
        <div class="faq-answer">Yes, you can download and use NuNotes for free to get started. For best results, we recommend upgrading to Unlimited Pass for unlimited notes, priority support, and added features.</div>
      </details>
    </div>
  </div>
</section>

<section id="download">
  <div class="final-cta">
    <h2>Ready to stop taking notes?</h2>
    <p>Coming soon on the App Store for iPhone, iPad, and Mac. Turn your next lecture into organized notes and study tools you'll actually use.</p>
    <!-- APP_STORE_URL: replace href when live -->
    <a href="#download" class="btn btn-primary btn-lg">Coming soon on the App Store</a>
  </div>
</section>

<footer class="footer">
  <div class="container footer-inner">
    <a href="index.html" class="footer-brand">
      <img src="images/logo.png" alt="" width="24" height="24" class="footer-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="footer-links">
      <a href="support.html" class="footer-link">Support</a>
      <a href="privacy.html" class="footer-link">Privacy</a>
      <a href="terms.html" class="footer-link">Terms</a>
      <a href="mailto:support@mopiq.app" class="footer-link">Contact</a>
    </div>
    <div class="footer-copy">© 2026 NuNotes</div>
  </div>
</footer>

</body>
</html>
`;
const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy — NuNotes</title>
<meta name="description" content="How NuNotes collects, uses, and protects your information.">
<link rel="icon" href="images/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="images/apple-touch-icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="index.html" class="nav-logo">
      <img src="images/logo.png" alt="" width="32" height="32" class="nav-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="nav-links">
      <a href="support.html" class="nav-link nav-link-hide">Support</a>
      <a href="index.html#download" class="btn btn-primary">Download</a>
    </div>
  </div>
</nav>

<main class="legal">
  <div class="container-narrow">
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: April 20, 2026</p>

    <p>NuNotes ("NuNotes", "we", "us") is dedicated to providing an efficient and reliable note-taking experience. This Privacy Policy explains how we collect, use, and disclose the personal information we receive about you online and offline, including when you use our iOS application that links to this Privacy Policy, and in any other interactions we have with you (collectively, "Services"). This Policy also outlines certain rights you may have to your personal information. This Policy applies only when you use our Services as a consumer and not as a job applicant, contractor, or employee.</p>

    <p>By using our Services, communicating with us, or otherwise interacting with us, you consent and agree to our collection, use, and disclosure of your information as described in this Policy.</p>

    <h2>Table of Contents</h2>
    <ol class="toc">
      <li>Personal Information We Collect and Sources</li>
      <li>Personal Information You Provide to Us</li>
      <li>Personal Information We Collect Automatically</li>
      <li>Personal Information We Collect From Third Parties</li>
      <li>How We Use Your Personal Information</li>
      <li>Disclosure of Your Personal Information</li>
      <li>Third Parties to Whom NuNotes Discloses Personal Information</li>
      <li>Your Choices About How We Use Your Personal Information</li>
      <li>How Long We Retain Your Personal Information</li>
      <li>How We Secure Your Personal Information</li>
      <li>Third-Party Websites or Platforms</li>
      <li>Children's Privacy</li>
      <li>Jurisdictional Rights</li>
      <li>EEA, Switzerland, and UK</li>
      <li>California</li>
      <li>Privacy Rights in Your State or Country of Residence</li>
      <li>Changes to this Policy</li>
      <li>Contact Us</li>
    </ol>

    <h2>Personal Information We Collect and Sources</h2>
    <p>In providing the Services to you, we collect the personal information described below.</p>

    <h2>Personal Information You Provide to Us</h2>
    <p>When you use the Services or otherwise interact with us (such as through our customer support or other methods of customer service), we may collect the following personal information: username, email address, phone number, password, and full name. During the onboarding process, you may also choose to provide us with information about your level of study, focus of study, and information about your study goals.</p>
    <p>If you log into the Services using a third-party authentication service, such as Apple or Google, these services will authenticate your identity and provide you the option to disclose certain personal information with us, such as your name and email address. You may choose to provide additional information during the linking process to enable certain features on NuNotes.</p>
    <p>If you complete a purchase transaction with us, we collect limited payment information and any information needed to process your payment. Our third-party payment processors handle any payment card details and payment instrument information that you may provide.</p>
    <p>If you create, upload, transmit, or otherwise post information to the Services or communicate with us, we will collect that information, which may include text, images, audio files, search queries, survey responses, support communications, and other information types or formats. If you upload audio, image, or video content that includes other individuals, you agree that you will not upload such content without the knowledge and/or consent of the individual you have recorded. We may collect information that you choose to provide to enhance the Services, including your school or course information.</p>
    <p>When you interact with our mobile application, we will collect information about how and when you use our Services, including the device used to connect to our Services, your operating system version, your IP address and device identifier, the frequency, timing, and duration of your usage, the screens you view, your usage patterns, and information about your interaction with our Services.</p>

    <h2>Personal Information We Collect Automatically</h2>
    <p>We collect certain information from and about you when you interact with our Services, including usage activity such as interacting with our mobile application, creating a note, or viewing and interacting with content presented in our Services. This information is automatically collected using various technology services and tools such as SDKs, mobile analytics, and similar technologies. These technologies collect and store data about our users in real-time in order to operate and improve the Services. The vendors who supply us with these tools may collect your information instantaneously and simultaneously during our collection of your information. We also use local storage, which allows data to be stored locally on your device.</p>

    <h2>Personal Information We Collect From Third Parties</h2>
    <p>We collect information about you from the following categories of third parties.</p>
    <p><strong>Our partners and other companies.</strong> NuNotes may receive information about you from other sources, including our partners, service providers, or other third parties. For example, customer support features may be provided by third parties that receive or have access to the content of communications made using those features on our behalf. We may combine information we collect from you over time and across the Services with the information we receive from other sources and third parties.</p>
    <p><strong>Other users.</strong> NuNotes may receive information about you from our users. For example, if a user refers you to NuNotes, we may collect your name and email address from our user to send you an invitation to use NuNotes.</p>
    <p><strong>Third-party platforms and publicly available sources.</strong> We may collect information from third-party discussion forums, public posts on social media platforms, and other publicly available information sources, in accordance with applicable laws.</p>

    <h2>How We Use Your Personal Information</h2>
    <p>We use your personal information to provide, maintain, improve, and promote the Services, and to communicate with you. The specific purposes of our collection are as follows:</p>
    <ul>
      <li><strong>Providing, maintaining, and personalizing the Services.</strong> Information you provide to us allows us to help you log in, host your content, enable your use of our study tools, process any payments, and send you transactional communications about your use of the Services.</li>
      <li><strong>Measuring, analyzing, and improving the Services.</strong> We use certain information to analyze usage and performance of the Services, to conduct surveys and user research, and to collect feedback.</li>
      <li><strong>Providing support, resolving issues, and responding to requests.</strong> We send you the information and support that you request and other important administrative communications.</li>
      <li><strong>Sending you marketing communications.</strong> We may send you information about the Services, new features, promotions, and special offers.</li>
      <li><strong>Preventing fraud, crime and abuse and the security and integrity of the Services.</strong></li>
      <li><strong>Protecting our and third parties' rights and property and enforcing our Terms of Use or other applicable agreements or policies.</strong></li>
      <li><strong>Verifying your identity.</strong> In some cases, we may need to verify your identity in order to protect the security and integrity of the Services and your account.</li>
      <li><strong>Complying with any applicable laws or regulations.</strong></li>
    </ul>

    <h2>Disclosure of Your Personal Information</h2>
    <h3>Personal Information You Choose to Disclose via the Services</h3>
    <p>Certain information about you, or activities you perform on NuNotes, may be displayed publicly in the Services. For example, information included in notes you choose to share may be viewable by other users.</p>

    <h2>Third Parties to Whom NuNotes Discloses Personal Information</h2>
    <p>NuNotes may disclose your information to third parties in the following circumstances:</p>
    <p><strong>For external processing.</strong> NuNotes provides personal and non-personal information to our service providers, vendors, partners, payments providers, and other affiliated organizations to process it on our behalf. Our providers process data in accordance with our instructions, Privacy Policy and any other appropriate confidentiality, security or other requirements.</p>
    <p><strong>To respond to legal and other requests and to prevent harm.</strong> NuNotes may provide personal information to third-party entities if we have a good-faith belief that access, use, preservation or disclosure of the information is reasonably necessary to:</p>
    <ul>
      <li>Respond to or meet any applicable law, regulation, legal process or other enforceable governmental request.</li>
      <li>Enforce our Terms of Use, including investigation of potential violations.</li>
      <li>Detect, prevent, or otherwise address fraud, security or technical issues.</li>
      <li>Protect against and prevent harm to the rights, property or safety of NuNotes, our users, or the public as required or permitted by law.</li>
    </ul>
    <p><strong>With any successor to all or part of our business.</strong> If NuNotes is involved in a merger, acquisition, or sale of all or a portion of its assets, your personal information may be transferred to a receiving party.</p>
    <p><strong>With your consent.</strong> We may otherwise disclose personal information to companies, organizations or individuals outside of NuNotes when we have your consent to do so.</p>

    <h2>Your Choices About How We Use Your Personal Information</h2>
    <p><strong>Email, Push, and Other Communications.</strong> You may opt out of receiving certain communications (such as email or push notifications) from NuNotes by changing your notification settings in your NuNotes account or device settings, or by following the unsubscribe instructions in those messages. NuNotes will still send you transactional communications, such as messages about your account, in accordance with applicable law.</p>
    <p><strong>Sensitive Personal Information.</strong> NuNotes does not currently process sensitive personal information relating to medical or health conditions, racial or ethnic origin, political opinions, or religious or philosophical beliefs.</p>
    <p><strong>Managing Your Account.</strong> You can choose whether the content you create on NuNotes, such as your notes, can be viewed by other users. You may delete the content you create on NuNotes by using the deletion tools we provide. You may delete your account at any time through Settings in the NuNotes app. If you delete your account, the content you have created on NuNotes will be deleted in accordance with our data retention policies.</p>

    <h2>How Long We Retain Your Personal Information</h2>
    <p>NuNotes retains your personal information for as long as your account is active, to fulfill our legitimate business purposes, or to comply with our legal obligations or document retention policies. When these conditions no longer exist, NuNotes removes that information in accordance with our standard deletion processes. NuNotes may retain and use non-personal information, including information which has been de-identified, aggregated, or anonymized, indefinitely.</p>
    <p>We retain records of support tickets and other communications between NuNotes and our users, for example support emails, survey responses, and feedback submissions, indefinitely in order to better manage our support processes and maintain accurate business records.</p>

    <h2>How We Secure Your Personal Information</h2>
    <p>The security of your personal information is important to us. NuNotes takes measures reasonably designed to protect against the unauthorized access, use, alteration or destruction of personal information.</p>
    <p>We use reasonable efforts to follow generally accepted industry standards to protect the personal information submitted to us, both during transmission and once we receive it. However, no system is 100% secure. If you have any questions about the security of our Services, you can contact us at <a href="mailto:support@mopiq.app">support@mopiq.app</a>.</p>

    <h2>Third-Party Websites or Platforms</h2>
    <p>We may direct you to, or provide you with an option to, visit third-party websites or platforms. Third-party platforms operate independently from us and we are not responsible for the personal information that you choose to submit to those platforms. We encourage you to review the privacy policies and settings of the third-party platforms that you interact with.</p>

    <h2>Children's Privacy</h2>
    <p>NuNotes is intended for users in high school and beyond. We do not knowingly collect personal information of children under 13, or otherwise below the age for which parental consent is required under applicable law. If we become aware that we have collected information about children under the age where parental consent is required in their jurisdiction of residence, we will take steps to delete such personal information as soon as reasonably practicable.</p>

    <h2>Jurisdictional Rights</h2>
    <p>The laws of the place where you reside may give you certain rights with respect to your personal information. These rights only apply to the extent that both you and NuNotes are subject to such laws.</p>
    <ul>
      <li>If you are located in the EEA, UK, or Switzerland, please review the "EEA, Switzerland, and UK" section below.</li>
      <li>If you are a resident of California, please review the "California" section below.</li>
      <li>For residents of all other jurisdictions, please review the "Privacy Rights in Your State or Country of Residence" section below.</li>
    </ul>

    <h2>EEA, Switzerland, and UK</h2>
    <p>This section provides additional information about our processing of personal information for individuals who use our Services and are located in the European Economic Area ("EEA"), Switzerland, and United Kingdom.</p>
    <p>NuNotes processes your personal information only when we have a lawful basis for doing so, including:</p>
    <ul>
      <li><strong>Contract.</strong> Where processing is necessary to deliver the Services to you.</li>
      <li><strong>Consent.</strong> For example, when you choose to receive marketing communications.</li>
      <li><strong>Legitimate Interest.</strong> For providing, maintaining, and improving our Services.</li>
      <li><strong>Legal Obligation.</strong> For example, obligations relating to accounting and taxation.</li>
    </ul>
    <p>The GDPR provides certain rights to individuals in the EEA, Switzerland, and UK, including the right of access, right to rectify, right to erasure, right to restrict processing, right to object to processing, right of portability, and right to withdraw consent. You may exercise these rights by contacting us at <a href="mailto:support@mopiq.app">support@mopiq.app</a>.</p>

    <h2>California</h2>
    <p>This section is provided pursuant to the California Consumer Privacy Act, as amended ("CCPA"), and applies solely to California residents.</p>
    <p>NuNotes does not currently "sell" or "share" personal information for purposes of cross-context behavioral advertising as such terms are defined in the CCPA.</p>
    <p>Subject to exceptions and limitations, the CCPA provides California residents with the following rights:</p>
    <ul>
      <li><strong>Right to Know</strong> what personal information we collect, use, and disclose about you.</li>
      <li><strong>Right to Request Deletion</strong> of personal information we collected from you.</li>
      <li><strong>Right to Correct</strong> inaccurate personal information that we hold about you.</li>
      <li><strong>Right to Opt Out of Sales and Sharing</strong> (currently not applicable to the Services).</li>
    </ul>
    <p>To exercise these rights, email us at <a href="mailto:support@mopiq.app">support@mopiq.app</a> with the subject line "CCPA Request." Consistent with the CCPA, we will not discriminate against you for exercising any of your CCPA rights.</p>

    <h2>Privacy Rights in Your State or Country of Residence</h2>
    <p>The laws of your state or country of residency may afford you certain rights with respect to the collection, use, and disclosure of your personal information. Depending on where you live, you may have the right to know, access, correct, delete, opt out of targeted advertising, opt out of sales, and withdraw consent.</p>
    <p>To exercise any of these rights, please email us at <a href="mailto:support@mopiq.app">support@mopiq.app</a> with the subject line "Privacy Request." We may request additional information from you in order to verify your request.</p>

    <h2>Changes to this Policy</h2>
    <p>NuNotes reserves the right to modify this Privacy Policy at any time, so please review it frequently. If personal information covered by this Privacy Policy is to be used for a new purpose that is materially different from that for which the personal information was originally collected, we will provide you with an opportunity to choose whether to have your personal information so used or disclosed. Your continued use of the Services constitutes your acceptance of any changes to this Privacy Policy.</p>

    <h2>Contact Us</h2>
    <p>If you have questions about this Privacy Policy, please contact us at: <a href="mailto:support@mopiq.app">support@mopiq.app</a></p>
  </div>
</main>

<footer class="footer">
  <div class="container footer-inner">
    <a href="index.html" class="footer-brand">
      <img src="images/logo.png" alt="" width="24" height="24" class="footer-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="footer-links">
      <a href="support.html" class="footer-link">Support</a>
      <a href="privacy.html" class="footer-link">Privacy</a>
      <a href="terms.html" class="footer-link">Terms</a>
      <a href="mailto:support@mopiq.app" class="footer-link">Contact</a>
    </div>
    <div class="footer-copy">© 2026 NuNotes</div>
  </div>
</footer>

</body>
</html>
`;
const TERMS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Terms of Use — NuNotes</title>
<meta name="description" content="The terms and conditions that govern your use of NuNotes.">
<link rel="icon" href="images/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="images/apple-touch-icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="index.html" class="nav-logo">
      <img src="images/logo.png" alt="" width="32" height="32" class="nav-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="nav-links">
      <a href="support.html" class="nav-link nav-link-hide">Support</a>
      <a href="index.html#download" class="btn btn-primary">Download</a>
    </div>
  </div>
</nav>

<main class="legal">
  <div class="container-narrow">
    <h1>Terms of Use</h1>
    <p class="updated">Version 1.0 · Effective Date: April 20, 2026</p>

    <p><strong>PLEASE READ:</strong> This Terms of Use agreement ("Terms") is a legal contract between you and NuNotes ("NuNotes," "we," "us," or "our") governing your access to and use of the mobile application and related services that link to these Terms (collectively, the "Service"). By accessing or using the Service, you agree (on behalf of yourself or the entity you represent) to be bound by these Terms and our Privacy Policy, and you represent and warrant that you have the right, authority, and capacity to enter into these Terms. If you do not agree, do not access and/or use the Service.</p>

    <p><strong>ARBITRATION &amp; CLASS ACTION WAIVER NOTICE:</strong> EXCEPT FOR CERTAIN DISPUTES DESCRIBED IN SECTION 12, YOU AGREE THAT DISPUTES BETWEEN YOU AND NUNOTES WILL BE RESOLVED BY BINDING, FINAL, INDIVIDUAL ARBITRATION UNDER THE AAA CONSUMER ARBITRATION RULES AND YOU WAIVE YOUR RIGHT TO A JURY TRIAL OR TO PARTICIPATE IN A CLASS ACTION.</p>

    <p>UNLESS YOU OPT OUT OF THE AGREEMENT TO ARBITRATE WITHIN 30 DAYS: (1) YOU WILL ONLY BE PERMITTED TO PURSUE DISPUTES OR CLAIMS AND SEEK RELIEF AGAINST NUNOTES ON AN INDIVIDUAL BASIS, NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS OR REPRESENTATIVE ACTION OR PROCEEDING, AND YOU WAIVE YOUR RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR CLASS-WIDE ARBITRATION; AND (2) YOU ARE WAIVING YOUR RIGHT TO PURSUE DISPUTES OR CLAIMS AND SEEK RELIEF IN A COURT OF LAW AND TO HAVE A JURY TRIAL.</p>

    <h2>1. Eligibility and Accounts</h2>
    <p><strong>1.1 Age.</strong> The Service is not available to users under 13 years old. If you are between 13 and 18 (or the age of majority where you live), you may use the Service only with the consent of a parent or legal guardian who agrees to these Terms on your behalf.</p>
    <p><strong>1.2 Registration; Account Security.</strong> You must provide accurate information and keep it updated. You are responsible for any activity that occurs under your account and for keeping your password and authentication methods secure. You agree to immediately notify us of any unauthorized use, or suspected unauthorized use of your account or any other breach of security. NuNotes cannot and will not be liable for any loss or damage arising from your failure to comply with the above requirements.</p>
    <p><strong>1.3 Organization/Workspace Accounts.</strong> If you create or join an organization or workspace (an "Organization"), the Organization (not you) controls that account and the data within it. The Organization may manage, access, suspend, or terminate your access and may set policies that apply to your use. If your email domain is owned or managed by an Organization, we may migrate your account and related content to that Organization. Content created or stored in an Organization account is owned by that Organization.</p>
    <p><strong>1.4 Third-Party Services.</strong> The Service may allow you to connect third-party accounts or services. You authorize us to access, process, and transfer information from those services as reasonably necessary to provide and improve the Service. Third-party services are not under our control, and NuNotes is not responsible for any third-party services. When you use any third-party services, the applicable third party's terms and policies apply.</p>

    <h2>2. Access to the Service</h2>
    <p><strong>2.1 License.</strong> Subject to these Terms, NuNotes grants you a non-transferable, non-exclusive, revocable, limited license to use and access the Service solely for your own personal, noncommercial use.</p>
    <p><strong>2.2 Certain Restrictions.</strong> The rights granted to you in these Terms are subject to the following restrictions: (a) you shall not license, sell, rent, lease, transfer, assign, distribute, host, or otherwise commercially exploit the Service; (b) you shall not modify, make derivative works of, disassemble, reverse compile or reverse engineer any part of the Service; (c) you shall not access the Service in order to build a similar or competitive product; and (d) except as expressly stated herein, no part of the Service may be copied, reproduced, distributed, republished, downloaded, displayed, posted or transmitted in any form or by any means. All copyright and other proprietary notices on the Service must be retained on all copies.</p>
    <p><strong>2.3 Modification.</strong> We reserve the right, at any time, to modify, suspend, or discontinue the Service (in whole or in part) with or without notice to you. You agree that we will not be liable to you or to any third party for any modification, suspension, or discontinuation of the Service.</p>
    <p><strong>2.4 No Support or Maintenance.</strong> You acknowledge and agree that NuNotes will have no obligation to provide you with any support or maintenance in connection with the Service.</p>
    <p><strong>2.5 Ownership.</strong> Excluding any User Content that you may provide (defined below), you acknowledge that all the intellectual property rights, including copyrights, patents, trademarks, and trade secrets, in the Service and its content are owned by NuNotes or NuNotes's suppliers. Neither these Terms (nor your access to the Service) transfers to you or any third party any rights, title or interest in or to such intellectual property rights, except for the limited access rights expressly set forth in Section 2.1.</p>

    <h2>3. Fees and Subscriptions</h2>
    <p><strong>3.1 Subscriptions.</strong> Certain features are offered on a paid subscription basis ("Subscription"). Unless otherwise stated, Subscriptions automatically renew for successive terms of the same length and price then in effect until canceled.</p>
    <p><strong>3.2 Billing &amp; Cancellation.</strong> Subscriptions are purchased through the Apple App Store, and you must cancel through that platform. Cancellation takes effect at the end of the then-current billing period. Fees are non-refundable except as required by law.</p>
    <p><strong>3.3 Trials, Changes &amp; Taxes.</strong> Free trials may convert to paid Subscriptions unless canceled before the trial ends. We may change prices or features prospectively with notice where required. Applicable taxes may be charged.</p>
    <p><strong>3.4 Delinquency.</strong> We may suspend or terminate access for unpaid amounts; you remain responsible for fees through the applicable term.</p>

    <h2>4. User Content; Rights and Responsibilities</h2>
    <p><strong>4.1 Definitions.</strong> "User Content" means content you upload, record, submit, or otherwise make available through the Service (e.g., audio, transcripts, notes, documents, images, and metadata).</p>
    <p><strong>4.2 Ownership.</strong> You are solely responsible for your User Content. You assume all risks associated with use of your User Content, including any reliance on its accuracy, completeness or usefulness by others. By uploading User Content to the Service, you represent and warrant to NuNotes that you are authorized to upload such User Content, and that your User Content does not violate Section 4.6 or 4.7. NuNotes is not obligated to backup any User Content, and your User Content may be deleted at any time without prior notice. You are solely responsible for creating and maintaining your own backup copies of your User Content if you desire.</p>
    <p><strong>4.3 Limited License.</strong> You hereby grant (and you represent and warrant that you have the right to grant) to NuNotes an irrevocable, nonexclusive, royalty-free and fully paid, worldwide license to reproduce, distribute, publicly display and perform, prepare derivative works of, incorporate into other works, and otherwise use and exploit your User Content, and to grant sublicenses of the foregoing rights, for the purposes of including your User Content in the Service. You hereby irrevocably waive any claims and assertions of moral rights or attribution with respect to your User Content.</p>
    <p><strong>4.4 Deletion.</strong> You may delete User Content from your account. Deleted content may remain in a trash or backup state for a limited period, after which it is permanently deleted and cannot be restored, except where we are required to retain it by law or for legitimate business purposes.</p>
    <p><strong>4.5 Sharing &amp; Access Controls.</strong> The Service may allow you to share User Content or outputs with others. While we offer settings intended to limit access, we cannot guarantee that shared content will remain restricted. You are responsible for your sharing decisions and for any third-party use of content you share.</p>
    <p><strong>4.6 Recording Compliance.</strong> The Service may enable you to record or upload audio or conversations. Recording, eavesdropping, and consent laws vary by jurisdiction. You are solely responsible for providing any legally required notices and obtaining all necessary consents from participants before recording or uploading any audio, and for ensuring your use complies with applicable law.</p>
    <p><strong>4.7 Acceptable Use.</strong> You agree not to: (a) copy, scrape, reverse engineer, or misuse the Service; (b) upload unlawful, infringing, or harmful content; (c) interfere with or disrupt the Service; (d) attempt to bypass security or limits; (e) use the Service for any paid transcription workflow or as a component of a commercial product or service without our prior written consent; or (f) violate any applicable law, including privacy, intellectual-property, and recording-consent laws.</p>
    <p><strong>4.8 Feedback.</strong> If you provide us with any suggestions or ideas regarding the Service ("Feedback"), you hereby assign to us all rights in such Feedback and agree that we shall have the right to use and fully exploit such Feedback in any manner we deem appropriate. We will treat any Feedback as non-confidential and non-proprietary.</p>
    <p><strong>4.9 Enforcement.</strong> We reserve the right (but have no obligation) to review, refuse and/or remove any User Content in our sole discretion, and to investigate and/or take appropriate action against you if you violate Section 4.6 or 4.7 or any other provision of these Terms or otherwise create liability for us or any other person. Such action may include removing or modifying your User Content and/or terminating your account.</p>

    <h2>5. Privacy; Data Use; Model Training</h2>
    <p><strong>5.1 Privacy Policy.</strong> Our collection and use of personal data are described in our Privacy Policy (incorporated by reference).</p>
    <p><strong>5.2 Usage Data; Aggregated/Deidentified Data.</strong> We may collect usage, diagnostic, and technical telemetry and may create aggregated and/or deidentified data to operate, analyze, and improve the Service and our models. Aggregated/deidentified data will not identify you.</p>
    <p><strong>5.3 Model Improvement (Customer Content).</strong> We do not use your User Content to train our models unless you (or your Organization) opt in via product settings or a separate agreement. However, our third-party vendors may use your User Content to train their models.</p>

    <h2>6. AI-Generated Outputs &amp; Professional Use</h2>
    <p><strong>6.1 AI Outputs.</strong> AI-generated outputs may be inaccurate, incomplete, biased, or inappropriate. You are responsible for reviewing outputs, exercising judgment, and applying human oversight before relying on them.</p>
    <p><strong>6.2 No Professional Advice.</strong> The Service does not provide legal, medical, financial, or other professional advice. You should obtain professional advice before relying on outputs for such purposes.</p>

    <h2>7. DMCA</h2>
    <p><strong>7.1 DMCA Agent.</strong> We respect intellectual-property rights. If you believe your work has been used in a way that constitutes infringement, please send a notice that meets 17 U.S.C. §512(c)(3) to our DMCA Agent at: <a href="mailto:support@mopiq.app">support@mopiq.app</a>. Your notice should include your physical or electronic signature, identification of the copyrighted work claimed to be infringed and the material that is claimed to be infringing, your contact information, a statement of good-faith belief, and a statement under penalty of perjury that your notice is accurate and that you are authorized to act on behalf of the copyright owner.</p>
    <p><strong>7.2 Counter-Notice.</strong> If you believe material was removed or disabled by mistake or misidentification, you may send a counter-notice as permitted by the DMCA.</p>
    <p><strong>7.3 Repeat Infringers.</strong> We may terminate accounts of repeat infringers in appropriate circumstances.</p>

    <h2>8. Updates to Terms</h2>
    <p>We may update these Terms by posting the updated version with a new Effective Date; continued use of the Service after the Effective Date constitutes acceptance of the updated Terms.</p>

    <h2>9. Disclaimers</h2>
    <p>TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED ON AN "AS-IS" AND "AS AVAILABLE" BASIS, AND NUNOTES (AND OUR SUPPLIERS) EXPRESSLY DISCLAIM ANY AND ALL WARRANTIES AND CONDITIONS OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING ALL WARRANTIES OR CONDITIONS OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, QUIET ENJOYMENT, ACCURACY, OR NON-INFRINGEMENT. WE (AND OUR SUPPLIERS) MAKE NO WARRANTY THAT THE SERVICE WILL MEET YOUR REQUIREMENTS, WILL BE AVAILABLE ON AN UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE BASIS, OR WILL BE ACCURATE, RELIABLE, FREE OF VIRUSES OR OTHER HARMFUL CODE, COMPLETE, LEGAL, OR SAFE. IF APPLICABLE LAW REQUIRES ANY WARRANTIES, ALL SUCH WARRANTIES ARE LIMITED IN DURATION TO 90 DAYS FROM THE DATE OF FIRST USE.</p>
    <p>SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF IMPLIED WARRANTIES, SO THE ABOVE EXCLUSION MAY NOT APPLY TO YOU.</p>

    <h2>10. Limitation of Liability</h2>
    <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL NUNOTES NOR ITS AFFILIATES, LICENSORS, OR SUPPLIERS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY LOST PROFITS, LOST DATA, COSTS OF PROCUREMENT OF SUBSTITUTE PRODUCTS, OR ANY INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL OR PUNITIVE DAMAGES, BUSINESS INTERRUPTION, OR COST OF SUBSTITUTE SERVICES, ARISING FROM OR RELATING TO THESE TERMS OR YOUR USE OF, OR INABILITY TO USE, THE SERVICE, EVEN IF NUNOTES HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
    <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR LIABILITY TO YOU FOR ANY DAMAGES ARISING FROM OR RELATED TO THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO NUNOTES FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY, OR (B) $100. THE EXISTENCE OF MORE THAN ONE CLAIM WILL NOT ENLARGE THIS LIMIT.</p>
    <p>SOME JURISDICTIONS DO NOT ALLOW THE LIMITATION OR EXCLUSION OF LIABILITY FOR INCIDENTAL OR CONSEQUENTIAL DAMAGES, SO THE ABOVE LIMITATION OR EXCLUSION MAY NOT APPLY TO YOU.</p>

    <h2>11. Indemnification</h2>
    <p>You hereby agree to defend, indemnify, and hold harmless NuNotes and its affiliates, officers, members, managers, employees, representatives and agents from and against any claims, damages, costs, and expenses (including reasonable attorneys' fees) arising out of or related to your User Content, your use of the Service, or your violation of these Terms or applicable law. NuNotes reserves the right, at your expense, to assume the exclusive defense and control of any matter for which you are required to indemnify us, and you agree to cooperate with our defense of these claims.</p>

    <h2>12. Dispute Resolution; Arbitration; Class Waiver</h2>
    <p><strong>12.1 Informal Resolution.</strong> Before filing a claim, you and NuNotes agree to try to resolve the dispute informally. Send a written notice of the dispute, including your name, contact information, a description of the dispute, and the relief sought, to <a href="mailto:support@mopiq.app">support@mopiq.app</a>. If we cannot resolve the dispute within 60 days, either party may start arbitration.</p>
    <p><strong>12.2 Arbitration Agreement.</strong> You and NuNotes agree to resolve any claims or disputes arising out of or relating to these Terms or the Service by binding individual arbitration administered by the American Arbitration Association ("AAA") under its Consumer Arbitration Rules then in effect (the "AAA Rules"), except as provided in Section 12.3. The Federal Arbitration Act governs this agreement to arbitrate.</p>
    <p><strong>12.3 Exceptions.</strong> Either party may (a) bring an individual claim in small claims court with jurisdiction; and (b) seek temporary or preliminary equitable relief in court to protect intellectual-property rights or prevent unauthorized access to or use of the Service, pending final determination by the arbitrator.</p>
    <p><strong>12.4 Procedures.</strong> The arbitration may be conducted by phone, video, or based on written submissions; if an in-person hearing is required, it will occur in the county (or parish) where you live, unless we agree otherwise. The AAA Rules are available at www.adr.org.</p>
    <p><strong>12.5 Class Action Waiver.</strong> YOU AND NUNOTES AGREE THAT EACH MAY BRING CLAIMS ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING. THE ARBITRATOR MAY NOT CONSOLIDATE MORE THAN ONE PERSON'S CLAIMS OR OTHERWISE PRESIDE OVER ANY FORM OF A REPRESENTATIVE OR CLASS PROCEEDING.</p>
    <p><strong>12.6 Opt-Out.</strong> You may opt out of this Arbitration Agreement within 30 days of first accepting these Terms by sending a written opt-out notice to <a href="mailto:support@mopiq.app">support@mopiq.app</a> with the subject line "Arbitration Opt-Out." Your notice must include your name, the email address associated with your account, and a statement that you want to opt out of arbitration.</p>
    <p><strong>12.7 Fees and Awards.</strong> Payment of all filing, administration, and arbitrator fees will be governed by the AAA Rules. The arbitrator may award relief only in favor of the individual party seeking relief and only to the extent necessary to provide relief warranted by that party's individual claim.</p>
    <p><strong>12.8 Severability; Survival.</strong> If any portion of this Section 12 is found unenforceable, the unenforceable portion shall be severed and the remainder will remain in effect. This Section 12 will survive termination of your account and these Terms.</p>

    <h2>13. Termination; Suspension</h2>
    <p>We may suspend or terminate your access to the Service (in whole or in part) at any time, with or without notice, for any reason at our sole discretion, including if we believe you have violated these Terms or applicable law, or to protect the Service or other users. You may stop using the Service at any time. Upon termination of your rights under these Terms, your account and right to access and use the Service will terminate immediately. You understand that any termination of your account may involve deletion of your User Content associated with your account from our live databases. NuNotes will not have any liability whatsoever to you for any termination of your rights under these Terms. Sections that by their nature should survive termination will survive and remain in full force and effect.</p>

    <h2>14. Electronic Communications; Notices; Miscellaneous</h2>
    <p><strong>14.1 Electronic Communications.</strong> You consent to receive communications from us electronically, including emails, in-product messages, and postings on the Service, and you agree that such communications satisfy any legal requirements for written communications.</p>
    <p><strong>14.2 Notices &amp; Communications.</strong> For support or general notices, contact <a href="mailto:support@mopiq.app">support@mopiq.app</a>. For legal disputes and arbitration notices, contact <a href="mailto:support@mopiq.app">support@mopiq.app</a>. DMCA notices should also be sent to the same address. We may provide notices to you via email, in-product messages, or by posting to the Service. You may opt out of promotional emails via the unsubscribe link in those emails; you will continue to receive operational and transactional messages.</p>
    <p><strong>14.3 Export Controls.</strong> You may not use or access the Service in violation of U.S. export control or sanctions laws.</p>
    <p><strong>14.4 Assignment.</strong> You may not assign these Terms without our prior written consent. We may freely assign these Terms without notice.</p>
    <p><strong>14.5 Governing Law; Venue.</strong> These Terms are governed by the laws of the State of Delaware, excluding its conflict-of-laws rules, and applicable U.S. federal law. Except for small claims and equitable relief as permitted in Section 12.3, the state and federal courts located in New Castle County, Delaware shall have exclusive jurisdiction for any court proceedings, and you consent to personal jurisdiction there.</p>
    <p><strong>14.6 Severability; Waiver.</strong> If any provision of these Terms is found unenforceable, that provision will be enforced to the maximum extent permissible and the remaining provisions will remain in full force. Our failure to enforce any right is not a waiver.</p>
    <p><strong>14.7 Force Majeure.</strong> We are not liable for delays or failures due to events beyond our reasonable control.</p>
    <p><strong>14.8 Entire Agreement.</strong> These Terms constitute the entire agreement between you and NuNotes regarding the Service and supersede prior or contemporaneous agreements on the subject.</p>
    <p><strong>14.9 No Third-Party Beneficiaries.</strong> There are no third-party beneficiaries to these Terms.</p>

    <h2>Contact</h2>
    <p>NuNotes<br><a href="mailto:support@mopiq.app">support@mopiq.app</a></p>
  </div>
</main>

<footer class="footer">
  <div class="container footer-inner">
    <a href="index.html" class="footer-brand">
      <img src="images/logo.png" alt="" width="24" height="24" class="footer-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="footer-links">
      <a href="support.html" class="footer-link">Support</a>
      <a href="privacy.html" class="footer-link">Privacy</a>
      <a href="terms.html" class="footer-link">Terms</a>
      <a href="mailto:support@mopiq.app" class="footer-link">Contact</a>
    </div>
    <div class="footer-copy">© 2026 NuNotes</div>
  </div>
</footer>

</body>
</html>
`;
const SUPPORT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Support — NuNotes</title>
<meta name="description" content="Get help with NuNotes subscriptions, billing, and refunds.">
<link rel="icon" href="images/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="images/apple-touch-icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="index.html" class="nav-logo">
      <img src="images/logo.png" alt="" width="32" height="32" class="nav-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="nav-links">
      <a href="support.html" class="nav-link nav-link-hide">Support</a>
      <a href="index.html#download" class="btn btn-primary">Download</a>
    </div>
  </div>
</nav>

<main class="legal">
  <div class="container-narrow">
    <h1>Help &amp; Support</h1>
    <p class="updated">Billing, subscriptions, and refunds</p>

    <div class="support-contact">
      <p>Can't find what you're looking for? Email us at <a href="mailto:support@mopiq.app">support@mopiq.app</a> and we'll get back to you as soon as we can.</p>
    </div>

    <h2>How to cancel my subscription</h2>
    <p>NuNotes subscriptions are purchased and managed through the Apple App Store. We don't process cancellations directly — you'll need to cancel through Apple on your device.</p>

    <h3>On iPhone or iPad</h3>
    <ol>
      <li>Open the <strong>Settings</strong> app.</li>
      <li>Tap your name at the top.</li>
      <li>Tap <strong>Subscriptions</strong>.</li>
      <li>Select <strong>NuNotes</strong>.</li>
      <li>Tap <strong>Cancel Subscription</strong>. You may need to scroll down to find it. If there is no Cancel button, the subscription is already canceled.</li>
    </ol>

    <p>Cancellation takes effect at the end of your current billing period. You'll keep access until then.</p>

    <p>For full instructions — including Mac, web, and other devices — see Apple's guide: <a href="https://support.apple.com/en-us/118428?device-type=mac" target="_blank" rel="noopener noreferrer">Cancel a subscription from Apple</a>.</p>

    <h2>How to get a refund</h2>
    <p>Refund requests for App Store purchases are handled by Apple, not by NuNotes directly. Apple decides whether a purchase is eligible for a refund.</p>

    <h3>Request a refund from Apple</h3>
    <ol>
      <li>Go to <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer">reportaproblem.apple.com</a> and sign in with the Apple Account you used to purchase NuNotes.</li>
      <li>Tap or click <strong>I'd like to</strong>, then choose <strong>Request a refund</strong>.</li>
      <li>Select the reason, tap <strong>Next</strong>, choose NuNotes (or your subscription), then tap <strong>Submit</strong>.</li>
    </ol>

    <p>Apple typically responds within 24–48 hours. If approved, it may take additional time for the refund to appear on your payment method.</p>

    <p>Step-by-step details: <a href="https://support.apple.com/en-us/118223" target="_blank" rel="noopener noreferrer">Request a refund for apps or content from Apple</a>.</p>

    <p>If you run into trouble with Apple's refund process, contact us at <a href="mailto:support@mopiq.app">support@mopiq.app</a> and we'll do our best to help.</p>
  </div>
</main>

<footer class="footer">
  <div class="container footer-inner">
    <a href="index.html" class="footer-brand">
      <img src="images/logo.png" alt="" width="24" height="24" class="footer-logo-icon">
      <span>NuNotes</span>
    </a>
    <div class="footer-links">
      <a href="support.html" class="footer-link">Support</a>
      <a href="privacy.html" class="footer-link">Privacy</a>
      <a href="terms.html" class="footer-link">Terms</a>
      <a href="mailto:support@mopiq.app" class="footer-link">Contact</a>
    </div>
    <div class="footer-copy">© 2026 NuNotes</div>
  </div>
</footer>

</body>
</html>
`;
const STYLES_CSS = `:root {
  --bg: #ffffff;
  --bg-alt: #f1f5f9;
  --title: #1e293b;
  --text: #475569;
  --text-muted: #94a3b8;
  --accent: #10b981;
  --accent-hover: #059669;
  --border: #e2e8f0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

.container-narrow {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 24px;
}

h1 {
  font-size: 32px;
  font-weight: 700;
  color: var(--title);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--title);
  line-height: 1.3;
  letter-spacing: -0.01em;
}

h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--title);
  line-height: 1.4;
}

p {
  color: var(--text);
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  color: var(--accent-hover);
}

/* Navigation */
.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border);
}

.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.nav-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  letter-spacing: -0.01em;
  text-decoration: none;
}

.nav-logo:hover {
  color: var(--title);
}

.nav-logo-icon {
  border-radius: 8px;
  flex-shrink: 0;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 28px;
}

.nav-link {
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
}

.nav-link:hover {
  color: var(--title);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border: none;
  transition: background-color 0.15s ease, transform 0.15s ease;
  text-decoration: none;
}

.btn-primary {
  background: var(--accent);
  color: #ffffff;
}

.btn-primary:hover {
  background: var(--accent-hover);
  color: #ffffff;
}

.btn-secondary {
  background: transparent;
  color: var(--accent);
  padding: 12px 20px;
}

.btn-secondary:hover {
  color: var(--accent-hover);
  background: var(--bg-alt);
}

.btn-lg {
  padding: 14px 24px;
  font-size: 16px;
  border-radius: 12px;
}

/* Hero */
.hero {
  padding: 96px 0 64px;
  text-align: center;
  background: linear-gradient(180deg, #ecfdf5 0%, var(--bg) 70%);
}

.hero h1 {
  font-size: 56px;
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin-bottom: 20px;
}

.hero .subtitle {
  font-size: 19px;
  color: var(--text);
  max-width: 620px;
  margin: 0 auto 36px;
}

.hero-cta {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-note {
  display: block;
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-muted);
}

/* Hero mockup */
.hero-mockup {
  margin: 48px auto 0;
  max-width: 280px;
}

.hero-mockup img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 28px;
  box-shadow:
    0 4px 6px rgba(15, 23, 42, 0.04),
    0 24px 48px rgba(15, 23, 42, 0.12);
  border: 1px solid var(--border);
}

/* Feature bands */
.feature-band {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
  margin-bottom: 80px;
}

.feature-band:last-child {
  margin-bottom: 0;
}

.feature-band-reverse .feature-band-media {
  order: 2;
}

.feature-band-reverse .feature-band-copy {
  order: 1;
}

.feature-band-media {
  display: flex;
  justify-content: center;
}

.feature-band-media img {
  width: 100%;
  max-width: 260px;
  height: auto;
  border-radius: 28px;
  box-shadow:
    0 4px 6px rgba(15, 23, 42, 0.04),
    0 20px 40px rgba(15, 23, 42, 0.1);
  border: 1px solid var(--border);
}

.feature-band-copy h2 {
  font-size: 32px;
  margin-bottom: 16px;
  letter-spacing: -0.02em;
}

.feature-band-copy p {
  font-size: 17px;
  line-height: 1.65;
}

/* ASO screenshot gallery */
.screenshot-gallery-section .section-header {
  margin-bottom: 32px;
}

.screenshot-gallery {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  padding: 8px 4px 24px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.screenshot-gallery img {
  flex: 0 0 auto;
  height: 420px;
  width: auto;
  border-radius: 16px;
  scroll-snap-align: start;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

/* Sections */
.section {
  padding: 80px 0;
}

.section-alt {
  background: var(--bg-alt);
}

.section-header {
  text-align: center;
  margin-bottom: 48px;
}

.section-header h2 {
  font-size: 36px;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.section-header p {
  font-size: 17px;
  color: var(--text);
  max-width: 560px;
  margin: 0 auto;
}

/* Steps */
.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.step {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 28px;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 16px;
}

.step h3 {
  margin-bottom: 8px;
}

/* Features */
.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.feature {
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg);
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.1);
  color: var(--accent);
  margin-bottom: 16px;
}

.feature-icon svg {
  width: 22px;
  height: 22px;
}

.feature h3 {
  margin-bottom: 6px;
}

.feature p {
  font-size: 15px;
}

/* Testimonials */
.testimonials {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.testimonial {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 28px;
}

.testimonial-quote {
  font-size: 16px;
  color: var(--title);
  margin-bottom: 16px;
  line-height: 1.6;
}

.testimonial-author {
  font-size: 13px;
  color: var(--text-muted);
}

/* FAQ */
.faq {
  max-width: 760px;
  margin: 0 auto;
}

.faq-item {
  border-bottom: 1px solid var(--border);
}

.faq-item:first-child {
  border-top: 1px solid var(--border);
}

.faq-question {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22px 0;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  color: var(--title);
  cursor: pointer;
  text-align: left;
}

.faq-question:hover {
  color: var(--accent);
}

.faq-toggle {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-left: 16px;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.faq-item[open] .faq-toggle {
  transform: rotate(45deg);
}

.faq-answer {
  padding-bottom: 22px;
  color: var(--text);
  font-size: 16px;
  line-height: 1.65;
}

/* Final CTA */
.final-cta {
  text-align: center;
  padding: 96px 24px;
  background: var(--bg-alt);
  border-radius: 24px;
  margin: 64px auto;
  max-width: 1060px;
}

.final-cta h2 {
  font-size: 40px;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.final-cta p {
  font-size: 17px;
  max-width: 480px;
  margin: 0 auto 28px;
}

/* Footer */
.footer {
  border-top: 1px solid var(--border);
  padding: 48px 0 40px;
  background: var(--bg);
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.footer-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--title);
  text-decoration: none;
}

.footer-brand:hover {
  color: var(--title);
}

.footer-logo-icon {
  border-radius: 6px;
  flex-shrink: 0;
}

.footer-links {
  display: flex;
  gap: 24px;
}

.footer-link {
  font-size: 14px;
  color: var(--text);
}

.footer-link:hover {
  color: var(--title);
}

.footer-copy {
  font-size: 13px;
  color: var(--text-muted);
}

.support-contact {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 40px;
}

.support-contact p {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.support-contact a {
  font-weight: 600;
}

/* Legal pages */
.legal {
  padding: 64px 0 96px;
}

.legal h1 {
  font-size: 40px;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.legal .updated {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 40px;
}

.legal h2 {
  font-size: 22px;
  margin: 40px 0 14px;
}

.legal h3 {
  font-size: 17px;
  margin: 24px 0 10px;
}

.legal p,
.legal li {
  font-size: 16px;
  color: var(--text);
  margin-bottom: 14px;
  line-height: 1.7;
}

.legal ul,
.legal ol {
  padding-left: 24px;
  margin-bottom: 14px;
}

.legal li {
  margin-bottom: 8px;
}

.legal strong {
  color: var(--title);
  font-weight: 600;
}

.legal .toc {
  background: var(--bg-alt);
  border-radius: 12px;
  padding: 24px 24px 24px 44px;
  margin: 24px 0 40px;
}

.legal .toc li {
  margin-bottom: 4px;
  font-size: 15px;
}

/* Shared note view */
.share {
  padding: 40px 0 80px;
}
.share-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 14px;
  margin-bottom: 32px;
}
.share-cta-text {
  font-size: 14px;
  color: var(--text);
}
.share-cta-text strong {
  color: var(--title);
  font-weight: 600;
}
.share-header {
  margin-bottom: 32px;
}
.share-icon {
  font-size: 44px;
  line-height: 1;
  margin-bottom: 16px;
}
.share-title {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--title);
  margin-bottom: 8px;
  line-height: 1.15;
}
.share-meta {
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
.share-body {
  font-size: 16px;
  line-height: 1.7;
  color: var(--text);
}
.share-body h1,
.share-body h2,
.share-body h3,
.share-body h4 {
  color: var(--title);
  margin: 32px 0 12px;
  line-height: 1.3;
  letter-spacing: -0.01em;
}
.share-body h1 { font-size: 28px; }
.share-body h2 { font-size: 22px; }
.share-body h3 { font-size: 18px; }
.share-body h4 { font-size: 16px; }
.share-body p { margin-bottom: 16px; }
.share-body ul,
.share-body ol {
  padding-left: 24px;
  margin-bottom: 16px;
}
.share-body li { margin-bottom: 6px; }
.share-body strong { color: var(--title); font-weight: 600; }
.share-body em { font-style: italic; }
.share-body a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.share-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  background: var(--bg-alt);
  padding: 2px 6px;
  border-radius: 4px;
}
.share-body pre {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  overflow-x: auto;
  margin-bottom: 16px;
}
.share-body pre code {
  background: transparent;
  padding: 0;
  font-size: 13px;
  line-height: 1.55;
}
.share-body blockquote {
  border-left: 3px solid var(--accent);
  padding: 4px 0 4px 16px;
  margin: 16px 0;
  color: var(--text);
  font-style: italic;
}
.share-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 14px;
}
.share-body th,
.share-body td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}
.share-body th {
  background: var(--bg-alt);
  color: var(--title);
  font-weight: 600;
}
.share-footer {
  margin-top: 56px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.share-footer-note {
  font-size: 13px;
  color: var(--text-muted);
}
.share-report-link {
  font-size: 13px;
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.share-report-link:hover {
  color: var(--title);
}
.share-error {
  text-align: center;
  padding: 80px 20px;
}
.share-error h1 {
  font-size: 26px;
  margin-bottom: 8px;
}
.share-error p {
  color: var(--text);
  margin-bottom: 24px;
}

/* Report form */
.report {
  padding: 64px 0 96px;
}
.report h1 {
  font-size: 32px;
  margin-bottom: 8px;
}
.report .lede {
  color: var(--text);
  font-size: 16px;
  margin-bottom: 32px;
}
.report-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.report-field-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--title);
  margin-bottom: 10px;
}
.report-field-help {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}
.report-radio-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.report-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  color: var(--title);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.report-radio:hover {
  border-color: var(--accent);
}
.report-radio input {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border);
  margin: 0;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}
.report-radio input:checked {
  border-color: var(--accent);
  background: radial-gradient(circle, var(--accent) 0 4px, transparent 5px);
}
.report-radio input:checked + span {
  font-weight: 600;
}
.report-input,
.report-textarea {
  width: 100%;
  padding: 12px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-family: inherit;
  font-size: 14px;
  color: var(--title);
  outline: none;
  transition: border-color 0.15s ease;
}
.report-input:focus,
.report-textarea:focus {
  border-color: var(--accent);
}
.report-textarea {
  min-height: 120px;
  resize: vertical;
  line-height: 1.5;
}
.report-submit {
  align-self: flex-start;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
}
.report-submit[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
.report-success,
.report-error-msg {
  padding: 16px 18px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}
.report-success {
  background: rgba(16, 185, 129, 0.10);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.report-error-msg {
  background: rgba(220, 38, 38, 0.08);
  color: #B91C1C;
  border: 1px solid rgba(220, 38, 38, 0.3);
}
.hidden { display: none !important; }

/* Responsive */
@media (max-width: 820px) {
  .hero {
    padding: 64px 0 40px;
  }
  .hero h1 {
    font-size: 40px;
  }
  .hero .subtitle {
    font-size: 17px;
  }
  .section {
    padding: 56px 0;
  }
  .section-header h2 {
    font-size: 28px;
  }
  .steps,
  .features,
  .testimonials {
    grid-template-columns: 1fr;
  }
  .feature-band,
  .feature-band-reverse {
    grid-template-columns: 1fr;
    gap: 32px;
    margin-bottom: 56px;
  }

  .feature-band-reverse .feature-band-media,
  .feature-band-reverse .feature-band-copy {
    order: unset;
  }

  .feature-band-copy h2 {
    font-size: 26px;
  }

  .screenshot-gallery img {
    height: 360px;
  }
  .final-cta {
    padding: 64px 20px;
    margin: 32px 16px;
  }
  .final-cta h2 {
    font-size: 30px;
  }
  .nav-links .nav-link-hide {
    display: none;
  }
  .legal h1 {
    font-size: 30px;
  }
  .share-title {
    font-size: 28px;
  }
  .share-cta {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }
  .report-radio-group {
    grid-template-columns: 1fr;
  }
}
`;

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

const CSS_HEADERS = {
  "Content-Type": "text/css; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "X-Content-Type-Options": "nosniff",
};

function normalizePath(pathname: string): string {
  const match = pathname.match(/\/site(\/.*)?$/);
  let sub = match ? (match[1] ?? "") : pathname;
  if (sub.length > 1 && sub.endsWith("/")) sub = sub.slice(0, -1);
  return sub;
}

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  const sub = normalizePath(url.pathname);

  switch (sub) {
    case "":
    case "/":
    case "/index":
    case "/index.html":
      return new Response(INDEX_HTML, { headers: HTML_HEADERS });
    case "/privacy":
    case "/privacy.html":
      return new Response(PRIVACY_HTML, { headers: HTML_HEADERS });
    case "/terms":
    case "/terms.html":
      return new Response(TERMS_HTML, { headers: HTML_HEADERS });
    case "/support":
    case "/support.html":
      return new Response(SUPPORT_HTML, { headers: HTML_HEADERS });
    case "/styles.css":
      return new Response(STYLES_CSS, { headers: CSS_HEADERS });
    default:
      return new Response("Not found", { status: 404 });
  }
});
