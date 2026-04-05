import type { CSSProperties } from 'react';
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

const subheading: CSSProperties = {
  margin: '1rem 0 0.45rem',
  fontSize: 'clamp(1rem, 2.5vw, 1.08rem)',
  fontWeight: 600,
  color: '#0d1726',
};

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy – HalfOrder">
      <p style={{ ...legalText.p, marginBottom: '0.5rem' }}>
        <strong>Last Updated:</strong> April 2026
      </p>
      <p style={legalText.p}>
        HalfOrder (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy and is
        committed to protecting your personal data. This Privacy Policy explains
        how we collect, use, and protect your information.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>1. Information We Collect</h2>
      <p style={legalText.p}>We may collect the following types of information:</p>

      <h3 style={subheading}>a. Personal Information</h3>
      <ul style={list}>
        <li style={listItem}>Name</li>
        <li style={listItem}>Email address</li>
        <li style={listItem}>Profile photo (if uploaded)</li>
      </ul>

      <h3 style={subheading}>b. Usage Data</h3>
      <ul style={list}>
        <li style={listItem}>App activity (creating/joining orders)</li>
        <li style={listItem}>Messages between users</li>
        <li style={listItem}>Device information (device type, OS)</li>
      </ul>

      <h3 style={subheading}>c. Location Data</h3>
      <p style={legalText.p}>
        We may collect approximate location to help match users nearby.
      </p>
      <p style={legalText.p}>
        We do NOT track precise real-time GPS location in the background.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>2. How We Use Your Information</h2>
      <p style={legalText.p}>We use your data to:</p>
      <ul style={list}>
        <li style={listItem}>Provide and operate the app</li>
        <li style={listItem}>Match users with nearby orders</li>
        <li style={listItem}>Enable messaging between users</li>
        <li style={listItem}>Improve app performance and experience</li>
        <li style={listItem}>Detect fraud or misuse</li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>3. Photos &amp; Media</h2>
      <p style={legalText.p}>If you upload images (e.g., food photos):</p>
      <ul style={list}>
        <li style={listItem}>We only access photos you choose to upload</li>
        <li style={listItem}>We do NOT access your full photo library</li>
        <li style={listItem}>Images are stored securely</li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>4. Messaging &amp; Content</h2>
      <p style={legalText.p}>Messages between users are stored to:</p>
      <ul style={list}>
        <li style={listItem}>Enable communication</li>
        <li style={listItem}>Prevent abuse or harmful behavior</li>
      </ul>
      <p style={legalText.p}>
        We do NOT sell or share your messages with third parties.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>5. Data Sharing</h2>
      <p style={legalText.p}>We do NOT sell your personal data.</p>
      <p style={legalText.p}>We may share data only in these cases:</p>
      <ul style={list}>
        <li style={listItem}>
          With service providers (e.g., Firebase) to run the app
        </li>
        <li style={listItem}>If required by law</li>
        <li style={listItem}>To protect users or prevent fraud</li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>6. Payments</h2>
      <p style={legalText.p}>HalfOrder does NOT process payments.</p>
      <p style={legalText.p}>
        Any payments happen outside the app directly between users.
      </p>
      <p style={legalText.p}>We do NOT store any financial information.</p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>7. Data Security</h2>
      <p style={legalText.p}>
        We use industry-standard security measures to protect your data.
      </p>
      <p style={legalText.p}>However, no system is 100% secure.</p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>8. Your Rights</h2>
      <p style={legalText.p}>You have the right to:</p>
      <ul style={list}>
        <li style={listItem}>Access your data</li>
        <li style={listItem}>Request deletion of your account and data</li>
        <li style={listItem}>Update your information</li>
      </ul>
      <p style={legalText.p}>
        To request this, contact us at:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007aff', fontWeight: 600 }}>
          {SUPPORT_EMAIL}
        </a>
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>9. Data Retention</h2>
      <p style={legalText.p}>
        We keep your data only as long as necessary to provide the service.
      </p>
      <p style={legalText.p}>
        We may retain some data for legal or safety purposes.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>10. Children&apos;s Privacy</h2>
      <p style={legalText.p}>HalfOrder is not intended for users under 18.</p>
      <p style={legalText.p}>We do not knowingly collect data from children.</p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>11. Changes to This Policy</h2>
      <p style={legalText.p}>We may update this Privacy Policy.</p>
      <p style={legalText.p}>We will notify users of major changes.</p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>12. Contact</h2>
      <p style={legalText.p}>
        For any questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007aff', fontWeight: 600 }}>
          {SUPPORT_EMAIL}
        </a>
      </p>

      <hr style={hr} />

      <p style={legalText.footerNote}>
        By using HalfOrder, you agree to this Privacy Policy.
      </p>
    </LegalLayout>
  );
}
