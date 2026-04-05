import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout, SUPPORT_EMAIL, legalText } from '../LegalLayout';

const hr = {
  border: 'none',
  borderTop: '1px solid #e8ecf1',
  margin: '1.5rem 0',
} as const;

const list: CSSProperties = {
  margin: '0 0 1rem',
  paddingLeft: '1.25rem',
  fontSize: 'clamp(0.95rem, 2.5vw, 1.05rem)',
  color: '#333',
  lineHeight: 1.55,
};

const listItem: CSSProperties = {
  marginBottom: '0.35rem',
};

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service – HalfOrder">
      <p style={{ ...legalText.p, marginBottom: '0.5rem' }}>
        <strong>Last Updated:</strong> April 2026
      </p>
      <p style={legalText.p}>
        Welcome to HalfOrder. By using our platform, you agree to the following
        Terms of Service. Please read them carefully.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>1. Overview of Service</h2>
      <p style={legalText.p}>
        HalfOrder is a platform that connects users who want to share food
        orders. The app facilitates coordination between users but does not
        sell, prepare, or deliver food.
      </p>
      <p style={legalText.p}>
        HalfOrder is not a restaurant, delivery service, or payment processor.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>2. User Responsibilities</h2>
      <p style={legalText.p}>By using HalfOrder, you agree that:</p>
      <ul style={list}>
        <li style={listItem}>You are at least 18 years old.</li>
        <li style={listItem}>You provide accurate and truthful information.</li>
        <li style={listItem}>
          You are solely responsible for your interactions with other users.
        </li>
        <li style={listItem}>
          You agree to behave respectfully and not engage in fraud, harassment,
          or illegal activities.
        </li>
      </ul>
      <p style={legalText.p}>HalfOrder is not responsible for user behavior.</p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>3. Payments Disclaimer</h2>
      <p style={legalText.p}>
        All payments are handled directly between users{' '}
        <strong>outside of the app</strong>.
      </p>
      <p style={legalText.p}>HalfOrder:</p>
      <ul style={list}>
        <li style={listItem}>Does NOT process payments</li>
        <li style={listItem}>Does NOT hold money</li>
        <li style={listItem}>Does NOT guarantee transactions</li>
      </ul>
      <p style={legalText.p}>
        You agree that any financial interaction is entirely at your own risk.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>4. Food &amp; Safety Disclaimer</h2>
      <p style={legalText.p}>HalfOrder does not verify:</p>
      <ul style={list}>
        <li style={listItem}>Food quality</li>
        <li style={listItem}>Food safety</li>
        <li style={listItem}>Restaurant standards</li>
      </ul>
      <p style={legalText.p}>Users are responsible for:</p>
      <ul style={list}>
        <li style={listItem}>Choosing where to order from</li>
        <li style={listItem}>Ensuring food meets their dietary needs</li>
      </ul>
      <p style={legalText.p}>
        HalfOrder is not liable for any health issues, allergies, or damages.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>5. User-Generated Content</h2>
      <p style={legalText.p}>Users may create content such as:</p>
      <ul style={list}>
        <li style={listItem}>Food orders</li>
        <li style={listItem}>Messages</li>
        <li style={listItem}>Photos</li>
      </ul>
      <p style={legalText.p}>By posting content, you agree that:</p>
      <ul style={list}>
        <li style={listItem}>You own or have rights to the content</li>
        <li style={listItem}>Content does not violate any laws</li>
        <li style={listItem}>
          Content is not abusive, misleading, or harmful
        </li>
      </ul>
      <p style={legalText.p}>
        HalfOrder reserves the right to remove any content at any time.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>6. Account Suspension</h2>
      <p style={legalText.p}>We may suspend or terminate accounts if users:</p>
      <ul style={list}>
        <li style={listItem}>Violate these terms</li>
        <li style={listItem}>Engage in suspicious or harmful behavior</li>
        <li style={listItem}>Abuse the platform</li>
      </ul>
      <p style={legalText.p}>
        No prior notice is required in serious cases.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>7. Limitation of Liability</h2>
      <p style={legalText.p}>HalfOrder is provided &quot;as is&quot;.</p>
      <p style={legalText.p}>We are NOT responsible for:</p>
      <ul style={list}>
        <li style={listItem}>Failed meetups between users</li>
        <li style={listItem}>Payment disputes</li>
        <li style={listItem}>Food quality issues</li>
        <li style={listItem}>User misconduct</li>
      </ul>
      <p style={legalText.p}>
        To the fullest extent permitted by law, HalfOrder disclaims all
        liability.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>8. Privacy</h2>
      <p style={legalText.p}>
        Your use of the app is also governed by our{' '}
        <Link to="/privacy" style={{ color: '#007aff', fontWeight: 600 }}>
          Privacy Policy
        </Link>
        .
      </p>
      <p style={legalText.p}>
        We only collect necessary data to operate the platform and improve user
        experience.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>9. Changes to Terms</h2>
      <p style={legalText.p}>We may update these Terms at any time.</p>
      <p style={legalText.p}>
        Users will be notified of major changes. Continued use of the app means
        you accept the updated terms.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>10. Contact</h2>
      <p style={legalText.p}>
        For any questions or concerns:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007aff', fontWeight: 600 }}>
          {SUPPORT_EMAIL}
        </a>
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>11. Governing Law</h2>
      <p style={legalText.p}>
        These Terms are governed by the laws of Canada.
      </p>

      <hr style={hr} />

      <p style={legalText.footerNote}>
        By using HalfOrder, you acknowledge that you understand and agree to
        these Terms.
      </p>
    </LegalLayout>
  );
}
